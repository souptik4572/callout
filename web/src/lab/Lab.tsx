import { useState } from 'react'
import type { MicPreset } from '../audio/mic.ts'
import HoldToRecord from './HoldToRecord.tsx'
import PocketSession from './PocketSession.tsx'

export default function Lab() {
  const [preset, setPreset] = useState<MicPreset>('processed')
  return (
    <main className="lab">
      <h1>Callout lab</h1>
      <label>
        Mic processing{' '}
        <select value={preset} onChange={(e) => setPreset(e.target.value as MicPreset)}>
          <option value="processed">noise suppression + auto gain, no echo cancellation</option>
          <option value="raw">none</option>
        </select>
      </label>
      <PocketSession preset={preset} />
      <HoldToRecord preset={preset} />
    </main>
  )
}
