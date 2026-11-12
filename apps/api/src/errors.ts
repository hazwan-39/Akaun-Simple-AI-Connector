import { API_ERROR_MESSAGES_MS, type ApiErrorCode } from "@akaun/shared";

const STATUS: Record<ApiErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  RATE_LIMITED: 429,
  QUOTA_EXCEEDED: 429,
  INVALID_REQUEST: 400,
  INCONSISTENT_SUMMARY: 422,
  PAYLOAD_TOO_LARGE: 413,
  AI_TIMEOUT: 504,
  AI_PROVIDER_ERROR: 502,
  AI_INVALID_RESPONSE: 502,
  AI_REFUSED: 502,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
};

/** An error that is safe to show to the client (message is generic, in Bahasa Melayu). */
export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ApiErrorCode,
    /** Internal detail for logs only – never sent to the client. */
    readonly internalDetail?: string,
  ) {
    super(API_ERROR_MESSAGES_MS[code]);
    this.status = STATUS[code];
  }
}
