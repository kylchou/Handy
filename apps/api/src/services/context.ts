import type { FastifyBaseLogger } from "fastify";
import type { AIService, MatchingService, NewRealtimeEvent, RealtimeEvent, UserRole } from "@handy/contracts";
import type { Database } from "@handy/db";
import type { AppConfig } from "../config";
import { notificationsRepo } from "../repositories/notifications";
import type { EventBus } from "../websocket/event-bus";
import { toNotificationDTO } from "./mappers";

export interface ServiceContext {
  db: Database;
  config: AppConfig;
  bus: EventBus;
  ai: AIService;
  matching: MatchingService;
  log: FastifyBaseLogger;
}

/** The authenticated caller. */
export interface Actor {
  id: string;
  role: UserRole;
}

type EventOf<T extends RealtimeEvent["type"]> = Extract<RealtimeEvent, { type: T }>;

/** Realtime events plus persisted, plain-language notifications. Call after commit. */
export class Notifier {
  constructor(private ctx: ServiceContext) {}

  emit<T extends RealtimeEvent["type"]>(userIds: string[], type: T, data: EventOf<T>["data"]): void {
    this.ctx.bus.publish(userIds, { type, at: new Date().toISOString(), data } as NewRealtimeEvent);
  }

  async notify(userId: string, type: string, title: string, body: string | null = null, data: Record<string, unknown> = {}) {
    try {
      const row = await notificationsRepo.create(this.ctx.db, { userId, type, title, body, data });
      this.emit([userId], "NOTIFICATION", { notification: toNotificationDTO(row) });
    } catch (err) {
      this.ctx.log.error({ err }, "failed to store notification");
    }
  }
}
