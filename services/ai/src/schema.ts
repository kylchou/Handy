import { z } from "zod";
import { SERVICE_CATEGORIES } from "./categories.js";

const SAFETY_STATUSES = ["NORMAL_SERVICE", "NEEDS_CLARIFICATION", "UNSUPPORTED_SERVICE", "POTENTIAL_EMERGENCY"] as const;
const URGENCIES = ["low", "normal", "high"] as const;

/** Runtime check of model output. Keep in sync with MODEL_TURN_JSON_SCHEMA. */
export const modelTurnSchema = z.object({
  reply: z.string(),
  safetyStatus: z.enum(SAFETY_STATUSES),
  userConfirmed: z.boolean(),
  request: z.object({
    serviceCategory: z.enum(SERVICE_CATEGORIES).nullable(),
    description: z.string().nullable(),
    location: z.string().nullable(),
    date: z.string().nullable(),
    startTime: z.string().nullable(),
    endTime: z.string().nullable(),
    urgency: z.enum(URGENCIES).nullable(),
    specialRequirements: z.array(z.string()),
  }),
});

export type ModelTurn = z.infer<typeof modelTurnSchema>;

const nullableString = (description: string) => ({
  anyOf: [{ type: "string" }, { type: "null" }],
  description,
});

/** Structured-output format sent with each request; model can only return this shape. */
export const MODEL_TURN_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "safetyStatus", "userConfirmed", "request"],
  properties: {
    reply: { type: "string", description: "What to say to the customer. Plain words, one to three sentences." },
    safetyStatus: { type: "string", enum: [...SAFETY_STATUSES] },
    userConfirmed: {
      type: "boolean",
      description: "True only if the latest message clearly says yes to the summarized request.",
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
      ],
      properties: {
        serviceCategory: { anyOf: [{ type: "string", enum: [...SERVICE_CATEGORIES] }, { type: "null" }] },
        description: nullableString("One plain sentence a helper can act on."),
        location: nullableString("Address where the helper should go."),
        date: nullableString("YYYY-MM-DD"),
        startTime: nullableString("HH:MM, 24-hour"),
        endTime: nullableString("HH:MM, 24-hour"),
        urgency: { anyOf: [{ type: "string", enum: [...URGENCIES] }, { type: "null" }] },
        specialRequirements: { type: "array", items: { type: "string" } },
      },
    },
  },
};
