// BLE discovery via Web Bluetooth API.
// Advertisement: custom GATT service containing the sender's didId (truncated to 20 bytes).
// Chromium/Android only. Callers must guard with isBluetoothSupported().
//
// Architecture note: Web Bluetooth cannot advertise from a browser tab —
// only scanning is supported. For advertising we use a characteristic write
// on a connected peripheral, which requires a BLE peripheral device.
// In practice, "Bluetooth discovery" here means: SCAN for other Realz
// devices that are already advertising (e.g. via a future native wrapper),
// and share your DID via a characteristic exchange once connected.
//
// For the PWA-only case we implement the realistic subset:
//   - isBluetoothSupported(): feature detect
//   - scan(): request a BLE scan filtered to the Realz service UUID,
//             read the didId characteristic from each found device,
//             return the didId so the caller can fetch the DID doc via URL.

// 128-bit UUIDs for the Realz GATT service and characteristic.
// These are fixed so all Realz nodes can discover each other.
export const REALZ_SERVICE_UUID    = '12345678-1234-5678-1234-56789abcdef0'
export const REALZ_DID_CHAR_UUID   = '12345678-1234-5678-1234-56789abcdef1'
export const REALZ_DIDURL_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef2'

export interface BleDiscoveredPeer {
  deviceId: string    // browser-assigned opaque device ID
  name: string        // BLE advertisement name (may be empty)
  didId: string
  didUrl: string
}

export function isBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator
}

export interface PickedBluetoothDevice {
  id: string
  name: string
}

/**
 * Open the browser's native Bluetooth chooser showing ALL nearby devices and
 * return the one the user taps. The browser renders the device list itself —
 * Web Bluetooth cannot enumerate devices into our own UI, so this is one pick
 * per call. These are physical BT devices (headphones, laptops…), not Realz peers.
 * Throws if the user cancels or Bluetooth is unsupported.
 */
export async function pickBluetoothDevice(): Promise<PickedBluetoothDevice> {
  if (!isBluetoothSupported()) throw new Error('Web Bluetooth not supported in this browser')
  const device = await (navigator as any).bluetooth.requestDevice({ acceptAllDevices: true })
  return { id: device.id, name: device.name ?? 'Unknown device' }
}

/** True if the experimental live-scan API is present (Chrome flag required). */
export function isLiveScanSupported(): boolean {
  return isBluetoothSupported() && 'requestLEScan' in ((navigator as any).bluetooth ?? {})
}

/**
 * Live BLE scan — streams advertising devices into `onDevice` as they are seen,
 * populating an in-page list (no native picker modal). Requires the experimental
 * Web Bluetooth Scanning API: Chrome with
 * chrome://flags/#enable-experimental-web-platform-features enabled (and, on
 * Android, location permission). Returns a stop() function.
 * Throws if the API is unavailable or the user denies the scan prompt.
 */
export async function liveScanBluetooth(
  onDevice: (d: PickedBluetoothDevice) => void,
): Promise<() => void> {
  if (!isLiveScanSupported()) throw new Error('Live Bluetooth scan not available in this browser')
  const bt = (navigator as any).bluetooth
  const scan = await bt.requestLEScan({ acceptAllAdvertisements: true })
  const handler = (e: any) => {
    onDevice({ id: e.device.id, name: e.device.name ?? e.name ?? 'Unknown device' })
  }
  bt.addEventListener('advertisementreceived', handler)
  return () => {
    bt.removeEventListener('advertisementreceived', handler)
    try { scan.stop() } catch { /* already stopped */ }
  }
}

/**
 * Request BLE scan filtered to Realz service UUID.
 * Returns one discovered peer (browser shows a picker — user selects one device).
 * Throws if the user cancels or BT is unsupported.
 */
export async function scanOnce(): Promise<BleDiscoveredPeer> {
  if (!isBluetoothSupported()) throw new Error('Web Bluetooth not supported in this browser')

  const device = await (navigator as any).bluetooth.requestDevice({
    filters: [{ services: [REALZ_SERVICE_UUID] }],
    optionalServices: [REALZ_SERVICE_UUID],
  })

  const server = await device.gatt.connect()
  const service = await server.getPrimaryService(REALZ_SERVICE_UUID)

  const [didIdChar, didUrlChar] = await Promise.all([
    service.getCharacteristic(REALZ_DID_CHAR_UUID),
    service.getCharacteristic(REALZ_DIDURL_CHAR_UUID),
  ])

  const [didIdBuf, didUrlBuf] = await Promise.all([
    didIdChar.readValue(),
    didUrlChar.readValue(),
  ])

  const dec = new TextDecoder()
  const didId = dec.decode(didIdBuf)
  const didUrl = dec.decode(didUrlBuf)

  device.gatt.disconnect()

  return { deviceId: device.id, name: device.name ?? '', didId, didUrl }
}
