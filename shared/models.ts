export type TtsProviderId = 'edge' | 'siliconflow'
export type Gender = 'female' | 'male'
export type SttScenario = 'fast' | 'dialect' | 'meeting'

export interface TtsModelInfo {
  id: string
  label: string
  provider: TtsProviderId
  capabilities: {
    speed: boolean
    pitch: boolean
    volume: boolean
    style: boolean
    /** CosyVoice2: natural-language tone instruction placed before `<|endofprompt|>`. */
    instruction: boolean
    /** MOSS-TTSD: multi-speaker script written as `[S1]...[S2]...`. */
    dialogue: boolean
  }
}

export interface SttModelInfo {
  id: string
  label: string
  scenario: SttScenario
  /** Whether upstream returns time-aligned segments. */
  timestamps: boolean
  /** Whether segments carry a speaker label. */
  speakers: boolean
}

export interface VoiceInfo {
  id: string
  name: string
  locale: string
  gender: Gender
  /** Edge voices only: speaking styles this voice accepts. */
  styles?: string[]
}

export const EDGE_MODEL_ID = 'edge-tts'
export const COSYVOICE_MODEL_ID = 'FunAudioLLM/CosyVoice2-0.5B'
export const MOSS_MODEL_ID = 'fnlp/MOSS-TTSD-v0.5'

export const TTS_MODELS: readonly TtsModelInfo[] = [
  {
    id: EDGE_MODEL_ID,
    label: 'Edge TTS',
    provider: 'edge',
    capabilities: { speed: true, pitch: true, volume: true, style: true, instruction: false, dialogue: false },
  },
  {
    id: COSYVOICE_MODEL_ID,
    label: 'CosyVoice2',
    provider: 'siliconflow',
    capabilities: { speed: true, pitch: false, volume: false, style: false, instruction: true, dialogue: false },
  },
  {
    id: MOSS_MODEL_ID,
    label: 'MOSS-TTSD',
    provider: 'siliconflow',
    capabilities: { speed: true, pitch: false, volume: false, style: false, instruction: false, dialogue: true },
  },
]

export const SENSEVOICE_MODEL_ID = 'FunAudioLLM/SenseVoiceSmall'
export const XINGCHEN_MODEL_ID = 'XingChenAGI/XingChenASR-V3.2'
export const XINGCHEN_DIARIZE_MODEL_ID = 'XingChenAGI/XingChenASR-Diarize-V3.0'

export const STT_MODELS: readonly SttModelInfo[] = [
  { id: SENSEVOICE_MODEL_ID, label: 'SenseVoice Small', scenario: 'fast', timestamps: false, speakers: false },
  { id: XINGCHEN_MODEL_ID, label: 'XingChenASR V3.2', scenario: 'dialect', timestamps: false, speakers: false },
  {
    id: XINGCHEN_DIARIZE_MODEL_ID,
    label: 'XingChenASR Diarize V3.0',
    scenario: 'meeting',
    timestamps: true,
    speakers: true,
  },
]

export const TTS_MODEL_IDS = TTS_MODELS.map((m) => m.id) as [string, ...string[]]
export const STT_MODEL_IDS = STT_MODELS.map((m) => m.id) as [string, ...string[]]

/** Preset voices SiliconFlow accepts for both CosyVoice2 and MOSS-TTSD (verified against the live API). */
export const SILICONFLOW_VOICES: readonly VoiceInfo[] = [
  { id: 'alex', name: 'Alex', locale: 'zh-CN', gender: 'male' },
  { id: 'benjamin', name: 'Benjamin', locale: 'zh-CN', gender: 'male' },
  { id: 'charles', name: 'Charles', locale: 'zh-CN', gender: 'male' },
  { id: 'david', name: 'David', locale: 'zh-CN', gender: 'male' },
  { id: 'anna', name: 'Anna', locale: 'zh-CN', gender: 'female' },
  { id: 'bella', name: 'Bella', locale: 'zh-CN', gender: 'female' },
  { id: 'claire', name: 'Claire', locale: 'zh-CN', gender: 'female' },
  { id: 'diana', name: 'Diana', locale: 'zh-CN', gender: 'female' },
]

export const DEFAULT_VOICES: Readonly<Record<string, string>> = {
  [EDGE_MODEL_ID]: 'zh-CN-XiaoxiaoNeural',
  [COSYVOICE_MODEL_ID]: 'alex',
  [MOSS_MODEL_ID]: 'alex',
}

export function findTtsModel(id: string): TtsModelInfo | undefined {
  return TTS_MODELS.find((m) => m.id === id)
}

export function findSttModel(id: string): SttModelInfo | undefined {
  return STT_MODELS.find((m) => m.id === id)
}

/** Accepts both `alex` and SiliconFlow's `<model>:alex` spelling. */
export function stripVoicePrefix(voice: string): string {
  const i = voice.lastIndexOf(':')
  return i === -1 ? voice : voice.slice(i + 1)
}
