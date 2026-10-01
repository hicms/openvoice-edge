/** Like `Promise.all(items.map(fn))` but runs at most `limit` calls at once and keeps result order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  let failed = false
  async function worker(): Promise<void> {
    while (!failed && next < items.length) {
      const index = next++
      try {
        results[index] = await fn(items[index]!, index)
      } catch (err) {
        failed = true
        throw err
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
