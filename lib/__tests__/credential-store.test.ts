import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../db/index.js";
import { credentials, users } from "../db/schema.js";
import { putCredential } from "../credential-vault.js";
import {
  hydrateAllFromVault,
  hydrateFromVault,
  _resetEnvForTests,
} from "../credential-store.js";
import { ensureUserById } from "../auth/user-test-helpers.js";

beforeEach(async () => {
  await db().delete(credentials);
  await db().delete(users);
  _resetEnvForTests();
});

afterEach(() => {
  _resetEnvForTests();
});

describe("credential-store hydration", () => {
  it("hydrates AWS env from vault", async () => {
    await ensureUserById("user_aws");
    await putCredential({
      userId: "user_aws",
      provider: "aws",
      payload: {
        accessKeyId: "AKIATEST",
        secretAccessKey: "shh",
        sessionToken: "sst",
        region: "us-west-2",
      },
    });
    const ok = await hydrateFromVault("user_aws", "aws");
    expect(ok).toBe(true);
    expect(process.env.AWS_ACCESS_KEY_ID).toBe("AKIATEST");
    expect(process.env.AWS_SECRET_ACCESS_KEY).toBe("shh");
    expect(process.env.AWS_SESSION_TOKEN).toBe("sst");
    expect(process.env.AWS_REGION).toBe("us-west-2");
    expect(process.env.AWS_DEFAULT_REGION).toBe("us-west-2");
  });

  it("returns false when no credential is stored", async () => {
    await ensureUserById("user_empty");
    expect(await hydrateFromVault("user_empty", "aws")).toBe(false);
    expect(process.env.AWS_ACCESS_KEY_ID).toBeUndefined();
  });

  it("hydrates GCP credential to a 0600 temp file and sets env", async () => {
    await ensureUserById("user_gcp");
    const sa = JSON.stringify({
      type: "service_account",
      project_id: "proj-z",
      client_email: "sa@proj.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----",
    });
    await putCredential({
      userId: "user_gcp",
      provider: "gcp",
      payload: { serviceAccountJson: sa, projectId: "proj-z" },
    });
    const ok = await hydrateFromVault("user_gcp", "gcp");
    expect(ok).toBe(true);
    expect(process.env.GOOGLE_APPLICATION_CREDENTIALS).toBeTruthy();
    expect(process.env.GOOGLE_CLOUD_PROJECT).toBe("proj-z");

    const fs = await import("fs");
    const written = fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS!, "utf-8");
    expect(written).toBe(sa);
  });

  it("hydrateAllFromVault reports per-provider success", async () => {
    await ensureUserById("user_both");
    await putCredential({
      userId: "user_both",
      provider: "aws",
      payload: { accessKeyId: "k", secretAccessKey: "s", region: "us-east-1" },
    });
    const result = await hydrateAllFromVault("user_both");
    expect(result).toEqual({ aws: true, gcp: false });
  });
});
