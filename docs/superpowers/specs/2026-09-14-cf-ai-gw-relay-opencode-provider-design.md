# OpenCode ChatGPT Codex Relay Provider Design

## Status

This revision records the architecture validated by the target-runtime spike.
It is a design-document change only. It does not authorize source changes,
tests, dependency changes, deployment changes, Cloudflare configuration
changes, or implementation planning.

Current gate state:

```text
SRG-022: RESOLVED CANDIDATE — PENDING REVIEW
SRG-035: WAITING ON SRG-022 RE-REVIEW
writing-plans: BLOCKED
production implementation: NOT STARTED
```

The required order remains:

```text
1. SRG-022 design update
2. SRG-022 re-review
3. SRG-022 reviewer decision
4. SRG-035 = ACTIVE after SRG-022 re-review
5. protocol characterization
6. SRG-035 = RESOLVED
7. writing-plans
```

## 1. Architecture Decision

OpenCode uses its built-in `openai` provider and its built-in ChatGPT OAuth
credential. The selected routing owner is the public `provider.models` hook,
which sets the target model's `model.api.url` to the Cloudflare AI Gateway
Custom Provider endpoint. The relay is not represented as a second OpenCode
provider identity.

This revision defines the target architecture for OpenCode 1.18.31. It does
not claim that the current repository source has already migrated to this
architecture. The current plugin entrypoint still installs
`installFetchInterposer()`. That existing path is migration input, not the
selected target transport owner.

```text
OpenCode 1.18.31 (provider: openai)
  -> built-in ChatGPT OAuth fetch
  -> model.api.url
  -> Cloudflare AI Gateway Custom Provider
  -> Cloudflare Custom Provider base_url
  -> https://cf-ai-gw-relay.yohi.deno.net/v1
  -> AI SDK appends /responses
  -> relay POST /v1/responses
  -> Codex upstream
```

### 1.1 Selected OpenCode transport extension point

The selected public OpenCode extension point is the plugin `provider.models`
hook. The selected routing owner is:

```text
Target runtime: OpenCode 1.18.31
OpenCode public extension point: provider.models hook
Selected routing owner: provider.models hook
Selected routing field: model.api.url
```

For the target model, the hook MUST set the following route:

```text
model.api.url =
  https://gateway.ai.cloudflare.com/v1/<account>/<gateway>/custom-<slug>
```

The plugin separately owns configuration of the Cloudflare and relay control
headers. That header responsibility does not make the header configuration a
second route owner. The plugin MUST NOT acquire, parse, replace, or take
ownership of the OpenCode ChatGPT OAuth credential. In particular,
`Authorization` and `ChatGPT-Account-Id` remain owned by OpenCode's built-in
`openai` provider.

The transport contract is:

```text
OpenCode provider: openai
OpenCode extension point: public provider.models hook
Selected routing owner: provider.models hook
Target model.api.url: https://gateway.ai.cloudflare.com/v1/<account>/<gateway>/custom-<slug>
Cloudflare Custom Provider: custom-<slug>
Custom Provider base_url: https://cf-ai-gw-relay.yohi.deno.net/v1
AI SDK request suffix: /responses
Relay route: POST /v1/responses
```

The selected `model.api.url` shape is therefore:

```text
https://gateway.ai.cloudflare.com/v1/<account>/<gateway>/custom-<slug>
```

The account, Gateway, and provider slug are configuration path components and
MUST be encoded as individual path components. The `model.api.url` value MUST
NOT include `/v1/responses` or `/responses`. The AI SDK appends `/responses`,
producing the Gateway request path `.../custom-<slug>/responses`. The Custom
Provider `base_url` then maps that suffix to the relay's `POST /v1/responses`
route.

The values used to construct `model.api.url`, the control headers, and the
Custom Provider endpoint are resolved through the existing repository
configuration and secret-injection mechanism. This design does not invent a
new secret-management subsystem or record secret values.

