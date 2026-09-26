import { categoriesRepo } from "../repositories/categories";
import { AdminService } from "./admin-service";
import { AuthService, type TokenSigner } from "./auth-service";
import { CaregiverService } from "./caregiver-service";
import type { ServiceContext } from "./context";
import { ConversationService } from "./conversation-service";
import { JobService } from "./job-service";
import { toCategoryDTO } from "./mappers";
import { MatchingOrchestrator } from "./matching-orchestrator";
import { NotificationService } from "./notification-service";
import { ProfileService } from "./profile-service";
import { RequestService } from "./request-service";

export function createServices(ctx: ServiceContext, sign: TokenSigner) {
  const matching = new MatchingOrchestrator(ctx);
  const conversations = new ConversationService(ctx);
  const profiles = new ProfileService(ctx);
  return {
    auth: new AuthService(ctx, sign),
    profiles,
    caregivers: new CaregiverService(ctx, profiles),
    conversations,
    requests: new RequestService(ctx, conversations, matching),
    jobs: new JobService(ctx, matching),
    matching,
    notifications: new NotificationService(ctx),
    admin: new AdminService(ctx),
    categories: {
      list: async () => (await categoriesRepo.list(ctx.db)).map(toCategoryDTO),
    },
  };
}

export type Services = ReturnType<typeof createServices>;
export type { Actor, ServiceContext } from "./context";
