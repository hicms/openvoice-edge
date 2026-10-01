import { describe, expect, it } from 'vitest'
import { mapLimit } from '../../shared/concurrency.ts'

describe('mapLimit', () => {
  it('keeps result order and respects the limit', async () => {
    let active = 0
    let peak = 0
    const out = await mapLimit([1, 2, 3, 4, 5], 2, async (n) => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 5))
      active -= 1
      return n * 2
    })
    expect(out).toEqual([2, 4, 6, 8, 10])
    expect(peak).toBe(2)
  })

  it('stops starting new work after the first failure', async () => {
    const started: number[] = []
    await expect(
      mapLimit([1, 2, 3, 4, 5, 6], 2, async (n) => {
        started.push(n)
        await new Promise((r) => setTimeout(r, 5))
        if (n === 1) throw new Error('boom')
        return n
      }),
    ).rejects.toThrow('boom')
    expect(started.length).toBeLessThanOrEqual(2)
  })
})
