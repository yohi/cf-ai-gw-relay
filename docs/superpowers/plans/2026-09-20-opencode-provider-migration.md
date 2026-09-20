# OpenCode Provider Routing Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the global fetch interposer with OpenCode 1.18.31's public
`provider.models` and `chat.headers` hooks, so `openai/gpt-5.6-luna` reaches the
Cloudflare AI Gateway Custom Provider while OpenCode retains ChatGPT OAuth
ownership.

**Architecture:** The plugin resolves required configuration during activation
and returns two public hooks. `provider.models` clones only the built-in
`openai` entry for `gpt-5.6-luna`, preserving its capabilities and `api.npm`,
then sets only `id`, `providerID`, `api.id`, and suffix-free `api.url`.
`chat.headers` adds Gateway and relay control headers only when the selected
model is that same OpenAI model; it never replaces `Authorization` or
`ChatGPT-Account-Id`. The AI SDK supplies `/responses`, and the existing relay
directly forwards the resulting `POST /v1/responses` request, response, SSE
stream, and tool continuations.

OpenCode 1.18.31 is the sole ChatGPT OAuth owner. Its official browser or
headless device login populates the user-controlled native `auth.json`; its
built-in provider refreshes and writes that local state. The plugin, relay,
Gateway, GitHub Actions, and protected acceptance workflow never receive or
persist OAuth state. Protected acceptance runs on GitHub-hosted `ubuntu-latest`
and verifies only non-OAuth Gateway/relay boundaries and deterministic
contracts. Live OAuth acceptance is not a CI gate.

**Tech Stack:** TypeScript, `@opencode-ai/plugin` 1.18.31, `@opencode-ai/sdk/v2`
model types, npm/Vitest, Deno 2.x, and GitHub Actions protected acceptance.

**Pre-implementation gate:** `BLOCKED / DESIGN RE-APPROVAL REQUIRED`.

The superseded credential lifecycle is removed. No Task 1 through Task 8 may
start until a fresh Superpowers Review Gate marks this design and plan `READY`.
The fresh review must verify that the selected architecture has no CI OAuth
injection, no OAuth persistence outside the user-controlled OpenCode runtime,
and no alternative credential choice left to the implementation agent. Removing
the unavailable lifecycle is not a pass for `RG-001`; the blocker remains until
that fresh review accepts the authoritative environment evidence and replacement
boundary.

## Global Constraints

- Target runtime is OpenCode `1.18.31`; pin implementation validation to that
  public plugin API.
- Provider identity is exactly `openai`; do not create a `cf-ai-gw-relay`
  provider or model namespace.
- `provider.models` is the sole routing owner, and `model.api.url` is its sole
  selected routing field.
- The initial production mapping is `openai/gpt-5.6-luna` ->
  `model.api.id=gpt-5.6-luna` -> `@ai-sdk/openai 3.0.88` model `gpt-5.6-luna` ->
  wire-body model `gpt-5.6-luna`.
- `model.api.url` is
  `https://gateway.ai.cloudflare.com/v1/<account>/<gateway>/custom-<slug>`;
  encode each configured path component and do not add `/responses` or
  `/v1/responses`.
- The AI SDK appends `/responses`; the Custom Provider `base_url` is
  `https://cf-ai-gw-relay.yohi.deno.net/v1`; the relay route is exactly
  `POST /v1/responses`.
- `REQUEST_PROTOCOL`, `RESPONSE_PROTOCOL`, and `STREAMING_PROTOCOL` are
  `DIRECT_FORWARDING`; `TOOLS = INCLUDED`, including Responses `function_call`
  and `function_call_output` continuation.
- OpenCode exclusively acquires, interprets, refreshes, and injects ChatGPT
  OAuth semantics through its official native auth mechanism. The
  user-controlled OpenCode runtime owns `$XDG_DATA_HOME/opencode/auth.json`,
  defaulting to `$HOME/.local/share/opencode/auth.json`; the plugin and relay
  must not extract, inspect for ownership, persist, refresh, substitute, or log
  OAuth contents.
- GitHub Actions uses GitHub-hosted `ubuntu-latest` for CI and protected
  acceptance. Protected acceptance uses only existing non-OAuth Gateway, relay,
  and provider controls. It must not install or invoke ChatGPT OAuth, require an
  OpenCode auth store, or claim to prove a live OAuth request.
- OAuth state must not be placed in GitHub Secrets, workflow environment values,
  command arguments, generated repository files, artifacts, caches, or logs.
  `OPENCODE_AUTH_CONTENT` is not a selected CI interface because source presence
  does not establish a public supported credential contract.
- OpenCode writes refreshed OAuth state back to the user's local native store.
  CI does not own refreshed OAuth state, credential persistence, or credential
  rotation. Operators reauthorize through official OpenCode login/logout flows.
  No PAT, OAuth-token extraction, alternate OAuth client, or external credential
  broker is allowed.
- `chat.headers` configures `cf-aig-authorization`,
  `x-chatgpt-relay-authorization`, `cf-aig-collect-log`,
  `cf-aig-collect-log-payload`, `cf-aig-metadata`, `cf-aig-skip-cache`, and
  `cf-aig-max-attempts`, without replacing `Authorization` or
  `ChatGPT-Account-Id`.
- `RELAY_CF_AIG_TOKEN` takes precedence over plugin `apiKey`; `RELAY_SECRET`
  takes precedence over plugin `relayToken`; retain all existing configuration
  precedence and validation.
- Preserve explicit `RELAY_CF_AIG_COLLECT_LOG_PAYLOAD` control. Its default is
  `true`; Gateway payload retention and access remain a Cloudflare operator
  boundary and must be documented without recording payloads.
