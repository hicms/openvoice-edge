import { describe, expect, it } from 'vitest'
import { AppError } from '../../shared/errors.ts'
import {
  formatTimestamp,
  formatTranscript,
  toMarkdown,
  toPlainText,
  toSrt,
  toVtt,
  type Transcript,
} from '../../shared/subtitles.ts'

const meeting: Transcript = {
  text: '1: 你好\n2: 我很好',
  duration: 4.9,
  segments: [
    { start: 0.32, end: 2.56, text: '你好，今天过得怎么样？', speaker: '1' },
    { start: 2.57, end: 4.77, text: '我很好，谢谢你。', speaker: '2' },
  ],
}

describe('formatTimestamp', () => {
  it('formats hours, minutes, seconds and milliseconds', () => {
    expect(formatTimestamp(3723.456, ',')).toBe('01:02:03,456')
    expect(formatTimestamp(0.32, '.')).toBe('00:00:00.320')
  })

  it('carries rounding into the next second', () => {
    expect(formatTimestamp(59.9996, ',')).toBe('00:01:00,000')
  })

  it('clamps negatives to zero', () => {
    expect(formatTimestamp(-1, ',')).toBe('00:00:00,000')
  })
})

describe('subtitle formats', () => {
  it('renders SRT with indexes, comma timestamps and speaker labels', () => {
    expect(toSrt(meeting.segments!)).toBe(
      '1\n00:00:00,320 --> 00:00:02,560\nSpeaker 1: 你好，今天过得怎么样？\n\n' +
        '2\n00:00:02,570 --> 00:00:04,770\nSpeaker 2: 我很好，谢谢你。\n',
    )
  })

  it('renders VTT with a header and dot timestamps', () => {
    const vtt = toVtt(meeting.segments!, (s) => `说话人${s}`)
    expect(vtt.startsWith('WEBVTT\n\n00:00:00.320 --> 00:00:02.560\n说话人1: ')).toBe(true)
  })

  it('omits the speaker prefix when there is no speaker', () => {
    expect(toSrt([{ start: 0, end: 1, text: 'hi' }])).toBe('1\n00:00:00,000 --> 00:00:01,000\nhi\n')
  })

  it('renders plain text and markdown with speakers', () => {
    expect(toPlainText(meeting)).toBe('Speaker 1: 你好，今天过得怎么样？\nSpeaker 2: 我很好，谢谢你。')
    expect(toMarkdown(meeting)).toContain('**Speaker 2** `00:00:02`\n\n我很好，谢谢你。')
  })

  it('returns the raw text when there are no speakers', () => {
    const plain: Transcript = { text: '你好' }
    expect(toPlainText(plain)).toBe('你好')
    expect(toMarkdown(plain)).toBe('你好')
  })
})

describe('formatTranscript', () => {
  it('json keeps only text, verbose_json keeps everything', () => {
    expect(JSON.parse(formatTranscript(meeting, 'json').body)).toEqual({ text: meeting.text })
    expect(JSON.parse(formatTranscript(meeting, 'verbose_json').body)).toEqual(meeting)
  })

  it('text returns the text', () => {
    expect(formatTranscript(meeting, 'text')).toEqual({
      contentType: 'text/plain; charset=utf-8',
      body: meeting.text,
    })
  })

  it('srt and vtt need segments', () => {
    expect(formatTranscript(meeting, 'srt').contentType).toContain('subrip')
    expect(formatTranscript(meeting, 'vtt').body.startsWith('WEBVTT')).toBe(true)
    const err = (() => {
      try {
        formatTranscript({ text: 'x' }, 'srt')
      } catch (e) {
        return e
      }
    })()
    expect(err).toBeInstanceOf(AppError)
    expect((err as AppError).code).toBe('no_timestamps')
    expect((err as AppError).status).toBe(422)
  })
})
