// KMS provider abstraction.
//
// Envelope encryption: we generate a fresh per-record data encryption key
// (DEK), encrypt the credential payload with it, then wrap the DEK with a
// KMS key. The wrapped DEK + ciphertext are persisted; the master KMS key
// never leaves the KMS provider.
//
// Two implementations:
//   - LocalKms: AES-256-GCM with a master key from env. Used for dev/test
//     and as a graceful fallback when GCP KMS isn't configured.
//   - GcpKms: real Cloud KMS. Used in production once the key is
//     provisioned via scripts/gcp-bootstrap-m1.sh.

export interface WrappedDek {
  wrappedDek: Buffer;
  keyRef: string;
}

export interface KmsProvider {
  /**
   * Generate (or accept) a 32-byte data encryption key, wrap it under the
   * KMS master key, and return the ciphertext + a key reference that can
   * later unwrap it.
   */
  wrapDek(dek: Buffer): Promise<WrappedDek>;
  /**
   * Reverse of `wrapDek`. `keyRef` MUST match what was returned at wrap
   * time so we can rewrap on rotation.
   */
  unwrapDek(wrappedDek: Buffer, keyRef: string): Promise<Buffer>;
}

let _provider: KmsProvider | null = null;

export function kms(): KmsProvider {
  if (_provider) return _provider;
  const explicit = process.env.LAUNCH_KMS_PROVIDER;
  const useGcp =
    explicit === "gcp" || (!explicit && !!process.env.LAUNCH_GCP_KMS_KEY_NAME);
  if (useGcp) {
    // Lazy import keeps the GCP SDK out of test bundles.
    const { GcpKms } = require("./gcp-kms.js") as typeof import("./gcp-kms.js");
    _provider = new GcpKms(process.env.LAUNCH_GCP_KMS_KEY_NAME!);
  } else {
    const { LocalKms } = require("./local-kms.js") as typeof import("./local-kms.js");
    _provider = new LocalKms();
  }
  return _provider;
}

/** Test hook: inject a custom provider. */
export function setKmsProvider(p: KmsProvider | null): void {
  _provider = p;
}
