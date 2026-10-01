import { AppError } from '../../../shared/errors.ts'
import { COSYVOICE_MODEL_ID, MOSS_MODEL_ID, SILICONFLOW_VOICES, stripVoicePrefix } from '../../../shared/models.ts'
import { splitText } from '../../../shared/text-split.ts'
import { mapLimit } from '../../../shared/concurrency.ts'
import { concatBuffers } from '../../lib/buffers.ts'
import type { TtsProvider } from '../tts/types.ts'
import type { SiliconflowClient } from './client.ts'

// Long CosyVoice2 requests take tens of seconds; shorter chunks run in parallel and finish sooner.
const COSYVOICE_CHUNK_CHARS = 500
const CONCURRENCY = 3
const END_OF_PROMPT = '<|endofprompt|>'

export function createSiliconflowTtsProvider(client: SiliconflowClient, apiKey: string, model: string): TtsProvider {
  return {
    async synthesize(request) {
      const name = stripVoicePrefix(request.voice)
      if (!SILICONFLOW_VOICES.some((v) => v.id === name)) {
        throw new AppError('invalid_request', `Unknown voice for ${model}: ${name.slice(0, 40)}`)
      }
      const voice = `${model}:${name}`
      const send = (input: string) => client.speech(apiKey, { model, input, voice, speed: request.speed })

      if (model === MOSS_MODEL_ID) {
        // MOSS-TTSD needs speaker tags; plain text is treated as a single speaker.
        return send(/\[S\d+\]/.test(request.text) ? request.text : `[S1]${request.text}`)
      }

      if (model !== COSYVOICE_MODEL_ID) throw new AppError('unsupported_model', `Unsupported model: ${model}`)
      if (request.text.includes('<|') || request.instructions?.includes('<|')) {
        throw new AppError('invalid_request', 'Text and instructions must not contain "<|" control tokens.')
      }
      const prefix = request.instructions ? `${request.instructions}${END_OF_PROMPT}` : ''
      const parts = await mapLimit(splitText(request.text, COSYVOICE_CHUNK_CHARS), CONCURRENCY, (chunk) =>
        send(prefix + chunk),
      )
      if (parts.length === 0) throw new AppError('invalid_request', 'Input text is empty.')
      return concatBuffers(parts)
    },
  }
}
