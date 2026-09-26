import type { SafetyStatus } from "./enums";
import type { ServiceCategoryDTO, ServiceRequestDraft } from "./dto";

/**
 * Boundary between the backend (Kyler, Engineer 2) and the AI service (Aditya, Engineer 3).
 *
 * The AI service never touches the database. The backend loads everything the
 * assistant needs into `AIConversationContext`, calls `processMessage`, then
 * persists the result.
 *
 * Package `@handy/ai` should export `createAIService(): AIService`.
 */
export interface AIService {
  processMessage(
    conversationId: string,
    message: string,
    context: AIConversationContext,
  ): Promise<AIResponse>;
}

export interface AIConversationContext {
  /** Prior turns, oldest first. Does not include `message`. */
  history: Array<{ role: "customer" | "assistant"; content: string }>;
  /** What has been extracted so far. */
  currentDraft: ServiceRequestDraft;
  customer: {
    firstName: string;
    /** Home address on file; lets the assistant offer "your home" as the location. */
    homeAddress: string | null;
  };
  /** ISO timestamp of "now", for resolving "tomorrow afternoon". */
  now: string;
  /** Today's date (YYYY-MM-DD) in `timezone`. */
  today: string;
  timezone: string;
  serviceCategories: ServiceCategoryDTO[];
}

export interface AIResponse {
  /** Plain-language reply shown (or read aloud) to the customer. */
  message: string;
  /**
   * Fields learned or changed by this turn. Merge semantics: `undefined`
   * leaves the stored value alone, `null` clears it.
   */
  extractedData: ServiceRequestDraft;
  missingInformation: string[];
  readyToSubmit: boolean;
  safetyStatus: SafetyStatus;
}

/** Field names used in `missingInformation`. */
export const REQUIRED_REQUEST_FIELDS = [
  "serviceCategoryId",
  "description",
  "location",
  "requestedDate",
  "requestedStartTime",
] as const satisfies ReadonlyArray<keyof ServiceRequestDraft>;
