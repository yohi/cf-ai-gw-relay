# cf-ai-gw-relay Technical Specification

Status: **Normative**

Issue #28 is the product-requirement authority. This document is its canonical
technical contract and MUST remain aligned with Issue #28. It distinguishes the
selected C1 architecture, disposable runtime validation, the relay behavior
implemented in this repository, and future generic relay work.

Normative keywords such as **MUST**, **MUST NOT**, **SHOULD**, and **MAY**
describe required behavior. Where this document conflicts with human-facing
summaries, this document takes precedence. If it conflicts with Issue #28, Issue
#28 wins and this document is defective. Source code and tests remain the
executable implementation; discrepancies between implementation and this
specification are defects that must be resolved deliberately.

## 1. Scope and Status

The final repository contains two runtime deliverables:

1. `apps/opencode-plugin` — publishable OpenCode plugin package
   `@yohi/cf-ai-gw-relay`.
2. `apps/deno-relay` — Deno Deploy relay.

They MUST NOT share runtime code. Their integration boundary is HTTP.
`packages/opencode-plugin` is a pre-Issue-#28 layout and MUST NOT be part of the
final architecture. The npm package remains; its source, tests, package
metadata, and release entry move to `apps/opencode-plugin`.

### 1.1 Pre-Issue #28 source snapshot (not the selected design)

The current repository source still contains this pre-Issue-#28 integration
snapshot:

```text
OpenCode provider: openai
  -> plugin provider.models hook
  -> model.api.url (suffix-free Gateway Custom Provider URL)
  -> Cloudflare AI Gateway Custom Provider
  -> AI SDK appends /responses
  -> relay POST /v1/responses
  -> https://chatgpt.com/backend-api/codex/responses
```

This source snapshot is not the selected architecture and is not production-ready
acceptance for Issue #28. The relay currently implements only `POST /v1/responses`.

### 1.2 Selected Issue #28 architecture

The selected C1 route is:

```text
OpenCode provider identity: cf-ai-gw-relay
  -> model namespace cf-ai-gw-relay/openai/<model>
  -> OpenCode-owned OpenAI/ChatGPT OAuth semantics
  -> Cloudflare AI Gateway Custom Provider
  -> relay POST /v1/responses
  -> https://chatgpt.com/backend-api/codex/responses
```

Ordinary `openai/<model>` remains a distinct route. The C1 validation model was
`gpt-6-sol`: its selected model ID was `cf-ai-gw-relay/openai/gpt-6-sol`, its
OpenCode-visible upstream model ID was `openai/gpt-6-sol`, and its wire model ID
was `gpt-6-sol`. The selected provider identity MUST remain
`cf-ai-gw-relay`; `openai` is the effective credential and model-semantics owner.
OpenCode owns OAuth acquisition, storage, refresh, and injection. C1 MUST reuse
the user's existing ChatGPT OAuth identity and subscription quota; it MUST NOT
create a separate OAuth identity or billing path. The plugin and relay MUST NOT
receive raw OAuth credentials as application-visible values.

This architecture was validated in a disposable patched OpenCode `1.18.31`
runtime (§9.2). That validation baseline is not the minimum supported production
version and does not claim that the current repository source already implements
C1.

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
  intercept or mutate ordinary `openai/*` traffic, retry loops, response caching,
  quota parsing, or SSE reconstruction. It MUST provide its own `cf-ai-gw-relay`
  provider models and merge user overrides according to §4.4.
- The relay MUST remain stateless and MUST NOT persist request or response
  payloads.
- The relay runtime MUST have zero external runtime dependencies.
- The plugin MUST use OpenCode's public plugin SDK/API and MUST NOT vendor or copy
  OpenCode plugin framework or private source. Runtime dependencies are limited
  to the final package metadata; release checks MUST verify the dependency set.
- Gateway credentials and relay credentials MUST remain distinct.
- Credentials and request payloads MUST NOT be included in configuration error
  messages.