- Fail closed on missing configuration, unsupported host version, missing target
  model, route construction failure, or control-header injection failure. Do not
  leave a direct route or a second routing owner active.
- Do not add a fetch interposer, direct ChatGPT/Codex fallback, retry loop,
  cache, payload persistence, PAT architecture, generic `/upstream/*` route,
  plugin-side body rewrite, or `@ai-sdk/openai` package dependency.
- Keep `apps/deno-relay` free of external runtime dependencies and retain the
  plugin's runtime dependency contract.
- Do not write credentials, account identifiers, raw request payloads, response
  contents, or raw probe logs to source, tests, fixtures, documentation,
  workflow output, or commits.
- Managed residency is `NOT SUPPORTED IN INITIAL SCOPE`; do not infer
  `x-openai-internal-codex-residency` or `X-OpenAI-Fedramp`.
- Do not claim supported production readiness until the OpenCode host-capability
  gate and non-OAuth protected acceptance both pass. Live OAuth acceptance is
  not a CI release gate; requiring it later is `DESIGN RE-APPROVAL REQUIRED`.

---

## File Map

- Modify `packages/opencode-plugin/package.json`, `package-lock.json`,
  `src/host-version.ts`, and `test/package-consistency.test.ts` to pin
  validation to OpenCode 1.18.31 and reject every other host version before
  hooks activate.
- Create `packages/opencode-plugin/src/hooks.ts` to pin the public callback
  types; create `src/provider-models.ts` and `test/provider-models.test.ts` for
  the fixed-model `provider.models` callback and suffix-free Gateway route
  behavior.
- Create `packages/opencode-plugin/src/control-headers.ts` and
  `test/control-headers.test.ts` for model-scoped `chat.headers` control-header
  injection and OAuth header non-ownership.
- Modify `packages/opencode-plugin/src/gateway-url.ts`, `src/plugin.ts`,
  `src/index.ts`, and related tests to activate both public hooks from one
  resolved configuration and export the selected public surface.
- Delete `packages/opencode-plugin/src/interposer.ts`, `src/matcher.ts`, and
  `src/request-rewrite.ts` with their routing tests after the plugin no longer
  imports them.
- Modify `apps/deno-relay/relay_test.ts` for explicit non-stream Responses JSON
  byte/header pass-through and the existing streaming/cancellation/tool
  regressions. This task does not modify `apps/deno-relay/relay.ts`; a failing
  characterization is a plan blocker that requires a separately approved relay
  defect task.
- Keep `.github/workflows/acceptance.yml` on GitHub-hosted `ubuntu-latest` and
  modify its documentation owners in a later implementation task only when the
  non-OAuth boundary assertions change. Create an OAuth-free boundary driver and
  its test under `.github/scripts`; do not create an OpenCode OAuth acceptance
  driver or an OAuth injection helper. The existing
  `apps/deno-relay/acceptance_test.ts` and `acceptance_support.ts` remain the
  relay route test seam.
- Modify `SPEC.md`, `README.md`, `README.ja.md`,
  `packages/opencode-plugin/README.md`, and the design document after migration
  so canonical documentation distinguishes the migrated current route from the
  rejected historical interposer.

## Task 1: Pin the OpenCode 1.18.31 Public Hook Contract

**Files:**

- Modify: `packages/opencode-plugin/package.json`
- Modify: `packages/opencode-plugin/package-lock.json`
- Modify: `packages/opencode-plugin/src/host-version.ts`
- Create: `packages/opencode-plugin/src/hooks.ts`
- Modify: `packages/opencode-plugin/test/host-version.test.ts`
- Modify: `packages/opencode-plugin/test/package-consistency.test.ts`

**Interfaces:**

- Consumes `ProviderHook` and `Hooks` from `@opencode-ai/plugin@1.18.31`.
- Produces `ProviderModelsHook = NonNullable<ProviderHook["models"]>` and
  `ChatHeadersHook = NonNullable<Hooks["chat.headers"]>` from `src/hooks.ts`.
- Produces `SUPPORTED_OPENCODE_RANGE = "1.18.31"` and host rejection for every
  health response outside that exact version.

- [ ] **Step 1: Write failing exact-version tests**

  Change the host-version tests so `1.18.31` is accepted and `1.18.29`,
  `1.18.32`, and an unavailable health response reject with
  `UnsupportedOpenCodeVersionError`. Extend package-consistency coverage to
  require `semver` as the only runtime dependency and reject an `@ai-sdk/openai`
  package dependency.

  ```ts
  expect(() => assertSupportedHost({ available: true, version: "1.18.31" }))
    .not.toThrow();
  expect(() => assertSupportedHost({ available: true, version: "1.18.32" }))
    .toThrow(UnsupportedOpenCodeVersionError);
  expect(Object.keys(pkg.dependencies)).toEqual(["semver"]);
  expect(pkg.dependencies["@ai-sdk/openai"]).toBeUndefined();
  ```

- [ ] **Step 2: RED — run the focused test to confirm the old range fails it**

  Run from `packages/opencode-plugin`:

  ```bash
  npm ci --ignore-scripts
  npm test -- --run test/host-version.test.ts test/package-consistency.test.ts
  ```

  Expected: FAIL because the current range accepts `1.18.29` and the package
  still resolves `@opencode-ai/plugin` 1.18.29.

- [ ] **Step 3: Minimum GREEN — pin the host package and supported range**

  Set `@opencode-ai/plugin` in `devDependencies` to exact `1.18.31`, update the
  lockfile through `npm install --package-lock-only --ignore-scripts`, and set
  the host range constant and `engines.opencode` to exact `1.18.31`. Retain the
  peer dependency as `>=1.18.31 <1.18.32` so consumers cannot install the
  package with a host whose selected hook lifecycle was not pinned.

  ```ts
  export const SUPPORTED_OPENCODE_RANGE = "1.18.31";
  ```

