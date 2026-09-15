# cf-ai-gw-relay OpenCode Dedicated Provider Design

## Status

Draft — blocked until the §7 credential-source gate selects an implementable
path and the §6.2 compatibility spike records a confirmed end-to-end Codex SSE
success through the target OpenCode runtime. This revision preserves the
resolved decisions from SRG-002, SRG-013, SRG-016 through SRG-020, SRG-023
through SRG-033, and the previously recorded SRG-029/SRG-030/SRG-031 contract.
SRG-021 is now BLOCKED: Blockers A, B, and C invalidate the earlier model-ID
mapping and provider-package assumptions; §6.2 remains a blocking gate until
every compatibility evidence item is recorded with a measured value and no
unresolved FAILED item remains. See §6.2 for the current item-by-item status.
SRG-022 remains a failed gate: no implementable credential source exists, so §7
presents two mutually exclusive paths and the design must not proceed to
implementation planning until one path closes with concrete evidence.

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
- Initial standard model: `cf-ai-gw-relay/openai/<codex-model-id>`. The exact
  `<codex-model-id>` value, the user-visible-to-native mapping, and the final
  model ID placed in the wire body are fixed by the compatibility spike in §6.2
  and recorded there. If the spike proves the model or the mapping mechanism is
  unavailable, the spike must fail the gate and this design must be re-approved
  before planning.
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
  that produces the final model ID is fixed by the compatibility spike in §6.2
  and recorded there as a concrete value, not as a list of candidate mechanisms.
  Until the spike records that value, the design must not treat any specific
  mapping API or body field as settled. Because the custom `fetch` must not
  parse or rewrite the request body, any required model-ID normalization must
  happen before the body reaches the transport layer.
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
  `cf-ai-gw-relay` provider follow the same mapping mechanism fixed by the
  compatibility spike in §6.2; the final model ID passed to the selected AI SDK
  package is determined by the OpenCode model definition (`model.id` /
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
OpenCode runtime**, not through a standalone AI SDK script. The measurements
recorded below that were taken directly against `@ai-sdk/openai` are retained
only as reference observations; they are not evidence that the OpenCode runtime
will select the same provider package or invoke the same factory path.

OpenCode 1.18.31 resolves the AI SDK provider package for a config-defined
provider/model in the following order:

```text
model.provider.npm → provider.npm → existing model npm → @ai-sdk/openai-compatible
```

For the unknown provider `cf-ai-gw-relay`, if no `provider.npm` field is
specified, the fallback is `@ai-sdk/openai-compatible`, not `@ai-sdk/openai`.
The compatibility spike must therefore record the exact provider configuration
that causes OpenCode to select the intended AI SDK package. If `provider.npm` is
used to select `@ai-sdk/openai`, its exact value (for example `@ai-sdk/openai`)
is a measured value, not a candidate list. The same requirement applies to any
chosen AI SDK major/version.

OpenCode 1.18.31, when a custom provider has no dedicated model loader,
generally calls `sdk.languageModel(model.api.id)`. The built-in `openai`
provider has a special Responses loader, but `cf-ai-gw-relay` is not the
built-in `openai` provider, so the spike must record the actual constructor or
factory path invoked by the OpenCode runtime for the selected provider package.
If the final AI SDK major is 3.x, all wire contracts must be re-measured in 3.x.
If 4.x is chosen, the minimum supported OpenCode version must be changed to a
version that formally consumes `LanguageModelV4`, and all contracts must be
re-measured against that boundary.

**Final provider config shape to be recorded as measured values:**

| Field                         | What it controls                                                                 | Required measured value                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `provider.id`                 | OpenCode provider identifier                                                     | `cf-ai-gw-relay`                                                                                                  |
| `provider.npm`                | AI SDK provider package selected by OpenCode                                     | exact package name and version                                                                                    |
| model visible key             | User-selectable OpenCode model key                                               | `cf-ai-gw-relay/openai/<model>`                                                                                   |
| `model.id` / `model.api.id`   | Model ID resolved by OpenCode for the AI SDK call                                | to be measured                                                                                                    |
| provider options              | Object passed to the selected AI SDK factory                                     | `baseURL`, sentinel `apiKey`, custom `fetch` source                                                               |
| `baseURL`                     | Gateway base URL used by the AI SDK runtime                                      | `https://gateway.ai.cloudflare.com/v1/{cloudflareAccountId}/{gatewayId}/custom-cf-ai-gw-relay/upstream/openai/v1` |
| custom `fetch` source         | Path A: transport returned from `auth.loader()`; Path B: recorded injection path | measured                                                                                                          |
| selected AI SDK major/version | Contract compatibility with OpenCode runtime                                     | for example `@ai-sdk/openai@4.0.67` or a validated 3.x boundary                                                   |

Until every cell in this table is filled with a measured value, §6.2 remains a
blocking gate.

**Target request contract for the initial model (reference observations from a
standalone `@ai-sdk/openai` spike; all rows must be re-confirmed through the
OpenCode runtime with the selected provider package):**

- OpenCode model identifier: `cf-ai-gw-relay/openai/<model>` (see §5). The exact
  `<model>` value accepted by Codex remains unverified; `o3-mini` is the value
  used in the reference spike to observe the request-generation path.
- Method: `POST`.
- Request URL generated by the AI SDK runtime (observed by the custom `fetch`):

  ```text
  https://gateway.ai.cloudflare.com/v1/{cloudflareAccountId}/{gatewayId}/custom-cf-ai-gw-relay/upstream/openai/v1/responses
  ```

  where the configured `baseURL` passed to the selected AI SDK factory is:

  ```text
  https://gateway.ai.cloudflare.com/v1/{cloudflareAccountId}/{gatewayId}/custom-cf-ai-gw-relay/upstream/openai/v1
  ```

  No URL rewriting in the custom `fetch` is required to reach this shape,
  **provided the same AI SDK package and factory path are selected by
  OpenCode**.
- Upstream path suffix forwarded to the relay: `v1/responses`.
- Exact request schema generated by the selected AI SDK package in responses
  mode: the body contains, at minimum, the following top-level fields when a
  request is made:

  | Field         | Presence | Notes                                                                                                                                                                                                                                             |
  | ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `model`       | required | The final model ID passed to the AI SDK factory (`model.id` / `model.api.id` for config-defined models). The `openai/` prefix is **not** automatically stripped by OpenCode; any required normalization must be explicit in the model definition. |
  | `input`       | required | Conversation input in OpenAI Responses API shape (`[{role, content:[{type, text}]}]`).                                                                                                                                                            |
  | `stream`      | optional | `true` for `doStream`; omitted or `false` for `doGenerate`.                                                                                                                                                                                       |
  | `tools`       | optional | Tool definitions when supplied.                                                                                                                                                                                                                   |
  | `tool_choice` | optional | Tool selection policy (`"required"`, `"auto"`, `"none"`, or object).                                                                                                                                                                              |

  Measured tool shape:

  ```json
  {
    "tools": [{
      "type": "function",
      "name": "<tool-name>",
      "description": "<tool-description>",
      "parameters": { "type": "object", "properties": {}, "required": [] }
    }],
    "tool_choice": "required"
  }
  ```

  Additional optional fields (`temperature`, `max_output_tokens`, `top_p`,
  `presence_penalty`, `frequency_penalty`, `reasoning`, `store`, `user`, etc.)
  are forwarded as generated by the AI SDK runtime.
- Exact request schema sent to Codex: the reference request shape matches the
  OpenAI Responses API. No request-body transformation is required at the relay
  based on the reference observations, **provided the live Codex endpoint
  accepts the generated body unchanged and the OpenCode runtime selects a
  package that generates the same body**. That acceptance, and the exact
  generated body under the OpenCode runtime, have not yet been verified.
- Success response handling and SSE framing: **not verified**. Item 16 below
  remains open until a live Codex response/SSE is observed through the OpenCode
  runtime.
- Abort handling: propagate the inbound `AbortSignal` to the upstream `fetch`.
- Error response handling: see §11.

**Compatibility spike evidence:**

Each item below has one of the following states. Gate-closing states are
**MEASURED** and **FAILED** (with a recorded resolution). Non-closing states are
**PENDING**, **NOT MEASURED**, **REFERENCE**, and **PARTIALLY MEASURED**. Until
every item is in a gate-closing state, §6.2 remains a blocking gate. Items
tagged **PENDING** must be measured through the OpenCode runtime; items tagged
**REFERENCE** were observed against `@ai-sdk/openai` standalone and are not
sufficient to close the gate.

1. **MEASURED** — OpenCode version used: `1.18.31` (CLI in the spike
   environment). If a 4.x AI SDK package is chosen, the minimum OpenCode
   boundary must be raised to a version that formally consumes
   `LanguageModelV4`.
2. **PENDING** — AI SDK provider package and version selected by the OpenCode
   runtime for `cf-ai-gw-relay`. OpenCode resolves
   `model.provider.npm → provider.npm → existing model npm → @ai-sdk/openai-compatible`.
   The previous standalone spike used `@ai-sdk/openai@4.0.67`, but that is not
   the automatic fallback for an unknown custom provider. The exact
   `provider.npm` value (if used) and the resolved package version must be
   recorded as measured values, not as a candidate list.
3. **NOT MEASURED** — Minimum supported OpenCode version and
   `@opencode-ai/plugin` API version: not yet validated by a compatibility test.
   The OpenCode version exercised is `1.18.31`; the installed plugin SDK is
   `@opencode-ai/plugin@1.18.29` and `@opencode-ai/sdk@1.18.29`. This item
   depends on the credential lifecycle, so if the OAuth architecture is reworked
   the version-boundary test must be updated to match the new credential
   lifecycle.
4. **NOT MEASURED** — Intended `engines.opencode` range and
   `@opencode-ai/plugin` peerDependency range: the repository currently declares
   `engines.opencode` as `>=1.18.20 <2` and `@opencode-ai/plugin` as
   `>=1.18.20`. A real-package compatibility test is required before these
   ranges are approved. This item also depends on the credential lifecycle; any
   OAuth architecture change must be reflected in the version-boundary test.
5. **PENDING** — OpenCode model-ID mapping trace. The previous claim that only
   the provider/model namespace split maps `cf-ai-gw-relay/openai/<model>` to
   `<model>` is incorrect for OpenCode 1.18.31 and is withdrawn. The spike must
   record the single concrete trace:
   - Visible OpenCode model key: `cf-ai-gw-relay/openai/<model>`
   - Parsed OpenCode `modelID`: `openai/<model>` (split at first `/`)
   - Config `model.id`: the model key or explicit `id` field
   - Config `model.api.id`: the value OpenCode passes to the AI SDK factory
   - Final model ID passed to AI SDK: the constructor/factory argument
   - Wire-body `model`: the value in the generated request body
6. **REFERENCE** — Exact configured provider `baseURL` passed to the AI SDK
   factory:
   `https://gateway.ai.cloudflare.com/v1/{cloudflareAccountId}/{gatewayId}/custom-cf-ai-gw-relay/upstream/openai/v1`.
7. **REFERENCE** — AI-SDK-generated final Gateway URL observed by the custom
   `fetch`:
   `https://gateway.ai.cloudflare.com/v1/{cloudflareAccountId}/{gatewayId}/custom-cf-ai-gw-relay/upstream/openai/v1/responses`.
   Produced from the configured `baseURL` without URL rewriting.
8. **REFERENCE** — Custom `fetch` observed method: `POST`.
9. **PENDING / REFERENCE** — Custom `fetch` observed top-level request body
   keys: `model`, `input`. With tools: `tools`, `tool_choice`. With streaming:
   `stream`. Must be re-confirmed with the actual OpenCode-selected package.
10. **REFERENCE** — Responses conversation data is generated as `input`, not
    `messages`.
11. **REFERENCE** — Tool-call wire shape:
    `[{type: "function", name, description, parameters}]` with `tool_choice` set
    to `"required"`, `"auto"`, `"none"`, or an object.
12. **REFERENCE** — `stream` value: `true` for streaming (`doStream`);
    omitted/false otherwise.
13. **NOT MEASURED** — Exact native Codex model ID accepted by
    `https://chatgpt.com/backend-api/codex/responses`: not verified. The spike
    used `o3-mini` only to observe the request-generation path.
14. **PENDING** — Observed AI SDK model ID passed to the runtime. It equals the
    OpenCode-resolved `model.id` / `model.api.id` for config-defined models, not
    an automatically stripped `<model>` segment.
15. **PENDING** — OpenCode-visible model ID and mapping mechanism:
    `cf-ai-gw-relay/openai/<model>` resolves to parsed `modelID`
    `openai/<model>` (split at first `/`); the final model ID passed to the AI
    SDK factory is determined by the public OpenCode model definition and the
    selected provider package. The `openai/` prefix is not automatically
    stripped.
16. **NOT MEASURED** — Confirmed SSE success response through the OpenCode
    runtime: required before the gate closes.
17. **NOT MEASURED / OPEN** — Protocol transformation requirement: the request
    body generated by the selected AI SDK package appears to match the OpenAI
    Responses API, so **request** transformation is not expected. **Response/SSE
    transformation remains unverified** because no live Codex response was
    observed through the OpenCode runtime. Therefore the
    transformation/no-transformation decision is not closed.
18. **NOT MEASURED** — Config hook registers `cf-ai-gw-relay`.
19. **NOT MEASURED** — Visible model selected as
    `cf-ai-gw-relay/openai/<model>`.
20. **NOT MEASURED** — Provider npm package selected by OpenCode.
21. **NOT MEASURED** — `model.api.id` resolved by OpenCode.
22. **NOT MEASURED** — Actual AI SDK model constructor/factory path invoked.
23. **NOT MEASURED** — Custom `fetch` URL received.
24. **NOT MEASURED** — Request body `model`.
25. **NOT MEASURED** — Request body input/tools/stream.

Until every compatibility spike evidence item below is in a gate-closing state
(**MEASURED** or **FAILED** with a recorded resolution), §6.2 remains a blocking
gate. Items tagged **PENDING**, **NOT MEASURED**, **REFERENCE**, or **PARTIALLY
MEASURED** do not satisfy the gate.

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

The `cf-ai-gw-relay` provider has no verified credential source today. This
section presents two mutually exclusive paths. Until one path closes with
concrete, measured evidence, the design is BLOCKED and must not proceed to
implementation planning.

- **Path A — Dedicated OAuth client:** Obtain a legitimate, third-party, public
  OAuth client for `cf-ai-gw-relay`. If and only if such a client is obtained,
  the conditional dedicated-OAuth contract in §7.1–§7.4 becomes the
  implementation target and all §7.1 contract items must be closed with measured
  values.
- **Path B — Redesign credential architecture:** Replace the dedicated-OAuth
  design with a concrete, implementable credential source. If this path is
  chosen, the old dedicated-OAuth conditional design in §7.1–§7.4 is **not**
  retained as the main architecture. The new source must concretize, at minimum:
  credential owner, acquisition method, OpenCode public API boundary, storage,
  refresh/rotation ownership, chatgptAccountId source, residency source,
  outbound headers, user login/setup flow, failure handling, security boundary,
  and tests. In addition, Path B must record whether it depends on stored
  OpenCode auth: if it reuses `auth.loader()`, it must specify the auth record
  type, creation API, persistence lifecycle, and measured evidence that the
  loader is invoked from stored auth; if it does not use `auth.loader()`, it
  must specify the exact public API that injects provider options or a custom
  `fetch` without a stored auth record. If Path B is selected, §6.3, §13, §14,
  §15, and §16 must be updated to remove any unconditional Path A contract.

With the current information, neither path is closed. Therefore the design
remains infeasible/blocked for ChatGPT-subscription traffic.

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

- The exact `<upstream-path>` is the value fixed by the compatibility spike in
  §6.2 (e.g. `v1/responses`).
- The exact production `baseURL` configured for the provider is determined by
  the spike in §6.2 (recorded as evidence item 6). No implementation plan may
  assume a value before the spike records it.
- Control headers added by the plugin:
  - `cf-aig-authorization: Bearer <gatewayToken>`
  - `x-relay-authorization: Bearer <relaySecret>`
  - `cf-aig-collect-log: true`
  - `cf-aig-collect-log-payload: true|false`
  - `cf-aig-metadata: {"source":"opencode","auth_type":"chatgpt_subscription","plugin":"cf-ai-gw-relay"}`
  - `cf-aig-skip-cache: true`
  - `cf-aig-max-attempts: 1`
- The `Authorization` header carrying the ChatGPT OAuth access token is injected
  by the plugin's custom `fetch` (after stripping any existing `Authorization`
  value, including the AI SDK sentinel `apiKey`), passed through the Gateway to
  the relay, and preserved for the upstream Codex request.
