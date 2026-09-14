# cf-ai-gw-relay OpenCode Dedicated Provider Design

## Status

Draft — pending §7.1 OAuth client availability gate and the §6.2 compatibility
spike. Blocked until both gates are resolved and the design is re-approved.

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
- Provide a ChatGPT OAuth login flow owned by the `cf-ai-gw-relay` provider,
  using only public OpenCode plugin APIs.
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
- Keep `apps/deno-relay/` and `.github/scripts/` unchanged in scope.
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
  model ID is fixed by the compatibility spike in §6.2 and recorded there. If
  the spike proves the model is unavailable, the spike must fail the gate and
  this design must be re-approved before planning.
- The namespace is kept extensible for future `anthropic`, `google`, etc.,
  providers without a breaking change, but no placeholder or dummy models for
  unsupported upstreams are registered.
- `openai/<model>` and `cf-ai-gw-relay/openai/<model>` are usable side by side.
- The plugin must not intercept, rewrite, or mutate `openai/*` traffic.

## 6. OpenCode Plugin API Strategy

### 6.1 Hooks used

- `config` hook (primary): inject and merge `provider.cf-ai-gw-relay` into the
  user's configuration. Provide the standard models. Merge user-defined models,
  with user settings winning on conflict.
- `auth` hook: provide the ChatGPT OAuth login flow for the `cf-ai-gw-relay`
  provider. Return provider options (including a custom `fetch`) from
  `auth.loader()` so that the OpenCode / AI SDK runtime uses the relay
  transport.
- `provider` (`ProviderHook`) hook: keep optional. Do not rely on it as the
  primary provider registration path today. It may be enabled later when
  OpenCode supports registering unknown providers through this hook.

### 6.2 Provider runtime / AI SDK adapter

The AI SDK adapter and end-to-end wire contract for `provider.cf-ai-gw-relay`
are determined by the pre-plan compatibility spike. This section is a blocking
gate until the spike is complete and its results are copied into this design.
Every request-contract statement below is conditional on the spike confirming
it.

**Chosen adapter:**

- npm package: `@ai-sdk/openai`.
- Provider factory API: `createOpenAI({ baseURL, apiKey, fetch })` from
  `@ai-sdk/openai`, configured so the runtime targets the OpenAI Responses API.
- Model factory API mode: responses mode (`model("<id>", { provider: openai })`
  produces an OpenAI-compatible chat/model call routed through the configured
  `baseURL`).

**Exact request contract for the initial model:**

- OpenCode model identifier: `cf-ai-gw-relay/openai/<codex-model-id>` (see §5).
  The exact `<codex-model-id>` value is the one confirmed by the spike in §6.2.
- Method: `POST`.
- Request URL generated by OpenCode / the AI SDK runtime:

```text
{gatewayBaseUrl}/v1/{accountId}/{gatewayId}/custom-cf-ai-gw-relay/upstream/openai/v1/responses
```

where `{gatewayBaseUrl}` is `https://gateway.ai.cloudflare.com` in production.
This URL is produced by the AI SDK runtime from the configured `baseURL`; the
custom `fetch` does not rewrite it. The exact `baseURL` value is determined by
the spike in §6.2.

- Upstream path suffix forwarded to the relay: `v1/responses`.
- Exact request schema generated by OpenCode: the OpenAI Responses API request
  schema. The body is produced by `@ai-sdk/openai` in responses mode and
  contains, at minimum, the following top-level fields when a request is made:

  | Field         | Presence | Notes                                                                      |
  | ------------- | -------- | -------------------------------------------------------------------------- |
  | `model`       | required | Set to the spike-confirmed Codex model ID by OpenCode / the model factory. |
  | `input`       | required | Conversation input in OpenAI Responses API shape.                          |
  | `stream`      | optional | `true` when streaming is requested; omitted or `false` otherwise.          |
  | `tools`       | optional | Codex tool definitions, when supplied by OpenCode.                         |
  | `tool_choice` | optional | Tool selection policy.                                                     |
  | `metadata`    | optional | Request metadata object.                                                   |
  | `truncation`  | optional | Token management strategy.                                                 |

  Additional optional fields (`temperature`, `max_output_tokens`, `top_p`,
  `presence_penalty`, `frequency_penalty`, `reasoning`, `store`, `user`, etc.)
  are forwarded as generated by the AI SDK runtime. The relay does not modify
  these fields.