- [ ] **Step 4: GREEN — typecheck the public callback surface**

  Create `src/hooks.ts` so TypeScript compiles the exact public callback types
  from the pinned package. Later tasks must use these aliases instead of
  recreating host callback signatures.

  ```ts
  import type { Hooks, ProviderHook } from "@opencode-ai/plugin";

  export type ProviderModelsHook = NonNullable<ProviderHook["models"]>;
  export type ChatHeadersHook = NonNullable<Hooks["chat.headers"]>;
  ```

  Run:

  ```bash
  npm run typecheck
  npm test -- --run test/host-version.test.ts test/package-consistency.test.ts
  ```

  Expected: PASS using only declarations provided by OpenCode 1.18.31.

- [ ] **Step 5: Record the refactor decision and commit the pinned contract**

  Refactor decision: none. The callback aliases remain in `src/hooks.ts` so all
  later tasks consume the pinned host declarations without recreating them.

  ```bash
  git add packages/opencode-plugin/package.json packages/opencode-plugin/package-lock.json packages/opencode-plugin/src/host-version.ts packages/opencode-plugin/src/hooks.ts packages/opencode-plugin/test/host-version.test.ts packages/opencode-plugin/test/package-consistency.test.ts
  git commit -m "test: pin OpenCode provider hook contract"
  ```

## Task 2: Add the Fixed-Model Gateway Route

**Files:**

- Modify: `packages/opencode-plugin/src/gateway-url.ts`
- Modify: `packages/opencode-plugin/test/gateway-url.test.ts`
- Create: `packages/opencode-plugin/src/provider-models.ts`
- Create: `packages/opencode-plugin/test/provider-models.test.ts`

**Interfaces:**

- Consumes `ResolvedConfig` from `src/config.ts` and source `Provider`/`Model`
  values supplied by OpenCode.
- Produces `buildGatewayModelUrl(config: ResolvedConfig): string`.
- Produces `createProviderModels(config: ResolvedConfig): ProviderModelsHook`.
- The callback returns `Promise<Record<string, Model>>` containing only the key
  `gpt-5.6-luna` when `provider.id === "openai"` and that source model exists.

- [ ] **Step 1: Write failing route and model-selection tests**

  Build a complete source model fixture with a non-default `api.npm`,
  capability, cost, limit, headers, and options. Assert that the output
  preserves every source property except the four selected routing fields and
  that the URL has no operation suffix.

  ```ts
  expect(result["gpt-5.6-luna"].api).toMatchObject({
    id: "gpt-5.6-luna",
    npm: "@ai-sdk/openai",
    url: "https://gateway.ai.cloudflare.com/v1/acct/gw/custom-relay-chatgpt",
  });
  expect(result["gpt-5.6-luna"].capabilities).toEqual(source.capabilities);
  expect(result["gpt-5.6-luna"].api.url).not.toMatch(/\/responses$/);
  ```

  Add rejection cases for provider ID `anthropic` and an OpenAI provider missing
  `gpt-5.6-luna`.

- [ ] **Step 2: RED — run focused tests to confirm they fail**

  ```bash
  npm test -- --run test/gateway-url.test.ts test/provider-models.test.ts
  ```

  Expected: FAIL because `buildGatewayModelUrl()` and `createProviderModels()`
  do not exist.

- [ ] **Step 3: Minimum GREEN — implement the suffix-free URL builder**

  Preserve `buildGatewayUrl()` only until Task 4 removes its last caller. Add
  the model URL helper with the existing allowlisted base origin and one
  `encodeURIComponent` call per path component.

  ```ts
  export function buildGatewayModelUrl(config: ResolvedConfig): string {
    const base = new URL(config.gatewayBaseUrl);
    return `${base.origin}/v1/${encodeURIComponent(config.accountId)}` +
      `/${encodeURIComponent(config.gatewayId)}` +
      `/custom-${encodeURIComponent(config.providerSlug)}`;
  }
  ```

- [ ] **Step 4: Minimum GREEN — implement the public provider callback**

  In `provider-models.ts`, reject a non-OpenAI provider or a missing target
  model with `PluginConfigurationError`. Clone only
  `provider.models["gpt-5.6-luna"]`; do not rewrite the model body, headers,
  OAuth data, aliases, or other provider models.

  ```ts
  return {
    "gpt-5.6-luna": {
      ...source,
      id: "gpt-5.6-luna",
      providerID: "openai",
      api: {
        ...source.api,
        id: "gpt-5.6-luna",
        url: buildGatewayModelUrl(config),
      },
    },
  };
  ```

- [ ] **Step 5: GREEN — verify the route owner**

  ```bash
  npm run typecheck
  npm test -- --run test/gateway-url.test.ts test/provider-models.test.ts
  ```

  Expected: PASS with the suffix-free Gateway URL and exactly one fixed model
  owner.

- [ ] **Step 6: Record the refactor decision and commit the route owner**

  Refactor decision: none. Keep URL construction and model selection in the two
  named helpers; do not introduce another route owner or a compatibility alias.

  ```bash
  git add packages/opencode-plugin/src/gateway-url.ts packages/opencode-plugin/src/provider-models.ts packages/opencode-plugin/test/gateway-url.test.ts packages/opencode-plugin/test/provider-models.test.ts
  git commit -m "feat: add OpenCode provider model routing"
  ```

## Task 3: Move Gateway and Relay Headers to `chat.headers`

**Files:**