- The `ChatGPT-Account-Id` and `x-openai-internal-codex-residency` headers from
  §7.4 are preserved and passed through.
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
evaluated by the total validation/fetch precedence in this section. The first
matching condition produces its response and no later condition is evaluated;
the relay performs no upstream fetch unless checks 1–6 pass. non-matching
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
    standard upstream `Authorization` header is NOT removed; it carries the
    current ChatGPT OAuth token and must remain available to Codex. The
    `ChatGPT-Account-Id` and `x-openai-internal-codex-residency` headers from
    §7.4 are also preserved. The relay secret MUST terminate at the relay.
- Response header sanitization: before returning any upstream or synthetic
  response to the Gateway, remove hop-by-hop response headers and every header
  named by the comma-separated `Connection` header tokens. This applies to
  success responses, `304 Not Modified`, Relay-origin errors, and converted
  `502 upstream_redirect_not_allowed` responses.
- Body: forward the request body as received. **If** the compatibility spike in
  §6.2 confirms that the AI SDK-generated representation is accepted without
  transformation, the relay forwards the body unchanged; otherwise the relay
  applies the transformation the spike identifies.
- Streaming / response body: if §6.2 confirms no response/SSE transformation is
  required, forward the upstream response body stream unchanged; if §6.2
  determines that response/SSE transformation is required, the relay applies the
  exact transformation recorded in §6.2 before returning it to the Gateway.
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
- The public OAuth auth top-level `accountId` field is the ChatGPT account ID
  (semantic name: `chatgptAccountId`). It is used only for the outbound
  `ChatGPT-Account-Id` header and must never be treated as a Cloudflare account
  ID or used in Gateway URL construction.

