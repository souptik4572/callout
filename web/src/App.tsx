import Lab from './lab/Lab.tsx'

export default function App() {
  if (new URLSearchParams(window.location.search).has('lab')) return <Lab />
  return (
    <main className="lab">
      <h1>Callout</h1>
      <p>
        Not built yet. The M0 lab is at <a href="?lab">?lab</a>.
      </p>
    </main>
  )
}
