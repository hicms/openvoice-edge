/** Like `Promise.all(items.map(fn))` but runs at most `limit` calls at once and keeps result order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index]!, index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

export function concatBuffers(buffers: readonly ArrayBuffer[]): ArrayBuffer {
  const out = new Uint8Array(buffers.reduce((sum, b) => sum + b.byteLength, 0))
  let offset = 0
  for (const b of buffers) {
    out.set(new Uint8Array(b), offset)
    offset += b.byteLength
  }
  return out.buffer
}
