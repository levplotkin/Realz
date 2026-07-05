// Peer scanner — finds nearby users via active discovery modes.
// Shows a unified list of discovered peers regardless of which channel found them.

import { useEffect, useRef, useState } from 'react'
import type { Identity } from '../identity'
import { loadDiscoverySettings } from './settings'
import { subscribeNearby, type GeoRecord } from './geo'
import { scanOnce } from './bluetooth'
import { parseInviteFromHash, type InvitePayload } from './qr'

interface GunNode {
  get(path: string): GunNode
  put(data: object): void
  map(): GunNode
  on(cb: (data: unknown, key: string) => void): void
  off(): void
}

export interface DiscoveredPeer {
  didId: string
  didUrl: string
  name: string
  channel: 'geo' | 'wifi' | 'bluetooth' | 'invite'
  distanceKm?: number
}

interface Props {
  gun: GunNode
  identity: Identity
  onConnect: (peer: DiscoveredPeer) => void
  onClose: () => void
}

export default function DiscoveryScanner({ gun, identity, onConnect, onClose }: Props) {
  const [peers, setPeers] = useState<Map<string, DiscoveredPeer>>(new Map())
  const [btError, setBtError] = useState('')
  const [scanning, setScanning] = useState(false)
  const unsubRef = useRef<(() => void) | null>(null)
  const settings = loadDiscoverySettings()

  // Parse invite from URL hash on mount
  useEffect(() => {
    const invite = parseInviteFromHash(window.location.hash)
    if (invite) addPeer(invite.didId, invite.didUrl, invite.name, 'invite')
  }, [])

  // Geo subscription
  useEffect(() => {
    if (!settings.location || settings.locationLat === undefined) return
    setScanning(true)
    const unsub = subscribeNearby(gun, settings.locationLat, settings.locationLng!, 5, (r: GeoRecord) => {
      if (r.didId === identity.didId) return  // skip self
      addPeer(r.didId, r.didUrl, r.name, 'geo')
    })
    unsubRef.current = unsub
    return () => { unsub(); setScanning(false) }
  }, [])

  // Wi-Fi subscription — same Gun.js path but filtered to LAN peers
  useEffect(() => {
    if (!settings.wifi) return
    setScanning(true)
    const node = gun.get('realz/discovery/wifi').map()
    node.on((data: unknown) => {
      if (!isWifiRecord(data) || data.didId === identity.didId) return
      addPeer(data.didId, data.didUrl, data.name, 'wifi')
    })
    return () => { node.off(); setScanning(false) }
  }, [])

  function addPeer(didId: string, didUrl: string, name: string, channel: DiscoveredPeer['channel'], distanceKm?: number) {
    setPeers(prev => {
      const next = new Map(prev)
      next.set(didId, { didId, didUrl, name, channel, distanceKm })
      return next
    })
  }

  async function handleBluetoothScan() {
    setBtError('')
    try {
      const peer = await scanOnce()
      addPeer(peer.didId, peer.didUrl, peer.name || peer.didId.slice(0, 10), 'bluetooth')
    } catch (e: any) {
      setBtError(e.message ?? String(e))
    }
  }

  const list = [...peers.values()].filter(p => p.didId !== identity.didId)

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <button onClick={onClose} style={styles.back}>←</button>
          <h2 style={styles.heading}>Nearby</h2>
          {scanning && <span style={styles.dot} title="scanning" />}
        </div>

        {list.length === 0 && (
          <p style={styles.empty}>No peers found yet. Try enabling more discovery modes in Settings.</p>
        )}

        {list.map(peer => (
          <div key={peer.didId} style={styles.peerRow} onClick={() => onConnect(peer)}>
            <div style={styles.avatar}>{(peer.name[0] ?? '?').toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={styles.peerName}>{peer.name || 'Unknown'}</p>
              <p style={styles.peerMeta}>
                <ChannelBadge channel={peer.channel} />
                {peer.distanceKm !== undefined && ` · ${peer.distanceKm.toFixed(1)} km`}
              </p>
            </div>
            <span style={styles.arrow}>›</span>
          </div>
        ))}

        {settings.bluetooth && (
          <div style={{ marginTop: '1rem' }}>
            <button style={styles.ghost} onClick={handleBluetoothScan}>
              Scan Bluetooth
            </button>
            {btError && <p style={styles.errText}>{btError}</p>}
          </div>
        )}
      </div>
    </main>
  )
}

function ChannelBadge({ channel }: { channel: DiscoveredPeer['channel'] }) {
  const label: Record<DiscoveredPeer['channel'], string> = {
    geo: '📍 location',
    wifi: '📶 Wi-Fi',
    bluetooth: '🔵 Bluetooth',
    invite: '🔗 invite',
  }
  return <span style={{ fontSize: '0.8rem', color: 'rgba(244,244,246,0.5)' }}>{label[channel]}</span>
}

function isWifiRecord(v: unknown): v is { didId: string; didUrl: string; name: string } {
  return typeof v === 'object' && v !== null &&
    typeof (v as any).didId === 'string' &&
    typeof (v as any).didUrl === 'string'
}

const styles = {
  page: {
    minHeight: '100%',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: 'clamp(1.5rem, 5vw, 4rem)',
  } as React.CSSProperties,
  card: {
    width: '100%',
    maxWidth: '28rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.75rem',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '0.5rem',
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
    flex: 1,
  } as React.CSSProperties,
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#4ade80',
    display: 'inline-block',
    animation: 'pulse 1.5s infinite',
  } as React.CSSProperties,
  empty: {
    color: 'rgba(244,244,246,0.4)',
    fontSize: '0.9rem',
    textAlign: 'center' as const,
    padding: '2rem 0',
    margin: 0,
  },
  peerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.85rem',
    padding: '0.75rem 1rem',
    borderRadius: '0.75rem',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
    cursor: 'pointer',
  } as React.CSSProperties,
  avatar: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 600,
    fontSize: '1rem',
    color: '#fff',
    flexShrink: 0,
  } as React.CSSProperties,
  peerName: {
    color: '#f4f4f6',
    fontSize: '0.95rem',
    fontWeight: 500,
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  peerMeta: {
    margin: '0.15rem 0 0',
    fontSize: '0.8rem',
  },
  arrow: {
    color: 'rgba(244,244,246,0.3)',
    fontSize: '1.3rem',
  },
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
  errText: {
    color: '#f87171',
    fontSize: '0.82rem',
    margin: '0.5rem 0 0',
  } as React.CSSProperties,
}
