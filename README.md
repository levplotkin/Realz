# Realz

P2P social network with trust networks and distributed identity.

**Live**: https://levplotkin.github.io/Realz/

**Stack**: Rust (WASM core) + React + Vite PWA + Gun.js

## Architecture

```
core/        Rust crate → compiled to WASM via wasm-pack
app/         React + Vite PWA shell, loads WASM + Gun.js
```

## Local dev

```bash
# Build WASM core
wasm-pack build core --target web --out-dir ../app/wasm

# Run React app
cd app && npm install && npm run dev
```

## Deployment

Push to `main` → GitHub Actions builds WASM + React → deploys to GitHub Pages.

Requires GitHub Pages enabled with source set to **GitHub Actions** in repo Settings → Pages.
