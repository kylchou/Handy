import type { NotificationDTO } from "@handy/contracts";
import { notFound } from "../lib/errors";
import { notificationsRepo } from "../repositories/notifications";
import type { Actor, ServiceContext } from "./context";
import { toNotificationDTO } from "./mappers";

export class NotificationService {
  constructor(private ctx: ServiceContext) {}

  async list(actor: Actor, unreadOnly: boolean): Promise<NotificationDTO[]> {
    return (await notificationsRepo.list(this.ctx.db, actor.id, { unreadOnly })).map(toNotificationDTO);
  }

  async markRead(actor: Actor, id: string): Promise<NotificationDTO> {
    const row = await notificationsRepo.markRead(this.ctx.db, actor.id, id);
    if (!row) throw notFound("Notification");
    return toNotificationDTO(row);
  }

  async markAllRead(actor: Actor): Promise<{ updated: number }> {
    return { updated: await notificationsRepo.markAllRead(this.ctx.db, actor.id) };
  }
}
