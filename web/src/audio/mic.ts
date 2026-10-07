import framesWorkletUrl from './frames.worklet.ts?worker&url'

export type MicPreset = 'processed' | 'raw'

export const PRESETS: Record<MicPreset, MediaTrackConstraints> = {
  processed: { echoCancellation: false, noiseSuppression: true, autoGainControl: true },
  raw: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
}

export interface Frame {
  dbfs: number
  samples: Float32Array
}

export interface Mic {
  ctx: AudioContext
  track: MediaStreamTrack
  close: () => Promise<void>
}

// Call straight from a tap handler: the AudioContext has to be created inside the user
// gesture, before the first await, or the browser starts it suspended.
export async function openMic(preset: MicPreset, onFrame: (frame: Frame) => void): Promise<Mic> {
  const ctx = new AudioContext({ sampleRate: 16000 })
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { ...PRESETS[preset], channelCount: 1 } })
  await ctx.audioWorklet.addModule(framesWorkletUrl)
  const node = new AudioWorkletNode(ctx, 'frames')
  node.port.onmessage = (event: MessageEvent<Frame>) => onFrame(event.data)
  ctx.createMediaStreamSource(stream).connect(node).connect(ctx.destination)
  return {
    ctx,
    track: stream.getAudioTracks()[0],
    close: async () => {
      stream.getTracks().forEach((track) => track.stop())
      await ctx.close()
    },
  }
}
