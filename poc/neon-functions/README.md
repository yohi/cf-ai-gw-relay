# Neon Functions — X infrastructure PoC (MOCK ONLY)

**Authority:** PoC source and local tests only. No Neon deployment, real OAuth login, production Gateway routing, or billing-plan change is authorized by the contents of this folder.

**Goal:** Decide whether a managed Neon Function can serve as Cloudflare AI Gateway's Custom Provider `X`, without Cloudflare Workers Free's 10ms-per-request CPU limit. Assess OpenAI-compatible request/response, SSE streaming and cancellation, guarded encrypted synthetic state in Postgres, and Cloudflare logging. **There is NO ChatGPT / Claude API call and NO OAuth token acquisition here.**

## Layout

- `neon.ts`: function declaration for the Neon CLI.
- `src/index.ts`: Node.js Fetch API app; authenticated `GET /v1/models`, `POST /v1/chat/completions`, `POST /v1/responses`, SSE, and probe.
- `src/crypto.ts`: timing-safe inbound API-key check and AES-256-GCM for **synthetic** state.
- `src/store.ts`: atomic PostgreSQL compare-and-swap (`UPDATE ... WHERE version = $2`), plus isolated in-memory local fake.
- `src/probe.ts`: creates, reads, CAS-updates, and deletes a synthetic state record; stale versions must be rejected.
- `schema.sql`: table used exclusively by the optional DB probe.
- `tests/`: dependency-free local tests using `node --test`.

## 1. Local tests — no external services

From `poc/neon-functions`:

```bash
node --version  # Node.js >=22 for strip-types; Neon runtime is Node.js 24
npm test        # no npm install required for tests (Node built-ins only)
```

Use synthetic API keys in tests. The PoC must fail closed on missing `X_POC_API_KEY`.

## 2. Neon deploy — NOT performed by this change

**Only after the owner separately approves the deployment and has a Neon project:**

```bash
cd poc/neon-functions
npm install                       # installs @neon/config and pg
npx neon@latest auth              # official CLI interactive login
npx neon@latest link              # links to the selected Neon project/branch
npx neon@latest config plan       # review resource change before apply
# Configure X_POC_API_KEY, X_POC_ENCRYPTION_KEY and X_POC_ENABLE_DB_PROBE
# using the Neon console's Function / branch secrets, not .env in Git.
# Manually apply schema.sql to the connected Neon branch, if testing DB probe.
npx neon@latest deploy            # requires separate owner approval
```

Official Neon references:
- https://neon.com/blog/neon-functions-backend-logic-next-to-your-data
- https://neon.com/blog/neon-backend-is-ga

`DATABASE_URL` is injected by Neon into a Function deployed alongside the database. The optional probe is **disabled by default**; it will return `404` until explicitly enabled. Never store real OAuth information in this PoC.

## 3. Direct endpoint probes

Set `X_FUNCTION_BASE_URL` to the real HTTPS Function URL **only after deployment**:

```bash
export X_FUNCTION_BASE_URL='https://<neon-function-host>'
export X_POC_API_KEY='<synthetic-32+-character-key>'
curl -fsS "$X_FUNCTION_BASE_URL/v1/models" -H "Authorization: Bearer $X_POC_API_KEY"

curl -N -fsS "$X_FUNCTION_BASE_URL/v1/responses?chunks=10&intervalMs=100" \
  -H "Authorization: Bearer $X_POC_API_KEY" -H 'Content-Type: application/json' \
  -d '{"model":"x-poc/mock","input":"synthetic","stream":true}'

# Only when the DB probe and schema have been explicitly enabled:
curl -fsS -X POST "$X_FUNCTION_BASE_URL/_poc/store/probe" \
  -H "Authorization: Bearer $X_POC_API_KEY"
```

`/v1/` and suffix-free `/` routes are both accepted for model endpoints because Custom Provider path mapping must be checked empirically. Keep the Function URL itself private to the approved test setup. `maxSseSeconds` is bounded to <=900 and defaults to 20, limiting Free-plan waiting-time consumption.

## 4. Cloudflare AI Gateway verification — manual after approval

1. Register a *separate, non-production* Custom Provider pointing to the Neon Function HTTPS URL, with the synthetic X API key in the provider configuration.
2. Route only the `x-poc/mock` model, never a real subscription model.
3. Call `POST /v1/responses` and `POST /v1/chat/completions` via the Gateway; check status, SSE event order, first-byte latency and abort propagation against the direct Neon baseline.
4. Confirm a corresponding AI Gateway request log exists. Do not claim logging or payload redaction is proved by local tests.
5. Measure Neon Functions active and waiting capacity-hours plus Postgres compute usage with a small, bounded workload. Avoid any free-tier overrun.
6. Remove the test Custom Provider and Neon Function when done; cleanup requires explicit authorization.

## Completion conditions / stop rules

| Check | Local tests | Remote evidence required |
| --- | --- | --- |
| API-key deny / mock OpenAI JSON | Yes | Gateway and Neon requests |
| SSE frames, stream cancel, bounded duration | Yes | Real client disconnect and 1-15 min behavior |
| AES-256-GCM synthetic state + CAS | In-memory simulation | PostgreSQL probe with real Neon DB |
| CPU / waiting usage under free limits | No | Neon usage dashboard |
| AI Gateway logs | No | Gateway log UI/API |
| ChatGPT / Claude OAuth | Out of scope | Separate authorization and protocol work |

**Stop if** a request bypasses Gateway, a credential leaks, DB state cannot be protected, the remote route changes wire semantics, or the Free-plan usage cannot be kept under control. Do not silently use API-key LLM billing as an OAuth fallback. No extra review cycle is required just because the PoC discovers an observation.
