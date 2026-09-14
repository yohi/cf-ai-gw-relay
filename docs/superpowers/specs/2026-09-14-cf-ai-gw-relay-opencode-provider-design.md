# cf-ai-gw-relay OpenCode Dedicated Provider Design

## Status

Draft — pending implementation-plan creation.

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
- Initial standard model: `cf-ai-gw-relay/openai/gpt-5.6-codex` (exact model ID
  may be adjusted to match the current Codex model).
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

The exact AI SDK adapter used by `provider.cf-ai-gw-relay` is not fixed in
this design. Candidates include `@ai-sdk/openai` and
`@ai-sdk/openai-compatible`, or any other OpenCode-supported public runtime
that satisfies the criteria below. The final choice is determined through
integration testing against the supported OpenCode version:

1. Public, stable runtime available in OpenCode.
2. Does not unnecessarily drop or transform Codex-required request semantics.
3. Maintains streaming, abort, and error propagation.
4. Allows a custom `fetch` override.
5. Does not tie the implementation to a fixed model-name list for future Codex
   capability additions.

If `@ai-sdk/openai-compatible` is selected, the generated request form is
OpenAI-compatible `/v1/chat/completions` and compatibility with the relay/Codex
transport is validated by acceptance tests. If `@ai-sdk/openai` / Responses
API is selected, the `<upstream-path>` below changes accordingly.

### 6.3 Custom `fetch` responsibilities

The custom `fetch` returned by `auth.loader()` is a thin transport boundary:

1. Receive the request generated by OpenCode / the AI SDK runtime.
2. Build the Cloudflare AI Gateway destination URL.
3. Add the required control headers.
4. Forward the request to the relay.
5. Return the response without parsing or buffering the body.

The custom `fetch` does **not**:

- intercept or rewrite `openai/*` traffic,
- reinterpret the LLM message schema,
- reconstruct the Codex request body,
- fall back to the direct OpenAI route on relay failure,
- perform broad upstream protocol normalization.

If unavoidable Codex adaptation is required, the adaptation boundary is the
Deno relay, not the plugin.

## 7. ChatGPT OAuth Flow

The `cf-ai-gw-relay` provider owns its ChatGPT OAuth login flow through the
OpenCode `auth` hook.

- `auth.provider` is `"cf-ai-gw-relay"`.
- `auth.methods` contains a method with `type: "oauth"` and a user-facing label.
- `authorize()` returns:
  - a fixed localhost redirect URI and authorization URL,
  - instructions for the user,
  - `method: "auto"` with a callback that starts a local loopback HTTP server
    and waits for the OAuth callback.
- The local callback server binds only to `127.0.0.1` on a fixed port reserved
  for `cf-ai-gw-relay` (not `1455`, which belongs to the built-in Codex flow).
- `authorize()` and the callback use:
  - PKCE code verifier and challenge generated with the runtime `crypto` API,
  - cryptographically secure `state` parameter,
  - strict `state` verification on callback,
  - one-time callback processing,
  - timeout / abort handling.
- The callback exchanges the authorization code for tokens via a direct
  `fetch` to the token endpoint. Token refresh is handled inside `auth.loader()`
  using the stored refresh token and the public `input.client.auth.set()` SDK
  API.
- The custom `fetch` injects the current access token as
  `Authorization: Bearer <access_token>`.
- OAuth `client_id` is a public client ID legitimately usable for
  `cf-ai-gw-relay`. The built-in OpenAI/Codex `client_id` is not assumed as a
  production dependency unless explicit permission/contract compatibility is
  confirmed.
- Tokens, authorization codes, refresh tokens, and request payloads are never
  written to logs, errors, or diagnostics.

OAuth implementation uses only standard Web / Node APIs (`crypto`, `fetch`, the
built-in HTTP server). A dedicated OAuth framework is not added as a runtime
dependency.

## 8. Cloudflare AI Gateway / Relay Destination

- Gateway base origin: `https://gateway.ai.cloudflare.com` (production).
- Custom provider slug: fixed to `cf-ai-gw-relay`.
- Relay authentication header: `x-relay-authorization: Bearer <relaySecret>`.
- Conceptual Gateway URL shape:

  ```text
  {gatewayOrigin}/v1/{accountId}/{gatewayId}/custom-cf-ai-gw-relay/upstream/openai/<upstream-path>
  ```

- The exact `<upstream-path>` is chosen after the AI SDK adapter is selected.
  For an OpenAI-compatible adapter it is likely `v1/chat/completions`; for a
  Responses API adapter it would be the Responses path.
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
- Request body stream, abort signal, and method are preserved.
- Response body is streamed back without parsing or reconstruction.

## 9. Deno Relay `/upstream/openai/*` Route

The Deno relay exposes a new generic route for the OpenAI upstream:

- Route: `POST /upstream/openai/*` where `*` is the upstream path suffix
  (e.g. `v1/chat/completions`).
- Authentication: `x-relay-authorization: Bearer <RELAY_SECRET>`.
- Missing or incorrect authentication returns HTTP `401` with a JSON error
  body and never performs an upstream fetch.
- Header sanitization: apply the existing denylist before the upstream fetch
  (`connection`, `content-length`, `host`, `cf-*`, `x-forwarded-*`,
  `x-relay-authorization`, and others already listed in `SPEC.md`).
- Upstream destination: `https://chatgpt.com/backend-api/codex/responses`.
- Body: forward the request body as received. If the Codex endpoint accepts the
  AI SDK-generated representation directly, no transformation is applied.
- If Codex requires a minimal protocol adaptation, the Deno relay performs that
  adaptation. The relay does **not** become a general OpenAI-to-Codex conversion
  layer.
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
- The Deno relay may return machine-readable HTTP errors (e.g.
  `400 {"error":"unsupported_upstream"}`). The plugin translates these into
  actionable, secret-free OpenCode user errors.
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
  - request and response payloads.
- `collectLogPayload=true` controls Cloudflare AI Gateway-side payload
  logging. The plugin and Deno relay must not log payloads regardless of this
  setting.

## 13. Production Readiness Criteria

Before declaring the new provider model production-ready, verify:

- Request isolation between `openai/*` and `cf-ai-gw-relay/*` traffic.
- Credential handling: OAuth flow, token refresh, and secret-free errors.
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
  - custom `fetch` URL/header rewrite.
- Integration tests use minimal stubs for public OpenCode plugin interfaces
  only. A real-package compatibility test against the chosen minimum
  OpenCode version is included.
- Protected / manual acceptance tests cover live Cloudflare AI Gateway,
  live Deno Deploy relay, and real ChatGPT Codex, including streaming,
  abort, fail-closed, and OAuth login. These require real credentials and are
  not a mandatory CI gate.

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
| AI SDK adapter | Not fixed in this design; chosen by integration testing. |
| Transport layer | Thin custom `fetch` returned from `auth.loader()`. |
| Relay route | `POST /upstream/openai/*`; legacy `/v1/responses` removed. |
| Gateway custom provider slug | Fixed to `cf-ai-gw-relay`. |
| Relay auth header | `x-relay-authorization`. |
| Protocol adaptation | Done in Deno relay only, and only when actually required. |
| OAuth implementation | Public OpenCode `auth` hook + standard Web/Node APIs; no OAuth framework dependency. |
| Callback port | Fixed loopback-only port reserved for `cf-ai-gw-relay`. |
| OAuth client ID | A public client ID legitimately usable for `cf-ai-gw-relay`; built-in Codex client ID is not assumed. |
| Configuration precedence | Environment variables > `opencode.json[c]`. |
| Old package/slug backward compat | Not required. |
