export function beep(ctx: AudioContext) {
  const start = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.frequency.value = 880
  gain.gain.setValueAtTime(0, start)
  gain.gain.linearRampToValueAtTime(0.9, start + 0.01)
  gain.gain.linearRampToValueAtTime(0, start + 0.08)
  osc.connect(gain).connect(ctx.destination)
  osc.start(start)
  osc.stop(start + 0.08)
}
