# Realz — Product Description

## What is Realz?

Realz is a mobile-first, peer-to-peer social network where **you own your identity and your social graph**. There is no company, no server, and no account to delete. Your identity is a signed document you host wherever you like.

---

## The Problem

Every major social platform:

- Owns your identity — your username, followers, and DMs are held hostage by their servers.
- Is the sole arbiter of trust — who you follow, what you see, and whether you're banned are platform decisions.
- Is a single point of failure — account bans, data breaches, and service shutdowns erase your social presence.

## The Solution

Realz replaces the platform's role with cryptography and peer-to-peer protocols:

| Platform does this | Realz does this instead |
|----|-----|
| Assigns you a username | You generate an Ed25519 keypair; your ID is derived from your public key |
| Stores your profile on their servers | You host your DID document at any public URL |
| Controls who can see you | You choose which discovery channels to enable |
| Holds your private messages | (roadmap) End-to-end encrypted, stored locally |
| Can deplatform you | No server to ban you from |

---

## Core Features (Implemented)

### Self-Sovereign Identity
- Generate a cryptographic identity entirely in the browser — no account registration.
- Your DID ID (`did:realz:<hash>`) is permanently bound to your root public key. No one can forge it.
- Your profile (name, bio) lives inside the signed DID document.
- Host the document anywhere: GitHub Gist, your own server, IPFS.

### Multi-Device Support (architecture in place)
- Each device gets its own keypair signed by the root key (delegation).
- The root key is kept "cold" — daily operations use the device key.
- Pre-rotation hashes are committed in the document for future key rotation without changing your DID.

### Proximity Discovery
Find people near you without a central directory:

| Channel | How it works | Status |
|---|---|---|
| Bluetooth (simulated) | Gun.js relay bucket; peers in the same 30-second window appear | Live (default on) |
| Location | GPS-based geo mesh via Gun.js | UI available, off by default |
| Wi-Fi LAN | Shared Gun.js path reachable over LAN WebRTC | UI available, off by default |
| QR / Invite link | Base64-encoded payload in URL hash | Always available |

### Installable PWA
- Works offline.
- Installable on Android and iOS from the browser — no app store required.
- Served over HTTPS from GitHub Pages.

---

## Roadmap (Not Yet Implemented)

- **Trust edges** — sign a trust assertion from your device key to another user's DID.
- **Trust graph display** — visualize your trust network and transitive connections.
- **Key rotation** — rotate the root key using the pre-committed `nextKeyHash`.
- **Device delegation UI** — add a second device via QR handshake (cryptographic primitives are ready).
- **Profile update flow** — edit name/bio in the app and re-host the updated DID document.
- **End-to-end encrypted messaging** — ephemeral or persistent; routed through Gun.js or direct WebRTC.
- **Revocation** — mark a DID or device key as compromised.
- **Self-hosted relay** — replace the public `gun-manhattan` relay with a Realz-operated relay.

---

## Target User

Someone who:

- Values privacy and ownership of their social identity.
- Is comfortable with a slightly manual workflow (hosting a JSON file).
- Wants to connect with people nearby without going through a platform.
- Is technically curious — early adopter profile.

The UX is intentionally minimal. The friction of self-hosting is a feature: it makes the user's sovereignty over their identity tangible.

---

## Live App

`https://levplotkin.github.io/Realz/`
