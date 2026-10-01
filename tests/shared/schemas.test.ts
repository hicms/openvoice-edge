import { describe, expect, it } from 'vitest'
import { AppError, ERROR_STATUS } from '../../shared/errors.ts'
import {
  DEFAULT_VOICES,
  EDGE_MODEL_ID,
  STT_MODELS,
  SILICONFLOW_VOICES,
  TTS_MODELS,
  findSttModel,
  stripVoicePrefix,
} from '../../shared/models.ts'
import {
  AdminConfigUpdateSchema,
  AppSettingsSchema,
  DEFAULT_SETTINGS,
  HARD_MAX_AUDIO_MB,
  SpeechRequestSchema,
  TranscriptionFieldsSchema,
} from '../../shared/schemas.ts'

describe('error model', () => {
  it('serialises to the OpenAI-style envelope with the mapped status', () => {
    const err = new AppError('file_too_large', 'too big')
    expect(err.status).toBe(413)
    expect(err.toBody()).toEqual({
      error: { message: 'too big', type: 'invalid_request_error', code: 'file_too_large' },
    })
  })

  it('maps every code to an HTTP status', () => {
    for (const code of Object.keys(ERROR_STATUS) as (keyof typeof ERROR_STATUS)[]) {
      expect(new AppError(code, 'x').toBody().error.type).toBeTruthy()
    }
  })
})

describe('model registry', () => {
  it('has unique ids and a default voice per TTS model', () => {
    const ids = [...TTS_MODELS, ...STT_MODELS].map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const m of TTS_MODELS) expect(DEFAULT_VOICES[m.id]).toBeTruthy()
  })

  it('only the diarize model reports speakers and timestamps', () => {
    expect(STT_MODELS.filter((m) => m.speakers).map((m) => m.scenario)).toEqual(['meeting'])
    expect(findSttModel('nope')).toBeUndefined()
  })

  it('default SiliconFlow voices exist in the preset list', () => {
    for (const m of TTS_MODELS.filter((m) => m.provider === 'siliconflow')) {
      expect(SILICONFLOW_VOICES.some((v) => v.id === DEFAULT_VOICES[m.id])).toBe(true)
    }
  })

  it('strips the model prefix from SiliconFlow voice names', () => {
    expect(stripVoicePrefix('FunAudioLLM/CosyVoice2-0.5B:alex')).toBe('alex')
    expect(stripVoicePrefix('alex')).toBe('alex')
  })
})

describe('schemas', () => {
  it('accepts a minimal speech request and rejects bad ranges', () => {
    expect(SpeechRequestSchema.safeParse({ input: 'hi' }).success).toBe(true)
    expect(SpeechRequestSchema.safeParse({ input: '' }).success).toBe(false)
    expect(SpeechRequestSchema.safeParse({ input: 'hi', speed: 5 }).success).toBe(false)
    expect(SpeechRequestSchema.safeParse({ input: 'hi', pitch: 60 }).success).toBe(false)
    expect(SpeechRequestSchema.safeParse({ input: 'hi', response_format: 'wav' }).success).toBe(false)
  })

  it('defaults the transcription response format to json', () => {
    expect(TranscriptionFieldsSchema.parse({}).response_format).toBe('json')
    expect(TranscriptionFieldsSchema.safeParse({ response_format: 'xml' }).success).toBe(false)
  })

  it('default settings are valid', () => {
    expect(AppSettingsSchema.safeParse(DEFAULT_SETTINGS).success).toBe(true)
    expect(DEFAULT_SETTINGS.defaultTtsModel).toBe(EDGE_MODEL_ID)
  })

  it('enforces limits on admin updates', () => {
    expect(AdminConfigUpdateSchema.safeParse({ maxAudioMb: HARD_MAX_AUDIO_MB }).success).toBe(true)
    expect(AdminConfigUpdateSchema.safeParse({ maxAudioMb: HARD_MAX_AUDIO_MB + 1 }).success).toBe(false)
    expect(AdminConfigUpdateSchema.safeParse({ maxTtsChars: 10 }).success).toBe(false)
    expect(AdminConfigUpdateSchema.safeParse({ defaultTtsModel: 'gpt-4o' }).success).toBe(false)
    expect(AdminConfigUpdateSchema.safeParse({}).success).toBe(true)
  })
})
