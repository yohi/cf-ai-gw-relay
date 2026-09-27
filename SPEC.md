# cf-ai-gw-relay Technical Specification

Status: **Normative**

This document is the canonical technical source of truth for `cf-ai-gw-relay`.
It records the selected, runtime-validated C1 architecture, distinguishes it from
the pre-C1 source snapshot, and separates both from the generic relay contract
that is planned but not yet implemented.

Normative keywords such as **MUST**, **MUST NOT**, **SHOULD**, and **MAY**
describe required behavior. Where this document conflicts with human-facing
summaries, this document takes precedence. Source code and tests remain the
executable implementation; discrepancies between implementation and this
specification are defects that must be resolved deliberately.

## 1. Scope and Status

The repository contains two runtime deliverables:

1. `packages/opencode-plugin` — OpenCode plugin
   `@yohi/cf-ai-gw-relay`.
2. `apps/deno-relay` — Deno Deploy relay.

They MUST NOT share runtime code. Their integration boundary is HTTP.

### 1.1 Selected Issue #28 architecture: C1

The selected architecture preserves a dedicated relay provider identity while
delegating credential ownership and OpenAI/Codex semantics to OpenCode's existing
`openai` provider:

```text
OpenCode model selection:
  cf-ai-gw-relay/openai/<model>
  -> provider identity: cf-ai-gw-relay
  -> credential owner: openai
  -> OpenCode-owned ChatGPT OAuth and OpenAI/Codex request semantics
  -> target-aware transport preserves the configured Gateway URL
  -> Cloudflare AI Gateway Custom Provider
  -> stored Custom Provider slug: relay-chatgpt
  -> Gateway route segment: custom-relay-chatgpt
  -> relay POST /v1/responses
  -> https://chatgpt.com/backend-api/codex/responses
```

The normal OpenCode namespace `openai/<model>` remains a separate route and MUST
remain unaffected by C1 delegation.

This architecture was validated in a disposable OpenCode `1.18.31` runtime at
commit `014614d35b397775e5d397a490fc72368c894ec2`, using model `gpt-6-sol` and
agent `build`. This is architecture-validation evidence, not a claim that the
production plugin or relay source has already been changed or deployed.

### 1.2 Production implementation status

The committed production source has not yet integrated C1. Its pre-C1 snapshot
still describes the earlier `openai/gpt-5.6-luna` route. That snapshot is an
implementation-status fact only; it is not the selected Issue #28 architecture
and MUST NOT justify collapsing the dedicated provider identity to `openai`.
Production integration and release remain subject to the host-capability and
acceptance gates in §§3, 9, and 10.

The relay currently implements only `POST /v1/responses`.

### 1.3 Planned but not implemented

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
  model-ID rewriting, retry loops, response caching, quota parsing, or SSE
  reconstruction. C1 core may inherit the effective credential owner's model
  profile, but MUST preserve provider and model identifiers.
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

The canonical supported OpenCode version is pinned by
`packages/opencode-plugin/package.json#engines.opencode` and the host validation
contract. At the current repository state it is:

```text
1.18.31
```

The plugin MUST reject activation if:

- OpenCode does not expose a usable host version capability; or
- the exposed version is outside the supported range.

Activation rejection alone is not sufficient to guarantee fail-closed routing if
the host allows the configured request to proceed after plugin activation fails.
Supported production use therefore also depends on OpenCode providing the
host-side request-blocking capability required to prevent bypass.

Until the required host capabilities are available and protected acceptance
passes, supported production use is blocked even if release artifacts exist.

## 4. Plugin Contract

### 4.1 Dedicated provider identity and model namespace

Relay-selected traffic MUST use a dedicated OpenCode provider identity:

```text
provider identity: cf-ai-gw-relay
selected model:    cf-ai-gw-relay/openai/<model>
normal model:      openai/<model>
```

For C1 validation, `<model>` is `gpt-6-sol`. Its OpenCode model ID is
`openai/gpt-6-sol`; its wire-body model ID is `gpt-6-sol`; and its SDK is
`@ai-sdk/openai 3.0.88` using the Responses API. The `openai/` component in the
dedicated model ID identifies the model/credential semantics family. It MUST NOT
collapse the selected provider identity to `openai`.

The dedicated provider MUST route to the Cloudflare AI Gateway Custom Provider
endpoint with the Responses API prefix:

```text
https://gateway.ai.cloudflare.com/v1/<account>/<gateway>/custom-<stored-slug>/v1
```

The AI SDK appends `/responses`. The stored Cloudflare Custom Provider slug is
`relay-chatgpt`; `custom-` is the Gateway route prefix, so the route segment is
`custom-relay-chatgpt`. The Custom Provider `base_url` MUST be the relay HTTPS
origin without a path. The Gateway forwards the suffix `v1/responses`, producing
the relay's `POST /v1/responses` route; the `/v1` prefix MUST NOT be duplicated in
the stored Custom Provider origin.

Ordinary `openai/<model>` traffic MUST retain its existing provider identity and
ChatGPT/Codex routing. C1 delegation MUST be explicit opt-in and MUST NOT affect
other OpenAI or third-party providers.

OpenCode's `enabled_providers` remains owned by the host user. The plugin MUST
NOT append `cf-ai-gw-relay` to a user-supplied allowlist or bypass the host's
provider filter. When `enabled_providers` is absent, normal host provider
discovery rules apply. When it is present, `cf-ai-gw-relay` MUST be listed for
the dedicated provider to be available; if it is excluded, C1 is unavailable and
MUST fail closed without fallback. The user's configuration continues to control
whether ordinary `openai/*` is enabled. Runtime acceptance fixtures that test
both routes MUST explicitly enable both `openai` and `cf-ai-gw-relay`.

### 4.2 Effective credential provider

Provider identity and credential identity are distinct:

```text
selected provider identity: cf-ai-gw-relay
effective credential owner: openai
```

OpenCode core MUST resolve an effective credential provider through one shared
`credentialProviderID(...)` decision. Its required behavior is:

| Selected provider | Opt-in credential provider | Effective credential provider |
| --- | --- | --- |
| `openai` | none | `openai` |
| `cf-ai-gw-relay` | `openai` | `openai` |
| Any provider without delegation | none | selected provider |

Delegation MUST be limited to the explicit `cf-ai-gw-relay` → `openai` pairing.
An invalid delegation MUST fail closed. The resolver MUST be used consistently
for provider initialization/fetch, LLM auth lookup, request preparation,
agent/model generation, model-profile materialization, and OpenAI/Codex hooks.
Consumers MUST NOT independently infer credential ownership solely from the
selected provider ID.

The dedicated provider MUST reuse the effective owner's applicable model
metadata, variants, and model loader while preserving the selected provider ID,
Gateway API URL, dedicated-provider configuration, and explicit provider options.
It MUST NOT synthesize a conflicting OpenAI model profile for the same model ID.

### 4.3 Configuration resolution

This specification defines the normative C1 configuration contract. The
human-facing English and Japanese configuration guides MUST be synchronized
with this contract by the C1 implementation plan; they do not override this
specification.

Required values:

- `RELAY_CF_ACCOUNT_ID`
- `RELAY_CF_GATEWAY_ID`
- Gateway token from `RELAY_CF_AIG_TOKEN`
- Relay token from `RELAY_SECRET`

The provider slug resolves in this order:

1. `RELAY_CF_PROVIDER_SLUG`
2. dedicated provider option `providerSlug`
3. `relay-chatgpt`

The dedicated provider configuration MUST set the explicit credential-owner
opt-in and must keep Gateway/relay credentials separate from OAuth credentials:

```text
provider.cf-ai-gw-relay.options.credentialProvider = "openai"
```

Gateway and relay credentials MUST be supplied only through their respective
control-header configuration. OAuth credentials MUST NOT be copied into the
dedicated provider's options, headers, API key, or persistent store.

For C1, Gateway payload collection MUST be disabled:

```text
cf-aig-collect-log-payload: false
```

The C1 path MUST NOT override this setting to `true`.

The plugin `config` hook MUST resolve and validate the complete C1 configuration
before changing the host config. It MUST construct the complete dedicated
provider entry before assigning it, so a failed attempt cannot partially
register `cf-ai-gw-relay`. OpenCode 1.18.31 logs and ignores external plugin
`config` hook exceptions; the plugin MUST NOT rely on such an exception aborting
host or plugin initialization.

