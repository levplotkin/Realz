import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import Gun from 'gun'
import Onboarding from './Onboarding'
import { loadIdentity, type Identity } from './identity'
import DiscoverySettingsScreen from './discovery/DiscoverySettings'
import DiscoveryScanner, { type DiscoveredPeer } from './discovery/DiscoveryScanner'
import { publishGeo, unpublishGeo } from './discovery/geo'
import { loadDiscoverySettings } from './discovery/settings'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type Wasm = typeof import('realz-core')

interface GunNode {
  get(path: string): GunNode
  put(data: object): void
  map(): GunNode
  on(cb: (data: unknown, key: string) => void): void
  off(): void
}

type Phase =
  | { type: 'loading' }
  | { type: 'onboarding'; wasm: Wasm }
  | { type: 'home'; wasm: Wasm; identity: Identity }
  | { type: 'discovery-settings'; wasm: Wasm; identity: Identity }
  | { type: 'discovery-scan'; wasm: Wasm; identity: Identity }
  | { type: 'error'; message: string }

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
  onInstall,
}: {
  onEnter: () => void
  onInstall: (() => void) | null
}) {
  return (
    <main style={pageCenter}>
      <Logo />
      <h1 style={headline}>Realz</h1>
      <p style={tagline}>
        A private space
        <br />
        to pass trust
        <br />
        between people.
      </p>
      <button onClick={onEnter} style={primaryBtn}>
        Enter
      </button>
      {onInstall && (
        <button onClick={onInstall} style={ghostBtn}>
          Install app
        </button>
      )}
    </main>
  )
}

function LoadingScreen({ message }: { message: string }) {
  return (
    <main style={pageCenter}>
      <Logo />
      <p style={{ color: 'rgba(244,244,246,0.5)', fontSize: '0.9rem' }}>{message}</p>
    </main>
  )
}

function HomeScreen({
  identity,
  onDiscoverySettings,
  onDiscoveryScan,
  onSignOut,
}: {
  identity: Identity
  onDiscoverySettings: () => void
  onDiscoveryScan: () => void
  onSignOut: () => void
}) {
  const profile = JSON.parse(identity.didJson).profile as { name: string; bio: string }
  const settings = loadDiscoverySettings()
  const activeChannels = [
    settings.internet && 'internet',
    settings.location && 'location',
    settings.wifi && 'Wi-Fi',
    settings.bluetooth && 'BT',
  ].filter(Boolean).join(' · ')

  return (
    <main style={{ ...pageCenter, alignItems: 'flex-start', padding: 'clamp(1.5rem, 5vw, 4rem)' }}>
      <div style={{ width: '100%', maxWidth: '28rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <Logo />

        <div>
          <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontWeight: 400, fontSize: 'clamp(1.8rem, 6vw, 2.4rem)', color: '#f4f4f6', margin: '0 0 0.25rem' }}>
            {profile.name}
          </h2>
          {profile.bio && <p style={{ color: 'rgba(244,244,246,0.6)', fontSize: '0.95rem', margin: 0 }}>{profile.bio}</p>}
        </div>

        {/* Discovery buttons */}
        <div style={{ display: 'flex', gap: '0.65rem' }}>
          <button style={{ ...primaryBtn, flex: 1, padding: '0.75rem 1rem' }} onClick={onDiscoveryScan}>
            Find people
          </button>
          <button
            style={{ ...ghostBtn, padding: '0.75rem 1.25rem', position: 'relative' }}
            onClick={onDiscoverySettings}
            title="Discovery settings"
          >
            ⚙ Visibility
            {activeChannels && (
              <span style={{ position: 'absolute', top: 4, right: 6, fontSize: '0.6rem', color: '#4ade80' }}>●</span>
            )}
          </button>
        </div>

        {activeChannels && (
          <p style={{ color: 'rgba(244,244,246,0.35)', fontSize: '0.78rem', margin: 0 }}>
            Visible via: {activeChannels}
          </p>
        )}

        <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem', padding: '0.85rem 1rem' }}>
          <p style={{ color: 'rgba(244,244,246,0.4)', fontSize: '0.72rem', margin: '0 0 0.3rem', fontFamily: 'monospace' }}>DID</p>
          <p style={{ color: 'rgba(244,244,246,0.7)', fontSize: '0.72rem', fontFamily: 'monospace', wordBreak: 'break-all', margin: 0 }}>
            {identity.didId}
          </p>
        </div>

        {identity.didUrl && (
          <p style={{ color: 'rgba(244,244,246,0.4)', fontSize: '0.8rem', margin: 0 }}>
            Hosted at <a href={identity.didUrl} target="_blank" rel="noreferrer" style={{ color: '#818cf8' }}>{identity.didUrl}</a>
          </p>
        )}

        <button onClick={onSignOut} style={ghostBtn}>Sign out</button>
      </div>
    </main>
  )
}

