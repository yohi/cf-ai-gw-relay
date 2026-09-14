# cf-ai-gw-relay OpenCode Dedicated Provider Design

## Status

Draft — pending implementation-plan creation.
Blocked until pre-implementation gates in §7.1 and §6.2 are resolved.

## 1. Summary

This design reworks the `cf-ai-gw-relay` OpenCode integration so that the
relay is used through an explicit, dedicated OpenCode provider identity,
rather than by intercepting traffic sent to the built-in OpenAI / ChatGPT
provider.

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
- Introduce a new generic relay route `POST /upstream/openai/*` that the
  plugin targets through Cloudflare AI Gateway.
- Keep the plugin a thin transport boundary: it does not parse or reconstruct
  the request body produced by OpenCode / the selected AI SDK runtime.
- Offload any unavoidable Codex protocol adaptation to the Deno relay.
- Provide a ChatGPT OAuth login flow owned by the `cf-ai-gw-relay` provider,
  using only public OpenCode plugin APIs.
- Preserve fail-closed semantics: relay failures never fall back to the
  direct `openai/*` route.
- Reach a production-ready state for the new provider model.

## 3. Non-goals

- Reuse the built-in OpenAI provider's stored OAuth credential. Public OpenCode
  APIs do not safely support this today, so it is not a hard requirement.
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
- Initial standard model: `cf-ai-gw-relay/openai/gpt-5.6-codex`. The exact
  model ID is fixed by the compatibility spike in §6.2. If the spike proves
  the model is unavailable, the spike must fail the gate and this design must
  be re-approved before planning.
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
- `auth` hook: provide the ChatGPT OAuth login flow for the
  `cf-ai-gw-relay` provider. Return provider options (including a custom
  `fetch`) from `auth.loader()` so that the OpenCode / AI SDK runtime uses
  the relay transport.
- `provider` (`ProviderHook`) hook: keep optional. Do not rely on it as the
  primary provider registration path today. It may be enabled later when
  OpenCode supports registering unknown providers through this hook.

### 6.2 Provider runtime / AI SDK adapter

The AI SDK adapter used by `provider.cf-ai-gw-relay` is **fixed before the
implementation plan is created**. It is selected by a pre-plan compatibility
spike that proves the request/response contract end-to-end against a real
ChatGPT Codex session. The spike is a blocking gate; until it succeeds, this
design remains in Draft and no implementation plan is written.

The chosen adapter and the exact contract it produces are recorded in this
section after the spike. The initial candidate is `@ai-sdk/openai` using the
OpenAI Responses API, because the upstream destination is the Codex
Responses endpoint. If the spike proves that `@ai-sdk/openai-compatible`
produces a compatible request for the same endpoint with lower transformation
burden in the relay, it may be selected instead; in that case this design is
updated with the exact request schema and path before planning.

Selection criteria:

1. Public, stable runtime available in OpenCode.
2. Does not drop or transform Codex-required request semantics.
3. Maintains streaming, abort, and error propagation.
4. Allows a custom `fetch` override.
5. Does not tie the implementation to a fixed model-name list for future Codex
   capability additions.

Post-spike contract (to be filled after the gate succeeds):

- npm package: `___` (e.g. `@ai-sdk/openai` or `@ai-sdk/openai-compatible`).
- Provider model ID / model factory API mode: `___`.
- Exact request path generated by OpenCode: `___`.
- Exact request schema generated by OpenCode: `___`.
- Exact upstream path suffix forwarded to the relay: `___` (e.g.
  `v1/responses`).
- Exact request schema sent to Codex: `___`.
- Success response handling: pass-through streaming `Response` unchanged.
- SSE framing: pass-through unchanged.
- Abort handling: propagate the inbound `AbortSignal` to the upstream `fetch`.
- Error response handling: see §11.

If the spike shows that the generated request body is accepted by the Codex
endpoint without field transformation, the design records that no adaptation is
required. If any field must be renamed, removed, or added, the exact mapping is
recorded here and the relay implements only that mapping.

