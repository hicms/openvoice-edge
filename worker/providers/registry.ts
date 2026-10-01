import { AppError } from '../../shared/errors.ts'
import { STT_MODELS, TTS_MODELS } from '../../shared/models.ts'
import type { SttModelInfo, TtsModelInfo } from '../../shared/models.ts'
import type { ConfigStore } from '../config/store.ts'
import { createSiliconflowClient, type SiliconflowClient } from './siliconflow/client.ts'
import { createSiliconflowTtsProvider } from './siliconflow/tts.ts'
import { createEdgeClient, type EdgeClient } from './tts/edge.ts'
import { createEdgeProvider } from './tts/edge-provider.ts'
import type { TtsProvider } from './tts/types.ts'

export interface Deps {
  edge: EdgeClient
  siliconflow: SiliconflowClient
}

export function createDeps(doFetch?: typeof fetch): Deps {
  return { edge: createEdgeClient({ fetch: doFetch }), siliconflow: createSiliconflowClient(doFetch) }
}

const ENGINE_UNAVAILABLE = 'This engine needs a SiliconFlow API key. Ask the administrator to set one.'

export async function resolveTtsProvider(model: TtsModelInfo, store: ConfigStore, deps: Deps): Promise<TtsProvider> {
  if (model.provider === 'edge') return createEdgeProvider(deps.edge)
  const key = await store.getSiliconflowKey()
  if (!key) throw new AppError('engine_unavailable', ENGINE_UNAVAILABLE)
  return createSiliconflowTtsProvider(deps.siliconflow, key.value, model.id)
}

export async function requireSiliconflowKey(store: ConfigStore): Promise<string> {
  const key = await store.getSiliconflowKey()
  if (!key) throw new AppError('engine_unavailable', ENGINE_UNAVAILABLE)
  return key.value
}

/** Models the server can run right now; Edge needs no key, everything else needs SiliconFlow. */
export async function availableModels(store: ConfigStore): Promise<{ tts: TtsModelInfo[]; stt: SttModelInfo[] }> {
  const hasKey = (await store.getSiliconflowKey()) !== null
  return {
    tts: TTS_MODELS.filter((m) => m.provider === 'edge' || hasKey),
    stt: hasKey ? [...STT_MODELS] : [],
  }
}
