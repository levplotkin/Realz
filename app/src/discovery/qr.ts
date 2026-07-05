// QR code + invite link generation.
// No external dependency — draws QR via canvas using a minimal Reed-Solomon
// encoder. For the invite link we use a simple URL with base64url-encoded payload.
//
// ponytail: using qrcode-generator (tiny, zero-dep, 5kb) rather than rolling
// our own Reed-Solomon. Loaded dynamically so it doesn't bloat the initial bundle.

export interface InvitePayload {
  didId: string
  didUrl: string
  name: string
}

/** Returns a deep-link URL that encodes the invite payload in the hash. */
export function buildInviteUrl(payload: InvitePayload): string {
  const encoded = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const base = globalThis.location?.origin ?? 'https://levplotkin.github.io/Realz'
  return `${base}/#invite=${encoded}`
}

/** Parse an invite URL hash into an InvitePayload, or null if not present/invalid. */
export function parseInviteFromHash(hash: string): InvitePayload | null {
  const match = hash.match(/[#&]invite=([A-Za-z0-9_-]+)/)
  if (!match) return null
  try {
    const padded = match[1].replace(/-/g, '+').replace(/_/g, '/') + '=='.slice((match[1].length * 3) % 4)
    return JSON.parse(atob(padded)) as InvitePayload
  } catch {
    return null
  }
}

/** Draw a QR code onto a canvas element for the given text. */
export async function drawQr(canvas: HTMLCanvasElement, text: string): Promise<void> {
  // ponytail: ceiling: 'qrcode-generator' tops out at ~2953 bytes (QR version 40).
  // Invite URLs stay well under that for typical DID/URL lengths.
  // @ts-ignore – qrcode-generator types vary by bundler; use any
  const qrcode: any = await import('qrcode-generator')
  const factory = qrcode.default ?? qrcode
  const qr = factory(0, 'M')
  qr.addData(text)
  qr.make()

  const modules = qr.getModuleCount()
  const cellSize = Math.floor(Math.min(canvas.width, canvas.height) / (modules + 4))
  const offset = Math.floor((modules + 4 - modules) / 2) * cellSize
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#1a1a2e'

  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (qr.isDark(row, col)) {
        ctx.fillRect(
          offset + col * cellSize,
          offset + row * cellSize,
          cellSize,
          cellSize,
        )
      }
    }
  }
}