The relay remains fail-closed. There is no direct Codex or ChatGPT fallback,
retry loop, payload persistence, or silent credential substitution.

### 1.2 REJECTED / SUPERSEDED: Legacy fetch interposer boundary

The current source uses `installFetchInterposer()` together with
`buildGatewayUrl()` and `request-rewrite.ts` to rewrite a matching global
`fetch` request. Its current URL shape ends in `/v1/responses`. Those symbols
are legacy implementation details and are not the selected transport owner.

The selected architecture MUST NOT retain global fetch interception as a
second routing owner for the OpenAI request. A later implementation plan may
remove the interposer, disable it, or reduce it to a non-routing responsibility,
but it MUST NOT run it in parallel with the `provider.models` transport path.

## 2. Provider Identity and Model Boundary

The OpenCode provider identity is exactly:

```text
openai
```

The project name and relay hostname may contain `cf-ai-gw-relay`, but that name
is not an independent OpenCode provider identity. The current design does not
define a second provider/model namespace.

OpenCode's normal `openai/<model>` selection remains the model-resolution
boundary. This revision does not decide any of the following:

- Final production Codex model.
- `model.api.id`.
- Wire-body model ID.
- Final model namespace or model alias.

The validation model `openai/gpt-5.6-sol` is a transport-validation model only.
It is not a production model decision.

## 3. Credential Architecture

### 3.1 OpenAI / Codex credential

ChatGPT / Codex authentication is owned by OpenCode's built-in `openai`
provider:

| Responsibility | Owner or behavior |
| --- | --- |
| Credential acquisition | OpenCode built-in ChatGPT OAuth |
| Credential owner | OpenCode |
| Credential storage | OpenCode |
| Credential refresh | OpenCode |
| `Authorization` injection | OpenCode |
| ChatGPT account routing metadata | OpenCode |
| Plugin, Gateway, and relay behavior | Treat the request credential as opaque transport data |

The plugin, Cloudflare component, and relay MUST NOT acquire, inspect for
ownership, extract, persist, refresh, or substitute the OpenAI OAuth
credential. They may forward the opaque HTTP authorization header required by
the request; forwarding is not credential extraction or credential ownership.

No private OpenCode credential API is required.

### 3.2 PAT architecture is not current

The current architecture has no Personal Access Token requirement. The
following are removed from the current design and MUST NOT be implemented:

- `CODEX_ACCESS_TOKEN` as a production requirement.
- Codex Personal Access Token as the selected credential.
- Business or Enterprise PAT acquisition, storage, rotation, or revocation.
- PAT `whoami` hydration as a required production flow.
- PAT permission gates or real-PAT pre-implementation blockers.
- OAuth-token extraction fallback or conversion outside OpenCode.

## 4. Cloudflare and Relay Credentials

Cloudflare authentication and OpenAI authentication are separate credentials.
Neither Gateway authentication nor relay authentication is an OpenAI OAuth
credential.

### 4.1 Cloudflare Gateway authentication

`cf-aig-authorization` is the Cloudflare AI Gateway credential:

| Responsibility | Owner or behavior |
| --- | --- |
| Credential owner | Cloudflare AI Gateway account/operator |
| Configuration owner | Deployment/operator configuration using the existing repository secret path |
| Existing configuration input | `RELAY_CF_AIG_TOKEN` or its existing equivalent |
| Existing precedence | `RELAY_CF_AIG_TOKEN` -> plugin `apiKey` |
| Header producer | Plugin control-header configuration using the resolved existing configuration |
| Header consumer | Cloudflare AI Gateway |
| Header validator | Cloudflare AI Gateway |
| OpenAI credential relationship | Must not be treated as an OpenAI credential |
| Secret value | Never recorded in this document |

The existing repository configuration precedence and injection mechanism remain
the source of truth. Environment/configuration overrides must not be changed as
part of this design update.

### 4.2 Relay authentication

The canonical relay credential is `RELAY_SECRET` and the canonical header is:

```text
x-chatgpt-relay-authorization: Bearer <relay secret>
```

