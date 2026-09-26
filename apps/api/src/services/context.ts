import type { FastifyBaseLogger } from "fastify";
import type { AIService, MatchingService, NewRealtimeEvent, RealtimeEvent, UserRole } from "@handy/contracts";
import type { Database } from "@handy/db";
import type { AppConfig } from "../config";
import type { Geocoder } from "../lib/geocoder";
import { caregiversRepo } from "../repositories/caregivers";
import { notificationsRepo } from "../repositories/notifications";
import { usersRepo } from "../repositories/users";
import type { EventBus } from "../websocket/event-bus";
import { toNotificationDTO } from "./mappers";

export interface ServiceContext {
  db: Database;
  config: AppConfig;
  bus: EventBus;
  ai: AIService;
  matching: MatchingService;
  geocoder: Geocoder;
  log: FastifyBaseLogger;
}

/** The authenticated caller. */
export interface Actor {
  id: string;
  role: UserRole;
}

type EventOf<T extends RealtimeEvent["type"]> = Extract<RealtimeEvent, { type: T }>;

/** Builds a caregiver's version of a notification from the customer's first name. */
export type CaregiverMessage = (customerFirstName: string) => { title: string; body?: string | null };

/** Realtime events plus persisted, plain-language notifications. Call after commit. */
export class Notifier {
  constructor(private ctx: ServiceContext) {}

  emit<T extends RealtimeEvent["type"]>(userIds: string[], type: T, data: EventOf<T>["data"]): void {
    this.ctx.bus.publish(userIds, { type, at: new Date().toISOString(), data } as NewRealtimeEvent);
  }

  /**
   * Notifies the customer, and if `forCaregivers` is given, also everyone
   * linked to them as a caregiver (worded for a family member).
   */
  async notifyCustomer(
    customerId: string,
    type: string,
    title: string,
    body: string | null,
    data: Record<string, unknown>,
    forCaregivers?: CaregiverMessage,
  ) {
    await this.notify(customerId, type, title, body, data);
    if (forCaregivers) await this.notifyCaregivers(customerId, type, forCaregivers, data);
  }

  /** Notifies only the customer's caregivers. */
  async notifyCaregivers(customerId: string, type: string, build: CaregiverMessage, data: Record<string, unknown> = {}) {
    const links = await caregiversRepo.caregiversOf(this.ctx.db, customerId);
    if (links.length === 0) return;
    const customer = await usersRepo.findById(this.ctx.db, customerId);
    const { title, body } = build(customer?.firstName ?? "Your family member");
    for (const link of links) await this.notify(link.caregiverId, type, title, body ?? null, { ...data, customerId });
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
