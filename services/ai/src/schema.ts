import { SAFETY_STATUSES, URGENCIES } from "@handy/contracts";
import { z } from "zod";
import { SERVICE_CATEGORIES } from "./categories.js";

const REPEATS = ["WEEKLY", "BIWEEKLY"] as const;

/** Runtime check of model output. Keep in sync with MODEL_TURN_JSON_SCHEMA. */
export const modelTurnSchema = z.object({
  reply: z.string(),
  safetyStatus: z.enum(SAFETY_STATUSES),
  customerConfirmed: z.boolean(),
  request: z.object({
    serviceCategory: z.enum(SERVICE_CATEGORIES).nullable(),
    description: z.string().nullable(),
    location: z.string().nullable(),
    date: z.string().nullable(),
    startTime: z.string().nullable(),
    endTime: z.string().nullable(),
    urgency: z.enum(URGENCIES).nullable(),
    specialRequirements: z.array(z.string()),
    preferredWorkerId: z.string().nullable(),
    repeat: z.enum(REPEATS).nullable(),
  }),
});

export type ModelTurn = z.infer<typeof modelTurnSchema>;

const nullableString = (description: string) => ({
  anyOf: [{ type: "string" }, { type: "null" }],
  description,
});

const nullableEnum = (values: readonly string[]) => ({ anyOf: [{ type: "string", enum: [...values] }, { type: "null" }] });

/** Structured-output format sent with each request; model can only return this shape. */
export const MODEL_TURN_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "safetyStatus", "customerConfirmed", "request"],
  properties: {
    reply: { type: "string", description: "What to say to the customer. Plain words, one to three sentences." },
    safetyStatus: { type: "string", enum: [...SAFETY_STATUSES] },
    customerConfirmed: {
      type: "boolean",
      description: "True only if your previous message summarized the full request and the latest message clearly says yes to it without changing anything.",
    },
    request: {
      type: "object",
      additionalProperties: false,
      required: [
        "serviceCategory",
        "description",
        "location",
        "date",
        "startTime",
        "endTime",
        "urgency",
        "specialRequirements",
        "preferredWorkerId",
        "repeat",
      ],
      properties: {
        serviceCategory: nullableEnum(SERVICE_CATEGORIES),
        description: nullableString("One plain sentence a helper can act on."),
        location: nullableString("Address where the helper should go."),
        date: nullableString("YYYY-MM-DD"),
        startTime: nullableString("HH:MM, 24-hour"),
        endTime: nullableString("HH:MM, 24-hour"),
        urgency: nullableEnum(URGENCIES),
        specialRequirements: { type: "array", items: { type: "string" } },
        preferredWorkerId: nullableString("workerId from past_workers, only when the customer asks for that person."),
        repeat: nullableEnum(REPEATS),
      },
    },
  },
};