function App() {
  const [phase, setPhase] = useState<Phase>({ type: 'loading' })
  const [started, setStarted] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const gunRef = useRef<GunNode | null>(null)

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
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

  function initGun() {
    if (gunRef.current) return
    gunRef.current = Gun({ peers: ['https://gun-manhattan.herokuapp.com/gun'] }) as unknown as GunNode
  }

  async function handleEnter() {
    setStarted(true)
    setPhase({ type: 'loading' })
    try {
      const wasmUrl = `${import.meta.env.BASE_URL}wasm/realz_core.js`
      // @ts-ignore – dynamic runtime path, not resolvable at compile time
      const wasmModule = await import(/* @vite-ignore */ wasmUrl)
      await (wasmModule as any).default(`${import.meta.env.BASE_URL}wasm/realz_core_bg.wasm`)
      const wasm = wasmModule as Wasm

      initGun()

      const identity = await loadIdentity()
      if (identity) {
        // Resume any active geo publishing
        const settings = loadDiscoverySettings()
        if (settings.location && settings.locationLat !== undefined && gunRef.current) {
          publishGeo(gunRef.current, wasm, identity, settings.locationLat, settings.locationLng!)
        }
        setPhase({ type: 'home', wasm, identity })
      } else {
        setPhase({ type: 'onboarding', wasm })
      }
    } catch (e) {
      setPhase({ type: 'error', message: String(e) })
    }
  }

  async function handleInstall() {
    if (!installPrompt) return
    await installPrompt.prompt()
    await installPrompt.userChoice
    setInstallPrompt(null)
  }

  function handleIdentityReady(identity: Identity, wasm: Wasm) {
    setPhase({ type: 'home', wasm, identity })
  }

  async function handleSignOut() {
    // Remove geo record before signing out
    if (phase.type === 'home' && gunRef.current) {
      unpublishGeo(gunRef.current, phase.identity.didId)
    }
    const { clearIdentity } = await import('./identity')
    await clearIdentity()
    setStarted(false)
    setPhase({ type: 'loading' })
  }

  function handlePeerConnect(peer: DiscoveredPeer) {
    // ponytail: stub — will become the trust-edge creation flow
    alert(`Connect with ${peer.name} (${peer.didId.slice(0, 16)}…)\nDID URL: ${peer.didUrl}`)
  }

  if (!started) {
    return (
      <StartScreen
        onEnter={handleEnter}
        onInstall={installPrompt ? handleInstall : null}
      />
    )
  }

  if (phase.type === 'loading') return <LoadingScreen message="loading…" />
  if (phase.type === 'error') return <LoadingScreen message={phase.message} />

  if (phase.type === 'onboarding') {
    return (
      <Onboarding
        wasm={phase.wasm}
        onBack={() => setStarted(false)}
        onComplete={(identity) => handleIdentityReady(identity, phase.wasm)}
      />
    )
  }

  if (phase.type === 'discovery-settings') {
    return (
      <DiscoverySettingsScreen
        identity={phase.identity}
        onClose={() => setPhase({ type: 'home', wasm: phase.wasm, identity: phase.identity })}
      />
    )
  }

  if (phase.type === 'discovery-scan') {
    return (
      <DiscoveryScanner
        gun={gunRef.current}
        identity={phase.identity}
        onConnect={handlePeerConnect}
        onClose={() => setPhase({ type: 'home', wasm: phase.wasm, identity: phase.identity })}
      />
    )
  }

  return (
    <HomeScreen
      identity={phase.identity}
      onDiscoverySettings={() => setPhase({ type: 'discovery-settings', wasm: phase.wasm, identity: phase.identity })}
      onDiscoveryScan={() => setPhase({ type: 'discovery-scan', wasm: phase.wasm, identity: phase.identity })}
      onSignOut={handleSignOut}
    />
  )
}

const pageCenter: React.CSSProperties = {
  minHeight: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  padding: 'clamp(1.5rem, 5vw, 4rem)',
  gap: 'clamp(1.5rem, 4vh, 2.5rem)',
}

const headline: React.CSSProperties = {
  fontFamily: "'Fraunces', Georgia, serif",
  fontWeight: 400,
  fontSize: 'clamp(2.75rem, 12vw, 5rem)',
  lineHeight: 1,
  letterSpacing: '-0.02em',
  background: 'linear-gradient(135deg, #f4f4f6 0%, #c7c9f2 100%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  margin: 0,
}

const tagline: React.CSSProperties = {
  fontFamily: "'Fraunces', Georgia, serif",
  fontStyle: 'italic',
  fontWeight: 300,
  fontSize: 'clamp(1.15rem, 4.5vw, 1.6rem)',
  lineHeight: 1.5,
  color: 'rgba(244, 244, 246, 0.82)',
  maxWidth: '22ch',
  margin: 0,
}

const primaryBtn: React.CSSProperties = {
  padding: '0.85rem 2.75rem',
  fontFamily: "'Inter', sans-serif",
  fontSize: '1rem',
  fontWeight: 500,
  letterSpacing: '0.02em',
  cursor: 'pointer',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,0.16)',
  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
  color: '#fff',
  boxShadow: '0 8px 30px rgba(99,102,241,0.35)',
}

const ghostBtn: React.CSSProperties = {
  padding: '0.65rem 2rem',
  fontFamily: "'Inter', sans-serif",
  fontSize: '0.9rem',
  fontWeight: 500,
  cursor: 'pointer',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,0.25)',
  background: 'transparent',
  color: 'rgba(244,244,246,0.8)',
  boxShadow: 'none',
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
