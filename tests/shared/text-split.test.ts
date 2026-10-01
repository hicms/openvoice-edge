import { describe, expect, it } from 'vitest'
import { splitText } from '../../shared/text-split.ts'

describe('splitText', () => {
  it('returns nothing for blank input', () => {
    expect(splitText('  \n ', 100)).toEqual([])
  })

  it('keeps short text as one chunk', () => {
    expect(splitText('你好，世界！', 100)).toEqual(['你好，世界！'])
  })

  it('keeps the original sentence punctuation', () => {
    const chunks = splitText('真的吗？太好了！我们走吧。', 5)
    expect(chunks.join('')).toBe('真的吗？太好了！我们走吧。')
    expect(chunks.join('')).not.toMatch(/[^？！。吗真的太好了我们走吧]/)
    expect(chunks).toEqual(['真的吗？', '太好了！', '我们走吧。'])
  })

  it('packs whole sentences up to the limit', () => {
    const chunks = splitText('One. Two. Three. Four.', 12)
    expect(chunks).toEqual(['One. Two.', 'Three. Four.'])
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(12)
  })

  it('falls back to clause punctuation for an oversized sentence', () => {
    const chunks = splitText('第一段内容，第二段内容，第三段内容', 8)
    expect(chunks).toEqual(['第一段内容，', '第二段内容，', '第三段内容'])
  })

  it('hard-splits text with no punctuation and never exceeds the limit', () => {
    const chunks = splitText('a'.repeat(25), 10)
    expect(chunks.map((c) => c.length)).toEqual([10, 10, 5])
  })

  it('does not cut a surrogate pair in half', () => {
    const text = '😀'.repeat(7)
    const chunks = splitText(text, 5)
    expect(chunks.join('')).toBe(text)
    for (const c of chunks) expect([...c].every((ch) => ch === '😀')).toBe(true)
  })

  it('splits on paragraph breaks', () => {
    expect(splitText('第一行\n第二行', 4)).toEqual(['第一行', '第二行'])
  })

  it('rejects an invalid limit', () => {
    expect(() => splitText('abc', 1)).toThrow(RangeError)
  })
})
