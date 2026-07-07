# ADR-0002: Self-sovereign identity using a custom `did:realz` method

**Status**: Accepted  
**Date**: 2025-06

---

## Context

Realz users need a stable, verifiable identifier that they control, with no dependency on a central registry or DNS. The identifier must:

- Be derivable from the user's own key material (self-certifying)
- Be verifiable by anyone with the DID document
- Support multi-device use (device delegation)
- Support future key rotation without changing the identifier

Alternatives considered:

1. **`did:web`** — simple, but requires the user to own a domain and maintain DNS. Ties identity to a domain name they may lose.
2. **`did:peer`** — no public registry needed, but designed for pairwise interactions; not suitable for a public discovery network.
3. **`did:plc`** (Bluesky) — has a central recovery service (`plc.directory`); introduces a trusted third party.
4. **KERI / `did:keri`** — full event log, witnesses, watchers; powerful but significantly more complex to implement correctly in a browser PWA.
5. **Custom `did:realz` method** — KERI-inspired but simplified: single signed document, prerotation key commitment, device delegation. No event log in v1.

---

## Decision

Use a custom `did:realz:<id>` method where:

- The DID ID is `did:realz:<base64url(sha256(root_public_key))>` — it is permanently bound to the root key.
- The identity document is a single JSON object signed by the root key.
- Each device has an explicit delegation: the root key signs `delegate:<device_pubkey>:<did_id>:<issued_at>`.
- Prerotation is committed via `nextKeyHash: sha256(<next_public_key_b64>)` for both root and device keys. This enables rotation without re-issuing the DID.
- The document is hosted by the user at any publicly reachable URL (GitHub Gist, own server, IPFS, etc.).

This is deliberately not a full KERI implementation — there is no event log and no witness network in v1. It captures the most valuable properties (self-certifying ID, prerotation commitment, device delegation) with a fraction of the complexity.

---

## Consequences

**Positive**
- The DID ID is self-certifying: any party can verify the binding between `id` and `rootKey.publicKey` without contacting a registry.
- No central authority; the user controls where the document is hosted.
- Prerotation hashes are in place — the protocol can be upgraded to support key rotation without changing the DID.
- Device delegation is cryptographically verifiable — a compromised device key cannot be used to forge a new delegation.

**Negative**
- The custom `did:realz` method is not interoperable with the broader DID ecosystem (DIF resolvers, Verifiable Credentials tooling) without a resolver specification.
- There is no revocation mechanism in v1 — a compromised root key cannot be revoked until key rotation is implemented.
- The document is a single snapshot; there is no event log, so the history of key changes is not provable in v1.
- The user must manually host their DID document — this is a UX hurdle compared to custodial identity systems.
- Imported identities are read-only (no private keys); the device delegation flow for restoring on a second device is not yet implemented.
