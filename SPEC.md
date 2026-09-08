# cf-ai-gw-relay Technical Specification

Status: **Normative**

This document is the canonical technical source of truth for `cf-ai-gw-relay`.
It separates the contract implemented today from the generic relay contract that
is planned but not yet implemented.

Normative keywords such as **MUST**, **MUST NOT**, **SHOULD**, and **MAY**
describe required behavior. Where this document conflicts with human-facing
summaries, this document takes precedence. Source code and tests remain the
executable implementation; discrepancies between implementation and this
specification are defects that must be resolved deliberately.

## 1. Scope and Status

The repository contains two runtime deliverables:

1. `packages/opencode-plugin` — OpenCode plugin
   `@yohi/cloudflare-ai-gateway-chatgpt`.
2. `apps/deno-relay` — Deno Deploy relay.

They MUST NOT share runtime code. Their integration boundary is HTTP.

### 1.1 Implemented today

The implemented production path is:

```text
OpenCode ChatGPT Codex request
  -> plugin fetch interposer
  -> Cloudflare AI Gateway Custom Provider
  -> relay POST /v1/responses
  -> https://chatgpt.com/backend-api/codex/responses
```

The relay currently implements only `POST /v1/responses`.

### 1.2 Planned but not implemented

The generic fixed-provider relay:

```text
/upstream/<provider-slug>/*
```

is a planned contract. Requirements in §8 apply to a future implementation and
MUST NOT be represented as currently available behavior.

## 2. Global Invariants

The following invariants apply to the project:

- The path MUST fail closed. No project component may intentionally fall back
  directly to ChatGPT when Gateway or relay routing fails.
- The plugin MUST NOT implement OAuth login, token refresh, account extraction,
  model catalog rewriting, retry loops, response caching, quota parsing, or SSE
  reconstruction.
- The relay MUST remain stateless and MUST NOT persist request or response
  payloads.
- The relay runtime MUST have zero external runtime dependencies.
- The plugin runtime dependency set MUST remain limited to what its package
  metadata declares; currently the runtime dependency is `semver`.
- Gateway credentials and relay credentials MUST remain distinct.
- Credentials and request payloads MUST NOT be included in configuration error
  messages.
- Cloudflare AI Gateway is the intended observability plane.

## 3. OpenCode Host Compatibility

The canonical supported OpenCode range is
`packages/opencode-plugin/package.json#engines.opencode`. At the current
repository state it is:

```text
>=1.18.20 <2
```

The plugin MUST reject activation if:

- OpenCode does not expose a usable host version capability; or
- the exposed version is outside the supported range.

Activation rejection alone is not sufficient to guarantee fail-closed routing if
the host allows the original matching request to proceed after plugin activation
fails. Supported production use therefore also depends on OpenCode providing the
host-side request-blocking capability required to prevent bypass.

Until the required host capabilities are available and protected acceptance
passes, supported production use is blocked even if release artifacts exist.

## 4. Plugin Contract

### 4.1 Match rule

The plugin MUST intercept only the exact request:

```text
POST https://chatgpt.com/backend-api/codex/responses
```

Matching requirements:

- HTTP method is `POST`, case-insensitively.
- Origin is exactly `https://chatgpt.com`.
- Pathname is exactly `/backend-api/codex/responses`.
- Query string is empty.

Traffic that does not match MUST be delegated unchanged to the fetch
implementation that was active when the interposer was installed. This includes
OAuth login/refresh traffic, `auth.openai.com`, `api.openai.com`, and other
`chatgpt.com` requests.

The interposer MUST be installed at most once per process.

### 4.2 Configuration resolution

The plugin resolves configuration as defined in
[docs/configuration.md](docs/configuration.md).

Required values:

- `RELAY_CF_ACCOUNT_ID`
- `RELAY_CF_GATEWAY_ID`
- Gateway token from `RELAY_CF_AIG_TOKEN` or plugin option `apiKey`
- Relay token from `RELAY_SECRET` or plugin option `relayToken`

The provider slug resolves in this order:

1. `RELAY_CF_PROVIDER_SLUG`
2. plugin option `providerSlug`
3. `relay-chatgpt`

Payload logging resolves in this order:

1. `RELAY_CF_AIG_COLLECT_LOG_PAYLOAD` if set; only exact `true` or `false` is
   valid
2. plugin option `collectLogPayload` if set; it MUST be a boolean
3. `true`

