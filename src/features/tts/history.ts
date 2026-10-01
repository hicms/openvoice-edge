import { readJson, writeJson, STORAGE_KEYS } from '@/lib/storage'
import type { SpeechParams } from './synthesize'

export interface HistoryItem {
  id: string
  createdAt: number
  model: string
  text: string
  params: SpeechParams
}

export const MAX_HISTORY = 20
/** Keeps the whole history well under the ~5 MB localStorage quota. */
export const MAX_STORED_CHARS = 10000

export function loadHistory(): HistoryItem[] {
  const items = readJson<unknown>(STORAGE_KEYS.ttsHistory, [])
  return Array.isArray(items) ? (items.filter((i) => i && typeof i.text === 'string' && i.params) as HistoryItem[]) : []
}

export function addHistory(items: readonly HistoryItem[], entry: Omit<HistoryItem, 'id' | 'createdAt'>, now = Date.now()): HistoryItem[] {
  const text = entry.text.slice(0, MAX_STORED_CHARS)
  // Re-running the same text with the same voice should move it to the top, not stack duplicates.
  const rest = items.filter((i) => !(i.text === text && i.model === entry.model && i.params.voice === entry.params.voice))
  return [{ ...entry, text, id: `${now}-${Math.random().toString(36).slice(2, 8)}`, createdAt: now }, ...rest].slice(0, MAX_HISTORY)
}

export function saveHistory(items: readonly HistoryItem[]): void {
  writeJson(STORAGE_KEYS.ttsHistory, items)
}