- Exact request schema sent to Codex: same as above, **if and only if** the
  compatibility spike demonstrates that the AI SDK-generated body is accepted by
  `https://chatgpt.com/backend-api/codex/responses` without field
  transformation. Until that evidence is recorded, the relay MUST be prepared to
  perform any transformation the spike identifies.
- Success response handling: pass-through streaming `Response` unchanged.
- SSE framing: pass-through unchanged.
- Abort handling: propagate the inbound `AbortSignal` to the upstream `fetch`.
- Error response handling: see §11.

The chosen adapter satisfies the selection criteria in §6.2 (public/stable in
OpenCode, preserves Codex semantics, supports streaming/abort/error propagation,
allows a custom `fetch` override, and does not tie the implementation to a fixed
model-name list for future Codex capability additions).

**Compatibility spike evidence required before this section is approved:**

1. OpenCode version used.
2. `@ai-sdk/openai` version used.
3. OpenCode config model definition.
4. Custom `fetch` observed method and URL.
5. Custom `fetch` observed top-level request body keys.
6. Confirmation that Responses conversation data is generated as `input`, not
   `messages`.
7. Tool-call wire shape when tools are present.
8. `stream` value for streaming vs non-streaming requests.
9. Exact Codex model ID accepted by
   `https://chatgpt.com/backend-api/codex/responses`.
10. At least one confirmed SSE success response.
11. Evidence that no request body transformation is required.

Until all items above are recorded here, §6.2 remains a blocking gate.

### 6.3 Custom `fetch` responsibilities

The custom `fetch` returned by `auth.loader()` is a thin transport boundary:

1. Receive the request generated by OpenCode / the AI SDK runtime.
2. Validate and use the request URL generated by the configured provider; the
   custom `fetch` does **not** rewrite the URL to a different Gateway path.
3. Add the required control headers.
4. Replace the `Authorization` header with the current ChatGPT OAuth token.
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

## 7. ChatGPT OAuth Flow

The `cf-ai-gw-relay` provider owns its ChatGPT OAuth login flow through the
OpenCode `auth` hook.

### 7.1 Pre-implementation gate: OAuth client availability

Before this design is approved and before any implementation plan is written,
the following OAuth client contract must be determined by a blocking spike:

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
- The exact token from which the ChatGPT account ID is extracted:
  - ID token only
  - access token only
  - ID token preferred, falling back to access token
  - access token preferred, falling back to ID token
- The exact claim path(s) for the ChatGPT account ID in the chosen token(s).
- The exact claim path(s) for the Codex residency value, if any.
- The exact value and semantics of the "no residency constraint" indicator
  (e.g., `no_constraint`).
- The behavior when an account ID claim is absent, malformed, or otherwise
  unusable.
- The behavior when a residency claim is absent or equals the "no constraint"
  value.
- Whether a decoded account ID is required for every Codex-bound request or
  optional.
- The precedence if multiple token or claim sources could yield different
  account IDs.
- Confirmation that the chosen OAuth client actually returns the expected token
  shape and claims; the built-in OpenCode Codex client claim shape MUST NOT be
  assumed to match without fresh verification.

The spike must produce documented evidence for each item above. Secret values
are never written into the design or implementation plan; only the contract and
the environment variable / secret store reference are recorded.

Until this gate is satisfied, this design remains in Draft and the provider
implementation must not proceed. If no legitimate public client can be obtained,
the dedicated provider approach is unimplementable and this design must be
abandoned or reworked.

### 7.2 OAuth flow sequence

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

### 7.3 Callback server lifecycle and cleanup

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

### 7.4 ChatGPT account metadata

The OAuth token response may contain claims that the built-in OpenCode Codex
provider uses to route requests. The dedicated provider must reproduce the
necessary semantics without depending on the built-in flow, using only public
OpenCode plugin APIs:

- After token exchange, decode the ID / access token claims in a secret-free way
  to extract the ChatGPT account ID and, if present, the Codex residency value.
  The exact claim names are determined during the OAuth spike in §7.1.
- Store the **account ID** as the top-level `accountId` field of the OAuth auth
  object using `input.client.auth.set()` (public API). This field is part of the
  OpenCode public OAuth auth schema.
- **Residency is not persisted in the OAuth auth object.** It is derived from
  the current access token on each Codex-bound request and cached only in memory
  for the lifetime of that request.
