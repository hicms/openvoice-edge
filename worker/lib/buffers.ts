export function concatBuffers(buffers: readonly ArrayBuffer[]): ArrayBuffer {
  const out = new Uint8Array(buffers.reduce((sum, b) => sum + b.byteLength, 0))
  let offset = 0
  for (const b of buffers) {
    out.set(new Uint8Array(b), offset)
    offset += b.byteLength
  }
  return out.buffer
}