- Create: `packages/opencode-plugin/src/control-headers.ts`
- Create: `packages/opencode-plugin/test/control-headers.test.ts`
- Modify: `packages/opencode-plugin/test/config.test.ts` for the existing
  configuration-precedence assertions
- Do not modify: `packages/opencode-plugin/src/config.ts`; consume its existing
  `ResolvedConfig` type read-only

**Interfaces:**

- Consumes `ResolvedConfig` and the public `ChatHeadersHook` input/output
  contract from `src/hooks.ts`.
- Produces `createChatHeaders(config: ResolvedConfig): ChatHeadersHook`.
- Adds control headers only when `input.model.providerID === "openai"` and
  `input.model.id === "gpt-5.6-luna"`.

- [ ] **Step 1: Write failing header-boundary tests**

  Start with pre-populated OpenCode-owned headers and an unrelated header.
  Assert exact control values for the target model, no mutation for a non-target
  model, and no deletion or replacement of OpenCode OAuth/account routing
  values.

  ```ts
  const output = {
    headers: {
      Authorization: "Bearer opaque-oauth",
      "ChatGPT-Account-Id": "opaque-account",
      "X-Caller-Header": "preserve",
    },
  };
  await hook(targetInput, output);
  expect(output.headers.Authorization).toBe("Bearer opaque-oauth");
  expect(output.headers["ChatGPT-Account-Id"]).toBe("opaque-account");
  expect(output.headers["x-chatgpt-relay-authorization"])
    .toBe("Bearer sentinel-relay-token");
  ```

  Cover both `collectLogPayload: true` and `false`, and assert the static
  `cf-aig-metadata` JSON value exactly. Also assert that the hook neither adds
  `x-openai-internal-codex-residency` nor `X-OpenAI-Fedramp` nor changes either
  header when the host already supplied it.

- [ ] **Step 2: RED — run the focused test to confirm it fails**

  ```bash
  npm test -- --run test/control-headers.test.ts
  ```

  Expected: FAIL because the `chat.headers` hook has not been implemented.

- [ ] **Step 3: Minimum GREEN — implement model-scoped header injection**

  Move `METADATA_HEADER_VALUE` and the exact seven control values into
  `control-headers.ts`. Assign only those lower-case control-header keys on the
  output object. Do not accept or read `ctx.auth`, `Authorization`,
  `ChatGPT-Account-Id`, residency headers, or request body data.

  ```ts
  output.headers["cf-aig-authorization"] = `Bearer ${config.gatewayToken}`;
  output.headers["x-chatgpt-relay-authorization"] =
    `Bearer ${config.relayToken}`;
  output.headers["cf-aig-collect-log-payload"] = config.collectLogPayload
    ? "true"
    : "false";
  ```

- [ ] **Step 4: GREEN — verify header isolation and configuration precedence**

  Add tests proving the hook receives the exact resolved configuration for both
  credential precedence paths and never writes OpenCode-owned headers. Keep
  activation-time missing-configuration rejection in Task 4, where the plugin
  has been integrated. Run:

  ```bash
  npm run typecheck
  npm test -- --run test/control-headers.test.ts test/config.test.ts
  ```

  Expected: PASS; no test fixture contains a real credential or request body.

- [ ] **Step 5: Record the refactor decision and commit the public header seam**

  Refactor decision: none. Keep the existing `ResolvedConfig` producer and
  isolate the public `chat.headers` consumer in `control-headers.ts`; do not
  alter configuration resolution or add an OAuth-facing seam.

  ```bash
  git add packages/opencode-plugin/src/control-headers.ts packages/opencode-plugin/test/control-headers.test.ts packages/opencode-plugin/test/config.test.ts
  git commit -m "feat: inject Gateway control headers through OpenCode"
  ```

## Task 4: Activate the Two Public Hooks and Remove Global Routing

**Files:**

- Modify: `packages/opencode-plugin/src/plugin.ts`
- Modify: `packages/opencode-plugin/src/index.ts`
- Modify: `packages/opencode-plugin/test/plugin.test.ts`
- Delete: `packages/opencode-plugin/src/interposer.ts`
- Delete: `packages/opencode-plugin/src/matcher.ts`
- Delete: `packages/opencode-plugin/src/request-rewrite.ts`
- Delete: `packages/opencode-plugin/test/interposer.test.ts`
- Delete: `packages/opencode-plugin/test/matcher.test.ts`
- Delete: `packages/opencode-plugin/test/request-rewrite.test.ts`

**Interfaces:**

- Consumes `assertSupportedHost`, `resolveHostVersionCapabilityAsync`,
  `resolveConfig`, `createProviderModels`, and `createChatHeaders`.
- Produces `CloudflareAiGatewayChatgpt: Plugin`, returning exactly
  `{ provider: { id: "openai", models }, "chat.headers": headers }`.
- Produces no global mutation and no export for `installFetchInterposer`,
  `rewriteCodexRequest`, or `isChatgptCodexResponsesRequest`.

- [ ] **Step 1: Replace plugin integration expectations with failing hook
      tests**

  Update `plugin.test.ts` to stub only the health endpoint and provide required
  configuration. Assert the returned hooks exist, `globalThis.fetch` remains
  identical, and both failed host validation and failed configuration reject
  before any hook object is returned.

  ```ts
  const fetchBeforeActivation = globalThis.fetch;
  const hooks = await CloudflareAiGatewayChatgpt(input, options);
  expect(hooks.provider?.id).toBe("openai");
  expect(hooks.provider?.models).toBeTypeOf("function");
  expect(hooks["chat.headers"]).toBeTypeOf("function");
  expect(globalThis.fetch).toBe(fetchBeforeActivation);
  ```

