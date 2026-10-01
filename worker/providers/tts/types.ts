export interface TtsRequest {
  text: string
  voice: string
  speed?: number
  pitch?: number
  volume?: number
  style?: string
  instructions?: string
}

export interface TtsProvider {
  /** Resolves to MP3 bytes for the whole text. */
  synthesize(request: TtsRequest): Promise<ArrayBuffer>
}
