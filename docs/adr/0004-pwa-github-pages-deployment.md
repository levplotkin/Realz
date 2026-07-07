# ADR-0004: PWA deployed to GitHub Pages via GitHub Actions

**Status**: Accepted  
**Date**: 2025-06

---

## Context

Realz needs a hosting target that:

- Has zero ongoing infrastructure cost
- Supports HTTPS (required by service workers, Web Bluetooth, and IndexedDB on iOS)
- Can be updated automatically on every push to `main`
- Does not require a server (the app is entirely client-side)

---

## Decision

Deploy as a **Vite PWA** to **GitHub Pages** using **GitHub Actions**.

- `vite-plugin-pwa` generates a service worker and web manifest, enabling offline support and "Add to Home Screen" on Android/iOS.
- The GitHub Actions workflow (`deploy.yml`) builds the WASM core with `wasm-pack`, then builds the React app with `npm run build`, and uploads `app/dist/` as a Pages artifact.
- The deployment uses the official `actions/deploy-pages@v4` action with the OIDC token — no static deploy keys needed.
- `concurrency.cancel-in-progress: false` — Pages deployments must not be cancelled mid-call; doing so corrupts the deployment state and causes the next run to fail with "Deployment failed, try again later."
- The Vite `base` is set to `/Realz/` to match the GitHub Pages subpath.

---

## Consequences

**Positive**
- Zero hosting cost.
- HTTPS out of the box — required for service workers, Web Bluetooth API, and `navigator.geolocation`.
- Automatic deploys on push: the full WASM build + React build is reproducible in CI.
- The PWA manifest enables installability: users can add Realz to their home screen without an app store.
- OIDC-based deployment requires no secrets rotation.

**Negative**
- GitHub Pages is not designed for apps with client-side routing — any deep-link URL that is not the root will return a 404 on hard refresh. Mitigated by the single-page architecture (all routing is in-memory state, not URL paths).
- The WASM binary is served as a static file from `public/wasm/`; it must be built before `vite build` runs. The CI workflow handles this, but local dev requires running `wasm-pack build` first.
- GitHub Pages enforces a 1 GB repository size limit and a 100 MB file size limit — the WASM binary and JS bundle must stay well under these.
- GitHub Pages has no server-side logic; the Gun.js relay (`gun-manhattan.herokuapp.com`) is needed for any real-time discovery. If that relay is unavailable, discovery is limited to QR/invite links.
- The `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` env var is set in the deploy job to suppress Node 20 deprecation warnings from the Pages action. This should be removed once `actions/deploy-pages` ships a Node 24-native release.
