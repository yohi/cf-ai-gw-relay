/** Stores only AES-256-GCM ciphertext. No real OAuth credential is used by this PoC. */
export interface StateStore {
  read(accountId: string): Promise<{ ciphertext: Uint8Array; version: number } | null>;
  create(accountId: string, ciphertext: Uint8Array): Promise<boolean>;
  compareAndSwap(accountId: string, expectedVersion: number, ciphertext: Uint8Array): Promise<boolean>;
  delete(accountId: string): Promise<void>;
}

export class InMemoryStateStore implements StateStore {
  #items = new Map<string, { ciphertext: Uint8Array; version: number }>();

  async read(accountId: string) {
    const item = this.#items.get(accountId);
    return item ? { ciphertext: new Uint8Array(item.ciphertext), version: item.version } : null;
  }
  async create(accountId: string, ciphertext: Uint8Array) {
    if (this.#items.has(accountId)) return false;
    this.#items.set(accountId, { ciphertext: new Uint8Array(ciphertext), version: 1 });
    return true;
  }
  async compareAndSwap(accountId: string, expectedVersion: number, ciphertext: Uint8Array) {
    const current = this.#items.get(accountId);
    if (!current || current.version !== expectedVersion) return false;
    this.#items.set(accountId, { ciphertext: new Uint8Array(ciphertext), version: current.version + 1 });
    return true;
  }
  async delete(accountId: string) { this.#items.delete(accountId); }
}

/** Connects to the Neon-injected DATABASE_URL; schema is provisioned manually. */
export async function createPostgresStore(connectionString: string): Promise<StateStore> {
  if (!connectionString) throw new Error("missing_database_url");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString, max: 3, idleTimeoutMillis: 10_000 });
  return {
    async read(accountId) {
      const result = await pool.query<{ ciphertext: Buffer; version: string }>(
        "SELECT ciphertext, version FROM x_poc_mock_state WHERE account_id = $1", [accountId]);
      if (result.rowCount !== 1) return null;
      return { ciphertext: result.rows[0]!.ciphertext, version: Number(result.rows[0]!.version) };
    },
    async create(accountId, ciphertext) {
      const result = await pool.query(
        "INSERT INTO x_poc_mock_state (account_id, ciphertext, version) VALUES ($1, $2, 1) ON CONFLICT (account_id) DO NOTHING",
        [accountId, Buffer.from(ciphertext)]);
      return result.rowCount === 1;
    },
    async compareAndSwap(accountId, expectedVersion, ciphertext) {
      const result = await pool.query(
        "UPDATE x_poc_mock_state SET ciphertext = $3, version = version + 1, updated_at = NOW() WHERE account_id = $1 AND version = $2",
        [accountId, expectedVersion, Buffer.from(ciphertext)]);
      return result.rowCount === 1;
    },
    async delete(accountId) {
      await pool.query("DELETE FROM x_poc_mock_state WHERE account_id = $1", [accountId]);
    },
  };
}
