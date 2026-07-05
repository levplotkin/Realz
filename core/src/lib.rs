use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use wasm_bindgen::prelude::*;

// ── types ──────────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
struct KeySlot {
    #[serde(rename = "publicKey")]
    public_key: String,      // base64url(raw 32 bytes)
    #[serde(rename = "nextKeyHash")]
    next_key_hash: String,   // base64url(sha256(prerotation_pubkey))
}

#[derive(Serialize, Deserialize, Clone)]
struct DeviceEntry {
    id: String,
    #[serde(rename = "publicKey")]
    public_key: String,
    #[serde(rename = "nextKeyHash")]
    next_key_hash: String,
    delegation: String,      // base64url(root_sig over canonical delegation bytes)
}

#[derive(Serialize, Deserialize, Clone)]
struct Profile {
    name: String,
    bio: String,
    #[serde(rename = "avatarUrl")]
    avatar_url: String,
}

#[derive(Serialize, Deserialize)]
struct DidDocument {
    version: u32,
    id: String,
    #[serde(rename = "rootKey")]
    root_key: KeySlot,
    devices: Vec<DeviceEntry>,
    profile: Profile,
    #[serde(rename = "updatedAt")]
    updated_at: String,
    // signature is appended after the rest is serialized
    signature: String,
}

// ── JS-facing return types ─────────────────────────────────────────────────────

#[wasm_bindgen]
pub struct GeneratedIdentity {
    root_signing_key: SigningKey,
    root_prerotation_key: SigningKey,
    device_signing_key: SigningKey,
    device_prerotation_key: SigningKey,
    did_id: String,
}

#[wasm_bindgen]
impl GeneratedIdentity {
    pub fn did_id(&self) -> String {
        self.did_id.clone()
    }

    /// Returns the root private key as base64url — store in IndexedDB, keep cold.
    pub fn root_private_key(&self) -> String {
        b64(self.root_signing_key.as_bytes())
    }

    /// Returns the root prerotation private key as base64url — store in IndexedDB, keep secret.
    pub fn root_prerotation_private_key(&self) -> String {
        b64(self.root_prerotation_key.as_bytes())
    }

    /// Returns the device private key as base64url — used for daily signing ops.
    pub fn device_private_key(&self) -> String {
        b64(self.device_signing_key.as_bytes())
    }

    /// Returns the device prerotation private key as base64url.
    pub fn device_prerotation_private_key(&self) -> String {
        b64(self.device_prerotation_key.as_bytes())
    }

    /// Builds the initial signed DID document JSON ready to host at any URL.
    pub fn build_did_document(
        &self,
        device_id: String,
        name: String,
        bio: String,
        avatar_url: String,
        updated_at: String,
    ) -> Result<String, JsError> {
        let root_pub = b64(self.root_signing_key.verifying_key().as_bytes());
        let root_pre_pub = b64(self.root_prerotation_key.verifying_key().as_bytes());
        let device_pub = b64(self.device_signing_key.verifying_key().as_bytes());
        let device_pre_pub = b64(self.device_prerotation_key.verifying_key().as_bytes());

        let delegation = sign_delegation_bytes(
            &self.root_signing_key,
            &device_pub,
            &self.did_id,
            &updated_at,
        );

        let mut doc = DidDocument {
            version: 1,
            id: self.did_id.clone(),
            root_key: KeySlot {
                public_key: root_pub,
                next_key_hash: key_hash(&root_pre_pub),
            },
            devices: vec![DeviceEntry {
                id: device_id,
                public_key: device_pub,
                next_key_hash: key_hash(&device_pre_pub),
                delegation,
            }],
            profile: Profile { name, bio, avatar_url },
            updated_at,
            signature: String::new(),
        };

        doc.signature = sign_document(&self.root_signing_key, &doc)?;
        serde_json::to_string_pretty(&doc).map_err(|e| JsError::new(&e.to_string()))
    }
}

// ── public WASM functions ──────────────────────────────────────────────────────

/// Generate a fresh root identity (root keypair + device keypair + prerotation pairs).
#[wasm_bindgen]
pub fn generate_identity() -> GeneratedIdentity {
    let root_signing_key = SigningKey::generate(&mut OsRng);
    let root_prerotation_key = SigningKey::generate(&mut OsRng);
    let device_signing_key = SigningKey::generate(&mut OsRng);
    let device_prerotation_key = SigningKey::generate(&mut OsRng);

    let did_id = compute_did_id_from_key(&root_signing_key);

    GeneratedIdentity {
        root_signing_key,
        root_prerotation_key,
        device_signing_key,
        device_prerotation_key,
        did_id,
    }
}

