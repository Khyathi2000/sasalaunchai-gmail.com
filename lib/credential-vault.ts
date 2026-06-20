// Per-user credential vault. Persists envelope-encrypted AWS / GCP
// credentials in Postgres so they survive instance restarts and are scoped
// to a single Clerk user.
//
// Encryption flow (write):
//   1. Generate fresh 32-byte DEK.
//   2. Encrypt the credential blob with the DEK (AES-256-GCM).
//   3. Wrap the DEK under the configured KMS master key.
//   4. Persist {ciphertext, wrappedDek, kmsKeyRef, public metadata} in
//      `credentials` table, scoped by user_id + provider + label.
//
// Decryption flow (read):
//   1. SELECT row by user_id + provider + label.
//   2. Unwrap the DEK via KMS.
//   3. Decrypt the ciphertext with the DEK.
//
// The plaintext credential never touches Postgres and never leaves this
// module's stack frame longer than one request.

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "./db/index.js";
import { credentials, type CredentialRow } from "./db/schema.js";
import { kms } from "./kms/index.js";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

export type Provider = "aws" | "gcp";

export interface AwsCredentialPlaintext {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
}

export interface GcpCredentialPlaintext {
  serviceAccountJson: string;
  projectId?: string;
}

export type CredentialPlaintext = AwsCredentialPlaintext | GcpCredentialPlaintext;

export interface StoredCredentialMetadata {
  id: string;
  provider: Provider;
  label: string;
  awsAccountId?: string;
  awsRegion?: string;
  gcpProjectId?: string;
  createdAt: Date;
  updatedAt: Date;
}

function isAws(p: CredentialPlaintext): p is AwsCredentialPlaintext {
  return "accessKeyId" in p;
}

function deriveAwsAccountId(accessKeyId: string): string | undefined {
  // Best-effort: the first 4 chars of an AKID encode the account type
  // (AKIA, ASIA, etc.). We don't try to derive the full account number
  // here — the actual account-id only comes from a live STS call. Just
  // return null and let the API route call STS once + persist the result.
  return undefined;
}

interface EncryptedBlob {
  ciphertext: Buffer;
  wrappedDek: Buffer;
  kmsKeyRef: string;
}

async function encryptPayload(payload: string): Promise<EncryptedBlob> {
  const dek = randomBytes(32);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, dek, iv);
  const ct = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Layout in the `ciphertext` column: iv || tag || aes-gcm-ciphertext
  const ciphertext = Buffer.concat([iv, tag, ct]);
  const { wrappedDek, keyRef } = await kms().wrapDek(dek);
  return { ciphertext, wrappedDek, kmsKeyRef: keyRef };
}

async function decryptPayload(row: CredentialRow): Promise<string> {
  const dek = await kms().unwrapDek(row.wrappedDek, row.kmsKeyRef);
  if (row.ciphertext.length < IV_LEN + TAG_LEN) {
    throw new Error(`credential ciphertext too short: ${row.ciphertext.length}`);
  }
  const iv = row.ciphertext.subarray(0, IV_LEN);
  const tag = row.ciphertext.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = row.ciphertext.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, dek, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

export interface PutCredentialInput {
  userId: string;
  provider: Provider;
  label?: string;
  payload: CredentialPlaintext;
  /** Optional public metadata that the UI can show without decrypting. */
  awsAccountId?: string;
  awsRegion?: string;
  gcpProjectId?: string;
}

export async function putCredential(
  input: PutCredentialInput,
): Promise<StoredCredentialMetadata> {
  const label = input.label ?? "default";
  const json = JSON.stringify(input.payload);
  const enc = await encryptPayload(json);

  const awsAccountId =
    input.awsAccountId ??
    (isAws(input.payload) ? deriveAwsAccountId(input.payload.accessKeyId) : undefined);
  const awsRegion = input.awsRegion ?? (isAws(input.payload) ? input.payload.region : undefined);
  const gcpProjectId =
    input.gcpProjectId ?? (!isAws(input.payload) ? input.payload.projectId : undefined);

  const [row] = await db()
    .insert(credentials)
    .values({
      userId: input.userId,
      provider: input.provider,
      label,
      ciphertext: enc.ciphertext,
      wrappedDek: enc.wrappedDek,
      kmsKeyRef: enc.kmsKeyRef,
      awsAccountId,
      awsRegion,
      gcpProjectId,
    })
    .onConflictDoUpdate({
      target: [credentials.userId, credentials.provider, credentials.label],
      set: {
        ciphertext: enc.ciphertext,
        wrappedDek: enc.wrappedDek,
        kmsKeyRef: enc.kmsKeyRef,
        awsAccountId,
        awsRegion,
        gcpProjectId,
        updatedAt: new Date(),
      },
    })
    .returning();

  return rowToMetadata(row);
}

export async function getCredential(
  userId: string,
  provider: Provider,
  label = "default",
): Promise<{ metadata: StoredCredentialMetadata; payload: CredentialPlaintext } | null> {
  const rows = await db()
    .select()
    .from(credentials)
    .where(
      and(
        eq(credentials.userId, userId),
        eq(credentials.provider, provider),
        eq(credentials.label, label),
      ),
    )
    .limit(1);
  if (rows.length === 0) return null;
  const row = rows[0];
  const json = await decryptPayload(row);
  return {
    metadata: rowToMetadata(row),
    payload: JSON.parse(json) as CredentialPlaintext,
  };
}

export async function listCredentials(
  userId: string,
  provider?: Provider,
): Promise<StoredCredentialMetadata[]> {
  const where = provider
    ? and(eq(credentials.userId, userId), eq(credentials.provider, provider))
    : eq(credentials.userId, userId);
  const rows = await db().select().from(credentials).where(where);
  return rows.map(rowToMetadata);
}

export async function deleteCredential(
  userId: string,
  provider: Provider,
  label = "default",
): Promise<boolean> {
  const result = await db()
    .delete(credentials)
    .where(
      and(
        eq(credentials.userId, userId),
        eq(credentials.provider, provider),
        eq(credentials.label, label),
      ),
    )
    .returning({ id: credentials.id });
  return result.length > 0;
}

function rowToMetadata(row: CredentialRow): StoredCredentialMetadata {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    awsAccountId: row.awsAccountId ?? undefined,
    awsRegion: row.awsRegion ?? undefined,
    gcpProjectId: row.gcpProjectId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