## 11. Fail-closed and Error Handling

- A request routed to `cf-ai-gw-relay/*` never automatically falls back to
  `openai/*`.
- Error categories surfaced to the user include:
  - Cloudflare AI Gateway error,
  - relay error / unauthorized,
  - relay configuration error,
  - network error,
  - authentication error (OAuth not logged in, expired token),
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
- OAuth refresh failures do not fall back to a direct route; the plugin
  distinguishes re-authentication needs from transient refresh failures where
  possible.
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

- The plugin and Deno relay MUST never log, emit in errors, or include in public
  fixtures:
  - ChatGPT OAuth access token and refresh token,
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

## 13. Production Readiness Criteria

Before declaring the new provider model production-ready, verify:

- §6.2 compatibility gate is closed. The selected §7 credential-source path is
  closed:
  - Path A: §7.1 dedicated OAuth-client gate is satisfied.
  - Path B: the replacement credential architecture is fully specified,
    measured, and approved, including the `auth.loader()` dependency decision
    recorded in §6.3.
- Request isolation between `openai/*` and `cf-ai-gw-relay/*` traffic.
- Credential handling (shared): secret-free errors, storage/refresh/rotation
  ownership, and outbound header sources are recorded for the selected §7 path.
- Credential handling (Path A only): OAuth flow, token refresh single-flight,
  account metadata persistence, residency derivation per request.
