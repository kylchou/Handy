import type { JobOfferRow, JobRow, ServiceRequestRow } from "@handy/db";
import type { JobDetailDTO, JobOfferDTO, ServiceRequestDTO, WorkerPublicDTO } from "@handy/contracts";
import { distanceMiles } from "../lib/geo";
import { categoriesRepo } from "../repositories/categories";
import { jobsRepo, ratingsRepo } from "../repositories/jobs";
import { offersRepo } from "../repositories/offers";
import { requestsRepo } from "../repositories/requests";
import { usersRepo } from "../repositories/users";
import { workersRepo } from "../repositories/workers";
import type { ServiceContext } from "./context";
import {
  toCustomerPublicDTO,
  toJobDTO,
  toJobOfferDTO,
  toRatingDTO,
  toRequestDTO,
  toWorkerPublicDTO,
} from "./mappers";

/** Batch loaders that turn rows into the rich DTOs the UIs render. */

export async function requestViews(ctx: ServiceContext, rows: ServiceRequestRow[]): Promise<ServiceRequestDTO[]> {
  const ids = rows.map((r) => r.id);
  const [pending, jobs] = await Promise.all([offersRepo.pendingCounts(ctx.db, ids), jobsRepo.activeForRequests(ctx.db, ids)]);
  const jobByRequest = new Map(jobs.map((j) => [j.requestId, j.id]));
  return rows.map((r) => toRequestDTO(r, pending.get(r.id) ?? 0, jobByRequest.get(r.id) ?? null));
}

export async function requestView(ctx: ServiceContext, row: ServiceRequestRow): Promise<ServiceRequestDTO> {
  return (await requestViews(ctx, [row]))[0]!;
}

export async function workerPublicViews(ctx: ServiceContext, workerIds: string[]): Promise<Map<string, WorkerPublicDTO>> {
  const ids = [...new Set(workerIds)];
  const [users, profiles, quals] = await Promise.all([
    usersRepo.findByIds(ctx.db, ids),
    workersRepo.listProfiles(ctx.db, ids),
    workersRepo.qualifications(ctx.db, ids),
  ]);
  const profileById = new Map(profiles.map((p) => [p.userId, p]));
  const out = new Map<string, WorkerPublicDTO>();
  for (const u of users) {
    const p = profileById.get(u.id);
    if (p) out.set(u.id, toWorkerPublicDTO(u, p, quals));
  }
  return out;
}

export async function jobDetails(ctx: ServiceContext, jobs: JobRow[]): Promise<JobDetailDTO[]> {
  if (jobs.length === 0) return [];
  const requests = await requestsRepo.list(ctx.db, { ids: [...new Set(jobs.map((j) => j.requestId))] });
  const [requestDTOs, workers, customers, ratings, profiles] = await Promise.all([
    requestViews(ctx, requests),
    workerPublicViews(ctx, jobs.map((j) => j.workerId)),
    usersRepo.findByIds(ctx.db, [...new Set(requests.map((r) => r.customerId))]),
    ratingsRepo.byJobs(ctx.db, jobs.map((j) => j.id)),
    workersRepo.listProfiles(ctx.db, [...new Set(jobs.map((j) => j.workerId))]),
  ]);
  const requestById = new Map(requestDTOs.map((r) => [r.id, r]));
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const ratingByJob = new Map(ratings.map((r) => [r.jobId, r]));
  const profileById = new Map(profiles.map((p) => [p.userId, p]));

  return jobs.flatMap((j) => {
    const request = requestById.get(j.requestId);
    const worker = workers.get(j.workerId);
    const customer = request && customerById.get(request.customerId);
    if (!request || !worker || !customer) return [];
    const profile = profileById.get(j.workerId);
    const rating = ratingByJob.get(j.id);
    return [
      {
        ...toJobDTO(j),
        request,
        worker,
        customer: toCustomerPublicDTO(customer),
        distanceMiles: profile ? distanceMiles(profile, request) : null,
        rating: rating ? toRatingDTO(rating) : null,
      },
    ];
  });
}

export async function jobDetail(ctx: ServiceContext, job: JobRow): Promise<JobDetailDTO> {
  return (await jobDetails(ctx, [job]))[0]!;
}

export async function offerViews(ctx: ServiceContext, offers: JobOfferRow[]): Promise<JobOfferDTO[]> {
  if (offers.length === 0) return [];
  const requests = await requestsRepo.list(ctx.db, { ids: [...new Set(offers.map((o) => o.requestId))] });
  const [categories, customers] = await Promise.all([
    categoriesRepo.list(ctx.db),
    usersRepo.findByIds(ctx.db, [...new Set(requests.map((r) => r.customerId))]),
  ]);
  const requestById = new Map(requests.map((r) => [r.id, r]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const customerById = new Map(customers.map((c) => [c.id, c]));
  return offers.flatMap((o) => {
    const r = requestById.get(o.requestId);
    const customer = r && customerById.get(r.customerId);
    return r && customer ? [toJobOfferDTO(o, r, categoryById.get(r.serviceCategoryId), customer)] : [];
  });
}