| Responsibility | Owner or behavior |
| --- | --- |
| Credential owner | Relay deployment/operator |
| Configuration owner | Existing relay deployment secret configuration |
| Existing configuration input | `RELAY_SECRET` or its existing equivalent |
| Existing precedence | `RELAY_SECRET` -> plugin `relayToken` |
| Header producer | Plugin control-header configuration using the resolved existing configuration |
| Header validator | Deno relay |
| Header consumer | Deno relay |
| Upstream behavior | The header terminates at the relay and must not reach Codex |
| Secret value | Never recorded in this document |

`x-relay-authorization` is non-canonical. It is sanitized or removed as an
untrusted header and is never an authentication alias.

### 4.3 Plugin control-header responsibility

The plugin is the producer of the Gateway and relay control headers in the
selected architecture. It MUST configure the following headers without
replacing OpenCode-owned `Authorization` or `ChatGPT-Account-Id`:

```text
cf-aig-authorization
x-chatgpt-relay-authorization
cf-aig-collect-log
cf-aig-collect-log-payload
cf-aig-metadata
cf-aig-skip-cache
cf-aig-max-attempts
```

`cf-aig-authorization` and `x-chatgpt-relay-authorization` are the required
control credentials. The remaining `cf-aig-*` values preserve the existing
Gateway control behavior. No global fetch interposer may inject a competing
set of routing or control headers for the same OpenAI request. Header
configuration is separate from the `provider.models` route owner.

## 5. Header Boundary

The following ownership and forwarding rules are normative for the initial
architecture:

| Header | Producer | Consumer | Boundary behavior |
| --- | --- | --- | --- |
| `Authorization` | OpenCode | Codex/OpenAI upstream | OpenCode-owned credential; preserve as opaque transport data; no intermediary substitutes it |
| `ChatGPT-Account-Id` | OpenCode | Codex/OpenAI upstream | OpenCode-owned account routing metadata; preserve when supplied by OpenCode |
| `cf-aig-authorization` | Plugin control-header configuration | Cloudflare AI Gateway | Gateway credential only; stop at the Gateway boundary; never treat as OpenAI credential |
| `x-chatgpt-relay-authorization` | Plugin control-header configuration | Deno relay | Relay credential only; validate at relay; never forward to Codex |
| `cf-aig-metadata` | Plugin control-header configuration using existing Gateway configuration | Cloudflare AI Gateway | Preserve existing behavior when configured; not an authentication header and not a required OAuth substitute |
| `X-OpenAI-Fedramp` | OpenCode, only when its applicability is established | Codex/OpenAI upstream | Do not infer or add it for an unverified account mode |
| `x-openai-internal-codex-residency` | No producer in the initial scope | None in the initial scope | Do not add it by inference |
| `x-relay-authorization` | Untrusted caller input | None | Sanitize/remove; never accept for authentication |

The relay removes Gateway-only, relay-only, hop-by-hop, and forwarding headers
before the upstream request. It preserves only the OpenAI authorization and
routing metadata required by the selected OpenCode request contract.

## 6. Transport Architecture

### 6.1 OpenCode to Gateway

OpenCode uses `provider: openai`. The public `provider.models` hook sets the
target model's `model.api.url` to the exact Cloudflare AI Gateway Custom
Provider route:

```text
https://gateway.ai.cloudflare.com/v1/<account>/<gateway>/custom-<slug>
```

The route construction policy is normative:

```text
provider.models hook sets:
  model.api.url =
    https://gateway.ai.cloudflare.com/v1/<account>/<gateway>/custom-<slug>

AI SDK appends:
  /responses

Gateway request path:
  .../custom-<slug>/responses

Custom Provider base_url:
  https://cf-ai-gw-relay.yohi.deno.net/v1

Relay request:
  POST /v1/responses
```