- Cloudflare AI Gateway is the intended observability plane.

## 3. OpenCode Host Compatibility

### 3.1 C1 architecture-validation baseline

The disposable architecture spike used:

```text
OpenCode: 1.18.31
commit: 014614d35b397775e5d397a490fc72368c894ec2
bundled @ai-sdk/openai: 3.0.88
```

This patched source checkout is validation evidence only. It MUST NOT be
represented as a released production host or as the minimum supported version.

### 3.2 Minimum supported production version

The minimum supported production OpenCode version MUST be the lowest released
artifact that exposes the public plugin/provider/authentication capabilities
required for C1 and passes the production-host acceptance gate in §10. No
production minimum is established by the disposable `1.18.31` spike. The
implementation plan MUST determine and record the exact version and supported
range from authoritative OpenCode release/source evidence; until then, production
support MUST remain blocked.

The plugin MUST use only published public SDK/API contracts. It MUST NOT import
OpenCode private runtime modules, read the private auth store, or vendor
OpenCode implementation code. The host integration MUST provide fail-closed
request blocking for a rejected C1 request; plugin activation failure alone is
not proof that a request cannot bypass the Gateway.

The release MUST be rejected when its host is below the established minimum or
does not expose a required public capability. Protected OAuth-free CI MUST NOT
claim to prove local OpenCode OAuth reuse.

## 4. OpenCode Plugin Contract

### 4.1 Dedicated provider identity and models

The publishable plugin package is `@yohi/cf-ai-gw-relay`; its repository source
and package root are `apps/opencode-plugin/`. The OpenCode configuration MUST
register the plugin and explicitly define `provider.cf-ai-gw-relay`. The plugin
MUST expose provider identity `cf-ai-gw-relay` and MUST provide its standard
OpenAI-upstream models under IDs of the form `openai/<model>`.

The selected model namespace is:

```text
cf-ai-gw-relay/openai/<model>
```

The C1 validation example is `cf-ai-gw-relay/openai/gpt-6-sol`, with OpenCode
model ID `openai/gpt-6-sol` and wire-body model ID `gpt-6-sol`. The initial
plugin model catalog MUST include this validated model when it exists in the
supported OpenAI owner catalog. Other upstreams are unsupported in the initial
release and MUST fail explicitly. The plugin MUST provide baseline model
definitions; users MAY add models and override any conflicting plugin-provided
model field, with user configuration taking precedence over plugin defaults.

The plugin MUST NOT require `provider.openai` to be defined in `opencode.json[c]`.
Installing the plugin MUST NOT intercept, rewrite, mutate, or add control headers
to ordinary `openai/*` traffic. Ordinary and dedicated routes MUST coexist.
`enabled_providers` remains user-owned: the plugin MUST NOT modify an explicit
allowlist; excluding `cf-ai-gw-relay` makes C1 unavailable, without fallback.

### 4.2 Credential owner and OAuth

Selected provider identity and credential identity are separate:

```text
selected provider identity: cf-ai-gw-relay
effective credential owner: openai
```

The explicit provider option is:

```text
provider.cf-ai-gw-relay.options.credentialProvider = "openai"
```

The supported host MUST implement one shared credential-owner resolver and
propagate that decision through auth lookup, OpenAI/Codex request and model
semantics, agent/model generation, OAuth transport, and target-aware Gateway
routing. It MUST preserve the selected provider identity. OpenCode exclusively
owns ChatGPT OAuth acquisition, persistence, refresh, and injection. `openai/*`
resolves to its own credentials and MUST remain unaffected by C1 delegation.

### 4.3 Configuration contract and precedence

`provider.cf-ai-gw-relay.options` and the corresponding environment variables
both configure the C1 provider. For each pair, a present environment variable
has precedence over the provider option. If an environment variable is present
but empty or invalid, validation MUST fail for that value; it MUST NOT silently
fall back to the provider option. Provider options are normal user configuration,
not an OAuth credential store.

