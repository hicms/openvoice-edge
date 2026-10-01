import { Hono } from 'hono'
import { DEFAULT_VOICES } from '../../shared/models.ts'
import type { PublicConfig } from '../../shared/schemas.ts'
import { ConfigStore } from '../config/store.ts'
import type { AppEnv } from '../env.ts'
import { availableModels } from '../providers/registry.ts'

export const catalogRoutes = new Hono<AppEnv>()
  .get('/v1/models', async (c) => {
    const { tts, stt } = await availableModels(new ConfigStore(c.env))
    const entry = (id: string, type: 'tts' | 'stt') => ({ id, object: 'model', owned_by: 'openvoice-edge', type })
    return c.json({ object: 'list', data: [...tts.map((m) => entry(m.id, 'tts')), ...stt.map((m) => entry(m.id, 'stt'))] })
  })
  .get('/api/config', async (c) => {
    const store = new ConfigStore(c.env)
    const [settings, { tts, stt }] = await Promise.all([store.getSettings(), availableModels(store)])
    // The configured default may need a key that is no longer set; fall back to something that works.
    const defaultTtsModel = tts.some((m) => m.id === settings.defaultTtsModel) ? settings.defaultTtsModel : tts[0]!.id
    const defaultSttModel = stt.some((m) => m.id === settings.defaultSttModel) ? settings.defaultSttModel : (stt[0]?.id ?? '')
    const body: PublicConfig = {
      ttsModels: tts,
      sttModels: stt,
      defaults: { defaultTtsModel, defaultSttModel, defaultVoices: { ...DEFAULT_VOICES, ...settings.defaultVoices } },
      limits: { maxTtsChars: settings.maxTtsChars, maxAudioMb: settings.maxAudioMb },
    }
    return c.json(body)
  })