Neither `/v1/responses` nor `/responses` may be included in `model.api.url`.
The `provider.models` hook MUST NOT append either suffix itself. The
transport seam establishes the destination and boundary ownership; it does not
select request, response, or SSE transformation behavior. The Gateway auth
header and relay auth header remain control credentials for their own
boundaries.

### 6.2 Gateway to relay

The relay route is exactly:

```text
POST /v1/responses
```

The authenticated request continues from the relay to the Codex upstream
boundary. Whether that boundary uses direct forwarding or a relay-only
protocol mapping remains under SRG-035. The relay may perform protocol
adaptation only if SRG-035 proves that it is required.

### 6.3 Component responsibilities

**OpenCode built-in ChatGPT OAuth**

```text
credential acquisition
credential storage
credential refresh
Authorization
ChatGPT-Account-Id
built-in OAuth fetch
```

**Plugin**

```text
public provider.models hook
model.api.url routing override
Cloudflare/relay control-header configuration
```

The plugin does not read OAuth access tokens or refresh tokens, copy or
persist credentials, or implement OAuth refresh.

**Cloudflare AI Gateway**

```text
Gateway authentication
Custom Provider routing
```

**Relay**

```text
relay authentication
/v1/responses ownership
protocol adaptation if SRG-035 proves it is required
fail closed
```

### 6.4 Transport invariants

- Fail closed on configuration, authentication, routing, or transport errors.
- Do not fall back directly to ChatGPT or Codex when Gateway or relay delivery fails.
- Do not extract, decode, copy into storage, or replace the OpenCode OAuth credential.
- Do not add retry loops, caching, or payload persistence.
- Do not add a generic `/upstream/*` contract.
- Do not perform plugin-side body rewriting to choose a production model or protocol.
- Treat the public `provider.models` hook as the selected plugin-side transport-routing owner.
- Do not use a global fetch interposer to route the same OpenAI request.

### 6.5 REJECTED / SUPERSEDED: Legacy global fetch interposer

`installFetchInterposer()`, `buildGatewayUrl()`, and `request-rewrite.ts` remain
the current source implementation's legacy transport path until a later
implementation change. Their existing `/v1/responses` URL construction is not
the target `model.api.url` shape.

This path is rejected and superseded as the current routing owner. It is
retained here only to identify the source migration input.

The implementation plan may specify whether those legacy symbols are deleted,
disabled, or reduced to a non-routing responsibility. It MUST not select global
fetch interception as an alternative transport owner or allow it to run in
parallel with the `provider.models` hook.

## 7. Error Ownership

Errors are owned by the boundary that can classify them without guessing:

| Error | Owning boundary |
| --- | --- |
| `UNKNOWN_MODEL` or model resolution failure | OpenCode model-resolution boundary |
| Plugin configuration, route construction, or control-header injection failure | OpenCode plugin `provider.models` / control-header configuration boundary |
| Cloudflare authentication failure | Cloudflare AI Gateway boundary |
| Relay authentication failure | Deno relay boundary |
| OpenAI/Codex OAuth authentication failure | Codex/OpenAI upstream authentication boundary |
| Authenticated upstream dispatch followed by model, protocol, body, SSE, or tools failure | SRG-035 protocol-characterization boundary |

Common policy:

```text
fail closed
no direct fallback
no silent credential substitution
no OAuth token extraction fallback
```

The plugin must not misclassify a Gateway or relay error as a successful
upstream response, and it must not translate an authentication error into a
different credential flow.

The plugin's route and control-header configuration must fail closed when
required configuration or control credentials cannot be resolved. It must not
leave a direct upstream route or a second fetch-interception fallback active
after a configuration failure.

## 8. Managed Residency

The target-runtime spike did not establish whether managed residency applies:

```text
managed residency applicable: UNKNOWN
```

Initial scope is therefore fixed as:

```text
Managed residency: NOT SUPPORTED IN INITIAL SCOPE
```

If the target workspace requires managed residency, the configuration is
unsupported and MUST fail closed. Additional design and runtime validation is
required before support can be added. The normal path must not guess or add
`x-openai-internal-codex-residency`. `X-OpenAI-Fedramp` is likewise emitted
only when its applicability and source are already established.

