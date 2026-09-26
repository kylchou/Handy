import type {
  AIResponse,
  ConversationDetailResponse,
  CreateConversationResponse,
  SendConversationMessageResponse,
  ServiceRequestDraft,
} from "@handy/contracts";
import { REQUIRED_REQUEST_FIELDS } from "@handy/contracts";
import type { ConversationRow } from "@handy/db";
import { ApiError, forbidden, notFound } from "../lib/errors";
import { EMERGENCY_GUIDANCE, detectEmergency } from "../lib/safety";
import { todayIn } from "../lib/time";
import { categoriesRepo } from "../repositories/categories";
import { conversationsRepo } from "../repositories/conversations";
import { requestsRepo } from "../repositories/requests";
import { customerProfilesRepo, usersRepo } from "../repositories/users";
import { Notifier, type Actor, type ServiceContext } from "./context";
import { toCategoryDTO, toConversationDTO, toConversationMessageDTO } from "./mappers";

export const GREETING = "Hello! What can we help you with today? You can type or tap the microphone and tell me in your own words.";

export class ConversationService {
  private notifier: Notifier;

  constructor(private ctx: ServiceContext) {
    this.notifier = new Notifier(ctx);
  }

  async create(actor: Actor): Promise<CreateConversationResponse> {
    const conv = await conversationsRepo.create(this.ctx.db, actor.id);
    const greeting = await conversationsRepo.addMessage(this.ctx.db, { conversationId: conv.id, senderType: "AI", content: GREETING });
    return { conversation: toConversationDTO(conv, null), messages: [toConversationMessageDTO(greeting)] };
  }

  async get(actor: Actor, conversationId: string): Promise<ConversationDetailResponse> {
    const conv = await this.load(actor, conversationId);
    const [messages, request] = await Promise.all([
      conversationsRepo.messages(this.ctx.db, conv.id),
      requestsRepo.getByConversation(this.ctx.db, conv.id),
    ]);
    return { conversation: toConversationDTO(conv, request?.id ?? null), messages: messages.map(toConversationMessageDTO) };
  }

  async sendMessage(actor: Actor, conversationId: string, content: string): Promise<SendConversationMessageResponse> {
    const conv = await this.load(actor, conversationId);
    if (conv.status !== "ACTIVE") {
      throw new ApiError("CONFLICT", "This request was already sent. Start a new conversation to ask for something else.");
    }
    const { db } = this.ctx;
    const [history, user, profile, categories] = await Promise.all([
      conversationsRepo.messages(db, conv.id),
      usersRepo.findById(db, actor.id),
      customerProfilesRepo.get(db, actor.id),
      categoriesRepo.list(db),
    ]);
    const userMessage = await conversationsRepo.addMessage(db, {
      conversationId: conv.id,
      senderType: "CUSTOMER",
      senderId: actor.id,
      content,
    });

    let ai: AIResponse;
    if (detectEmergency(content)) {
      // Deterministic layer: never rely on the model for this.
      ai = { message: EMERGENCY_GUIDANCE.message, extractedData: {}, missingInformation: [], readyToSubmit: false, safetyStatus: "POTENTIAL_EMERGENCY" };
    } else {
      try {
        ai = await this.ctx.ai.processMessage(conv.id, content, {
          history: history
            .filter((m) => m.senderType !== "SYSTEM")
            .map((m) => ({ role: m.senderType === "CUSTOMER" ? ("customer" as const) : ("assistant" as const), content: m.content })),
          currentDraft: conv.draft,
          customer: { firstName: user?.firstName ?? "there", homeAddress: profile?.address ?? null },
          now: new Date().toISOString(),
          today: todayIn(this.ctx.config.timezone),
          timezone: this.ctx.config.timezone,
          serviceCategories: categories.map(toCategoryDTO),
        });
      } catch (err) {
        this.ctx.log.error({ err, conversationId: conv.id }, "AI service failed");
        ai = {
          message: "I'm sorry, I had trouble understanding that. Could you say it another way?",
          extractedData: {},
          missingInformation: conv.missingInformation,
          readyToSubmit: false,
          safetyStatus: conv.safetyStatus,
        };
      }
    }

    const draft = mergeDraft(conv.draft, ai.extractedData);
    const stillMissing = REQUIRED_REQUEST_FIELDS.filter((f) => draft[f] == null || draft[f] === "");
    const readyToSubmit = ai.readyToSubmit && stillMissing.length === 0 && ai.safetyStatus === "NORMAL_SERVICE";

    const assistantMessage = await conversationsRepo.addMessage(db, { conversationId: conv.id, senderType: "AI", content: ai.message });
    const updated = await conversationsRepo.update(db, conv.id, {
      draft,
      missingInformation: ai.missingInformation.length ? ai.missingInformation : stillMissing,
      readyToSubmit,
      safetyStatus: ai.safetyStatus,
    });

    // Let the family know right away, once per conversation.
    if (ai.safetyStatus === "POTENTIAL_EMERGENCY" && conv.safetyStatus !== "POTENTIAL_EMERGENCY") {
      await this.notifier.notifyCaregivers(
        actor.id,
        "POTENTIAL_EMERGENCY",
        (who) => ({
          title: `${who} may need help right now.`,
          body: `${who} described what sounds like an emergency to the Handy assistant and was told to call 911. Please check on them.`,
        }),
        { conversationId: conv.id },
      );
    }

    return {
      userMessage: toConversationMessageDTO(userMessage),
      assistantMessage: toConversationMessageDTO(assistantMessage),
      conversation: toConversationDTO(updated, null),
      emergency: ai.safetyStatus === "POTENTIAL_EMERGENCY" ? EMERGENCY_GUIDANCE : null,
    };
  }

  /** Loads a conversation the actor may access (its customer, or an admin). */
  async load(actor: Actor, conversationId: string): Promise<ConversationRow> {
    const conv = await conversationsRepo.get(this.ctx.db, conversationId);
    if (!conv) throw notFound("Conversation");
    if (actor.role !== "ADMIN" && conv.customerId !== actor.id) throw forbidden();
    return conv;
  }
}

/** `undefined` keeps the stored value; `null` clears it. */
export function mergeDraft(current: ServiceRequestDraft, patch: ServiceRequestDraft): ServiceRequestDraft {
  const out: ServiceRequestDraft = { ...current };
  for (const [k, v] of Object.entries(patch) as Array<[keyof ServiceRequestDraft, unknown]>) {
    if (v === undefined) continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
