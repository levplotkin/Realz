// Geo discovery via Gun.js.
// Records are written to gun.get('realz/discovery/geo').get(didId)
// and are signed with the device key so any reader can verify them.

import type { Identity } from '../identity'

// Narrow type — we only use the Gun API surface we need.
interface GunNode {
  get(path: string): GunNode
  put(data: object, cb?: (ack: { err?: string }) => void): void
  map(): GunNode
  on(cb: (data: unknown, key: string) => void): void
  off(): void
}

export interface GeoRecord {
  didId: string
  didUrl: string
  lat: number
  lng: number
  name: string
  ts: number
  sig: string   // base64url(device_key.sign(canonical bytes))
}

const GEO_PATH = 'realz/discovery/geo'

function canonical(r: Omit<GeoRecord, 'sig'>): string {
  return `${r.didId}|${r.didUrl}|${r.lat}|${r.lng}|${r.ts}`
}

export async function publishGeo(
  gun: GunNode,
  wasm: typeof import('realz-core'),
  identity: Identity,
  lat: number,
  lng: number,
): Promise<void> {
  const name = (JSON.parse(identity.didJson).profile?.name as string) ?? ''
  const ts = Date.now()
  const record: Omit<GeoRecord, 'sig'> = { didId: identity.didId, didUrl: identity.didUrl, lat, lng, name, ts }
  const enc = new TextEncoder()
  const sig = wasm.sign_with_device(enc.encode(canonical(record)), identity.devicePrivateKey)
  const full: GeoRecord = { ...record, sig }
  gun.get(GEO_PATH).get(identity.didId).put(full)
}

export function unpublishGeo(gun: GunNode, didId: string): void {
  // Gun.js null-put removes a record
  gun.get(GEO_PATH).get(didId).put(null as any)
}

/** Returns all geo records within `radiusKm` of the given coords. */
export function subscribeNearby(
  gun: GunNode,
  lat: number,
  lng: number,
  radiusKm: number,
  onRecord: (r: GeoRecord) => void,
): () => void {
  const node = gun.get(GEO_PATH).map()
  node.on((data: unknown) => {
    if (!isGeoRecord(data)) return
    if (distanceKm(lat, lng, data.lat, data.lng) <= radiusKm) {
      onRecord(data)
    }
  })
  return () => node.off()
}

function isGeoRecord(v: unknown): v is GeoRecord {
  return (
    typeof v === 'object' && v !== null &&
    typeof (v as any).didId === 'string' &&
    typeof (v as any).lat === 'number' &&
    typeof (v as any).lng === 'number'
  )
}

// Haversine distance in km
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = deg(lat2 - lat1)
  const dLng = deg(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(deg(lat1)) * Math.cos(deg(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const deg = (d: number) => (d * Math.PI) / 180
