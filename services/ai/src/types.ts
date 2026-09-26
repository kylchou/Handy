import type { ServiceCategoryCode } from "./categories.js";

export type SafetyStatus =
  | "NORMAL_SERVICE"
  | "NEEDS_CLARIFICATION"
  | "UNSUPPORTED_SERVICE"
  | "POTENTIAL_EMERGENCY";

export type Urgency = "low" | "normal" | "high";

/**
 * Collected request fields. Names match ServiceRequestDTO, so backend can spread directly.
 * TODO: Partial<ServiceRequestDTO> from @handy/contracts once it has `urgency` + `specialRequirements`.
 */
export interface ExtractedRequestData {
  /** Code, e.g. "MOVING_ASSISTANCE". Backend maps to ServiceCategory id. */
  serviceCategoryId?: ServiceCategoryCode;
  description?: string;
  /** Free-text address. Backend geocodes or uses profile coordinates. */
  location?: string;
  /** YYYY-MM-DD, customer's time zone. */
  requestedDate?: string;
  /** HH:MM, 24-hour. */
  requestedStartTime?: string;
  /** HH:MM, 24-hour. Default: start + 1 hour. */
  requestedEndTime?: string;
  urgency?: Urgency;
  specialRequirements?: string[];
}

export type RequiredField = "serviceCategory" | "description" | "date" | "startTime" | "location";

export type EmergencyKind = "MEDICAL" | "FIRE_OR_GAS" | "CRIME" | "SELF_HARM" | "GENERAL";

export interface EmergencyGuidance {
  kind: EmergencyKind;
  /** Number for the big "Call" button. */
  callNumber: "911" | "988";
}

export interface AIResponse {
  /** Reply for the customer. Short enough to read aloud. */
  message: string;
  extractedData: ExtractedRequestData;
  missingInformation: RequiredField[];
  /** Nothing missing + safe → show confirmation card. */
  readyToSubmit: boolean;
  /** Spoken "yes" to the summary (voice users). Only true with readyToSubmit. Same as pressing "Confirm Request". */
  userConfirmed: boolean;
  safetyStatus: SafetyStatus;
  /** Only set for POTENTIAL_EMERGENCY. */
  emergency?: EmergencyGuidance;
}

export interface AIService {
  processMessage(conversationId: string, message: string, customer?: CustomerContext): Promise<AIResponse>;
}

/** Known customer facts from backend, so the AI doesn't re-ask. */
export interface CustomerContext {
  firstName?: string;
  savedAddress?: string;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ConversationState {
  conversationId: string;
  history: ChatTurn[];
  extracted: ExtractedRequestData;
  safetyStatus: SafetyStatus;
  updatedAt: string;
}
