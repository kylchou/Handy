import type {
  CustomerHistoryItemDTO,
  CustomerProfileDTO,
  RatingDTO,
  UpdateAvailabilityBody,
  UpdateCustomerProfileBody,
  UpdateQualificationsBody,
  UpdateUserBody,
  UpdateWorkerProfileBody,
  UserDTO,
  WorkerEarningsDTO,
  WorkerProfileDTO,
  WorkerPublicDTO,
} from "@handy/contracts";
import { updateQualificationsSchema } from "@handy/contracts";
import { notFound } from "../lib/errors";
import { categoriesRepo } from "../repositories/categories";
import { jobsRepo, ratingsRepo } from "../repositories/jobs";
import { requestsRepo } from "../repositories/requests";
import { customerProfilesRepo, usersRepo } from "../repositories/users";
import { workersRepo } from "../repositories/workers";
import type { Actor, ServiceContext } from "./context";
import { toCustomerProfileDTO, toRatingDTO, toUserDTO, toWorkerProfileDTO } from "./mappers";
import { workerPublicViews } from "./views";

export class ProfileService {
  constructor(private ctx: ServiceContext) {}

  async updateUser(actor: Actor, body: UpdateUserBody): Promise<UserDTO> {
    const user = await usersRepo.update(this.ctx.db, actor.id, body);
    if (!user) throw notFound("User");
    return toUserDTO(user);
  }

  // ---------- Customers ----------

  async getCustomerProfile(actor: Actor): Promise<CustomerProfileDTO> {
    const p = (await customerProfilesRepo.get(this.ctx.db, actor.id)) ?? (await customerProfilesRepo.upsert(this.ctx.db, actor.id, {}));
    return toCustomerProfileDTO(p);
  }

  async updateCustomerProfile(actor: Actor, body: UpdateCustomerProfileBody): Promise<CustomerProfileDTO> {
    return toCustomerProfileDTO(await customerProfilesRepo.upsert(this.ctx.db, actor.id, body));
  }

  /** Newest first. Used by the customer and by their caregivers. */
  async customerHistory(customerId: string): Promise<CustomerHistoryItemDTO[]> {
    const requests = await requestsRepo.list(this.ctx.db, { customerId });
    const [jobs, categories] = await Promise.all([
      jobsRepo.list(this.ctx.db, { customerId }),
      categoriesRepo.list(this.ctx.db),
    ]);
    // Prefer the live job for each request; fall back to the most recent cancelled one.
    const jobByRequest = new Map<string, (typeof jobs)[number]>();
    for (const j of jobs) {
      const existing = jobByRequest.get(j.requestId);
      if (!existing || (existing.status === "CANCELLED" && j.status !== "CANCELLED")) jobByRequest.set(j.requestId, j);
    }
    const [workers, ratings] = await Promise.all([
      workerPublicViews(this.ctx, jobs.map((j) => j.workerId)),
      ratingsRepo.byJobs(this.ctx.db, jobs.map((j) => j.id)),
    ]);
    const ratingByJob = new Map(ratings.map((r) => [r.jobId, r.score]));
    const categoryName = new Map(categories.map((c) => [c.id, c.name]));
    return requests.map((r) => {
      const job = jobByRequest.get(r.id);
      return {
        requestId: r.id,
        jobId: job?.id ?? null,
        serviceCategoryId: r.serviceCategoryId,
        serviceName: categoryName.get(r.serviceCategoryId) ?? r.serviceCategoryId,
        description: r.description,
        requestedDate: r.requestedDate,
        requestedStartTime: r.requestedStartTime,
        requestStatus: r.status,
        jobStatus: job?.status ?? null,
        worker: job ? (workers.get(job.workerId) ?? null) : null,
        priceCents: job?.finalPriceCents ?? r.estimatedPriceCents,
        rating: job ? (ratingByJob.get(job.id) ?? null) : null,
        createdAt: r.createdAt.toISOString(),
      };
    });
  }

  // ---------- Workers ----------

  async getWorkerProfile(workerId: string): Promise<WorkerProfileDTO> {
    const p = await workersRepo.getProfile(this.ctx.db, workerId);
    if (!p) throw notFound("Worker profile");
    const [quals, slots] = await Promise.all([
      workersRepo.qualifications(this.ctx.db, [workerId]),
      workersRepo.availability(this.ctx.db, [workerId]),
    ]);
    return toWorkerProfileDTO(p, quals, slots);
  }

  async updateWorkerProfile(actor: Actor, body: UpdateWorkerProfileBody): Promise<WorkerProfileDTO> {
    await workersRepo.updateProfile(this.ctx.db, actor.id, body);
    return this.getWorkerProfile(actor.id);
  }

  async updateQualifications(actor: Actor, body: UpdateQualificationsBody): Promise<WorkerProfileDTO> {
    const { qualifications } = updateQualificationsSchema.parse(body);
    const unique = new Map(qualifications.map((q) => [q.serviceCategoryId, q]));
    await this.ctx.db.transaction((tx) => workersRepo.replaceQualifications(tx, actor.id, [...unique.values()]));
    return this.getWorkerProfile(actor.id);
  }

  async updateAvailability(actor: Actor, body: UpdateAvailabilityBody): Promise<WorkerProfileDTO> {
    await this.ctx.db.transaction(async (tx) => {
      if (body.availabilityStatus) await workersRepo.updateProfile(tx, actor.id, { availabilityStatus: body.availabilityStatus });
      if (body.slots) await workersRepo.replaceAvailability(tx, actor.id, body.slots);
    });
    return this.getWorkerProfile(actor.id);
  }

  async publicWorker(workerId: string): Promise<WorkerPublicDTO> {
    const w = (await workerPublicViews(this.ctx, [workerId])).get(workerId);
    if (!w) throw notFound("Worker");
    return w;
  }

  async workerRatings(workerId: string): Promise<RatingDTO[]> {
    return (await ratingsRepo.byWorker(this.ctx.db, workerId)).map(toRatingDTO);
  }

  async earnings(actor: Actor): Promise<WorkerEarningsDTO> {
    const jobs = await jobsRepo.list(this.ctx.db, { workerId: actor.id, status: "COMPLETED" });
    const requests = await requestsRepo.list(this.ctx.db, { ids: jobs.map((j) => j.requestId) });
    const [categories, ratings] = await Promise.all([categoriesRepo.list(this.ctx.db), ratingsRepo.byJobs(this.ctx.db, jobs.map((j) => j.id))]);
    const categoryOf = new Map(requests.map((r) => [r.id, r.serviceCategoryId]));
    const categoryName = new Map(categories.map((c) => [c.id, c.name]));
    const ratingByJob = new Map(ratings.map((r) => [r.jobId, r.score]));
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const rows = jobs.map((j) => ({
      jobId: j.id,
      serviceName: categoryName.get(categoryOf.get(j.requestId)!) ?? "Service",
      completedAt: (j.completedAt ?? j.updatedAt).toISOString(),
      amountCents: j.finalPriceCents ?? 0,
      ratingScore: ratingByJob.get(j.id) ?? null,
    }));
    return {
      totalEarnedCents: rows.reduce((s, r) => s + r.amountCents, 0),
      completedJobs: rows.length,
      last7DaysCents: rows.filter((r) => Date.parse(r.completedAt) >= weekAgo).reduce((s, r) => s + r.amountCents, 0),
      jobs: rows,
    };
  }
}