- Credential handling (Path B only): the concrete credential architecture
  (credential owner, acquisition method, OpenCode public API boundary, storage,
  refresh/rotation ownership, `chatgptAccountId` source, residency source,
  outbound headers, user login/setup flow, failure handling, and security
  boundary) is documented and measured.
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
  peerDependency range are recorded in §6.2 once the compatibility spike closes
  the gate, and must be identical across the design, package metadata, and test
  target before production readiness is declared.
- The provisioned Cloudflare AI Gateway custom provider slug is exactly
  `cf-ai-gw-relay`; the plugin runtime and provisioning workflow both enforce
  this value.

## 14. Testing Strategy

- Plugin tests use Vitest. Relay tests use Deno built-in test runner.
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
  - Protocol contract tests (added per SRG-002):
    - the AI SDK-generated request body uses `input` (not `messages`) for the
      Responses API conversation field and matches the Codex endpoint contract
      directly **if** the compatibility spike determines that no transformation
      is required;
    - **or**, if the spike determines that transformation is required, the exact
      relay field mapping transforms it correctly and the spike records the
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
    - `ChatGPT-Account-Id` and `x-openai-internal-codex-residency` are
      preserved,
    - response hop-by-hop and `Connection`-token headers are removed before
      downstream delivery,
    - tests and logs do not emit the secret values used in headers.
  - Cloudflare / ChatGPT account identifier isolation tests (added per SRG-031):
    - the Cloudflare account ID (`cloudflareAccountId`) is used only in the
      Gateway URL path (`/v1/{cloudflareAccountId}/{gatewayId}/...`); it never
      appears in `ChatGPT-Account-Id` or any other ChatGPT-bound header;
    - the ChatGPT account ID (`chatgptAccountId`) is used only in the
      `ChatGPT-Account-Id` header; it never appears in the Gateway URL path;
    - fixture values for the two identifiers are deliberately different so that
      accidental substitution is detectable; tests fail if the two values are
      equal or if either identifier is used in the wrong location;
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
  version is included. A second real-package test against a current/reference
  OpenCode version confirms that the supported range is still valid.