- On token refresh, store the new access token and refresh token via
  `input.client.auth.set()`. If the new access token yields an account ID,
  update the top-level `accountId` field; otherwise preserve the existing
  account ID. Residency is not persisted; the next request derives it from the
  new access token.
- The custom `fetch` sets `ChatGPT-Account-Id` from the top-level `accountId`
  field on every Codex-bound request when an account ID is present.
- The custom `fetch` derives `x-openai-internal-codex-residency` from the
  current access token and sets it only when the value is present and not
  `no_constraint` equivalent; the header is omitted when there is no residency.
- If token claim decoding fails, the provider fails closed with a clear,
  secret-free error and does not forward a request without required routing
  metadata.
- Account IDs, residency values, decoded claims, and token payloads are never
  logged or emitted in errors.

Only account ID is persisted in the OAuth auth object; residency is derived
per-request. Other built-in headers are not copied unless the spike or Codex
contract provides a concrete reason.

## 8. Cloudflare AI Gateway / Relay Destination

- Gateway custom provider: created in the target Cloudflare account with slug
  `cf-ai-gw-relay` and `base_url` set to the deployed Deno relay HTTPS
  origin/root (e.g. `https://<relay-host>`), and enabled. The plugin does not
  provision this resource automatically; provisioning is a deployment
  prerequisite performed via Cloudflare Dashboard or API. `base_url` MUST be the
  relay root without `/upstream/openai/v1/responses`; Gateway appends the
  request path to this root. The `enable` flag is required to be `true` for
  requests to be routed.
- Custom provider slug: fixed to `cf-ai-gw-relay`.
- Relay authentication header: `x-relay-authorization: Bearer <relaySecret>`.
- Gateway URL ownership: the final request URL is produced by the AI SDK runtime
  using the provider's configured `baseURL`. The custom `fetch` MUST validate
  that the request URL matches the expected Gateway shape and MUST NOT rewrite
  the path to a different Gateway route. If the observed URL does not match the
  expected shape, the custom `fetch` fails closed with a clear, secret-free
  error before forwarding.
- Conceptual Gateway URL shape:

  ```text
  {gatewayOrigin}/v1/{accountId}/{gatewayId}/custom-cf-ai-gw-relay/upstream/openai/<upstream-path>
  ```

- The exact `<upstream-path>` is the value fixed by the compatibility spike in
  §6.2 (e.g. `v1/responses`).
- The exact production `baseURL` configured for the provider is determined by
  the spike in §6.2. A plausible value (to be confirmed) is:

  ```text
  https://gateway.ai.cloudflare.com/v1/{accountId}/{gatewayId}/custom-cf-ai-gw-relay/upstream/openai/v1
  ```

  where the AI SDK runtime appends `/responses` to arrive at the final Gateway
  path.
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

## 9. Deno Relay `/upstream/openai/v1/responses` Route

The Deno relay exposes a new fixed route for the OpenAI upstream. All
non-matching methods, paths, and upstream slugs are rejected before any upstream
fetch.

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
- Upstream destination: `https://chatgpt.com/backend-api/codex/responses`.
- Upstream fetch: the relay MUST use `redirect: "manual"`. It MUST NOT follow
  automatic redirects. Any 3xx response from Codex is passed through with a
  sanitized `Location` header (if present) and an empty body, because the client
  can re-issue the credentialed request itself. The relay MUST NOT re-send OAuth
  Authorization or other relay-only headers to a redirect destination.
- Body: forward the request body as received. **If** the compatibility spike in
  §6.2 confirms that the AI SDK-generated representation is accepted without
  transformation, the relay forwards the body unchanged; otherwise the relay
  applies the transformation the spike identifies.
- Streaming: forward the upstream response body stream unchanged.
- Abort: propagate the inbound abort signal to the upstream `fetch`.
- Timeouts: preserve the existing connect/header timeout and SSE idle timeout
  behavior.
- Rejection table (all before upstream fetch):

  | Condition                                                         | HTTP status | Relay-origin error code | Notes                                                        |
  | ----------------------------------------------------------------- | ----------- | ----------------------- | ------------------------------------------------------------ |
  | `RELAY_SECRET` missing, empty, or whitespace-only at request time | `503`       | `relay_not_configured`  | Distinguish from incorrect request credential (`401`).       |
  | Missing or incorrect `x-relay-authorization`                      | `401`       | `unauthorized`          | See §11.                                                     |
  | Method other than `POST`                                          | `405`       | `unsupported_method`    | Includes `GET`, `PUT`, `DELETE`, etc.                        |
  | Path not exactly `/upstream/openai/v1/responses`                  | `404`       | `unsupported_path`      | Any suffix other than `v1/responses`.                        |
  | Upstream slug other than `openai`                                 | `404`       | `unsupported_upstream`  | Future providers use their own presets; no generic proxying. |

