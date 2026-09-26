import { AIServiceError } from "./errors.js";
import { MODEL_TURN_JSON_SCHEMA, modelTurnSchema, type ModelTurn } from "./schema.js";

export type ModelRunResult = { kind: "ok"; output: ModelTurn } | { kind: "refused" };

export interface TextBlock {
  type: "text";
  text: string;
}

/** One message to the model. Content is a string or a list of text blocks. */
export interface ModelMessage {
  role: "user" | "assistant";
  content: string | TextBlock[];
}

export interface ModelInput {
  system: string;
  messages: ModelMessage[];
}

/** LLM behind the assistant. Swappable for a stub in tests/offline demos. */
export interface ExtractionModel {
  run(input: ModelInput): Promise<ModelRunResult>;
}

export type JsonResult = { kind: "ok"; json: unknown } | { kind: "refused" };

/**
 * One provider call: prompt in, parsed JSON out.
 * Rules: refusal → { kind: "refused" }; cut off / invalid JSON → AIServiceError (retried once);
 * network, auth, credits → throw as-is (backend fallback answers that message).
 */
export interface JsonClient {
  request(input: ModelInput & { schema: Record<string, unknown>; schemaName: string }): Promise<JsonResult>;
}

/** Invalid JSON → AIServiceError so the one-retry logic applies. */
export function parseJson(text: string): JsonResult {
  try {
    return { kind: "ok", json: JSON.parse(text) };
  } catch (cause) {
    throw new AIServiceError("Model returned invalid JSON", { cause });
  }
}

/** Any JsonClient → ExtractionModel. Output checked with zod. */
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