This specification defines the normative C1 configuration contract. The
human-facing English and Japanese configuration guides MUST be synchronized
with it by the implementation plan; those guides do not override this document.

| Setting | Provider option | Environment variable | Required | Precedence and validation | Secret |
| --- | --- | --- | --- | --- | --- |
| Cloudflare account ID | `accountId` | `RELAY_CF_ACCOUNT_ID` | For a C1 request | ENV > option; non-empty string | No |
| AI Gateway ID | `gatewayId` | `RELAY_CF_GATEWAY_ID` | For a C1 request | ENV > option; non-empty string | No |
| Gateway token | `gatewayToken` | `RELAY_CF_AIG_TOKEN` | For a C1 request | ENV > option; non-empty string, never log | Yes |
| Relay bearer secret | `relaySecret` | `RELAY_SECRET` | For a C1 request | ENV > option; non-empty string, never log | Yes |
| Custom Provider slug | `providerSlug` | `RELAY_CF_PROVIDER_SLUG` | No | ENV > option > `relay-chatgpt`; validate as one path component | No |
| Gateway payload collection | fixed `false` for C1 | `RELAY_CF_AIG_COLLECT_LOG_PAYLOAD` | No | C1 accepts only `false`; `true` is rejected | No |
| Gateway base origin | test-only; not a production option | `RELAY_CF_AIG_BASE_URL` | No | Production origin is `https://gateway.ai.cloudflare.com`; test override requires test mode and exact allowlisted origin | No |
| Gateway test mode | not a provider option | `RELAY_CF_AIG_TEST_MODE` | No | Test-only; production configuration MUST NOT enable it | No |

Legacy plugin option names `apiKey` and `relayToken` are not aliases and MUST
NOT be used for `gatewayToken` or `relaySecret`. Existing `RELAY_CF_*` variable
names are preserved. C1 Gateway and relay secrets MUST remain distinct from
OpenCode OAuth credentials.
Provider-option secrets MUST NOT be committed to Git-managed configuration;
environment variables MUST remain available so users can keep secret values out
of configuration files.

### 4.4 Registration and request-time validation

Plugin loading and provider registration MUST succeed when any or all of
`accountId`, `gatewayId`, `gatewayToken`, and `relaySecret` are absent. The
registration/config hook MUST register the dedicated provider and baseline model
catalog without requiring complete runtime configuration. It MUST construct
the provider entry before mutating the host config, MUST preserve user model
overrides and `enabled_providers`, and MUST NOT rely on a config-hook exception
to abort OpenCode initialization. OpenCode 1.18.31 logs and ignores external
plugin `config` hook exceptions; implementation MUST NOT depend on an exception
preventing ordinary provider use.

The implementation MUST resolve and validate all required fields only when a
`cf-ai-gw-relay/openai/<model>` request is selected, before any network dispatch.
When route fields are absent or invalid during registration, the provider may use
the syntactically valid non-dispatch URL
`https://gateway.ai.cloudflare.com/v1/0/0/custom-relay-chatgpt/v1`; this URL
MUST never be sent because request-time validation fails first. With complete
settings, the provider MUST materialize the actual route from §4.5.
Ordinary `openai/*` requests MUST return without reading C1 runtime state or
validating C1 settings.

Missing and invalid settings use distinct request-time errors. Their exact types
are `MissingRelayConfigurationError` and `InvalidRelayConfigurationError`.
They expose only applicable option names in table order and MUST NOT expose
values. Their messages use these formats:

```text
Missing required cf-ai-gw-relay configuration: <comma-separated missing keys>
Invalid cf-ai-gw-relay configuration: <comma-separated invalid keys>
```

OAuth absence uses the separate host error `OpenAIOAuthRequiredError`; its
user-facing message MUST state that OpenAI/ChatGPT OAuth is required and direct
the user to sign in through OpenCode. No Gateway or relay request may occur when
a configuration or OAuth error is raised; no provider-not-found, generic
`UnknownError`, silent fallback, or automatic `openai/*` fallback is permitted
for an otherwise registered C1 provider with incomplete runtime configuration.

