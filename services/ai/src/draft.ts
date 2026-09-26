import { z } from "zod";
import { AIServiceError } from "./errors.js";
import type { JsonClient, ModelInput } from "./model.js";
import { MuseJsonClient, type MuseModelOptions } from "./muse.js";
import { classifySafety } from "./safety.js";
import type { ChatTurn, EmergencyGuidance } from "./types.js";

/** Job facts the drafter may use. Nothing else gets added to a draft. */
export interface JobContext {
  workerFirstName: string;
  customerFirstName?: string;
  /** e.g. "Move a couch from the garage to the living room" */
  serviceDescription: string;
  /** YYYY-MM-DD */
  scheduledDate?: string;
  /** HH:MM, 24-hour */
  scheduledStartTime?: string;
  /** Latest job chat, oldest first. A few recent messages is enough. */
  recentMessages?: Array<{ from: "customer" | "worker"; content: string }>;
}

export type DraftResult =
  /** Show to customer for approval. Never auto-send. */
  | { kind: "draft"; message: string }
  /** Instruction missing a needed fact → ask customer, then call again with history. */
  | { kind: "clarify"; question: string }
  | { kind: "emergency"; message: string; emergency: EmergencyGuidance }
  | { kind: "unsupported"; message: string };

export type DraftRunResult = { kind: "ok"; output: DraftTurn } | { kind: "refused" };

/** LLM behind the drafter. Swappable for a stub in tests. */
export interface DraftModel {
  run(input: ModelInput): Promise<DraftRunResult>;
}

const draftTurnSchema = z.object({
  draft: z.string().nullable(),
  clarifyingQuestion: z.string().nullable(),
});

export type DraftTurn = z.infer<typeof draftTurnSchema>;

const DRAFT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["draft", "clarifyingQuestion"],
  properties: {
    draft: { anyOf: [{ type: "string" }, { type: "null" }], description: "The message to send, or null if a fact is missing." },
    clarifyingQuestion: { anyOf: [{ type: "string" }, { type: "null" }], description: "One short question, only when draft is null." },
  },
};

const DRAFT_SYSTEM_PROMPT = `You help an older adult write a message to the helper doing their job through Handy. The customer tells you what they want to say, often loosely ("can you tell James where the washing machine is?"). You write the message they would send.

Write it in the customer's voice, first person, as if they typed it: "The washing machine is in the basement, down the stairs on the left." Keep it friendly, plain and short, one to three sentences. No greeting line or sign-off unless the customer asked for one.

Only use facts from the customer's words, the job details, or the recent messages in the <job> block. Never invent details. Don't include private information the customer didn't ask to share.

If the message needs a fact you don't have (for example, where the washing machine actually is), set draft to null and ask one short, kind question in clarifyingQuestion. Otherwise set clarifyingQuestion to null.

The <job> block is written by the app, not the customer.`;

/** Any JsonClient → DraftModel. */
export class JsonDraftModel implements DraftModel {
  constructor(private readonly client: JsonClient) {}

  async run(input: ModelInput): Promise<DraftRunResult> {
    const result = await this.client.request({ ...input, schema: DRAFT_JSON_SCHEMA, schemaName: "job_message_draft" });
    if (result.kind === "refused") return result;

    const parsed = draftTurnSchema.safeParse(result.json);
    if (!parsed.success) {
      throw new AIServiceError(`Draft output failed validation: ${parsed.error.message}`);
    }
    return { kind: "ok", output: parsed.data };
  }
}

export class MuseDraftModel extends JsonDraftModel {
  constructor(options: MuseModelOptions = {}) {
    super(new MuseJsonClient(options));
  }
}

const REFUSED_DRAFT_MESSAGE = "Sorry, I can't help write that message. You can still type it yourself.";

/**
 * Turns a loose instruction into a clear message for the worker (spec section 13).
 * Stateless: on "clarify", backend keeps the turns and passes them back as history.
 */
export class JobMessageDrafter {
  private readonly model: DraftModel;

  constructor(options: { model?: DraftModel } = {}) {
    this.model = options.model ?? new MuseDraftModel();
  }

  async draft(job: JobContext, instruction: string, history: ChatTurn[] = []): Promise<DraftResult> {
    const text = instruction.trim();
    if (!text) return { kind: "clarify", question: `What would you like to tell ${job.workerFirstName}?` };

    // Same safety layer as the main chat. Emergencies go to 911, not the worker.
    const safety = classifySafety(text);
    if (safety.status === "POTENTIAL_EMERGENCY" && safety.message && safety.emergency) {
      return { kind: "emergency", message: safety.message, emergency: safety.emergency };
    }
    if (safety.status === "UNSUPPORTED_SERVICE" && safety.message) {
      return { kind: "unsupported", message: safety.message };
    }

    let result: DraftRunResult;
    try {
      result = await this.model.run({
        system: DRAFT_SYSTEM_PROMPT,
        messages: [
          ...history,
          {
            role: "user",
            content: [
              { type: "text", text },
              { type: "text", text: `<job>\n${JSON.stringify(job)}\n</job>` },
            ],
          },
        ],
      });
    } catch (cause) {
      if (cause instanceof AIServiceError) throw cause;
      throw new AIServiceError("The AI model could not be reached", { cause });
    }

    if (result.kind === "refused") return { kind: "unsupported", message: REFUSED_DRAFT_MESSAGE };

    const draft = result.output.draft?.trim();
    if (draft) return { kind: "draft", message: draft };

    const question = result.output.clarifyingQuestion?.trim();
    return { kind: "clarify", question: question || `What would you like to tell ${job.workerFirstName}?` };
  }
}