The production Gateway base origin is:

```text
https://gateway.ai.cloudflare.com
```

A base URL override is test-only and MUST be rejected unless
`RELAY_CF_AIG_TEST_MODE=true` and the origin is exactly
`https://gateway.test.invalid`.

### 4.3 Gateway URL

The plugin MUST build:

```text
{gateway-origin}/v1/{account-id}/{gateway-id}/custom-{provider-slug}/v1/responses
```

Path components supplied by configuration MUST be percent-encoded as individual
path components.

### 4.4 Control headers

For a matching request, the plugin MUST set:

```text
cf-aig-authorization: Bearer <gateway-token>
x-chatgpt-relay-authorization: Bearer <relay-token>
cf-aig-collect-log: true
cf-aig-collect-log-payload: <true|false>
cf-aig-metadata: {"source":"opencode","auth_type":"chatgpt_subscription","plugin":"cloudflare-ai-gateway-chatgpt"}
cf-aig-skip-cache: true
cf-aig-max-attempts: 1
```

The plugin MUST preserve the original request method, body stream, abort signal,
`Authorization`, `ChatGPT-Account-Id`, residency headers, and other Codex
protocol headers.

The plugin MUST NOT read, parse, buffer, or reserialize the request body.

The plugin MUST return the resulting `Response` without parsing, buffering, or
reconstructing SSE.

## 5. Implemented Relay Contract

### 5.1 Route

The relay currently accepts only:

```text
POST /v1/responses
```

All other methods or paths MUST return:

```text
404 Not Found
```

### 5.2 Relay authentication

The relay reads `RELAY_SECRET` at request time.

If the secret is missing, empty, or whitespace-only, the relay MUST return:

```text
503 Service unavailable
```

The request MUST contain exactly:

```text
x-chatgpt-relay-authorization: Bearer <RELAY_SECRET>
```

An incorrect or missing authorization value MUST return HTTP `401` with:

```json
{ "error": "unauthorized" }
```

No upstream fetch may occur before successful relay authentication.

### 5.3 Fixed upstream

Authenticated `POST /v1/responses` requests MUST be sent only to:

```text
https://chatgpt.com/backend-api/codex/responses
```

The fetch MUST use `redirect: "manual"`.

### 5.4 Request header sanitization

Before the upstream fetch, the relay MUST remove:

- `connection`
- `content-length`
- `forwarded`
- `host`
- `keep-alive`
- `proxy-authenticate`
- `proxy-authorization`
- `te`
- `trailer`
- `transfer-encoding`
- `upgrade`
- `x-chatgpt-relay-authorization`
- `x-relay-authorization`
- `x-real-ip`
- all `cf-aig-*`
- all `cf-*`
- all `x-forwarded-*`
- every header named by the comma-separated `Connection` header tokens

The standard upstream `Authorization` header is not part of this denylist and
MUST remain available to authenticate the ChatGPT Codex upstream.

### 5.5 Body forwarding

The relay MUST forward the inbound request body stream without JSON parsing,
buffering, or reconstruction.

The inbound abort signal MUST abort the upstream fetch. After streaming begins,
downstream cancellation MUST cancel the upstream response body and abort the
upstream request.

No cancellation path may trigger fallback or retry.

### 5.6 Response behavior

Upstream status and remaining response headers MUST be passed through after
hop-by-hop response headers and `Connection`-named headers are removed.

The upstream body MUST be streamed without semantic transformation.

The implemented legacy path preserves upstream 3xx responses, including
sanitized `Location`, for backward compatibility. The relay itself MUST NOT
follow the redirect.

### 5.7 Timeouts

The implemented relay uses:

- 30,000 ms connect-and-response-header timeout
- 120,000 ms SSE idle timeout

The header timeout covers the upstream fetch until response headers arrive. A
timeout before headers MUST return HTTP `504` with:

```json
{ "error": "upstream_connect_or_header_timeout" }
```

For `text/event-stream`, the idle timer starts after response headers and resets
after each received body chunk. An idle timeout after headers have already been
sent terminates the stream with the internal stream error
`upstream_sse_idle_timeout`; it cannot replace the already-sent HTTP status with
a second HTTP response.

Non-SSE responses do not have a relay-defined total-duration timeout.

The current implementation uses fixed values; the timeout environment-variable
contract in §8 is planned behavior, not implemented behavior.

