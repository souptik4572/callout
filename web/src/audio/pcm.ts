export function toInt16(samples: Float32Array): Int16Array<ArrayBuffer> {
  const out = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) out[i] = Math.max(-1, Math.min(1, samples[i])) * 0x7fff
  return out
}

export function encodeWav(chunks: Int16Array<ArrayBuffer>[], sampleRate: number): Blob {
  const dataBytes = chunks.reduce((total, chunk) => total + chunk.byteLength, 0)
  const header = new DataView(new ArrayBuffer(44))
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) header.setUint8(offset + i, text.charCodeAt(i))
  }
  writeAscii(0, 'RIFF')
  header.setUint32(4, 36 + dataBytes, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  header.setUint32(16, 16, true)
  header.setUint16(20, 1, true) // PCM
  header.setUint16(22, 1, true) // mono
  header.setUint32(24, sampleRate, true)
  header.setUint32(28, sampleRate * 2, true)
  header.setUint16(32, 2, true)
  header.setUint16(34, 16, true)
  writeAscii(36, 'data')
  header.setUint32(40, dataBytes, true)
  return new Blob([header, ...chunks], { type: 'audio/wav' })
}