### 4.5 Gateway route and authentication channels

The plugin MUST materialize the selected model's suffix-free API base URL from
the resolved `accountId`, `gatewayId`, and provider slug:

```text
https://gateway.ai.cloudflare.com/v1/<accountId>/<gatewayId>/custom-<providerSlug>/v1
```

Every path component MUST be percent-encoded independently. The stored slug is
`relay-chatgpt`; `custom-relay-chatgpt` is its Gateway route segment. The
Cloudflare Custom Provider's stored base URL MUST be the relay HTTPS origin
without a path. The AI SDK owns the `/responses` suffix, so the effective
Gateway route MUST end with `/v1/responses` and reach relay `POST /v1/responses`.

For a selected C1 request, the plugin MUST set:

```text
cf-aig-authorization: Bearer <gatewayToken>
x-chatgpt-relay-authorization: Bearer <relaySecret>
cf-aig-collect-log: true
cf-aig-collect-log-payload: false
cf-aig-skip-cache: true
cf-aig-max-attempts: 1
```

If `cf-aig-metadata` is sent, it MUST contain only static `source`, `auth_type`,
and `plugin` fields. Gateway authentication MUST NOT replace OpenCode-owned
`Authorization` or `ChatGPT-Account-Id`. The Gateway token terminates at
Cloudflare AI Gateway; the relay secret is removed before upstream dispatch.
OAuth values remain opaque and MUST NOT be read by plugin logic or inspected by
the relay.

### 4.6 Streaming, abort, and failures

The C1 provider MUST preserve the existing Codex response stream and abort
behavior. It MUST surface OAuth-missing, unsupported-upstream, invalid/missing
C1 configuration, Gateway, relay, network, and upstream errors with actionable
messages that do not contain secret values. Any C1 failure is fail-closed and
MUST NOT fall back to `openai/*`.

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

### 5.8 C1 Error Ownership and Propagation

- OpenCode owns selected provider/model resolution, effective credential-owner
  resolution, OAuth lookup/refresh/injection, and OpenAI/Codex request semantics.
- Cloudflare AI Gateway owns Gateway authentication, route selection, and Custom
  Provider dispatch.
- The relay owns `POST /v1/responses` validation, relay authentication, request
  header sanitization, and dispatch to the fixed upstream.
- The relay MUST return upstream status and sanitized headers without fallback.
- Missing/invalid C1 options and missing OpenAI OAuth fail before network
  dispatch. Gateway/relay/upstream failures surface to OpenCode without retry or
  fallback to ordinary `openai/*`.
- OpenCode 1.18.31 ignores external config-hook exceptions after logging them;
  C1 validation occurs at selected-request time and MUST NOT break ordinary
  providers.
- User-owned `enabled_providers` filtering is defined in §4.1. Diagnostics MAY
  identify the failing boundary and safe error category, but MUST NOT log secrets,
  request bodies, or response bodies.

## 6. Security and Privacy

- OpenCode core owns ChatGPT OAuth acquisition, storage, refresh, and injection.
  The project plugin and relay MUST NOT implement or store OAuth credentials.
- The plugin MUST NOT read the private OpenCode auth store or inspect, copy,
  log, or persist raw OAuth values. The OpenCode-owned `Authorization` and
  `ChatGPT-Account-Id` values MAY transit Gateway and relay as opaque transport
  data only where required for upstream authentication; relay code MUST NOT
  inspect or record them.
- Gateway and relay provider-option secrets are user configuration, not OAuth
  state. They MUST NOT be persisted by a new credential store.
- The Gateway token MUST terminate at Cloudflare AI Gateway. The relay secret
  MUST be removed before upstream dispatch.
- No secret value, full auth object, prompt, request body, or response body may
  appear in errors, normal/debug logs, metadata, or persistent storage.