## 6. Security and Privacy

- Refresh tokens MUST remain within OpenCode. Neither runtime deliverable
  implements or stores OAuth credentials.
- The ChatGPT access token may pass through Gateway and relay as the upstream
  `Authorization` value, but MUST NOT be emitted in relay application logs,
  metadata, configuration errors, or persisted storage.
- The Gateway token MUST stop at Cloudflare AI Gateway on the project’s ChatGPT
  Custom Provider path.
- The relay token MUST stop at the relay and MUST be removed before the upstream
  request.
- Plugin metadata MUST remain limited to the fixed `source`, `auth_type`, and
  `plugin` fields defined in §4.4.
- Agent identifiers, session identifiers, account IDs, OAuth credentials, relay
  credentials, prompts, and response contents MUST NOT be added to plugin
  metadata.
- Gateway, relay, DNS, connection, timeout, and upstream failures MUST be
  surfaced to the client; they MUST NOT trigger direct fallback.

## 7. Non-goals

The implemented ChatGPT path does not provide:

- OAuth implementation or token refresh
- account extraction
- model catalog or model ID rewriting
- retry loops
- response caching
- quota parsing
- SSE reconstruction
- arbitrary generic proxying
- direct ChatGPT fallback
- migration of ChatGPT OAuth traffic onto OpenCode’s built-in Cloudflare native
  passthrough provider

## 8. Planned Generic Fixed-provider Relay Contract

This section is normative for a future generic relay implementation but is **not
implemented today**.

### 8.1 Routing

The route shape is:

```text
/upstream/<provider-slug>/*
```

Each provider slug MUST resolve to a predefined fixed absolute base URL. The
initial preset is:

```text
command-code -> https://api.commandcode.ai/provider/
```

Unknown provider slugs MUST return `404`.

The client suffix MUST be treated as path data, not as a URL reference. The
implementation MUST NOT rely on relative/root/authority reference resolution
such as `new URL(suffix, base)`.

The final upstream URL MUST:

- retain exactly the preset origin;
- remain under the preset pathname prefix on a path-segment boundary;
- preserve the incoming query string separately from pathname resolution.

The relay MUST reject before credentialed upstream fetch when it cannot prove
containment. Rejected input includes authority-like `//` or `///` suffixes, dot
segments, percent-encoded dot segments, encoded path separators, or any
equivalent path whose pre-normalization request target cannot be verified
safely.

The relay MUST preserve the client path including `/v1`; it MUST NOT implicitly
add or remove `/v1`.

### 8.2 Generic relay authentication

Generic routes use:

```text
X-Relay-Authorization: Bearer <RELAY_SECRET>
```

The standard `Authorization` header is reserved for the upstream provider
credential and MUST NOT authenticate the relay.

Before generic upstream fetch, the relay MUST apply the same
Cloudflare-internal, forwarding, hop-by-hop, `Connection`-token, and
relay-authentication-header sanitization principles defined for the legacy
route. In particular, `X-Relay-Authorization` and
`X-ChatGPT-Relay-Authorization` MUST NOT reach the provider, while the standard
provider `Authorization` credential MUST remain available to the fixed upstream.

The legacy `X-ChatGPT-Relay-Authorization` contract remains specific to
`/v1/responses`.

### 8.3 Provider-compatible JSON routes

A provider preset may declare routes that support provider-compatible JSON
validation and normalization.

For `command-code`:

- `POST /v1/chat/completions` uses OpenAI-compatible handling and may normalize
  `tools[].function.parameters`.
- `POST /v1/messages` uses Anthropic-compatible handling and may normalize
  `tools[].input_schema`.
- Other routes or methods are not inferred from body member names.

An undefined route/method MUST be raw-forwarded rather than opportunistically
parsed or normalized.

### 8.4 Malformed JSON

Known provider-compatible JSON routes MUST reject malformed or empty JSON before
upstream fetch.

OpenAI-compatible response:

```json
{
  "error": {
    "message": "Invalid JSON request body",
    "type": "invalid_request_error",
    "param": null,
    "code": null
  }
}
```

Anthropic-compatible response:

```json
{
  "type": "error",
  "error": {
    "type": "invalid_request_error",
    "message": "Invalid JSON request body"
  }
}
```

Both use HTTP `400` and `Content-Type: application/json`.

### 8.5 Normalization body limit and admission control

