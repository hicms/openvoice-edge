import type { VoiceInfo } from '../../shared/models.ts'
import edgeVoices from './edge-voices.json'

export const EDGE_VOICES: readonly VoiceInfo[] = edgeVoices as VoiceInfo[]

const byId = new Map(EDGE_VOICES.map((v) => [v.id, v]))

export function findEdgeVoice(id: string): VoiceInfo | undefined {
  return byId.get(id)
}
