// GCP Cloud KMS adapter. Wraps DEKs with a symmetric Cloud KMS key.
//
// The key must be provisioned ahead of time:
//
//   gcloud kms keyrings create launch \
//     --project=$GCP_PROJECT_ID --location=global
//   gcloud kms keys create credentials \
//     --project=$GCP_PROJECT_ID --location=global \
//     --keyring=launch --purpose=encryption \
//     --rotation-period=90d --next-rotation-time=$(date -u -d '+90 days' +%Y-%m-%dT%H:%M:%SZ)
//
// Then set:
//   LAUNCH_GCP_KMS_KEY_NAME=projects/$GCP_PROJECT_ID/locations/global/keyRings/launch/cryptoKeys/credentials
//   LAUNCH_KMS_PROVIDER=gcp

import type { KmsProvider, WrappedDek } from "./index.js";

interface KMSClientLike {
  encrypt(req: {
    name: string;
    plaintext: Buffer;
  }): Promise<[{ ciphertext: Uint8Array | Buffer | string }]>;
  decrypt(req: {
    name: string;
    ciphertext: Buffer;
  }): Promise<[{ plaintext: Uint8Array | Buffer | string }]>;
}

export class GcpKms implements KmsProvider {
  private keyName: string;
  private clientPromise: Promise<KMSClientLike> | null = null;

  constructor(keyName: string) {
    if (!keyName) {
      throw new Error("GcpKms requires a Cloud KMS key resource name");
    }
    this.keyName = keyName;
  }

  private async client(): Promise<KMSClientLike> {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const mod = await import("@google-cloud/kms");
        return new mod.KeyManagementServiceClient() as unknown as KMSClientLike;
      })();
    }
    return this.clientPromise;
  }

  async wrapDek(dek: Buffer): Promise<WrappedDek> {
    if (dek.length !== 32) {
      throw new Error(`DEK must be 32 bytes, got ${dek.length}`);
    }
    const c = await this.client();
    const [resp] = await c.encrypt({ name: this.keyName, plaintext: dek });
    if (!resp.ciphertext) {
      throw new Error("Cloud KMS returned no ciphertext");
    }
    return {
      wrappedDek: Buffer.from(resp.ciphertext as Uint8Array),
      keyRef: this.keyName,
    };
  }

  async unwrapDek(wrappedDek: Buffer, keyRef: string): Promise<Buffer> {
    // We tolerate unwrap with the currently-configured key even if the
    // stored ref differs — Cloud KMS handles versioning internally.
    const c = await this.client();
    const [resp] = await c.decrypt({ name: keyRef || this.keyName, ciphertext: wrappedDek });
    if (!resp.plaintext) {
      throw new Error("Cloud KMS returned no plaintext");
    }
    return Buffer.from(resp.plaintext as Uint8Array);
  }
}
