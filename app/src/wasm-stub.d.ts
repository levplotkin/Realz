declare module 'realz-core' {
  /** wasm-bindgen init — call once with the path to the .wasm file */
  export default function init(wasmPath?: string | URL | RequestInfo): Promise<void>

  // legacy stubs
  export function version(): string
  export function render_square(): string

  export class GeneratedIdentity {
    did_id(): string
    root_private_key(): string
    root_prerotation_private_key(): string
    device_private_key(): string
    device_prerotation_private_key(): string
    build_did_document(
      device_id: string,
      name: string,
      bio: string,
      avatar_url: string,
      updated_at: string,
    ): string
    free(): void
  }

  export function generate_identity(): GeneratedIdentity

  /** Returns JSON string: { valid, id, name, bio, avatarUrl, error? } */
  export function verify_did_document(json: string): string

  export function sign_device_delegation(
    device_pubkey_b64: string,
    did_id: string,
    issued_at: string,
    root_private_key_b64: string,
  ): string

  export function verify_device_delegation(
    device_pubkey_b64: string,
    did_id: string,
    issued_at: string,
    root_pubkey_b64: string,
    delegation_b64: string,
  ): boolean

  /** Returns base64url signature */
  export function sign_with_device(payload: Uint8Array, device_private_key_b64: string): string

  export function compute_did_id(root_pubkey_b64: string): string

  export function verify_root_key_matches_did(did_json: string, root_private_key_b64: string): boolean

  export function update_did_document(
    existing_json: string,
    name: string,
    bio: string,
    avatar_url: string,
    updated_at: string,
    root_private_key_b64: string,
  ): string
}
