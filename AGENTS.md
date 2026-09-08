# AGENTS.md

Routes OpenCode ChatGPT Codex traffic through Cloudflare AI Gateway with
fail-closed semantics.

## Repository Map

This is a monorepo with two runtime deliverables that share no runtime code:

- `apps/deno-relay`: Deno Deploy egress relay. Zero runtime dependencies.
- `packages/opencode-plugin`: npm package `@yohi/cloudflare-ai-gateway-chatgpt`.
  Runtime dependency is limited to `semver`.
- `.github/scripts`: Deno-based infrastructure provisioning helpers.

Their coupling is a documented HTTP contract, not a shared library.

## Read on Demand

Keep this file small. Read only the documentation relevant to the task:

- `README.md`: current architecture, routing, configuration, security semantics,
  provisioning, development commands, and release process.
- `REQUIREMENTS_AI_GATEWAY_RELAY.md`: authoritative contract for the future
  generic `/upstream/<provider-slug>/*` relay, including normalization,
  buffering, error semantics, and acceptance criteria.
- `packages/opencode-plugin/README.md`: plugin-specific usage and configuration.

Treat completed implementation plans under `docs/superpowers` as disposable
working artifacts, not sources of truth. Before deleting one, preserve any
enduring behavior that is not already captured in the authoritative documents.

## Working Rules

- Use Deno from the repository root for `apps/deno-relay` and `.github/scripts`.
- Use npm inside `packages/opencode-plugin`.
- Preserve fail-closed behavior: do not add direct ChatGPT fallback, retry
  loops, caching, or payload persistence unless an authoritative contract
  explicitly requires it.
- Keep `apps/deno-relay` free of runtime dependencies and keep the plugin
  runtime dependency set limited to `semver`.
- Do not duplicate deep contracts here. Update the authoritative documentation
  when behavior or design contracts change.
- Let deterministic tooling enforce style; do not encode formatter or linter
  rules in this file.

## Verification

Run the checks for every area you changed before claiming completion:

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
