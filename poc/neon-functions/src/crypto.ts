import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

const VERSION = 1;

export function constantTimeBearer(request: Request, expected: string): boolean {
  if (expected.length < 32) return false;
  const header = request.headers.get("authorization");
  if (header === null || !header.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7), "utf8");
  const secret = Buffer.from(expected, "utf8");
  return supplied.length === secret.length && timingSafeEqual(supplied, secret);
}

export class MockCredentialCipher {
  readonly #key: Buffer;

  constructor(base64Key: string) {
    const key = Buffer.from(base64Key, "base64");
    if (key.length !== 32 || key.toString("base64") !== base64Key.trim()) {
      throw new Error("invalid_encryption_key");
    }
    this.#key = key;
  }

  seal(plaintext: string): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), encrypted]);
  }

  open(blob: Uint8Array): string {
    const bytes = Buffer.from(blob);
    if (bytes.length < 29 || bytes[0] !== VERSION) throw new Error("invalid_ciphertext");
    const iv = bytes.subarray(1, 13);
    const tag = bytes.subarray(13, 29);
    const payload = bytes.subarray(29);
    const decipher = createDecipheriv("aes-256-gcm", this.#key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(payload), decipher.final()]).toString("utf8");
  }
}