## 9. SRG-022 Runtime Evidence

The following is the complete design-level summary of the validated target
runtime. Exploration journal details and failed exploratory attempts are not
part of the architecture source of truth.

```text
Target:
OpenCode 1.18.31

provider identity:
openai

provider.models hook:
EXECUTED (public seam)

validation model:
openai/gpt-5.6-sol
transport validation model only; not the final production model decision

baseline:
PASS

model.api.url override:
EFFECTIVE

actual destination:
Cloudflare AI Gateway

Gateway:
REACHED

Gateway authentication:
PASS

direct chatgpt.com rewrite:
NO

relay:
REACHED

relay route:
POST /v1/responses

relay authentication:
PASS

upstream request emitted:
YES

upstream status:
HTTP 200

OAuth credential extraction:
NOT REQUIRED

private OpenCode API:
NOT REQUIRED
```

This evidence validates the credential and transport boundary. It does not
select the production model or close the protocol characterization owned by
SRG-035.

## 10. Rejected / Superseded Alternatives

The following entries are historical decisions only. They are not current
architecture and must not be reintroduced by an implementation agent.

### REJECTED / SUPERSEDED: Separate OpenCode provider identity

An independent `cf-ai-gw-relay` OpenCode provider and a namespace such as
`cf-ai-gw-relay/<upstream-provider>/<model>` were rejected because the
validated path uses the built-in `openai` provider and inherits its ChatGPT
OAuth ownership.

### REJECTED / SUPERSEDED: PAT credential architecture

The proposed PAT acquisition, `CODEX_ACCESS_TOKEN` source, metadata hydration,
PAT storage/lifecycle, and PAT permission gate were superseded by the validated
OpenCode-owned OAuth path. They are not current blockers or implementation
requirements.

### REJECTED / SUPERSEDED / VALIDATION FAILED: Config-hook baseURL routing

The earlier design assigned routing ownership to the public `config` hook by
setting `provider.openai.options.baseURL`. Target-runtime validation showed that
the hook executed, but this `options.baseURL` setting did not change the
built-in ChatGPT OAuth request route. The request used the direct
`chatgpt.com` route instead of reaching the observer.

Therefore `provider.openai.options.baseURL` is not adopted as the effective
ChatGPT OAuth route owner and is not used by the current architecture. The
selected route owner is the public `provider.models` hook, through the target
model's `model.api.url`.

### REJECTED / SUPERSEDED: Generic upstream route

The proposed `/upstream/openai/v1/responses` route was superseded by the
validated relay route `POST /v1/responses`. The generic `/upstream/*` contract
is not part of the current architecture.

### REJECTED / SUPERSEDED: `/v1`-shaped direct Codex rewrite

The spike recorded that an inappropriate `/v1`-shaped OpenCode base URL could
trigger a direct Codex rewrite. The validated configuration uses `provider=openai`
and the Cloudflare AI Gateway Custom Provider path instead. The relay route is
still `POST /v1/responses`.

## 11. SRG-035 Boundary

SRG-035 is waiting on SRG-022 re-review. It remains the owner of the following
deferred decisions and their target-runtime evidence:

The transport premise for SRG-035 is now:

```text
provider.models hook
  -> target model.api.url
  -> Cloudflare AI Gateway Custom Provider
  -> relay POST /v1/responses
```

1. Final production Codex model, including any `model.api.id` and wire model ID.
2. Authenticated request/response protocol characterization after upstream dispatch.
3. Live response streaming, SSE, and tools characterization.

SRG-035 MUST NOT be marked `RESOLVED` until the following closure contract is
complete and its evidence is recorded:

### 11.1 SRG-035 closure contract

**A. Production model mapping**

The production mapping MUST identify each stage explicitly:

```text
OpenCode-visible model
  -> model.api.id
  -> AI SDK model
  -> wire-body model ID
```

