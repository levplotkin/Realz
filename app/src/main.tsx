import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

function App() {
  const [coreVersion, setCoreVersion] = useState<string>('')

  useEffect(() => {
    import('../wasm/realz_core').then((m) => {
      setCoreVersion(m.version())
    }).catch(() => {
      setCoreVersion('wasm not loaded')
    })
  }, [])

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem', color: '#fff', background: '#0f0f0f', minHeight: '100vh' }}>
      <h1>Realz</h1>
      <p>P2P social network — coming soon</p>
      {coreVersion && <p style={{ opacity: 0.5, fontSize: '0.8rem' }}>core v{coreVersion}</p>}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
