export const ERROR_STATUS = {
  invalid_request: 400,
  text_too_long: 400,
  unsupported_model: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  file_too_large: 413,
  no_timestamps: 422,
  rate_limited: 429,
  upstream_rate_limited: 429,
  upstream_auth_failed: 502,
  upstream_insufficient_balance: 502,
  upstream_error: 502,
  server_not_configured: 503,
  engine_unavailable: 503,
  internal_error: 500,
} as const

export type ErrorCode = keyof typeof ERROR_STATUS
export type ErrorStatus = (typeof ERROR_STATUS)[ErrorCode]

export type ErrorType =
  | 'invalid_request_error'
  | 'authentication_error'
  | 'permission_error'
  | 'rate_limit_error'
  | 'api_error'

const ERROR_TYPE: Record<ErrorCode, ErrorType> = {
  invalid_request: 'invalid_request_error',
  text_too_long: 'invalid_request_error',
  unsupported_model: 'invalid_request_error',
  unauthorized: 'authentication_error',
  forbidden: 'permission_error',
  not_found: 'invalid_request_error',
  file_too_large: 'invalid_request_error',
  no_timestamps: 'invalid_request_error',
  rate_limited: 'rate_limit_error',
  upstream_rate_limited: 'rate_limit_error',
  upstream_auth_failed: 'api_error',
  upstream_insufficient_balance: 'api_error',
  upstream_error: 'api_error',
  server_not_configured: 'api_error',
  engine_unavailable: 'api_error',
  internal_error: 'api_error',
}

export interface ApiErrorBody {
  error: { message: string; type: ErrorType; code: ErrorCode }
}

export class AppError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
  }

  get status(): ErrorStatus {
    return ERROR_STATUS[this.code]
  }

  toBody(): ApiErrorBody {
    return { error: { message: this.message, type: ERROR_TYPE[this.code], code: this.code } }
  }
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && value in ERROR_STATUS
}