- [ ] **Step 2: RED — run the integration test to confirm the interposer fails
      it**

  ```bash
  npm test -- --run test/plugin.test.ts
  ```

  Expected: FAIL because the current plugin returns `{}` and mutates global
  `fetch` after successful activation.

- [ ] **Step 3: Minimum GREEN — integrate one resolved configuration into both
      hooks**

  Retain host validation first, resolve configuration exactly once, then return
  the two selected public hooks. Do not defer configuration to a request-time
  callback and do not call the interposer.

  ```ts
  assertSupportedHost(await resolveHostVersionCapabilityAsync(input));
  const config = resolveConfig(process.env, (options ?? {}) as PluginOptions);
  return {
    provider: { id: "openai", models: createProviderModels(config) },
    "chat.headers": createChatHeaders(config),
  };
  ```

- [ ] **Step 4: Minimum GREEN — remove every legacy routing symbol and its
      tests**

  Delete the three legacy source files and their tests. Remove their exports
  from `index.ts`; export `buildGatewayModelUrl`, `createProviderModels`,
  `createChatHeaders`, and the metadata constant instead. Confirm no selected
  source or test imports a legacy symbol:

  ```bash
  git grep -n "installFetchInterposer\|rewriteCodexRequest\|isChatgptCodexResponsesRequest\|globalThis.fetch =" -- packages/opencode-plugin/src packages/opencode-plugin/test
  ```

  Expected: no matches.

- [ ] **Step 5: GREEN — run the full plugin gate**

  ```bash
  npm run typecheck
  npm test
  npm run build
  ```

  Expected: PASS, with no global mutation and no legacy routing symbol on the
  selected source path.

- [ ] **Step 6: Record the refactor decision and commit the owner migration**

  Refactor decision: none. The selected hooks remain the only routing and
  control-header owners; do not retain a compatibility wrapper around the
  deleted interposer.

  ```bash
  git add packages/opencode-plugin/src packages/opencode-plugin/test
  git commit -m "refactor: remove legacy OpenCode fetch routing"
  ```

## Task 5: Lock the Fixed Relay Direct-Forwarding Contract

**Files:**

- Modify: `apps/deno-relay/relay_test.ts`
- Do not modify: `apps/deno-relay/relay.ts`

**Interfaces:**

- Consumes `createRelayHandler()` and its fixed request path
  `POST /v1/responses`.
- Produces regression coverage that preserves upstream non-stream JSON status,
  body bytes, and allowed headers; preserves SSE bytes and cancellation; and
  removes relay-only, Gateway-only, hop-by-hop, and forwarding request headers
  before the fixed Codex upstream.

- [ ] **Step 1: Add characterization/regression coverage for non-stream
      Responses**

  Create an authenticated relay request with an opaque `Authorization`,
  `ChatGPT-Account-Id`, Gateway headers, and relay credential. Return synthetic
  `application/json` upstream responses with status `200` and `429` plus opaque,
  non-secret Responses-shaped bodies. Assert each status/body remains unchanged
  so an upstream protocol error remains visible at its owning boundary. This is
  a characterization/regression test for the already selected direct-forwarding
  contract, not a RED test for a planned relay source change.

  ```ts
  const body = '{"object":"response","status":"completed"}';
  assertEquals(response.status, 200, "response status");
  assertEquals(response.headers.get("content-type"), "application/json");
  assertEquals(await response.text(), body, "response body");
  assertEquals(upstream.headers.get("authorization"), "Bearer opaque-oauth");
  assertEquals(upstream.headers.get("x-chatgpt-relay-authorization"), null);
  assertEquals(upstream.headers.get("cf-aig-authorization"), null);
  ```

- [ ] **Step 2: Confirm the characterization is GREEN before source changes**

  ```bash
  deno test apps/deno-relay/relay_test.ts
  ```

  Expected before any production change: PASS. If it fails, stop Task 5 and
  record the exact failing assertion as a separate relay defect requiring a new
  approved RED/GREEN task; do not edit `relay.ts` under this plan.

- [ ] **Step 3: Add Responses stream and tool-continuation regression fixtures**

  Extend the existing SSE cancellation test with a synthetic event stream
  containing `response.output_text.delta`,
  `response.function_call_arguments.done`, and `response.completed`. Assert the
  response body bytes are unchanged and downstream cancellation both cancels the
  upstream body and aborts the upstream request. Add an upstream reader-error
  case that reaches the client as a stream error without a retry or fallback.
  Use a separate request fixture containing a `function_call_output` input item
  and assert the raw request bytes reach upstream unchanged.

- [ ] **Step 4: Run the relay quality gate**

  ```bash
  deno test apps/deno-relay .github/scripts
  deno fmt --check
  deno lint
  ```

  Expected: PASS with no generic `/upstream/*` test enabled and no retry,
  caching, body normalization, or payload persistence introduced.

- [ ] **Step 5: Record the refactor decision and commit relay contract
      coverage**

  Refactor decision: none. The relay source remains unchanged because this task
  locks existing direct forwarding rather than introducing a new implementation.

  ```bash
  git add apps/deno-relay/relay_test.ts
  git commit -m "test: lock relay Responses forwarding contract"
  ```

## Task 6: Keep Protected Acceptance GitHub-Hosted and OAuth-Free

**Files:**

- Create: `.github/scripts/opencode_provider_acceptance.ts`
- Create: `.github/scripts/opencode_provider_acceptance_test.ts`
- Inspect: `.github/workflows/acceptance.yml`
- Inspect: `apps/deno-relay/acceptance_test.ts`
- Inspect: `apps/deno-relay/acceptance_support.ts`
- Modify only if the migrated non-OAuth boundary contract requires it:
  `.github/workflows/acceptance.yml`, `docs/configuration.md`,
  `docs/operations.md`

