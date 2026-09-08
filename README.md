# cf-ai-gw-relay

[日本語](README.ja.md)

Route OpenCode ChatGPT Codex traffic through Cloudflare AI Gateway and a fixed-upstream Deno Deploy relay without direct fallback.

`cf-ai-gw-relay` contains an OpenCode plugin and a small Deno Deploy relay. Together they let ChatGPT subscription traffic use Cloudflare AI Gateway as the observability and policy boundary while preserving the Codex request and response stream.

> [!WARNING]
> **Supported production use is currently blocked.** The plugin declares OpenCode `>=1.18.20 <2`, and fail-closed activation also depends on OpenCode exposing the host-version and request-blocking capabilities required by this project. Release artifacts may exist, but do not treat them as supported for production use until those capabilities are available and the protected acceptance suite passes.

## What This Repository Contains

- `packages/opencode-plugin` — npm package `@yohi/cloudflare-ai-gateway-chatgpt`
- `apps/deno-relay` — fixed-upstream Deno Deploy egress relay
- `.github/scripts` — infrastructure provisioning helpers

The two runtime deliverables share no runtime code. Their integration boundary is the HTTP contract defined in [SPEC.md](SPEC.md).

## Quick Start

Because supported end-user use is currently blocked, the minimum supported path is repository validation.

### Requirements

- Deno 2.x
- Node.js 22 and npm

### Validate the relay and provisioning helpers

```bash
deno test apps/deno-relay .github/scripts
deno fmt --check
deno lint
```

### Validate the OpenCode plugin

```bash
cd packages/opencode-plugin
npm ci --legacy-peer-deps
npm run typecheck
npm test
npm run build
```

Success means all tests, type checks, formatting checks, lint checks, and the package build complete without errors.

## Features

- Intercepts only the ChatGPT Codex Responses request used by OpenCode.
- Routes that request through a Cloudflare AI Gateway Custom Provider.
- Preserves the original Codex authorization, account, residency, body stream, and abort signal.
- Uses distinct Gateway and relay credentials.
- Fails closed: the project does not intentionally fall back directly to ChatGPT.
- Keeps the Deno relay stateless and free of runtime dependencies.
- Delegates request observability to Cloudflare AI Gateway instead of persisting payloads in the relay.
- Defines a future fixed-provider `/upstream/*` relay contract separately from the currently implemented legacy path.

## Architecture Overview

```text
OpenCode built-in ChatGPT OAuth
  -> OpenCode plugin fetch interposer
  -> Cloudflare AI Gateway Custom Provider
  -> Deno Deploy relay
  -> https://chatgpt.com/backend-api/codex/responses
```

The plugin is the routing and Gateway-control-header layer. Cloudflare AI Gateway is the observability plane. The relay is a minimal egress transport with a fixed ChatGPT upstream for the currently implemented path.

The built-in OpenCode `cloudflare-ai-gateway` provider is outside this path. This project does not convert ChatGPT subscription traffic into Cloudflare native `openai/*` or `anthropic/*` passthrough traffic.

## Current Request Path

The plugin intercepts exactly:

```text
POST https://chatgpt.com/backend-api/codex/responses
```

and rewrites the destination to:

```text
https://gateway.ai.cloudflare.com/v1/{account}/{gateway}/custom-{provider-slug}/v1/responses
```

The current relay accepts:

```text
POST /v1/responses
```

and forwards to the fixed upstream:

```text
https://chatgpt.com/backend-api/codex/responses
```

Other relay routes return `404`.

The generic `/upstream/<provider-slug>/*` relay is **planned and not implemented**. Its normative contract is documented in [SPEC.md](SPEC.md).

## Important Configuration

| Setting | Purpose |
| --- | --- |
| `RELAY_CF_ACCOUNT_ID` | Cloudflare account ID; required by the plugin |
| `RELAY_CF_GATEWAY_ID` | AI Gateway ID; required by the plugin |
| `RELAY_CF_AIG_TOKEN` | Gateway authentication token |
| `RELAY_SECRET` | Shared relay bearer secret |
| `RELAY_CF_PROVIDER_SLUG` | Custom Provider slug; defaults to `relay-chatgpt` |
| `RELAY_CF_AIG_COLLECT_LOG_PAYLOAD` | Payload logging control; `true` or `false`, default `true` |

See [Configuration](docs/configuration.md) for precedence, defaults, test-only settings, provisioning values, and acceptance configuration.

## Documentation

- [SPEC.md](SPEC.md) — normative architecture, HTTP contracts, invariants, security semantics, compatibility requirements, and planned generic relay contract
- [Configuration](docs/configuration.md) — complete human-facing configuration reference
- [Deployment](docs/deployment.md) — Deno Deploy, Cloudflare AI Gateway, provisioning, and release workflow
- [Operations](docs/operations.md) — monitoring, failures, protected acceptance, and rollback
- [AGENTS.md](AGENTS.md) — repository-specific instructions for AI coding agents
- [Plugin changelog](packages/opencode-plugin/CHANGELOG.md) — plugin release history

`REQUIREMENTS_AI_GATEWAY_RELAY.md` is retained as a compatibility pointer for older links. `SPEC.md` is the canonical technical source of truth.

## Development

Repository layout:

```text
apps/deno-relay/             Deno Deploy relay
packages/opencode-plugin/    OpenCode plugin package
.github/scripts/             infrastructure provisioning helpers
```

Use Deno from the repository root for `apps/deno-relay` and `.github/scripts`. Use npm inside `packages/opencode-plugin`.

For repository-specific implementation constraints and verification requirements, follow [AGENTS.md](AGENTS.md).

## Deployment and Operations

Deployment and operational procedures are intentionally not duplicated here:

- [Deployment guide](docs/deployment.md)
- [Operations guide](docs/operations.md)

## License

MIT. See [LICENSE](LICENSE).