- Plugin metadata MUST remain limited to fixed, non-sensitive `source`,
  `auth_type`, and `plugin` fields defined in §4.5. Agent, session, model,
  account, OAuth, Gateway, relay, prompt, and response identifiers/content MUST
  NOT be added.
- Gateway, relay, DNS, connection, timeout, authentication, and upstream
  failures MUST surface to the user; they MUST NOT trigger direct fallback.

## 7. Non-goals

The Issue #28 initial release does not provide:

- plugin-owned OAuth login, token refresh, account extraction, or OAuth storage;
- a separate provider-owned OAuth flow (C2);
- interception or rewriting of built-in `openai/*` models or traffic;
- retries, response caching, quota parsing, or SSE reconstruction;
- arbitrary generic proxying;
- automatic direct ChatGPT or `openai/*` fallback;
- Anthropic, Google, or other upstream implementations;
- migration of ChatGPT OAuth traffic onto OpenCode's built-in Cloudflare native
  passthrough provider;
- vendored copies or private imports of the OpenCode plugin framework.

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

### 9.2 C1 Architecture Validation

C1 was validated in a disposable patched runtime; this validates architecture,
not this repository's current source or a production release:

```text
OpenCode validation baseline: 1.18.31
commit: 014614d35b397775e5d397a490fc72368c894ec2
bundled @ai-sdk/openai: 3.0.88
model: gpt-6-sol
```

The stock `openai/gpt-6-sol` OAuth baseline passed. The dedicated
`cf-ai-gw-relay/openai/gpt-6-sol` request first reached Gateway and relay but
returned HTTP 400 because OpenAI/Codex credential-owner request and model
semantics were not fully propagated. After the bounded fix—shared owner
resolution through auth lookup, request preparation, model/profile
materialization, Codex hooks, agent generation, and target-aware transport—the
C1 Gateway, relay, upstream, and OpenCode response all returned HTTP 200. The
Gateway URL remained intact, direct ChatGPT rewriting did not occur, and no raw
OAuth value was exposed to plugin logic. A subsequent ordinary
`openai/gpt-6-sol` regression returned HTTP 200 with no C1 delegation marker.

The first failure was classified as `R4 — UPSTREAM_HTTP_400`; its error body
category was unavailable and no response body was retained. Safe request-shape
comparison found C1 was missing owner-specific Codex semantics and carried an
unwanted `max_output_tokens` field. After the bounded fix, the recorded evidence
was:

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

Gateway logs identified stored Custom Provider slug `relay-chatgpt`, exposed on
the route as `custom-relay-chatgpt`, with HTTP `200`. The relay forwarded the
upstream status unchanged. No response body or credential value is part of the
evidence.

This proves a **BOUNDED CORE CAPABILITY** in a disposable patched host. It does
not establish a production minimum version or satisfy §10 by itself.

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
candidate. The C1 candidate selected
`cf-ai-gw-relay/openai/gpt-6-sol`, retained provider identity
`cf-ai-gw-relay`, and delegated effective credential/model semantics to
`openai`. Its first request reached Gateway and relay but returned HTTP `400`
because owner-specific Codex request/model semantics were incomplete. The
bounded correction propagated credential ownership through auth lookup, request
preparation, model/profile materialization, Codex hooks, agent generation, and
target-aware transport. The final Gateway, relay, upstream, and OpenCode response
returned HTTP `200`; the Gateway target was preserved, no direct ChatGPT rewrite
occurred, and no OAuth value was exposed to plugin logic. The subsequent normal
`openai/gpt-6-sol` regression returned HTTP `200` with no C1 delegation marker.

This evidence validates a **BOUNDED CORE CAPABILITY** only. It does not establish
a minimum production version or satisfy the release gate in §10.

## 10. Release Gate

A supported plugin release requires all of the following:

1. The C1 public provider/authentication integration is available in a released
   OpenCode artifact. A private patched checkout is not a supported host.
