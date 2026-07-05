// Identity layer: IndexedDB persistence + thin wrappers around WASM functions.
// Private keys never leave this module except as raw bytes going into IndexedDB.

const DB_NAME = 'realz'
const DB_VERSION = 1
const STORE = 'identity'

export interface Identity {
  didId: string
  didUrl: string
  didJson: string
  deviceId: string
  // private keys exposed only for WASM calls, never serialized over the wire
  rootPrivateKey: string
  devicePrivateKey: string
  rootPrerotationPrivateKey: string
  devicePrerotationPrivateKey: string
}

export interface DidProfile {
  name: string
  bio: string
  avatarUrl: string
}

// ── IndexedDB ──────────────────────────────────────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function dbGet<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
}

function dbPut(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const req = tx.objectStore(STORE).put(value, key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

function dbDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const req = tx.objectStore(STORE).delete(key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

// ── public API ─────────────────────────────────────────────────────────────────

export async function loadIdentity(): Promise<Identity | null> {
  const db = await openDb()
  const record = await dbGet<Identity>(db, 'current')
  if (!record) return null
  return record
}

export async function saveIdentity(record: Identity): Promise<void> {
  const db = await openDb()
  await dbPut(db, 'current', record)
}

export async function clearIdentity(): Promise<void> {
  const db = await openDb()
  await dbDelete(db, 'current')
}

/** Create a brand-new identity. Returns the unsigned DID document JSON to be hosted. */
export async function createIdentity(
  wasm: typeof import('realz-core'),
  deviceId: string,
  profile: DidProfile,
  updatedAt: string,
): Promise<{ identity: Identity; didJson: string }> {
  const gen = wasm.generate_identity()

  const didJson = gen.build_did_document(
    deviceId,
    profile.name,
    profile.bio,
    profile.avatarUrl,
    updatedAt,
  )

  const identity: Identity = {
    didId: gen.did_id(),
    didUrl: '',          // filled in after user hosts the document
    didJson,
    rootPrivateKey: gen.root_private_key(),
    rootPrerotationPrivateKey: gen.root_prerotation_private_key(),
    deviceId,
    devicePrivateKey: gen.device_private_key(),
    devicePrerotationPrivateKey: gen.device_prerotation_private_key(),
  }

  gen.free()
  return { identity, didJson }
}

/** Verify a DID document fetched from a URL. Returns parsed result. */
export function verifyDidDocument(
  wasm: typeof import('realz-core'),
  json: string,
): { valid: boolean; id?: string; name?: string; bio?: string; avatarUrl?: string; error?: string } {
  return JSON.parse(wasm.verify_did_document(json))
}

/** Import an existing identity from a URL (for restoring on a new device, delegating later). */
export async function importIdentityFromUrl(
  wasm: typeof import('realz-core'),
  url: string,
): Promise<{ valid: boolean; id?: string; name?: string; error?: string; didJson?: string }> {
  let json: string
  try {
    const res = await fetch(url)
    if (!res.ok) return { valid: false, error: `fetch failed: ${res.status}` }
    json = await res.text()
  } catch (e) {
    return { valid: false, error: String(e) }
  }
  const result = verifyDidDocument(wasm, json)
  if (!result.valid) return result
  return { ...result, didJson: json }
}

/** Persist the DID URL after user has hosted the document. */
export async function setDidUrl(url: string): Promise<void> {
  const db = await openDb()
  const record = await dbGet<Identity>(db, 'current')
  if (!record) return
  record.didUrl = url
  await dbPut(db, 'current', record)
}

/** Update profile, re-sign doc with root key, return new JSON to re-host. */
export async function updateProfile(
  wasm: typeof import('realz-core'),
  identity: Identity,
  profile: DidProfile,
  updatedAt: string,
): Promise<string> {
  const newJson = wasm.update_did_document(
    identity.didJson,
    profile.name,
    profile.bio,
    profile.avatarUrl,
    updatedAt,
    identity.rootPrivateKey,
  )
  const db = await openDb()
  const record = await dbGet<Identity>(db, 'current')
  if (record) {
    record.didJson = newJson
    await dbPut(db, 'current', record)
  }
  return newJson
}
