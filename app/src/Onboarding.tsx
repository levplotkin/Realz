import { useState } from 'react'
import {
  createIdentity,
  importIdentityFromUrl,
  saveIdentity,
  setDidUrl,
  type Identity,
} from './identity'

type Wasm = typeof import('realz-core')

type Step =
  | { type: 'choose' }
  | { type: 'create-profile' }
  | { type: 'create-publish'; didJson: string; pendingIdentity: Identity }
  | { type: 'import-url' }
  | { type: 'importing'; url: string }
  | { type: 'error'; message: string; back: Step }

interface Props {
  wasm: Wasm
  onComplete: (identity: Identity) => void
}

export default function Onboarding({ wasm, onComplete }: Props) {
  const [step, setStep] = useState<Step>({ type: 'choose' })
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [importUrl, setImportUrl] = useState('')
  const [didUrl, setDidUrlState] = useState('')
  const [copied, setCopied] = useState(false)

  async function handleCreate() {
    if (!name.trim()) return
    const deviceId = `device-${Date.now()}`
    const { identity, didJson } = await createIdentity(
      wasm,
      deviceId,
      { name: name.trim(), bio: bio.trim(), avatarUrl: '' },
      new Date().toISOString(),
    )
    await saveIdentity(identity)
    setStep({ type: 'create-publish', didJson, pendingIdentity: identity })
  }

  async function handlePublishDone() {
    const url = didUrl.trim()
    if (!url) return
    await setDidUrl(url)
    const identity = await import('./identity').then(m => m.loadIdentity())
    if (identity) onComplete(identity)
  }

  async function copyDidJson(json: string) {
    await navigator.clipboard.writeText(json)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleImport() {
    const url = importUrl.trim()
    if (!url) return
    setStep({ type: 'importing', url })
    const result = await importIdentityFromUrl(wasm, url)
    if (!result.valid) {
      setStep({ type: 'error', message: result.error ?? 'invalid DID', back: { type: 'import-url' } })
      return
    }
    // Import: we have the DID doc but no private keys.
    // Store a read-only identity — the user will need to add a device delegation separately.
    const readOnly: Identity = {
      didId: result.id!,
      didUrl: url,
      didJson: result.didJson!,
      deviceId: '',
      rootPrivateKey: '',
      devicePrivateKey: '',
      rootPrerotationPrivateKey: '',
      devicePrerotationPrivateKey: '',
    }
    await saveIdentity(readOnly)
    onComplete(readOnly)
  }

  return (
    <main style={styles.page}>
      {step.type === 'choose' && (
        <div style={styles.card}>
          <h2 style={styles.heading}>Your identity</h2>
          <p style={styles.sub}>A cryptographic key, hosted wherever you like.</p>
          <div style={styles.stack}>
            <button style={styles.primary} onClick={() => setStep({ type: 'create-profile' })}>
              Create new identity
            </button>
            <button style={styles.ghost} onClick={() => setStep({ type: 'import-url' })}>
              I already have one
            </button>
          </div>
        </div>
      )}

      {step.type === 'create-profile' && (
        <div style={styles.card}>
          <h2 style={styles.heading}>Who are you?</h2>
          <div style={styles.stack}>
            <label style={styles.label}>
              Name
              <input
                style={styles.input}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Alice"
                autoFocus
              />
            </label>
            <label style={styles.label}>
              Bio <span style={styles.optional}>(optional)</span>
              <input
                style={styles.input}
                value={bio}
                onChange={e => setBio(e.target.value)}
                placeholder="A few words about you"
              />
            </label>
            <div style={styles.row}>
              <button style={styles.ghost} onClick={() => setStep({ type: 'choose' })}>
                Back
              </button>
              <button style={styles.primary} onClick={handleCreate} disabled={!name.trim()}>
                Generate keys
              </button>
            </div>
          </div>
        </div>
      )}

      {step.type === 'create-publish' && (
        <div style={styles.card}>
          <h2 style={styles.heading}>Host your identity</h2>
          <p style={styles.sub}>
            Paste this JSON anywhere publicly reachable — a GitHub Gist, your own server, IPFS — then enter
            the URL below.
          </p>
          <textarea
            style={styles.textarea}
            readOnly
            value={step.didJson}
            rows={8}
          />
          <button style={{ ...styles.ghost, marginBottom: '1rem' }} onClick={() => copyDidJson(step.didJson)}>
            {copied ? 'Copied!' : 'Copy JSON'}
          </button>
          <label style={styles.label}>
            URL where you hosted it
            <input
              style={styles.input}
              value={didUrl}
              onChange={e => setDidUrlState(e.target.value)}
              placeholder="https://gist.githubusercontent.com/…/did.json"
            />
          </label>
          <div style={styles.row}>
            <button style={styles.ghost} onClick={() => onComplete(step.pendingIdentity)}>
              Skip
            </button>
            <button style={styles.primary} onClick={handlePublishDone} disabled={!didUrl.trim()}>
              Done
            </button>
          </div>
        </div>
      )}

      {step.type === 'import-url' && (
        <div style={styles.card}>
          <h2 style={styles.heading}>Enter your DID URL</h2>
          <p style={styles.sub}>The URL where your signed identity document is hosted.</p>
          <label style={styles.label}>
            DID document URL
            <input
              style={styles.input}
              value={importUrl}
              onChange={e => setImportUrl(e.target.value)}
              placeholder="https://gist.githubusercontent.com/…/did.json"
              autoFocus
            />
          </label>
          <div style={styles.row}>
            <button style={styles.ghost} onClick={() => setStep({ type: 'choose' })}>
              Back
            </button>
            <button style={styles.primary} onClick={handleImport} disabled={!importUrl.trim()}>
              Load
            </button>
          </div>
        </div>
      )}

      {step.type === 'importing' && (
        <div style={styles.card}>
          <p style={styles.sub}>Fetching and verifying…</p>
        </div>
      )}

      {step.type === 'error' && (
        <div style={styles.card}>
          <h2 style={{ ...styles.heading, color: '#f87171' }}>Error</h2>
          <p style={styles.sub}>{step.message}</p>
          <button style={styles.ghost} onClick={() => setStep(step.back)}>
            Try again
          </button>
        </div>
      )}
    </main>
  )
}

const styles = {
  page: {
    minHeight: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'clamp(1.5rem, 5vw, 4rem)',
  } as React.CSSProperties,
  card: {
    width: '100%',
    maxWidth: '28rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1rem',
  },
  heading: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontWeight: 400,
    fontSize: 'clamp(1.8rem, 6vw, 2.4rem)',
    color: '#f4f4f6',
    margin: 0,
  } as React.CSSProperties,
  sub: {
    color: 'rgba(244,244,246,0.65)',
    fontSize: '0.95rem',
    lineHeight: 1.5,
    margin: 0,
  } as React.CSSProperties,
  stack: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.75rem',
  },
  row: {
    display: 'flex',
    gap: '0.75rem',
  } as React.CSSProperties,
  label: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.4rem',
    fontSize: '0.9rem',
    color: 'rgba(244,244,246,0.8)',
  },
  optional: {
    fontSize: '0.8rem',
    color: 'rgba(244,244,246,0.4)',
  } as React.CSSProperties,
  input: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: '0.5rem',
    padding: '0.65rem 0.9rem',
    color: '#f4f4f6',
    fontSize: '1rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  textarea: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: '0.5rem',
    padding: '0.65rem 0.9rem',
    color: 'rgba(244,244,246,0.7)',
    fontSize: '0.72rem',
    fontFamily: 'monospace',
    resize: 'vertical' as const,
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  primary: {
    padding: '0.85rem 2rem',
    fontFamily: "'Inter', sans-serif",
    fontSize: '1rem',
    fontWeight: 500,
    cursor: 'pointer',
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.16)',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    color: '#fff',
    boxShadow: '0 8px 30px rgba(99,102,241,0.35)',
  } as React.CSSProperties,
  ghost: {
    padding: '0.85rem 2rem',
    fontFamily: "'Inter', sans-serif",
    fontSize: '1rem',
    fontWeight: 500,
    cursor: 'pointer',
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.25)',
    background: 'transparent',
    color: 'rgba(244,244,246,0.8)',
    boxShadow: 'none',
  } as React.CSSProperties,
}
