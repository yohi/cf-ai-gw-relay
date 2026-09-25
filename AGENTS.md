# AGENTS.md

## Purpose & Architecture (WHY)

`cf-ai-gw-relay` routes OpenCode ChatGPT Codex traffic through Cloudflare AI
Gateway as an observability and policy boundary with fail-closed semantics,
without direct ChatGPT fallback.

## Repository Map (WHAT)

Monorepo with two independent runtime deliverables coupled only by the HTTP
contract in `SPEC.md`:

- `apps/deno-relay` — Deno Deploy egress relay; zero external runtime
  dependencies.
- `packages/opencode-plugin` — npm package
  `@yohi/cf-ai-gw-relay`; runtime dependency constrained to
  `semver`.
- `.github/scripts` — Deno-based infrastructure provisioning and acceptance
  helpers.

## Progressive Disclosure (Read on Demand)

Keep this file concise (<100 lines). Consult canonical documents as needed for
specific tasks:

- [`SPEC.md`](SPEC.md) — Normative HTTP contracts, invariants, security
  boundaries, and current-vs-planned behavior.
- [`docs/configuration.md`](docs/configuration.md) — Complete environment
  variable and configuration reference.
- [`docs/deployment.md`](docs/deployment.md) — Provisioning, deployment, and
  GitHub Actions workflows.
- [`docs/operations.md`](docs/operations.md) — Incident triage, monitoring,
  failure handling, and rollback.
- [`packages/opencode-plugin/CHANGELOG.md`](packages/opencode-plugin/CHANGELOG.md)
  — Plugin version history.

## Development & Working Rules (HOW)

- **Tooling Boundary**: Use Deno from repository root for `apps/deno-relay` and
  `.github/scripts`. Use npm within `packages/opencode-plugin`.
- **Fail-Closed & Stateless**: Never add direct ChatGPT fallbacks, retry loops,
  response caching, or payload persistence.
- **Credential & Privacy Isolation**: Never expose credentials or request
  payloads in logs, diagnostics, or commit artifacts. OpenCode owns ChatGPT
  OAuth; plugin/relay treat OAuth headers as opaque transport data.
- **Contract Boundary**: Do not present the planned generic `/upstream/*`
  contract as implemented behavior.
- **Deterministic Quality**: Let deterministic tools enforce formatting and
  linting. Do not encode subjective style rules in prompts.

## Verification

Always run deterministic checks for modified areas before claiming task
completion:

```bash
# Relay & Provisioning (from repo root)
deno test apps/deno-relay .github/scripts
deno fmt --check
deno lint

# Plugin (from packages/opencode-plugin)
cd packages/opencode-plugin
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
```

When changing routing, auth, or streaming, evaluate impact against the protected
acceptance suite in `SPEC.md`. Production readiness remains blocked until
host-capability gates pass.