/// Verify a DID document fetched from a URL.
/// Returns a JSON string: { valid, id, name, bio, avatarUrl, error? }
#[wasm_bindgen]
pub fn verify_did_document(json: &str) -> String {
    match verify_doc_inner(json) {
        Ok(doc) => serde_json::json!({
            "valid": true,
            "id": doc.id,
            "name": doc.profile.name,
            "bio": doc.profile.bio,
            "avatarUrl": doc.profile.avatar_url,
        })
        .to_string(),
        Err(e) => serde_json::json!({ "valid": false, "error": e }).to_string(),
    }
}

/// Sign a delegation entry for a new device.
/// The new device generates its own keypair and passes the public key here.
/// The root key holder calls this and adds the result to the DID document.
#[wasm_bindgen]
pub fn sign_device_delegation(
    device_pubkey_b64: &str,
    did_id: &str,
    issued_at: &str,
    root_private_key_b64: &str,
) -> Result<String, JsError> {
    let root_key = load_signing_key(root_private_key_b64)?;
    Ok(sign_delegation_bytes(&root_key, device_pubkey_b64, did_id, issued_at))
}

/// Verify a device delegation signature.
/// Returns true if the delegation is a valid root-key signature for this device.
#[wasm_bindgen]
pub fn verify_device_delegation(
    device_pubkey_b64: &str,
    did_id: &str,
    issued_at: &str,
    root_pubkey_b64: &str,
    delegation_b64: &str,
) -> bool {
    let Ok(root_verifying_key) = load_verifying_key(root_pubkey_b64) else { return false };
    let Ok(sig_bytes) = URL_SAFE_NO_PAD.decode(delegation_b64) else { return false };
    let Ok(sig) = Signature::from_slice(&sig_bytes) else { return false };
    let msg = delegation_message(device_pubkey_b64, did_id, issued_at);
    root_verifying_key.verify(&msg, &sig).is_ok()
}

/// Sign an arbitrary payload with a device key.
/// Returns base64url signature.
#[wasm_bindgen]
pub fn sign_with_device(payload: &[u8], device_private_key_b64: &str) -> Result<String, JsError> {
    let key = load_signing_key(device_private_key_b64)?;
    Ok(b64(key.sign(payload).to_bytes().as_ref()))
}

/// Derive a DID ID from a root public key (base64url).
#[wasm_bindgen]
pub fn compute_did_id(root_pubkey_b64: &str) -> Result<String, JsError> {
    let pk_bytes = URL_SAFE_NO_PAD
        .decode(root_pubkey_b64)
        .map_err(|e| JsError::new(&e.to_string()))?;
    let hash = Sha256::digest(&pk_bytes);
    Ok(format!("did:realz:{}", b64(&hash)))
}

// ── helpers ────────────────────────────────────────────────────────────────────

fn b64(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}

fn key_hash(pubkey_b64: &str) -> String {
    // ponytail: hashing the already-b64-encoded form is intentional —
    // the hash is a commitment, not a key derivation step
    let hash = Sha256::digest(pubkey_b64.as_bytes());
    format!("sha256:{}", b64(&hash))
}

fn compute_did_id_from_key(signing_key: &SigningKey) -> String {
    let hash = Sha256::digest(signing_key.verifying_key().as_bytes());
    format!("did:realz:{}", b64(&hash))
}

fn load_signing_key(b64_key: &str) -> Result<SigningKey, JsError> {
    let bytes = URL_SAFE_NO_PAD
        .decode(b64_key)
        .map_err(|e| JsError::new(&e.to_string()))?;
    let arr: [u8; 32] = bytes
        .try_into()
        .map_err(|_| JsError::new("invalid key length"))?;
    Ok(SigningKey::from_bytes(&arr))
}

fn load_verifying_key(b64_key: &str) -> Result<VerifyingKey, JsError> {
    let bytes = URL_SAFE_NO_PAD
        .decode(b64_key)
        .map_err(|e| JsError::new(&e.to_string()))?;
    let arr: [u8; 32] = bytes
        .try_into()
        .map_err(|_| JsError::new("invalid key length"))?;
    VerifyingKey::from_bytes(&arr).map_err(|e| JsError::new(&e.to_string()))
}