**Interfaces:**

- Consumes the existing non-OAuth Gateway, relay, and provider acceptance
  variables/secrets already defined by the `protected-acceptance` Environment.
- Does not consume an OpenCode auth store, OAuth JSON, PAT, or any credential
  injection interface.
- The existing test seam remains `apps/deno-relay/acceptance_test.ts` and
  `apps/deno-relay/acceptance_support.ts`. If a reusable boundary helper is
  needed, its exact interface is:

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

- The workflow remains `runs-on: ubuntu-latest`, uses the `protected-acceptance`
  Environment, and reports only named result classes.
- `RELAY_ACCEPTANCE_ORIGIN` remains owned by the existing
  `apps/deno-relay/acceptance_test.ts` direct relay checks. The new boundary
  driver intentionally does not consume it because both scenarios go through the
  configured Gateway Custom Provider route; this is a responsibility split, not
  a removal from workflow configuration. The workflow configuration step must
  still require all six existing `RELAY_ACCEPTANCE_*` values.
- No workflow step may install, invoke, inspect, export, or persist ChatGPT
  OAuth state. Live OpenCode OAuth acceptance is explicitly outside this task.

- [ ] **Step 1: RED — write the failing boundary contract test**

Add `.github/scripts/opencode_provider_acceptance_test.ts` before the driver
exists. Import `runBoundaryAcceptance` from the not-yet-created
`./opencode_provider_acceptance.ts` module so the RED result has one
deterministic missing-module cause. Test the exact `BoundaryProbe`,
`BoundaryAcceptanceDependencies`, required environment names, and both scenarios
with non-secret sentinels:

```ts
const testEnvironment = {
  RELAY_ACCEPTANCE_RELAY_SECRET: "relay-sentinel",
  RELAY_ACCEPTANCE_GATEWAY_BASE_URL:
    "https://gateway.ai.cloudflare.com/v1/acct/gateway",
  RELAY_ACCEPTANCE_GATEWAY_TOKEN: "gateway-sentinel",
  RELAY_ACCEPTANCE_COMMAND_CODE_API_KEY: "provider-sentinel",
  RELAY_ACCEPTANCE_MODEL: "gpt-5.6-luna",
};

const probe: BoundaryProbe = async (scenario) =>
  scenario ===
      "valid-gateway-invalid-relay"
    ? { status: 401, responseClass: "relay-rejected" }
    : { status: 403, responseClass: "gateway-rejected" };

await runBoundaryAcceptance({ env: testEnvironment, probe });
```

Require rejection for a missing environment value, a wrong status, a wrong
response class, and an unexpected relay response class. Assert that the driver
makes exactly one probe per scenario, uses no command runner, does not invoke
OpenCode, and retains no response body or credential value.

- [ ] **Step 2: RED — run the focused contract test**

  Run exactly:

  ```bash
  deno test .github/scripts/opencode_provider_acceptance_test.ts
  ```

  Expected: `FAIL` before any test body executes because
  `.github/scripts/opencode_provider_acceptance.ts` does not yet exist and the
  test import produces a Deno module-not-found error. This RED check requires no
  network access, GitHub Environment, OpenCode installation, or OAuth
  credential. Do not accept a network, credential, assertion, or unrelated
  permission failure as the contract RED result.

- [ ] **Step 3: Keep the repository-owned acceptance workflow GitHub-hosted**

  After recording the deterministic RED result, retain
  `.github/workflows/acceptance.yml` on `runs-on: ubuntu-latest`, retain the
  `protected-acceptance` Environment, and keep the existing `RELAY_ACCEPTANCE_*`
  variables and secrets. Do not install Node.js or OpenCode for this task, do
  not create an OAuth precondition, and do not add a GitHub Secret containing
  OAuth state.

  Add one explicit step named `Run provider boundary acceptance` that runs
  `deno run --allow-net --allow-env .github/scripts/opencode_provider_acceptance.ts`.
  The step may observe only status and response class. It must not use
  `--allow-read`, `--allow-run`, artifacts, caches, generated auth files, or
  command arguments containing credentials. A missing or invalid
  `RELAY_ACCEPTANCE_*` value fails closed before any probe.

  The existing `apps/deno-relay/acceptance_test.ts` remains the owner of the
  relay route checks. The new boundary driver owns only the two explicit
  Gateway/relay authentication observations; it does not duplicate streaming,
  tool continuation, cancellation, or model-runtime assertions from Tasks 4
  and 5.

- [ ] **Step 4: Minimum GREEN — implement the boundary driver**

  Implement `.github/scripts/opencode_provider_acceptance.ts` in this order:

  1. Read and validate `RELAY_ACCEPTANCE_RELAY_SECRET`,
     `RELAY_ACCEPTANCE_GATEWAY_BASE_URL`, `RELAY_ACCEPTANCE_GATEWAY_TOKEN`,
     `RELAY_ACCEPTANCE_COMMAND_CODE_API_KEY`, and `RELAY_ACCEPTANCE_MODEL`
     without printing values. Require `RELAY_ACCEPTANCE_MODEL` to be
     `gpt-5.6-luna`; do not select a model from an OAuth response.
  2. Build the fixed non-sensitive body
     `{"model":"gpt-5.6-luna","input":[],"stream":false}`.
  3. For `BoundaryProbe("valid-gateway-invalid-relay")`, use the protected
     Gateway token and a fixed invalid relay sentinel. Require HTTP 401 and the
     relay's fixed unauthorized response class.
  4. For `BoundaryProbe("invalid-gateway-valid-relay")`, use a fixed invalid
     Gateway sentinel and the protected relay token. Require Gateway HTTP 401 or
     403 and reject the relay's fixed unauthorized response class.
  5. Define `MAX_BOUNDARY_RESPONSE_BYTES = 4096`. Read at most 4097 bytes before
     classifying the fixed unauthorized response, then cancel the body. Never
     perform an unbounded drain. Exceeding the limit, a read failure, or a
     non-matching response class fails closed. Retain only `status` and
     `responseClass`; never log or store the response body. Perform exactly one
     request per scenario, with no retry, fallback, OAuth lookup, OpenCode
     invocation, or payload persistence.

  After implementation, run:

  ```bash
  deno test .github/scripts/opencode_provider_acceptance_test.ts
  deno run --allow-net --allow-env .github/scripts/opencode_provider_acceptance.ts
  ```

  Expected: `PASS`; the focused contract tests use only non-secret sentinels,
  and the manual driver reports named boundary outcomes without response bodies
  or credentials.