The validation model `openai/gpt-5.6-sol` MUST NOT be promoted automatically to
the production model.

**B. Authenticated request acceptance**

An actual authenticated request using OpenCode 1.18.31 MUST be accepted across
the complete path:

```text
OpenCode 1.18.31
  -> Cloudflare AI Gateway
  -> Deno Deploy relay
  -> Codex
```

The evidence MUST identify acceptance at each boundary without recording secret
values or request payloads.

**C. Request protocol ownership**

Request handling MUST be resolved to exactly one of the following:

```text
DIRECT FORWARDING
```

or:

```text
RELAY-ONLY MAPPING:
<exact request mapping>
```

Plugin-side body rewriting remains prohibited. Any relay-only mapping MUST state
the exact fields, headers, and transformations owned by the relay.

**D. Response protocol ownership**

For non-streaming responses, handling MUST be resolved to exactly one of the
following:

```text
DIRECT FORWARDING
```

or:

```text
RELAY-ONLY MAPPING:
<exact response mapping>
```

Any relay-only mapping MUST state the exact response fields, headers, and
transformations owned by the relay.

**E. Streaming and SSE**

The characterization MUST establish all of the following for the selected
architecture:

- Live streaming acceptance.
- SSE event shape.
- Stream termination behavior.
- Stream error behavior.
- Required abort behavior.

**F. Initial tools scope**

The initial scope MUST be resolved to exactly one of:

```text
TOOLS INCLUDED
```

or:

```text
TOOLS EXCLUDED
```

If tools are included, characterization MUST cover the tool call, tool result,
continuation request, and continuation response.

### 11.2 SRG-035 failure policy

If characterization requires a change to any of the following, SRG-035 MUST
remain unresolved and the result MUST be recorded as:

```text
DESIGN RE-APPROVAL REQUIRED
```

```text
provider identity
credential architecture
OpenCode public extension point
component boundary
security model
protocol owner
SDK family or major version
```

The result MAY be sent to `writing-plans` or implementation validation without
design re-approval only when it is limited to the same architecture, such as an
exact wire field, fixture detail, helper split, or implementation-specific edge
case. This exception does not close SRG-035 until the closure contract above is
complete.

These are not SRG-022 defects. SRG-022 only establishes the provider identity,
credential ownership, transport route, header boundaries, and fail-closed
policy needed before SRG-035 can run.

### 11.3 Characterization attempt status

The first characterization attempt stopped before an authenticated request was
sent. The process-local OpenCode configuration probe used malformed JSON, and
OpenCode expanded `{env:...}` references before reporting the parse error. The
probe was therefore treated as a credential-safety failure rather than runtime
protocol evidence. This historical failure does not supersede the later
transport validation recorded in §9 and §11.4.

The current evidence status is:

```text
transport seam: VALIDATED
authenticated upstream request: OBSERVED
upstream status: HTTP 200
production model evidence: NONE
request/response protocol evidence: NONE
streaming/SSE evidence: NONE
tools evidence: NONE
```

Before any additional authenticated protocol probe, all of the following are
mandatory preconditions:

```text
Gateway and relay credential safety: CONFIRM
malformed JSON probe: MUST NOT be reused
secret values in logs or documents: MUST NOT be recorded
```

Until these preconditions are confirmed for a future probe, no additional
authenticated protocol characterization may be sent. SRG-035 remains
unresolved and `writing-plans` remains blocked.

### 11.4 Integrated characterization result (2026-09-20)

The credential-safety preconditions were re-confirmed before the integrated
attempt. OpenCode `1.18.31` was present, OpenAI OAuth was configured, the
available OpenAI model catalog contained `gpt-5.6-luna`, `gpt-5.6-sol`, and
`gpt-5.6-terra`, and the Gateway and relay origins were reachable. The Gateway
and relay credentials were confirmed as rotated after the previous safety
incident. No credential values, account identifiers, or request payloads were
recorded.

