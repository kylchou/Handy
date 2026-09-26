import type { z } from "zod";
import type {
  ApiErrorBody,
  ApiErrorCode,
  ApiResponses,
  createRatingSchema,
  createServiceRequestSchema,
  loginSchema,
  SetAutopilotBody,
  signupSchema,
  updateAvailabilitySchema,
  updateCustomerProfileSchema,
  updateQualificationsSchema,
  updateUserSchema,
  updateWorkerProfileSchema,
} from "./api";
import { API_PREFIX } from "./api";
import type { JobStatus, ServiceRequestStatus, VerificationStatus } from "./enums";
import type { RealtimeEvent, RealtimeMessage } from "./events";

/**
 * Typed client for the Handy API. Works in the browser and in Node 20+.
 *
 *   const api = createApiClient({ baseUrl: "http://localhost:4000", token: localStorage.getItem("token"),
 *     onTokenChange: (t) => t ? localStorage.setItem("token", t) : localStorage.removeItem("token") });
 *   await api.auth.login({ email, password });   // token is saved automatically
 *   const offers = await api.jobs.available();
 *   const stop = api.realtime.subscribe((event) => { ... });
 */

export class ApiRequestError extends Error {
  constructor(
    /** HTTP status, or 0 when the server couldn't be reached. */
    readonly status: number,
    readonly code: ApiErrorCode | "NETWORK_ERROR",
    /** Plain-language message from the server, safe to show to users. */
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ status: number; ok: boolean; text(): Promise<string> }>;

export interface ApiClientOptions {
  /** e.g. "http://localhost:4000" (no /api/v1). */
  baseUrl: string;
  /** Starting token, e.g. one saved in localStorage. */
  token?: string | null;
  /** Called whenever login/signup/logout/setToken changes the token. */
  onTokenChange?: (token: string | null) => void;
  /** Called on any 401, e.g. to send the user back to the login screen. */
  onUnauthorized?: (error: ApiRequestError) => void;
  /** Defaults to the global fetch. */
  fetch?: FetchLike;
}

type R<K extends keyof ApiResponses> = Promise<ApiResponses[K]>;
type In<S extends z.ZodType> = z.input<S>;

export type ApiClient = ReturnType<typeof createApiClient>;

export function createApiClient(options: ApiClientOptions) {
  const base = options.baseUrl.replace(/\/+$/, "") + API_PREFIX;
  const doFetch: FetchLike = options.fetch ?? ((url, init) => (globalThis as unknown as { fetch: FetchLike }).fetch(url, init));
  let token = options.token ?? null;

  const setToken = (next: string | null) => {
    token = next;
    options.onTokenChange?.(next);
  };

  async function request<T>(method: string, path: string, body?: unknown, query?: Record<string, string | undefined>): Promise<T> {
    const qs = Object.entries(query ?? {})
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v!)}`)
      .join("&");
    const headers: Record<string, string> = {};
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers["content-type"] = "application/json";

    let res;
    try {
      res = await doFetch(`${base}${path}${qs ? `?${qs}` : ""}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiRequestError(0, "NETWORK_ERROR", "We couldn't reach the server. Please check your internet connection and try again.");
    }

    const text = await res.text();
    const data = text ? (JSON.parse(text) as unknown) : undefined;
    if (!res.ok) {
      const err = (data as ApiErrorBody | undefined)?.error;
      const error = new ApiRequestError(
        res.status,
        err?.code ?? "INTERNAL_ERROR",
        err?.message ?? "Something went wrong. Please try again.",
        err?.details,
      );
      if (res.status === 401) options.onUnauthorized?.(error);
      throw error;
    }
    return data as T;
  }

  const get = <T>(path: string, query?: Record<string, string | undefined>) => request<T>("GET", path, undefined, query);
  const post = <T>(path: string, body?: unknown) => request<T>("POST", path, body);
  const put = <T>(path: string, body: unknown) => request<T>("PUT", path, body);
  const patch = <T>(path: string, body: unknown) => request<T>("PATCH", path, body);
  const del = <T>(path: string) => request<T>("DELETE", path);
  const id = encodeURIComponent;

  return {
    getToken: () => token,
    setToken,

    auth: {
      async signup(body: In<typeof signupSchema>): R<"POST /auth/signup"> {
        const res = await post<ApiResponses["POST /auth/signup"]>("/auth/signup", body);
        setToken(res.token);
        return res;
      },
      async login(body: In<typeof loginSchema>): R<"POST /auth/login"> {
        const res = await post<ApiResponses["POST /auth/login"]>("/auth/login", body);
        setToken(res.token);
        return res;
      },
      /** Clears the saved token even if the server call fails. */
      async logout(): Promise<void> {
        try {
          if (token) await post<void>("/auth/logout");
        } finally {
          setToken(null);
        }
      },
      me: (): R<"GET /auth/me"> => get("/auth/me"),
    },

    users: {
      updateMe: (body: In<typeof updateUserSchema>): R<"PATCH /users/me"> => patch("/users/me", body),
    },

    categories: {
      list: (): R<"GET /service-categories"> => get("/service-categories"),
    },

    customers: {
      getProfile: (): R<"GET /customers/me/profile"> => get("/customers/me/profile"),
      updateProfile: (body: In<typeof updateCustomerProfileSchema>): R<"PUT /customers/me/profile"> => put("/customers/me/profile", body),
      history: (): R<"GET /customers/me/history"> => get("/customers/me/history"),
      /** People who've helped before, for "Book James again". */
      pastWorkers: (): R<"GET /customers/me/past-workers"> => get("/customers/me/past-workers"),
      /** Repeating requests ("every Saturday"). */
      schedules: (): R<"GET /customers/me/schedules"> => get("/customers/me/schedules"),
      /** Stops a repeating request. Visits already booked stay booked. */
      stopSchedule: (scheduleId: string): R<"DELETE /customers/me/schedules/:scheduleId"> => del(`/customers/me/schedules/${id(scheduleId)}`),
      /** A 6-character code to give a family member so they can link as a caregiver. */
      createCaregiverInvite: (): R<"POST /customers/me/caregivers/invite"> => post("/customers/me/caregivers/invite"),
      caregivers: (): R<"GET /customers/me/caregivers"> => get("/customers/me/caregivers"),
      removeCaregiver: (caregiverId: string): R<"DELETE /customers/me/caregivers/:caregiverId"> =>
        del(`/customers/me/caregivers/${id(caregiverId)}`),
    },

    caregivers: {
      /** Links to a customer using the code they gave you. */
      acceptInvite: (code: string): R<"POST /caregivers/me/links"> => post("/caregivers/me/links", { code }),
      /** Everyone you help, with their current jobs, open requests and recent history. */
      people: (): R<"GET /caregivers/me/people"> => get("/caregivers/me/people"),
      unlink: (customerId: string): R<"DELETE /caregivers/me/people/:customerId"> => del(`/caregivers/me/people/${id(customerId)}`),
    },

    workers: {
      getProfile: (): R<"GET /workers/me/profile"> => get("/workers/me/profile"),
      updateProfile: (body: In<typeof updateWorkerProfileSchema>): R<"PUT /workers/me/profile"> => put("/workers/me/profile", body),
      updateQualifications: (body: In<typeof updateQualificationsSchema>): R<"PUT /workers/me/qualifications"> =>
        put("/workers/me/qualifications", body),
      updateAvailability: (body: In<typeof updateAvailabilitySchema>): R<"PUT /workers/me/availability"> => put("/workers/me/availability", body),
      earnings: (): R<"GET /workers/me/earnings"> => get("/workers/me/earnings"),
      get: (workerId: string): R<"GET /workers/:workerId"> => get(`/workers/${id(workerId)}`),
      ratings: (workerId: string): R<"GET /workers/:workerId/ratings"> => get(`/workers/${id(workerId)}/ratings`),
    },

    conversations: {
      /** Past chats, newest first. Only chats where the customer said something. */
      list: (): R<"GET /ai/conversations"> => get("/ai/conversations"),
      create: (): R<"POST /ai/conversations"> => post("/ai/conversations"),
      get: (conversationId: string): R<"GET /ai/conversations/:conversationId"> => get(`/ai/conversations/${id(conversationId)}`),
      sendMessage: (conversationId: string, content: string): R<"POST /ai/conversations/:conversationId/messages"> =>
        post(`/ai/conversations/${id(conversationId)}/messages`, { content }),
    },

    requests: {
      /** The "Confirm Request" button. */
      create: (body: In<typeof createServiceRequestSchema>): R<"POST /requests"> => post("/requests", body),
      list: (status?: ServiceRequestStatus): R<"GET /requests"> => get("/requests", { status }),
      get: (requestId: string): R<"GET /requests/:requestId"> => get(`/requests/${id(requestId)}`),
      cancel: (requestId: string): R<"POST /requests/:requestId/cancel"> => post(`/requests/${id(requestId)}/cancel`),
      matches: (requestId: string): R<"GET /requests/:requestId/matches"> => get(`/requests/${id(requestId)}/matches`),
    },

    jobs: {
      available: (): R<"GET /jobs/available"> => get("/jobs/available"),
      acceptOffer: (offerId: string): R<"POST /jobs/offers/:offerId/accept"> => post(`/jobs/offers/${id(offerId)}/accept`),
      declineOffer: (offerId: string): R<"POST /jobs/offers/:offerId/decline"> => post(`/jobs/offers/${id(offerId)}/decline`),
      list: (status?: JobStatus): R<"GET /jobs"> => get("/jobs", { status }),
      get: (jobId: string): R<"GET /jobs/:jobId"> => get(`/jobs/${id(jobId)}`),
      updateStatus: (jobId: string, status: JobStatus, opts: { reason?: string; arrivalCode?: string } = {}): R<"PATCH /jobs/:jobId/status"> =>
        patch(`/jobs/${id(jobId)}/status`, { status, ...opts }),
      /** "I've Arrived", with the 4-digit code the customer reads out. */
      arrive: (jobId: string, arrivalCode: string): R<"PATCH /jobs/:jobId/status"> =>
        patch(`/jobs/${id(jobId)}/status`, { status: "ARRIVED", arrivalCode }),
      messages: (jobId: string): R<"GET /jobs/:jobId/messages"> => get(`/jobs/${id(jobId)}/messages`),
      sendMessage: (jobId: string, content: string): R<"POST /jobs/:jobId/messages"> => post(`/jobs/${id(jobId)}/messages`, { content }),
      rate: (jobId: string, body: In<typeof createRatingSchema>): R<"POST /jobs/:jobId/rating"> => post(`/jobs/${id(jobId)}/rating`, body),
    },

    notifications: {
      list: (unreadOnly = false): R<"GET /notifications"> => get("/notifications", { unread: unreadOnly ? "true" : undefined }),
      markRead: (notificationId: string): R<"POST /notifications/:notificationId/read"> =>
        post(`/notifications/${id(notificationId)}/read`),
      markAllRead: (): R<"POST /notifications/read-all"> => post("/notifications/read-all"),
    },

    admin: {
      stats: (): R<"GET /admin/stats"> => get("/admin/stats"),
      requests: (status?: ServiceRequestStatus): R<"GET /admin/requests"> => get("/admin/requests", { status }),
      jobs: (status?: JobStatus): R<"GET /admin/jobs"> => get("/admin/jobs", { status }),
      workers: (): R<"GET /admin/workers"> => get("/admin/workers"),
      customers: (): R<"GET /admin/customers"> => get("/admin/customers"),
      setVerification: (workerId: string, verificationStatus: VerificationStatus): R<"PATCH /admin/workers/:workerId/verification"> =>
        patch(`/admin/workers/${id(workerId)}/verification`, { verificationStatus }),
      /** Puts the database back to the starting demo data. */
      resetDemo: (): R<"POST /admin/demo/reset"> => post("/admin/demo/reset"),
      autopilot: (): R<"GET /admin/demo/autopilot"> => get("/admin/demo/autopilot"),
      /** Turns on the fake worker that accepts new requests and walks them through to done. */
      setAutopilot: (body: SetAutopilotBody): R<"PUT /admin/demo/autopilot"> => put("/admin/demo/autopilot", body),
    },

    realtime: {
      eventsUrl: (lastEventId?: string) =>
        `${base}/events?token=${encodeURIComponent(token ?? "")}${lastEventId ? `&lastEventId=${encodeURIComponent(lastEventId)}` : ""}`,
      websocketUrl: (lastEventId?: string) =>
        `${base.replace(/^http/, "ws")}/ws?token=${encodeURIComponent(token ?? "")}${lastEventId ? `&lastEventId=${encodeURIComponent(lastEventId)}` : ""}`,
      /**
       * Calls `onEvent` for every live event for the logged-in user and returns
       * a function that disconnects. Uses SSE by default; pass `transport: "ws"`
       * for WebSocket. Both reconnect on their own and replay anything missed
       * while disconnected. If the gap can't be replayed, `onResync` is called:
       * refetch whatever is on screen.
       */
      subscribe(
        onEvent: (event: RealtimeEvent) => void,
        opts: { transport?: "sse" | "ws"; onOpen?: () => void; onResync?: () => void } = {},
      ): () => void {
        let lastEventId: string | undefined;
        const handle = (raw: string) => {
          const msg = JSON.parse(raw) as RealtimeMessage;
          if (msg.type === "CONNECTED") opts.onOpen?.();
          else if (msg.type === "RESYNC") opts.onResync?.();
          else {
            lastEventId = msg.id;
            onEvent(msg);
          }
        };
        const g = globalThis as unknown as Record<string, unknown>;
        const timers = globalThis as unknown as {
          setTimeout(cb: () => void, ms: number): unknown;
          clearTimeout(handle: unknown): void;
        };

        if (opts.transport === "ws") {
          const WS = g.WebSocket as new (url: string) => {
            onmessage: ((e: { data: unknown }) => void) | null;
            onclose: ((e: { code: number }) => void) | null;
            close(): void;
          };
          let stopped = false;
          let attempt = 0;
          let socket: InstanceType<typeof WS> | undefined;
          let retry: unknown;
          const connect = () => {
            socket = new WS(this.websocketUrl(lastEventId));
            socket.onmessage = (e) => {
              attempt = 0;
              handle(String(e.data));
            };
            socket.onclose = (e) => {
              // 4401 = bad token; reconnecting won't help.
              if (stopped || e.code === 4401) return;
              retry = timers.setTimeout(connect, Math.min(10_000, 500 * 2 ** attempt++));
            };
          };
          connect();
          return () => {
            stopped = true;
            timers.clearTimeout(retry);
            socket?.close();
          };
        }

        // EventSource reconnects by itself and sends Last-Event-ID for us.
        const ES = g.EventSource as new (url: string) => {
          onmessage: ((e: { data: string }) => void) | null;
          close(): void;
        };
        const source = new ES(this.eventsUrl());
        source.onmessage = (e) => handle(e.data);
        return () => source.close();
      },
    },
  };
}