- Protected / manual acceptance tests cover live Cloudflare AI Gateway, live
  Deno Deploy relay, and real ChatGPT Codex, including streaming, abort,
  fail-closed, and the credential/login flow selected in §7. These require real
  credentials and are not a mandatory CI gate.
- Supported OpenCode version boundary tests (added per SRG-017):
  - the minimum supported OpenCode version passes the full lifecycle through the
    real `@opencode-ai/plugin` package for the selected §7 credential
    architecture: plugin initializes, the `config` hook injects the
    `cf-ai-gw-relay` provider and models, the selected credential lifecycle
    completes, and one request reaches the mocked custom `fetch`;
    - Path A: OAuth login, stored OAuth auth, `auth.loader()`, custom `fetch`,
    - Path B: the exact acquisition/storage/injection lifecycle selected by Path
      B;
  - the current/reference OpenCode version passes the same full lifecycle
    contract for the selected §7 credential architecture;
  - unsupported versions are handled according to the existing host-version
    policy (activation rejection), not by this provider.

## 15. Documentation and Migration

- Update the root `README.md` with:
  - installation of `@yohi/cf-ai-gw-relay` as an OpenCode plugin,
  - the new usage flow diagram
    `OpenCode -> cf-ai-gw-relay provider -> Cloudflare AI Gateway -> Deno relay -> ChatGPT Codex`,
  - required ChatGPT OAuth login through the provider **if and only if** the
    §7.1 OAuth client availability gate is satisfied; if Path B is selected,
    document the selected credential setup flow instead; otherwise document that
    the provider currently has no verified credential source and cannot be used
    for ChatGPT-subscription traffic,
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

