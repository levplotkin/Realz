# Realz — Limitations and Known Constraints

This document catalogues current limitations by category: what is not implemented, what has known failure modes, and what is intentionally deferred.

---

## Identity

### No key rotation UI
The cryptographic machinery is in place (`nextKeyHash` prerotation commitments exist for both root and device keys), but there is no UI to perform a rotation. A compromised device key cannot currently be revoked via the app.

### No root key revocation
If the root private key is lost or compromised, there is no recovery path in v1. The DID document cannot be updated without the root key, and there is no revocation mechanism.

### No event log
The DID document is a single signed snapshot. There is no append-only event log (unlike full KERI). This means the history of key changes is not provable — only the current state is verifiable.

### Imported identities are read-only
Importing a DID URL gives you a read-only copy of the identity. The device delegation flow (scan a QR code on the existing device to authorize a new device key) is not yet implemented. The WASM primitives exist (`sign_device_delegation`, `verify_device_delegation`), but the UI and update-DID-doc-and-re-host step are missing.

### Manual DID hosting
The user must manually paste their DID JSON to a hosting URL (GitHub Gist, etc.) and enter the URL back into the app. This is the highest UX friction point. There is no automatic hosting integration.

### Profile updates require re-hosting
Changing name or bio requires re-signing the DID document (WASM support is in place via `update_did_document`) and re-uploading it to the hosting URL. The in-app profile edit flow does not yet exist.

### DID method is not interoperable
`did:realz` is a custom method. It is not registered with the W3C DID method registry and is not resolvable by standard DIF resolver infrastructure or Verifiable Credentials tooling without a custom resolver specification.

---

## Discovery

### "Bluetooth" is not BLE proximity
The Bluetooth discovery channel uses a Gun.js time-bucketed relay, not actual Bluetooth Low Energy. Two users anywhere in the world with Bluetooth enabled will see each other if they are in the same 30-second window. True BLE proximity is impossible from a browser tab — Web Bluetooth can scan but cannot advertise.

### Stale Gun.js records
Gun.js uses an append-only conflict-free graph. Stale peer records persist indefinitely in the relay. The Bluetooth channel mitigates this with a 30-second bucket key (old buckets are never read), but geo and Wi-Fi records can accumulate stale entries.

### Location and Wi-Fi channels are off by default and untested
Both channels have implementation code and UI toggles but are disabled by default. They have not been tested end-to-end. Location requires explicit GPS permission; Wi-Fi proximity detection via WebRTC ICE candidates is unreliable across NATs.

### Geo records are signed but not verified on receipt
Geo records are signed with the publisher's device key (in `geo.ts`), but `DiscoveryScanner` does not call `verify_device_delegation` or verify the signature before displaying the record. A spoofed record with a valid-looking structure would appear in the peer list.

### No trust edges
Discovering a peer does not establish a trust relationship. The "Connect" button in the discovery screen shows an `alert()` stub. Trust-edge signing (device key signs `trust:<target_did>:<timestamp>`) is not implemented.

### Gun relay is a public community node
`gun-manhattan.herokuapp.com` is a public, community-run relay with no SLA. If it goes offline, all discovery channels except QR invite links stop working.

---

## Security

### Private keys stored in IndexedDB
Private keys (root and device) are stored in the browser's IndexedDB, which is accessible to any same-origin JavaScript. On a device with malware or a compromised browser extension, this is a risk. Hardware security key storage (WebAuthn / Secure Enclave) is not used.

### No key export / backup UI
There is no UI to export private key material for backup. If the user clears their browser data or the device is lost, the identity is irrecoverable unless they can regenerate it from a backup of IndexedDB (not provided).

### No end-to-end encryption
There is currently no encrypted messaging. All discovered peer information (name, DID ID, DID URL) is shared in plaintext over the Gun.js relay.

### Geo records expose precise GPS coordinates
Publishing to the geo mesh exposes `lat` and `lng` to anyone subscribed to the Gun.js path. There is no coarsening or blurring of location data.

### Invite links expose identity in URL
Invite URLs encode the DID ID, DID URL, and display name in the URL hash. These are shareable but are not secret. Anyone with the URL can see the DID URL and fetch the DID document.

---

## Infrastructure

### Single public relay dependency
All non-QR discovery depends on `gun-manhattan.herokuapp.com`. This is a centralized point of failure for a decentralized system. A self-hosted relay is the intended production path but is not yet in place.

### GitHub Pages limitations
- No server-side logic — deep-link URLs return 404 on hard refresh (mitigated by in-memory routing).
- 1 GB repository size limit; WASM binary and JS bundle must stay well under 100 MB per file.
- If the `gun-manhattan` relay is unavailable, discovery degrades to QR-only.

### WASM must be pre-built
The `app/public/wasm/` directory must contain a current `wasm-pack` build before `npm run dev` or `npm run build` will work. New contributors must run `wasm-pack build core --target web --out-dir ../app/public/wasm` first. The WASM output is not committed to the repo.

### Node 20 deprecation workaround in CI
The deploy job sets `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` to suppress deprecation warnings from `actions/deploy-pages`. This should be removed when the action ships a Node 24 release.

---

## UX

### No persistent sessions across sign-out
Sign-out calls `clearIdentity()`, which deletes the entire IndexedDB record including private keys. There is no "lock" without erase — the only way to re-authenticate is to import the DID URL again (read-only) or re-create the identity.

### No avatar support
The DID document schema includes `avatarUrl`, but the onboarding flow does not ask for an avatar, and no avatar is displayed in the UI.

### Discovery settings are not persisted per identity
`DiscoverySettings` are stored in `localStorage` keyed by a fixed string (`realz:discovery:v1`). If multiple identities exist on the same device (not currently possible but could be via browser profiles), they would share settings.

### Single-identity per browser context
The app stores exactly one `current` identity in IndexedDB. There is no multi-identity switcher.
