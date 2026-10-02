import { Hono } from 'hono'
import { AppError } from '../../shared/errors.ts'
import { findSttModel } from '../../shared/models.ts'
import { TranscriptionFieldsSchema } from '../../shared/schemas.ts'
import { formatTranscript } from '../../shared/subtitles.ts'
import { ConfigStore } from '../config/store.ts'
import type { AppEnv } from '../env.ts'
import { parseWith } from '../middleware/http.ts'
import { recordOperation } from '../middleware/operation-log.ts'
import { requireSiliconflowKey, type Deps } from '../providers/registry.ts'
import { normalizeTranscription } from '../providers/siliconflow/stt.ts'

const MB = 1024 * 1024
/** Multipart framing and the other form fields on top of the file itself. */
const FORM_OVERHEAD = MB

export function createTranscriptionRoutes(deps: Deps) {
  return new Hono<AppEnv>().post('/audio/transcriptions', recordOperation('transcription'), async (c) => {
    const store = new ConfigStore(c.env)
    const settings = await store.getSettings()
    const limit = settings.maxAudioMb * MB

    // Checked before reading the body: the Worker buffers multipart uploads in memory.
    const declared = c.req.header('Content-Length')
    if (declared === undefined) throw new AppError('invalid_request', 'Content-Length is required for uploads.')
    if (Number(declared) > limit + FORM_OVERHEAD) {
      throw new AppError('file_too_large', `Audio is larger than the ${settings.maxAudioMb} MB limit.`)
    }

    let form: FormData
    try {
      form = await c.req.raw.formData()
    } catch {
      throw new AppError('invalid_request', 'Request body must be multipart/form-data.')
    }
    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0) throw new AppError('invalid_request', 'A non-empty "file" field is required.')
    c.get('operationDetails').audioBytes = file.size
    if (file.size > limit) throw new AppError('file_too_large', `Audio is larger than the ${settings.maxAudioMb} MB limit.`)

    const field = (name: string) => {
      const value = form.get(name)
      return typeof value === 'string' ? value : undefined
    }
    const fields = parseWith(TranscriptionFieldsSchema, { model: field('model'), response_format: field('response_format') })
    const modelId = fields.model ?? settings.defaultSttModel
    const model = findSttModel(modelId)
    if (!model) throw new AppError('unsupported_model', `Unsupported transcription model: ${modelId.slice(0, 60)}`)
    c.get('operationDetails').model = model.id
    if ((fields.response_format === 'srt' || fields.response_format === 'vtt') && !model.timestamps) {
      // Fail before the upstream call so a request that cannot succeed is never billed.
      throw new AppError('no_timestamps', `${model.label} does not return timestamps; use a meeting model for subtitles.`)
    }

    const apiKey = await requireSiliconflowKey(store)
    const transcript = normalizeTranscription(await deps.siliconflow.transcribe(apiKey, file, model.id))
    const { contentType, body } = formatTranscript(transcript, fields.response_format)
    return new Response(body, { headers: { 'Content-Type': contentType } })
  })
}
