import { createMiddleware } from 'hono/factory'
import type { z } from 'zod'
import { AppError } from '../../shared/errors.ts'
import type { AppEnv } from '../env.ts'

/** Same-origin deployment: no CORS headers are ever added, and nothing is cached. */
export const apiHeaders = createMiddleware<AppEnv>(async (c, next) => {
  await next()
  c.res.headers.set('Cache-Control', 'no-store')
  c.res.headers.set('X-Content-Type-Options', 'nosniff')
})

export function errorResponse(err: unknown): Response {
  const appError = err instanceof AppError ? err : new AppError('internal_error', 'Unexpected server error.')
  if (!(err instanceof AppError)) {
    // Name only: messages from upstream libraries may echo request content.
    console.error(JSON.stringify({ event: 'unhandled_error', name: err instanceof Error ? err.name : typeof err }))
  }
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (appError.status === 429) headers.set('Retry-After', '60')
  return new Response(JSON.stringify(appError.toBody()), { status: appError.status, headers })
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new AppError('invalid_request', 'Request body must be valid JSON.')
  }
}

/** Parses with zod and reports field paths only, never the submitted values. */
export function parseWith<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input)
  if (result.success) return result.data
  const detail = result.error.issues
    .slice(0, 5)
    .map((i) => `${i.path.map(String).join('.') || 'body'}: ${i.message}`)
    .join('; ')
  throw new AppError('invalid_request', detail)
}
