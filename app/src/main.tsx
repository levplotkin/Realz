import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'

function App() {
  const [squareColor, setSquareColor] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('')

  async function handleConnect() {
    setStatus('loading…')
    try {
      // @ts-ignore
      const wasm = await import('../wasm/realz_core')
      // wasm-pack --target web requires calling init() before using exports
      await wasm.default()
      const color = wasm.render_square()
      setSquareColor(color)
      setStatus('')
    } catch (e) {
      console.error('wasm load failed', e)
      setStatus('wasm not loaded')
    }
  }

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem', color: '#fff', background: '#0f0f0f', minHeight: '100vh' }}>
      <h1>Realz</h1>
      <p>P2P social network — coming soon</p>
      <button
        onClick={handleConnect}
        style={{ padding: '0.5rem 1.5rem', fontSize: '1rem', cursor: 'pointer', borderRadius: 6, border: 'none', background: '#6366f1', color: '#fff' }}
      >
        Connect
      </button>
      {status && <p style={{ opacity: 0.5, fontSize: '0.8rem', marginTop: '0.5rem' }}>{status}</p>}
      {squareColor && (
        <div style={{ marginTop: '1.5rem', width: 80, height: 80, background: squareColor, borderRadius: 4 }} />
      )}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
