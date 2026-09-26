import type { ApiErrorCode } from "@handy/contracts";

const STATUS: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_TRANSITION: 409,
  JOB_NO_LONGER_AVAILABLE: 409,
  SCHEDULE_CONFLICT: 409,
  INVALID_ARRIVAL_CODE: 400,
  TOO_MANY_ATTEMPTS: 429,
  REQUEST_INCOMPLETE: 422,
  POTENTIAL_EMERGENCY: 422,
  INTERNAL_ERROR: 500,
};

export class ApiError extends Error {
  readonly statusCode: number;
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.statusCode = STATUS[code];
  }
}

export const notFound = (what: string) => new ApiError("NOT_FOUND", `${what} not found.`);
export const forbidden = (message = "You don't have access to this.") => new ApiError("FORBIDDEN", message);