- The legacy `POST /v1/responses` route is removed with no backward
  compatibility.

## 10. Configuration Schema, Environment Variables, and Precedence

### 10.1 Required provider options

Under `provider.cf-ai-gw-relay.options`:

- `accountId` — Cloudflare account ID.
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
- The only exception is a Relay-origin error that the relay intentionally
  generates **before any upstream fetch**. The plugin identifies a Relay-origin
  error only when **all** of the following match exactly:
  - HTTP status is one of the documented Relay-origin statuses in §9.
  - `Content-Type` is `application/json`.
  - The JSON body is an object containing `"origin": "relay"` and a documented
    `error` string from the table below.

  Documented Relay-origin error codes and their HTTP statuses:

  | `error` code           | HTTP status | Produced when                                                         |
  | ---------------------- | ----------- | --------------------------------------------------------------------- |
  | `unauthorized`         | `401`       | Missing or incorrect `x-relay-authorization`.                         |
  | `relay_not_configured` | `503`       | `RELAY_SECRET` is missing, empty, or whitespace-only at request time. |
  | `unsupported_method`   | `405`       | Method is not `POST`.                                                 |
  | `unsupported_path`     | `404`       | Path is not exactly `/upstream/openai/v1/responses`.                  |
  | `unsupported_upstream` | `404`       | Upstream slug is not `openai`.                                        |

  For these responses the plugin may read up to 8 KiB of the response body,
  translate the documented code into an actionable, secret-free OpenCode user
  error, and return a synthetic `Response` so that the calling runtime still
  receives a valid response object. The original response body is not consumed
  beyond the bounded read.
- Any `4xx`/`5xx` response that does not match the exact Relay-origin envelope
  above is **not** translated, even if it has `Content-Type: application/json`.
  Gateway errors, Codex errors, and upstream provider errors are passed through
  unchanged.
- Success responses and SSE streams are never inspected, buffered, or
  reconstructed.
- OAuth refresh failures do not fall back to a direct route; the plugin
  distinguishes re-authentication needs from transient refresh failures where
  possible.
- Secrets, tokens, authorization headers, and request/response payloads are
  never included in error messages or logs.

## 12. Secret Handling

- The following must never be logged, emitted in errors, or included in public
  fixtures:
  - ChatGPT OAuth access token and refresh token,
  - `Authorization` header value,
  - `x-relay-authorization` header value,
  - Cloudflare Gateway token (`cf-aig-authorization`),
  - relay secret,
  - ChatGPT account ID and residency values,
  - decoded token claims,
  - request and response payloads.
- `collectLogPayload=true` controls Cloudflare AI Gateway-side payload logging.
  The plugin and Deno relay must not log payloads regardless of this setting.

## 13. Production Readiness Criteria

Before declaring the new provider model production-ready, verify:

- Pre-implementation gates in §7.1 and §6.2 are satisfied and their results are
  documented in this design.
- Request isolation between `openai/*` and `cf-ai-gw-relay/*` traffic.
- Credential handling: OAuth flow, token refresh single-flight, account metadata
  persistence, residency derivation per request, and secret-free errors.
- AI SDK bootstrap: provider uses a non-secret sentinel `apiKey` and custom
  `fetch` replaces it with the current OAuth token; `OPENAI_API_KEY` is not
  used.
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
- Upstream redirect policy: `redirect: "manual"`, no automatic follow, 3xx
  passed through with sanitized `Location` and no relay-only headers re-sent.
- Gateway URL ownership is the AI SDK runtime's configured `baseURL`; the custom
  `fetch` does not rewrite the URL.
- Supported OpenCode version boundary validated by an integration test using the
  real `@opencode-ai/plugin` package.

## 14. Testing Strategy

- Plugin tests use Vitest. Relay tests use Deno built-in test runner.
- Unit tests cover:
  - configuration resolution, precedence, deferred validation, and secret
    masking,
  - Gateway URL construction,
  - control-header application,
  - provider/model definition merging,
  - unsupported-upstream detection,
  - OAuth PKCE/state/callback/token-exchange helpers,
  - callback server bind-before-return and cleanup paths,
  - custom `fetch` URL/header rewrite,
  - secret-free error messages.
