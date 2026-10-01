import { useEffect, useState } from 'react'
import type { VoiceInfo } from '../../../shared/models.ts'
import type { VoicesResponse } from '../../../shared/schemas.ts'
import { apiJson } from '@/lib/api'

const cache = new Map<string, Promise<VoiceInfo[]>>()

function loadVoices(model: string): Promise<VoiceInfo[]> {
  let pending = cache.get(model)
  if (!pending) {
    pending = apiJson<VoicesResponse>(`/v1/voices?model=${encodeURIComponent(model)}`).then((r) => r.voices)
    // A failed load must not be cached, or the picker could never recover.
    pending.catch(() => cache.delete(model))
    cache.set(model, pending)
  }
  return pending
}

export function useVoices(model: string) {
  const [state, setState] = useState<{ model: string; voices: VoiceInfo[]; error: unknown }>({ model, voices: [], error: null })

  useEffect(() => {
    let active = true
    loadVoices(model).then(
      (voices) => active && setState({ model, voices, error: null }),
      (error: unknown) => active && setState({ model, voices: [], error }),
    )
    return () => {
      active = false
    }
  }, [model])

  const settled = state.model === model
  return { voices: settled ? state.voices : [], loading: !settled, error: settled ? state.error : null }
}
