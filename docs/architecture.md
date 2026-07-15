# Realz — Architecture

## Overview

Realz is a client-only application. There is no application server. All state lives on the user's device. The only network dependencies are:

- A **public URL** where the user hosts their DID document (GitHub Gist, etc.)
- The **Gun.js relay** (`relay.peer.ooo`) for peer discovery

```
┌──────────────────────────────────────────────────────────┐
│  Browser / PWA                                           │
│                                                          │
│  ┌─────────────┐   ┌────────────────────────────────┐   │
│  │  Rust WASM  │   │  React App (TypeScript)        │   │
│  │  core/      │   │  app/src/                      │   │
│  │             │   │                                │   │
│  │  keygen     │◄──│  identity.ts  (IndexedDB)      │   │
│  │  sign/verify│   │  Onboarding.tsx                │   │
│  │  DID build  │   │  main.tsx  (state machine)     │   │
│  └─────────────┘   │  discovery/  (Gun.js)          │   │
│                    └───────────┬────────────────────┘   │
└────────────────────────────────┼────────────────────────┘
                                 │
               ┌─────────────────┴──────────────────┐
               │                                    │
    ┌──────────▼──────────┐          ┌──────────────▼──────┐
    │  Gun.js relay        │          │  User-hosted URL     │
    │  relay.peer.ooo      │          │  (Gist / IPFS /      │
    │                      │          │   own server)        │
    │                      │          │                      │
    │  Bluetooth bucket    │          │  DID document JSON   │
    │  Geo mesh            │          │  (public, verified   │
    │  Wi-Fi path          │          │   by root key sig)   │
    └──────────────────────┘          └──────────────────────┘
```

---

## Component: Rust WASM Core (`core/`)

All cryptographic operations run inside a WebAssembly module compiled from Rust via `wasm-pack`. JavaScript receives only base64url-encoded public material.

**Key dependencies**: `ed25519-dalek 2.x`, `sha2 0.10`, `rand`, `getrandom` (js feature), `serde_json`, `base64`, `wasm-bindgen`

### Exported functions

| Function | Input | Output |
|---|---|---|
| `generate_identity()` | — | `GeneratedIdentity` struct with 4 keypairs |
| `GeneratedIdentity::build_did_document(...)` | device_id, name, bio, avatar_url, updated_at | Signed DID JSON string |
| `verify_did_document(json)` | DID JSON | `{ valid, id, name, bio, avatarUrl, error? }` |
| `sign_device_delegation(...)` | device_pubkey, did_id, issued_at, root_privkey | base64url delegation signature |
| `verify_device_delegation(...)` | device_pubkey, did_id, issued_at, root_pubkey, delegation | bool |
| `sign_with_device(payload, device_privkey)` | bytes, base64url key | base64url signature |
| `update_did_document(...)` | existing JSON, name, bio, avatar, updated_at, root_privkey | Updated signed DID JSON |
| `verify_root_key_matches_did(did_json, root_privkey)` | DID JSON, base64url key | bool |
| `compute_did_id(root_pubkey)` | base64url pubkey | `did:realz:<hash>` |

### Key scheme

```
Root keypair       ← generated once; root private key kept cold in IndexedDB
  │  └─ nextKeyHash: sha256(root_prerotation_pubkey) — committed for future rotation
  │
Root prerotation   ← generated at creation; not used until rotation event
  │
Device keypair     ← signed by root key (delegation); used for daily ops
  │  └─ nextKeyHash: sha256(device_prerotation_pubkey)
  │
Device prerotation ← reserved for device key rotation
```

DID ID = `did:realz:<base64url(sha256(root_public_key_bytes))>`

Device delegation message = `"delegate:<device_pubkey>:<did_id>:<issued_at>"` signed by root key.

Document signature = root key signs canonical JSON of all fields except `signature`.

---

## Component: React App (`app/src/`)

### State machine (`main.tsx`)

The app is driven by a `Phase` union type. No URL-based routing — all navigation is in-memory.

```
start (StartScreen)
  │
  └─ Enter pressed
       │
       ▼
  loading  → WASM loaded + Gun.js init + IndexedDB check
       │
       ├─ identity found  ──► home (HomeScreen)
       │                          │
       │                          ├─ Find people ──► discovery-scan (DiscoveryScanner)
       │                          ├─ Visibility  ──► discovery-settings (DiscoverySettings)
       │                          └─ Sign out    ──► start
       │
       └─ no identity    ──► onboarding (Onboarding)
                                  │
                                  └─ complete ──► home
```

