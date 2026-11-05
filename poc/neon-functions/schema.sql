-- PoC only. Never insert real OAuth credentials into this table.
CREATE TABLE IF NOT EXISTS x_poc_mock_state (
  account_id TEXT PRIMARY KEY,
  ciphertext BYTEA NOT NULL,
  version BIGINT NOT NULL CHECK (version >= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
