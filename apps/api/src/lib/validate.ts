import type { z } from "zod";
import { ApiError } from "./errors";

export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    throw new ApiError(
      "VALIDATION_FAILED",
      "Some of the information provided isn't valid.",
      result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return result.data;
}
