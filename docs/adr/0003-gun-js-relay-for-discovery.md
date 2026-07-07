# ADR-0003: Gun.js as the P2P discovery relay

**Status**: Accepted  
**Date**: 2025-07

---

## Context

Peer discovery requires a shared medium for announcing presence. In a browser PWA:

- There is no raw TCP/UDP socket access.
- WebRTC requires a signalling server to establish the initial connection.
- Bluetooth advertising is not possible from a browser tab (Web Bluetooth can only scan, not advertise).
- A dedicated signalling server would be a centralized dependency.

Discovery channels needed: location mesh, Wi-Fi LAN, Bluetooth proximity simulation, future real-time messaging.

Alternatives considered:

1. **Custom WebSocket signalling server** — works, but requires infrastructure we own and operate.
2. **libp2p** — powerful but not designed for PWAs; no stable browser-native transport that avoids a relay.
3. **PeerJS** — thin WebRTC wrapper, still needs a signalling server.
4. **Gun.js** — a decentralized graph database with built-in P2P sync over WebSockets and WebRTC. Has public relay peers. Designed to work from browsers. Already used in similar local-first apps.

---

## Decision

Use Gun.js as the shared relay medium for all discovery channels.

- **Bluetooth proximity**: both peers publish their DID record to `realz/discovery/bt/<30s-epoch>` and subscribe to the same bucket. Peers present in the same 30-second window appear as discovered. Two consecutive buckets are written (current and next) to prevent boundary gaps.
- **Location**: peers publish to a geo-mesh path keyed by grid cell; subscribers receive nearby records within a radius.
- **Wi-Fi LAN**: peers publish to `realz/discovery/wifi`; Gun.js's WebRTC transport can reach peers on the same LAN without going through the relay.

Gun.js connects to a public relay (`gun-manhattan.herokuapp.com`) as the bootstrap peer. Gun's append-only, conflict-free graph model means stale records remain but are overwritten on next publish.

---

## Consequences

**Positive**
- No server to run: Gun.js handles the relay layer via a public peer or any user-supplied relay URL.
- Works from browser PWA without native plugins.
- The same Gun.js instance serves all discovery channels — one initialization, consistent API.
- Gun's eventual-consistency model is appropriate for discovery: stale presence records are acceptable.

**Negative**
- The public relay (`gun-manhattan.herokuapp.com`) is a community-run node with no SLA. Production use should supply a self-hosted relay.
- "Bluetooth" discovery is not true BLE proximity — it is a time-bucketed shared relay. Two users on opposite sides of the world with Bluetooth enabled will see each other.
- Gun.js stale records are never automatically cleaned up. Old DID entries accumulate in the relay indefinitely (mitigated by the 30-second bucket key for Bluetooth).
- Gun.js's `null` initialization path (when `window.Gun` is unavailable) must be handled defensively in every component — calling `.get()` on a null Gun instance causes an unhandled exception and a blank screen.
- Gun.js is loaded as a UMD bundle via `window.Gun` rather than an ES module import, which means it is outside Vite's module graph and tree-shaking.

---

## Notes

The original Bluetooth implementation used Web Bluetooth GATT: it opened a device picker filtered to `REALZ_SERVICE_UUID`. This was replaced in July 2025 because Web Bluetooth cannot advertise — the picker never found any devices and hung indefinitely. The Gun.js relay approach was chosen as the pragmatic replacement.
