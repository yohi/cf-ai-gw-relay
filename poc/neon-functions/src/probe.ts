import { randomUUID } from "node:crypto";
import { MockCredentialCipher } from "./crypto.ts";
import type { StateStore } from "./store.ts";

export async function probeStore(store: StateStore, cipher: MockCredentialCipher) {
  const id = `poc-${randomUUID()}`;
  try {
    if (!(await store.create(id, cipher.seal("synthetic-state-1")))) throw new Error("create_failed");
    const first = await store.read(id);
    if (!first || first.version !== 1 || cipher.open(first.ciphertext) !== "synthetic-state-1") {
      throw new Error("initial_read_failed");
    }
    const invalid = await store.compareAndSwap(id, 0, cipher.seal("should-not-win"));
    if (invalid) throw new Error("stale_update_accepted");
    const updated = await store.compareAndSwap(id, 1, cipher.seal("synthetic-state-2"));
    if (!updated) throw new Error("cas_failed");
    const final = await store.read(id);
    if (!final || final.version !== 2 || cipher.open(final.ciphertext) !== "synthetic-state-2") {
      throw new Error("updated_read_failed");
    }
    return { ok: true, encryptedAtRest: true, staleUpdateRejected: true, finalVersion: 2 };
  } finally {
    await store.delete(id);
  }
}