### 6.3 Custom `fetch` responsibilities

The custom `fetch` returned by `auth.loader()` is a thin transport boundary:

1. Receive the request generated by OpenCode / the AI SDK runtime.
2. Build the Cloudflare AI Gateway destination URL.
3. Add the required control headers.
4. Forward the request to the relay.
5. Return the response without parsing or buffering the body, except for the
   limited, bounded Relay-origin error inspection described in §11.

The custom `fetch` does **not**:

- intercept or rewrite `openai/*` traffic,
- reinterpret the LLM message schema,
- reconstruct the Codex request body,
- fall back to the direct OpenAI route on relay failure,
- perform broad upstream protocol normalization,
- translate arbitrary upstream error bodies.

If unavoidable Codex adaptation is required, the adaptation boundary is the
Deno relay, not the plugin.

## 7. ChatGPT OAuth Flow

The `cf-ai-gw-relay` provider owns its ChatGPT OAuth login flow through the
OpenCode `auth` hook.

### 7.1 Pre-implementation gate: OAuth client availability

Before this design is approved and before any implementation plan is written,
the following OAuth client contract must be determined by a blocking spike:

- The exact OAuth `client_id` to use and the party that owns the client.
- The legal/contractual basis under which `cf-ai-gw-relay` may use that
  client from a third-party OpenCode plugin.
- The authorization endpoint URL.
- The token endpoint URL.
- The exact scope list required for ChatGPT Codex access.
- The exact redirect URI.
- The loopback callback port and whether it is allowed by the registered
  client configuration.
- Whether the redirect URI must be pre-registered and whether the chosen
  port satisfies that registration.
- Any additional required OAuth parameters.
- Confirmation that the flow is a public-client (PKCE, no client secret) flow.
- Relevant license / terms-of-service prerequisites.

The spike must produce documented evidence for each item above. Secret values
are never written into the design or implementation plan; only the contract
and the environment variable / secret store reference are recorded.

Until this gate is satisfied, this design remains in Draft and the provider
implementation must not proceed. If no legitimate public client can be
obtained, the dedicated provider approach is unimplementable and this design
must be abandoned or reworked.

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
- The custom `fetch` injects the current access token as
  `Authorization: Bearer <access_token>`.
- OAuth `client_id` is the public client ID determined by §7.1. The built-in
  OpenAI/Codex `client_id` is not used unless the spike explicitly confirms
  permission and contract compatibility.
- Tokens, authorization codes, refresh tokens, and request payloads are never
  written to logs, errors, or diagnostics.

### 7.3 Callback server lifecycle and cleanup

`authorize()` must create and bind the loopback server before returning the
authorization URL to the user. This eliminates a race where the browser
redirect reaches the port before the listener is ready.

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
necessary semantics without depending on the built-in flow:

- After token exchange, decode the ID / access token claims in a secret-free
  way to extract the ChatGPT account ID and, if present, the Codex residency
  value. The exact claim names are determined during the OAuth spike in §7.1.
- Store the account ID and residency in OpenCode auth metadata using public SDK
  APIs (e.g. `input.client.auth.set()`).
- On token refresh, re-decode the new token and update the stored metadata.
- The custom `fetch` sets `ChatGPT-Account-Id` from stored metadata on every
  Codex-bound request when an account ID is present.
- The custom `fetch` sets `x-openai-internal-codex-residency` from stored metadata
  only when the value is present; the header is omitted when there is no
  residency.
- If token claim decoding fails, the provider fails closed with a clear,
  secret-free error and does not forward a request without required routing
  metadata.
- Account IDs, residency values, decoded claims, and token payloads are never
  logged or emitted in errors.

Only account ID and residency are carried forward; other built-in headers are
not copied unless the spike or Codex contract provides a concrete reason.

## 8. Cloudflare AI Gateway / Relay Destination