The plugin `chat.headers` hook MUST first check the selected provider identity.
For any non-C1 model, including ordinary `openai/*`, it MUST return without
reading C1 closure state or adding C1 headers, even if configuration resolution
failed. For `cf-ai-gw-relay` traffic, absent or invalid resolved C1 configuration
MUST throw the existing `PluginConfigurationError` before network dispatch. No
Gateway request or fallback is permitted in that state.

The production Gateway base origin is:

```text
https://gateway.ai.cloudflare.com
```

A base URL override is test-only and MUST be rejected unless
`RELAY_CF_AIG_TEST_MODE=true` and the origin is exactly
`https://gateway.test.invalid`.

### 4.4 Authentication channels and control headers

Gateway authentication and provider/relay authentication are separate channels.
For a relay-selected request, the Gateway control configuration MUST set:

```text
cf-aig-authorization: Bearer <gateway-token>
x-chatgpt-relay-authorization: Bearer <relay-token>
cf-aig-collect-log: true
cf-aig-collect-log-payload: false
cf-aig-skip-cache: true
cf-aig-max-attempts: 1
```

If `cf-aig-metadata` is sent, it MUST contain only static `source`, `auth_type`,
and `plugin` fields. It MUST NOT contain model, user, agent, session, account, or
credential identifiers.

The `cf-aig-authorization` value authenticates to Cloudflare AI Gateway. The
`Authorization` value carries the provider-side credential and MUST remain
OpenCode-owned ChatGPT OAuth; it MUST NOT be replaced with the Gateway token.
`ChatGPT-Account-Id`, when required, is also OpenCode-owned. The relay
authorization header authenticates only to the relay.

The OpenAI/Codex `chat.params` and `chat.headers` semantics MUST follow the
effective credential provider, not only the selected provider ID. For C1,
OpenCode MUST preserve OpenAI OAuth request semantics, including model/profile
semantics and required Codex headers, while retaining
`provider identity = cf-ai-gw-relay`.

The built-in OpenAI OAuth transport MUST be target-aware:

| Selected provider | Credential owner | OAuth transport behavior |
| --- | --- | --- |
| `openai` | `openai` | Preserve existing ChatGPT/Codex routing, including its existing rewrite |
| `cf-ai-gw-relay` | `openai` | Inject OpenCode-owned OAuth headers and preserve the configured Gateway URL |

The C1 path MUST NOT rewrite its Gateway destination directly to
`chatgpt.com`. Any internal target marker used to select this behavior MUST be
removed before the outbound request and MUST NOT be exposed as a relay/plugin
credential.

### 4.5 C1 verification requirements

The OpenCode implementation MUST include focused tests proving:

- the explicit `cf-ai-gw-relay` → `openai` credential-owner resolution;
- ordinary `openai` resolves to itself and receives no C1 delegation marker;
- LLM auth lookup uses `openai` while the selected provider remains
  `cf-ai-gw-relay`;
- request preparation and Codex hooks retain OpenAI OAuth semantics under the
  delegated credential owner;
- the dedicated model inherits the owner's applicable model profile/loader
  without changing its provider ID or Gateway URL;
- the C1 transport preserves the Gateway URL and strips any internal routing
  marker before network dispatch; and
- ordinary `openai/*` routing remains unchanged.

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

The request MUST include the following header, whose value MUST match
`Bearer <RELAY_SECRET>` exactly:

```text
x-chatgpt-relay-authorization: Bearer <RELAY_SECRET>
```

Additional relay or Gateway authorization headers MAY be present. They MUST NOT
be used for relay authentication and MUST be removed before the upstream fetch,
as specified in §5.4. The standard upstream `Authorization` header is separate
from relay authentication and MUST remain available to authenticate the ChatGPT
Codex upstream.

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
buffering, or reconstruction (`REQUEST_PROTOCOL = DIRECT_FORWARDING`).

This includes OpenAI Responses payloads containing tools and tool continuation
items (`function_call` in responses and `function_call_output` in subsequent
requests). Tool arguments and results remain opaque request data forwarded
without body rewriting.

The inbound abort signal MUST abort the upstream fetch. After streaming begins,
downstream cancellation MUST cancel the upstream response body and abort the
upstream request.

No cancellation path may trigger fallback or retry.

### 5.6 Response behavior

Upstream status and remaining response headers MUST be passed through after
hop-by-hop response headers and `Connection`-named headers are removed
(`RESPONSE_PROTOCOL = DIRECT_FORWARDING`).

