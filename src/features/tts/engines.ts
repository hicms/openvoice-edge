import { COSYVOICE_MODEL_ID, EDGE_MODEL_ID, MOSS_MODEL_ID } from '../../../shared/models.ts'

/** i18n keys cannot contain "." and model ids do ("CosyVoice2-0.5B"), so copy is keyed by a short name. */
export const ENGINE_KEYS = {
  [EDGE_MODEL_ID]: 'edge',
  [COSYVOICE_MODEL_ID]: 'cosyvoice',
  [MOSS_MODEL_ID]: 'moss',
} as const

export type EngineKey = (typeof ENGINE_KEYS)[keyof typeof ENGINE_KEYS]

export function engineKey(modelId: string): EngineKey {
  return ENGINE_KEYS[modelId as keyof typeof ENGINE_KEYS] ?? 'edge'
}
