import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function Logo() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <circle cx="24" cy="32" r="15" stroke="url(#g)" strokeWidth="2.5" opacity="0.95" />
      <circle cx="40" cy="32" r="15" stroke="url(#g)" strokeWidth="2.5" opacity="0.95" />
      <defs>
        <linearGradient id="g" x1="9" y1="17" x2="55" y2="47" gradientUnits="userSpaceOnUse">
          <stop stopColor="#818cf8" />
          <stop offset="1" stopColor="#ec4899" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function StartScreen({
  onEnter,
  status,
  onInstall,
}: {
  onEnter: () => void
  status: string
  onInstall: (() => void) | null
}) {
  return (
    <main
      style={{
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: 'clamp(1.5rem, 5vw, 4rem)',
        gap: 'clamp(1.5rem, 4vh, 2.5rem)',
      }}
    >
      <Logo />

      <h1
        style={{
          fontFamily: "'Fraunces', Georgia, serif",
          fontWeight: 400,
          fontSize: 'clamp(2.75rem, 12vw, 5rem)',
          lineHeight: 1,
          letterSpacing: '-0.02em',
          background: 'linear-gradient(135deg, #f4f4f6 0%, #c7c9f2 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
        }}
      >
        Realz
      </h1>

      <p
        style={{
          fontFamily: "'Fraunces', Georgia, serif",
          fontStyle: 'italic',
          fontWeight: 300,
          fontSize: 'clamp(1.15rem, 4.5vw, 1.6rem)',
          lineHeight: 1.5,
          color: 'rgba(244, 244, 246, 0.82)',
          maxWidth: '22ch',
        }}
      >
        A private space
        <br />
        to pass trust
        <br />
        between people.
      </p>

      <button onClick={onEnter} style={buttonStyle}>
        Enter
      </button>

      {onInstall && (
        <button
          onClick={onInstall}
          style={{
            ...buttonStyle,
            padding: '0.65rem 2rem',
            fontSize: '0.9rem',
            background: 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            boxShadow: 'none',
          }}
        >
          Install app
        </button>
      )}

      {status && status !== 'ready' && (
        <p style={{ fontSize: '0.8rem', color: 'rgba(244, 244, 246, 0.4)' }}>{status}</p>
      )}
    </main>
  )
}

function WasmApp({ bg, onExit }: { bg: string; onExit: () => void }) {
  return (
    <main
      style={{
        minHeight: '100%',
        background: bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(1.5rem, 5vw, 4rem)',
        gap: 'clamp(1.5rem, 4vh, 2.5rem)',
      }}
    >
      <button
        onClick={onExit}
        style={{
          ...buttonStyle,
          background: 'rgba(0, 0, 0, 0.35)',
          border: '1px solid rgba(255, 255, 255, 0.5)',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.25)',
        }}
      >
        Exit
      </button>
    </main>
  )
}

const buttonStyle: React.CSSProperties = {
  padding: '0.85rem 2.75rem',
  fontFamily: "'Inter', sans-serif",
  fontSize: '1rem',
  fontWeight: 500,
  letterSpacing: '0.02em',
  cursor: 'pointer',
  borderRadius: 999,
  border: '1px solid rgba(255, 255, 255, 0.16)',
  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
  color: '#fff',
  boxShadow: '0 8px 30px rgba(99, 102, 241, 0.35)',
}

function App() {
  const [bg, setBg] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('')
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault() // stash it so we can trigger the prompt from our own button
      setInstallPrompt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setInstallPrompt(null)
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function handleInstall() {
    if (!installPrompt) return
    await installPrompt.prompt()
    await installPrompt.userChoice
    setInstallPrompt(null) // prompt can only be used once
  }

  async function handleEnter() {
    setStatus('entering…')
    try {
      // wasm lives in public/wasm/ — served as-is by Vite, not bundled
      const wasmUrl = `${import.meta.env.BASE_URL}wasm/realz_core.js`
      // @ts-ignore
      const wasm = await import(/* @vite-ignore */ wasmUrl)
      await wasm.default(`${import.meta.env.BASE_URL}wasm/realz_core_bg.wasm`)
      // background color comes from the wasm module
      setBg(wasm.render_square())
      setStatus('ready')
    } catch (e) {
      console.error('wasm load failed', e)
      setStatus('wasm not loaded')
    }
  }

  if (bg) return <WasmApp bg={bg} onExit={() => setBg(null)} />
  return (
    <StartScreen
      onEnter={handleEnter}
      status={status}
      onInstall={installPrompt ? handleInstall : null}
    />
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
