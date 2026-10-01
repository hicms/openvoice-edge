import { describe, expect, it } from 'vitest'
import { emptyDialogue, scriptToTurns, turnsToScript } from '@/features/tts/dialogue'
import { addHistory, MAX_HISTORY, type HistoryItem } from '@/features/tts/history'
import { encodeWav, downmixToMono } from '@/features/stt/wav'

describe('dialogue script', () => {
  it('round-trips turns', () => {
    const turns = [
      { speaker: 1 as const, text: '你好' },
      { speaker: 2 as const, text: '你好呀' },
    ]
    expect(scriptToTurns(turnsToScript(turns))).toEqual(turns)
  })

  it('keeps square brackets inside a turn', () => {
    expect(scriptToTurns('[S1]看 [笑] 这里[S2]好的')).toEqual([
      { speaker: 1, text: '看 [笑] 这里' },
      { speaker: 2, text: '好的' },
    ])
  })

  it('treats plain text as one speaker-1 turn and empty text as a blank dialogue', () => {
    expect(scriptToTurns('hello')).toEqual([{ speaker: 1, text: 'hello' }])
    expect(scriptToTurns('  ')).toEqual(emptyDialogue())
  })
})

describe('history', () => {
  const params = { voice: 'alex' } as HistoryItem['params']

  it('moves a repeated entry to the top instead of duplicating it', () => {
    const first = addHistory([], { model: 'm', text: 'a', params }, 1)
    const second = addHistory(first, { model: 'm', text: 'b', params }, 2)
    const again = addHistory(second, { model: 'm', text: 'a', params }, 3)
    expect(again.map((i) => i.text)).toEqual(['a', 'b'])
  })

  it('caps the list length', () => {
    let items: HistoryItem[] = []
    for (let i = 0; i < MAX_HISTORY + 5; i++) items = addHistory(items, { model: 'm', text: `t${i}`, params }, i)
    expect(items).toHaveLength(MAX_HISTORY)
    expect(items[0]!.text).toBe(`t${MAX_HISTORY + 4}`)
  })
})

describe('wav', () => {
  it('writes a 16-bit mono PCM header', async () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1])
    const bytes = new Uint8Array(await encodeWav(samples, 16000).arrayBuffer())
    const view = new DataView(bytes.buffer)
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF')
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('WAVE')
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(16000)
    expect(view.getUint16(34, true)).toBe(16)
    expect(bytes.byteLength).toBe(44 + samples.length * 2)
  })

  it('averages channels when downmixing', () => {
    const mono = downmixToMono([new Float32Array([1, 0]), new Float32Array([0, 1])])
    expect(Array.from(mono)).toEqual([0.5, 0.5])
  })
})
