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

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ClaudeModelOptions {
  client?: Anthropic;
  model?: string;
  effort?: Effort;
}

export const DEFAULT_MODEL = "claude-opus-5";
export const DEFAULT_EFFORT: Effort = "medium";

/** Shared Claude call: structured JSON out, refusal-aware. Used by every Claude-backed model. */
export class ClaudeJsonClient {
  private client?: Anthropic;

  constructor(private readonly options: ClaudeModelOptions = {}) {
    this.client = options.client;
  }

  async request(input: ModelInput & { schema: Record<string, unknown> }): Promise<{ kind: "ok"; json: unknown } | { kind: "refused" }> {
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

    try {
      return { kind: "ok", json: JSON.parse(text) };
    } catch (cause) {
      throw new AIServiceError("Model returned invalid JSON", { cause });
    }
  }
}

export class ClaudeExtractionModel implements ExtractionModel {
  private readonly claude: ClaudeJsonClient;

  constructor(options: ClaudeModelOptions = {}) {
    this.claude = new ClaudeJsonClient(options);
  }

  async run(input: ModelInput): Promise<ModelRunResult> {
    const result = await this.claude.request({ ...input, schema: MODEL_TURN_JSON_SCHEMA });
    if (result.kind === "refused") return result;

    const parsed = modelTurnSchema.safeParse(result.json);
    if (!parsed.success) {
      throw new AIServiceError(`Model output failed validation: ${parsed.error.message}`);
    }
    return { kind: "ok", output: parsed.data };
  }
}
