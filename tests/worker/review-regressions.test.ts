import { describe, expect, it } from 'vitest'
import { AdminConfigUpdateSchema } from '../../shared/schemas.ts'
import { toSrt, toVtt } from '../../shared/subtitles.ts'
import { buildSsml } from '../../worker/providers/tts/edge.ts'

describe('review regressions', () => {
  it('trims the SiliconFlow key and rejects keys with inner whitespace', () => {
    expect(AdminConfigUpdateSchema.parse({ siliconflowApiKey: ' sk-abc \n' }).siliconflowApiKey).toBe('sk-abc')
    expect(AdminConfigUpdateSchema.safeParse({ siliconflowApiKey: 'sk abc' }).success).toBe(false)
    expect(AdminConfigUpdateSchema.parse({ siliconflowApiKey: '' }).siliconflowApiKey).toBe('')
  })

  it('removes control characters that XML cannot carry but keeps tabs and newlines', () => {
    const ssml = buildSsml('a\u0000b\u0008c\td\ne', { voice: 'en-US-AriaNeural' })
    expect(ssml).toContain('abc\td\ne')
  })

  it('collapses blank lines inside a cue so SRT and VTT blocks stay valid', () => {
    const segments = [{ start: 0, end: 1, text: 'one\n\n\ntwo' }]
    expect(toSrt(segments)).toContain('one\ntwo')
    expect(toVtt(segments)).toContain('one\ntwo')
  })
})
