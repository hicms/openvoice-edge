import { z } from 'zod'
import { DEFAULT_VOICES, EDGE_MODEL_ID, SENSEVOICE_MODEL_ID, STT_MODEL_IDS, TTS_MODEL_IDS } from './models.ts'
import type { SttModelInfo, TtsModelInfo, VoiceInfo } from './models.ts'

export const HARD_MAX_AUDIO_MB = 50
export const HARD_MAX_TTS_CHARS = 30000

export const SpeechRequestSchema = z.object({
  model: z.string().optional(),
  input: z.string().min(1),
  voice: z.string().min(1).max(100).optional(),
  speed: z.number().min(0.25).max(4).optional(),
  /** Percent offset, -50..50. */
  pitch: z.number().int().min(-50).max(50).optional(),
  /** Percent offset, -50..50. */
  volume: z.number().int().min(-50).max(50).optional(),
  style: z.string().min(1).max(40).optional(),
  /** CosyVoice2 tone instruction. */
  instructions: z.string().min(1).max(200).optional(),
  response_format: z.literal('mp3').optional(),
})
export type SpeechRequest = z.infer<typeof SpeechRequestSchema>

export const TRANSCRIPTION_FORMATS = ['json', 'text', 'verbose_json', 'srt', 'vtt'] as const
export type TranscriptionFormat = (typeof TRANSCRIPTION_FORMATS)[number]

export const TranscriptionFieldsSchema = z.object({
  model: z.string().optional(),
  response_format: z.enum(TRANSCRIPTION_FORMATS).default('json'),
})

export const AppSettingsSchema = z.object({
  defaultTtsModel: z.enum(TTS_MODEL_IDS),
  defaultSttModel: z.enum(STT_MODEL_IDS),
  defaultVoices: z.record(z.string(), z.string().min(1).max(100)),
  maxTtsChars: z.number().int().min(100).max(HARD_MAX_TTS_CHARS),
  maxAudioMb: z.number().int().min(1).max(HARD_MAX_AUDIO_MB),
})
export type AppSettings = z.infer<typeof AppSettingsSchema>

export const DEFAULT_SETTINGS: AppSettings = {
  defaultTtsModel: EDGE_MODEL_ID,
  defaultSttModel: SENSEVOICE_MODEL_ID,
  defaultVoices: { ...DEFAULT_VOICES },
  maxTtsChars: 5000,
  maxAudioMb: 25,
}

export const AdminConfigUpdateSchema = AppSettingsSchema.partial().extend({
  /** Empty string keeps the stored key; use the dedicated DELETE endpoint to clear it. */
  siliconflowApiKey: z.string().max(300).optional(),
})
export type AdminConfigUpdate = z.infer<typeof AdminConfigUpdateSchema>

export const CreateAccessKeySchema = z.object({ label: z.string().trim().min(1).max(40) })

export interface SiliconflowKeyStatus {
  configured: boolean
  last4?: string
  source: 'kv' | 'env' | 'none'
}

export interface AdminConfigView {
  settings: AppSettings
  siliconflow: SiliconflowKeyStatus
}

export interface AccessKeyView {
  id: string
  label: string
  createdAt: string
}

export interface CreatedAccessKey extends AccessKeyView {
  /** Shown once; only its hash is stored. */
  key: string
}

export type Role = 'admin' | 'user'

export interface PublicTtsModel extends TtsModelInfo {
  available: boolean
}

export interface PublicSttModel extends SttModelInfo {
  available: boolean
}

export interface PublicConfig {
  ttsModels: PublicTtsModel[]
  sttModels: PublicSttModel[]
  defaults: Pick<AppSettings, 'defaultTtsModel' | 'defaultSttModel' | 'defaultVoices'>
  limits: { maxTtsChars: number; maxAudioMb: number }
}

export interface VoicesResponse {
  model: string
  voices: VoiceInfo[]
}
