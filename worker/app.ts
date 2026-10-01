import { Hono } from 'hono'
import { AppError } from '../shared/errors.ts'
import type { AppEnv } from './env.ts'
import { authenticate, requireAdmin } from './middleware/auth.ts'
import { apiHeaders, errorResponse } from './middleware/http.ts'
import { createDeps } from './providers/registry.ts'
import { adminRoutes } from './routes/admin.ts'
import { catalogRoutes } from './routes/catalog.ts'
import { createSpeechRoutes } from './routes/speech.ts'
import { createTranscriptionRoutes } from './routes/transcriptions.ts'

export interface AppOptions {
  /** Replaces the global fetch for every upstream call; tests use it to fake Edge and SiliconFlow. */
  fetch?: typeof fetch
}

export function createApp(options: AppOptions = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>()
  const deps = createDeps(options.fetch)

  app.use('/v1/*', apiHeaders)
  app.use('/api/*', apiHeaders)

  // Registered before the auth middleware so it stays public.
  app.get('/api/health', (c) => c.json({ ok: true }))

  app.use('/v1/*', authenticate)
  app.use('/api/*', authenticate)
  app.use('/api/admin/*', requireAdmin)

  app.get('/api/session', (c) => c.json({ role: c.get('role') }))
  app.route('/api/admin', adminRoutes)
  app.route('/v1', createSpeechRoutes(deps))
  app.route('/v1', createTranscriptionRoutes(deps))
  app.route('/', catalogRoutes)

  app.notFound(() => errorResponse(new AppError('not_found', 'Route not found.')))
  app.onError((err) => errorResponse(err))
  return app
}
