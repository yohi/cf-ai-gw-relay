# OpenCode ChatGPT Codex Relay Provider Design

## Status

This revision records the architecture validated by the target-runtime spike and
the integrated SRG-035 protocol characterization. It is a design-document change
only. The previous revision assumed an unavailable external credential
lifecycle. This revision removes that lifecycle and closes the protected
acceptance boundary around the environments that actually exist. It does not
authorize source changes, tests, dependency changes, deployment changes,
Cloudflare configuration changes, or production implementation.

Current gate state for the fresh Superpowers Review Gate re-review of commit
`abf7365`:

```text
SRG-022: RESOLVED
SRG-035: RESOLVED
writing-plans: COMPLETED; implementation plan synchronized in this revision
review gate: READY
RG-001: RESOLVED
RG-002: RESOLVED
RG-003: RESOLVED
RG-004: RESOLVED
pre-implementation gate: READY
design-to-plan consistency review: READY
production implementation: MAY START
```

Fresh Superpowers Review Gate for `474f9e3`: READY

The completed and required order is:

```text
1. SRG-022 design update
2. SRG-022 re-review
3. SRG-022 reviewer decision
4. SRG-035 protocol characterization
5. SRG-035 = RESOLVED
6. writing-plans
7. RG-001 architecture assumption failure identified
8. credential architecture re-designed from authoritative evidence
9. RG-001 resolved with OpenCode-owned OAuth as the fixed architecture
10. implementation plan synchronization
11. fresh review identifies RG-003 as REGRESSED
12. RG-003 correction and design-to-plan consistency check
13. fresh Superpowers Review Gate for `474f9e3` marks both documents READY
14. production implementation only after the fresh review marks the plan READY
15. fresh Superpowers Review Gate for `474f9e3` confirmed READY; implementation MAY START
```

The post-characterization gate review of commit `0851e88` confirmed that SRG-035
satisfies the pre-implementation closure contract. The fresh Superpowers Review
Gate for `474f9e3` has marked both documents READY.

The post-characterization gate review of commit `0851e88` confirmed that SRG-035
satisfies the pre-implementation closure contract. It does not approve the
current plugin source as already migrated, authorize production readiness, or
replace the implementation validation required by the later writing plan. The
current source remains the legacy fetch-interposer implementation described
below.

## 1. Architecture Decision

OpenCode uses its built-in `openai` provider and its built-in ChatGPT OAuth
credential. The selected routing owner is the public `provider.models` hook,
which sets the target model's `model.api.url` to the Cloudflare AI Gateway
Custom Provider endpoint. The relay is not represented as a second OpenCode
provider identity.

This revision defines the target architecture for OpenCode 1.18.31. It does not
claim that the current repository source has already migrated to this
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
configuration and secret-injection mechanism. This design does not invent a new
secret-management subsystem or record secret values.

The relay remains fail-closed. There is no direct Codex or ChatGPT fallback,
retry loop, payload persistence, or silent credential substitution.

### 1.2 REJECTED / SUPERSEDED: Legacy fetch interposer boundary

The current source uses `installFetchInterposer()` together with
`buildGatewayUrl()` and `request-rewrite.ts` to rewrite a matching global
`fetch` request. Its current URL shape ends in `/v1/responses`. Those symbols
are legacy implementation details and are not the selected transport owner.

The selected architecture MUST NOT retain global fetch interception as a second
routing owner for the OpenAI request. A later implementation plan may remove the
interposer, disable it, or reduce it to a non-routing responsibility, but it
MUST NOT run it in parallel with the `provider.models` transport path.

## 2. Provider Identity and Model Boundary

The OpenCode provider identity is exactly:

```text
openai
```

The project name and relay hostname may contain `cf-ai-gw-relay`, but that name
is not an independent OpenCode provider identity. The current design does not
define a second provider/model namespace.

OpenCode's normal `openai/<model>` selection remains the model-resolution
boundary. The integrated characterization fixes the initial production mapping
to one model:

```text
OpenCode-visible model: openai/gpt-5.6-luna
model.api.id: gpt-5.6-luna
AI SDK model identifier: gpt-5.6-luna via @ai-sdk/openai 3.0.88
wire-body model: gpt-5.6-luna
```

The validation model `openai/gpt-5.6-sol` remains transport-validation evidence
only. It is not the initial production model. No second production model, alias,
or namespace is retained by this revision.

## 3. Credential Architecture

### 3.1 OpenAI / Codex credential

ChatGPT / Codex authentication is owned by OpenCode's built-in `openai`
provider:

| Responsibility                      | Owner or behavior                                                                                  |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| Credential acquisition              | OpenCode built-in ChatGPT OAuth                                                                    |
| Credential owner                    | OpenCode                                                                                           |
| Credential storage and format       | OpenCode native auth store owned by the user-controlled OpenCode runtime; no repository or CI copy |
| Credential refresh                  | OpenCode                                                                                           |
| `Authorization` injection           | OpenCode                                                                                           |
| ChatGPT account routing metadata    | OpenCode                                                                                           |
| Plugin, Gateway, and relay behavior | Treat the request credential as opaque transport data                                              |

The plugin, Cloudflare component, and relay MUST NOT acquire, inspect for
ownership, extract, persist, refresh, or substitute the OpenAI OAuth credential.
They may forward the opaque HTTP authorization header required by the request;
forwarding is not credential extraction or credential ownership.

No private OpenCode credential API is required.

### 3.2 PAT architecture is not current

The current architecture has no Personal Access Token requirement. The following
are removed from the current design and MUST NOT be implemented:

- `CODEX_ACCESS_TOKEN` as a production requirement.
- Codex Personal Access Token as the selected credential.
- Business or Enterprise PAT acquisition, storage, rotation, or revocation.
- PAT `whoami` hydration as a required production flow.
- PAT permission gates or real-PAT pre-implementation blockers.
- OAuth-token extraction fallback or conversion outside OpenCode.

