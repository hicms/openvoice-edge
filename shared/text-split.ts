const CLAUSE_BREAK = /(?<=[，、；：,;:])/u

const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' })

function pack(pieces: Iterable<string>, maxLen: number): string[] {
  const out: string[] = []
  let current = ''
  for (const piece of pieces) {
    if (current && current.length + piece.length > maxLen) {
      out.push(current)
      current = ''
    }
    current += piece
  }
  if (current) out.push(current)
  return out
}

function hardSplit(text: string, maxLen: number): string[] {
  const out: string[] = []
  let start = 0
  while (start < text.length) {
    let end = Math.min(start + maxLen, text.length)
    // Never cut between the two halves of a surrogate pair.
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1]!)) end -= 1
    out.push(text.slice(start, end))
    start = end
  }
  return out
}

function splitOversized(sentence: string, maxLen: number): string[] {
  const clauses = sentence.split(CLAUSE_BREAK).flatMap((c) => (c.length > maxLen ? hardSplit(c, maxLen) : [c]))
  return pack(clauses, maxLen)
}

/**
 * Splits text into chunks of at most `maxLen` UTF-16 units, preferring sentence
 * boundaries, then clause punctuation, then a hard cut. Punctuation is kept
 * as written so the voice reads questions and exclamations with the right tone.
 */
export function splitText(text: string, maxLen: number): string[] {
  if (!Number.isInteger(maxLen) || maxLen < 2) throw new RangeError('maxLen must be an integer >= 2')
  const normalized = text.replace(/\r\n?/g, '\n').trim()
  if (!normalized) return []
  const sentences: string[] = []
  for (const { segment } of segmenter.segment(normalized)) {
    if (segment.length > maxLen) sentences.push(...splitOversized(segment, maxLen))
    else sentences.push(segment)
  }
  return pack(sentences, maxLen)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
}
