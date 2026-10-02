import { Hono } from 'hono'
import { AppError } from '../../shared/errors.ts'
import { DEFAULT_VOICES, SILICONFLOW_VOICES, findTtsModel } from '../../shared/models.ts'
import type { VoicesResponse } from '../../shared/schemas.ts'
import { SpeechRequestSchema } from '../../shared/schemas.ts'
import { ConfigStore } from '../config/store.ts'
import { EDGE_VOICES } from '../data/voices.ts'
import type { AppEnv } from '../env.ts'
import { parseWith, readJson } from '../middleware/http.ts'
import { recordOperation } from '../middleware/operation-log.ts'
import { resolveTtsProvider, type Deps } from '../providers/registry.ts'

/** 30k characters is roughly 100 KB of JSON; anything larger is not a legitimate request. */
const MAX_BODY_BYTES = 256 * 1024

export function createSpeechRoutes(deps: Deps) {
  return new Hono<AppEnv>()
    .post('/audio/speech', recordOperation('speech'), async (c) => {
      const declared = Number(c.req.header('Content-Length') ?? 0)
      if (declared > MAX_BODY_BYTES) throw new AppError('invalid_request', 'Request body is too large.')
      const request = parseWith(SpeechRequestSchema, await readJson(c.req.raw))
      c.get('operationDetails').inputChars = request.input.trim().length

      const store = new ConfigStore(c.env)
      const settings = await store.getSettings()
      const modelId = request.model ?? settings.defaultTtsModel
      const model = findTtsModel(modelId)
      if (!model) throw new AppError('unsupported_model', `Unsupported TTS model: ${modelId.slice(0, 60)}`)
      c.get('operationDetails').model = model.id

      const text = request.input.trim()
      if (!text) throw new AppError('invalid_request', 'Input text is empty.')
      if (text.length > settings.maxTtsChars) {
        throw new AppError('text_too_long', `Text has ${text.length} characters; the limit is ${settings.maxTtsChars}.`)
      }

      const provider = await resolveTtsProvider(model, store, deps)
      const audio = await provider.synthesize({
        text,
        voice: request.voice ?? settings.defaultVoices[model.id] ?? DEFAULT_VOICES[model.id]!,
        speed: request.speed,
        pitch: model.capabilities.pitch ? request.pitch : undefined,
        volume: model.capabilities.volume ? request.volume : undefined,
        style: model.capabilities.style ? request.style : undefined,
        instructions: model.capabilities.instruction ? request.instructions : undefined,
      })
      return new Response(audio, { headers: { 'Content-Type': 'audio/mpeg' } })
    })
    .get('/voices', async (c) => {
      const settings = await new ConfigStore(c.env).getSettings()
      const modelId = c.req.query('model') ?? settings.defaultTtsModel
      const model = findTtsModel(modelId)
      if (!model) throw new AppError('unsupported_model', `Unsupported TTS model: ${modelId.slice(0, 60)}`)
      const body: VoicesResponse = {
        model: model.id,
        voices: model.provider === 'edge' ? [...EDGE_VOICES] : [...SILICONFLOW_VOICES],
      }
      return c.json(body)
    })
}
