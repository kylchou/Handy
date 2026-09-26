import { randomInt } from "node:crypto";
import { ACTIVE_JOB_STATUSES, type CaregiverInviteDTO, type CaregiverLinkDTO, type CaregiverPersonDTO } from "@handy/contracts";
import { ApiError, notFound } from "../lib/errors";
import { caregiversRepo } from "../repositories/caregivers";
import { jobsRepo } from "../repositories/jobs";
import { requestsRepo } from "../repositories/requests";
import { customerProfilesRepo, usersRepo } from "../repositories/users";
import { Notifier, type Actor, type ServiceContext } from "./context";
import type { ProfileService } from "./profile-service";
import { jobDetails, requestViews } from "./views";

/** No 0/O or 1/I, so codes are easy to read out loud over the phone. */
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Family members / caregivers. A customer creates an invite code and shares
 * it; the caregiver enters it to link. Caregivers can see the customer's jobs
 * and get key updates, but can't act on anything.
 */
export class CaregiverService {
  private notifier: Notifier;

  constructor(
    private ctx: ServiceContext,
    private profiles: ProfileService,
  ) {
    this.notifier = new Notifier(ctx);
  }

  // ---------- Customer side ----------

  async createInvite(actor: Actor): Promise<CaregiverInviteDTO> {
    const code = Array.from({ length: 6 }, () => INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)]).join("");
    const invite = await caregiversRepo.createInvite(this.ctx.db, {
      code,
      customerId: actor.id,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    });
    return { code: invite.code, expiresAt: invite.expiresAt.toISOString() };
  }

  async listCaregivers(actor: Actor): Promise<CaregiverLinkDTO[]> {
    const links = await caregiversRepo.caregiversOf(this.ctx.db, actor.id);
    const users = new Map((await usersRepo.findByIds(this.ctx.db, links.map((l) => l.caregiverId))).map((u) => [u.id, u]));
    return links.flatMap((l) => {
      const u = users.get(l.caregiverId);
      return u
        ? [{ caregiver: { id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email }, linkedAt: l.createdAt.toISOString() }]
        : [];
    });
  }

  async removeCaregiver(actor: Actor, caregiverId: string): Promise<void> {
    if (!(await caregiversRepo.unlink(this.ctx.db, actor.id, caregiverId))) throw notFound("Caregiver");
  }

  // ---------- Caregiver side ----------

  async acceptInvite(actor: Actor, code: string): Promise<CaregiverPersonDTO> {
    const link = await this.ctx.db.transaction(async (tx) => {
      const invite = await caregiversRepo.getInviteForUpdate(tx, code);
      if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
        throw new ApiError("INVALID_INVITE", "That code isn't valid or has expired. Ask them to make a new one in their app.");
      }
      await caregiversRepo.markInviteUsed(tx, code);
      return caregiversRepo.link(tx, invite.customerId, actor.id);
    });
    const caregiver = await usersRepo.findById(this.ctx.db, actor.id);
    await this.notifier.notify(
      link.customerId,
      "CAREGIVER_LINKED",
      `${caregiver?.firstName ?? "A family member"} can now see your Handy requests.`,
      "They'll get updates when someone is on the way or finishes a job. You can remove them any time in Settings.",
      { caregiverId: actor.id },
    );
    return this.person(actor, link.customerId, link.createdAt);
  }

  async people(actor: Actor): Promise<CaregiverPersonDTO[]> {
    const links = await caregiversRepo.customersOf(this.ctx.db, actor.id);
    return Promise.all(links.map((l) => this.person(actor, l.customerId, l.createdAt)));
  }

  async unlinkSelf(actor: Actor, customerId: string): Promise<void> {
    if (!(await caregiversRepo.unlink(this.ctx.db, customerId, actor.id))) throw notFound("Linked person");
  }

  private async person(actor: Actor, customerId: string, linkedAt: Date): Promise<CaregiverPersonDTO> {
    const { db } = this.ctx;
    const [customer, profile, jobs, open, history] = await Promise.all([
      usersRepo.findById(db, customerId),
      customerProfilesRepo.get(db, customerId),
      jobsRepo.list(db, { customerId }),
      requestsRepo.list(db, { customerId, status: "SEARCHING" }),
      this.profiles.customerHistory(customerId),
    ]);
    if (!customer) throw notFound("Linked person");
    return {
      customer: { id: customer.id, firstName: customer.firstName, lastName: customer.lastName, address: profile?.address ?? null },
      linkedAt: linkedAt.toISOString(),
      // The caregiver is the viewer, so these never include the arrival code.
      activeJobs: await jobDetails(this.ctx, jobs.filter((j) => ACTIVE_JOB_STATUSES.includes(j.status)), actor),
      openRequests: await requestViews(this.ctx, open),
      recentHistory: history.slice(0, 10),
    };
  }
}