fn delegation_message(device_pubkey: &str, did_id: &str, issued_at: &str) -> Vec<u8> {
    format!("delegate:{device_pubkey}:{did_id}:{issued_at}").into_bytes()
}

fn sign_delegation_bytes(
    root_key: &SigningKey,
    device_pubkey: &str,
    did_id: &str,
    issued_at: &str,
) -> String {
    let msg = delegation_message(device_pubkey, did_id, issued_at);
    b64(root_key.sign(&msg).to_bytes().as_ref())
}

fn sign_document(root_key: &SigningKey, doc: &DidDocument) -> Result<String, JsError> {
    // serialize doc with empty signature field, then sign the bytes
    let doc_for_signing = serde_json::json!({
        "version": doc.version,
        "id": doc.id,
        "rootKey": doc.root_key,
        "devices": doc.devices,
        "profile": doc.profile,
        "updatedAt": doc.updated_at,
    });
    let canonical = serde_json::to_vec(&doc_for_signing)
        .map_err(|e| JsError::new(&e.to_string()))?;
    Ok(b64(root_key.sign(&canonical).to_bytes().as_ref()))
}

fn verify_doc_inner(json: &str) -> Result<DidDocument, String> {
    let doc: DidDocument =
        serde_json::from_str(json).map_err(|e| format!("parse error: {e}"))?;

    let root_pub_bytes = URL_SAFE_NO_PAD
        .decode(&doc.root_key.public_key)
        .map_err(|_| "invalid root public key encoding".to_string())?;
    let root_pub_arr: [u8; 32] = root_pub_bytes
        .try_into()
        .map_err(|_| "root public key wrong length".to_string())?;
    let root_verifying_key =
        VerifyingKey::from_bytes(&root_pub_arr).map_err(|e| e.to_string())?;

    // verify id matches root public key
    let expected_id = {
        let hash = Sha256::digest(&root_pub_arr);
        format!("did:realz:{}", b64(&hash))
    };
    if doc.id != expected_id {
        return Err(format!("DID ID mismatch: expected {expected_id}, got {}", doc.id));
    }

    // verify document signature
    let sig_bytes = URL_SAFE_NO_PAD
        .decode(&doc.signature)
        .map_err(|_| "invalid signature encoding".to_string())?;
    let sig = Signature::from_slice(&sig_bytes).map_err(|e| e.to_string())?;

    let doc_for_verify = serde_json::json!({
        "version": doc.version,
        "id": doc.id,
        "rootKey": doc.root_key,
        "devices": doc.devices,
        "profile": doc.profile,
        "updatedAt": doc.updated_at,
    });
    let canonical = serde_json::to_vec(&doc_for_verify).map_err(|e| e.to_string())?;
    root_verifying_key
        .verify(&canonical, &sig)
        .map_err(|_| "signature verification failed".to_string())?;

    Ok(doc)
}

/// Returns true if the provided private key is the root controlling key for this DID document.
#[wasm_bindgen]
pub fn verify_root_key_matches_did(did_json: &str, root_private_key_b64: &str) -> bool {
    let Ok(doc) = serde_json::from_str::<DidDocument>(did_json) else { return false };
    let Ok(key) = load_signing_key(root_private_key_b64) else { return false };
    compute_did_id_from_key(&key) == doc.id
}

/// Update profile fields in an existing DID document and re-sign with root key.
#[wasm_bindgen]
pub fn update_did_document(
    existing_json: &str,
    name: String,
    bio: String,
    avatar_url: String,
    updated_at: String,
    root_private_key_b64: &str,
) -> Result<String, JsError> {
    let mut doc: DidDocument =
        serde_json::from_str(existing_json).map_err(|e| JsError::new(&e.to_string()))?;
    let root_key = load_signing_key(root_private_key_b64)?;
    doc.profile = Profile { name, bio, avatar_url };
    doc.updated_at = updated_at;
    doc.signature = sign_document(&root_key, &doc)?;
    serde_json::to_string_pretty(&doc).map_err(|e| JsError::new(&e.to_string()))
}

// ── keep old stubs so existing React code doesn't break ───────────────────────

#[wasm_bindgen]
pub fn version() -> String {
    "0.2.0".to_string()
}

#[wasm_bindgen]
pub fn render_square() -> String {
    "red".to_string()
}
