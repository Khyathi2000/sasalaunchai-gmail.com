import { describe, it, expect } from "vitest";
import { randomBytes } from "crypto";
import { LocalKms } from "../local-kms.js";

describe("LocalKms", () => {
  const key = Buffer.alloc(32, 0xaa);

  it("round-trips a wrapped DEK", async () => {
    const kms = new LocalKms(key);
    const dek = randomBytes(32);
    const { wrappedDek, keyRef } = await kms.wrapDek(dek);
    expect(wrappedDek.length).toBeGreaterThan(32); // iv + tag + ciphertext
    expect(keyRef).toBe("local:aes-256-gcm");
    const unwrapped = await kms.unwrapDek(wrappedDek, keyRef);
    expect(unwrapped.equals(dek)).toBe(true);
  });

  it("rejects DEKs that are not 32 bytes", async () => {
    const kms = new LocalKms(key);
    await expect(kms.wrapDek(randomBytes(16))).rejects.toThrow(/32 bytes/);
  });

  it("rejects unwrap with the wrong keyRef", async () => {
    const kms = new LocalKms(key);
    const { wrappedDek } = await kms.wrapDek(randomBytes(32));
    await expect(kms.unwrapDek(wrappedDek, "gcp:projects/foo")).rejects.toThrow(/cannot unwrap/);
  });

  it("rejects tampered wrapped DEKs (GCM tag check)", async () => {
    const kms = new LocalKms(key);
    const { wrappedDek, keyRef } = await kms.wrapDek(randomBytes(32));
    const tampered = Buffer.from(wrappedDek);
    tampered[tampered.length - 1] ^= 0xff;
    await expect(kms.unwrapDek(tampered, keyRef)).rejects.toThrow();
  });

  it("two LocalKms with different master keys cannot decrypt each other", async () => {
    const a = new LocalKms(Buffer.alloc(32, 0xaa));
    const b = new LocalKms(Buffer.alloc(32, 0xbb));
    const { wrappedDek, keyRef } = await a.wrapDek(randomBytes(32));
    await expect(b.unwrapDek(wrappedDek, keyRef)).rejects.toThrow();
  });
});
