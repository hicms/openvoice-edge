import { isErrorCode, type ApiErrorBody, type ErrorCode } from '../../shared/errors.ts'

export class ApiError extends Error {
  readonly code: ErrorCode | 'network' | 'aborted' | 'unknown'
  readonly status: number

  constructor(code: ApiError['code'], message: string, status = 0) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

interface AuthHooks {
  getToken: () => string | null
  onUnauthorized: () => void
}

let hooks: AuthHooks = { getToken: () => null, onUnauthorized: () => {} }

export function configureApi(next: AuthHooks): void {
  hooks = next
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  json?: unknown
  form?: FormData
  signal?: AbortSignal
  /** Use a specific key instead of the stored one (unlock check) and do not treat 401 as a sign-out. */
  token?: string
}

async function parseError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as Partial<ApiErrorBody>
    const code = body.error?.code
    if (isErrorCode(code)) return new ApiError(code, body.error?.message ?? res.statusText, res.status)
  } catch {
    // Not our JSON envelope (for example a gateway error page).
  }
  return new ApiError('unknown', res.statusText || `HTTP ${res.status}`, res.status)
}

export async function request(path: string, options: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = {}
  const token = options.token ?? hooks.getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  let body: BodyInit | undefined
  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.json)
  } else if (options.form) {
    body = options.form
  }

  let res: Response
  try {
    res = await fetch(path, { method: options.method ?? 'GET', headers, body, signal: options.signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw new ApiError('aborted', 'Request cancelled')
    throw new ApiError('network', 'Network error')
  }
  if (res.ok) return res
  const error = await parseError(res)
  if (res.status === 401 && options.token === undefined) hooks.onUnauthorized()
  throw error
}

export async function apiJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await request(path, options)
  return (res.status === 204 ? undefined : await res.json()) as T
}
