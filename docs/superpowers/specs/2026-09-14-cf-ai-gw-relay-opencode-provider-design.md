# cf-ai-gw-relay OpenCode Dedicated Provider Design

## Status

Draft — implementation planning is blocked until the §7 credential-source gate
selects an implementable path and the credential-gated pre-implementation
protocol gate in §6.2.3 closes. The post-implementation acceptance gate in
§6.2.2 is not a prerequisite for implementation planning; it validates the
implemented candidate against the contract fixed by the earlier gates. This
revision preserves the resolved decisions from SRG-002, SRG-013, SRG-016 through
SRG-020, SRG-023 through SRG-033, and the previously recorded
SRG-029/SRG-030/SRG-031 contract. It resolves SRG-034 by separating the
pre-implementation and post-implementation gates. SRG-021 is RESOLVED FOR
PLANNING and MUST NOT be reopened absent a concrete runtime contradiction. The
selected identity is `@ai-sdk/openai`; OpenCode 1.18.31 bundles version `3.0.88`
with provider specification `LanguageModelV3`. The configured `provider.npm`
value MUST remain the unqualified package identity, not a version-qualified npm
specification. Its selected-contract harness and finite compatibility interval
are bounded implementation-plan validation tasks, not architecture decisions;
the §7 credential-source lifecycle remains a pre-implementation gate and is not
deferred to that validation. The minimum exact-identity adapter behavior needed
by §6.2.3 is measured as part of that protocol gate and MUST NOT reopen SRG-021.
The 2026-09-16 runtime spike
measured a version-qualified dynamic config-defined provider path through
OpenCode 1.18.31, including provider/model mapping, `auth.loader()`, custom
`fetch`, the generated Responses request, and synthetic Responses SSE
consumption. It did not verify the selected bare-identity bundled path, the live
Codex endpoint, the production Gateway/relay mapping, or the native Codex model
ID. See §6.2 for the item-by-item status. SRG-022 remains UNRESOLVED — EVIDENCE
REQUIRED: no verified implementable credential source has been identified and no
concrete replacement candidate is under evaluation. The document records the
blocked state, the missing evidence, and the §7 gate order; this status does not
require repeated document edits until a concrete credential candidate or
authoritative credential evidence exists. SRG-035 remains UNRESOLVED — WAITING
ON SRG-022 for the credential-dependent native Codex protocol characterization.
Its independent tools-scope decision is still NOT SELECTED and may be recorded
before §7 closes; live tool semantics under decision A remain dependent on
SRG-022. The ChatGPT-subscription provider design is currently infeasible, and
implementation planning MUST NOT start until both blockers close with concrete
evidence.

The initial tools scope is also not selected. Choosing decision A (tools in the
initial contract) or decision B (tools explicitly out of initial scope) is a
design decision independent of discovering a credential candidate and MAY be
recorded before §7 closes. Under decision A, however, live tool-call, tool-result,
and continuation compatibility can be characterized only after the selected
credential path is available. The §6.2.3 gate MUST record exactly one decision
before the protocol gate closes. The implementation plan MUST NOT make that
decision.

## 1. Summary

This design reworks the `cf-ai-gw-relay` OpenCode integration so that the relay
is used through an explicit, dedicated OpenCode provider identity, rather than
by intercepting traffic sent to the built-in OpenAI / ChatGPT provider.

The new usage model is:

```text
OpenCode
  -> @yohi/cf-ai-gw-relay plugin
  -> cf-ai-gw-relay dedicated provider
  -> Cloudflare AI Gateway
  -> Deno Deploy relay
  -> ChatGPT Codex
```

The old fetch-intercept model is removed entirely. The plugin does not modify,
intercept, or rewrite `openai/*` traffic.

## 2. Goals

- Provide a dedicated provider `cf-ai-gw-relay` in OpenCode.
- Use the provider/model namespace `cf-ai-gw-relay/<upstream-provider>/<model>`.
- Support only `openai` as the upstream provider in the initial release while
  keeping the namespace extensible for future providers.
- Allow `openai/<model>` and `cf-ai-gw-relay/openai/<model>` to coexist in the
  same OpenCode environment as visibly distinct routes.
- Remove the old `globalThis.fetch` interposer and the legacy relay
  `POST /v1/responses` contract.
- Introduce a new fixed relay route `POST /upstream/openai/v1/responses` that
  the plugin targets through Cloudflare AI Gateway.
- Keep the plugin a thin transport boundary: it does not parse or reconstruct
  the request body produced by OpenCode / the selected AI SDK runtime.
- Offload any unavoidable Codex protocol adaptation to the Deno relay.
- Provide a ChatGPT credential/login flow owned by the `cf-ai-gw-relay`
  provider, using only public OpenCode plugin APIs. This goal is conditional on
  the §7 credential-source gate selecting an implementable path; until then the
  provider has no verified credential source and this goal cannot be treated as
  an implementation target.
- Reach a production-ready state for the new provider model.

## 3. Non-goals

- Reuse the built-in OpenAI provider's stored OAuth credential. Public OpenCode
  APIs do not safely support it today, so it is not a hard requirement.
- Support `anthropic`, `google`, or other upstream providers in the initial
  release.
- Provide backward compatibility with the old package name
  `@yohi/cloudflare-ai-gateway-chatgpt` or the old fetch-intercept behavior.
- Allow the user to override the Cloudflare AI Gateway custom provider slug.
- Support arbitrary generic proxying.

## 4. Repository and Package Layout

- Rename `packages/opencode-plugin/` to `packages/cf-ai-gw-relay/`.
- Rename the npm package from `@yohi/cloudflare-ai-gateway-chatgpt` to
  `@yohi/cf-ai-gw-relay`.
- Keep the `apps/deno-relay/` and `.github/scripts/` directory paths unchanged;
  their contents are modified as specified in §8 and §9 of this design. The Deno
  relay implements the new fixed upstream route, request/response sanitization,
  redirect handling, and Relay-origin error envelope. The provisioning scripts
  are updated to enforce the fixed `cf-ai-gw-relay` custom-provider slug
  invariant.
- The Deno relay remains stateless with zero external runtime dependencies.
- The npm plugin keeps its runtime dependency set constrained. It references
  `@opencode-ai/plugin` through `peerDependencies` / `devDependencies` and does
  not vendor OpenCode plugin SDK source.
- Update release-please and CI configuration for the new package name/path.
- Maintain the changelog in `packages/cf-ai-gw-relay/CHANGELOG.md`, merging in
  the historical entries from the old package as prior history.

## 5. Provider / Model Namespace

- Provider ID: `cf-ai-gw-relay`.
- Model ID under the provider: `<upstream-provider>/<model>`.
- Full OpenCode model identifier: `cf-ai-gw-relay/<upstream-provider>/<model>`.
- Initial supported upstream provider: `openai`.
- Initial standard model: `cf-ai-gw-relay/openai/<codex-model-id>`. The
  credential-gated pre-implementation protocol gate in §6.2.3 fixes the
  user-visible-to-AI-SDK mapping mechanism, the native Codex model ID, and the
  model ID placed in the generated wire body before writing the implementation
  plan. Until that gate closes, the implementation plan must not assume that the
  generated wire model is accepted by Codex. A result requiring a plugin-side
  body rewrite or a component-boundary change requires this design to be
  re-approved.
- OpenCode 1.18.31 parses a model reference at the first `/` only. The visible
  key `cf-ai-gw-relay/openai/<model>` therefore resolves to a parsed `modelID`
  of `openai/<model>` inside the OpenCode runtime, not to `<model>`. The
  `openai/` prefix is **not** automatically stripped by the provider/model
  namespace split. The final model ID passed to the selected AI SDK package is
  determined by the public OpenCode model definition (`model.id` /
  `model.api.id` for config-defined models) and by the provider/npm package
  selected by OpenCode, as recorded in §6.2. Any required mapping from the
  visible key to the wire-body model ID must be explicit in that configuration;
  the plugin does not parse or rewrite the request body to normalize it.
- The exact public OpenCode plugin API field or AI SDK provider model definition
  that produces the generated wire model is fixed by §6.2 pre-implementation
  design evidence and recorded as a concrete value, not as a list of candidate
  mechanisms. Until that evidence records the value, the design must not treat
  any specific mapping API or body field as settled. Because the custom `fetch`
  must not parse or rewrite the request body, any required model-ID
  normalization must happen before the body reaches the transport layer.
- The namespace is kept extensible for future `anthropic`, `google`, etc.,
  providers without a breaking change, but no placeholder or dummy models for
  unsupported upstreams are registered.
- `openai/<model>` and `cf-ai-gw-relay/openai/<model>` are usable side by side.
- The plugin must not intercept, rewrite, or mutate `openai/*` traffic.

## 6. OpenCode Plugin API Strategy

### 6.1 Hooks used

- `config` hook (primary): inject and merge `provider.cf-ai-gw-relay` into the
  user's configuration. Provide the standard models. Merge user-defined models,
  with user settings winning on conflict. User-defined models under the
  `cf-ai-gw-relay` provider follow the same mapping mechanism fixed by §6.2
  pre-implementation design evidence; the final model ID passed to the selected
  AI SDK package is determined by the OpenCode model definition (`model.id` /
  `model.api.id`) and by the provider/npm selection, not by automatic stripping
  of the `openai/` prefix.
- `auth` hook: provide the ChatGPT OAuth login flow for the `cf-ai-gw-relay`
  provider **only if** the §7 credential-source gate selects Path A (a dedicated
  OAuth client). With the current gate FAILED / BLOCKED, the `auth` hook
  implementation described in §7.2–§7.4 is a conditional target for Path A only,
  not a current implementation plan. Return provider options (including a custom
  `fetch`) from `auth.loader()` so that the OpenCode / AI SDK runtime uses the
  relay transport. If Path B is selected, this `auth.loader()` contract is
  replaced by the transport injection path recorded for the chosen credential
  architecture.
- `provider` (`ProviderHook`) hook: keep optional. Do not rely on it as the
  primary provider registration path today. It may be enabled later when
  OpenCode supports registering unknown providers through this hook.

### 6.2 Provider runtime / AI SDK adapter

The AI SDK adapter and end-to-end wire contract for `provider.cf-ai-gw-relay`
must be validated through an **end-to-end adapter test through the target
OpenCode runtime**, not through a standalone AI SDK script. The evidence below
distinguishes runtime observations from standalone package references. The
2026-09-16 runtime spike used OpenCode CLI `1.18.31`, a config hook, a local
HTTP Responses stub, and a synthetic stored `api` auth record. It is adapter
evidence only: it did not exercise Cloudflare AI Gateway, the Deno relay, or the
live Codex endpoint.

OpenCode 1.18.31 resolves the AI SDK provider package for a config-defined
provider/model in the following order:

```text
model.provider.npm → provider.npm → existing model npm → @ai-sdk/openai-compatible
```

For the unknown provider `cf-ai-gw-relay`, if no `provider.npm` field is
specified, the fallback is `@ai-sdk/openai-compatible`, not `@ai-sdk/openai`.
The compatibility spike must therefore record the exact provider configuration
that causes OpenCode to select the intended AI SDK package. For the native
OpenAI path, `provider.npm` MUST be the exact unqualified value
`@ai-sdk/openai`. OpenCode uses the effective `model.api.npm` string both as a
package specification and as a provider identity for exact-match runtime
branches. `@ai-sdk/openai@3.0.88` is therefore not equivalent: it can be
installed as a version-qualified package specification, but it does not match
the bundled-provider or OpenAI-specific identity checks. The OpenCode release
and its bundled SDK version are recorded separately as a compatibility tuple.

OpenCode 1.18.31, when a custom provider has no dedicated model loader, calls
`sdk.languageModel(model.api.id)`. The runtime spike measured the observed path
as `createOpenAI({ name, ...options })` followed by
`languageModel("wire-model")`; the former version-qualified
`@ai-sdk/openai@4.0.67` package delegated that method to its Responses model
implementation. The custom provider does not use the built-in `openai`
provider's special loader. This confirms only the version-qualified dynamic
package adapter path and its local request-generation behavior; it does not
confirm the bundled `@ai-sdk/openai` identity path, its identity-sensitive
OpenCode transforms, or live Codex acceptance.