- Integration tests use minimal stubs for public OpenCode plugin interfaces
  only. A real-package compatibility test against the chosen minimum OpenCode
  version is included.
- Protected / manual acceptance tests cover live Cloudflare AI Gateway, live
  Deno Deploy relay, and real ChatGPT Codex, including streaming, abort,
  fail-closed, and OAuth login. These require real credentials and are not a
  mandatory CI gate.
- OAuth and Codex account metadata tests (added per SRG-003):
  - `accountId` is saved to the top-level OAuth auth field after successful
    token exchange; residency is not persisted in the OAuth auth object,
  - `accountId` is updated after token refresh when the new access token yields
    an account ID; otherwise the existing value is preserved,
  - residency is derived from the current access token on each Codex-bound
    request,
  - `ChatGPT-Account-Id` is set when an account ID is present and omitted when
    absent,
  - `x-openai-internal-codex-residency` is set when a non-empty, non-
    `no_constraint` residency is derived and omitted otherwise,
  - malformed token claims fail secret-free without leaking the token,
  - account/residency headers survive the Gateway/Relay hop unchanged.
- Protocol contract tests (added per SRG-002):
  - the AI SDK-generated request body uses `input` (not `messages`) for the
    Responses API conversation field and matches the Codex endpoint contract
    directly, or
  - the exact relay field mapping transforms it correctly.
  - exact request path and method are `POST /upstream/openai/v1/responses`;
    other methods/paths return a Relay-origin error before upstream fetch.
- AI SDK bootstrap tests (added per SRG-008):
  - `OPENAI_API_KEY` being unset does not prevent the request from reaching the
    custom `fetch`,
  - `OPENAI_API_KEY` set to any value is ignored and never reaches Gateway or
    relay,
  - outbound Gateway request uses only the current ChatGPT OAuth token in the
    `Authorization` header,
  - the sentinel `apiKey` value does not leave the plugin process,
  - after token refresh the new OAuth token is used without changing the static
    provider `apiKey`,
  - old `Authorization` is removed from `Headers`, tuple-array, and record
    inputs before the OAuth token is injected.
- Relay-origin error envelope tests (added per SRG-006):
- each documented Relay-origin error returns the exact envelope
  `{"origin":"relay","error":"<code>"}` with the documented status,
  - the plugin translates only the documented codes,
  - `relay_not_configured` (`503`) is distinguished from `unauthorized` (`401`),
- Gateway, Codex, and upstream `400`/`401` JSON bodies are passed through
  without translation,
- JSON bodies without `origin: "relay"` are not treated as Relay-origin errors,
  - malformed or oversized Relay-like bodies are bounded and secret-free.
- Upstream redirect policy tests (added per SRG-012):
  - Codex upstream 301/302/307/308 do not trigger a second fetch,
  - OAuth Authorization is not re-sent to a redirect destination,
  - 3xx responses are passed through with sanitized `Location` and an empty
    body,
  - automatic redirect follow is disabled (`redirect: "manual"`).
- Relay configuration failure tests (added per SRG-011):
  - `RELAY_SECRET` absent -> `503` / no upstream fetch,
  - empty -> `503` / no upstream fetch,
  - whitespace-only -> `503` / no upstream fetch,
  - configured secret + missing request header -> `401`,
  - configured secret + wrong request header -> `401`,
  - configuration failure body does not include the secret value.
- Custom `fetch` URL ownership tests (added per SRG-013):
  - the AI SDK runtime uses the configured `baseURL` to produce the final
    Gateway URL,
  - the custom `fetch` does not change the request pathname,
  - `/v1` / `/responses` segments are not duplicated,
  - a URL that does not match the expected Gateway shape fails closed before
    forwarding.
- Token claim contract tests (added per SRG-014):
  - the §7.1 spike documents exact account ID / residency claim paths,
  - fixtures use synthetic claim objects only; no real token payloads or secrets
    are included in public tests.
- Refresh single-flight tests (added per SRG-007):
  - N concurrent requests observing expiry trigger exactly one token endpoint
    call,
  - all concurrent requests use the same new access token,
  - a rotated refresh token is saved exactly once,
  - `accountId` updates are consistent with the single refresh result,
  - residency is derived from the new access token,
  - refresh failure propagates the same secret-free error to all waiters with no
    direct fallback,
  - after failure the in-flight state is cleared and a later explicit request
    can start a new refresh.

