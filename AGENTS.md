# AGENTS.md

Routes OpenCode ChatGPT Codex traffic through Cloudflare AI Gateway with
fail-closed semantics.

## Architecture & Monorepo Structure

- `apps/deno-relay`: Deno Deploy fixed-upstream egress relay (zero runtime
  dependencies). Entrypoint: `apps/deno-relay/main.ts`.
- `packages/opencode-plugin`: npm package `@yohi/cloudflare-ai-gateway-chatgpt`
  (NodeNext ESM, runtime dependency limited to `semver`).

The two deliverables share no runtime code. Their coupling is a documented HTTP
contract.

### Authoritative Documentation (Progressive Disclosure)

Do not duplicate deep contracts here; read authoritative specs on demand:

- `README.md`: Architecture overview, routing topology, configuration
  resolution, header denylist, security semantics, release checklist (Japanese).
- `REQUIREMENTS_AI_GATEWAY_RELAY.md`: Future generic relay
  (`/upstream/<provider-slug>/*`) contract, schema normalization rules, bounded
  buffering (4 MiB), and acceptance criteria.
- `packages/opencode-plugin/README.md`: Plugin-specific usage and configuration
  notes.

## Verification & Commands

Run these exact commands before claiming work is complete:

```bash
# apps/deno-relay (Deno workspace)
deno test apps/deno-relay
deno fmt --check
deno lint

# packages/opencode-plugin (npm package)
cd packages/opencode-plugin
npm ci --legacy-peer-deps
npm run typecheck
npm test
npm run build
```

## Critical Rules & Invariants

- **Package Managers**: Use `deno` commands at root for `apps/deno-relay`. Use
  `npm` commands inside `packages/opencode-plugin`.
- **Zero Fallback**: Never introduce direct ChatGPT fallbacks, retry loops,
  caching, or payload persistence outside documented contracts.
- **Dependencies**: Zero runtime dependencies for `apps/deno-relay`.
  `packages/opencode-plugin` may only depend on `semver`.
- **Contracts Alignment**: Keep `README.md` and
  `REQUIREMENTS_AI_GATEWAY_RELAY.md` synchronized whenever design contracts
  change.
- **Linting & Code Style**: Rely on automated linters (`deno lint`, `deno fmt`,
  TypeScript compiler) rather than manual style guidelines.
- **Tests Location**: Tests live next to implementation:
  `apps/deno-relay/*_test.ts` and `packages/opencode-plugin/test/*.test.ts`.
