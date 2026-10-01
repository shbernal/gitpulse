import { GitHubApiError } from "../github/client";
import type { SnapshotError } from "../types";

/** The serializable error every result type carries; a rate limit names its reset time. */
export function toSnapshotError(error: unknown): SnapshotError {
  if (error instanceof GitHubApiError) {
    return {
      message: error.rateLimitReset ? `${error.message} Resets at ${error.rateLimitReset}.` : error.message,
      status: error.status,
      code: error.code,
    };
  }

  if (error instanceof Error) {
    return { message: error.message, code: error.name };
  }

  return { message: "Unknown error.", code: "unknown" };
}