## 15. Documentation and Migration

- Update the root `README.md` with:
  - installation of `@yohi/cf-ai-gw-relay` as an OpenCode plugin,
  - the new usage flow diagram
    `OpenCode -> cf-ai-gw-relay provider -> Cloudflare AI Gateway -> Deno relay -> ChatGPT Codex`,
  - explicit provider definition in `opencode.json[c]`,
  - selection of `cf-ai-gw-relay/openai/<model>`,
  - distinction from `openai/<model>` and the fact that both can coexist,
  - required ChatGPT OAuth login through the provider,
  - Cloudflare AI Gateway / relay configuration via options and environment
    variables,
  - fail-closed semantics,
  - removal of the old fetch-intercept mode,
  - note that `collectLogPayload` affects Gateway-side logging only.
- Update `SPEC.md` with:
- the new provider namespace,
- the exact `POST /upstream/openai/v1/responses` relay route contract,
- the new control headers and auth header,
- the exact Relay-origin error envelope `{"origin":"relay","error":"<code>"}`
  with the documented status/code table including `relay_not_configured`
  (`503`),
  - `RELAY_SECRET` configuration failure semantics (`503`, no upstream fetch,
    distinguish from `401`),
  - upstream redirect policy (`redirect: "manual"`, no automatic follow, 3xx
    pass-through with sanitized `Location`),
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

## 16. Open Questions Resolved During Brainstorming

| Topic                                  | Decision                                                                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reuse built-in OpenAI OAuth credential | No — public API does not safely support it. The `cf-ai-gw-relay` provider owns its own OAuth flow.                                                                                    |
| Provider/model namespace               | `cf-ai-gw-relay/<upstream-provider>/<model>`; initial upstream `openai` only.                                                                                                         |
| Plugin package name                    | `@yohi/cf-ai-gw-relay`.                                                                                                                                                               |
| Repository package path                | `packages/cf-ai-gw-relay` (renamed from `packages/opencode-plugin`).                                                                                                                  |
| Provider registration path             | `config` hook is primary; `provider` hook is optional/future.                                                                                                                         |
| AI SDK adapter                         | Fixed by the pre-plan compatibility spike in §6.2; the contract is recorded with concrete values and no placeholders. §6.2 remains a blocking gate until spike evidence is recorded.  |
| Protocol adaptation                    | Not required **if** the compatibility spike in §6.2 proves the AI SDK-generated body is accepted unchanged; otherwise the relay applies the transformation the spike identifies.      |
| Transport layer                        | Thin custom `fetch` returned from `auth.loader()`.                                                                                                                                    |
| Relay route                            | `POST /upstream/openai/v1/responses` exactly; other methods/paths are rejected before upstream fetch. Legacy `/v1/responses` removed.                                                 |
| Gateway custom provider slug           | Fixed to `cf-ai-gw-relay`.                                                                                                                                                            |
| Relay auth header                      | `x-relay-authorization`.                                                                                                                                                              |
| OAuth implementation                   | Public OpenCode `auth` hook + standard Web/Node APIs; no OAuth framework dependency.                                                                                                  |
| Callback port                          | Fixed loopback-only port reserved for `cf-ai-gw-relay`; bind before returning auth URL.                                                                                               |
| OAuth client ID                        | Determined by the pre-implementation spike in §7.1; built-in Codex client ID is not assumed.                                                                                          |
| Configuration precedence               | Environment variables > `opencode.json[c]`.                                                                                                                                           |
| Old package/slug backward compat       | Not required.                                                                                                                                                                         |
| Error inspection boundary              | Pass-through for all success/SSE bodies and all Gateway/upstream errors; bounded inspection only for exact Relay-origin documented errors with `{"origin":"relay","error":"<code>"}`. |
| Codex account/residency                | `accountId` is persisted in the public OAuth auth top-level field; residency is derived from the current access token per request. See §7.4.                                          |
| AI SDK `apiKey` bootstrap              | A non-secret plugin-local sentinel is returned from `auth.loader()`; the actual ChatGPT OAuth token is injected by the custom `fetch`. `OPENAI_API_KEY` is not used.                  |
| Gateway custom provider provisioning   | Slug `cf-ai-gw-relay`, `base_url` set to the deployed Deno relay root, enabled. Provisioning is a deployment prerequisite; the plugin does not auto-provision.                        |
