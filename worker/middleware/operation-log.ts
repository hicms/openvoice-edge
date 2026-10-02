import { createMiddleware } from 'hono/factory'
import { AppError } from '../../shared/errors.ts'
import type { OperationKind, OperationLog } from '../../shared/operation-logs.ts'
import type { AppEnv } from '../env.ts'
import { saveOperationLog } from '../logs/operation-store.ts'

export function recordOperation(kind: OperationKind) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const started = performance.now()
    c.set('operationDetails', {})
    await next()

    const log: OperationLog = {
      ...c.get('operationDetails'),
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      kind,
      status: c.res.ok ? 'success' : 'failed',
      actor: { id: c.get('identity'), label: c.get('actorLabel') },
      durationMs: Math.max(0, Math.round(performance.now() - started)),
      ...(c.res.ok ? {} : { errorCode: c.error instanceof AppError ? c.error.code : 'internal_error' }),
    }
    try {
      // Await the single write so it finishes within the request lifetime; storage is best effort.
      await saveOperationLog(c.env.CONFIG, log)
    } catch (err) {
      console.error(JSON.stringify({ event: 'operation_log.write_failed', name: err instanceof Error ? err.name : typeof err }))
    }
  })
}
