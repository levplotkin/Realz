import { useEffect, useRef, useState } from 'react'
import type { Identity } from '../identity'
import {
  loadDiscoverySettings,
  saveDiscoverySettings,
  type DiscoverySettings,
} from './settings'
import { buildInviteUrl, drawQr } from './qr'
import { isBluetoothSupported } from './bluetooth'

interface Props {
  identity: Identity
  onClose: () => void
}

export default function DiscoverySettingsScreen({ identity, onClose }: Props) {
  const [settings, setSettings] = useState<DiscoverySettings>(loadDiscoverySettings)
  const [locError, setLocError] = useState('')
  const [copied, setCopied] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const inviteUrl = buildInviteUrl({
    didId: identity.didId,
    didUrl: identity.didUrl,
    name: JSON.parse(identity.didJson).profile?.name ?? '',
  })

  useEffect(() => {
    if (canvasRef.current) drawQr(canvasRef.current, inviteUrl)
  }, [inviteUrl])

  function update(patch: Partial<DiscoverySettings>) {
    setSettings(prev => {
      const next = { ...prev, ...patch }
      saveDiscoverySettings(next)
      return next
    })
  }

  async function handleLocationToggle(on: boolean) {
    setLocError('')
    if (!on) { update({ location: false, locationLat: undefined, locationLng: undefined }); return }
    if (!navigator.geolocation) { setLocError('Geolocation not supported in this browser'); return }
    navigator.geolocation.getCurrentPosition(
      pos => update({ location: true, locationLat: pos.coords.latitude, locationLng: pos.coords.longitude }),
      err => { setLocError(`Location denied: ${err.message}`); update({ location: false }) },
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  async function copyLink() {
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const profile = JSON.parse(identity.didJson).profile as { name: string }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <button onClick={onClose} style={styles.back}>←</button>
          <h2 style={styles.heading}>Discovery</h2>
        </div>
        <p style={styles.sub}>Choose how {profile.name} can be found by others.</p>

        {/* QR / Invite link — always available */}
        <Section title="QR code & invite link">
          <canvas
            ref={canvasRef}
            width={220}
            height={220}
            style={{ borderRadius: '0.75rem', background: '#fff', display: 'block', margin: '0 auto 0.75rem' }}
          />
          <button style={styles.ghost} onClick={copyLink}>
            {copied ? 'Copied!' : 'Copy invite link'}
          </button>
          <p style={styles.hint}>Share this link or show the QR — no network required.</p>
        </Section>

        {/* Internet */}
        <Section title="Internet">
          <Toggle
            label="Show my DID URL as public address"
            value={settings.internet}
            onChange={v => update({ internet: v })}
          />
          {settings.internet && (
            <p style={styles.hint}>
              Anyone with your DID URL can fetch and verify your profile.
            </p>
          )}
        </Section>

        {/* Location */}
        <Section title="Location (precise, opt-in)">
          <Toggle
            label="Publish my location"
            value={settings.location}
            onChange={handleLocationToggle}
          />
          {settings.location && settings.locationLat !== undefined && (
            <p style={styles.hint}>
              Broadcasting at {settings.locationLat.toFixed(4)}, {settings.locationLng!.toFixed(4)}
            </p>
          )}
          {locError && <p style={{ ...styles.hint, color: '#f87171' }}>{locError}</p>}
          {settings.location && (
            <p style={styles.hint}>
              Your exact GPS coordinates are visible to others on the discovery map.
            </p>
          )}
        </Section>

        {/* Wi-Fi */}
        <Section title="Wi-Fi (same network)">
          <Toggle
            label="Visible on local network"
            value={settings.wifi}
            onChange={v => update({ wifi: v })}
          />
          {settings.wifi && (
            <p style={styles.hint}>Other Realz users on the same Wi-Fi can find you.</p>
          )}
        </Section>

        {/* Bluetooth */}
        <Section title="Bluetooth">
          {isBluetoothSupported() ? (
            <>
              <Toggle
                label="Scan for nearby Realz users"
                value={settings.bluetooth}
                onChange={v => update({ bluetooth: v })}
              />
              {settings.bluetooth && (
                <p style={styles.hint}>
                  Chromium / Android only. Scanning when the app is open.
                </p>
              )}
            </>
          ) : (
            <p style={{ ...styles.hint, color: '#f87171' }}>
              Bluetooth not available in this browser (requires Chrome/Edge on Android or desktop).
            </p>
          )}
        </Section>
      </div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1.25rem' }}>
      <p style={{ margin: '0 0 0.75rem', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(244,244,246,0.4)' }}>
        {title}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {children}
      </div>
    </div>
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', gap: '1rem' }}>
      <span style={{ fontSize: '0.95rem', color: 'rgba(244,244,246,0.85)' }}>{label}</span>
      <div
        onClick={() => onChange(!value)}
        style={{
          width: 44,
          height: 24,
          borderRadius: 999,
          background: value ? '#6366f1' : 'rgba(255,255,255,0.12)',
          position: 'relative',
          flexShrink: 0,
          transition: 'background 0.2s',
        }}
      >
        <div style={{
          position: 'absolute',
          top: 3,
          left: value ? 23 : 3,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.2s',
        }} />
      </div>
    </label>
  )
}

const styles = {
  page: {
    minHeight: '100%',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: 'clamp(1.5rem, 5vw, 4rem)',
    overflowY: 'auto' as const,
  } as React.CSSProperties,
  card: {
    width: '100%',
    maxWidth: '28rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1.25rem',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  } as React.CSSProperties,
  back: {
    background: 'none',
    border: 'none',
    color: 'rgba(244,244,246,0.7)',
    fontSize: '1.4rem',
    cursor: 'pointer',
    padding: '0 0.25rem',
    lineHeight: 1,
  } as React.CSSProperties,
  heading: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontWeight: 400,
    fontSize: 'clamp(1.8rem, 6vw, 2.4rem)',
    color: '#f4f4f6',
    margin: 0,
  } as React.CSSProperties,
  sub: {
    color: 'rgba(244,244,246,0.6)',
    fontSize: '0.95rem',
    lineHeight: 1.5,
    margin: 0,
  } as React.CSSProperties,
  hint: {
    color: 'rgba(244,244,246,0.45)',
    fontSize: '0.82rem',
    lineHeight: 1.45,
    margin: '0.25rem 0 0',
  } as React.CSSProperties,
  ghost: {
    width: '100%',
    padding: '0.65rem 1rem',
    fontFamily: "'Inter', sans-serif",
    fontSize: '0.9rem',
    fontWeight: 500,
    cursor: 'pointer',
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.25)',
    background: 'transparent',
    color: 'rgba(244,244,246,0.8)',
  } as React.CSSProperties,
}
