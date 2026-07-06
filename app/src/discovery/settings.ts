export interface DiscoverySettings {
  internet: boolean      // DID URL is my public address
  location: boolean      // publish GPS coords to Gun.js geo mesh
  locationLat?: number
  locationLng?: number
  wifi: boolean          // publish to local-subnet Gun.js path
  wifiSubnet?: string    // e.g. "192.168.1" — derived via WebRTC ICE
  bluetooth: boolean     // BLE scan enabled
}

const KEY = 'realz:discovery:v1'

const DEFAULTS: DiscoverySettings = {
  internet: false,
  location: false,
  wifi: false,
  bluetooth: true,
}

export function loadDiscoverySettings(): DiscoverySettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {}
  return { ...DEFAULTS }
}

export function saveDiscoverySettings(s: DiscoverySettings): void {
  localStorage.setItem(KEY, JSON.stringify(s))
}