The upstream body MUST be streamed without semantic transformation
(`STREAMING_PROTOCOL = DIRECT_FORWARDING`). Responses SSE event families
(`response.created`, `response.in_progress`, `response.output_item.*`,
`response.content_part.*`, `response.output_text.*`,
`response.function_call_arguments.*`, and `response.completed`) are passed
directly to the downstream client. If the upstream response carries an SSE body
without an explicit `Content-Type` header, the relay preserves that header state
without synthesizing a mapping.

The implemented path preserves upstream 3xx responses, including sanitized
`Location`, for backward compatibility. The relay itself MUST NOT follow the
redirect.

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

### 5.8 C1 error ownership and propagation

- OpenCode owns provider/model resolution, effective credential-owner resolution,
  OAuth lookup/refresh/header injection, and OpenAI/Codex request preparation.
- Cloudflare AI Gateway owns Gateway authentication, route selection, and
  Custom Provider dispatch.
- The relay owns `POST /v1/responses` validation, relay authentication, request
  header sanitization, and dispatch to the fixed upstream.
- The relay MUST return the upstream status and sanitized response headers without
  converting an upstream rejection into fallback behavior.
- Gateway, relay, or upstream failures MUST surface to OpenCode. No layer may
  retry or fall back to ordinary `openai/*` automatically.
- The OpenCode 1.18.31 plugin host ignores external `config` hook exceptions
  after logging them; C1 MUST fail closed at the dedicated `chat.headers`
  boundary and MUST leave ordinary providers unaffected when config resolution
  failed.
- Explicit `enabled_providers` filtering remains user-owned as specified in
  §4.1; a filtered dedicated provider is unavailable and cannot fall back.
- Diagnostics MAY identify the failing boundary and safe error category, but MUST
  NOT log credentials, request bodies, or response bodies.

## 6. Security and Privacy

- OpenCode core owns ChatGPT OAuth acquisition, storage, refresh, and injection.
  Neither the project plugin nor relay implements or stores OAuth credentials.
- The project plugin and relay MUST NOT read OpenCode's private auth store or
  receive raw OAuth credentials through a privileged access path.
- The ChatGPT access token may pass through Gateway and relay as the upstream
  `Authorization` value, but MUST NOT be emitted in relay application logs,
  metadata, configuration errors, or persisted storage.
- The Gateway token MUST stop at Cloudflare AI Gateway on the project’s ChatGPT
  Custom Provider path.
- The relay token MUST stop at the relay and MUST be removed before the upstream
  request.
- If Gateway metadata is used, it MUST remain limited to the static `source`,
  `auth_type`, and `plugin` fields defined in §4.4.
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
- automatic fallback from a failed `cf-ai-gw-relay/*` request to `openai/*`
- PAT, `CODEX_ACCESS_TOKEN`, or a separate OAuth flow
- migration of ChatGPT OAuth traffic onto OpenCode’s built-in Cloudflare native
  passthrough provider

Tools are included in the initial direct-forwarding scope. Managed residency is
not supported in the initial scope. Requests containing either
`x-openai-internal-codex-residency` or `X-OpenAI-Fedramp` MUST be rejected with
`400` before the upstream fetch; the relay MUST NOT guess or add residency
headers.

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

## 9. Acceptance and Runtime Validation

### 9.1 Protected Acceptance

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

The workflow executes GitHub-hosted on `ubuntu-latest` without accessing or
requiring OpenCode OAuth state (`auth.json` or `OPENCODE_AUTH_CONTENT`). It
evaluates the provider boundary using `BoundaryProbe` sentinels across two
scenarios:

1. `valid-gateway-invalid-relay`: Sends the valid Gateway token and an invalid
   relay sentinel. PASS requires HTTP `401` with response class `relay-rejected`
   and body `{"error":"unauthorized"}`.
2. `invalid-gateway-valid-relay`: Sends an invalid Gateway sentinel and the
   valid relay secret. PASS requires Gateway rejection (HTTP `401` or `403`)
   with response class `gateway-rejected` (not the relay unauthorized envelope).

