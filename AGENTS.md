# AGENTS.md

`cf-ai-gw-relay` routes OpenCode ChatGPT Codex traffic through Cloudflare AI
Gateway with fail-closed semantics.

## Repository Map

This is a monorepo with two runtime deliverables that share no runtime code:

- `apps/deno-relay` — Deno Deploy egress relay; zero runtime dependencies.
- `packages/opencode-plugin` — npm package
  `@yohi/cloudflare-ai-gateway-chatgpt`; runtime dependency currently limited to
  `semver`.

Supporting infrastructure:

- `.github/scripts` — Deno-based infrastructure provisioning helpers.

The runtime deliverables are coupled by the HTTP contract in `SPEC.md`, not by a
shared library.

## Read on Demand

Keep this file small and do not duplicate deep contracts.

Read the canonical document for the task:

- `README.md` — project entry point, status, Quick Start, and documentation
  routing.
- `SPEC.md` — normative architecture, HTTP contracts, invariants, compatibility,
  security, and current-vs-planned behavior.
- `docs/configuration.md` — human-facing complete configuration reference.
- `docs/deployment.md` — provisioning, deployment, GitHub Actions, and release
  workflow.
- `docs/operations.md` — monitoring, failure handling, protected acceptance, and
  rollback.
- `packages/opencode-plugin/CHANGELOG.md` — plugin release history.

`REQUIREMENTS_AI_GATEWAY_RELAY.md` is a compatibility pointer, not a normative
source.

## Working Rules

- Use Deno from the repository root for `apps/deno-relay` and `.github/scripts`.
- Use npm inside `packages/opencode-plugin`.
- Preserve fail-closed behavior. Do not add direct ChatGPT fallback.
- Do not add retry loops, caching, or payload persistence unless `SPEC.md` is
  deliberately changed to require them.
- Keep `apps/deno-relay` free of external runtime dependencies.
- Keep the plugin runtime dependency set constrained to the package contract.
- Do not present the planned generic `/upstream/*` contract as implemented
  behavior.
- Do not duplicate complete HTTP contracts, environment-variable catalogs,
  deployment runbooks, or release history in README files or this file.
- When behavior changes, update the canonical document that owns that behavior
  and its tests.
- Let deterministic tooling enforce formatter and linter style instead of
  encoding style rules here.
- Never expose credentials or request payloads in diagnostics, examples,
  fixtures intended for publication, or logs.

## Verification

Run checks for every area you changed before claiming completion.

```bash
# Relay and provisioning helpers
deno test apps/deno-relay .github/scripts
deno fmt --check
deno lint

# Plugin
cd packages/opencode-plugin
npm ci --legacy-peer-deps
npm run typecheck
npm test
npm run build
```

When a change affects production routing, authentication, streaming, or future
generic relay behavior, also identify the relevant protected-acceptance impact.

Do not claim supported production readiness while the host-capability release
gate in `SPEC.md` remains unsatisfied.
