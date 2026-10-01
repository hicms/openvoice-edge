import { useCallback, useEffect, useRef, useState } from 'react'
import { downmixToMono, encodeWav } from './wav'

const TARGET_SAMPLE_RATE = 16000

async function toWavFile(recording: Blob): Promise<File> {
  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(await recording.arrayBuffer())
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE), TARGET_SAMPLE_RATE)
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start()
    const rendered = await offline.startRendering()
    const mono = downmixToMono(Array.from({ length: rendered.numberOfChannels }, (_, i) => rendered.getChannelData(i)))
    return new File([encodeWav(mono, TARGET_SAMPLE_RATE)], `recording-${Date.now()}.wav`, { type: 'audio/wav' })
  } finally {
    void context.close()
  }
}

export function useRecorder() {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const timerRef = useRef<number | null>(null)

  const cleanup = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current)
    timerRef.current = null
    recorderRef.current?.stream.getTracks().forEach((track) => track.stop())
    recorderRef.current = null
    setRecording(false)
  }, [])

  useEffect(() => cleanup, [cleanup])

  /** Throws when the microphone is unavailable or permission is denied. */
  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(stream)
    } catch (err) {
      stream.getTracks().forEach((track) => track.stop())
      throw err
    }
    recorderRef.current = recorder
    recorder.start()
    setSeconds(0)
    setRecording(true)
    const startedAt = Date.now()
    timerRef.current = window.setInterval(() => setSeconds((Date.now() - startedAt) / 1000), 250)
  }, [])

  /** Resolves with the recording as a 16 kHz mono WAV file. */
  const stop = useCallback(
    () =>
      new Promise<File>((resolve, reject) => {
        const recorder = recorderRef.current
        if (!recorder) return reject(new Error('Not recording'))
        const chunks: Blob[] = []
        recorder.ondataavailable = (e) => chunks.push(e.data)
        recorder.onstop = () => {
          cleanup()
          toWavFile(new Blob(chunks, { type: recorder.mimeType })).then(resolve, reject)
        }
        recorder.stop()
      }),
    [cleanup],
  )

  return { recording, seconds, start, stop }
}
