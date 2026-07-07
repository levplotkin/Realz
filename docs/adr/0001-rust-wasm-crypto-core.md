# ADR-0001: Rust + WASM for the cryptographic core

**Status**: Accepted  
**Date**: 2025-06

---

## Context

Realz requires Ed25519 key generation, document signing, signature verification, and SHA-256 key derivation — all running in a browser with no server-side component. The implementation needs to be:

- Auditable and correct — cryptographic code is hard to get right in JavaScript
- Fast — key generation and document signing happen on the critical path of onboarding
- Portable — must run on mobile browsers without native plugins

The main alternatives considered:

1. **Pure JavaScript** (e.g., `noble-ed25519`) — mature libraries exist, but the JS ecosystem for crypto has fragmented APIs and higher risk of supply-chain issues.
2. **WebCrypto API** — browser-native, but does not support Ed25519 in all engines at the time of this decision; no prerotation-key hashing scheme fits natively.
3. **Rust compiled to WASM** — the Rust crypto ecosystem (`ed25519-dalek`, `sha2`, `rand`) is well-audited and widely used. WASM runs near-native in modern browsers and gives us a hard boundary between private key material and JavaScript.

---

## Decision

All cryptographic operations live in a Rust crate (`core/`) compiled to WASM via `wasm-pack`. The JavaScript layer only ever receives base64url-encoded public keys, signatures, and signed documents. Private keys are generated inside WASM using OS entropy (`getrandom` with the `js` feature), passed to JavaScript exactly once as base64url strings for IndexedDB storage, and re-supplied by the caller only when a signing operation is needed.

---

## Consequences

**Positive**
- Auditable crypto: the core uses `ed25519-dalek 2.x` and `sha2 0.10`, both widely reviewed.
- Hard isolation: the WASM module cannot be reached by arbitrary JS; all inputs/outputs are explicitly typed.
- Rust's type system enforces that key material cannot be accidentally serialized or logged.
- WASM binary is small (`opt-level = "s"`) and loads lazily before the first identity operation.

**Negative**
- Build toolchain is heavier: contributors need Rust + `wasm-pack` in addition to Node.
- WASM must be pre-built and committed to `public/wasm/` for the dev server to work without running `wasm-pack` locally (or built as part of CI).
- Debugging crashes in WASM requires source maps; stack traces in the browser are less readable than pure JS.
- The WASM module is loaded with a dynamic `import()` keyed to `BASE_URL`, which is unusual and not covered by Vite's standard module graph (workaround: `/* @vite-ignore */`).