The boundary driver enforces `MAX_BOUNDARY_RESPONSE_BYTES = 4096`. For each
complete chunk returned by `reader.read()`, it checks the cumulative size before
retaining the chunk. If the size exceeds 4096 bytes, it cancels the body stream
without retaining the oversized chunk or classifying the response. This bounds
retained bytes but does not guarantee a 4097-byte receive limit. Response bodies
and credentials MUST NOT be logged or persisted.

The boundary driver is decoupled from `RELAY_ACCEPTANCE_ORIGIN`, which is
dedicated to direct relay checks in `apps/deno-relay/acceptance_test.ts`.

Protected acceptance MUST NOT claim to verify OpenCode OAuth availability or
refresh-state persistence, live OpenCode non-stream output, cancellation, or
tool choice. Adding any of these as a live CI assertion requires explicit
architecture and security re-approval. OAuth state MUST remain outside CI; this
condition does not authorize placing it in GitHub Secrets, workflow
environments, artifacts, caches, logs, or other CI storage.

Legacy and future generic acceptance are distinct test concerns. The generic
contract, once implemented, requires live-path verification through real
Cloudflare AI Gateway, real Deno Deploy, and the Command Code provider,
including path mapping, credential separation, Gateway logging, OpenAI/Anthropic
route compatibility, malformed body handling, size limits, and root-`anyOf`
behavior.

### 9.2 C1 Disposable Runtime Validation

C1 was validated in a disposable runtime; this evidence does not claim that
production source or deployment was modified. The validation baseline was:

```text
OpenCode: 1.18.31
Commit: 014614d35b397775e5d397a490fc72368c894ec2
Bundled @ai-sdk/openai: 3.0.88
Model: gpt-6-sol
Agent: build
```

The stock `openai/gpt-6-sol` ChatGPT OAuth baseline passed before the C1
candidate. The C1 candidate used:

```text
selected model: cf-ai-gw-relay/openai/gpt-6-sol
provider identity: cf-ai-gw-relay
effective credential provider: openai
```

The first candidate reached the Gateway and relay path but returned HTTP `400`.
The Gateway and direct-relay differential requests both returned `400`; the safe
error category was unavailable. Relay-path evidence, absence of the relay's
pre-upstream rejected residency/FedRAMP headers, and its upstream-status
pass-through behavior classified this as `R4 — UPSTREAM_HTTP_400`. No response
body was retained.

Safe request-shape comparison with normal OpenAI identified a bounded
credential-semantics propagation defect: Codex `chat.params`/`chat.headers` and
dedicated model materialization were still following the selected provider
identity/profile instead of the effective OpenAI credential owner. The C1 body
also contained fields not present in the normal Responses request, including an
unwanted `max_output_tokens` field.

The bounded fix propagated the shared credential-owner decision through the
OpenAI Codex hooks and inherited the OpenAI owner's model profile/model loader
while preserving the `cf-ai-gw-relay` identity and Gateway URL. The resulting C1
request shape matched the normal OpenAI Responses shape. After the fix:

```text
provider identity: cf-ai-gw-relay
auth lookup key: openai
auth type: oauth
OpenAI/Codex request semantics: enabled
Authorization present: yes (Bearer scheme; value not recorded)
cf-aig-authorization present: yes (Bearer scheme; value not recorded)
ChatGPT-Account-Id present: yes (raw value not recorded)
Gateway URL preserved: yes
direct chatgpt.com rewrite: no
Gateway request path: /v1/responses
relay path: /v1/responses
upstream: chatgpt.com/backend-api/codex/responses
Gateway status: 200
relay/upstream status: 200
OpenCode usable response: yes
C1 result: VALIDATED
```

Cloudflare Gateway logs identified the selected stored Custom Provider slug
`relay-chatgpt`, exposed in the Gateway route as `custom-relay-chatgpt`, and
recorded the `/v1/responses` provider request with HTTP `200`. The relay forwards
the upstream status unchanged; its fixed upstream is the Codex endpoint above.
No request/response body or credential value is part of this evidence.

The normal `openai/gpt-6-sol` regression then returned HTTP `200` through the
existing ChatGPT/Codex route. Its provider identity remained `openai`; the C1
credential delegation marker was absent. C1 delegation is explicit opt-in and
does not alter ordinary `openai/*` traffic.

This runtime evidence validates C1 as a **BOUNDED CORE CAPABILITY**. It does not
remove the host-capability and protected-acceptance release gates in §§3 and 10;
protected CI MUST NOT receive or claim to validate OpenCode OAuth state.