A process-local plugin implementing the selected public `provider.models` hook
was loaded by OpenCode, and its hook callback executed. The hook set the target
model's `model.api.url` to the Cloudflare AI Gateway Custom Provider endpoint.
The override was effective: the request reached Cloudflare AI Gateway, passed
Gateway authentication, reached relay `POST /v1/responses`, passed relay
authentication, and emitted an upstream request that received HTTP `200`.
No direct `chatgpt.com` rewrite occurred.

The validated transport seam is:

```text
provider.models hook
  -> model.api.url
  -> Cloudflare AI Gateway Custom Provider
  -> Cloudflare Custom Provider base_url
  -> https://cf-ai-gw-relay.yohi.deno.net/v1
  -> AI SDK appends /responses
  -> relay POST /v1/responses
  -> Codex upstream
```

The integrated result supports `SRG-022: RESOLVED CANDIDATE — PENDING REVIEW`.
It does not resolve SRG-035. Production model mapping, request protocol,
response protocol, streaming/SSE behavior, and tools scope remain deferred.
Direct fallback remains prohibited.

Remaining SRG-022 action:

```text
SRG-022:
  Review the provider.models -> model.api.url transport architecture and the
  evidence above. The reviewer owns the final RESOLVED decision.

SRG-035:
  WAITING ON SRG-022 RE-REVIEW
```

## 12. Scope and Definition of Done

This revision changes only this design document. It does not change production
source, tests, dependencies, package metadata, lockfiles, CI, deployment,
Cloudflare settings, or writing-plans artifacts.

SRG-022 is a resolved candidate pending reviewer confirmation. The selected
architecture is defined by all of the following:

- Provider identity is `openai`.
- The public OpenCode extension point is the `provider.models` hook on the target OpenCode 1.18.31 runtime.
- The selected routing owner is the `provider.models` hook, through the target model's `model.api.url`.
- `model.api.url` is `https://gateway.ai.cloudflare.com/v1/<account>/<gateway>/custom-<slug>`.
- `provider.openai.options.baseURL` is not the effective ChatGPT OAuth route owner and is rejected as a current routing mechanism after target-runtime validation.
- The AI SDK-owned `/responses` suffix and the Custom Provider `base_url` together produce relay `POST /v1/responses`.
- The plugin configures `cf-aig-authorization` and `x-chatgpt-relay-authorization`, plus the existing Gateway control headers, without taking OAuth ownership.
- Global `fetch` interception is not a selected transport owner and cannot run as a parallel routing path.
- ChatGPT OAuth is acquired, stored, refreshed, and injected by OpenCode.
- The plugin does not read, copy, persist, or refresh OAuth credentials, and no private OpenCode credential API is required.
- PAT architecture is removed from the current design and marked superseded only in history.
- `cf-aig-authorization` has explicit Gateway ownership and termination.
- `x-chatgpt-relay-authorization` is the sole relay auth header.
- Relay transport is `POST /v1/responses`.
- Relay request/response/SSE protocol adaptation is not selected before SRG-035 proves it is required.
- Direct fallback and credential extraction are prohibited.
- Managed residency initial scope is `NOT SUPPORTED IN INITIAL SCOPE`.
- The validation model is explicitly non-production.
- Gateway and relay authentication were validated without recording secret values.
- SRG-035 is waiting on SRG-022 re-review and remains unresolved pending the
  complete §11 closure contract and target-runtime characterization.
- `writing-plans` has not started and remains blocked.

Any future implementation plan and its tests MUST preserve the extension-point,
route-construction, header-ownership, error-boundary, fail-closed, streaming,
and no-retry/no-cache/no-payload-persistence constraints in this document. The
plan may choose only the concrete source patch that implements the
`provider.models` -> `model.api.url` route and plugin control-header
configuration; it may not choose a different routing mechanism.

Before `writing-plans` may start, the design document and implementation plan
MUST be checked for zero divergence in specification, terminology,
types/interfaces, error handling, test strategy, and non-functional requirements.
Any unresolved divergence keeps `writing-plans` blocked.
