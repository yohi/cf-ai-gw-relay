# Configuration

This document is the complete human-facing configuration reference for
`cf-ai-gw-relay`. Normative protocol behavior is defined in
[../SPEC.md](../SPEC.md).

## Plugin Runtime Configuration

The plugin reads OpenCode runtime environment variables and optional plugin
settings.

| Value                   | Environment variable               | Plugin option       | Default                             | Required               |
| ----------------------- | ---------------------------------- | ------------------- | ----------------------------------- | ---------------------- |
| Cloudflare account ID   | `RELAY_CF_ACCOUNT_ID`              | —                   | —                                   | yes                    |
| AI Gateway ID           | `RELAY_CF_GATEWAY_ID`              | —                   | —                                   | yes                    |
| Gateway token           | `RELAY_CF_AIG_TOKEN`               | `apiKey`            | —                                   | yes                    |
| Relay token             | `RELAY_SECRET`                     | `relayToken`        | —                                   | yes                    |
| Custom Provider slug    | `RELAY_CF_PROVIDER_SLUG`           | `providerSlug`      | `relay-chatgpt`                     | no                     |
| Gateway payload logging | `RELAY_CF_AIG_COLLECT_LOG_PAYLOAD` | `collectLogPayload` | `true`                              | no                     |
| Gateway base origin     | `RELAY_CF_AIG_BASE_URL`            | —                   | `https://gateway.ai.cloudflare.com` | no; test-only override |
| Gateway test mode       | `RELAY_CF_AIG_TEST_MODE`           | —                   | unset                               | no; test-only          |

### Precedence

Gateway token:

1. `RELAY_CF_AIG_TOKEN`
2. plugin `apiKey`

Relay token:

1. `RELAY_SECRET`
2. plugin `relayToken`

Provider slug:

1. `RELAY_CF_PROVIDER_SLUG`
2. plugin `providerSlug`
3. `relay-chatgpt`

Payload logging:

1. `RELAY_CF_AIG_COLLECT_LOG_PAYLOAD`
2. plugin `collectLogPayload`
3. `true`

### Validation

`RELAY_CF_ACCOUNT_ID` and `RELAY_CF_GATEWAY_ID` must be non-empty.

Gateway and relay tokens must resolve to non-empty strings.

`RELAY_CF_AIG_COLLECT_LOG_PAYLOAD`, when set, must be exactly `true` or `false`.
The plugin option `collectLogPayload`, when set, must be a boolean. Arbitrary
string coercion is not supported.

Payload logging defaults to `true`. This is privacy-relevant because it enables
Gateway payload collection unless explicitly disabled.

`RELAY_CF_AIG_BASE_URL` is not a production override mechanism. It is accepted
only when:

```text
RELAY_CF_AIG_TEST_MODE=true
```

and the supplied URL origin is exactly:

```text
https://gateway.test.invalid
```

All other base URL overrides are rejected.

## Relay Runtime Configuration

The currently implemented relay reads:

| Variable       | Purpose                                                           |
| -------------- | ----------------------------------------------------------------- |
| `RELAY_SECRET` | Bearer secret shared between Cloudflare Custom Provider and relay |

If `RELAY_SECRET` is missing, empty, or whitespace-only, the current relay
returns `503` at request time.

The current implementation uses fixed timeout values: 30 seconds for upstream
connection/response headers and 120 seconds for SSE idle timeout.

### Planned generic relay settings

The planned `/upstream/*` contract defines these future settings:

| Variable                     | Planned default | Status          |
| ---------------------------- | --------------: | --------------- |
| `UPSTREAM_HEADER_TIMEOUT_MS` |         `30000` | not implemented |
| `SSE_IDLE_TIMEOUT_MS`        |        `120000` | not implemented |

Do not configure them expecting the current relay to consume them. Their future
validation contract is defined in [../SPEC.md](../SPEC.md).

`MAX_NORMALIZATION_BODY_BYTES` is planned as a fixed 4 MiB implementation
constant, not an environment variable.

## Infrastructure Provisioning Configuration

`.github/workflows/provision.yml` runs in the `production` GitHub Environment.

### Variables

| Name                       | Typical value in this repository | Purpose               |
| -------------------------- | -------------------------------- | --------------------- |
| `DENO_DEPLOY_APP`          | `cf-ai-gw-relay`                 | Deno Deploy app slug  |
| `CLOUDFLARE_GATEWAY_ID`    | `relay-gateway`                  | AI Gateway ID         |
| `CLOUDFLARE_PROVIDER_SLUG` | `relay-chatgpt`                  | Custom Provider slug  |
| `CLOUDFLARE_ACCOUNT_ID`    | account-specific                 | Cloudflare account ID |

`workflow_dispatch` inputs may override the Deno app, Gateway ID, and provider
slug. If neither the input nor corresponding configured variable is present,
provisioning validation fails before changes are made.

### Secrets

| Name                   | Purpose                                                     |
| ---------------------- | ----------------------------------------------------------- |
| `DENO_DEPLOY_TOKEN`    | Deno Deploy API authentication                              |
| `RELAY_SECRET`         | Relay bearer secret written to the deployed app             |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API authentication for AI Gateway reconciliation |

`CLOUDFLARE_ACCOUNT_ID` may be supplied as a variable or secret, according to
the workflow.

Runtime `RELAY_CF_*` plugin settings and provisioning `CLOUDFLARE_*` settings
are different configuration surfaces. Do not rename one family to match the
other.

## Protected Acceptance Configuration

`.github/workflows/acceptance.yml` uses the `protected-acceptance` GitHub
Environment.

Required values:

| Name                                    | Kind     | Purpose                                 |
| --------------------------------------- | -------- | --------------------------------------- |
| `RELAY_ACCEPTANCE_ORIGIN`               | variable | Direct legacy relay acceptance origin   |
| `RELAY_ACCEPTANCE_RELAY_SECRET`         | secret   | Legacy direct acceptance authentication |
| `RELAY_ACCEPTANCE_GATEWAY_BASE_URL`     | variable | Real AI Gateway base path               |
| `RELAY_ACCEPTANCE_MODEL`                | variable | Model used by acceptance                |
| `RELAY_ACCEPTANCE_GATEWAY_TOKEN`        | secret   | Gateway credential                      |
| `RELAY_ACCEPTANCE_COMMAND_CODE_API_KEY` | secret   | Command Code provider credential        |

The workflow deliberately fails when required values are absent.

## Credential Boundaries

Do not treat these credentials as interchangeable:

- ChatGPT access token — upstream authentication, originating from OpenCode.
- Gateway token — authenticates the request to Cloudflare AI Gateway.
- Relay secret — authenticates Gateway-to-relay traffic.
- Cloudflare provisioning API token — infrastructure management only.
- Deno Deploy token — deployment management only.
- Command Code API key — protected acceptance / future provider authentication.

Never commit real credential values into the repository or examples.

## Related Documentation

- [Technical specification](../SPEC.md)
- [Deployment](deployment.md)
- [Operations](operations.md)