## 10. Release Gate

A supported plugin release requires all of the following:

1. OpenCode exposes the host-version capability expected by the plugin.
2. OpenCode can block the matching Codex request when plugin activation is
   rejected, so fail-closed semantics cannot degrade into direct bypass.
3. `SUPPORTED_OPENCODE_RANGE` and `peerDependencies.opencode` agree with the
   actual supported host range.
4. Repository tests and package verification pass.
5. The C1 resolver, OpenAI-owner model/request semantics, Codex hooks, and
   target-aware transport satisfy the focused tests in §4.5.
6. A production-source runtime acceptance passes Gateway → relay → upstream →
   OpenCode response, followed by the ordinary `openai/gpt-6-sol` regression.
7. Protected acceptance passes for the behavior included in the release. That
   OAuth-free workflow MUST NOT be presented as proof of OpenCode OAuth reuse.

Release history belongs in `packages/opencode-plugin/CHANGELOG.md`, not in this
specification.

## Appendix A. Canonical Ownership

- Technical correctness and protocol contracts: `SPEC.md`
- Human configuration guidance: `docs/configuration.md`
- Deployment and release procedure: `docs/deployment.md`
- Operations and rollback procedure: `docs/operations.md`
- AI agent behavior: `AGENTS.md`
- Plugin release history: `packages/opencode-plugin/CHANGELOG.md`

## Appendix B. Architecture Decisions and Superseded Alternatives

The following records the technical rationale behind key architecture decisions
and explicitly rejects superseded approaches:

1. **C1 Dedicated Provider Identity — Selected for Issue #28**:
   - Relay-selected models retain `provider identity = cf-ai-gw-relay` under the
     namespace `cf-ai-gw-relay/openai/<model>`.
   - Their effective credential and OpenAI/Codex semantics owner is `openai`.
     This C1 architecture was validated in a disposable OpenCode `1.18.31`
     runtime and is the selected architecture in this specification.
   - The pre-C1 `provider.models` route through `openai/gpt-5.6-luna` is an
     implementation snapshot only; it is not the Issue #28 design decision.
   - Routing relay-selected traffic as `openai/<model>` is rejected because it
     collapses the required dedicated provider identity.

2. **Selected Provider Identity Is Not Credential Identity**:
   - OpenCode MUST preserve the selected dedicated provider identity while
     resolving the explicit `credentialProvider = "openai"` owner.
   - The shared effective-owner resolver applies only to the bounded
     `cf-ai-gw-relay` → `openai` opt-in. A general provider-to-provider credential
     graph is not part of C1.

3. **OpenCode-Owned OAuth vs. PAT / External Credential Management**:
   - Personal Access Tokens (PAT) and external credential broker architectures
     were rejected. OpenCode's native authentication mechanism owns credential
     acquisition, storage, refresh, and header injection.
   - The project plugin and relay treat `Authorization` and
     `ChatGPT-Account-Id` as opaque transport data without inspecting, modifying,
     or persisting tokens.

4. **C1 vs. Separate Provider-Owned OAuth (C2)**:
   - A separate `cf-ai-gw-relay` login or credential lifecycle is not selected.
     It would not reuse the existing OpenCode ChatGPT OAuth as required by Issue
     #28. The C1 credential-owner delegation is the bounded capability selected
     by this specification.

5. **Superseded Global `fetch` Interposer**:
   - A global `fetch` interceptor, URL constructor ending in `/v1/responses`, and
     request rewriters are not part of C1.
   - C1 uses provider-scoped credential delegation and target-aware transport;
     it preserves the configured Gateway URL for the dedicated provider and
     leaves ordinary OpenAI routing unchanged.

6. **Managed Residency Scoping**:
   - Managed residency (`x-openai-internal-codex-residency` or
     `X-OpenAI-Fedramp`) is not supported in the initial scope. The relay rejects
     those headers with HTTP `400` before the upstream fetch rather than guessing
     or forwarding unverified residency settings.

## Appendix C. Non-normative Future Considerations

The following remain possible future work and are not committed behavior:

- provider-specific parameter translation such as `max_tokens` /
  `max_completion_tokens`;
- model aliases;
- additional preset providers;
- response-side normalization;
- configuration-driven expansion of provider presets, if a future security model
  can preserve fixed-origin containment.
