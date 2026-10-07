import { pipeline, type AutomaticSpeechRecognitionPipeline, type ProgressInfo } from '@huggingface/transformers'

export interface TranscribeRequest {
  id: number
  model: string
  device: 'wasm' | 'webgpu'
  audio: Float32Array
}

export type WorkerMessage =
  | { type: 'progress'; info: ProgressInfo }
  | { type: 'ready'; loadMs: number }
  | { type: 'result'; id: number; text: string; ms: number }
  | { type: 'error'; id: number; message: string }

const DTYPES = {
  wasm: 'q8',
  webgpu: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
} as const

let loaded: { key: string; asr: Promise<AutomaticSpeechRecognitionPipeline> } | undefined
let queue = Promise.resolve()

const post = (message: WorkerMessage) => self.postMessage(message)

async function load(model: string, device: TranscribeRequest['device']) {
  const start = performance.now()
  const asr = await pipeline('automatic-speech-recognition', model, {
    device,
    dtype: DTYPES[device],
    progress_callback: (info) => post({ type: 'progress', info }),
  })
  post({ type: 'ready', loadMs: Math.round(performance.now() - start) })
  return asr
}

async function transcribe({ id, model, device, audio }: TranscribeRequest) {
  const key = `${model}|${device}`
  if (loaded?.key !== key) loaded = { key, asr: load(model, device) }
  try {
    const asr = await loaded.asr
    const start = performance.now()
    // No language or task options: English-only (*.en) checkpoints throw if given either.
    const output = await asr(audio)
    const text = Array.isArray(output) ? output.map((part) => part.text).join(' ') : output.text
    post({ type: 'result', id, text, ms: Math.round(performance.now() - start) })
  } catch (error) {
    loaded = undefined
    post({ type: 'error', id, message: String(error) })
  }
}

self.onmessage = (event: MessageEvent<TranscribeRequest>) => {
  queue = queue.then(() => transcribe(event.data))
}
