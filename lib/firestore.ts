// Lazy Firestore client. Uses Application Default Credentials, which
// are automatically attached on Cloud Run via the runtime service account
// (sasa-runtime). For local dev: `gcloud auth application-default login`.

import { Firestore } from "@google-cloud/firestore";

let client: Firestore | null = null;

export function firestore(): Firestore {
  if (!client) {
    client = new Firestore({
      ignoreUndefinedProperties: true,
    });
  }
  return client;
}