2. The released minimum and compatible range established in §3.2 are recorded
   in `apps/opencode-plugin/package.json` and covered by host compatibility tests.
3. A rejected C1 request cannot proceed by direct bypass or fallback to
   `openai/*`.
4. The relocated package's tests, typecheck, build, pack, and release metadata
   checks pass from `apps/opencode-plugin`.
5. Every Issue #28 acceptance criterion has traceable SPEC, task, and
   test/acceptance coverage.
6. C1 end-to-end acceptance passes on the released minimum production host,
   including streaming, abort, failure propagation, OAuth isolation, and the
   ordinary OpenAI regression.
7. Protected OAuth-free CI passes for the behavior it covers and is not
   represented as proof of OAuth reuse.
8. Manual real Gateway/relay acceptance passes without recording real secrets or
   payloads.

Release history belongs in `apps/opencode-plugin/CHANGELOG.md`, not in this
specification.

## Appendix A. Canonical Ownership

- Product requirements: GitHub Issue #28
- Technical correctness and protocol contracts: `SPEC.md`
- Human configuration guidance: `docs/configuration.md`
- Deployment and release procedure: `docs/deployment.md`
- Operations and rollback procedure: `docs/operations.md`
- AI agent behavior: `AGENTS.md`
- Plugin source, tests, package metadata, and release history:
  `apps/opencode-plugin/`

## Appendix B. Architecture Decisions and Superseded Alternatives

The following records the technical rationale behind key architecture decisions
and explicitly rejects superseded approaches:

1. **C1 Dedicated Provider and Credential Owner**:
   - Issue #28 requires selected identity `cf-ai-gw-relay` and namespace
     `cf-ai-gw-relay/openai/<model>`. The `openai` path segment identifies the
     credential/model-semantics owner; it does not change provider identity.
   - A disposable `1.18.31` spike validated a bounded host-core capability. The
     production release still requires the equivalent public capability in a
     released host artifact under §3.2.
   - The `provider=openai` routing workaround is rejected because it collapses
     the selected dedicated identity into the ordinary OpenAI namespace.

2. **ENV over Provider Options**:
   - Issue #28 requires both sources, with environment variables taking
     precedence. The exact option/environment pairs are normative in §4.3.

3. **Request-Time Completeness Validation**:
   - Provider registration MUST succeed without Gateway/relay settings. Required
     configuration is validated only when the dedicated provider is selected.

4. **Superseded OpenAI Interception**:
   - Earlier repository code routed a built-in `openai` model through a
     `provider.models` hook. Issue #28 replaces it with a dedicated provider;
     the final plugin MUST NOT mutate ordinary `openai/*`.
   - The old global fetch interposer, `installFetchInterposer`, and request
     rewriters are not part of the final design.

5. **OpenCode-Owned OAuth vs. PAT / External Credential Management**:
   - Personal Access Tokens (PAT) and external credential broker architectures
     were rejected. OpenCode's native authentication mechanism
     (`$XDG_DATA_HOME/opencode/auth.json`) owns credential acquisition, storage,
     refresh, and header injection.
   - The plugin and relay treat `Authorization` and `ChatGPT-Account-Id` as
     opaque transport data without inspecting, modifying, or persisting tokens.
   - A separate provider-owned OAuth flow (C2), PAT, and `CODEX_ACCESS_TOKEN`
     are not selected.

6. **Managed Residency Scoping**:
   - Managed residency (`x-openai-internal-codex-residency` or
     `X-OpenAI-Fedramp`) is not supported in the initial scope. Rather than
     guessing or forwarding unverified residency headers, the relay rejects
     matching requests with HTTP `400` to guarantee fail-closed behavior.

## Appendix C. Non-normative Future Considerations

The following remain possible future work and are not committed behavior:

- provider-specific parameter translation such as `max_tokens` /
  `max_completion_tokens`;
- model aliases;
- additional preset providers;
- response-side normalization;
- configuration-driven expansion of provider presets, if a future security model
  can preserve fixed-origin containment.
