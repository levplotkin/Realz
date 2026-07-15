# Realz

A mobile-first P2P social network with cryptographic identity and proximity-based peer discovery. No central server owns your identity or your social graph.

**Live app**: https://levplotkin.github.io/Realz/

---

## What it does

- **Self-sovereign identity** — your identity is a signed JSON document you host anywhere (GitHub Gist, your own server, IPFS). No account, no password, no server to trust.
- **Cryptographic trust** — every identity document is signed with Ed25519 keys. The DID ID is derived from the root public key, so it can't be spoofed.
- **Proximity discovery** — find nearby users via Bluetooth relay (Gun.js time-bucket), location mesh, Wi-Fi LAN, or QR invite link.
- **Installable PWA** — works offline, installable on Android/iOS, no app store required.

---

## Architecture

```
Realz/
├── core/          Rust → WASM: crypto, DID generation, signing, verification
└── app/           React + Vite PWA: UI, identity storage, discovery, Gun.js
```

### Core (Rust / WASM)

The `core` crate compiles to WebAssembly via `wasm-pack`. It owns all cryptographic operations and never exposes private key material to JavaScript beyond what is explicitly passed in.

| Function | Description |
|---|---|
| `generate_identity()` | Generate root keypair + device keypair + prerotation pairs |
| `build_did_document(...)` | Produce signed DID document JSON |
| `verify_did_document(json)` | Parse and verify a DID document signature |
| `sign_device_delegation(...)` | Sign a new device's public key with the root key |
| `verify_device_delegation(...)` | Verify a device delegation signature |
| `sign_with_device(payload, key)` | Sign arbitrary bytes with a device key |
| `update_did_document(...)` | Re-sign a DID document after profile update |

**Key scheme**: each identity has a root key (cold, rarely used) and a device key (daily ops). Each key has a corresponding prerotation key whose hash is committed in the document — enabling future key rotation without re-issuing the DID ID.

### App (React / TypeScript)

| Module | Responsibility |
|---|---|
| `main.tsx` | App state machine, WASM boot, Gun.js init, screen routing |
| `Onboarding.tsx` | Identity creation and import flow |
| `identity.ts` | IndexedDB persistence, WASM wrappers for all identity ops |
| `discovery/settings.ts` | Persistent discovery preferences (localStorage) |
| `discovery/DiscoverySettings.tsx` | Discovery settings screen |
| `discovery/DiscoveryScanner.tsx` | Peer discovery UI + Gun.js subscriptions |
| `discovery/bluetooth.ts` | BLE GATT constants and type definitions |
| `discovery/geo.ts` | Gun.js geo-mesh publish/subscribe |
| `discovery/qr.ts` | Invite link encoding/decoding, QR canvas rendering |

### DID document format

```json
{
  "version": 1,
  "id": "did:realz:<base64url(sha256(root_public_key))>",
  "rootKey": {
    "publicKey": "<base64url>",
    "nextKeyHash": "sha256:<base64url>"
  },
  "devices": [{
    "id": "device-<timestamp>",
    "publicKey": "<base64url>",
    "nextKeyHash": "sha256:<base64url>",
    "delegation": "<base64url(root_sig)>"
  }],
  "profile": { "name": "Alice", "bio": "...", "avatarUrl": "" },
  "updatedAt": "<ISO 8601>",
  "signature": "<base64url(root_sig over doc without signature field)>"
}
```

### Peer discovery channels

| Channel | Mechanism | Status |
|---|---|---|
| **Bluetooth** | Gun.js relay bucket `realz/discovery/bt/<30s-epoch>` — both peers publish and subscribe | Active (default on) |
| **Location** | Gun.js geo-mesh with GPS coordinates | UI disabled (read-only) |
| **Wi-Fi** | Gun.js `realz/discovery/wifi` path | UI disabled (read-only) |
| **QR / invite** | Base64url-encoded payload in URL hash | Always available |

> **Note**: Web Bluetooth cannot advertise from a browser tab, only scan. The "Bluetooth" channel is implemented as a Gun.js relay — peers in the same 30-second window appear as discovered.

---

## Local development

### Prerequisites

- Rust + `wasm-pack` — https://rustwasm.github.io/wasm-pack/installer/
- Node.js 20+

### Run

```bash
# 1. Build WASM core (output goes to app/public/wasm/)
wasm-pack build core --target web --out-dir ../app/public/wasm

# 2. Install and run the React app
npm --prefix app install
npm --prefix app run dev
```

The dev server starts at `http://localhost:5173/Realz/`.

### Build for production

```bash
wasm-pack build core --target web --out-dir ../app/public/wasm
npm --prefix app run build
# Output: app/dist/
```

---

## Deployment

Push to `main` → GitHub Actions (`deploy.yml`) builds WASM + React → deploys to GitHub Pages.

**Required repo setup** (one-time):
1. Settings → Pages → Source: **GitHub Actions**
2. Settings → Actions → General → Workflow permissions: **Read and write**

The concurrency group is `pages` with `cancel-in-progress: false` — Pages deployments must not be interrupted mid-call or subsequent deploys fail.

---

## Security model

- Private keys are generated in WASM (using OS entropy via `getrandom`) and stored in IndexedDB. They never leave the device.
- The DID ID is derived as `sha256(root_public_key)` encoded as base64url — it is a self-certifying identifier.
- The root private key is kept cold. Daily operations use the device key, which has an explicit delegation signature from the root.
- Key rotation is pre-committed via `nextKeyHash` fields — a future rotation is verifiable against the hash committed in the current document.
- The DID document signature covers all fields except `signature` itself, serialized as canonical JSON.

---

## Limitations

- Key rotation UI is not yet implemented (the cryptographic primitives are in place).
- Bluetooth proximity is simulated via Gun.js relay — it is not actual BLE proximity.
- Location and Wi-Fi discovery channels are implemented but disabled in the UI pending further testing.
- Imported identities are read-only — no device delegation flow yet.
- Gun.js relay peer (`relay.peer.ooo`) is a public relay; a self-hosted relay should be used for production.