- [ ] **Step 5: Document the payload and credential boundary**

  In `docs/configuration.md` and `docs/operations.md`, keep
  `RELAY_CF_AIG_COLLECT_LOG_PAYLOAD` default `true`, state that payload logging
  is controlled at the Cloudflare Gateway boundary, and direct operators to
  their Gateway retention/access policy. Document that protected acceptance is
  GitHub-hosted, uses only the existing non-OAuth `RELAY_ACCEPTANCE_*` controls,
  and verifies only Gateway/relay boundary status classes. State that OpenCode
  OAuth is acquired, stored, refreshed, and injected only by the user's local
  OpenCode 1.18.31 runtime and is never supplied to CI, the repository, or the
  relay. State that the repository does not store payloads, raw probes, or
  OpenCode credentials.

- [ ] **Step 6: Validate workflow wiring and commit**

  ```bash
  deno test .github/scripts/opencode_provider_acceptance_test.ts
  deno test apps/deno-relay/acceptance_test.ts
  actionlint .github/workflows/acceptance.yml
  git grep -n "opencode_provider_acceptance.ts\|runs-on: ubuntu-latest\|RELAY_ACCEPTANCE_" -- .github/workflows/acceptance.yml
  deno fmt --check
  git diff --check
  git add .github/scripts/opencode_provider_acceptance.ts .github/scripts/opencode_provider_acceptance_test.ts .github/workflows/acceptance.yml docs/configuration.md docs/operations.md
  git commit -m "test: add protected provider boundary acceptance"
  ```

  Expected: all focused and existing acceptance tests pass, `actionlint` passes,
  and the grep output shows the boundary driver step, `ubuntu-latest`, and all
  six existing acceptance variable names. The workflow must not skip the new
  boundary step. No OAuth credential, raw response, or request payload appears
  in logs, artifacts, caches, fixtures, or summaries. Refactor decision: none;
  this task adds only the bounded boundary driver and its explicitly owned
  probes.

## Task 7: Update Canonical Current-Path Documentation

**Files:**

- Modify: `SPEC.md`
- Modify: `README.md`
- Modify: `README.ja.md`
- Modify: `packages/opencode-plugin/README.md`
- Modify:
  `docs/superpowers/specs/2026-09-14-cf-ai-gw-relay-opencode-provider-design.md`

**Interfaces:**

- Consumes the migrated implementation and its passing deterministic checks.
- Produces canonical descriptions of `openai` -> `provider.models` -> Gateway
  Custom Provider -> relay `POST /v1/responses`, while retaining generic
  `/upstream/*` only as planned behavior.

- [ ] **Step 1: Write a documentation consistency checklist**

  Enumerate the exact statements that must agree: provider identity `openai`,
  target model `gpt-5.6-luna`, suffix-free `model.api.url`, AI SDK-owned
  `/responses`, seven plugin control headers, OpenCode OAuth ownership, direct
  forwarding, tools included, managed residency unsupported, and no
  fallback/retry/cache/payload persistence.

- [ ] **Step 2: Replace active-interposer wording**

  Update current-path text in `SPEC.md`, both root READMEs, and the plugin
  README. Mark `installFetchInterposer()`, `buildGatewayUrl()`, matching, and
  request rewrite only as removed historical implementation details; do not call
  any of them an active route or fallback.

- [ ] **Step 3: Update the design document's implementation boundary**

  Change only its statements that say the repository source remains on the
  legacy interposer path. Preserve its design evidence, security boundaries, and
  statement that production readiness still requires the host-capability and
  protected-acceptance gates.

- [ ] **Step 4: Run cross-document checks**

  ```bash
  git grep -n "fetch interposer\|installFetchInterposer\|/v1/responses\|provider.models\|chat.headers\|gpt-5.6-luna" -- README.md README.ja.md SPEC.md packages/opencode-plugin/README.md docs
  git diff --check
  ```

  Expected: every active-path statement names the public hooks; any legacy
  reference is explicitly historical; no document exposes credentials or raw
  probe data.

- [ ] **Step 5: Commit documentation synchronization**

  ```bash
  git add SPEC.md README.md README.ja.md packages/opencode-plugin/README.md docs/superpowers/specs/2026-09-14-cf-ai-gw-relay-opencode-provider-design.md
  git commit -m "docs: record OpenCode provider route"
  ```

## Task 8: Execute the Full Verification and Design-to-Plan Gate

**Files:**

- Inspect only: source, tests, workflow, package metadata, and canonical
  documentation
- Modify: none. A failed verification returns to the owning task and requires a
  plan revision before any source or documentation repair.

**Interfaces:**

- Consumes the completed task outputs.
- Produces a recorded design-to-plan consistency result covering specification,
  terminology, types, error handling, test strategy, and non-functional
  constraints before production implementation is treated as eligible.