## 16. Decisions and Remaining Pre-Implementation Gates

This section lists decisions that are already resolved and gates that remain
open. Open gates are blocked until the corresponding spike records concrete
evidence; they must not be treated as resolved in planning or implementation.

### Resolved decisions

| Topic                                  | Decision                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reuse built-in OpenAI OAuth credential | No — public API does not safely support it today. A dedicated `cf-ai-gw-relay` OAuth flow is the intended design only if a legitimate public client is obtained; until then the provider has no verified credential source.                                                                                                                                                               |
| Provider/model namespace               | `cf-ai-gw-relay/<upstream-provider>/<model>`; initial upstream `openai` only.                                                                                                                                                                                                                                                                                                             |
| Plugin package name                    | `@yohi/cf-ai-gw-relay`.                                                                                                                                                                                                                                                                                                                                                                   |
| Repository package path                | `packages/cf-ai-gw-relay` (renamed from `packages/opencode-plugin`).                                                                                                                                                                                                                                                                                                                      |
| Provider registration path             | `config` hook is primary; `provider` hook is optional/future.                                                                                                                                                                                                                                                                                                                             |
| Transport layer                        | Path A: thin custom `fetch` returned from `auth.loader()`. Path B: transport injection path recorded for the chosen credential architecture.                                                                                                                                                                                                                                              |
| Relay route                            | `POST /upstream/openai/v1/responses` exactly; other methods/paths are rejected before upstream fetch. Legacy `/v1/responses` removed.                                                                                                                                                                                                                                                     |
| Gateway custom provider slug           | Fixed to `cf-ai-gw-relay` end-to-end; see §8 and §10.4 for the invariant and provisioning alignment obligation.                                                                                                                                                                                                                                                                           |
| Relay auth header                      | `x-relay-authorization`.                                                                                                                                                                                                                                                                                                                                                                  |
| Configuration precedence               | Environment variables > `opencode.json[c]`.                                                                                                                                                                                                                                                                                                                                               |
| Old package/slug backward compat       | Not required.                                                                                                                                                                                                                                                                                                                                                                             |
| AI SDK major/provider spec             | Not settled and now blocked by provider-package resolution. OpenCode 1.18.31 resolves the AI SDK provider package for `cf-ai-gw-relay` in the order `model.provider.npm → provider.npm → existing model npm → @ai-sdk/openai-compatible`. The spike must record the exact `provider.npm` value (if used) and the resolved package version/major before implementation planning. See §6.2. |
| AI SDK `apiKey` bootstrap              | Path A: non-secret sentinel from `auth.loader()`; OAuth token injected by custom `fetch`. `OPENAI_API_KEY` is not used. Path B: bootstrap mechanism recorded for the chosen credential architecture.                                                                                                                                                                                      |
| Error inspection boundary              | Pass-through for all success/SSE and Gateway/upstream errors; bounded inspection only for exact Relay-origin errors.                                                                                                                                                                                                                                                                      |
| Codex account/residency shape          | `accountId` persists `chatgptAccountId`; residency derived per-request. Exact source/claim/precedence is **unknown** because no implementable credential path is closed (§7).                                                                                                                                                                                                             |
| Built-in OpenAI credential claim paths | Reference only: built-in `openai` access-token JWT contains `https://api.openai.com/auth.chatgpt_account_id` and `https://api.openai.com/auth.chatgpt_compute_residency`. Not reused.                                                                                                                                                                                                     |

### Open pre-implementation gates

| Topic                            | Gate                          | Status                                                                                                                                                                                                                                          |
| -------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI SDK adapter                   | §6.2 compatibility spike      | BLOCKED — SRG-021 Blockers A, B, and C invalidate the earlier model-ID mapping and provider-package assumptions. §6.2 remains blocked until every compatibility evidence item is in a gate-closing state. See §6.2 for the item-by-item status. |
| Protocol adaptation              | §6.2 compatibility spike      | BLOCKED — response/SSE transformation cannot be determined without a live Codex response through the OpenCode runtime.                                                                                                                          |
| Credential source / OAuth client | §7 credential-source decision | FAILED / BLOCKED — no implementable credential source exists. §7 presents Path A (dedicated OAuth client) and Path B (redesign credential architecture); neither is closed.                                                                     |
| OpenCode version boundary        | §6.2 compatibility spike      | BLOCKED — environment versions recorded, but real-package compatibility test across the intended `engines.opencode` range is pending. This test must match the credential lifecycle chosen in §7.                                               |
