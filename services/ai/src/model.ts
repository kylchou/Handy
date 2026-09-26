import Anthropic from "@anthropic-ai/sdk";
import { AIServiceError } from "./errors.js";
import { MODEL_TURN_JSON_SCHEMA, modelTurnSchema, type ModelTurn } from "./schema.js";

export type ModelRunResult = { kind: "ok"; output: ModelTurn } | { kind: "refused" };

export interface ModelInput {
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
}

/** LLM behind the assistant. Swappable for a stub in tests/offline demos. */
export interface ExtractionModel {
  run(input: ModelInput): Promise<ModelRunResult>;
}

export type JsonResult = { kind: "ok"; json: unknown } | { kind: "refused" };

/**
 * One provider call: prompt in, parsed JSON out. Claude and Muse both implement this.
 * Rules for every client: refusal → { kind: "refused" }; cut off / invalid JSON → AIServiceError (retried once);
 * network, auth, credits → throw as-is (backend fallback answers that message).
 */
export interface JsonClient {
  request(input: ModelInput & { schema: Record<string, unknown>; schemaName: string }): Promise<JsonResult>;
}

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ClaudeModelOptions {
  client?: Anthropic;
  model?: string;
  effort?: Effort;
}

export const DEFAULT_MODEL = "claude-opus-5";
export const DEFAULT_EFFORT: Effort = "medium";

export class ClaudeJsonClient implements JsonClient {
  private client?: Anthropic;

  constructor(private readonly options: ClaudeModelOptions = {}) {
    this.client = options.client;
  }

  async request(input: ModelInput & { schema: Record<string, unknown> }): Promise<JsonResult> {
    // Lazy client: importing the package never needs a key.
    const client = (this.client ??= new Anthropic());

    const response = await client.beta.messages.create({
      model: this.options.model ?? DEFAULT_MODEL,
      max_tokens: 16000,
      // Claude declines → server-side retry on fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: input.system,
      messages: input.messages,
      output_config: {
        effort: this.options.effort ?? DEFAULT_EFFORT,
        format: { type: "json_schema", schema: input.schema },
      },
    });

    if (response.stop_reason === "refusal") return { kind: "refused" };
    if (response.stop_reason === "max_tokens") {
      throw new AIServiceError("Model output was cut off before the reply was complete");
    }

    const text = response.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    return parseJson(text);
  }
}

/** Shared by every client. Invalid JSON → AIServiceError so the one-retry logic applies. */
export function parseJson(text: string): JsonResult {
  try {
    return { kind: "ok", json: JSON.parse(text) };
  } catch (cause) {
    throw new AIServiceError("Model returned invalid JSON", { cause });
  }
}

/** Any JsonClient → ExtractionModel. Output checked with zod, whatever the provider. */
export class JsonExtractionModel implements ExtractionModel {
  constructor(private readonly client: JsonClient) {}

  async run(input: ModelInput): Promise<ModelRunResult> {
    const result = await this.client.request({ ...input, schema: MODEL_TURN_JSON_SCHEMA, schemaName: "service_request_turn" });
    if (result.kind === "refused") return result;

    const parsed = modelTurnSchema.safeParse(result.json);
    if (!parsed.success) {
      throw new AIServiceError(`Model output failed validation: ${parsed.error.message}`);
    }
    return { kind: "ok", output: parsed.data };
  }
}

export class ClaudeExtractionModel extends JsonExtractionModel {
  constructor(options: ClaudeModelOptions = {}) {
    super(new ClaudeJsonClient(options));
  }
}