### 3.3 CI and protected acceptance credential boundary

The authoritative environment evidence available for this revision is:

```text
Repository owner: yohi (GitHub user, not an organization)
Repository-managed runners: 0
CI runner: ubuntu-latest
Protected acceptance runner: ubuntu-latest
Protected acceptance OAuth state: not configured
```

The repository workflows confirm that `.github/workflows/ci.yml` and
`.github/workflows/acceptance.yml` use GitHub-hosted `ubuntu-latest` jobs. The
repository runner API reports zero managed runners. No external OAuth credential
service or CI credential persistence resource is configured, so none may remain
an implicit future dependency.

The OpenCode 1.18.31 source and official documentation establish the supported
runtime credential mechanism:

- The versioned OpenCode auth service stores OAuth records in its native
  `auth.json` under the XDG data directory and owns the OAuth record schema:
  [`packages/opencode/src/auth/index.ts`](https://raw.githubusercontent.com/anomalyco/opencode/v1.18.31/packages/opencode/src/auth/index.ts).
- The versioned OpenAI integration provides both browser OAuth and a ChatGPT
  Pro/Plus headless device-code method, and its refresh path writes the
  refreshed credential through OpenCode's auth service:
  [`packages/core/src/plugin/provider/openai.ts`](https://raw.githubusercontent.com/anomalyco/opencode/v1.18.31/packages/core/src/plugin/provider/openai.ts).
- The official CLI documents `opencode auth login`, `opencode auth list`, and
  the native credential file, while `opencode run` is the supported headless
  execution command:
  [OpenCode CLI documentation](https://opencode.ai/docs/cli/).

The versioned source also contains `OPENCODE_AUTH_CONTENT`, but it is not part
of the public CLI credential contract. Source presence alone does not establish
that injecting OAuth JSON through a GitHub Actions environment is supported or
acceptable under this project's security requirements. It is therefore not an
accepted credential injection seam.

The single selected architecture is:

| Concern                                         | Fixed decision                                                                                                                                                                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Credential source                               | OpenCode 1.18.31 built-in `openai` provider using its official ChatGPT Pro/Plus OAuth login; browser or headless device authorization is performed by the user/operator in the OpenCode runtime                                             |
| Authentication architecture                     | OpenCode owns OAuth acquisition, interpretation, refresh, expiry, account metadata, and request authentication; the plugin remains an opaque routing/control-header layer                                                                   |
| Credential injection mechanism                  | None in this project or in GitHub Actions; OpenCode injects `Authorization` and `ChatGPT-Account-Id` inside its built-in provider at runtime                                                                                                |
| Persistent state owner                          | The user-controlled OpenCode runtime and its native `$XDG_DATA_HOME/opencode/auth.json` store, defaulting to `$HOME/.local/share/opencode/auth.json`; no repository, GitHub Environment, artifact, cache, or CI store owns OAuth state      |
| Refresh-state owner                             | OpenCode's built-in provider writes refreshed state back to the same local native auth store; the plugin, relay, Gateway, and CI do not write back or persist it                                                                            |
| Secret handling                                 | OAuth state MUST NOT enter GitHub Secrets, workflow environment, command arguments, generated files, artifacts, caches, logs, or summaries. Existing Gateway and relay secrets remain separate protected-acceptance inputs                  |
| Security boundary                               | OAuth remains inside the user-controlled OpenCode runtime. The plugin, Gateway, and relay may transport the resulting request authorization opaquely but MUST NOT extract, decode, store, refresh, or substitute it                         |
| CI/runtime owner                                | GitHub-hosted ephemeral runners own deterministic tests and non-OAuth Gateway/relay acceptance. The user-controlled OpenCode runtime owns live ChatGPT OAuth behavior                                                                       |
| Rotation, revocation, and reauthorization owner | The user/operator of the OpenCode runtime, using the official OpenCode auth login/logout flow; no repository or CI lifecycle owner is introduced                                                                                            |
| Acceptance execution location                   | Required protected acceptance runs on GitHub-hosted `ubuntu-latest` and covers relay/Gateway behavior that uses only its existing non-OAuth secrets. Live OAuth acceptance is not a CI gate and is not part of this implementation plan     |
| Failure policy                                  | Missing or expired local OAuth, unsupported headless use, or any routing/configuration failure fails closed. No PAT, OAuth-token extraction, GitHub secret copy, direct-fetch fallback, retry, or silent credential substitution is allowed |

OpenCode `1.18.31` writes refreshed OAuth state returned by its built-in refresh
flow back to the user's native auth store. That local write-back is the only
refresh-state persistence required by this architecture. The repository has no
authority to copy, rotate, or destroy that state.

Protected acceptance uses only non-OAuth inputs already owned by the
`protected-acceptance` GitHub Environment, including Gateway and relay controls.
The workflow MUST run on `ubuntu-latest`, MUST NOT install or invoke a ChatGPT
OAuth login, and MUST NOT require an OpenCode auth store. It may verify the
Gateway/relay boundary and deterministic relay behavior, but it MUST NOT claim
to prove a live OpenCode OAuth request.

The live OAuth path is an OpenCode runtime concern. If the local native store is
missing, unreadable, expired, or rejected by OpenCode, the runtime fails closed
and the operator must use the official OpenCode login/logout flow. The plugin,
Gateway, relay, CI workflow, and acceptance scripts do not repair or replace
that state.

GitHub Secrets are permitted only for the existing non-OAuth Gateway, relay, and
provider acceptance controls. OAuth state in GitHub Secrets, workflow
environment variables, command arguments, generated files, artifacts, caches,
logs, or summaries is prohibited. A future request to make live OAuth acceptance
a CI gate requires `DESIGN RE-APPROVAL REQUIRED` and a new security review; it
cannot be solved by selecting a private environment override or by extracting
OAuth tokens.

The previous external credential attestation requirement is deleted. It cannot
be used as evidence or as a prerequisite for implementation. The selected
OpenCode-owned OAuth architecture is the current credential architecture, and
`RG-001` is `RESOLVED`. It must not be reopened or replaced with a runner,
broker, CI auth store, PAT, or OAuth injection seam.

The current pre-implementation gate is `READY`: the plan uses the verified
The current pre-implementation gate is `READY`: the plan uses the verified
implementation branch for the protected workflow, keeps live `BoundaryProbe`
execution in that protected workflow, and makes its Task 6 file ownership and
deterministic GREEN sequence unconditional. No Task 1 through Task 8 may start
until a fresh Superpowers Review Gate marks both documents `READY`; the fresh
Superpowers Review Gate for `474f9e3` has done so.

Fresh review result:

```text
review gate: READY
RG-001: RESOLVED
RG-002: RESOLVED
RG-003: RESOLVED
RG-004: RESOLVED
pre-implementation gate: READY
production implementation: MAY START
```

## 4. Cloudflare and Relay Credentials

Cloudflare authentication and OpenAI authentication are separate credentials.
Neither Gateway authentication nor relay authentication is an OpenAI OAuth
credential.

### 4.1 Cloudflare Gateway authentication

`cf-aig-authorization` is the Cloudflare AI Gateway credential:

| Responsibility                 | Owner or behavior                                                             |
| ------------------------------ | ----------------------------------------------------------------------------- |
| Credential owner               | Cloudflare AI Gateway account/operator                                        |
| Configuration owner            | Deployment/operator configuration using the existing repository secret path   |
| Existing configuration input   | `RELAY_CF_AIG_TOKEN` or its existing equivalent                               |
| Existing precedence            | `RELAY_CF_AIG_TOKEN` -> plugin `apiKey`                                       |
| Header producer                | Plugin control-header configuration using the resolved existing configuration |
| Header consumer                | Cloudflare AI Gateway                                                         |
| Header validator               | Cloudflare AI Gateway                                                         |
| OpenAI credential relationship | Must not be treated as an OpenAI credential                                   |
| Secret value                   | Never recorded in this document                                               |

The existing repository configuration precedence and injection mechanism remain
the source of truth. Environment/configuration overrides must not be changed as
part of this design update.

### 4.2 Relay authentication

The canonical relay credential is `RELAY_SECRET` and the canonical header is:

```text
x-chatgpt-relay-authorization: Bearer <relay secret>
```

| Responsibility               | Owner or behavior                                                             |
| ---------------------------- | ----------------------------------------------------------------------------- |
| Credential owner             | Relay deployment/operator                                                     |
| Configuration owner          | Existing relay deployment secret configuration                                |
| Existing configuration input | `RELAY_SECRET` or its existing equivalent                                     |
| Existing precedence          | `RELAY_SECRET` -> plugin `relayToken`                                         |
| Header producer              | Plugin control-header configuration using the resolved existing configuration |
| Header validator             | Deno relay                                                                    |
| Header consumer              | Deno relay                                                                    |
| Upstream behavior            | The header terminates at the relay and must not reach Codex                   |
| Secret value                 | Never recorded in this document                                               |

`x-relay-authorization` is non-canonical. It is sanitized or removed as an
untrusted header and is never an authentication alias.

### 4.3 Plugin control-header responsibility

The plugin is the producer of the Gateway and relay control headers in the
selected architecture. It MUST configure the following headers without replacing
OpenCode-owned `Authorization` or `ChatGPT-Account-Id`:

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
Gateway control behavior. No global fetch interposer may inject a competing set
of routing or control headers for the same OpenAI request. Header configuration
is separate from the `provider.models` route owner.

`cf-aig-collect-log-payload` preserves the existing Gateway observability
configuration and may expose request payloads to the Gateway observability
boundary. The implementation plan MUST preserve its explicit configuration
control and document the applicable retention and access boundary. This design
does not change the existing default or claim that Gateway observability is
payload-free.

## 5. Header Boundary

The following ownership and forwarding rules are normative for the initial
architecture:

| Header                              | Producer                                                                 | Consumer                  | Boundary behavior                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `Authorization`                     | OpenCode                                                                 | Codex/OpenAI upstream     | OpenCode-owned credential; preserve as opaque transport data; no intermediary substitutes it                 |
| `ChatGPT-Account-Id`                | OpenCode                                                                 | Codex/OpenAI upstream     | OpenCode-owned account routing metadata; preserve when supplied by OpenCode                                  |
| `cf-aig-authorization`              | Plugin control-header configuration                                      | Cloudflare AI Gateway     | Gateway credential only; stop at the Gateway boundary; never treat as OpenAI credential                      |
| `x-chatgpt-relay-authorization`     | Plugin control-header configuration                                      | Deno relay                | Relay credential only; validate at relay; never forward to Codex                                             |
| `cf-aig-metadata`                   | Plugin control-header configuration using existing Gateway configuration | Cloudflare AI Gateway     | Preserve existing behavior when configured; not an authentication header and not a required OAuth substitute |
| `X-OpenAI-Fedramp`                  | OpenCode, only when its applicability is established                     | Codex/OpenAI upstream     | Do not infer or add it for an unverified account mode                                                        |
| `x-openai-internal-codex-residency` | No producer in the initial scope                                         | None in the initial scope | Do not add it by inference                                                                                   |
| `x-relay-authorization`             | Untrusted caller input                                                   | None                      | Sanitize/remove; never accept for authentication                                                             |

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

Neither `/v1/responses` nor `/responses` may be included in `model.api.url`. The
`provider.models` hook MUST NOT append either suffix itself. The transport seam
establishes the destination and boundary ownership; it does not select request,
response, or SSE transformation behavior. The Gateway auth header and relay auth
header remain control credentials for their own boundaries.

### 6.2 Gateway to relay

The relay route is exactly:

```text
POST /v1/responses
```

The authenticated request continues from the relay to the Codex upstream
boundary. SRG-035 characterizes this boundary as direct forwarding. The relay
does not parse, normalize, or reconstruct the request body or response body for
the selected initial scope.

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

The plugin does not read OAuth access tokens or refresh tokens, copy or persist
credentials, or implement OAuth refresh.

**Cloudflare AI Gateway**

```text
Gateway authentication
Custom Provider routing
```

**Relay**

```text
relay authentication
/v1/responses ownership
direct request/response/SSE forwarding
fail closed
```

### 6.4 Transport invariants

- Fail closed on configuration, authentication, routing, or transport errors.
- Do not fall back directly to ChatGPT or Codex when Gateway or relay delivery
  fails.
- Do not extract, decode, copy into storage, or replace the OpenCode OAuth
  credential.
- Do not add retry loops, caching, or payload persistence.
- Do not add a generic `/upstream/*` contract.
- Do not perform plugin-side body rewriting to choose a production model or
  protocol.
- Treat the public `provider.models` hook as the selected plugin-side
  transport-routing owner.
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

| Error                                                                         | Owning boundary                                                                              |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `UNKNOWN_MODEL` or model resolution failure                                   | OpenCode model-resolution boundary                                                           |
| Plugin configuration, route construction, or control-header injection failure | OpenCode plugin `provider.models` / control-header configuration boundary                    |
| Cloudflare authentication failure                                             | Cloudflare AI Gateway boundary                                                               |
| Relay authentication failure                                                  | Deno relay boundary                                                                          |
| OpenAI/Codex OAuth authentication failure                                     | Codex/OpenAI upstream authentication boundary                                                |
| Request protocol incompatibility after authenticated dispatch                 | Relay protocol boundary; explicit unsupported boundary if direct forwarding cannot accept it |
| Response protocol incompatibility                                             | Relay response protocol boundary                                                             |
| SSE incompatibility, stream error, or cancellation failure                    | Relay streaming boundary                                                                     |
| Tools unsupported outside the initial contract                                | Explicit initial-scope unsupported boundary; no fallback                                     |

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

The integrated characterization found no protocol mapping requirement. An
authenticated dispatch followed by a model, body, response, SSE, or tools
failure remains visible at the owning protocol boundary; it does not trigger a
direct fallback, retry loop, or silent credential substitution.

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
`x-openai-internal-codex-residency`. `X-OpenAI-Fedramp` is likewise emitted only
when its applicability and source are already established.

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
`cf-ai-gw-relay/<upstream-provider>/<model>` were rejected because the validated
path uses the built-in `openai` provider and inherits its ChatGPT OAuth
ownership.

### REJECTED / SUPERSEDED: PAT credential architecture

The proposed PAT acquisition, `CODEX_ACCESS_TOKEN` source, metadata hydration,
PAT storage/lifecycle, and PAT permission gate were superseded by the validated
OpenCode-owned OAuth path. They are not current blockers or implementation
requirements.

### REJECTED / SUPERSEDED / VALIDATION FAILED: Config-hook baseURL routing

The earlier design assigned routing ownership to the public `config` hook by
setting `provider.openai.options.baseURL`. Target-runtime validation showed that
the hook executed, but this `options.baseURL` setting did not change the
built-in ChatGPT OAuth request route. The request used the direct `chatgpt.com`
route instead of reaching the observer.

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
trigger a direct Codex rewrite. The validated configuration uses
`provider=openai` and the Cloudflare AI Gateway Custom Provider path instead.
The relay route is still `POST /v1/responses`.

## 11. SRG-035 Boundary

SRG-035 owns the final production model mapping and the request, response,
streaming, and tools characterization for the selected architecture. The
integrated result below records those decisions as the resolved target-runtime
architecture result.

The transport premise for SRG-035 is now:

```text
provider.models hook
  -> target model.api.url
  -> Cloudflare AI Gateway Custom Provider
  -> relay POST /v1/responses
```

### Evidence and implementation boundary

The closure decision is about the selected target-runtime architecture, not the
current repository implementation. The target-runtime probe loaded a
process-local plugin using the public `provider.models` hook and observed the
callback execution and effective `model.api.url`. The repository's current
`plugin.ts` still starts `installFetchInterposer()`; that source path is not
evidence that the target hook architecture is already implemented.

The exact callback type and header-injection lifecycle belong to the installed
OpenCode 1.18.31 host API and MUST be pinned during implementation validation.
The implementation plan MUST specify all of the following without introducing a
second routing owner:

```text
provider.models callback:
  select only the fixed production model openai/gpt-5.6-luna
  preserve model.api.id = gpt-5.6-luna
  set model.api.url to the Gateway Custom Provider endpoint
  fail closed when the target model or required route configuration is absent

control-header path:
  retain the existing Gateway and relay credential configuration ownership
  preserve OpenCode-owned Authorization and ChatGPT-Account-Id
  define the public hook-compatible injection seam before implementation
```

The characterization does not claim that the current package manifest already
depends on `@ai-sdk/openai`. Version `3.0.88` is the AI SDK version observed in
the target runtime and is recorded here as an architecture input. This revision
does not add a dependency or change package metadata. Existing repository
fixtures, including legacy payload fixtures, are not normative evidence for the
target mapping and were not changed by this revision.

1. Final production Codex model, including `model.api.id` and wire model ID.
2. Authenticated request/response protocol characterization after upstream
   dispatch.
3. Live response streaming, SSE, and tools characterization.

SRG-035 was a `RESOLVED CANDIDATE` while the following closure contract was
being completed. The contract and its evidence are now resolved. Production
implementation is unblocked after the credential-architecture sync and fresh
design-to-plan review below:

### 11.1 SRG-035 closure contract

**A. Production model mapping**

The production mapping MUST identify each stage explicitly:

```text
OpenCode-visible model
  -> model.api.id
  -> AI SDK model
  -> wire-body model ID
```

The integrated mapping is:

```text
OpenCode-visible model: openai/gpt-5.6-luna
model.api.id: gpt-5.6-luna
AI SDK model identifier: gpt-5.6-luna via @ai-sdk/openai 3.0.88
wire-body model ID: gpt-5.6-luna
```

The validation model `openai/gpt-5.6-sol` remains evidence only and is not the
initial production model.

**B. Authenticated request acceptance**

An actual authenticated request using OpenCode 1.18.31 MUST be accepted across
the complete path:

```text
OpenCode 1.18.31
  -> Cloudflare AI Gateway
  -> Deno Deploy relay
  -> Codex
```

The integrated request was accepted at each boundary without recording secret
values or request payloads:

```text
Gateway reached: YES
Gateway auth: PASS
Relay reached: YES
Relay path: POST /v1/responses
Relay auth: PASS
Upstream request emitted: YES
Upstream status: HTTP 200
OpenCode usable result: YES
```

**C. Request protocol ownership**

Request handling is resolved to:

```text
REQUEST_PROTOCOL = DIRECT_FORWARDING
```

The observed OpenCode request was `POST` with `Content-Type: application/json`
and an OpenAI Responses body containing `model`, `input`, `instructions`,
`stream`, `tools`, `tool_choice`, `include`, `reasoning`, `store`, `text`, and
`prompt_cache_key`. The selected production mapping sends `model=gpt-5.6-luna`;
`input` is a Responses input array, with `function_call`/`function_call_output`
items on tool continuation. OpenCode's public run surface emitted `stream=true`
and `tool_choice=auto`.

OpenCode-owned `Authorization` and `ChatGPT-Account-Id` remain opaque upstream
headers. Gateway control headers authenticate the Gateway, and
`x-chatgpt-relay-authorization` authenticates the relay. The relay removes
Gateway-only, relay-only, hop-by-hop, and forwarding headers before the fixed
upstream while preserving the upstream authorization and account-routing
headers. No body field or tool field is rewritten, normalized, or dropped by the
relay. No unsupported field was observed.

Plugin-side body rewriting remains prohibited. Any relay-only mapping MUST state
the exact fields, headers, and transformations owned by the relay.

**D. Response protocol ownership**

Response handling is resolved to:

```text
RESPONSE_PROTOCOL = DIRECT_FORWARDING
```

The relay passes upstream status, remaining headers, and body through without
semantic transformation. The live success response reached OpenCode as HTTP
`200` and produced a usable non-empty result with non-zero usage. The observed
Responses stream contained `response.created`, `response.in_progress`,
`response.output_item.added/done`, `response.content_part.added/done`,
`response.output_text.delta/done`, and `response.completed`. The response
boundary exposed no error event in the successful probes. Request and response
IDs remain pass-through metadata and no ID values are recorded here.

The public OpenCode `run` surface generated `stream=true` for the authenticated
requests used here. A separate non-stream fixture was not emitted without
rewriting the body or changing the selected transport, both of which are
prohibited. The non-stream response owner is nevertheless fixed by the same
relay contract: upstream Responses JSON, status, and headers are directly
forwarded; exact fixture values remain implementation validation detail.

**E. Streaming and SSE**

The streaming owner is resolved to:

```text
STREAMING_PROTOCOL = DIRECT_FORWARDING
```

The characterization established:

- Live streaming acceptance.
- SSE event shape.
- Stream termination behavior.
- Stream error behavior.
- Required abort behavior: the relay's request signal aborts the upstream fetch;
  downstream cancellation cancels the upstream response body and aborts the
  upstream request; no retry or fallback occurs.

The Gateway response at the OpenCode boundary had an absent `content-type`
header while carrying the live SSE body. This is preserved as an observed
upstream/header detail; the relay does not synthesize or map it.

**F. Initial tools scope**

The initial scope is resolved to:

```text
TOOLS = INCLUDED
```

The live probe emitted a Responses `function_call` item for `read`, submitted a
`function_call_output` item in the continuation request, and received a
successful continuation response ending in `response.completed`. Tool arguments
and results are opaque request data; the relay forwards them without body
mapping. Tool calls are therefore part of the initial contract, not an
unsupported path.

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

The result MAY proceed to implementation validation without design re-approval
only when it is limited to the same architecture, such as an exact wire field,
fixture detail, helper split, or implementation-specific edge case. The
integrated result satisfies the SRG-035 closure contract, and production
implementation is no longer blocked once the design-to-plan consistency check
in §12 passes.

These are not SRG-022 defects. SRG-022 established the provider identity,
credential ownership, transport route, header boundaries, and fail-closed policy
needed before this characterization could run.

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
authenticated upstream request: ACCEPTED
upstream status: HTTP 200
production model evidence: OPENAI/GPT-5.6-LUNA
request protocol: DIRECT_FORWARDING
response protocol: DIRECT_FORWARDING
streaming/SSE protocol: DIRECT_FORWARDING
tools: INCLUDED
```

### 11.4 Integrated characterization result (2026-09-20)

The credential-safety preconditions were re-confirmed before the integrated
attempt. OpenCode `1.18.31` was present, OpenAI OAuth was active, the available
OpenAI model catalog contained `gpt-5.6-luna`, `gpt-5.6-sol`, and
`gpt-5.6-terra`, and the Gateway and relay origins were reachable. Credential
presence was checked without printing values. No credential values, account
identifiers, request payloads, or response contents were recorded.

A process-local plugin implementing the selected public `provider.models` hook
was loaded by OpenCode, and its callback executed. The hook set the target
model's `model.api.url` to the Cloudflare AI Gateway Custom Provider endpoint.
The unique production mapping was:

```text
OpenCode-visible model: openai/gpt-5.6-luna
model.api.id: gpt-5.6-luna
AI SDK model identifier: gpt-5.6-luna via @ai-sdk/openai 3.0.88
wire-body model: gpt-5.6-luna
```

The override was effective: the request reached Cloudflare AI Gateway, passed
Gateway authentication, reached relay `POST /v1/responses`, passed relay
authentication, and emitted an upstream request that received HTTP `200`.
OpenCode received a non-empty result with non-zero usage. No direct
`chatgpt.com` rewrite occurred.

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

The request characterization is:

```text
REQUEST_PROTOCOL = DIRECT_FORWARDING
HTTP method = POST
Gateway request suffix = /responses
Relay path = POST /v1/responses
Request content-type = application/json
Request body = OpenAI Responses input; model, input, instructions, stream,
  tools, tool_choice, include, reasoning, store, text, prompt_cache_key
stream = true on the public OpenCode run path
tool_choice = auto
body rewrite = none
```

The response characterization is:

```text
RESPONSE_PROTOCOL = DIRECT_FORWARDING
HTTP status propagation = 200 observed
success body = OpenAI Responses stream consumed by @ai-sdk/openai
usage = non-zero OpenCode usage observed
request IDs = pass-through headers; values not recorded
error body/status = owning boundary remains visible; no translation selected
```

The streaming characterization is:

```text
STREAMING_PROTOCOL = DIRECT_FORWARDING
event families = response.created, response.in_progress,
  response.output_item.added/done, response.content_part.added/done,
  response.output_text.delta/done, response.function_call_arguments.delta/done,
  response.completed
content delta = observed
termination = response.completed
upstream error = no error event in successful probes; relay closes on stream error
abort/cancel = request and response cancellation propagate upstream; no retry/fallback
```

The live tools characterization is:

```text
TOOLS = INCLUDED
tool call emitted = YES
tool call representation = Responses function_call SSE item
tool result submitted = YES
tool result representation = function_call_output input item
continuation request = PASS
continuation response = PASS; response.completed
```

The Gateway response at the OpenCode boundary had no `content-type` header while
carrying the live SSE body. The relay preserves this observed header state and
does not synthesize a mapping. The public OpenCode `run` surface generated
`stream=true` for the authenticated requests; a separate non-stream fixture was
not emitted without body rewriting or a different transport owner. The
non-stream owner remains direct forwarding, with exact fixture values left to
implementation validation.

The integrated result is:

```text
SRG-022: RESOLVED
SRG-035: RESOLVED
writing-plans: COMPLETED
review gate: READY
RG-001: RESOLVED
RG-002: RESOLVED
RG-003: RESOLVED
RG-004: RESOLVED
pre-implementation gate: READY
design-to-plan consistency review: READY
production implementation: MAY START
```

### 11.5 Evidence traceability

The integrated observation was performed on 2026-09-20 with the following
secret-safe record:

```text
target runtime: OpenCode 1.18.31
validation command shape:
  opencode run --model openai/gpt-5.6-luna --format json "Reply exactly OK."
process-local provider.models callback: EXECUTED
model catalog: gpt-5.6-luna available
Gateway and relay origins: REACHABLE
credential checks: presence only; values not recorded
observed path: Gateway -> POST /v1/responses -> Codex upstream
observed upstream status: HTTP 200
observed OpenCode result: non-empty; non-zero usage
```

No request payload, response content, credential, account identifier, or raw
probe log is persisted in this repository. This bounded record makes the
observation and its limitations reviewable without turning secrets or payloads
into artifacts; it is not a replay fixture. The live public OpenCode run emitted
`stream=true`, so non-stream behavior remains the Task 5 deterministic
implementation-validation item, not a claim of separately observed non-stream
output from the protected OpenCode run.

### 11.6 Post-characterization gate review (2026-09-20)

The post-characterization gate review of commit `0851e88` confirmed that SRG-035
satisfies the pre-implementation closure contract. The confirmation scope is
limited to the target-runtime characterization and architecture boundary. It
does not approve source migration, dependency changes, production readiness, or
protected acceptance.

Direct fallback, retry loops, credential extraction, private OpenCode APIs, and
silent credential substitution remain prohibited.

### 11.7 Acceptance and deterministic verification ownership

The protected acceptance gate does not own every protocol assertion. The
following split is normative and closes the driver/observer boundary before
implementation:

```ts
type BoundaryScenario =
  | "valid-gateway-invalid-relay"
  | "invalid-gateway-valid-relay";

type BoundaryProbeResult = {
  readonly status: number;
  readonly responseClass: "gateway-rejected" | "relay-rejected";
};

type BoundaryProbe = (
  scenario: BoundaryScenario,
  env: Readonly<Record<string, string | undefined>>,
) => Promise<BoundaryProbeResult>;

type BoundaryAcceptanceDependencies = {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly probe: BoundaryProbe;
};

runBoundaryAcceptance(deps: BoundaryAcceptanceDependencies): Promise<void>;
```

`BoundaryProbe` is the only live boundary observer. It sends a fixed,
non-sensitive `POST /v1/responses` request through the configured Gateway Custom
Provider route. For `valid-gateway-invalid-relay`, it uses the protected Gateway
token and a fixed invalid relay sentinel; PASS is HTTP 401 with the relay's
fixed `{"error":"unauthorized"}` response class. For
`invalid-gateway-valid-relay`, it uses a fixed invalid Gateway sentinel and the
protected relay token; PASS is a Gateway rejection (HTTP 401 or 403) that is not
the relay's fixed unauthorized envelope. The probe retains only the status and
response class, never the response body or credentials. These two negative
controls are the concrete CI observers for Gateway authentication and relay
authentication; they do not introduce a second production route or credential
flow. The previously recorded successful OpenCode run remains local target-
runtime architecture evidence, not a GitHub Actions acceptance assertion.

The deterministic acceptance test invokes `runBoundaryAcceptance` with an
injected sentinel `BoundaryProbe`; it performs no network request and requires
no protected environment. The live driver invocation is owned only by Task 8's
protected workflow on the verified implementation branch. Task 6 MUST NOT run
the live driver from a developer or implementation workspace.

The existing `RELAY_ACCEPTANCE_ORIGIN` value remains owned by
`apps/deno-relay/acceptance_test.ts` for its direct relay route checks. It is
intentionally absent from `BoundaryAcceptanceDependencies` because the new
`BoundaryProbe` sends both authentication scenarios through the configured
Gateway Custom Provider route. The workflow still validates and supplies all six
existing `RELAY_ACCEPTANCE_*` values; this is a test-responsibility split, not a
configuration removal.

Response classification is bounded and fail-closed. The driver defines
`MAX_BOUNDARY_RESPONSE_BYTES = 4096`, reads at most 4097 bytes before
classification, and cancels the body after the bounded read. A body that exceeds
the limit, cannot be read, or does not match the fixed unauthorized response
class is a failed probe. The body is never logged, persisted, uploaded, or
returned from `BoundaryProbe`; the implementation must not read an unbounded
response into memory.

The ownership matrix is:

| Requirement                                    | Driver                                                                          | Observation point / interface                                                             | Command                                                                                                                     | Expected PASS                                                                                    | Failure owner                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| OpenCode OAuth state available                 | User-controlled OpenCode runtime                                                | OpenCode native auth store and official `opencode auth list` command                      | Local operator runtime only; not a CI command                                                                               | OpenCode recognizes the user's local OAuth state without exporting its value                     | OpenCode user/operator; fail closed and require official reauthorization        |
| OpenCode 1.18.31 and model selection           | Local target-runtime characterization                                           | OpenCode public hook and model-resolution boundary                                        | Local `opencode run --model openai/gpt-5.6-luna --format json "Reply exactly OK."` when a separate manual probe is required | Target runtime reaches the selected model without direct-route fallback; not a protected CI gate | Plugin/provider-models or host compatibility owner                              |
| Gateway authentication                         | `BoundaryProbe("valid-gateway-invalid-relay")`                                  | HTTP status plus `responseClass` only                                                     | Fixed Gateway `POST /v1/responses` probe with valid Gateway token and invalid relay sentinel                                | HTTP 401 and `relay-rejected`                                                                    | Gateway configuration or Gateway route owner                                    |
| Relay authentication                           | Both `BoundaryProbe` scenarios                                                  | HTTP status plus `responseClass` only                                                     | GitHub-hosted protected acceptance boundary probes                                                                          | Invalid relay is rejected before upstream and invalid Gateway is rejected at Gateway             | Relay authentication or plugin header owner                                     |
| Stream completion                              | Deterministic relay tests; local runtime characterization remains informational | Relay stream bytes, cancellation, and source ownership                                    | `deno test apps/deno-relay/relay_test.ts`; local OpenCode probe is not a CI gate                                            | Relay behavior passes without retry/fallback                                                     | Relay streaming/upstream owner                                                  |
| Non-stream JSON forwarding                     | Synthetic relay request                                                         | Status, body bytes, and allowed headers in `relay_test.ts`                                | `deno test apps/deno-relay/relay_test.ts`                                                                                   | Status/body/header forwarding is byte-preserving                                                 | Relay contract owner                                                            |
| `function_call_output` continuation forwarding | Synthetic relay request                                                         | Raw request bytes and SSE bytes in `relay_test.ts`                                        | `deno test apps/deno-relay/relay_test.ts`                                                                                   | Function-call continuation body and response stream are unchanged                                | Relay contract owner                                                            |
| Cancellation propagation                       | Synthetic downstream abort                                                      | `Request.signal`, upstream `AbortSignal`, and `ReadableStream.cancel` in `relay_test.ts`  | `deno test apps/deno-relay/relay_test.ts`                                                                                   | Upstream request and body are cancelled; no retry/fallback                                       | Relay streaming owner                                                           |
| No direct `chatgpt.com` route                  | Plugin integration and source ownership checks                                  | `globalThis.fetch` identity, no legacy interposer symbol, and one `provider.models` owner | `npm test -- --run test/plugin.test.ts`; source grep in Task 8                                                              | No global route mutation or second route owner                                                   | Plugin integration/host fail-closed owner                                       |
| Fail-closed invalid configuration              | Plugin activation tests with missing route/control configuration                | Rejection type, no returned hooks, and no direct route mutation                           | `npm test -- --run test/plugin.test.ts test/config.test.ts`                                                                 | Configuration/host failure rejects before dispatch                                               | Plugin configuration owner                                                      |
| Refresh-state persistence                      | OpenCode built-in provider                                                      | Local native auth service; no repository interface                                        | OpenCode runtime refresh path                                                                                               | Refreshed OAuth state is written to the user's native store; no CI copy exists                   | OpenCode user/operator; fail closed and require official reauthorization        |
| CI credential persistence                      | No CI component                                                                 | Protected acceptance environment contains only non-OAuth controls                         | GitHub-hosted workflow inspection and protected acceptance run                                                              | No OAuth state is supplied, persisted, or written back by CI                                     | Architecture owner; `DESIGN RE-APPROVAL REQUIRED` for any live OAuth CI request |

Non-stream forwarding, tool continuation, cancellation, and direct-route
exclusion therefore belong to deterministic tests and source-level ownership
checks, not to a second live OpenCode transport. The previously recorded live
SRG-035 tool continuation remains architecture evidence; the byte-preserving
relay regression is the implementation gate. Protected acceptance MUST NOT claim
to prove OAuth state availability, refresh persistence, non-stream output,
cancellation, or tool choice from a live OpenCode process. A future requirement
for any of those live CI assertions requires explicit architecture and security
re-approval rather than an implementation-time credential choice.

`BoundaryAcceptanceDependencies` contains no native-store or OAuth field. The
acceptance driver consumes only the existing non-OAuth Gateway and relay
controls, and its boundary probes retain only status and response class. The
user-controlled OpenCode runtime remains the sole owner of OAuth persistence and
refresh; CI does not synthesize, export, or write back that state.

## 12. Scope and Definition of Done

This design-and-plan correction changes only the two review documents. It does
not change production source, tests, dependencies, package metadata, lockfiles,
CI, deployment, Cloudflare settings, or runtime configuration.

SRG-022 is resolved. SRG-035 is resolved. The selected architecture is defined
by all of the following:

- Provider identity is `openai`.
- The public OpenCode extension point is the `provider.models` hook on the
  target OpenCode 1.18.31 runtime.
- The selected routing owner is the `provider.models` hook, through the target
  model's `model.api.url`.
- `model.api.url` is
  `https://gateway.ai.cloudflare.com/v1/<account>/<gateway>/custom-<slug>`.
- `provider.openai.options.baseURL` is not the effective ChatGPT OAuth route
  owner and is rejected as a current routing mechanism after target-runtime
  validation.
- The AI SDK-owned `/responses` suffix and the Custom Provider `base_url`
  together produce relay `POST /v1/responses`.
- The plugin configures `cf-aig-authorization` and
  `x-chatgpt-relay-authorization`, plus the existing Gateway control headers,
  without taking OAuth ownership.
- Global `fetch` interception is not a selected transport owner and cannot run
  as a parallel routing path.
- ChatGPT OAuth is acquired, stored, refreshed, and injected by OpenCode.
- The plugin does not read, copy, persist, or refresh OAuth credentials, and no
  private OpenCode credential API is required.
- PAT architecture is removed from the current design and marked superseded only
  in history.
- `cf-aig-authorization` has explicit Gateway ownership and termination.
- `x-chatgpt-relay-authorization` is the sole relay auth header.
- Relay transport is `POST /v1/responses`.
- `REQUEST_PROTOCOL = DIRECT_FORWARDING`.
- `RESPONSE_PROTOCOL = DIRECT_FORWARDING`.
- `STREAMING_PROTOCOL = DIRECT_FORWARDING`.
- `TOOLS = INCLUDED`, with Responses `function_call` and `function_call_output`
  continuation.
- Initial production mapping is `openai/gpt-5.6-luna` -> `gpt-5.6-luna` ->
  `@ai-sdk/openai 3.0.88` -> `gpt-5.6-luna`.
- Error ownership is fixed at the model-resolution, Gateway, relay, upstream
  OAuth, response, streaming, and explicit unsupported boundaries.
- Direct fallback and credential extraction are prohibited.
- Managed residency initial scope is `NOT SUPPORTED IN INITIAL SCOPE`.
- `openai/gpt-5.6-sol` remains validation evidence only.
- Gateway and relay authentication were validated without recording secret
  values.
- SRG-035 satisfies the closure contract as `RESOLVED`.
- `writing-plans` is `COMPLETED`.
- Protected acceptance runs on GitHub-hosted `ubuntu-latest` and uses only the
  existing non-OAuth Gateway, relay, and provider acceptance controls.
- ChatGPT OAuth is acquired, stored, refreshed, and injected only by the
  user-controlled OpenCode 1.18.31 runtime through its official native auth
  mechanism; CI has no OAuth injection, persistence, refresh, or write-back
  seam.
- `OPENCODE_AUTH_CONTENT`, GitHub Secrets containing OAuth state, PATs, OAuth
  token extraction, external brokers, and direct-fetch fallback are prohibited.
- Live OpenCode OAuth acceptance is not a CI release gate. A future request for
  it is `DESIGN RE-APPROVAL REQUIRED`.
- Fresh review status is `RG-001: RESOLVED`, `RG-002: RESOLVED`,
  `RG-003: RESOLVED`, and `RG-004: RESOLVED`.
- A fresh Superpowers Review Gate has marked this design and plan `READY`.
- The design-to-plan consistency review is `READY`; the Task 6 file ownership,
  deterministic/live acceptance ownership, implementation-branch ref, remote-SHA
  check, Environment branch-policy check, and Task 8 run lookup were re-reviewed
  and confirmed in the fresh Superpowers Review Gate for `474f9e3`.

Any future implementation plan and its tests MUST preserve the extension-point,
route-construction, header-ownership, error-boundary, fail-closed, streaming,
and no-retry/no-cache/no-payload-persistence constraints in this document. The
plan may choose only the concrete source patch that implements the
`provider.models` -> `model.api.url` route and plugin control-header
configuration; it may not choose a different routing mechanism.

The implementation plan has been revised to synchronize with this document.
The design document and implementation plan are checked for zero divergence in
specification, terminology, types/interfaces, error handling, test strategy,
and non-functional requirements. Any unresolved divergence, unsupported OAuth
injection proposal, failed ownership mapping, or acceptance-ref mismatch keeps
production implementation blocked. The fresh Superpowers Review Gate for `474f9e3`
has marked the pair `READY`; this document does not self-approve production
implementation.
