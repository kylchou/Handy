import OpenAI from "openai";
import { JsonDraftModel } from "./draft.js";
import { AIServiceError } from "./errors.js";
import { JsonExtractionModel, parseJson, type JsonClient, type JsonResult, type ModelInput } from "./model.js";

/** Meta Model API (Muse Spark). OpenAI-compatible Chat Completions, so the openai SDK works with a baseURL. */
export const MUSE_BASE_URL = "https://api.meta.ai/v1";
export const DEFAULT_MUSE_MODEL = "muse-spark-1.3";

export interface MuseModelOptions {
  /** Injected in tests. Default: openai SDK pointed at MUSE_BASE_URL. */
  client?: OpenAI;
  /** Default MODEL_API_KEY. */
  apiKey?: string;
  model?: string;
}

/** 400 that mentions the schema → strict mode rejected it. */
function isSchemaRejection(err: unknown): boolean {
  const e = err as { status?: number; message?: string };
  return e?.status === 400 && /schema|response_format|strict/i.test(e.message ?? "");
}

/** Our content-block arrays → plain strings (Chat Completions wants strings). */
function flatten(content: ModelInput["messages"][number]["content"]): string {
  if (typeof content === "string") return content;
  return content
    .map((block) => (block.type === "text" ? block.text : ""))
    .filter(Boolean)
    .join("\n\n");
}

export class MuseJsonClient implements JsonClient {
  private client?: OpenAI;
  /** Starts strict. Flips to false for good if Meta rejects the schema; zod still checks every reply. */
  private strict = true;

  constructor(private readonly options: MuseModelOptions = {}) {
    this.client = options.client;
  }

  async request(input: ModelInput & { schema: Record<string, unknown>; schemaName: string }): Promise<JsonResult> {
    // Lazy client: importing the package never needs a key.
    const client = (this.client ??= new OpenAI({ apiKey: this.options.apiKey ?? process.env.MODEL_API_KEY, baseURL: MUSE_BASE_URL }));

    const body = (strict: boolean) => ({
      model: this.options.model ?? DEFAULT_MUSE_MODEL,
      messages: [
        { role: "system" as const, content: input.system },
        ...input.messages.map((m) => ({ role: m.role, content: flatten(m.content) })),
      ],
      response_format: {
        type: "json_schema" as const,
        json_schema: { name: input.schemaName, schema: input.schema, strict },
      },
    });

    let completion: OpenAI.Chat.Completions.ChatCompletion;
    try {
      completion = await client.chat.completions.create(body(this.strict));
    } catch (err) {
      // Network, auth, credits → throw as-is. Only a schema rejection gets a non-strict retry.
      if (!this.strict || !isSchemaRejection(err)) throw err;
      this.strict = false;
      completion = await client.chat.completions.create(body(false));
    }

    const choice = completion.choices[0];
    if (!choice) throw new AIServiceError("Model returned no choices");
    if (choice.message.refusal) return { kind: "refused" };
    if (choice.finish_reason === "length") {
      throw new AIServiceError("Model output was cut off before the reply was complete");
    }
    return parseJson(choice.message.content ?? "");
  }
}

export class MuseExtractionModel extends JsonExtractionModel {
  constructor(options: MuseModelOptions = {}) {
    super(new MuseJsonClient(options));
  }
}

export class MuseDraftModel extends JsonDraftModel {
  constructor(options: MuseModelOptions = {}) {
    super(new MuseJsonClient(options));
  }
}
