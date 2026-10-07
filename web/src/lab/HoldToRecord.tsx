import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { TranscribeRequest, WorkerMessage } from '../asr/whisper.worker.ts'
import { openMic, type Mic, type MicPreset } from '../audio/mic.ts'
import { download } from './download.ts'
import { SCRIPT } from './script.ts'

const MODELS = ['onnx-community/whisper-base.en', 'onnx-community/whisper-tiny.en']
const PREROLL_FRAMES = 15
const hasWebGpu = 'gpu' in navigator

type Device = TranscribeRequest['device']

interface Row {
  said: string
  heard: string
  ms: number
  model: string
  device: Device
  setting: string
  preset: MicPreset
}

const mb = (bytes: number) => (bytes / 1e6).toFixed(0)

function concat(frames: Float32Array[]): Float32Array {
  const out = new Float32Array(frames.reduce((total, frame) => total + frame.length, 0))
  let offset = 0
  for (const frame of frames) {
    out.set(frame, offset)
    offset += frame.length
  }
  return out
}

function median(values: number[]): number {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
}

export default function HoldToRecord({ preset }: { preset: MicPreset }) {
  const worker = useRef<Worker | null>(null)
  const mic = useRef<Mic | null>(null)
  const recent = useRef<Float32Array[]>([])
  const clip = useRef<Float32Array[] | null>(null)
  const pending = useRef(new Map<number, Omit<Row, 'heard' | 'ms'>>())
  const nextId = useRef(0)
  const downloadTotal = useRef(0)
  const [micPreset, setMicPreset] = useState<MicPreset | null>(null)
  const [model, setModel] = useState(MODELS[0])
  const [device, setDevice] = useState<Device>('wasm')
  const [setting, setSetting] = useState('indoor')
  const [line, setLine] = useState(0)
  const [recording, setRecording] = useState(false)
  const [progress, setProgress] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    const w = new Worker(new URL('../asr/whisper.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data
      if (message.type === 'progress') {
        if (message.info.status === 'progress_total') {
          downloadTotal.current = message.info.total
          setProgress(`Loading model: ${mb(message.info.loaded)} of ${mb(message.info.total)} MB`)
        }
      } else if (message.type === 'ready') {
        setProgress(`Model ready: ${mb(downloadTotal.current)} MB in ${(message.loadMs / 1000).toFixed(1)} s`)
      } else {
        const meta = pending.current.get(message.id)
        pending.current.delete(message.id)
        if (message.type === 'error') setError(message.message)
        else if (meta) setRows((previous) => [...previous, { ...meta, heard: message.text.trim(), ms: message.ms }])
      }
    }
    worker.current = w
    return () => w.terminate()
  }, [])

  async function enableMic() {
    setError('')
    try {
      mic.current = await openMic(preset, ({ samples }) => {
        clip.current?.push(samples)
        recent.current.push(samples)
        if (recent.current.length > PREROLL_FRAMES) recent.current.shift()
      })
      setMicPreset(preset)
    } catch (e) {
      setError(String(e))
    }
  }

  function press(event: ReactPointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    clip.current = [...recent.current]
    setRecording(true)
  }

  function release() {
    const frames = clip.current
    clip.current = null
    setRecording(false)
    if (!frames || !worker.current || !micPreset) return
    const audio = concat(frames)
    const id = nextId.current++
    pending.current.set(id, { said: SCRIPT[line], model, device, setting, preset: micPreset })
    const request: TranscribeRequest = { id, model, device, audio }
    worker.current.postMessage(request, [audio.buffer])
    setLine((current) => (current + 1) % SCRIPT.length)
  }

  const timings = new Map<string, number[]>()
  for (const row of rows) {
    const key = `${row.model.split('/')[1]} on ${row.device}`
    timings.set(key, [...(timings.get(key) ?? []), row.ms])
  }

  return (
    <section>
      <h2>Hold to record</h2>
      <p>Hold the button while you say the line. Each clip is transcribed on this phone.</p>
      <div className="controls">
        <label>
          Model{' '}
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {MODELS.map((id) => <option key={id} value={id}>{id.split('/')[1]}</option>)}
          </select>
        </label>
        <label>
          Device{' '}
          <select value={device} onChange={(e) => setDevice(e.target.value as Device)}>
            <option value="wasm">wasm</option>
            <option value="webgpu" disabled={!hasWebGpu}>webgpu{hasWebGpu ? '' : ' (unavailable)'}</option>
          </select>
        </label>
        <label>
          Setting{' '}
          <select value={setting} onChange={(e) => setSetting(e.target.value)}>
            <option value="indoor">indoor</option>
            <option value="traffic">traffic</option>
          </select>
        </label>
      </div>
      {micPreset ? (
        <>
          <p className="say">
            Say: “{SCRIPT[line]}” <small>({line + 1}/{SCRIPT.length}, mic {micPreset})</small>
          </p>
          <button
            className={recording ? 'hold recording' : 'hold'}
            onPointerDown={press}
            onPointerUp={release}
            onPointerCancel={release}
            onContextMenu={(e) => e.preventDefault()}
          >
            {recording ? 'Recording…' : 'Hold to record'}
          </button>
        </>
      ) : (
        <button onClick={enableMic}>Enable mic</button>
      )}
      {progress && <p>{progress}</p>}
      {error && <p className="error">{error}</p>}
      {timings.size > 0 && (
        <ul>
          {[...timings].map(([key, values]) => (
            <li key={key}>{key}: {values.length} clips, median {median(values)} ms</li>
          ))}
        </ul>
      )}
      {rows.length > 0 && (
        <>
          <table>
            <thead>
              <tr><th>Said</th><th>Heard</th><th>ms</th></tr>
            </thead>
            <tbody>
              {rows.map((row, i) => <tr key={i}><td>{row.said}</td><td>{row.heard}</td><td>{row.ms}</td></tr>)}
            </tbody>
          </table>
          <button
            onClick={() => download('asr_smoke.jsonl', new Blob([rows.map((row) => JSON.stringify(row)).join('\n') + '\n']))}
          >
            Download asr_smoke.jsonl
          </button>
        </>
      )}
    </section>
  )
}