`MAX_NORMALIZATION_BODY_BYTES` MUST be a fixed implementation constant:

```text
4 * 1024 * 1024
```

It MUST NOT be configurable through an environment variable.

A valid decimal `Content-Length` above the limit MAY be rejected early.
Otherwise the real streamed byte count is authoritative. A body exactly at the
limit is allowed; the first byte beyond the limit MUST cause rejection, reader
cancellation, no partial upstream body, and no upstream fetch.

Provider-compatible `413` envelopes:

OpenAI:

```json
{
  "error": {
    "message": "Request body exceeds maximum normalization size",
    "type": "invalid_request_error",
    "param": null,
    "code": "request_body_too_large"
  }
}
```

Anthropic:

```json
{
  "type": "error",
  "error": {
    "type": "invalid_request_error",
    "message": "Request body exceeds maximum normalization size"
  }
}
```

Before buffering a normalization body, the implementation MUST acquire one of 16
fixed normalization slots without waiting. If no slot is available it MUST
reject without consuming the body:

```text
503
{"error":"normalization_capacity_exhausted"}
```

A held slot MUST be released exactly once on every terminal path. The
normalization slot MUST cover only the buffering/scan/patch lifetime, not the
complete streamed upstream response lifetime.

The inbound body reader for a normalization target MUST be linked to the client
abort signal and a fixed 30-second body-read timeout. Abort, body-read timeout,
and early size rejection MUST cancel the reader. A body-read timeout MUST fail
closed without forwarding a partial request upstream.

### 8.6 Duplicate JSON members

If the same object scope contains duplicate target members among `tools`,
`tools[].function`, `tools[].function.parameters`, or `tools[].input_schema`,
the relay MUST NOT guess the effective value.

It MUST reject before normalization and upstream fetch.

OpenAI:

```json
{
  "error": {
    "message": "Duplicate JSON object member",
    "type": "invalid_request_error",
    "param": null,
    "code": "duplicate_json_member"
  }
}
```

Anthropic:

```json
{
  "type": "error",
  "error": {
    "type": "invalid_request_error",
    "message": "Duplicate JSON object member",
    "code": "duplicate_json_member"
  }
}
```

### 8.7 Lossless JSON handling

The generic implementation MUST NOT rebuild the complete request through
ECMAScript `JSON.parse` followed by `JSON.stringify`.

It MUST use a raw/token-preserving representation and replace only byte spans
that belong to targeted schemas.

Requirements include:

- preserve unrelated request bytes and JSON number tokens;
- track JSON string/escape/nesting state correctly;
- measure offsets in original UTF-8 bytes, not JavaScript UTF-16 code units;
- preserve integers outside the JavaScript safe-integer range, including
  `9007199254740993` and `9223372036854775807`;
- if a lossless transformation cannot be guaranteed, skip normalization and
  forward the original body rather than silently corrupting it.

### 8.8 OpenAI root `anyOf`

For OpenAI `/v1/chat/completions`, root `anyOf` in a targeted
`tools[].function.parameters` schema MAY be flattened only when every safety
condition is satisfied:

1. Every branch has `type: "object"`.
2. A branch contains no constraints other than `properties`.
3. Property names do not collide across branches.
4. Branch property definitions are mutually compatible.
5. The root `type` is absent or exactly `"object"`.
6. The root has no object constraints whose evaluation would interact with
   branch evaluation, such as `properties`, `required`, `additionalProperties`,
   `patternProperties`, or `unevaluatedProperties`.

Flattening is an intentional semantic narrowing for provider compatibility, not
a general JSON Schema equivalence.

If flattening is unsafe, the entire targeted schema MUST be a normalization
skip: its byte span remains unchanged and the relay MUST NOT add `type` or
`properties`.

Anthropic `/v1/messages` MUST NOT flatten root `anyOf` in
`tools[].input_schema`; a root `anyOf` causes that targeted schema to remain
byte-for-byte unchanged.

### 8.9 Object-shape completion

Only when root `anyOf` is absent or a safe OpenAI flatten succeeded:

- a missing or empty-string root `type` may be normalized to `"object"`;
- a missing `properties` may be normalized to `{}`;
- an existing non-empty non-object `type` MUST NOT be changed.

### 8.10 Redirect policy

Generic upstream fetches MUST use `redirect: "manual"`.

