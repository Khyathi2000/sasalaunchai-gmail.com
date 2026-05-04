// Local AES-256-GCM KMS for dev/test. The "master key" lives in
// LAUNCH_KMS_MASTER_KEY (32 bytes, base64). DO NOT use in production —
// the master key is unprotected on disk / in env.

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import type { KmsProvider, WrappedDek } from "./index.js";

const KEY_REF = "local:aes-256-gcm";
const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

export class LocalKms implements KmsProvider {
  private masterKey: Buffer;

  constructor(masterKey?: Buffer) {
    if (masterKey) {
      this.masterKey = masterKey;
    } else {
      const env = process.env.LAUNCH_KMS_MASTER_KEY;
      if (env) {
        const decoded = Buffer.from(env, "base64");
        if (decoded.length !== 32) {
          throw new Error(
            `LAUNCH_KMS_MASTER_KEY must decode to 32 bytes, got ${decoded.length}`,
          );
        }
        this.masterKey = decoded;
      } else {
        if (process.env.NODE_ENV === "production") {
          throw new Error(
            "LocalKms cannot run in production without LAUNCH_KMS_MASTER_KEY",
          );
        }
        // Dev fallback: deterministic key so restarts don't lose data
        // locally. Logged so it's never silently used in prod.
        // eslint-disable-next-line no-console
        console.warn(
          "[kms] No LAUNCH_KMS_MASTER_KEY set — using dev-only deterministic key",
        );
        this.masterKey = Buffer.alloc(32, 0x42);
      }
    }
  }

  async wrapDek(dek: Buffer): Promise<WrappedDek> {
    if (dek.length !== 32) {
      throw new Error(`DEK must be 32 bytes, got ${dek.length}`);
    }
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, this.masterKey, iv);
    const ct = Buffer.concat([cipher.update(dek), cipher.final()]);
    const tag = cipher.getAuthTag();
    // Layout: iv || tag || ciphertext
    return {
      wrappedDek: Buffer.concat([iv, tag, ct]),
      keyRef: KEY_REF,
    };
  }

  async unwrapDek(wrappedDek: Buffer, keyRef: string): Promise<Buffer> {
    if (keyRef !== KEY_REF) {
      throw new Error(`LocalKms cannot unwrap key with ref ${keyRef}`);
    }
    if (wrappedDek.length !== IV_LEN + TAG_LEN + 32) {
      throw new Error(`wrappedDek wrong length: ${wrappedDek.length}`);
    }
    const iv = wrappedDek.subarray(0, IV_LEN);
    const tag = wrappedDek.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ct = wrappedDek.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv(ALGO, this.masterKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  }
}
