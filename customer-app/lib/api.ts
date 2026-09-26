import { API_BASE_URL, USE_MOCK_API } from "./config";
import type {
  AIResponse,
  CustomerProfileDTO,
  HistoryEntryDTO,
  JobDTO,
  JobMessageDTO,
  ServerEvent,
  ServiceRequestDTO,
  UserDTO,
} from "./types";
import {
  mockConfirmRequest,
  mockGetHistory,
  mockGetJob,
  mockGetJobForRequest,
  mockGetJobMessages,
  mockGetRequest,
  mockSendChatMessage,
  mockSendJobMessage,
  mockSubscribeJob,
} from "./mockBackend";

/**
 * This is the ONLY file in /apps/customer that should know the
 * difference between a mock and a real backend call. Every page and
 * component talks to the functions exported here, never to `fetch`
 * or the mock module directly. 
 *
 * All routes below match the contract in the project spec exactly.
 * keep them in sync with `/packages/contracts` rather than improvising.
 */

function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const token = window.localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API error ${res.status}: ${body || res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---------- Auth ----------

export async function signup(input: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
}): Promise<{ user: UserDTO; token: string }> {
  if (USE_MOCK_API) {
    const user: UserDTO = {
      id: "customer_demo_1",
      role: "CUSTOMER",
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
    };
    return { user, token: "mock_token" };
  }
  return request("/auth/signup", { method: "POST", body: JSON.stringify(input) });
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<{ user: UserDTO; token: string }> {
  if (USE_MOCK_API) {
    const user: UserDTO = {
      id: "customer_demo_1",
      role: "CUSTOMER",
      firstName: "Pat",
      lastName: "Miller",
      email: input.email,
      phone: "555-0100",
    };
    return { user, token: "mock_token" };
  }
  return request("/auth/login", { method: "POST", body: JSON.stringify(input) });
}

export async function logout(): Promise<void> {
  if (USE_MOCK_API) return;
  return request("/auth/logout", { method: "POST" });
}

export async function getMe(): Promise<UserDTO> {
  if (USE_MOCK_API) {
    return {
      id: "customer_demo_1",
      role: "CUSTOMER",
      firstName: "Pat",
      lastName: "Miller",
      email: "pat@example.com",
      phone: "555-0100",
    };
  }
  return request("/auth/me");
}

// AI chat

export async function sendChatMessage(
  conversationId: string,
  message: string
): Promise<AIResponse> {
  if (USE_MOCK_API) return mockSendChatMessage(conversationId, message);
  return request(`/ai/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

// Requests and jobs

export async function confirmServiceRequest(
  customerId: string,
  conversationId: string,
  draft: Partial<ServiceRequestDTO>
): Promise<ServiceRequestDTO> {
  if (USE_MOCK_API)
    return mockConfirmRequest(customerId, conversationId, draft);
  return request(`/requests`, {
    method: "POST",
    body: JSON.stringify({ conversationId, ...draft }),
  });
}

export async function getRequest(
  requestId: string
): Promise<ServiceRequestDTO> {
  if (USE_MOCK_API) {
    const r = await mockGetRequest(requestId);
    if (!r) throw new Error("Request not found");
    return r;
  }
  return request(`/requests/${requestId}`);
}

export async function getJobForRequest(
  requestId: string
): Promise<JobDTO | undefined> {
  if (USE_MOCK_API) return mockGetJobForRequest(requestId);
  return request(`/requests/${requestId}/job`);
}

export async function getJob(jobId: string): Promise<JobDTO> {
  if (USE_MOCK_API) {
    const j = await mockGetJob(jobId);
    if (!j) throw new Error("Job not found");
    return j;
  }
  return request(`/jobs/${jobId}`);
}

export async function sendJobMessage(
  jobId: string,
  content: string
): Promise<JobMessageDTO> {
  if (USE_MOCK_API)
    return mockSendJobMessage(jobId, "customer_demo_1", content);
  return request(`/jobs/${jobId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

export async function getJobMessages(jobId: string): Promise<JobMessageDTO[]> {
  if (USE_MOCK_API) return mockGetJobMessages(jobId);
  return request(`/jobs/${jobId}/messages`);
}

export async function rateJob(
  jobId: string,
  score: number,
  comment?: string
): Promise<void> {
  if (USE_MOCK_API) return;
  return request(`/jobs/${jobId}/rating`, {
    method: "POST",
    body: JSON.stringify({ score, comment }),
  });
}

export async function getHistory(): Promise<HistoryEntryDTO[]> {
  if (USE_MOCK_API) return mockGetHistory();
  return request(`/customers/me/history`);
}

export async function getProfile(): Promise<CustomerProfileDTO> {
  if (USE_MOCK_API) {
    return {
      userId: "customer_demo_1",
      address: "123 Main Street",
      accessibilityPreferences: "",
      emergencyContact: "",
      communicationPreferences: "text",
    };
  }
  return request(`/customers/me/profile`);
}

export async function updateProfile(
  profile: Partial<CustomerProfileDTO>
): Promise<CustomerProfileDTO> {
  if (USE_MOCK_API) {
    return { userId: "customer_demo_1", address: "", ...profile };
  }
  return request(`/customers/me/profile`, {
    method: "PATCH",
    body: JSON.stringify(profile),
  });
}

// Job events

export function subscribeToJob(
  jobId: string,
  onEvent: (event: ServerEvent) => void
): () => void {
  if (USE_MOCK_API) return mockSubscribeJob(jobId, onEvent);

  const source = new EventSource(
    `${API_BASE_URL}/jobs/${jobId}/events`,
    { withCredentials: true } as EventSourceInit
  );
  source.onmessage = (e) => {
    try {
      onEvent(JSON.parse(e.data) as ServerEvent);
    } catch {
      
    }
  };
  return () => source.close();
}