- Gateway base origin: `https://gateway.ai.cloudflare.com` (production).
- Custom provider slug: fixed to `cf-ai-gw-relay`.
- Relay authentication header: `x-relay-authorization: Bearer <relaySecret>`.
- Conceptual Gateway URL shape:

  ```text
  {gatewayOrigin}/v1/{accountId}/{gatewayId}/custom-cf-ai-gw-relay/upstream/openai/<upstream-path>
  ```

- The exact `<upstream-path>` is the value fixed by the compatibility spike in
  §6.2 (e.g. `v1/responses`).
- Control headers added by the plugin:
  - `cf-aig-authorization: Bearer <gatewayToken>`
  - `x-relay-authorization: Bearer <relaySecret>`
  - `cf-aig-collect-log: true`
  - `cf-aig-collect-log-payload: true|false`
  - `cf-aig-metadata: {"source":"opencode","auth_type":"chatgpt_subscription","plugin":"cf-ai-gw-relay"}`
  - `cf-aig-skip-cache: true`
  - `cf-aig-max-attempts: 1`
- The `Authorization` header carrying the ChatGPT OAuth access token is
  preserved and passed through the Gateway to the relay.
- The `ChatGPT-Account-Id` and `x-openai-internal-codex-residency` headers
  from §7.4 are preserved and passed through.
- Request body stream, abort signal, and method are preserved.
- Response body is streamed back without parsing or reconstruction, except
  for the limited Relay-origin error inspection described in §11.

## 9. Deno Relay `/upstream/openai/*` Route

The Deno relay exposes a new generic route for the OpenAI upstream:

- Route: `POST /upstream/openai/*` where `*` is the upstream path suffix fixed
  by §6.2 (e.g. `v1/responses`).
- Authentication: `x-relay-authorization: Bearer <RELAY_SECRET>`.
- Missing or incorrect authentication returns HTTP `401` with a JSON error
  body and never performs an upstream fetch.
- Header sanitization: apply the existing denylist before the upstream fetch
  (`connection`, `content-length`, `host`, `cf-*`, `x-forwarded-*`,
  `x-relay-authorization`, and others already listed in `SPEC.md`).
- Upstream destination: `https://chatgpt.com/backend-api/codex/responses`.
- Body: forward the request body as received. If the compatibility spike in
  §6.2 proves that the AI SDK-generated representation requires transformation,
  the exact field mapping is implemented in the relay and recorded here.
  Otherwise the body is forwarded unchanged.
- Streaming: forward the upstream response body stream unchanged.
- Abort: propagate the inbound abort signal to the upstream `fetch`.
- Timeouts: preserve the existing connect/header timeout and SSE idle timeout
  behavior.
- Unsupported upstream slugs (anything other than `openai`) return a
  machine-readable `unsupported_upstream` error before any upstream fetch.
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
  It forwards the HTTP status and response body unchanged to the AI SDK
  runtime, which is responsible for presenting the error to OpenCode.
- The only exception is a Relay-origin error that the relay intentionally
  generates before any upstream fetch, identified by:
  - HTTP status `401` or `400` with `Content-Type: application/json`, and
  - a JSON body containing `"origin":"relay"` and a small set of documented
    machine-readable `error` codes (e.g. `unsupported_upstream`,
    `unauthorized`, `missing_header`).
  For these responses the plugin may read up to 8 KiB of the response body,
  translate the documented code into an actionable, secret-free OpenCode user
  error, and return a synthetic `Response` so that the calling runtime still
  receives a valid response object. The original response body is not consumed
  beyond the bounded read.
- Success responses and SSE streams are never inspected, buffered, or
  reconstructed.
- OAuth refresh failures do not fall back to a direct route; the plugin
  distinguishes re-authentication needs from transient refresh failures
  where possible.
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
- `collectLogPayload=true` controls Cloudflare AI Gateway-side payload
  logging. The plugin and Deno relay must not log payloads regardless of this
  setting.

## 13. Production Readiness Criteria

Before declaring the new provider model production-ready, verify:

- Pre-implementation gates in §7.1 and §6.2 are satisfied and their results are
  documented in this design.