`304 Not Modified` is not treated as a redirect: pass through its status and
sanitized headers with an empty downstream body. `If-None-Match` and
`If-Modified-Since` MUST remain available to the upstream.

All other 3xx statuses, including `300`, `301`, `302`, `303`, `305`, `306`,
`307`, and `308`, MUST be converted to:

```text
502
{"error":"upstream_redirect_not_allowed"}
```

The relay MUST NOT return upstream `Location`, headers, or body for those
responses and MUST NOT issue another fetch.

Ordinary upstream responses, including provider `401`, `403`, `429`, and `5xx`
responses, MUST otherwise be passed through with sanitized headers and the
original body stream. The generic relay MUST NOT add retries or transform those
provider failures into fallback behavior.

### 8.11 Planned timeout configuration

The future generic implementation introduces:

- `UPSTREAM_HEADER_TIMEOUT_MS`, default `30000`
- `SSE_IDLE_TIMEOUT_MS`, default `120000`

When implemented, each value MUST be validated at startup after trimming ASCII
surrounding whitespace and MUST match a positive decimal integer in the
inclusive range `1..3_600_000`.

Empty strings, zero, negative values, signed representations, decimals, units
such as `30s`, `NaN`, `Infinity`, or out-of-range values MUST fail startup.
Invalid values MUST NOT silently fall back to defaults.

`RELAY_SECRET` retains request-time validation and does not become a startup
requirement.

### 8.12 Performance and resource targets

For generic normalization:

- the relay remains zero-runtime-dependency and stateless;
- the 4 MiB limit is an application memory contract, not a claimed Deno Deploy
  platform limit;
- implementation acceptance SHOULD maintain conservative process/heap headroom
  against a 512 MB application budget;
- benchmark sizes are 700 KiB, 1 MiB, 2 MiB, and 4 MiB;
- warm single-concurrency scan/transform plus header-preparation p95 target is
  under 10 ms for each size;
- benchmark reports record p50/p95/p99, body size, runtime/version, region,
  warm/cold state, concurrency, and process/heap high-water;
- release acceptance uses measurements from the target Deno Deploy environment,
  not local measurements alone.

## 9. Protected Acceptance

The repository provides `.github/workflows/acceptance.yml`, executed manually in
the `protected-acceptance` environment.

Current required values are:

- `RELAY_ACCEPTANCE_ORIGIN`
- `RELAY_ACCEPTANCE_RELAY_SECRET`
- `RELAY_ACCEPTANCE_GATEWAY_BASE_URL`
- `RELAY_ACCEPTANCE_MODEL`
- `RELAY_ACCEPTANCE_GATEWAY_TOKEN`
- `RELAY_ACCEPTANCE_COMMAND_CODE_API_KEY`

Missing required values MUST fail rather than skip the workflow.

Legacy and future generic acceptance are distinct test concerns. The generic
contract, once implemented, requires live-path verification through real
Cloudflare AI Gateway, real Deno Deploy, and the Command Code provider,
including path mapping, credential separation, Gateway logging, OpenAI/Anthropic
route compatibility, malformed body handling, size limits, and root-`anyOf`
behavior.

## 10. Release Gate

A supported plugin release requires all of the following:

1. OpenCode exposes the host-version capability expected by the plugin.
2. OpenCode can block the matching Codex request when plugin activation is
   rejected, so fail-closed semantics cannot degrade into direct bypass.
3. `SUPPORTED_OPENCODE_RANGE` and `peerDependencies.opencode` agree with the
   actual supported host range.
4. Repository tests and package verification pass.
5. Protected acceptance passes for the behavior included in the release.

Release history belongs in `packages/opencode-plugin/CHANGELOG.md`, not in this
specification.

## Appendix A. Canonical Ownership

- Technical correctness and protocol contracts: `SPEC.md`
- Human configuration guidance: `docs/configuration.md`
- Deployment and release procedure: `docs/deployment.md`
- Operations and rollback procedure: `docs/operations.md`
- AI agent behavior: `AGENTS.md`
- Plugin release history: `packages/opencode-plugin/CHANGELOG.md`

## Appendix B. Non-normative Future Considerations

The following remain possible future work and are not committed behavior:

- provider-specific parameter translation such as `max_tokens` /
  `max_completion_tokens`;
- model aliases;
- additional preset providers;
- response-side normalization;
- configuration-driven expansion of provider presets, if a future security model
  can preserve fixed-origin containment.
