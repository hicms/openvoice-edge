import { Hono } from 'hono'
import { AppError } from '../shared/errors.ts'
import type { AppEnv } from './env.ts'
import { authenticate, requireAdmin } from './middleware/auth.ts'
import { apiHeaders, errorResponse } from './middleware/http.ts'
import { adminRoutes } from './routes/admin.ts'

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>()

  app.use('/v1/*', apiHeaders)
  app.use('/api/*', apiHeaders)

  // Registered before the auth middleware so it stays public.
  app.get('/api/health', (c) => c.json({ ok: true }))

  app.use('/v1/*', authenticate)
  app.use('/api/*', authenticate)
  app.use('/api/admin/*', requireAdmin)

  app.get('/api/session', (c) => c.json({ role: c.get('role') }))
  app.route('/api/admin', adminRoutes)

  app.notFound(() => errorResponse(new AppError('not_found', 'Route not found.')))
  app.onError((err) => errorResponse(err))
  return app
}
