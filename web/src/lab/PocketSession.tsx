import { useRef, useState } from 'react'
import { beep } from '../audio/beep.ts'
import { openMic, PRESETS, type Mic, type MicPreset } from '../audio/mic.ts'
import { encodeWav, toInt16 } from '../audio/pcm.ts'
import { download } from './download.ts'

const BEEP_EVERY_S = 30
const STOP_HOLD_MS = 2000
const SLOW_FPS = 45

interface LogEvent {
  t: number
  type: string
  detail?: string
}

interface Result {
  name: string
  summary: string[]
  wav: Blob
  log: Blob
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

export default function PocketSession({ preset }: { preset: MicPreset }) {
  const finish = useRef<(() => Promise<Result>) | null>(null)
  const holdTimer = useRef(0)
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')

  async function start() {
    setError('')
    setResult(null)
    const startedAt = new Date()
    const fps: number[] = []
    const dbfs: number[] = []
    const events: LogEvent[] = []
    const chunks: Int16Array<ArrayBuffer>[] = []
    let frames = 0
    const note = (type: string, detail?: string) =>
      events.push({ t: (Date.now() - startedAt.getTime()) / 1000, type, detail })

    let wakeLock: WakeLockSentinel | undefined
    const lockScreen = async () => {
      try {
        wakeLock = await navigator.wakeLock.request('screen')
        wakeLock.onrelease = () => note('wakelock', 'released')
        note('wakelock', 'acquired')
      } catch (e) {
        note('wakelock', `failed: ${e}`)
      }
    }
    void lockScreen()

    let mic: Mic
    try {
      mic = await openMic(preset, (frame) => {
        chunks.push(toInt16(frame.samples))
        dbfs.push(Math.round(frame.dbfs * 10) / 10)
        frames++
      })
    } catch (e) {
      await wakeLock?.release()
      setError(String(e))
      return
    }
    const applied = mic.track.getSettings()
    mic.ctx.onstatechange = () => note('audio', mic.ctx.state)
    mic.track.onmute = () => note('track', 'muted')
    mic.track.onunmute = () => note('track', 'unmuted')
    mic.track.onended = () => note('track', 'ended')

    const onVisibility = () => {
      note('visibility', document.visibilityState)
      if (document.visibilityState === 'visible') void lockScreen()
    }
    document.addEventListener('visibilitychange', onVisibility)

    const timer = window.setInterval(() => {
      fps.push(frames)
      frames = 0
      if (fps.length % BEEP_EVERY_S === 0) {
        beep(mic.ctx)
        note('beep')
      }
      setStatus(`${clock(fps.length)} · ${fps[fps.length - 1]} frames/s`)
    }, 1000)

    finish.current = async () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      await wakeLock?.release()
      await mic.close()
      const log = {
        startedAt: startedAt.toISOString(),
        preset,
        sampleRate: mic.ctx.sampleRate,
        requested: PRESETS[preset],
        applied,
        userAgent: navigator.userAgent,
        fps,
        dbfs,
        events,
      }
      const listed = (types: string[]) =>
        events.filter((e) => types.includes(e.type)).map((e) => `${e.t}s ${e.type} ${e.detail ?? ''}`.trim())
      const other = listed(['audio', 'track', 'visibility'])
      return {
        name: `pocket-${preset}-${log.startedAt.slice(0, 19).replace(/[:T]/g, '-')}`,
        summary: [
          `${clock(fps.length)} at ${mic.ctx.sampleRate} Hz, preset "${preset}"`,
          `Frames per second: min ${Math.min(...fps)}; ${fps.filter((n) => n < SLOW_FPS).length} of ${fps.length} seconds under ${SLOW_FPS}`,
          `Applied: echoCancellation ${applied.echoCancellation}, noiseSuppression ${applied.noiseSuppression}, autoGainControl ${applied.autoGainControl}`,
          `Wake lock: ${listed(['wakelock']).join(', ')}`,
          `Audio, track and visibility events: ${other.length ? other.join(', ') : 'none'}`,
          `Beeps: ${events.filter((e) => e.type === 'beep').length}`,
        ],
        wav: encodeWav(chunks, mic.ctx.sampleRate),
        log: new Blob([JSON.stringify(log)], { type: 'application/json' }),
      }
    }
    setStatus('0:00')
    setRunning(true)
  }

  async function stop() {
    const done = finish.current
    finish.current = null
    if (!done) return
    setResult(await done())
    setRunning(false)
  }

  const holdToStop = () => {
    window.clearTimeout(holdTimer.current)
    holdTimer.current = window.setTimeout(() => void stop(), STOP_HOLD_MS)
  }
  const cancelStop = () => window.clearTimeout(holdTimer.current)

  return (
    <section>
      <h2>Pocket session</h2>
      <p>
        Start, put the phone in your chest pocket and call out items as you walk. The screen stays black and
        it beeps every 30 s. To stop, hold anywhere on the black screen for 2 s.
      </p>
      <button onClick={start} disabled={running}>Start pocket session</button>
      {error && <p className="error">{error}</p>}
      {result && (
        <>
          <ul>
            {result.summary.map((line) => <li key={line}>{line}</li>)}
          </ul>
          <button onClick={() => download(`${result.name}.wav`, result.wav)}>Download WAV</button>{' '}
          <button onClick={() => download(`${result.name}.json`, result.log)}>Download log</button>
        </>
      )}
      {running && (
        <div
          className="overlay"
          onPointerDown={holdToStop}
          onPointerUp={cancelStop}
          onPointerCancel={cancelStop}
          onContextMenu={(e) => e.preventDefault()}
        >
          {status}
        </div>
      )}
    </section>
  )
}