WASM is loaded lazily via a dynamic `import()` call on Enter. The module path is constructed from `import.meta.env.BASE_URL` at runtime (outside Vite's static module graph — `/* @vite-ignore */`).

### Identity layer (`identity.ts`)

IndexedDB wrapper. Single store (`realz`, version 1), single key (`current`).

Stored fields:

```typescript
interface Identity {
  didId: string               // "did:realz:..."
  didUrl: string              // URL where user hosts the DID document
  didJson: string             // the full signed DID document (cached locally)
  deviceId: string            // "device-<timestamp>"
  rootPrivateKey: string      // base64url, kept in IndexedDB only
  devicePrivateKey: string    // base64url, used for signing in daily ops
  rootPrerotationPrivateKey: string
  devicePrerotationPrivateKey: string
}
```

Private keys are stored in IndexedDB (same-origin, not accessible to other tabs or extensions). They are never sent over the network.

An imported (read-only) identity has empty strings for all private key fields.

### Discovery layer (`app/src/discovery/`)

| File | Responsibility |
|---|---|
| `settings.ts` | localStorage persistence for discovery preferences (`realz:discovery:v1`) |
| `DiscoverySettings.tsx` | UI for toggling channels; captures GPS coordinates |
| `DiscoveryScanner.tsx` | Subscribes to active channels; renders peer list |
| `geo.ts` | Gun.js geo mesh — signed records, Haversine distance filtering |
| `bluetooth.ts` | BLE GATT constants (legacy; no longer used for scan) |
| `qr.ts` | Invite URL encoding/decoding; QR canvas rendering via `qrcode-generator` |

#### Gun.js path layout

```
realz/discovery/bt/<epoch>/<didId>    ← Bluetooth bucket (30s window)
realz/discovery/geo/<didId>           ← GPS record (lat, lng, name, ts, sig)
realz/discovery/wifi/<...>            ← Wi-Fi LAN records
```

Geo records are signed with the device key. Bluetooth and Wi-Fi records are not signed in v1 (trust is deferred to the DID document verification step).

---

## Build Pipeline

```
core/ (Rust)
  └─ wasm-pack build --target web --out-dir ../app/public/wasm
       └─ app/public/wasm/
            ├─ realz_core.js         ← JS glue
            └─ realz_core_bg.wasm    ← binary

app/ (React + Vite)
  └─ npm run build
       └─ app/dist/                  ← static files for GitHub Pages
```

CI (`deploy.yml`) runs both steps in order and deploys `app/dist/` to GitHub Pages via `actions/deploy-pages@v4`.

The WASM binary is served as a static file from `public/wasm/`. It is loaded at runtime, not bundled by Vite.

---

## Data Flow: Identity Creation

```
User fills name/bio
  │
  ▼
createIdentity() [identity.ts]
  │
  ├─ wasm.generate_identity()          ← 4 keypairs in WASM (OS entropy)
  ├─ gen.build_did_document(...)       ← signed DID JSON produced in WASM
  └─ saveIdentity(record)              ← keys + DID JSON stored in IndexedDB
       │
       ▼
User copies DID JSON → pastes to GitHub Gist → enters Gist URL
  │
  ▼
setDidUrl(url)                         ← URL persisted in IndexedDB
  │
  ▼
Home screen
```

## Data Flow: Identity Import (read-only)

```
User enters DID URL
  │
  ▼
importIdentityFromUrl() [identity.ts]
  │
  ├─ fetch(url)                        ← fetch DID document JSON
  └─ wasm.verify_did_document(json)    ← verify signature + ID binding in WASM
       │
       ▼
saveIdentity(readOnlyRecord)           ← no private keys stored
  │
  ▼
Home screen (read-only — no signing operations available)
```

## Data Flow: Bluetooth Discovery

```
DiscoveryScanner mounts, bluetooth setting enabled
  │
  ├─ Compute bucket = floor(Date.now() / 30_000)
  ├─ gun.get("realz/discovery/bt/<bucket>").get(didId).put({...})   ← publish self
  ├─ gun.get("realz/discovery/bt/<bucket+1>").get(didId).put({...}) ← publish to next bucket
  └─ gun.get("realz/discovery/bt/<bucket>").map().on(cb)            ← subscribe
       │
       ▼
  Incoming records → skip self → addPeer() → rendered in peer list
```
