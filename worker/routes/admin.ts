import { Hono } from 'hono'
import { AppError } from '../../shared/errors.ts'
import { AdminConfigUpdateSchema, CreateAccessKeySchema } from '../../shared/schemas.ts'
import type { AdminConfigView } from '../../shared/schemas.ts'
import { createAccessKey, listAccessKeys, revokeAccessKey } from '../config/access-keys.ts'
import { ConfigStore } from '../config/store.ts'
import type { AppEnv } from '../env.ts'
import { parseWith, readJson } from '../middleware/http.ts'

/** Events carry names only, never values, so the log cannot leak secrets or user content. */
function audit(event: string, detail: Record<string, string | boolean> = {}): void {
  console.log(JSON.stringify({ event, ...detail }))
}

async function configView(store: ConfigStore): Promise<AdminConfigView> {
  const [settings, siliconflow] = await Promise.all([store.getSettings(), store.getSiliconflowStatus()])
  return { settings, siliconflow }
}

export const adminRoutes = new Hono<AppEnv>()
  .get('/config', async (c) => c.json(await configView(new ConfigStore(c.env))))
  .put('/config', async (c) => {
    const update = parseWith(AdminConfigUpdateSchema, await readJson(c.req.raw))
    const store = new ConfigStore(c.env)
    await store.updateSettings(update)
    audit('admin.config.update', { keyChanged: Boolean(update.siliconflowApiKey) })
    return c.json(await configView(store))
  })
  .delete('/config/siliconflow-key', async (c) => {
    const store = new ConfigStore(c.env)
    await store.clearSiliconflowKey()
    audit('admin.siliconflow_key.clear')
    return c.json(await configView(store))
  })
  .get('/keys', async (c) => c.json({ keys: await listAccessKeys(c.env.CONFIG) }))
  .post('/keys', async (c) => {
    const { label } = parseWith(CreateAccessKeySchema, await readJson(c.req.raw))
    const created = await createAccessKey(c.env.CONFIG, label)
    audit('admin.key.create', { id: created.id })
    return c.json(created, 201)
  })
  .delete('/keys/:id', async (c) => {
    const id = c.req.param('id')
    if (!(await revokeAccessKey(c.env.CONFIG, id))) throw new AppError('not_found', 'Access key not found.')
    audit('admin.key.revoke', { id })
    return c.body(null, 204)
  })