- [ ] **Step 1: Run all deterministic checks from clean dependencies**

  ```bash
  deno test apps/deno-relay .github/scripts
  deno fmt --check
  deno lint
  cd packages/opencode-plugin
  npm ci --ignore-scripts
  npm run typecheck
  npm test
  npm run build
  ```

  Expected: every command exits zero.

- [ ] **Step 2: Verify source-level single ownership and credential boundaries**

  ```bash
  git grep -n "globalThis.fetch =\|installFetchInterposer\|rewriteCodexRequest" -- packages/opencode-plugin/src
  git grep -n "CODEX_ACCESS_TOKEN\|x-relay-authorization" -- packages/opencode-plugin/src
  git grep -n "provider:.*openai\|provider.models\|chat.headers\|x-chatgpt-relay-authorization" -- packages/opencode-plugin/src
  ```

  Expected: the first two commands have no matches; the third identifies one
  plugin route owner through `provider.models` and one control-header hook
  through `chat.headers`. The relay may retain `x-relay-authorization` only in
  its untrusted-header sanitization denylist.

- [ ] **Step 3: Run the protected acceptance manually**

  Dispatch `.github/workflows/acceptance.yml` on its existing GitHub-hosted
  `ubuntu-latest` runner with the `protected-acceptance` Environment and capture
  the run result without displaying secrets or raw request/response data:

  ```bash
  dispatch_started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  gh workflow run acceptance.yml --repo yohi/cf-ai-gw-relay --ref master
  run_ids=''
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    run_ids=$(gh run list --repo yohi/cf-ai-gw-relay --workflow acceptance.yml \
      --event workflow_dispatch --branch master --limit 20 \
      --json databaseId,createdAt | \
      jq -r --arg started "$dispatch_started_at" \
        '[.[] | select(.createdAt >= $started) | .databaseId] | .[]')
    [ -n "$run_ids" ] && break
    sleep 3
  done
  test "$(printf '%s\n' "$run_ids" | awk 'NF {count += 1} END {print count + 0}')" = 1
  run_id="$run_ids"
  gh run watch "$run_id" --repo yohi/cf-ai-gw-relay --exit-status
  test "$(gh run view "$run_id" --repo yohi/cf-ai-gw-relay \
    --json conclusion --jq '.conclusion')" = success
  test "$(gh run view "$run_id" --repo yohi/cf-ai-gw-relay --json jobs \
    --jq '[.jobs[].steps[] | select(.name == "Run provider boundary acceptance") | .conclusion] | if length == 1 then .[0] else "missing-or-ambiguous" end')" = success
  gh run view "$run_id" --repo yohi/cf-ai-gw-relay --json jobs \
    --jq '.jobs[] | [.name, .status, .conclusion] | @tsv'
  ```

  The run lookup is deliberately fail-closed: if the timestamp filter returns
  zero or more than one candidate, stop without treating any run as evidence.
  GitHub's dispatch endpoint does not return a run ID; this check therefore
  refuses ambiguous near-concurrent dispatches rather than selecting one.
  Require the workflow conclusion and the boundary-driver step to be `success`;
  a skipped boundary-driver step, missing configuration validation, ignored
  local test, or a workflow with only generic tests ignored is not acceptance
  evidence. The workflow configuration step must validate all six existing
  `RELAY_ACCEPTANCE_*` values, including `RELAY_ACCEPTANCE_ORIGIN`; the new
  boundary driver may consume only its documented Gateway/relay subset. A
  missing host capability, inability to inject headers through `chat.headers`,
  failed Gateway/relay boundary probe, or failed deterministic relay check
  blocks supported production use. Do not add a live OpenCode OAuth, non-stream,
  cancellation, or tool-choice assertion here.

  This is a future implementation-stage verification command. During this
  document-only correction, the current workflow is intentionally not modified
  and therefore does not yet contain the Task 6 boundary-driver step. Do not
  dispatch the workflow or treat the current absence of that future step as a
  production-acceptance result.

- [ ] **Step 4: Perform the design-to-plan consistency review without edits**

  Compare this implementation and all test outcomes against every global
  constraint at the top of this plan and §§1-12 of
  `docs/superpowers/specs/2026-09-14-cf-ai-gw-relay-opencode-provider-design.md`.
  Produce only a review note containing command names, runtime version,
  pass/fail status, and bounded error categories; Task 8 must not edit source,
  tests, workflow, configuration, or documentation. If any divergence changes
  provider identity, credential architecture, public extension point, component
  boundary, security model, protocol owner, or SDK family/major version, record
  `DESIGN RE-APPROVAL REQUIRED`, stop, and return to the owning task for an
  explicit plan revision.

- [ ] **Step 5: Hand off the verified migration result**

  ```bash
  git status --short
  git diff --check
  ```

  Expected: Task 8 creates no catch-all source or documentation change and no
  commit. It requests the fresh review only after every owning task has its own
  verified commit boundary.

## Handoff

Current handoff state is `BLOCKED`: production implementation is `NOT STARTED`
and MUST NOT start. The selected architecture has no external credential
provisioning prerequisite, but that fact does not resolve `RG-001`. Protected
acceptance is limited to the existing GitHub-hosted non-OAuth Gateway/relay
boundary. A fresh Superpowers Review Gate must independently mark both documents
`READY`; that status may not be self-declared by this plan. Only then may Task 1
start.

Request a fresh code review after Task 8. Do not claim supported production use
unless the exact host contract, deterministic checks, protected acceptance, and
design-to-plan consistency review all pass. If OpenCode 1.18.31 cannot retain
OpenCode-owned OAuth while applying the required public header hook, stop with
`DESIGN RE-APPROVAL REQUIRED`; never restore the global fetch interposer or add
an alternate credential flow.