- Request isolation between `openai/*` and `cf-ai-gw-relay/*` traffic.
- Credential handling: OAuth flow, token refresh, account metadata persistence,
  and secret-free errors.
- Streaming and abort propagation end-to-end.
- Error propagation: relay/Gateway/network/provider failures reach the user
  without fallback.
- Fail-closed behavior under all failure modes.
- Unsupported upstream handling.
- Supported OpenCode version boundary validated by an integration test using
  the real `@opencode-ai/plugin` package.
- No reliance on private/internal OpenCode APIs or vendored SDK source.
- No residual production blockers discovered during implementation.

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
  only. A real-package compatibility test against the chosen minimum
  OpenCode version is included.
- Protected / manual acceptance tests cover live Cloudflare AI Gateway,
  live Deno Deploy relay, and real ChatGPT Codex, including streaming,
  abort, fail-closed, and OAuth login. These require real credentials and are
  not a mandatory CI gate.
- OAuth and Codex account metadata tests (added per SRG-003):
  - account metadata is saved after successful OAuth token exchange,
  - account metadata is updated after token refresh,
  - `ChatGPT-Account-Id` is set when metadata contains an account ID and
    omitted when absent,
  - `x-openai-internal-codex-residency` is set when metadata contains a
    residency and omitted when absent,
  - malformed token claims fail secret-free without leaking the token,
  - account/residency headers survive the Gateway/Relay hop unchanged.
- Protocol contract tests (added per SRG-002):
  - the AI SDK-generated request body matches the Codex endpoint contract
    directly, or
  - the exact relay field mapping transforms it correctly.

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
- Update `SPEC.md` with the new provider namespace, the
  `/upstream/openai/*` relay contract, the new control headers and auth
  header, and the removal of the legacy `/v1/responses` route.
- Update `docs/configuration.md` to reflect the new option schema and removed
  settings.
- Update `docs/deployment.md` and `docs/operations.md` if any values or
  runbooks change.
- Keep the changelog in `packages/cf-ai-gw-relay/CHANGELOG.md`, merging prior
  history from the old package name. Add a migration note stating that the old
  fetch-intercept mode and old package name are not supported.

## 16. Open Questions Resolved During Brainstorming

| Topic | Decision |
| --- | --- |
| Reuse built-in OpenAI OAuth credential | No — public API does not safely support it. The `cf-ai-gw-relay` provider owns its own OAuth flow. |
| Provider/model namespace | `cf-ai-gw-relay/<upstream-provider>/<model>`; initial upstream `openai` only. |
| Plugin package name | `@yohi/cf-ai-gw-relay`. |
| Repository package path | `packages/cf-ai-gw-relay` (renamed from `packages/opencode-plugin`). |
| Provider registration path | `config` hook is primary; `provider` hook is optional/future. |
| AI SDK adapter | Fixed by the pre-plan compatibility spike in §6.2; not deferred to implementation. |
| Transport layer | Thin custom `fetch` returned from `auth.loader()`. |
| Relay route | `POST /upstream/openai/*`; exact upstream path suffix fixed by §6.2. Legacy `/v1/responses` removed. |
| Gateway custom provider slug | Fixed to `cf-ai-gw-relay`. |
| Relay auth header | `x-relay-authorization`. |
| Protocol adaptation | Done in Deno relay only, and only when the §6.2 spike proves it is required. Exact mapping is recorded in §6.2 and §9. |
| OAuth implementation | Public OpenCode `auth` hook + standard Web/Node APIs; no OAuth framework dependency. |
| Callback port | Fixed loopback-only port reserved for `cf-ai-gw-relay`; bind before returning auth URL. |
| OAuth client ID | Determined by the pre-implementation spike in §7.1; built-in Codex client ID is not assumed. |
| Configuration precedence | Environment variables > `opencode.json[c]`. |
| Old package/slug backward compat | Not required. |
| Error inspection boundary | Pass-through for all success/SSE bodies; bounded inspection only for Relay-origin documented errors. |
| Codex account/residency | Reproduced by the dedicated provider using metadata from decoded token claims; see §7.4. |
