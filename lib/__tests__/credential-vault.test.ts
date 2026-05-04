import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../db/index.js";
import { credentials, sessions, users } from "../db/schema.js";
import {
  putCredential,
  getCredential,
  listCredentials,
  deleteCredential,
} from "../credential-vault.js";
import { ensureUserById } from "../auth/user-test-helpers.js";

beforeEach(async () => {
  // Wipe between tests so unique-index conflicts don't leak.
  await db().delete(credentials);
  await db().delete(sessions);
  await db().delete(users);
});

describe("credential-vault", () => {
  it("stores AWS creds and round-trips them", async () => {
    await ensureUserById("user_a");
    const meta = await putCredential({
      userId: "user_a",
      provider: "aws",
      payload: {
        accessKeyId: "AKIATEST",
        secretAccessKey: "supersecret",
        region: "us-east-1",
      },
      awsRegion: "us-east-1",
    });
    expect(meta.provider).toBe("aws");
    expect(meta.label).toBe("default");
    expect(meta.awsRegion).toBe("us-east-1");

    const got = await getCredential("user_a", "aws");
    expect(got).toBeTruthy();
    if (!got) throw new Error("unreachable");
    expect((got.payload as { accessKeyId: string }).accessKeyId).toBe("AKIATEST");
    expect((got.payload as { secretAccessKey: string }).secretAccessKey).toBe("supersecret");
  });

  it("stores GCP creds and round-trips them", async () => {
    await ensureUserById("user_b");
    const sa = JSON.stringify({
      type: "service_account",
      project_id: "proj-123",
      client_email: "sa@proj.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----",
    });
    const meta = await putCredential({
      userId: "user_b",
      provider: "gcp",
      payload: { serviceAccountJson: sa, projectId: "proj-123" },
      gcpProjectId: "proj-123",
    });
    expect(meta.gcpProjectId).toBe("proj-123");

    const got = await getCredential("user_b", "gcp");
    if (!got) throw new Error("unreachable");
    expect((got.payload as { serviceAccountJson: string }).serviceAccountJson).toBe(sa);
  });

  it("isolates credentials per user (user A cannot read user B)", async () => {
    await ensureUserById("alice");
    await ensureUserById("bob");
    await putCredential({
      userId: "alice",
      provider: "aws",
      payload: { accessKeyId: "AKIA-A", secretAccessKey: "secret-A", region: "us-west-2" },
    });
    await putCredential({
      userId: "bob",
      provider: "aws",
      payload: { accessKeyId: "AKIA-B", secretAccessKey: "secret-B", region: "eu-west-1" },
    });

    const aliceCred = await getCredential("alice", "aws");
    const bobCred = await getCredential("bob", "aws");
    expect((aliceCred!.payload as { accessKeyId: string }).accessKeyId).toBe("AKIA-A");
    expect((bobCred!.payload as { accessKeyId: string }).accessKeyId).toBe("AKIA-B");

    const aliceList = await listCredentials("alice");
    expect(aliceList).toHaveLength(1);
    expect(aliceList[0].id).toBe(aliceCred!.metadata.id);
  });

  it("upserts on the unique (user, provider, label) index", async () => {
    await ensureUserById("user_c");
    await putCredential({
      userId: "user_c",
      provider: "aws",
      payload: { accessKeyId: "v1", secretAccessKey: "s1", region: "us-east-1" },
    });
    await putCredential({
      userId: "user_c",
      provider: "aws",
      payload: { accessKeyId: "v2", secretAccessKey: "s2", region: "us-east-1" },
    });
    const list = await listCredentials("user_c", "aws");
    expect(list).toHaveLength(1);
    const got = await getCredential("user_c", "aws");
    expect((got!.payload as { accessKeyId: string }).accessKeyId).toBe("v2");
  });

  it("supports multiple labels per provider", async () => {
    await ensureUserById("user_d");
    await putCredential({
      userId: "user_d",
      provider: "aws",
      label: "prod",
      payload: { accessKeyId: "PROD", secretAccessKey: "p", region: "us-east-1" },
    });
    await putCredential({
      userId: "user_d",
      provider: "aws",
      label: "staging",
      payload: { accessKeyId: "STG", secretAccessKey: "s", region: "us-east-1" },
    });
    const list = await listCredentials("user_d", "aws");
    expect(list.map((m) => m.label).sort()).toEqual(["prod", "staging"]);
  });

  it("deletes a stored credential", async () => {
    await ensureUserById("user_e");
    await putCredential({
      userId: "user_e",
      provider: "gcp",
      payload: {
        serviceAccountJson: JSON.stringify({
          client_email: "x@y",
          project_id: "p",
        }),
      },
    });
    expect(await deleteCredential("user_e", "gcp")).toBe(true);
    expect(await getCredential("user_e", "gcp")).toBeNull();
    expect(await deleteCredential("user_e", "gcp")).toBe(false); // already gone
  });

  it("ciphertext on disk does not contain plaintext secrets", async () => {
    await ensureUserById("user_f");
    await putCredential({
      userId: "user_f",
      provider: "aws",
      payload: {
        accessKeyId: "AKIA-LEAKABLE",
        secretAccessKey: "this-is-the-secret-do-not-leak",
        region: "us-east-1",
      },
    });
    const rows = await db().select().from(credentials);
    expect(rows).toHaveLength(1);
    const ct = rows[0].ciphertext.toString("utf8");
    expect(ct).not.toContain("AKIA-LEAKABLE");
    expect(ct).not.toContain("this-is-the-secret-do-not-leak");
  });
});
