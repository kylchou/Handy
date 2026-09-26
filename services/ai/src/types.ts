/**
 * Local types only. Shared ones (AIService, AIResponse, AIConversationContext,
 * ServiceRequestDraft, SafetyStatus, ...) come from @handy/contracts.
 */

export type EmergencyKind = "MEDICAL" | "FIRE_OR_GAS" | "CRIME" | "SELF_HARM" | "GENERAL";

export interface EmergencyGuidance {
  kind: EmergencyKind;
  /** Number for the big "Call" button. */
  callNumber: "911" | "988";
}

/** One chat turn as sent to the model. */
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}
