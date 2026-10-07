declare const sampleRate: number
declare class AudioWorkletProcessor {
  readonly port: MessagePort
}
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void

const FRAME_SECONDS = 0.02
const SILENCE_DBFS = -120

class FramesProcessor extends AudioWorkletProcessor {
  private frame = new Float32Array(Math.round(sampleRate * FRAME_SECONDS))
  private filled = 0

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0]
    if (!input) return true
    let offset = 0
    while (offset < input.length) {
      const n = Math.min(input.length - offset, this.frame.length - this.filled)
      this.frame.set(input.subarray(offset, offset + n), this.filled)
      this.filled += n
      offset += n
      if (this.filled === this.frame.length) this.flush()
    }
    return true
  }

  private flush() {
    let sum = 0
    for (const sample of this.frame) sum += sample * sample
    const dbfs = Math.max(SILENCE_DBFS, 20 * Math.log10(Math.sqrt(sum / this.frame.length)))
    this.port.postMessage({ dbfs, samples: this.frame }, [this.frame.buffer])
    this.frame = new Float32Array(this.frame.length)
    this.filled = 0
  }
}

registerProcessor('frames', FramesProcessor)