**Baseline selection record (2026-09-16):** The selected OpenCode provider
package identity is `@ai-sdk/openai`, selected through the exact `provider.npm`
value `@ai-sdk/openai`. OpenCode `v1.18.31` bundles `@ai-sdk/openai@3.0.88`, and
its provider specification is `LanguageModelV3`. The published OpenCode
`v1.18.31` source imports and consumes `LanguageModelV3` for provider models,
and its release manifest pins `@ai-sdk/openai@3.0.88`. The version-qualified
`@ai-sdk/openai@4.0.67` runtime observation is retained only as supplemental
reference evidence for the dynamic adapter path; it is not evidence for
OpenCode's bundled identity-sensitive behavior and is not a selectable
production baseline for OpenCode 1.18.31. The selected 3.0.88 package has not
yet been re-measured through the complete adapter harness. The minimum
exact-identity request-generation and transport behavior needed by the §6.2.3
protocol gate must be measured before implementation planning; the broader
adapter harness and finite compatibility interval remain the bounded
implementation-plan validation task in §6.2.4. The relevant primary sources are
the
[OpenCode v1.18.31 provider implementation](https://github.com/anomalyco/opencode/blob/v1.18.31/packages/opencode/src/provider/provider.ts)
and its
[release manifest](https://github.com/anomalyco/opencode/blob/v1.18.31/packages/opencode/package.json),
and its
[provider transforms](https://github.com/anomalyco/opencode/blob/v1.18.31/packages/opencode/src/provider/transform.ts).
All package-specific captures from the former 4.0.67 spike below are
**REFERENCE** evidence for the version-qualified dynamic adapter path only; they
do not close the selected identity-sensitive baseline until 3.0.88 is
re-measured.

**Final provider config shape to be recorded as measured values:**

| Field                         | What it controls                                                                 | Required measured value                                                                                                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provider.id`                 | OpenCode provider identifier                                                     | `cf-ai-gw-relay`                                                                                                                                                                          |
| `provider.npm`                | AI SDK provider package identity selected by OpenCode                            | **SELECTED:** `@ai-sdk/openai`; OpenCode 1.18.31 bundles `@ai-sdk/openai@3.0.88`. Use the bare identity; harness measurement remains required; no version-qualified identity              |
| model visible key             | User-selectable OpenCode model key                                               | **MEASURED locally:** `cf-ai-gw-relay/openai/visible-model`                                                                                                                               |
| `model.id` / `model.api.id`   | Model ID resolved by OpenCode for the AI SDK call                                | **MEASURED locally:** `openai/visible-model` / `wire-model`                                                                                                                               |
| provider options              | Object passed to the selected AI SDK factory                                     | **MEASURED locally:** `baseURL`, loader sentinel `apiKey`, custom `fetch`                                                                                                                 |
| `baseURL`                     | Gateway base URL used by the AI SDK runtime                                      | Production target remains `https://gateway.ai.cloudflare.com/v1/{cloudflareAccountId}/{gatewayId}/custom-cf-ai-gw-relay/upstream/openai/v1`; local spike used `http://127.0.0.1:43133/v1` |
| custom `fetch` source         | Path A: transport returned from `auth.loader()`; Path B: recorded injection path | **MEASURED locally:** `auth.loader()` after stored `api` auth via `client.auth.set({ path: { id: "cf-ai-gw-relay" }, ... })`; credential architecture remains open                        |
| selected AI SDK major/version | Contract compatibility with OpenCode runtime                                     | **SELECTED:** OpenCode `1.18.31` + bundled `@ai-sdk/openai@3.0.88` / `LanguageModelV3`; bare identity; harness and finite interval required; §7 credential gate remains open.             |

The final configuration fields above must be populated with concrete values for
the selected implementation. §6.2 has four distinct evidence categories. The §7
credential-source gate and the credential-gated protocol gate in §6.2.3 are
sequential pre-implementation architecture gates. The selected-baseline
validation handoff in §6.2.4 verifies the already selected SDK contract and
finite support interval during implementation planning; it cannot silently
change component boundaries, public interfaces, wire-protocol responsibility, or
the security model. If it exposes a failure that requires such a change,
implementation stops and this design returns for explicit re-approval. The
post-implementation acceptance gate closes only after the candidate
implementation passes its protected acceptance requirements. The broader
validation and acceptance tasks do not replace either pre-implementation gate.

**Target request contract for the initial model (runtime evidence and remaining
production target):**

The former OpenCode runtime spike observed a local adapter path using the
version-qualified package `@ai-sdk/openai@4.0.67`. Because that value is not the
native bundled package identity, the spike does not prove identity-sensitive
OpenCode behavior. The local server was not Cloudflare AI Gateway, the Deno
relay, or Codex, so production URL routing and upstream acceptance remain open.

- OpenCode model identifier: `cf-ai-gw-relay/openai/<model>` (see §5). The exact
  `<model>` value accepted by Codex remains unverified; `o3-mini` is the value
  used in the reference spike to observe the request-generation path.
- Method: `POST`.
- Production request URL expected from the AI SDK runtime (not reached by the
  local spike):

  ```text
  https://gateway.ai.cloudflare.com/v1/{cloudflareAccountId}/{gatewayId}/custom-cf-ai-gw-relay/upstream/openai/v1/responses
  ```

  where the configured `baseURL` passed to the selected AI SDK factory is:

  ```text
  https://gateway.ai.cloudflare.com/v1/{cloudflareAccountId}/{gatewayId}/custom-cf-ai-gw-relay/upstream/openai/v1
  ```

  The local runtime capture instead received
  `http://127.0.0.1:43133/v1/responses`. No URL rewriting was performed by the
  custom `fetch`. The production URL claim remains conditional on the configured
  Gateway base URL and the same AI SDK package/factory path.
- Upstream path suffix forwarded to the relay: `v1/responses`.
- Exact request schema generated by the selected AI SDK package in Responses
  mode: the OpenCode runtime capture observed the following top-level fields:

  | Field         | Presence | Notes                                                                                                           |
  | ------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
  | `model`       | required | Runtime capture: `wire-model`, the explicit `model.api.id`; the `openai/` prefix is not automatically stripped. |
  | `input`       | required | Runtime capture: present as the OpenAI Responses conversation input; `messages` was absent.                     |
  | `stream`      | optional | Runtime capture: `true` for both streamed requests.                                                             |
  | `tools`       | optional | Reference capture only; §6.2.3 must select whether tools are in the initial contract.                           |
  | `tool_choice` | optional | Runtime capture: `auto` on the tool-enabled request.                                                            |

  Runtime-captured tool shape (payload values omitted):

  ```json
  {
    "tools": [{
      "type": "function",
      "name": "<tool-name>",
      "description": "<tool-description>",
      "parameters": { "type": "object", "properties": {}, "required": [] }
    }],
    "tool_choice": "auto"
  }
  ```

  Additional optional fields (`temperature`, `max_output_tokens`, `top_p`,
  `presence_penalty`, `frequency_penalty`, `reasoning`, `store`, `user`, etc.)
  are forwarded as generated by the AI SDK runtime.
- Exact request schema sent to Codex: the local runtime body matches the OpenAI
  Responses API shape and the adapter spike performed no transformation. This is
  not a conclusion that the relay requires no transformation. The
  credential-gated pre-implementation protocol gate in §6.2.3 determines live
  Codex acceptance and any minimum relay mapping before the implementation plan
  is written.
- Success response handling and SSE framing: a synthetic OpenAI Responses SSE
  stream was consumed successfully by the OpenCode runtime. Live Codex
  response/SSE compatibility remains open; see items 16 and 17 below.
- Abort handling: propagate the inbound `AbortSignal` to the upstream `fetch`.
- Error response handling: see §11.

**Compatibility spike evidence:**

Each item below belongs to exactly one gate after mixed observations are split.
Evidence states are **MEASURED**, **FAILED**, **PENDING**, **NOT MEASURED**,
**REFERENCE**, and **PARTIALLY MEASURED**. Gate categories are
**PRE-IMPLEMENTATION DESIGN**, **PRE-IMPLEMENTATION PROTOCOL GATE**,
**IMPLEMENTATION VALIDATION**, and **POST-IMPLEMENTATION ACCEPTANCE**. A
pre-implementation design or protocol-gate item closes only as **MEASURED** or
**FAILED** with the bounded resolution defined above. A post-implementation item
passes only as **MEASURED** against the candidate implementation; a failure
rejects the candidate and never permits fallback. Standalone package
observations remain supplemental **REFERENCE** evidence.

### 6.2.1 Pre-implementation design evidence

The following evidence may use a disposable harness, local temporary server,
untracked files, and readonly external investigation. It must not require a
candidate repository implementation, candidate deployment, production Gateway
mapping, or Cloudflare resource mutation. Its purpose is to establish the
OpenCode integration seam, request-generation contract, credential architecture
feasibility, and the selected-baseline behavior needed by the credential-gated
protocol gate before writing an implementation plan. The §7 credential-source
gate closes first; §6.2.3 then runs the protocol gate with the selected
credential path. The broader selected-baseline compatibility interval remains
the bounded validation handoff in §6.2.4.

### 6.2.2 Post-implementation acceptance evidence

The following evidence validates the implemented candidate. It is planned and
executed after the candidate provider, fixed relay route, and non-production or
protected deployment exist. It is not a precondition for implementation
planning. It verifies the native model ID, wire mapping, and protocol adaptation
contract already fixed by §6.2.3; it does not discover or choose those
architecture decisions. Protected acceptance covers streaming text delta
delivery through completion; when §6.2.3 selects decision A (tools in the initial
contract), a tool call, tool-result, and continuation; and caller abort through
Gateway and relay with no retry, fallback, or continued downstream stream.

Live abort evidence has two distinct parts. A deterministic relay integration
test proves that the inbound abort signal aborts the upstream fetch and cancels
the upstream response body. Protected acceptance proves caller cancellation,
downstream stream termination, and exactly one Gateway and relay request with no
retry or fallback. Its record names an approved, secret-free correlation source.
Unless an approved upstream-side cancellation signal is available, the live test
does not claim direct observation of Codex resource release.

### 6.2.3 Credential-gated pre-implementation protocol characterization

The design selects **Option 3C: credential-gated pre-implementation protocol
characterization**. This gate runs only after §7 has selected and closed one
credential architecture, and it MUST close before writing the implementation
plan. The selected credential path is required to perform a target-runtime/live
Codex probe; a disposable harness and readonly external investigation may be
used for setup and sanitization, but synthetic-only evidence cannot close this
gate. The probe must use the selected AI SDK identity and the concrete transport
injection boundary already recorded in this design.

The gate MUST establish all of the following before planning starts:

The initial tools scope is an explicit gate decision, not an implementation
choice. It is currently **NOT SELECTED** because the design has not recorded a
decision, while the §7 credential-source gate is blocked. The A/B selection
itself does not require a credential candidate; the selected credential path is
required for the live compatibility characterization under decision A. Before
§6.2.3 closes, the design MUST record exactly one of these decisions:

- **A: tools are in the initial contract:** the probe measures tool call, tool
  result, and continuation semantics and records the relay-only contract.
- **B: tools are explicitly out of initial scope:** the design records this as
  a supported-capability non-goal, and implementation-plan tasks and acceptance
  tests exclude tool call, result, and continuation behavior.

Until A or B is recorded, every tools reference below is a protocol-gate
placeholder only. The implementation plan MUST NOT choose this scope.

1. The initial native Codex model ID and the explicit mapping from the visible
   OpenCode model key to the AI SDK and wire-body model IDs.
2. The selected AI SDK's generated request is accepted by the Codex endpoint.
3. Any required request adaptation fits entirely within the fixed Deno relay
   route and its relay-only responsibility.
4. The response and SSE framing are compatible, or the minimum relay-only
   response/SSE mapping is recorded.
5. The selected initial tools-scope decision is recorded. Under decision A,
   tool call, tool result, and continuation semantics are compatible within the
   relay-only boundary; under decision B, no tool continuation contract is
   included in the initial release.
6. No plugin-side body rewrite is required.
7. No plugin/relay component-boundary or public-interface change is required.
8. No selected AI SDK family or major-version change is required.
9. No credential or security-architecture change is required.

The gate records the concrete native model ID, wire model mapping, request
mapping, response/SSE mapping, and applicable tool-continuation mapping in a
secret-free form. If the probe passes with direct forwarding, that fact is
recorded explicitly. If it fails but a bounded relay-only mapping resolves the
failure, the required mapping shape is recorded in the design and the
implementation plan implements that mapping with TDD; the plan does not discover
it. Exact helper decomposition and fixture values may remain plan details.

If the probe fails and relay-only bounded mapping is sufficient, the design
remains within the selected architecture and planning may start only after the
mapping is recorded. If it requires any prohibited change, or cannot be resolved
by relay-only mapping with the selected AI SDK baseline, the gate fails and this
design returns for explicit re-approval before planning or implementation. The
implementation agent MUST NOT choose a plugin body rewrite, component-boundary
change, SDK family/major change, credential-architecture change, generic proxy,
or direct fallback.

This gate is architecture viability evidence, not production deployment
acceptance. Production-shaped Gateway routing, deployment reachability, live
end-to-end abort propagation, exactly-one-request correlation, observability,
and performance remain §6.2.2 post-implementation acceptance items.

1. **IMPLEMENTATION VALIDATION / MEASURED** — OpenCode version used: `1.18.31`
   (CLI in the spike environment). The selected baseline boundary is the pair
   OpenCode `1.18.31` + bundled `@ai-sdk/openai@3.0.88`, because its published
   source consumes `LanguageModelV3`; the final supported interval is recorded
   by §6.2.4.
2. **PRE-IMPLEMENTATION PROTOCOL GATE / PARTIALLY MEASURED** — The former
   runtime spike selected the explicitly configured, version-qualified
   `provider.npm` value `@ai-sdk/openai@4.0.67` for `cf-ai-gw-relay`. That
   observation covers only the dynamic package adapter path. The selected
   baseline now uses the exact, unqualified `provider.npm` value
   `@ai-sdk/openai`; OpenCode 1.18.31 bundles `@ai-sdk/openai@3.0.88` /
   `LanguageModelV3`. The minimum exact-identity path required by §6.2.3 has not
   yet completed its harness run and remains part of the protocol gate. Without
   an explicit `provider.npm`, the fallback for this unknown provider remains
   `@ai-sdk/openai-compatible`. The broader version and API-boundary validation
   remains implementation-plan work under §6.2.4.
3. **IMPLEMENTATION VALIDATION / PARTIALLY MEASURED** — The exercised versions
   are OpenCode `1.18.31`, `@opencode-ai/plugin@1.18.29`, and
   `@opencode-ai/sdk@1.18.29`. The minimum supported OpenCode version and the
   complete credential-dependent lifecycle are not validated.
4. **IMPLEMENTATION VALIDATION / NOT MEASURED** — Intended `engines.opencode`
   range and `@opencode-ai/plugin` peerDependency range: the repository
   currently declares `engines.opencode` as `>=1.18.20 <2` and
   `@opencode-ai/plugin` as `>=1.18.20`. A real-package compatibility test
   across that range is still required, and must match the credential
   architecture eventually selected. Testing only a minimum version and one
   current/reference version does not establish the complete declared range. The
   final ranges must have an explicit upper bound at a released version boundary
   and must not include future OpenCode or plugin-SDK releases by construction.
   Every known OpenCode or plugin-SDK API compatibility boundary within that
   finite interval must be exercised, or the ranges must be narrowed to the
   versions actually verified.

5. **PRE-IMPLEMENTATION / MEASURED** — OpenCode model-ID mapping trace from the
   runtime spike:

- Visible OpenCode model key: `cf-ai-gw-relay/openai/visible-model`
- Parsed OpenCode `modelID`: `openai/visible-model` (split at first `/`)
- Config `model.id`: `openai/visible-model`
- Config `model.api.id`: `wire-model`
- Final model ID passed to the AI SDK path: `wire-model`
- Wire-body `model`: `wire-model`

6. **PRE-IMPLEMENTATION / MEASURED** — The runtime formed the local `baseURL`
   `http://127.0.0.1:43133/v1`. The required production base URL shape is
   `https://gateway.ai.cloudflare.com/v1/{cloudflareAccountId}/{gatewayId}/custom-cf-ai-gw-relay/upstream/openai/v1`.
   Its construction is a design contract; Gateway-to-relay reachability is item
   26 and is not required before planning.
7. **PRE-IMPLEMENTATION / MEASURED** — The local custom `fetch` received
   `http://127.0.0.1:43133/v1/responses` without URL rewriting. Production
   routing is item 26 and is not required before planning.
8. **PRE-IMPLEMENTATION / MEASURED** — Runtime custom `fetch` method: `POST`.
9. **REFERENCE — measured on the former `@ai-sdk/openai@4.0.67` spike** — The
   runtime captured `input`, `max_output_tokens`, `model`, and `stream` on the
   basic request. The tool-enabled request additionally contained `tools` and
   `tool_choice`.
10. **REFERENCE — measured on the former `@ai-sdk/openai@4.0.67` spike** —
    Responses conversation data is generated as `input`; the runtime request did
    not contain `messages`.
11. **REFERENCE — measured on the former `@ai-sdk/openai@4.0.67` spike** —
    Runtime tool shape is an array of function definitions with `type`, `name`,
    `description`, and JSON-Schema `parameters`; the captured tool-enabled
    request used `tool_choice: "auto"`.
12. **REFERENCE — measured on the former `@ai-sdk/openai@4.0.67` spike** —
    Runtime `stream` value was `true` for both captured streaming requests.

Items 9–12, 16, and 20–25 are usable only as evidence of the former
version-qualified dynamic adapter path and its generic request/response shape.
They do not establish the bundled-provider lookup, `cf-ai-gw-relay` to `openai`
provider-options remapping, or any OpenAI/Responses-specific transform that
depends on the exact `@ai-sdk/openai` identity.

### 6.2.4 Selected-baseline validation handoff

The OpenCode provider package identity and provider specification are selected
before implementation planning: `provider.npm = "@ai-sdk/openai"` /
`LanguageModelV3`. OpenCode `1.18.31` bundles `@ai-sdk/openai@3.0.88`; this
release-pinned version is recorded separately from the `provider.npm` identity.
The minimum exact-identity request-generation and transport behavior required by
§6.2.3 is measured as part of that pre-implementation protocol gate. The
following broader task verifies the selected contract and determines the
released support interval without reopening the selected architecture.

**Validation Task:** After the §7 credential-source gate and §6.2.3 protocol
gate have closed, re-measure the selected SDK contract with the selected §7
credential lifecycle through the real `@opencode-ai/plugin` package. Record the
credential lifecycle as an input to this task; this task does not select or
validate the credential source itself. Then record the
minimum and maximum verified released OpenCode versions, each released OpenCode
or plugin-SDK API boundary in that interval, the bundled `@ai-sdk/openai`
version for each OpenCode release, and matching `engines.opencode` and
`@opencode-ai/plugin` peerDependency ranges. The finite compatibility interval
is a set of `(OpenCode release, bundled @ai-sdk/openai
version)` pairs, not an
OpenCode-version-only range.

**Why:** Confirm exact provider identity resolution, the bundled provider path,
plugin initialization, `config` hook, credential acquisition or injection, model
selection, and one request reaching mocked custom `fetch` under the already
selected baseline.

**RED:** Run the selected-contract harness against OpenCode 1.18.31 and the
selected credential path. Preserve secret-free captures for any provider
resolution, lifecycle, request-generation, or custom-transport incompatibility.

The selected-contract harness MUST assert all of the following:

- The effective `model.api.npm` and configured `provider.npm` are exactly
  `@ai-sdk/openai`, without a version qualifier.
- OpenCode uses the bundled `@ai-sdk/openai` provider path rather than the
  version-qualified dynamic `Npm.add(...)` path.
- The runtime SDK version is the OpenCode 1.18.31 release pin
  `@ai-sdk/openai@3.0.88` and the provider specification is `LanguageModelV3`.
- The custom provider ID `cf-ai-gw-relay` is remapped to the `openai` key where
  the AI SDK expects provider options.
- OpenAI/Responses-specific identity-sensitive transforms, including applicable
  reasoning-mode conversion, provider-options key remapping, and Responses
  item-ID sanitation, are active under the exact identity and are not bypassed
  by a version-qualified npm string.
- The former `@ai-sdk/openai@4.0.67` spike is not used as evidence for any of
  these bundled identity-sensitive assertions.

**GREEN:** Exercise the minimum, maximum/reference, and every released API
boundary in the intended finite interval. Record passing evidence and narrow the
declared support ranges to the versions actually verified.

**Failure rule:** A failure may narrow the supported version interval or stop
implementation against an unsupported release. It MUST NOT switch the selected
AI SDK package or major version, change the credential architecture, alter
component boundaries, or add plugin body rewriting. If the evidence exposes a
failure that requires any of those changes, the pre-implementation protocol gate
is not closed and this design returns to design review for explicit re-approval;
the implementation plan must not make that choice.

13. **PRE-IMPLEMENTATION PROTOCOL GATE / NOT MEASURED** — Exact native Codex
    model ID accepted by `https://chatgpt.com/backend-api/codex/responses`: not
    verified. It is characterized with the selected credential path by §6.2.3
    before writing the implementation plan.
14. **PRE-IMPLEMENTATION / MEASURED** — The observed AI SDK model ID was
    `wire-model`, equal to the explicit config `model.api.id`; no automatic
    stripping of the `openai/` prefix occurred.
15. **PRE-IMPLEMENTATION / MEASURED** — The visible key
    `cf-ai-gw-relay/openai/visible-model` mapped to parsed `modelID`
    `openai/visible-model`, while the explicit model definition mapped the AI
    SDK and wire ID to `wire-model`.
16. **REFERENCE — measured on the former `@ai-sdk/openai@4.0.67` spike** — A
    synthetic OpenAI Responses SSE stream containing
    output-item/content-part/delta/completion events was consumed successfully
    by the OpenCode runtime. It does not close the live Codex protocol gate.
17. **PRE-IMPLEMENTATION PROTOCOL GATE / NOT MEASURED** — The selected AI SDK
    request, Codex response/SSE framing, and any required relay-only request or
    response mapping have not been verified against live Codex. The gate in
    §6.2.3 must record the final mapping decision before the implementation plan
    is written. Production-shaped streaming remains item 27.
18. **PRE-IMPLEMENTATION / MEASURED** — The config hook injected the
    `cf-ai-gw-relay` provider into the OpenCode configuration.
19. **PRE-IMPLEMENTATION / MEASURED** — `opencode models cf-ai-gw-relay`
    surfaced `cf-ai-gw-relay/openai/visible-model` for selection.
20. **REFERENCE — measured on the former `@ai-sdk/openai@4.0.67` spike** — The
    version-qualified provider npm value selected the dynamic package path as
    `@ai-sdk/openai@4.0.67`; this is not evidence that the bundled
    `@ai-sdk/openai` identity path was used.
21. **PRE-IMPLEMENTATION / MEASURED** — OpenCode resolved `model.api.id` as
    `wire-model`.
22. **REFERENCE — measured on the former `@ai-sdk/openai@4.0.67` spike** — The
    runtime used the generic custom-provider path:
    `createOpenAI({ name, ...options })` followed by
    `languageModel("wire-model")`, which selected the package's Responses model.
23. **REFERENCE — measured on the former `@ai-sdk/openai@4.0.67` spike** —
    Custom `fetch` received the local URL `http://127.0.0.1:43133/v1/responses`.
24. **REFERENCE — measured on the former `@ai-sdk/openai@4.0.67` spike** — The
    request body `model` was `wire-model`.
25. **REFERENCE — measured on the former `@ai-sdk/openai@4.0.67` spike** — The
    runtime captured `input` and `stream` on the basic request, and `input`,
    `tools`, `tool_choice`, and `stream` on the tool-enabled request; `messages`
    was absent.

26. **POST-IMPLEMENTATION ACCEPTANCE / NOT MEASURED** — The deployed Gateway
    custom provider maps the configured production URL to the deployed fixed
    relay route, and the route reaches the selected Codex credential path.
27. **POST-IMPLEMENTATION ACCEPTANCE / NOT MEASURED** — Live text streaming,
    applicable tool call/result/continuation, and SSE compatibility pass through
    the candidate production-shaped path.
28. **POST-IMPLEMENTATION ACCEPTANCE / NOT MEASURED** — Caller abort propagates
    through plugin, Gateway, relay, and upstream fetch; protected correlation
    proves exactly one Gateway and relay request, no retry, no fallback, and no
    continued downstream stream.
29. **POST-IMPLEMENTATION ACCEPTANCE / NOT MEASURED** — Candidate fail-closed
    behavior is verified for production-shaped Gateway, relay, credential, and
    protocol failures.

The §7 credential-source gate and the §6.2.3 credential-gated protocol gate are
sequential pre-implementation blockers. The **IMPLEMENTATION VALIDATION** items
are mandatory implementation-plan tasks after those gates close, and the
**POST-IMPLEMENTATION ACCEPTANCE** items are mandatory candidate acceptance
tasks. Neither validation category may replace or silently defer either
pre-implementation gate.

### 6.3 Custom `fetch` responsibilities

The transport responsibilities below are conditional on the §7 credential-source
gate selecting Path A (dedicated OAuth client). If Path B is selected, the
transport injection path and the outbound `Authorization` header source must be
recorded to match the chosen architecture; the shared responsibilities (validate
the Gateway URL, add control headers, forward without body inspection, and
fail-closed error handling) still apply. For Path A, the custom `fetch` returned
by `auth.loader()` is a thin transport boundary:

1. Receive the request generated by OpenCode / the AI SDK runtime.
2. Validate and use the request URL generated by the configured provider; the
   custom `fetch` does **not** rewrite the URL to a different Gateway path.
3. Add the required control headers.
4. Replace the `Authorization` header with the current ChatGPT OAuth token (Path
   A).
5. Forward the request to the relay.
6. Return the response without parsing or buffering the body, except for the
   limited, bounded Relay-origin error inspection described in §11.

The custom `fetch` does **not**:

- intercept or rewrite `openai/*` traffic,
- reinterpret the LLM message schema,
- reconstruct the Codex request body,
- fall back to the direct OpenAI route on relay failure,
- perform broad upstream protocol normalization,
- translate arbitrary upstream error bodies.

If unavoidable Codex adaptation is required, the adaptation boundary is the Deno
relay, not the plugin.

## 7. Credential Source and Authentication Architecture

The `cf-ai-gw-relay` provider has no verified credential source today. This
section records the rejected evaluated paths and the requirements for any future
replacement candidate. Credential selection is part of the pre-implementation
design gate. Until a concrete path closes with measured evidence, the design is
BLOCKED and must not proceed to implementation planning. Candidate deployment
and post-implementation acceptance are not credential-gate prerequisites.

**Candidate decision table (2026-09-16):** The following are every credential
candidate evaluated to date. No entry is **VIABLE**, so neither path can be
selected and the gate remains blocked.

| Candidate                                                       | Credential owner                                      | Acquisition method             | Public OpenCode API                              | Stored auth        | Storage                       | Refresh/rotation       | Authorization source                                                    | `chatgptAccountId` source           | Residency source                    | Transport injection                          | User setup              | Failure behavior                               | Permission authority                      | Permission scope                                                 | Result         |
| --------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------ | ------------------------------------------------ | ------------------ | ----------------------------- | ---------------------- | ----------------------------------------------------------------------- | ----------------------------------- | ----------------------------------- | -------------------------------------------- | ----------------------- | ---------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------- | -------------- |
| Path A: dedicated public OAuth client                           | No client owner identified                            | No legitimate client available | N/A                                              | N/A                | N/A                           | N/A                    | No authoritative third-party authorization identified                   | Unknown                             | Unknown                             | N/A                                          | N/A                     | Reject before request                          | No client owner or authorization evidence | No demonstrated permission for the plugin or Gateway/relay route | **NOT VIABLE** |
| Path B0: reuse built-in OpenCode `openai` OAuth auth (rejected) | OpenCode built-in provider and the subscriber account | Built-in `openai` login        | No safe public read/rebind API for this provider | Built-in auth only | OpenCode built-in auth record | Built-in provider only | Built-in client contract is reference-only and does not authorize reuse | Built-in-token reference claim only | Built-in-token reference claim only | No supported injection into `cf-ai-gw-relay` | Built-in `openai` login | Reject candidate; do not fall back to `openai` | The public API boundary excludes reuse    | No third-party provider, Gateway, or relay permission            | **NOT VIABLE** |

In this table, **NOT VIABLE** means not selectable for the current design based
on the evidence evaluated to date. It does not claim that no future credential
candidate can exist. A future candidate is a new evaluation and MUST supply the
authoritative ownership, permission, lifecycle, metadata, transport, and secret
boundary evidence required below before it can be marked **VIABLE**.

No credential architecture is selected in this revision. The Path A contract in
§7.1–§7.4 and every Path A-specific reference elsewhere in this document are
conditional requirements only; they are not an implementation target while the
credential-source gate is `BLOCKED`. A synthetic auth record can demonstrate an
OpenCode transport seam, but it cannot select a ChatGPT credential architecture
or establish credential ownership, permission, or account/residency semantics.

Before selecting a replacement credential architecture, record every evaluated
candidate in a decision table with these columns: candidate, credential owner,
acquisition method, public OpenCode API, stored auth, storage, refresh/rotation,
authorization source, `chatgptAccountId` source, residency source, transport
injection, user setup, failure behavior, permission authority, permission scope,
and result. A result is exactly one of **VIABLE**, **NOT VIABLE**, or
**UNVERIFIED**. A candidate is **VIABLE** only when primary evidence, such as
official documentation, official authentication documentation, official provider
terms/policy, or the credential owner's explicit scope, authorizes the
third-party plugin, Gateway/relay intermediary, and intended
ChatGPT-subscription traffic. Technical operation, a GitHub issue, another
project's use, an absence of a known prohibition, or inference is not permission
evidence.

The selected architecture must be exactly one path: Path A with a newly verified
legitimate public client, or one concrete Path B candidate. Path A remains
**FAILED** unless new authoritative evidence establishes its client owner,
public client ID, allowed third-party use, authorization and token endpoints,
scopes, redirect URI and callback port, PKCE/public-client semantics, and
account/residency semantics. Do not reopen the same failed Path A hypothesis
without such evidence. If neither path is **VIABLE**, the design is infeasible
and implementation planning remains blocked.

For the selected path, `chatgptAccountId` and residency must each be classified
as required, optional, or not applicable. Required or optional metadata must
record its source, claim or storage, precedence, refresh behavior, outbound
header, and missing or malformed behavior. Not-applicable metadata must not be
generated, sent, required by tests, or documented as a setup requirement. The
selected path must also measure whether it uses stored OpenCode auth. A stored
auth path records the auth record type, creation API, persistence, provider
binding, `auth.loader()` invocation, provider options/custom `fetch` injection,
and rotation/update behavior. A no-stored-auth path records the exact public
OpenCode API that injects provider options or custom `fetch`; a non-public or
unmeasured injection path rejects the candidate.

- **Path A — Dedicated OAuth client:** Obtain a legitimate, third-party, public
  OAuth client for `cf-ai-gw-relay`. If and only if such a client is obtained,
  the conditional dedicated-OAuth contract in §7.1–§7.4 becomes the
  implementation target and all §7.1 contract items must be closed with measured
  values.
- **Path B — Redesign credential architecture:** Replace the dedicated-OAuth
  design with a concrete, implementable credential source. If this path is
  chosen, the old dedicated-OAuth conditional design in §7.1–§7.4 is **not**
  retained as the main architecture. This is a new candidate, not a reopening of
  rejected Path B0. The new source must concretize, at minimum: credential
  owner, acquisition method, OpenCode public API boundary, storage,
  refresh/rotation ownership, chatgptAccountId source, residency source,
  outbound headers, user login/setup flow, failure handling, security boundary,
  and tests. Path B must also provide evidence that the credential owner and
  applicable provider terms permit this third-party plugin to use the credential
  through the Gateway/relay route for the intended ChatGPT-subscription traffic;
  the evidence must identify its authority and scope without recording a
  credential value. Technical ability to acquire, store, or inject an
  `Authorization` header alone is not sufficient to mark Path B **VIABLE**. In
  addition, Path B must record whether it depends on stored OpenCode auth: if it
  reuses `auth.loader()`, it must specify the auth record type, creation API,
  persistence lifecycle, and measured evidence that the loader is invoked from
  stored auth; if it does not use `auth.loader()`, it must specify the exact
  public API that injects provider options or a custom `fetch` without a stored
  auth record. If Path B is selected, every credential-dependent section MUST be
  updated to remove any unconditional Path A contract. This includes §6.1, §6.3,
  §7, §8, §9, §10, §11, §12, §13, §14, §15, and §16.

With the current information, Path A and Path B0 are not viable, and no concrete
replacement candidate is under evaluation. No verified implementable credential
architecture is available. Therefore the ChatGPT-subscription provider design is
currently infeasible, and implementation planning MUST NOT start. Do not repeat
credential-candidate review unless new authoritative external evidence yields a
concrete candidate.

The 2026-09-16 runtime spike separately measured the public auth-loader seam
using a synthetic stored `api` auth record. The record was created with
`input.client.auth.set({ path: { id: "cf-ai-gw-relay" }, body: { type: "api", ... } })`,
after which OpenCode invoked `auth.loader()` and passed its returned custom
`fetch` to the AI SDK. This confirms only the transport-injection seam; the
synthetic API key is not a ChatGPT credential and does not close either Path A
or Path B.

### 7.1 Pre-implementation gate: OAuth client availability

A blocking spike was performed to identify a legitimate public OAuth client that
the `cf-ai-gw-relay` provider could use from a third-party OpenCode plugin. The
spike did **not** identify such a client. The only ChatGPT OAuth credential
available in the spike environment is OpenCode's built-in `openai` credential,
which is explicitly excluded from reuse by this design (see §3 Non-goals and §16
Resolved decisions).

Because no dedicated, third-party, public OAuth client for `cf-ai-gw-relay` was
confirmed, the following contract items remain undetermined for the dedicated
provider:

- The exact OAuth `client_id` to use and the party that owns the client.
- The legal/contractual basis under which `cf-ai-gw-relay` may use that client
  from a third-party OpenCode plugin.
- The authorization endpoint URL.
- The token endpoint URL.
- The exact scope list required for ChatGPT Codex access.
- The exact redirect URI.
- The loopback callback port and whether it is allowed by the registered client
  configuration.
- Whether the redirect URI must be pre-registered and whether the chosen port
  satisfies that registration.
- Any additional required OAuth parameters.
- Confirmation that the flow is a public-client (PKCE, no client secret) flow.
- Relevant license / terms-of-service prerequisites.
- The exact token from which the ChatGPT account ID is extracted and the exact
  precedence if multiple token or claim sources could yield different account
  IDs.
- The exact claim path(s) for the ChatGPT account ID in the chosen token(s),
  with the source token and precedence for each path.
- The exact token from which the Codex residency value is extracted and the
  exact precedence if multiple sources could yield different residency values.
- The exact claim path(s) for the Codex residency value in the chosen token(s),
  with the source token and precedence for each path.
- The exact value and semantics of the "no residency constraint" indicator.
- The behavior when an account ID claim is absent, malformed, or otherwise
  unusable.
- The behavior when a residency claim is absent or equals the "no constraint"
  value.
- Whether a decoded account ID is required for every Codex-bound request or
  optional.
- Confirmation that the chosen OAuth client actually returns the expected token
  shape and claims.

The spike observed the token shape of the **built-in OpenCode `openai`
credential** for reference only. That credential is not the dedicated provider's
client and must not be treated as its contract. Secret values are not recorded;
only the claim paths and reference values observed in the built-in token are
listed below.

#### Account / residency decision table (reference observation of built-in client)

| Aspect                                      | Account ID (built-in reference)                               | Residency (built-in reference)                            |
| ------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------- |
| source token(s)                             | `access_token` JWT from `https://auth.openai.com`             | `access_token` JWT from `https://auth.openai.com`         |
| exact claim path(s)                         | `https://api.openai.com/auth.chatgpt_account_id`              | `https://api.openai.com/auth.chatgpt_compute_residency`   |
| required / optional for Codex-bound request | unknown for dedicated provider                                | unknown for dedicated provider                            |
| absent claim behavior                       | unknown for dedicated provider                                | unknown for dedicated provider                            |
| malformed claim behavior                    | unknown for dedicated provider                                | unknown for dedicated provider                            |
| precedence across multiple tokens/claims    | only access token observed; no `id_token` present locally     | only access token observed; no `id_token` present locally |
| persisted / per-request                     | persisted in `accountId` (semantic value: `chatgptAccountId`) | per-request                                               |
| outbound header                             | `ChatGPT-Account-Id`                                          | `x-openai-internal-codex-residency`                       |
| header omission condition                   | when absent / optional                                        | when absent, malformed, or "no constraint" equivalent     |
| no-constraint value (observed)              | —                                                             | `no_constraint`                                           |
| refresh behavior                            | update per §7.4                                               | derive from new token per §7.4                            |

The cells marked **unknown for dedicated provider** cannot be filled without a
confirmed dedicated OAuth client. The pre-filled architectural choices
(persisted `accountId`, per-request residency, outbound headers, omission
conditions, refresh behavior) remain conditional on the dedicated-client spike
matching them; since no such client was found, they are unvalidated.

This gate is **FAILED / BLOCKED**. Until a legitimate public OAuth client is
obtained and its token contract is verified, the dedicated `cf-ai-gw-relay`
provider OAuth flow is unimplementable under this design. The design must be
abandoned or reworked. Until the gate is satisfied, §7.2–§7.4 do not describe an
implementation target; they describe the conditional contract that would apply
if a dedicated client is found.

### 7.2 OAuth flow sequence (conditional on §7.1 gate)

The sequence below applies **only if** the §7.1 OAuth client availability gate
is satisfied. With the current gate FAILED / BLOCKED, this section records the
conditional contract for a future spike, not an implementation target.

- `auth.provider` is `"cf-ai-gw-relay"`.
- `auth.methods` contains a method with `type: "oauth"` and a user-facing label.
- `authorize()` performs, in order:
  1. Generate PKCE code verifier and challenge with the runtime `crypto` API.
  2. Generate a cryptographically secure `state` parameter.
  3. Bind a loopback HTTP server to `127.0.0.1` on the fixed callback port
     reserved for `cf-ai-gw-relay` (not `1455`, which belongs to the built-in
     Codex flow). Confirm the bind succeeds before continuing.
  4. Register a pending callback Promise that resolves with the parsed
     authorization response or rejects on error / timeout / abort.
  5. Return the authorization URL, instructions, and a `method: "auto"` callback
     that awaits the already-registered pending callback result.
- The returned `callback()` does not start a new server; it awaits the pending
  callback Promise created by `authorize()`.
- The local server processes exactly one callback and then closes. It verifies
  the `state` parameter strictly and rejects mismatches.
- The callback exchanges the authorization code for tokens via a direct `fetch`
  to the token endpoint.
- Token refresh is handled inside `auth.loader()` using the stored refresh token
  and the public `input.client.auth.set()` SDK API.
- **Refresh single-flight contract:** concurrent requests that observe an
  expired access token share a single in-flight refresh per provider loader
  instance.
  1. The first request detects expiry and starts a single token refresh.
  2. Any other request that observes expiry while the refresh is in flight
     awaits the same in-flight refresh Promise instead of starting a new one.
  3. After the refresh succeeds and the new credentials are saved, all waiting
     requests use the new access token.
  4. If the token endpoint returns a rotated refresh token, it is saved exactly
     once.
  5. The in-flight Promise is cleared in a `finally`-equivalent path for both
     success and failure so that later requests can start a new refresh.
  6. On refresh failure, all waiting requests receive the same secret-free
     failure; no automatic retry and no direct-route fallback occur.
  7. Only the in-flight Promise is shared; no general lock framework or retry
     infrastructure is introduced.
- The custom `fetch` removes any existing `Authorization` header in a
  case-insensitive way, then injects the current access token as
  `Authorization: Bearer <access_token>`.
- `auth.loader()` returns a non-secret, plugin-local sentinel value for the AI
  SDK `apiKey` option. The sentinel is not a real credential, is not sent to any
  remote endpoint, and is used only so the AI SDK constructs a request and
  reaches the custom `fetch`. The actual ChatGPT OAuth token is provided by the
  custom `fetch` on every request.
- `OPENAI_API_KEY` MUST NOT be used as a credential source for this provider.
- OAuth `client_id` is the public client ID determined by §7.1. The built-in
  OpenAI/Codex `client_id` is not used unless the spike explicitly confirms
  permission and contract compatibility.

### 7.3 Callback server lifecycle and cleanup (conditional on §7.1 gate)

The lifecycle rules below apply **only if** the §7.1 OAuth client availability
gate is satisfied. With the current gate FAILED / BLOCKED, this section records
the conditional contract for a future spike, not an implementation target.

`authorize()` must create and bind the loopback server before returning the
authorization URL to the user. This eliminates a race where the browser redirect
reaches the port before the listener is ready.

Cleanup must run on every termination path:

- Successful token exchange.
- `state` mismatch or malformed callback.
- Token exchange failure.
- Timeout waiting for the callback.
- Abort or user cancellation.
- Unexpected exception inside `authorize()` or `callback()`.
- Plugin disposal.

The server and any pending Promise / timeout handle must be closed and released.
Concurrent OAuth attempts are not supported; a second attempt while one is
pending fails fast with a clear, secret-free error.

OAuth implementation uses only standard Web / Node APIs (`crypto`, `fetch`, the
built-in HTTP server). A dedicated OAuth framework is not added as a runtime
dependency.

### 7.4 ChatGPT account metadata (conditional on §7.1 gate)

The metadata rules below apply **only if** the §7.1 OAuth client availability
gate is satisfied. With the current gate FAILED / BLOCKED, this section records
the conditional contract for a future spike, not an implementation target.

The OAuth token response may contain claims that the built-in OpenCode Codex
provider uses to route requests. The dedicated provider must reproduce the
necessary semantics without depending on the built-in flow, using only public
OpenCode plugin APIs. The exact metadata contract is determined by the OAuth
client spike in §7.1; until that spike records concrete values, every bullet
below is a conditional target that follows the §7.1 decision table.

- After token exchange, decode the chosen token claims in a secret-free way to
  extract the ChatGPT account ID and, if present, the Codex residency value. The
  exact source token(s), claim path(s), and precedence are determined during the
  OAuth spike in §7.1.
- Store the **ChatGPT account ID** as the top-level `accountId` field of the
  OAuth auth object using `input.client.auth.set()` (public API), if and only if
  the §7.1 spike confirms that the account ID is both present and intended to be
  persisted. This field is part of the OpenCode public OAuth auth schema; its
  semantic name in this design is `chatgptAccountId`. The field name remains
  `accountId` only because the public schema requires that key.
- **Residency is not persisted in the OAuth auth object.** It is derived from
  the current access token on each Codex-bound request and cached only in memory
  for the lifetime of that request, if and only if the §7.1 spike confirms that
  the residency claim is present in the access token. If the spike determines
  residency lives in a different token, this derivation rule must be updated to
  use that token before the gate closes.
- On token refresh, store the new access token and refresh token via
  `input.client.auth.set()`. Update the persisted `accountId` (semantic value:
  `chatgptAccountId`) according to the §7.1 decision table: if the spike records
  that the account ID is required and the new token yields one, update it; if
  the spike records that the account ID is optional and the new token yields
  none, the existing persisted value may be preserved; if the spike records that
  the account ID is required and the new token yields none, the refresh must
  fail closed rather than forward a request without required routing metadata.
  Residency is not persisted; the next request derives it from the new token per
  the §7.1 decision table.
- The custom `fetch` sets `ChatGPT-Account-Id` from the top-level `accountId`
  field (semantic value: `chatgptAccountId`) on every Codex-bound request when
  an account ID is present and the §7.1 spike records that it should be sent.
- The custom `fetch` derives `x-openai-internal-codex-residency` from the
  current access token (or the token source recorded in §7.1) and sets it only
  when the value is present and not equal to the "no constraint" value recorded
  in §7.1; the header is omitted when there is no residency or when the spike
  records that the header should not be sent.
- If token claim decoding fails, the provider fails closed with a clear,
  secret-free error and does not forward a request without required routing
  metadata. What constitutes "required" is defined by the §7.1 spike (e.g.
  required account ID vs optional account ID vs required residency vs optional
  residency).
- Account IDs, residency values, decoded claims, and token payloads are never
  logged or emitted in errors.

Only account ID is persisted in the OAuth auth object (if the §7.1 spike records
that it is present and intended to be persisted); residency is derived
per-request from the token source recorded in §7.1. Other built-in headers are
not copied unless the spike or Codex contract provides a concrete reason.

## 8. Cloudflare AI Gateway / Relay Destination

- Gateway custom provider: created in the target Cloudflare account with slug
  `cf-ai-gw-relay` and `base_url` set to the deployed Deno relay HTTPS
  origin/root (e.g. `https://<relay-host>`), and enabled. The plugin does not
  provision this resource automatically; provisioning is a deployment
  prerequisite performed via Cloudflare Dashboard or API, or through the
  repository provisioning workflow after it is updated to enforce the slug
  invariant described below. `base_url` MUST be the relay root without
  `/upstream/openai/v1/responses`; Gateway appends the request path to this
  root. The `enable` flag is required to be `true` for requests to be routed.
- **MEASURED (2026-09-16):** A readonly production-account inspection confirmed
  that the target AI Gateway exists and has request logging enabled. The same
  inspection found no custom provider with slug `cf-ai-gw-relay`; therefore the
  required Gateway-to-relay mapping is not provisioned. This is deployment
  readiness evidence only. It does not close any §6.2 runtime compatibility
  item, does not establish a §7 credential source, and does not provide Codex or
  SSE acceptance evidence.
- Custom provider slug: fixed to `cf-ai-gw-relay` end-to-end. The slug is an
  invariant across the plugin provider contract, the Cloudflare AI Gateway
  custom provider record, the repository provisioning workflow, deployment and
  operations documentation, and acceptance configuration. Users cannot override
  it, and the production provisioning path must reject any other value.
- Relay authentication header: `x-relay-authorization: Bearer <relaySecret>`.
- Gateway URL ownership: the final request URL is produced by the AI SDK runtime
  using the provider's configured `baseURL`. The custom `fetch` MUST validate
  that the request URL matches the expected Gateway shape and MUST NOT rewrite
  the path to a different Gateway route. If the observed URL does not match the
  expected shape, the custom `fetch` fails closed with a clear, secret-free
  error before forwarding.
- Conceptual Gateway URL shape:

  ```text
  {gatewayOrigin}/v1/{cloudflareAccountId}/{gatewayId}/custom-cf-ai-gw-relay/upstream/openai/<upstream-path>
  ```

- The exact `<upstream-path>` is the pre-implementation request-generation
  contract recorded in §6.2 (currently `v1/responses`).
- The configured production `baseURL` has the §6.2 pre-implementation shape. The
  post-implementation acceptance gate verifies that its Gateway mapping reaches
  the deployed relay; planning does not depend on that deployment.
- Control headers added by the plugin:
  - `cf-aig-authorization: Bearer <gatewayToken>`
  - `x-relay-authorization: Bearer <relaySecret>`
  - `cf-aig-collect-log: true`
  - `cf-aig-collect-log-payload: true|false`
  - `cf-aig-metadata: {"source":"opencode","auth_type":"chatgpt_subscription","plugin":"cf-ai-gw-relay"}`
  - `cf-aig-skip-cache: true`
  - `cf-aig-max-attempts: 1`
- Credential propagation (shared): the selected §7 credential architecture
  determines the source of the upstream `Authorization` header and whether
  ChatGPT account or residency metadata is required. The selected upstream
  credential and required routing metadata pass through the Gateway and relay
  according to that contract. Gateway and relay control credentials MUST NOT
  reach Codex.
- Path A only: the plugin's custom `fetch` injects the ChatGPT OAuth access
  token after stripping any existing `Authorization` value, including the AI SDK
  sentinel `apiKey`. The token is passed through the Gateway to the relay and
  preserved for the upstream Codex request.
- Path A only: the `ChatGPT-Account-Id` and `x-openai-internal-codex-residency`
  headers defined by §7.4 are preserved and passed through.
- Path B only: the `Authorization` source, bootstrap mechanism, transport
  injection, and account/residency metadata follow the concrete Path B contract
  selected and measured under §7. The Path A OAuth-token and sentinel
  assumptions do not apply.
- Request body stream, abort signal, and method are preserved.
- Response body is streamed back without parsing or reconstruction, except for
  the limited Relay-origin error inspection described in §11.
- Provisioning alignment: the production provisioning path must be changed so
  that the custom provider slug is exactly `cf-ai-gw-relay`. The implementation
  plan for that change must cover, at minimum:

  - `.github/workflows/provision.yml` — remove or ignore the
    `workflow_dispatch.provider_slug` override and the
    `vars.CLOUDFLARE_PROVIDER_SLUG` variable for the custom-provider slug, and
    pass the literal value `cf-ai-gw-relay` to the provisioning helper (or fail
    closed if the configured value differs).
  - `.github/scripts/provision-cloudflare.ts` and any helpers — either hard-code
    `cf-ai-gw-relay` as the production slug or validate that the supplied slug
    is exactly `cf-ai-gw-relay` and fail closed otherwise.
  - `docs/configuration.md` — remove `RELAY_CF_PROVIDER_SLUG` and
    `providerSlug`; document that the slug is fixed.
  - `docs/deployment.md` and `docs/operations.md` — update typical/default
    identifiers and runbooks from the legacy slug (e.g. `relay-chatgpt`) to
    `cf-ai-gw-relay`, and add migration notes.
  - tests that exercise the provisioning helpers or workflow inputs must expect
    the fixed slug or expect fail-closed behavior for any other value.

  This design does not modify those files; it records the implementation
  obligation so that the future implementation plan does not omit it.

## 9. Deno Relay `/upstream/openai/v1/responses` Route

The Deno relay exposes a new fixed route for the OpenAI upstream. Every request
is evaluated by the total validation/fetch precedence in this section. The first
matching condition produces its response and no later condition is evaluated;
the relay performs no upstream fetch unless checks 1–6 pass. Non-matching is
methods, paths, and upstream slugs are rejected before any upstream fetch.

- Authentication: `x-relay-authorization: Bearer <RELAY_SECRET>`.
- Missing or incorrect `x-relay-authorization` from the client returns HTTP
  `401` with a JSON error body and never performs an upstream fetch.
- If `RELAY_SECRET` itself is missing, empty, or whitespace-only when a request
  is handled, the relay returns HTTP `503` with a JSON error body, does not
  start an upstream fetch, and distinguishes this configuration failure from a
  client credential mismatch. This error is also a documented Relay-origin error
  the plugin may translate; see §11.
- The relay reads `RELAY_SECRET` at request time; the value is never logged or
  returned in the error body.
- Relay-origin error generation: every synthetic Relay-origin error response
  generated by the relay MUST use the `application/json` media type and the
  exact JSON envelope `{"origin":"relay","error":"<documented-code>"}`. The
  canonical generated header value is `Content-Type: application/json`. The
  shared producer/consumer contract parses `Content-Type` as a media type: the
  media type token is compared case-insensitively and valid media-type
  parameters, including `charset`, are ignored. Therefore `application/json`,
  `application/json; charset=utf-8`, and `APPLICATION/JSON` are candidates,
  while `text/json` and `text/plain` are non-candidates. The HTTP status, JSON
  body, and documented `error` code remain exact matching requirements.
- Upstream destination: `https://chatgpt.com/backend-api/codex/responses`.
- Upstream fetch: the relay MUST use `redirect: "manual"`. It MUST NOT follow
  automatic redirects. The relay performs exactly one fetch per request. The
  following upstream status handling applies before the response is returned to
  the Gateway, so no network layer between the relay and OpenCode can issue a
  redirected second fetch that bypasses Gateway/Relay:
  - `304 Not Modified` is passed through with an empty body; conditional request
    headers (`If-None-Match`, `If-Modified-Since`) remain available to the
    upstream.
  - All other 3xx responses (`300`, `301`, `302`, `303`, `305`, `306`, `307`,
    `308`) are converted to a Relay-origin `502` with a JSON error body. The
    upstream `Location`, headers, and body are NOT returned. This prevents any
    client, Gateway, or transport layer from following the redirect and sending
    credentials to a destination outside the fixed Gateway/Relay/Codex path.
  - No second upstream fetch is performed for any redirect response.
- Request header sanitization (before the upstream Codex fetch): remove the
  relay-only, Gateway-only, hop-by-hop, and forwarding headers. The denylist is:
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
  - all `cf-aig-*` headers
  - all `cf-*` headers
  - all `x-forwarded-*` headers
  - every header named by the comma-separated `Connection` header tokens. The
    standard upstream `Authorization` header is NOT removed; its value is
    supplied according to the selected §7 credential architecture and MUST
    remain available to authenticate the ChatGPT Codex upstream. Codex routing
    metadata, including `ChatGPT-Account-Id` and residency, is preserved only
    when required by the selected §7 credential contract. The relay secret MUST
    terminate at the relay.
- Response header sanitization: before returning any upstream or synthetic
  response to the Gateway, remove hop-by-hop response headers and every header
  named by the comma-separated `Connection` header tokens. This applies to
  success responses, `304 Not Modified`, Relay-origin errors, and converted
  `502 upstream_redirect_not_allowed` responses.
- Body: forward the request body as received unless the credential-gated
  pre-implementation protocol gate in §6.2.3 records a minimum required relay
  request mapping. The implementation plan MUST implement that recorded mapping
  with TDD; it MUST NOT discover or expand the mapping during implementation.
- Streaming / response body: forward the upstream response stream unchanged
  unless the credential-gated pre-implementation protocol gate in §6.2.3 records
  a minimum required response/SSE mapping. The implementation plan MUST
  implement that recorded mapping with TDD; it MUST NOT discover or expand the
  mapping during implementation.
- Abort: propagate the inbound abort signal to the upstream `fetch`.
- Timeouts: preserve the existing connect/header timeout and SSE idle timeout
  behavior.
- Total validation/fetch precedence (all requests are evaluated in this order;
  the first matching rule produces its response and no later rule is evaluated):

  1. Relay runtime configuration: `RELAY_SECRET` must be present, non-empty, and
     not whitespace-only at request time. Otherwise return `503`
     `relay_not_configured`.
  2. Method: the method must be `POST`. Otherwise return `405`
     `unsupported_method`.
  3. Path grammar: the URL pathname must start with `/upstream/`, contain
     exactly one non-empty `{provider-slug}` segment, and contain the
     `/v1/responses` segment sequence immediately after that segment. A pathname
     that lacks this required shape returns `404` `unsupported_path`; pathname
     segments after `/v1/responses` are checked at step 5.
  4. Provider slug: the extracted `{provider-slug}` must be exactly `openai`.
     Otherwise return `404` `unsupported_upstream`.
  5. Extra path/query: no pathname segment may follow `/v1/responses`, and no
     query parameters are permitted. If either is present, return `404`
     `unsupported_path`.
  6. Relay request authentication: `x-relay-authorization` must carry the
     configured bearer credential. If it is missing or incorrect, return `401`
     `unauthorized`.
  7. Upstream fetch: only after steps 1–6 pass, perform exactly one fetch to the
     fixed upstream. Apply the upstream status/redirect handling below; no
     pre-upstream failure reaches this step.

  Examples (with a valid `RELAY_SECRET` and a correct request authentication
  header):

  | Request path                          | HTTP status | Relay-origin error code |
  | ------------------------------------- | ----------- | ----------------------- |
  | `/upstream/openai/v1/responses`       | `200`       | (upstream)              |
  | `/foo`                                | `404`       | `unsupported_path`      |
  | `/upstream/anthropic/v1/responses`    | `404`       | `unsupported_upstream`  |
  | `/upstream/anthropic/foo`             | `404`       | `unsupported_path`      |
  | `/upstream/openai/v1/responses/extra` | `404`       | `unsupported_path`      |
  | `/upstream/openai/v1/responses?x=1`   | `404`       | `unsupported_path`      |

  Overlapping-failure examples (the winning rule is returned and no upstream
  fetch is performed):

  | Failure combination                                   | Winning rule                  | Result                         |
  | ----------------------------------------------------- | ----------------------------- | ------------------------------ |
  | `GET /upstream/openai/v1/responses` + missing auth    | method, before auth           | `405` / `unsupported_method`   |
  | `POST /foo` + missing auth                            | path grammar, before auth     | `404` / `unsupported_path`     |
  | `POST /upstream/anthropic/v1/responses` + wrong auth  | provider slug, before auth    | `404` / `unsupported_upstream` |
  | Missing `RELAY_SECRET` + `POST /foo`                  | runtime configuration, first  | `503` / `relay_not_configured` |
  | `POST /upstream/openai/v1/responses?x=1` + wrong auth | extra path/query, before auth | `404` / `unsupported_path`     |
- Relay-generated error table (pre-upstream rows follow the total precedence
  above; upstream fetch is attempted only after checks 1–6 pass):

  | Condition                                                           | HTTP status | Relay-origin error code         | Phase                          | Notes                                                                 |
  | ------------------------------------------------------------------- | ----------- | ------------------------------- | ------------------------------ | --------------------------------------------------------------------- |
  | `RELAY_SECRET` missing, empty, or whitespace-only at request time   | `503`       | `relay_not_configured`          | pre-upstream                   | First check; no later validation or upstream fetch.                   |
  | Method other than `POST`                                            | `405`       | `unsupported_method`            | pre-upstream                   | Second check; includes `GET`, `PUT`, `DELETE`, etc.                   |
  | Path grammar does not match the required route shape                | `404`       | `unsupported_path`              | pre-upstream                   | Third check.                                                          |
  | Provider slug other than `openai`                                   | `404`       | `unsupported_upstream`          | pre-upstream                   | Fourth check; no generic proxying.                                    |
  | Extra pathname segment after `/v1/responses` or any query parameter | `404`       | `unsupported_path`              | pre-upstream                   | Fifth check.                                                          |
  | Missing or incorrect `x-relay-authorization`                        | `401`       | `unauthorized`                  | pre-upstream                   | Sixth check; see §11.                                                 |
  | Upstream redirect other than `304 Not Modified`                     | `502`       | `upstream_redirect_not_allowed` | post-upstream, after one fetch | Converted from Codex 3xx; no second fetch; `Location` is not exposed. |
- The legacy `POST /v1/responses` route is removed with no backward
  compatibility.

## 10. Configuration Schema, Environment Variables, and Precedence

### 10.1 Required provider options

Under `provider.cf-ai-gw-relay.options`:

- `cloudflareAccountId` — Cloudflare account ID.
- `gatewayId` — Cloudflare AI Gateway ID.
- `gatewayToken` — Cloudflare AI Gateway authentication token.
- `relaySecret` — Shared relay bearer secret.

No ChatGPT credential option or environment variable is selected while the §7
credential-source gate is `BLOCKED`. Path A credential fields and lifecycle
rules remain conditional on that gate; Path B fields MUST NOT be invented in
this configuration contract before a concrete Path B candidate is selected.

### 10.2 Optional provider options

- `collectLogPayload` — boolean, default `true`.
- `gatewayBaseUrl` — primarily for testing; overrides the production Gateway
  origin.

### 10.3 Environment variables

- `RELAY_CF_ACCOUNT_ID`
- `RELAY_CF_GATEWAY_ID`
- `RELAY_CF_AIG_TOKEN`
- `RELAY_SECRET`
- `RELAY_CF_AIG_COLLECT_LOG_PAYLOAD`
- `RELAY_CF_AIG_BASE_URL`
- `RELAY_CF_AIG_TEST_MODE`

### 10.4 Rules

- The Gateway custom provider slug is fixed internally to `cf-ai-gw-relay`;
  users cannot override it. `RELAY_CF_PROVIDER_SLUG` is removed.
- The old plugin option `apiKey` is not an alias for `gatewayToken`.
- Precedence: environment variables win over `opencode.json[c]` values.
- Validation is deferred until a `cf-ai-gw-relay/*` model is actually used.
  Missing required settings produce a clear, secret-free error.
- `gatewayBaseUrl` is accepted only when `RELAY_CF_AIG_TEST_MODE=true` and the
  origin is exactly `https://gateway.test.invalid`, matching the existing
  fail-closed test override policy.
- `cloudflareAccountId` resolves from `RELAY_CF_ACCOUNT_ID` (environment) or
  `provider.cf-ai-gw-relay.options.cloudflareAccountId` (`opencode.json[c]`),
  with the environment variable winning. It is used only for Gateway URL path
  construction and must never be treated as a ChatGPT account ID.
- The selected §7 credential architecture determines the source, storage, and
  outbound use of ChatGPT account metadata. Under Path A, the public OAuth auth
  top-level `accountId` field is the ChatGPT account ID (semantic name:
  `chatgptAccountId`). It is used only for the outbound `ChatGPT-Account-Id`
  header and must never be treated as a Cloudflare account ID or used in Gateway
  URL construction. Under Path B, the corresponding source and storage semantics
  MUST be recorded in the concrete Path B contract and MUST NOT be assumed to be
  an OAuth `accountId` field.
- Any Path B credential option, environment variable, persisted field, or
  masking rule required by the selected architecture MUST be added to this
  configuration contract before the credential-source gate closes.

## 11. Fail-closed and Error Handling

- A request routed to `cf-ai-gw-relay/*` never automatically falls back to
  `openai/*`.
- Error categories surfaced to the user include:
  - Cloudflare AI Gateway error,
  - relay error / unauthorized,
  - relay configuration error,
  - network error,
  - authentication or credential lifecycle error (credential not configured,
    expired, rotated, or rejected),
  - unsupported upstream provider,
  - request adaptation error,
  - OpenCode version incompatibility.
- The plugin does **not** translate arbitrary upstream or Gateway error bodies.
  It forwards the HTTP status and response body unchanged to the AI SDK runtime,
  which is responsible for presenting the error to OpenCode.
- The only bodies the plugin may inspect are explicitly documented synthetic
  Relay-origin error responses generated by this relay. They may be generated
  either before upstream fetch, for local validation/auth/configuration
  failures, or after exactly one upstream fetch, when the relay intentionally
  converts a forbidden upstream condition such as a non-304 redirect. The plugin
  identifies a Relay-origin error only when **all** of the following conditions
  are satisfied:
  - HTTP status is one of the documented Relay-origin statuses in §9.
  - Parse the `Content-Type` header as a media type. Its media type token must
    be `application/json`, compared case-insensitively; valid media-type
    parameters, including `charset`, are ignored. A missing or syntactically
    invalid header, or a different media type, is not a candidate. Thus
    `application/json`, `application/json; charset=utf-8`, and
    `APPLICATION/JSON` are candidates; `text/json` and `text/plain` are not.
  - Identification is performed without consuming or disturbing the original
    response body. The plugin may use `response.clone()` (or an equivalent
    implementation-specific mechanism) to create an independent probe stream for
    reading and parsing.
  - The parsed JSON body must be exactly the documented Relay-origin envelope
    `{"origin":"relay","error":"<code>"}`, and the HTTP status / `error` code
    pairing must match the table below exactly. Content-Type media-type
    canonicalization does not relax body, status, or error-code matching.

  Documented Relay-origin error codes and their HTTP statuses:

  | `error` code                    | HTTP status | Produced when                                                         |
  | ------------------------------- | ----------- | --------------------------------------------------------------------- |
  | `unauthorized`                  | `401`       | Missing or incorrect `x-relay-authorization`.                         |
  | `relay_not_configured`          | `503`       | `RELAY_SECRET` is missing, empty, or whitespace-only at request time. |
  | `unsupported_method`            | `405`       | Method is not `POST`.                                                 |
  | `unsupported_path`              | `404`       | Path grammar mismatch or extra pathname/query present.                |
  | `unsupported_upstream`          | `404`       | Upstream slug is not `openai`.                                        |
  | `upstream_redirect_not_allowed` | `502`       | Codex returned a 3xx other than `304 Not Modified`.                   |

  For these responses the plugin may read up to 8 KiB of the **probe body**,
  translate the documented code into an actionable, secret-free OpenCode user
  error, and return a synthetic `Response` so that the calling runtime still
  receives a valid response object. The original response body is **not**
  consumed, disturbed, or canceled by the probe.

- Probe termination contract: the probe reads the independent probe stream until
  the earliest of the following conditions. The byte limit and time limit are
  guards, not success requirements.

  1. `EOF` is reached.
  2. More than 8 KiB of body data would be required to continue reading.
  3. 500 ms of wall-clock time have elapsed since the first probe read.
  4. A read error, cancellation, or other I/O failure occurs.

  Outcome:

  - `EOF` reached with the total probe body at or below 8 KiB and within the 500
    ms budget -> parse the body as JSON and perform exact envelope/status/code
    matching against the table above. Only an exact match produces a translated
    synthetic `Response`.
  - Body would exceed 8 KiB before `EOF` -> treat as a non-match; return the
    original `Response` untouched.
  - 500 ms expires before `EOF` -> treat as a non-match; return the original
    `Response` untouched.
  - Read error or cancellation -> treat as a non-match; return the original
    `Response` untouched and clean up probe resources.

  A small, valid Relay-origin JSON body (for example, a few hundred bytes) that
  reaches `EOF` well before the byte and time limits must therefore be parsed
  and matched; it must not be treated as a non-match simply because it did not
  consume the full 8 KiB budget.
- Probe cancellation and cleanup: the probe uses an `AbortSignal` or
  implementation-equivalent cancellation mechanism tied to the probe time
  budget. When the probe ends, on match, non-match, timeout, or error, the probe
  reader and any cloned body stream are canceled or released, and any probe
  timers are cleared. The original response body stream is never canceled by the
  probe; it remains available for normal pass-through.
- Any `4xx`/`5xx` response that does not match the exact Relay-origin envelope
  above is **not** translated, even when its `Content-Type` parses to the
  `application/json` media type. Gateway errors, Codex errors, and upstream
  provider errors are passed through **byte-for-byte unchanged**, including the
  original response body stream. The probe stream is canceled/discarded without
  affecting the original body.
- Success responses and SSE streams are never cloned, inspected, buffered, or
  reconstructed.
- Credential acquisition, refresh, or rotation failures never fall back to a
  direct route. The selected §7 credential architecture defines whether each
  lifecycle operation exists and how its failure is surfaced; all such failures
  remain fail closed and secret-free.
- Path A only: OAuth refresh failures distinguish re-authentication needs from
  transient refresh failures where possible.
- Secrets, tokens, authorization headers, and request/response payloads are
  never included in error messages or logs.
- Non-destructive probe contract:
  1. Responses whose status is not a documented Relay-origin status, or whose
     `Content-Type` is missing, invalid, or parses to a media type other than
     `application/json`, are returned without any body read, clone, or
     inspection.
  2. Candidate responses are probed using a cloned or equivalent independent
     body stream; the original response stream is not disturbed.
  3. The 8 KiB bound applies to the probe stream only.
  4. Malformed JSON, `origin !== "relay"`, undocumented `error` codes,
     status/code mismatches, oversized probe bodies, and probe read failures are
     all treated as non-matches. In each case the original response is returned
     completely untouched.
  5. Only an exact documented Relay-origin match causes the original response to
     be replaced by a synthetic translated `Response`.
  6. Probe resources (streams, readers, timers, handles) are cleaned up on the
     match, non-match, and error paths.
  7. The probe time budget is 500 ms wall-clock from the first probe read. A
     probe that exceeds this budget is treated as a non-match; the original
     response is returned untouched.
  8. Probe cancellation, reader release, and timer cleanup run on every probe
     exit path (match, non-match, timeout, malformed JSON, oversized body, or
     read failure).
  9. The original response body stream is never canceled, consumed, or disturbed
     by the probe; only the independent probe stream is read.
  10. The 8 KiB bound is a maximum, not a minimum: a candidate body that reaches
      `EOF` within the byte and time limits is parsed and matched exactly; it is
      never rejected for being smaller than 8 KiB.

## 12. Secret Handling

No credential acquisition, storage, refresh, or rotation contract is active
while the §7 credential-source gate is `BLOCKED`. The Path A rules below are
conditional only, and a future Path B contract must define its own secret
boundary before any implementation or setup guidance is published.

- Any secret credential selected by the §7 credential architecture MUST never be
  logged, emitted in errors, or included in public fixtures. This covers the
  concrete Path B credential form as well as Path A credentials.
- Under Path A, the ChatGPT OAuth access token and refresh token are secret
  credentials covered by the rule above.
- The plugin and Deno relay MUST never log, emit in errors, or include in public
  fixtures:
  - `Authorization` header value,
  - `x-relay-authorization` header value,
  - Cloudflare Gateway token (`cf-aig-authorization`),
  - relay secret,
  - ChatGPT account ID and residency values,
  - decoded token claims.
- The plugin and Deno relay MUST never log or emit in errors:
  - request and response payloads.
- `relaySecret` / `x-relay-authorization` MUST terminate at the relay and MUST
  NOT reach ChatGPT Codex or any other upstream.
  - Gateway-only control headers (`cf-aig-*`) and Cloudflare-internal headers
    (`cf-*`, `x-forwarded-*`) MUST NOT reach ChatGPT Codex.
- Cloudflare AI Gateway payload logging is controlled exclusively by
  `collectLogPayload` / `cf-aig-collect-log-payload`. When
  `collectLogPayload=true`, request/response payloads may be retained in
  Cloudflare AI Gateway logs according to Cloudflare's configured logging
  behavior. This exception does not permit the plugin or Deno relay to log
  payloads.
- `collectLogPayload=true` is an intentional production default: users who want
  to prevent Cloudflare AI Gateway from retaining payloads set
  `collectLogPayload=false` or `RELAY_CF_AIG_COLLECT_LOG_PAYLOAD=false`.

## 13. Post-implementation Acceptance and Production Readiness

The post-implementation acceptance gate is executed only after the candidate is
implemented and deployed to a non-production or protected environment. It is not
a prerequisite for implementation planning. The §7 credential-source gate and
the §6.2.3 credential-gated pre-implementation protocol gate MUST already be
closed. Before declaring the new provider model production-ready, verify:

- The §6.2.2 post-implementation acceptance gate is closed. The §7 credential-
  source path is closed:
  - Path A: §7.1 dedicated OAuth-client gate is satisfied.
  - Path B: the replacement credential architecture is fully specified,
    measured, and approved, including the `auth.loader()` dependency decision
    recorded in §6.3.
- The §6.2.3 protocol gate is closed with a concrete native Codex model ID, wire
  model mapping, request mapping, response/SSE mapping, and applicable
  tool-continuation mapping. Production-shaped acceptance verifies this fixed
  contract; it does not discover a new model ID or adaptation boundary.
- Request isolation between `openai/*` and `cf-ai-gw-relay/*` traffic.
- Credential handling (shared): secret-free errors, storage/refresh/rotation
  ownership, and outbound header sources are recorded for the selected §7 path.
- Credential handling (Path A only): OAuth flow, token refresh single-flight,
  account metadata persistence, residency derivation per request.
- Credential handling (Path B only): the concrete credential architecture
  (credential owner, acquisition method, OpenCode public API boundary, storage,
  refresh/rotation ownership, `chatgptAccountId` source, residency source,
  outbound headers, user login/setup flow, failure handling, and security
  boundary) is documented and measured, and evidence confirms that the
  credential owner and applicable provider terms authorize the intended
  third-party Gateway/relay use.
- AI SDK bootstrap (Path A): provider uses a non-secret sentinel `apiKey` and
  custom `fetch` replaces it with the current OAuth token; `OPENAI_API_KEY` is
  not used. Path B: bootstrap mechanism recorded for the chosen credential
  architecture.
- Cloudflare AI Gateway custom provider `cf-ai-gw-relay` exists, is enabled, and
  maps the Gateway URL to the deployed Deno relay root.
- Streaming and abort propagation end-to-end.
- Error propagation: relay/Gateway/network/provider failures reach the user
  without fallback.
- Fail-closed behavior under all failure modes.
- Unsupported upstream/path/method handling.
- Relay configuration failure (`RELAY_SECRET` absent/empty/whitespace) returns
  `503` before any upstream fetch and is distinguishable from client
  authentication failure (`401`).
- Upstream redirect policy: `redirect: "manual"`; the relay performs exactly one
  fetch per request. `304 Not Modified` is passed through with an empty body.
  All other Codex 3xx responses are converted to Relay-origin `502`
  `upstream_redirect_not_allowed` before pass-through; the upstream `Location`,
  headers, and body are not exposed; no second fetch occurs at any network
  layer.
- Gateway URL ownership is the AI SDK runtime's configured `baseURL`; the custom
  `fetch` does not rewrite the URL.
- Supported OpenCode version boundary validated by an integration test using the
  real `@opencode-ai/plugin` package. The chosen minimum OpenCode version, the
  intended `engines.opencode` range, and the intended `@opencode-ai/plugin`
  peerDependency range are recorded once §6.2 pre-implementation design evidence
  closes, and must be identical across the design, package metadata, and test
  target before production readiness is declared. Both declared ranges have a
  finite released upper bound; a range that includes future releases is not
  supported by a one-time compatibility spike.
- The provisioned Cloudflare AI Gateway custom provider slug is exactly
  `cf-ai-gw-relay`; the plugin runtime and provisioning workflow both enforce
  this value.

## 14. Testing Strategy

- Plugin tests use Vitest. Relay tests use Deno built-in test runner.
- Pre-implementation design evidence uses disposable harnesses and real-package
  tests without candidate source or deployment. After the §7 credential gate
  closes, the §6.2.3 protocol characterization uses the selected credential path
  and closes the native model, request, response/SSE, and applicable tool
  contract before planning. Post-implementation acceptance uses the implemented
  candidate and protected deployment to verify that fixed contract. The latter
  is not a prerequisite for writing the implementation plan.
- The synthetic stored `api` auth record used by the runtime spike is transport-
  seam evidence only. It is not a ChatGPT credential and MUST NOT count as
  evidence for credential ownership, permission, acquisition, or lifecycle.
- **Shared tests** (required regardless of the selected §7 credential-source
  path):
  - configuration resolution, precedence, deferred validation, and secret
    masking,
  - Gateway URL construction,
  - control-header application,
  - provider/model definition merging,
  - unsupported-upstream detection,
  - custom `fetch` URL validation and header replacement/application using the
    shape recorded for the selected §7 path,
  - custom `fetch` does not change the request pathname,
  - custom `fetch` rejects a URL that does not match the expected Gateway shape,
  - selected-baseline identity/version assertions from §6.2.4: bare
    `provider.npm = "@ai-sdk/openai"`, bundled-provider loading under OpenCode
    1.18.31, bundled `@ai-sdk/openai@3.0.88` / `LanguageModelV3`,
    `cf-ai-gw-relay` to `openai` provider-options remapping, and activation of
    the applicable OpenAI/Responses-specific identity-sensitive transforms,
  - Protocol contract tests (added per SRG-002):
    - the §6.2.3 protocol gate records whether the AI SDK-generated request body
      uses `input` (not `messages`) for the Responses API conversation field and
      matches the Codex endpoint contract directly;
    - if the protocol gate records a transformation requirement, the exact relay
      field mapping transforms it correctly and the design records the
      before/after contract, response/SSE transformation, tool semantics,
      streaming/abort implications, and error behavior on transformation
      failure;
    - exact request path and method are `POST /upstream/openai/v1/responses`;
      other methods/paths return a Relay-origin error before upstream fetch.
  - Relay-origin error envelope tests (added per SRG-006; extended per SRG-029):
    - each documented Relay-origin error returns the exact envelope
      `{"origin":"relay","error":"<code>"}` with the documented status,
    - every synthetic Relay-origin error generated by the relay uses the
      canonical `Content-Type: application/json` media type,
    - plugin candidate classification parses `Content-Type` as a media type:
      - `application/json` -> candidate,
      - `application/json; charset=utf-8` -> candidate,
      - `APPLICATION/JSON` -> candidate,
      - `text/json` -> non-candidate,
      - `text/plain` -> non-candidate,
    - for every candidate Content-Type, translation still requires the exact
      JSON envelope and exact documented status/error-code pair; mismatches are
      passed through untouched,
    - the plugin translates only the documented codes,
    - `relay_not_configured` (`503`) is distinguished from `unauthorized`
      (`401`),
    - `upstream_redirect_not_allowed` (`502`) is generated after exactly one
      Codex fetch and is recognized as a Relay-origin error,
    - arbitrary Codex/Gateway `502` responses without the Relay-origin envelope
      are passed through unchanged,
    - Gateway, Codex, and upstream `400`/`401` JSON bodies are passed through
      without translation,
    - JSON bodies without `origin: "relay"` are not treated as Relay-origin
      errors,
    - malformed or oversized Relay-like bodies are bounded and secret-free,
    - **non-destructive probe tests**:
      - Gateway/Codex JSON error with a documented Relay-origin status but no
        `origin: "relay"` is passed through byte-for-byte unchanged; the
        original body remains fully readable,
      - an undocumented relay-like JSON body is passed through untouched,
      - a malformed JSON candidate body is passed through untouched,
      - an oversized candidate body (> 8 KiB) causes the probe to stop/cancel
        and the original response body to remain fully readable,
      - a probe read failure is treated as a non-match and the original response
        is returned completely untouched; no synthetic translated error is
        created,
      - a candidate JSON response whose body is slow or non-terminating is
        probed only for 500 ms; when the probe budget expires the probe is
        treated as a non-match and the original response body remains fully
        readable,
      - probe timeout, read failure, or cancellation does not leak resources;
        the probe reader and any cloned body stream are released and timers are
        cleared,
      - an exact documented Relay-origin body is translated to a synthetic
        `Response`; the original body is not returned,
      - success/SSE responses are never cloned or read by the probe.
  - Upstream redirect policy tests (added per SRG-012):
    - Codex upstream 301/302/303/307/308 do not trigger a second fetch,
    - Plugin/Gateway transport performs no redirected second fetch (the relay
      converts non-304 3xx to `502` before the response leaves the relay),
    - `304 Not Modified` follows the explicitly documented empty-body
      pass-through contract;
    - non-304 3xx are converted to Relay-origin `502`
      `{"origin":"relay","error":"upstream_redirect_not_allowed"}`;
    - upstream `Location` is not exposed for forbidden redirect responses;
    - `Authorization` / `x-relay-authorization` / `cf-aig-*` are never sent to a
      redirect target;
    - automatic redirect follow is disabled (`redirect: "manual"`).
  - Relay configuration failure tests (added per SRG-011):
    - `RELAY_SECRET` absent -> `503` / no upstream fetch,
    - empty -> `503` / no upstream fetch,
    - whitespace-only -> `503` / no upstream fetch,
    - configured secret + missing request header -> `401`,
    - configured secret + wrong request header -> `401`,
    - configuration failure body does not include the secret value.
  - Total pre-upstream precedence tests (added per SRG-030):
    - invalid method + missing auth -> `405` / `unsupported_method`,
    - invalid path + missing auth -> `404` / `unsupported_path`,
    - unsupported upstream + wrong auth -> `404` / `unsupported_upstream`,
    - missing `RELAY_SECRET` + malformed route -> `503` /
      `relay_not_configured`,
    - extra path/query + wrong auth -> `404` / `unsupported_path`,
    - every winning pre-upstream case performs no upstream fetch; a request that
      passes all six checks invokes exactly one upstream fetch.
  - Custom `fetch` URL ownership tests (added per SRG-013):
    - the AI SDK runtime uses the configured `baseURL` to produce the final
      Gateway URL,
    - the custom `fetch` does not change the request pathname,
    - `/v1` / `/responses` segments are not duplicated,
    - a URL that does not match the expected Gateway shape fails closed before
      forwarding.
  - Model-ID mapping tests (added per SRG-016):
    - fixtures deliberately distinguish the visible OpenCode model key
      (`cf-ai-gw-relay/openai/<model>`), the parsed OpenCode `modelID`
      (`openai/<model>`), the config `model.id`, the config `model.api.id`, the
      final model ID passed to the AI SDK factory, and the request body `model`
      field;
    - tests assert that the `openai/` prefix is **not** automatically stripped
      by the OpenCode runtime and that any required mapping is explicit in the
      provider config (`model.id` / `model.api.id`).
    - `/models` or the OpenCode model selector surfaces
      `cf-ai-gw-relay/openai/<model>` for selection;
    - the request body `model` field contains the final AI SDK model ID, which
      may differ from the visible key and from the parsed `modelID`;
    - user-defined models under the `cf-ai-gw-relay` provider follow the same
      explicit mapping rule;
    - if the selected model cannot be mapped to a final model ID, the provider
      fails closed before any upstream fetch.
  - Request/response header sanitization tests (added per SRG-015):
    - inbound `x-relay-authorization` is not present in the Codex fetch headers,
    - legacy `x-chatgpt-relay-authorization` is also removed before upstream,
    - `cf-aig-*`, `cf-*`, and `x-forwarded-*` headers are removed,
    - hop-by-hop denylist headers (`connection`, `content-length`, `te`, etc.)
      are removed,
    - `Connection: foo, bar` causes both `foo` and `bar` to be removed,
    - the outbound `Authorization` header source recorded for the selected §7
      path is preserved,
    - the account/residency metadata required by the selected §7 credential
      contract is preserved,
    - response hop-by-hop and `Connection`-token headers are removed before
      downstream delivery,
    - tests and logs do not emit the secret values used in headers.
  - Cloudflare / ChatGPT account identifier isolation tests (added per SRG-031;
    the ChatGPT-side assertions follow the selected §7 credential contract):
    - the Cloudflare account ID (`cloudflareAccountId`) is used only in the
      Gateway URL path (`/v1/{cloudflareAccountId}/{gatewayId}/...`); it never
      appears in `ChatGPT-Account-Id` or any other ChatGPT-bound header;
    - if the selected credential contract requires or permits a ChatGPT account
      ID (`chatgptAccountId`), tests assert that it is used only in the
      `ChatGPT-Account-Id` header when the contract requires that header, and
      never in the Gateway URL path;
    - when both identifiers apply, fixture values are deliberately different so
      that accidental substitution is detectable; tests fail if the values are
      equal or if either identifier is used in the wrong location;
    - if the selected credential contract does not define a ChatGPT account ID,
      tests assert that no account ID is synthesized or sent and that no
      `ChatGPT-Account-Id` header is required by the provider;
    - custom `fetch` URL validation rejects any Gateway URL whose path account
      placeholder does not match the configured `cloudflareAccountId`.
- **Path A tests** (conditional on §7.1 dedicated OAuth-client gate
  satisfaction):
  - OAuth PKCE/state/callback/token-exchange helpers,
  - callback server bind-before-return and cleanup paths,
  - OAuth token claim/refresh and account/residency metadata semantics.
  - OAuth and Codex account metadata tests (added per SRG-003):
    - `accountId` persistence and refresh semantics follow the §7.1 decision
      table. The tests exercise the concrete rules recorded there: required vs
      optional account ID, claim source and precedence, and the refresh failure
      cases for missing required account ID. The persisted `accountId` field is
      the ChatGPT account ID (semantic name: `chatgptAccountId`); it is never
      used as the Cloudflare account ID.
    - residency derivation follows the §7.1 decision table. The tests exercise
      the concrete token source and claim path recorded there, including the
      case where the residency source is a token other than the access token.
    - `ChatGPT-Account-Id` is set when a ChatGPT account ID is present and the
      §7.1 spike records that it should be sent; omitted otherwise.
    - `x-openai-internal-codex-residency` is set when a non-empty,
      non-`no_constraint` residency is derived and the §7.1 spike records that
      it should be sent; omitted otherwise.
    - malformed token claims fail secret-free without leaking the token.
    - account/residency headers survive the Gateway/Relay hop unchanged.
    - for Path A, the ChatGPT account ID is persisted in the public OAuth auth
      top-level `accountId` field.
  - Token claim contract tests (added per SRG-014):
    - the §7.1 spike documents exact account ID / residency claim paths,
    - fixtures use synthetic claim objects only; no real token payloads or
      secrets are included in public tests.
  - AI SDK bootstrap tests (added per SRG-008):
    - `OPENAI_API_KEY` being unset does not prevent the request from reaching
      the custom `fetch`,
    - `OPENAI_API_KEY` set to any value is ignored and never reaches Gateway or
      relay,
    - outbound Gateway request uses only the current ChatGPT OAuth token in the
      `Authorization` header,
    - the sentinel `apiKey` value does not leave the plugin process,
    - after token refresh the new OAuth token is used without changing the
      static provider `apiKey`,
    - old `Authorization` is removed from `Headers`, tuple-array, and record
      inputs before the OAuth token is injected.
  - Refresh single-flight tests (added per SRG-007):
    - concurrent refresh:
      - N concurrent requests observe the same expired auth -> the token
        endpoint is called exactly once,
      - all waiters use the same newly persisted access token,
      - a rotating refresh token is persisted exactly once,
      - the persisted `accountId` (semantic value: `chatgptAccountId`) update is
        based on the single successful refresh result,
      - on refresh failure all waiters receive the same secret-free failure; no
        direct fallback and no automatic retry storm,
      - after failure completion the in-flight state is cleared so a later
        request may start a fresh refresh attempt,
      - only the in-flight Promise is shared; no general lock framework or retry
        infrastructure is introduced.
- **Path B tests** (conditional on the selected Path B credential architecture):
  - the concrete credential lifecycle and transport injection path recorded for
    the selected architecture;
  - credential acquisition, storage, rotation/refresh, transport injection,
    Authorization source, chatgptAccountId source, residency source, and setup
    lifecycle;
  - the `auth.loader()` dependency decision recorded in §6.3:
    - if Path B reuses `auth.loader()`, the auth record type, creation API,
      persistence lifecycle, and measured evidence that the loader is invoked
      from stored auth;
    - if Path B does not use `auth.loader()`, the exact public API that injects
      provider options or a custom `fetch` without a stored auth record.
- Integration tests use minimal stubs for public OpenCode plugin interfaces
  only. A real-package compatibility test against the chosen minimum OpenCode
  version is included. The real-package test matrix also covers the
  current/reference version and every known compatibility boundary in the final
  finite supported range, as specified by the version-boundary tests below.
- Protected / manual acceptance tests cover live Cloudflare AI Gateway, live
  Deno Deploy relay, and real ChatGPT Codex, including streaming, abort,
  fail-closed, and the credential/login flow selected in §7. Streaming
  acceptance includes text delta/completion and, when §6.2.3 selects decision A
  and the selected initial model supports it, a tool call and tool-result
  continuation. Abort acceptance uses
  the §6.2 correlation source to verify exactly one Gateway and relay request,
  no retry or fallback, and no continued downstream stream. Upstream fetch abort
  and response-body cancellation are verified deterministically in relay
  integration tests; direct live Codex resource-release claims require an
  approved upstream-side cancellation signal. These require real credentials and
  are not a mandatory CI gate.
- Supported OpenCode version boundary tests (added per SRG-017):
  - the minimum supported OpenCode version passes the full lifecycle through the
    real `@opencode-ai/plugin` package for the selected §7 credential
    architecture: plugin initializes, the `config` hook injects the
    `cf-ai-gw-relay` provider and models, the selected credential lifecycle
    completes, and one request reaches the mocked custom `fetch`;
    - Path A: OAuth login, stored OAuth auth, `auth.loader()`, custom `fetch`,
    - Path B: the exact acquisition/storage/injection lifecycle selected by Path
      B;
  - the current/reference OpenCode version and every OpenCode or plugin-SDK API
    compatibility boundary within the declared finite supported range pass the
    same full lifecycle contract for the selected §7 credential architecture.
    The test record identifies the released upper bound and the official change
    evidence used to identify each boundary; a two-version minimum/current
    sample does not justify a broader range;
  - unsupported versions are handled according to the existing host-version
    policy (activation rejection), not by this provider.
- **Mandatory implementation-plan acceptance handoff:** after the
  pre-implementation design gate closes, the implementation plan MUST create
  tasks for all of the following:
  - dedicated provider implementation;
  - fixed `POST /upstream/openai/v1/responses` relay-route implementation,
    including the exact request/response/SSE mapping recorded by §6.2.3, if any;
  - deterministic relay abort integration test;
  - provisioning and fixed custom-provider-slug update;
  - non-production or protected deployment;
  - production-shaped Gateway-to-relay routing acceptance;
  - live text-streaming acceptance;
  - tool call, tool result, and continuation acceptance when §6.2.3 selects
    decision A (tools in the initial contract);
  - abort acceptance with secret-free correlation; and
  - verification that retry and fallback are absent.

  Each implementation task uses the protocol contract already recorded by
  §6.2.3. A task that implements a recorded relay mapping specifies a RED
  regression fixture, implements the minimum GREEN change, runs and records the
  passing result, and commits the completed task. Deployment and live-path tasks
  remain post-implementation acceptance obligations; the protocol
  characterization itself is not deferred into the implementation plan.

## 15. Documentation and Migration

Documentation that describes an implementable provider, credential setup, or
production-ready protocol is conditional on both the §7 credential-source gate
and the §6.2.3 pre-implementation protocol gate being closed. While either gate
is blocked, documentation MUST retain the `BLOCKED` status and MUST NOT provide
setup instructions or implementation claims that imply a usable ChatGPT
credential or an unverified Codex wire contract.

- Update the root `README.md` with:
  - installation of `@yohi/cf-ai-gw-relay` as an OpenCode plugin,
  - the new usage flow diagram
    `OpenCode -> cf-ai-gw-relay provider -> Cloudflare AI Gateway -> Deno relay -> ChatGPT Codex`,
  - required ChatGPT OAuth login through the provider **if and only if** the
    §7.1 OAuth client availability gate is satisfied; if Path B is selected,
    document the selected credential setup flow instead; otherwise document that
    the provider currently has no verified credential source and cannot be used
    for ChatGPT-subscription traffic,
  - when no viable credential candidate exists, explicitly retain the `BLOCKED`
    status and provide no setup instruction that implies a usable ChatGPT
    credential,
  - Cloudflare AI Gateway / relay configuration via options and environment
    variables,
  - fail-closed semantics,
  - removal of the old fetch-intercept mode,
  - note that `collectLogPayload` affects Cloudflare AI Gateway-side payload
    logging only; the plugin and Deno relay never log payloads regardless of
    this setting.
- Update `SPEC.md` with:
  - the new provider namespace,
  - the exact `POST /upstream/openai/v1/responses` relay route contract,
  - the new control headers and auth header,
  - the exact Relay-origin error envelope `{"origin":"relay","error":"<code>"}`
    with the documented status/code table including `relay_not_configured`
    (`503`) and `upstream_redirect_not_allowed` (`502`),
  - request/response header sanitization for the new route
    (`x-relay-authorization`, `cf-aig-*`, `cf-*`, `x-forwarded-*`, hop-by-hop,
    and `Connection`-named headers),
  - `RELAY_SECRET` configuration failure semantics (`503`, no upstream fetch,
    distinguish from `401`),
  - upstream redirect policy (`redirect: "manual"`, no automatic follow, non-304
    3xx converted to `502 upstream_redirect_not_allowed` before pass-through,
    `304` passed through with an empty body),
  - the removal of the legacy `/v1/responses` route.
- Update `docs/configuration.md` to reflect the new option schema and removed
  settings.
- Update `docs/deployment.md` and `docs/operations.md` if any values or runbooks
  change. In particular, document:
  - how to create or verify the Cloudflare AI Gateway custom provider
    `cf-ai-gw-relay`,
  - the exact `base_url` rule (relay HTTPS root, no trailing
    `/upstream/openai/v1/responses`),
  - the `enable: true` requirement,
  - migration notes for any prior custom-provider slug such as `relay-chatgpt`.
- Keep the changelog in `packages/cf-ai-gw-relay/CHANGELOG.md`, merging prior
  history from the old package name. Add a migration note stating that the old
  fetch-intercept mode and old package name are not supported.

## 16. Decisions and Gate Taxonomy

This section lists decisions that are already resolved and the remaining
credential, protocol, validation, and acceptance gates. Evidence is not
interchangeable between categories. The §7 credential-source gate closes first;
the credential-gated §6.2.3 protocol gate then closes the native Codex wire
contract and relay-only responsibility before implementation planning. Selected-
baseline validation verifies the already selected SDK contract without reopening
its architecture; the post-implementation acceptance gate controls whether the
candidate may be declared production-ready.

### Resolved decisions and conditional invariants

| Topic                                  | Decision                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reuse built-in OpenAI OAuth credential | No — public API does not safely support it today. A dedicated `cf-ai-gw-relay` OAuth flow is the intended design only if a legitimate public client is obtained; until then the provider has no verified credential source.                                                                                                                                                                                               |
| Provider/model namespace               | `cf-ai-gw-relay/<upstream-provider>/<model>`; initial upstream `openai` only.                                                                                                                                                                                                                                                                                                                                             |
| Plugin package name                    | `@yohi/cf-ai-gw-relay`.                                                                                                                                                                                                                                                                                                                                                                                                   |
| Repository package path                | `packages/cf-ai-gw-relay` (renamed from `packages/opencode-plugin`).                                                                                                                                                                                                                                                                                                                                                      |
| Provider registration path             | `config` hook is primary; `provider` hook is optional/future.                                                                                                                                                                                                                                                                                                                                                             |
| Transport layer                        | Path A: thin custom `fetch` returned from `auth.loader()`. Path B: transport injection path recorded for the chosen credential architecture.                                                                                                                                                                                                                                                                              |
| Relay route                            | `POST /upstream/openai/v1/responses` exactly; other methods/paths are rejected before upstream fetch. Legacy `/v1/responses` removed.                                                                                                                                                                                                                                                                                     |
| Gateway custom provider slug           | Fixed to `cf-ai-gw-relay` end-to-end; see §8 and §10.4 for the invariant and provisioning alignment obligation.                                                                                                                                                                                                                                                                                                           |
| Relay auth header                      | `x-relay-authorization`.                                                                                                                                                                                                                                                                                                                                                                                                  |
| Configuration precedence               | Environment variables > `opencode.json[c]`.                                                                                                                                                                                                                                                                                                                                                                               |
| Old package/slug backward compat       | Not required.                                                                                                                                                                                                                                                                                                                                                                                                             |
| AI SDK major/provider spec             | Selected identity: `provider.npm = "@ai-sdk/openai"`. Selected compatibility tuple: OpenCode `1.18.31` bundles `@ai-sdk/openai@3.0.88` / `LanguageModelV3`. The minimum exact-identity behavior needed by §6.2.3 is measured in the protocol gate; the broader selected harness and finite interval remain §6.2.4 implementation-plan validation tasks. Live Codex evidence validates, but cannot replace, that baseline. |
| AI SDK `apiKey` bootstrap              | Path A: non-secret sentinel from `auth.loader()`; OAuth token injected by custom `fetch`. `OPENAI_API_KEY` is not used. Path B: bootstrap mechanism recorded for the chosen credential architecture.                                                                                                                                                                                                                      |
| Error inspection boundary              | Pass-through for all success/SSE and Gateway/upstream errors; bounded inspection only for exact Relay-origin errors.                                                                                                                                                                                                                                                                                                      |
| Codex account/residency                | Conditional on the selected §7 credential path: that path defines whether account/residency metadata is required, its source, claim/storage semantics, precedence, and per-request derivation. Path A's OAuth `accountId` and §7.4 rules apply only if Path A closes; Path B must record its own concrete contract.                                                                                                       |
| Built-in OpenAI credential claim paths | Reference only: built-in `openai` access-token JWT contains `https://api.openai.com/auth.chatgpt_account_id` and `https://api.openai.com/auth.chatgpt_compute_residency`. Not reused.                                                                                                                                                                                                                                     |

### Pre-implementation architecture gate

Implementation planning MAY start only when all of the following are true, in
this order:

1. §7 has selected and closed exactly one credential architecture.
2. Using that selected credential path, the §6.2.3 protocol gate has closed with
   a concrete native Codex model ID, request acceptance, response/SSE contract,
   applicable tool continuation contract, and any required relay-only mapping.
3. The selected AI SDK provider identity, OpenCode release, bundled SDK version,
   and provider specification are concrete, rather than a candidate, list, or
   TBD value. SRG-021 remains resolved and is not reopened by this sequence.
4. The selected credential transport injection API is concrete rather than a
   candidate, list, or TBD value.
5. No unresolved architecture choice can change component boundaries, public
   interfaces, wire-protocol responsibility, or the security model.

The selected SRG-021 provider identity and transport seam are inputs to the
§6.2.3 protocol gate, not decisions made by that gate. The protocol probe MUST
not reopen or replace them; it only verifies that the selected baseline and
credential path satisfy the fixed relay-only architecture.

Candidate implementation or deployment, Gateway mapping, protected live
acceptance, candidate abort propagation, and finite OpenCode compatibility-
interval measurement are not preconditions for writing an implementation plan.
The minimum selected-baseline request-generation and transport behavior needed
to run §6.2.3 is a precondition and is part of that protocol gate; the broader
§6.2.4 harness and interval measurement remain bounded implementation-plan
validation.

| Topic                            | Gate                                             | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI SDK adapter                   | §6.2.3 protocol gate / §6.2.4 validation handoff | SRG-021 RESOLVED FOR PLANNING / VALIDATION REQUIRED — the selected identity is `@ai-sdk/openai`, separate from OpenCode 1.18.31's bundled `@ai-sdk/openai@3.0.88` / `LanguageModelV3` release pin. This resolves the identity-versus-version decision only; exact-identity runtime behavior remains a §6.2.3 protocol-gate requirement. The broader exact-identity harness and finite interval remain bounded validation after the pre-implementation gates close. The §7 credential lifecycle is governed by the credential-source gate and is not deferred to §6.2.4.         |
| Protocol responsibility          | §6.2.3 pre-implementation gate                   | SRG-035 UNRESOLVED — WAITING ON SRG-022 / PRE-IMPLEMENTATION VALIDATION REQUIRED — the relay is the only permitted adaptation boundary, but native Codex model ID, request acceptance, response/SSE compatibility, and applicable tool continuation are not yet measured. The initial tools scope is also NOT SELECTED and may be recorded independently as decision A or B; live tool semantics under decision A remain dependent on SRG-022. The credential-dependent protocol gate remains frozen until SRG-022 closes. Any architecture change requires design re-approval. |
| Credential source / OAuth client | §7 credential-source decision                    | UNRESOLVED — EVIDENCE REQUIRED — Path A and Path B0 are NOT VIABLE. No concrete replacement candidate is under evaluation and no verified implementable credential source has been identified. The ChatGPT-subscription provider design is currently infeasible; implementation planning MUST NOT start. The document correctly records the blocked state and gate order.                                                                                                                                                                                                       |
| OpenCode version boundary        | §6.2.4 validation handoff                        | VALIDATION REQUIRED — environment versions are recorded, and the final finite OpenCode and plugin-SDK compatibility interval must match the credential lifecycle chosen in §7. Measuring it is bounded implementation-plan work, not an architecture blocker.                                                                                                                                                                                                                                                                                                                   |

### Current Re-review Disposition (2026-09-18)

The re-review of commit `8f63f1b`, compared with parent `97ec9ff`, confirms that
this documentation-only revision updates the recorded finding states and adds
the re-review convergence rules. It introduces no implementation plan, new
authoritative credential-source evidence, target-runtime credential evidence, or
live-Codex protocol capture. This status is a review record, not technical
evidence, and records no gate promotion:

- `SRG-021` remains **RESOLVED FOR PLANNING — UNCHANGED** for provider identity
  and release-pinned SDK separation only. Exact-identity runtime behavior
  remains a §6.2.3 protocol-gate requirement.
- `SRG-022` remains **UNRESOLVED — EVIDENCE REQUIRED — UNCHANGED**. No implementable
  credential architecture is selected. The document correctly records the
  blocked state, the missing evidence, and the gate order; this re-review
  requests no document fix for the evidence gap.
- `SRG-035` remains **UNRESOLVED — WAITING ON SRG-022 — UNCHANGED** for the
  credential-dependent native model ID, selected-baseline request acceptance,
  response/SSE compatibility, and relay-only mappings. The tools A/B decision is
  also not yet recorded, but it may be made independently of credential
  discovery; live tool semantics under decision A remain dependent on SRG-022.
  There is no new independent contradiction, and this re-review requests no
  document fix for the evidence-dependent portion.

No implementation plan or implementation work is authorized by this status
record. Writing an implementation plan remains prohibited until §7 and §6.2.3
close in order with the required technical evidence.

### Re-review finding discipline

Re-review assesses whether the design is ready for implementation planning; it
does not block until every unknown is eliminated. Do not promote a bounded
implementation validation task to a Blocker or Major merely because additional
measurement would be useful. The §6.2.3 protocol gate is different: it is a
pre-implementation blocker because its failure can change component boundaries,
public interfaces, wire-protocol responsibility, or the security model.

A new Blocker or Major requires one of the following:

1. A previous revision introduced a concrete contradiction.
2. New evidence demonstrates a specific implementation failure that can change a
   component boundary, public interface, data flow, protocol responsibility, or
   security model.
3. Previously available evidence reveals a concrete contradiction that was not
   identified in an earlier review. The finding must cite that evidence, explain
   why it is not a duplicate, and identify the affected design decision.

Do not issue a new finding only by applying a stricter evidence threshold to an
unknown previously accepted as bounded. Do not reissue the same root cause under
a new finding ID. Evidence cleanup remains part of the existing finding unless
it identifies an independent design decision or failure mode.

### Re-review convergence rules

Re-review findings have an outcome state and a separate change marker. The
outcome state describes the finding; `UNCHANGED` describes the delta from the
previous review and MUST NOT replace the outcome state. For example:

```text
SRG-021: RESOLVED — UNCHANGED
SRG-022: UNRESOLVED — EVIDENCE REQUIRED
SRG-035: UNRESOLVED — WAITING ON SRG-022
```

Use `UNRESOLVED — EVIDENCE REQUIRED` when the remaining closure condition is
external evidence, target-runtime validation, or live protocol evidence and the
reviewed document already records the blocked state, required evidence, and gate
order correctly. Do not use `PARTIALLY RESOLVED` in that case. Use
`PARTIALLY RESOLVED` only when a concrete document correction remains.

Use `UNRESOLVED — WAITING ON <finding-id>` when the required validation cannot
be performed until another finding closes. Freeze the dependent finding's
detailed review until that dependency changes. Continue to check only for a
dependency change or a new independent contradiction. Independent decisions
that can be recorded without the dependency MUST remain visible and MUST NOT be
hidden by the waiting status.

If there is no new authoritative evidence, target-runtime evidence, live
protocol evidence, related architecture change, interface or responsibility
change, security-boundary change, or contradiction introduced by the previous
revision, report `UNCHANGED` and do not repeat the finding's full rationale,
repair instructions, or closure criteria. The canonical design document may
retain the evidence and gate rationale needed to explain the current state.

When no finding has a concrete document correction remaining, the re-review
output is documentation-only and MUST state:

```text
修正スコープ: ドキュメントのみ
DO NOT MODIFY SOURCE CODE
判定: BLOCKED
今回要求するドキュメント修正: なし
```

`BLOCKED` readiness is independent from document quality. A design may be
blocked by missing external evidence while requiring no additional document
edit. The next meaningful re-review requires at least one of the following:

- a concrete credential candidate or authoritative permission evidence;
- target-runtime credential integration evidence;
- live Codex request/response or SSE capture;
- protocol characterization results for the selected baseline;
- a related architecture, interface, responsibility, or security-boundary
  decision change.

### Post-implementation acceptance gate

The implementation plan MUST execute §6.2.2 **POST-IMPLEMENTATION ACCEPTANCE**
items after candidate provider and relay implementation, fixed-slug
provisioning, and a non-production or protected deployment. This gate verifies
the native Codex model and protocol contract already fixed by §6.2.3 through the
production-shaped path; it does not discover or choose that contract. It
includes Gateway-to-relay routing, live streaming and applicable tool
continuation, abort propagation, exactly-one-request correlation, no retry or
fallback, and fail-closed behavior. It does not authorize production use until
every required acceptance requirement passes.
