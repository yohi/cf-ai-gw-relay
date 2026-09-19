# OpenCode ChatGPT Codex Relay Provider Design

## Status

This revision records the architecture validated by the target-runtime spike.
It is a design-document change only. It does not authorize source changes,
tests, dependency changes, deployment changes, Cloudflare configuration
changes, or implementation planning.

Current gate state:

```text
SRG-022: READY FOR RE-REVIEW
SRG-035: WAITING ON SRG-022
writing-plans: BLOCKED
production implementation: NOT STARTED
```

The required order remains:

```text
1. SRG-022 design update
2. SRG-022 re-review
3. SRG-022 = RESOLVED
4. SRG-035 = ACTIVE
5. protocol characterization
6. SRG-035 = RESOLVED
7. writing-plans
```

## 1. Architecture Decision

OpenCode uses its built-in `openai` provider and its built-in ChatGPT OAuth
credential. The relay is reached by configuring the OpenAI transport base URL;
it is not represented as a second OpenCode provider identity.

```text
OpenCode 1.18.31
  provider: openai
  built-in ChatGPT OAuth
      -> Cloudflare AI Gateway Custom Provider
      -> Deno Deploy relay
      -> Codex upstream
```

The transport contract is:

```text
OpenCode provider: openai
OpenCode options.baseURL: Cloudflare AI Gateway Custom Provider endpoint
Custom Provider base_url: https://cf-ai-gw-relay.yohi.deno.net/v1
Relay route: POST /v1/responses
```

The Gateway endpoint used by `options.baseURL` is configured through the
existing repository configuration and secret-injection mechanism. This design
does not invent a new secret-management subsystem or record secret values.

The relay remains fail-closed. There is no direct Codex or ChatGPT fallback,
retry loop, payload persistence, or silent credential substitution.

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
| Header producer | OpenCode configuration / secret injection boundary |
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
| Header producer | OpenCode configuration / secret injection boundary |
| Header validator | Deno relay |
| Header consumer | Deno relay |
| Upstream behavior | The header terminates at the relay and must not reach Codex |
| Secret value | Never recorded in this document |

`x-relay-authorization` is non-canonical. It is sanitized or removed as an
untrusted header and is never an authentication alias.

## 5. Header Boundary

The following ownership and forwarding rules are normative for the initial
architecture:

| Header | Producer | Consumer | Boundary behavior |
| --- | --- | --- | --- |
| `Authorization` | OpenCode | Codex/OpenAI upstream | OpenCode-owned credential; preserve as opaque transport data; no intermediary substitutes it |
| `ChatGPT-Account-Id` | OpenCode | Codex/OpenAI upstream | OpenCode-owned account routing metadata; preserve when supplied by OpenCode |
| `cf-aig-authorization` | OpenCode config/secret injection | Cloudflare AI Gateway | Gateway credential only; stop at the Gateway boundary; never treat as OpenAI credential |
| `x-chatgpt-relay-authorization` | OpenCode config/secret injection | Deno relay | Relay credential only; validate at relay; never forward to Codex |
| `cf-aig-metadata` | Existing OpenCode/Gateway configuration | Cloudflare AI Gateway | Preserve existing behavior when configured; not an authentication header and not a required OAuth substitute |
| `X-OpenAI-Fedramp` | OpenCode, only when its applicability is established | Codex/OpenAI upstream | Do not infer or add it for an unverified account mode |
| `x-openai-internal-codex-residency` | No producer in the initial scope | None in the initial scope | Do not add it by inference |
| `x-relay-authorization` | Untrusted caller input | None | Sanitize/remove; never accept for authentication |

The relay removes Gateway-only, relay-only, hop-by-hop, and forwarding headers
before the upstream request. It preserves only the OpenAI authorization and
routing metadata required by the selected OpenCode request contract.

## 6. Transport Architecture

### 6.1 OpenCode to Gateway

OpenCode uses `provider: openai` and sends the Responses request through the
Cloudflare AI Gateway Custom Provider endpoint configured as `options.baseURL`.
The Gateway Custom Provider's configured origin is:

```text
https://cf-ai-gw-relay.yohi.deno.net/v1
```

The custom-provider route must preserve the request method, request body,
authorization, account routing metadata, response body, and abort signal. The
Gateway auth header and relay auth header remain control credentials for their
own boundaries.

### 6.2 Gateway to relay

The relay route is exactly:

```text
POST /v1/responses
```

The relay forwards the authenticated request to the fixed Codex upstream path
for the current runtime contract. Request/response protocol details that were
not established by the transport spike remain under SRG-035.

### 6.3 Transport invariants

- Fail closed on configuration, authentication, routing, or transport errors.
- Do not fall back directly to ChatGPT or Codex when Gateway or relay delivery fails.
- Do not extract, decode, copy into storage, or replace the OpenCode OAuth credential.
- Do not add retry loops, caching, or payload persistence.
- Do not add a generic `/upstream/*` contract.
- Do not perform plugin-side body rewriting to choose a production model or protocol.

## 7. Error Ownership

Errors are owned by the boundary that can classify them without guessing:

| Error | Owning boundary |
| --- | --- |
| `UNKNOWN_MODEL` or model resolution failure | OpenCode model-resolution boundary |
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

provider:
openai

validation model:
openai/gpt-5.6-sol
transport validation model only; not the final production model decision

ChatGPT OAuth baseline:
PASS

Gateway:
reached

Gateway authentication:
PASS

direct Codex rewrite:
NO

relay:
reached

relay route:
POST /v1/responses

relay authentication:
PASS

upstream dispatch:
YES

upstream response:
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

SRG-035 has not started. It remains the owner of the following three deferred
decisions:

1. Final production Codex model, including any `model.api.id` and wire model ID.
2. Authenticated request/response protocol characterization after upstream dispatch.
3. Live response streaming, SSE, and tools characterization.

These are not SRG-022 defects. SRG-022 only establishes the provider identity,
credential ownership, transport route, header boundaries, and fail-closed
policy needed before SRG-035 can run.

## 12. Scope and Definition of Done

This revision changes only this design document. It does not change production
source, tests, dependencies, package metadata, lockfiles, CI, deployment,
Cloudflare settings, or writing-plans artifacts.

SRG-022 is ready for re-review when all of the following remain true:

- Provider identity is `openai`.
- ChatGPT OAuth is acquired, stored, refreshed, and injected by OpenCode.
- PAT architecture is removed from the current design and marked superseded only in history.
- `cf-aig-authorization` has explicit Gateway ownership and termination.
- `x-chatgpt-relay-authorization` is the sole relay auth header.
- Relay transport is `POST /v1/responses`.
- Direct fallback and credential extraction are prohibited.
- Managed residency initial scope is `NOT SUPPORTED IN INITIAL SCOPE`.
- The validation model is explicitly non-production.
- Stale credential, Gateway-route, Gateway-auth, relay-route, and relay-auth blockers are not current design blockers.
- SRG-035 remains waiting on SRG-022.
- `writing-plans` has not started and remains blocked.
