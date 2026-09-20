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

**Tech Stack:** TypeScript, `@opencode-ai/plugin` 1.18.31, `@opencode-ai/sdk/v2`
model types, npm/Vitest, Deno 2.x, and GitHub Actions protected acceptance.

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
- OpenCode exclusively acquires, stores, refreshes, and injects ChatGPT OAuth.
  The plugin and relay must not extract, inspect for ownership, persist,
  refresh, substitute, or log it.
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
  gate and protected acceptance both pass.

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
  byte/header pass-through; change `apps/deno-relay/relay.ts` only if that
  regression test exposes a direct-forwarding defect.
- Create `.github/scripts/opencode_provider_acceptance_test.ts`; modify
  `.github/workflows/acceptance.yml`, `docs/configuration.md`, and
  `docs/operations.md` for a secret-safe, manually dispatched OpenCode
  acceptance gate and the Gateway payload-observability boundary.
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

- [ ] **Step 2: Run the focused test to confirm the old range fails it**

  Run from `packages/opencode-plugin`:

  ```bash
  npm ci --ignore-scripts
  npm test -- --run test/host-version.test.ts test/package-consistency.test.ts
  ```

  Expected: FAIL because the current range accepts `1.18.29` and the package
  still resolves `@opencode-ai/plugin` 1.18.29.

- [ ] **Step 3: Pin the host package and supported range**

  Set `@opencode-ai/plugin` in `devDependencies` to exact `1.18.31`, update the
  lockfile through `npm install --package-lock-only --ignore-scripts`, and set
  the host range constant and `engines.opencode` to exact `1.18.31`. Retain the
  peer dependency as `>=1.18.31 <1.18.32` so consumers cannot install the
  package with a host whose selected hook lifecycle was not pinned.

  ```ts
  export const SUPPORTED_OPENCODE_RANGE = "1.18.31";
  ```

- [ ] **Step 4: Typecheck the public callback surface**

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

- [ ] **Step 5: Commit the pinned contract**

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

- [ ] **Step 2: Run focused tests to confirm they fail**

  ```bash
  npm test -- --run test/gateway-url.test.ts test/provider-models.test.ts
  ```

  Expected: FAIL because `buildGatewayModelUrl()` and `createProviderModels()`
  do not exist.

- [ ] **Step 3: Implement the suffix-free URL builder**

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

- [ ] **Step 4: Implement the public provider callback**

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

- [ ] **Step 5: Verify and commit the route owner**

  ```bash
  npm run typecheck
  npm test -- --run test/gateway-url.test.ts test/provider-models.test.ts
  git add packages/opencode-plugin/src/gateway-url.ts packages/opencode-plugin/src/provider-models.ts packages/opencode-plugin/test/gateway-url.test.ts packages/opencode-plugin/test/provider-models.test.ts
  git commit -m "feat: add OpenCode provider model routing"
  ```

## Task 3: Move Gateway and Relay Headers to `chat.headers`

**Files:**

- Create: `packages/opencode-plugin/src/control-headers.ts`
- Create: `packages/opencode-plugin/test/control-headers.test.ts`
- Modify: `packages/opencode-plugin/src/config.ts` only if the typed hook needs
  a read-only configuration type adjustment

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

- [ ] **Step 2: Run the focused test to confirm it fails**

  ```bash
  npm test -- --run test/control-headers.test.ts
  ```

  Expected: FAIL because the `chat.headers` hook has not been implemented.

- [ ] **Step 3: Implement model-scoped header injection**

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

- [ ] **Step 4: Verify header isolation and configuration precedence**

  Add tests proving the hook receives the exact resolved configuration for both
  credential precedence paths and never writes OpenCode-owned headers. Keep
  activation-time missing-configuration rejection in Task 4, where the plugin
  has been integrated. Run:

  ```bash
  npm run typecheck
  npm test -- --run test/control-headers.test.ts test/config.test.ts
  ```

  Expected: PASS; no test fixture contains a real credential or request body.

- [ ] **Step 5: Commit the public header seam**

  ```bash
  git add packages/opencode-plugin/src/control-headers.ts packages/opencode-plugin/test/control-headers.test.ts packages/opencode-plugin/src/config.ts packages/opencode-plugin/test/config.test.ts
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

- [ ] **Step 2: Run the integration test to confirm the interposer fails it**

  ```bash
  npm test -- --run test/plugin.test.ts
  ```

  Expected: FAIL because the current plugin returns `{}` and mutates global
  `fetch` after successful activation.

- [ ] **Step 3: Integrate one resolved configuration into both hooks**

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

- [ ] **Step 4: Remove every legacy routing symbol and its tests**

  Delete the three legacy source files and their tests. Remove their exports
  from `index.ts`; export `buildGatewayModelUrl`, `createProviderModels`,
  `createChatHeaders`, and the metadata constant instead. Confirm no selected
  source or test imports a legacy symbol:

  ```bash
  git grep -n "installFetchInterposer\|rewriteCodexRequest\|isChatgptCodexResponsesRequest\|globalThis.fetch =" -- packages/opencode-plugin/src packages/opencode-plugin/test
  ```

  Expected: no matches.

- [ ] **Step 5: Run the full plugin gate and commit**

  ```bash
  npm run typecheck
  npm test
  npm run build
  git add packages/opencode-plugin/src packages/opencode-plugin/test
  git commit -m "refactor: remove legacy OpenCode fetch routing"
  ```

## Task 5: Lock the Fixed Relay Direct-Forwarding Contract

**Files:**

- Modify: `apps/deno-relay/relay_test.ts`
- Modify only if a new test fails: `apps/deno-relay/relay.ts`

**Interfaces:**

- Consumes `createRelayHandler()` and its fixed request path
  `POST /v1/responses`.
- Produces regression coverage that preserves upstream non-stream JSON status,
  body bytes, and allowed headers; preserves SSE bytes and cancellation; and
  removes relay-only, Gateway-only, hop-by-hop, and forwarding request headers
  before the fixed Codex upstream.

- [ ] **Step 1: Add a failing non-stream Responses response test**

  Create an authenticated relay request with an opaque `Authorization`,
  `ChatGPT-Account-Id`, Gateway headers, and relay credential. Return synthetic
  `application/json` upstream responses with status `200` and `429` plus opaque,
  non-secret Responses-shaped bodies. Assert each status/body remains unchanged
  so an upstream protocol error remains visible at its owning boundary.

  ```ts
  const body = '{"object":"response","status":"completed"}';
  assertEquals(response.status, 200, "response status");
  assertEquals(response.headers.get("content-type"), "application/json");
  assertEquals(await response.text(), body, "response body");
  assertEquals(upstream.headers.get("authorization"), "Bearer opaque-oauth");
  assertEquals(upstream.headers.get("x-chatgpt-relay-authorization"), null);
  assertEquals(upstream.headers.get("cf-aig-authorization"), null);
  ```

- [ ] **Step 2: Run the relay test to confirm the current behavior**

  ```bash
  deno test apps/deno-relay/relay_test.ts
  ```

  Expected: PASS if the existing direct-forwarding relay satisfies the new
  regression. If it fails, preserve byte-for-byte body forwarding and repair
  only the failing header or lifecycle behavior in `relay.ts`.

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

- [ ] **Step 5: Commit relay contract coverage**

  ```bash
  git add apps/deno-relay/relay_test.ts apps/deno-relay/relay.ts
  git commit -m "test: lock relay Responses forwarding contract"
  ```

## Task 6: Add a Secret-Safe Protected OpenCode Acceptance Gate

**Files:**

- Create: `.github/scripts/opencode_provider_acceptance.ts`
- Create: `.github/scripts/opencode_provider_acceptance_test.ts`
- Modify: `.github/workflows/acceptance.yml`
- Modify: `docs/configuration.md`
- Modify: `docs/operations.md`

**Interfaces:**

- Consumes protected environment values for the Gateway and relay controls plus
  an already-authenticated OpenCode runtime; it must not read or print OAuth
  credential values.
- Produces `CommandResult = { code: number; stdout: string; stderr: string }`
  and
  `CommandRunner = (command: readonly string[], env: Readonly<Record<string, string | undefined>>) => Promise<CommandResult>`.
- Produces
  `runProviderAcceptance(deps: { env: Readonly<Record<string, string | undefined>>; run: CommandRunner }): Promise<void>`
  and
  `deno run --allow-run --allow-env .github/scripts/opencode_provider_acceptance.ts`,
  which exit non-zero if the required OpenCode 1.18.31 route, direct-forwarding
  stream, tool continuation, or fail-closed boundary is not observed.
- Produces no stored transcript, request payload, response content, account
  identifier, or secret.

- [ ] **Step 1: Write the failing acceptance-command contract**

  Add `opencode_provider_acceptance_test.ts` before the runner exists. Define
  `CommandRunner` as a dependency that returns only process status and bounded
  JSON output; test all required configuration names and secret presence without
  printing their values. The command must invoke the fixed model, route with a
  process-local plugin configuration, and use a constant non-sensitive prompt.

  ```ts
  const testEnvironment = {
    RELAY_CF_ACCOUNT_ID: "acct",
    RELAY_CF_GATEWAY_ID: "gateway",
    RELAY_CF_AIG_TOKEN: "gateway-test-token",
    RELAY_SECRET: "relay-test-token",
  };
  const run: CommandRunner = async (command) => {
    assertEquals(command[0], "opencode");
    assert(command.includes("openai/gpt-5.6-luna"));
    return { code: 0, stdout: '{"usage":{"total":1}}', stderr: "" };
  };
  await runProviderAcceptance({ env: testEnvironment, run });

  const command = [
    "opencode",
    "run",
    "--model",
    "openai/gpt-5.6-luna",
    "--format",
    "json",
    "Reply exactly OK.",
  ];
  ```

  The test must also require rejection for a missing configuration name, a
  non-zero command status, or JSON output with zero usage. The runner may check
  exit status and bounded JSON structure such as non-zero usage, but it must not
  print command output or persist it.

- [ ] **Step 2: Extend the protected workflow prerequisites**

  Add Node.js 22 and the pinned OpenCode CLI installation to
  `.github/workflows/acceptance.yml`. Require a protected mechanism that makes
  the already-authorized OpenCode credential available to that runtime without
  echoing, serializing, or uploading it. If the protected environment cannot
  supply an OpenCode-owned OAuth session without exporting its credential, stop
  this task and record `DESIGN RE-APPROVAL REQUIRED`; do not add a PAT or
  OAuth-token extraction path. Build the plugin in the job, construct the
  process-local plugin config with `JSON.stringify`, and pass the configuration
  only as valid JSON without `{env:...}` references. The plugin continues to
  read its control configuration from the protected process environment.

- [ ] **Step 3: Implement bounded acceptance assertions**

  Make the script verify all of the following through command status, selected
  model ID, and non-sensitive boundary observations: Gateway authentication,
  relay authentication, no direct `chatgpt.com` route, stream completion,
  `function_call`/`function_call_output` continuation, cancellation propagation,
  non-stream relay JSON forwarding, and fail-closed invalid configuration.
  Redact all subprocess output on both success and failure; report only named
  check outcomes and exit status.

- [ ] **Step 4: Document the payload and access boundary**

  In `docs/configuration.md` and `docs/operations.md`, keep
  `RELAY_CF_AIG_COLLECT_LOG_PAYLOAD` default `true`, state that payload logging
  is controlled at the Cloudflare Gateway boundary, and direct operators to
  their Gateway retention/access policy. State that the repository does not
  store payloads, raw probes, or OpenCode credentials.

- [ ] **Step 5: Validate workflow syntax and commit**

  ```bash
  deno test .github/scripts
  deno fmt --check
  git diff --check
  git add .github/scripts/opencode_provider_acceptance.ts .github/scripts/opencode_provider_acceptance_test.ts .github/workflows/acceptance.yml docs/configuration.md docs/operations.md
  git commit -m "test: add protected OpenCode provider acceptance"
  ```

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

- Inspect: source, tests, workflow, package metadata, and canonical
  documentation
- Modify only if verification exposes an unimplemented requirement: the owning
  source/test/documentation file from Tasks 1-7

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

- [ ] **Step 3: Run protected acceptance manually**

  Dispatch `.github/workflows/acceptance.yml` only after its protected
  environment is configured. Verify the bounded results from Task 6 without
  displaying secrets or raw request/response data. A missing host capability,
  inability to inject headers through `chat.headers`, direct upstream request,
  or failed control boundary blocks supported production use.

- [ ] **Step 4: Perform the design-to-plan consistency review**

  Compare this implementation and all test outcomes against every global
  constraint at the top of this plan and §§1-12 of
  `docs/superpowers/specs/2026-09-14-cf-ai-gw-relay-opencode-provider-design.md`.
  Record only the reviewed command names, runtime version, pass/fail status, and
  bounded error category in canonical documentation. If any divergence changes
  provider identity, credential architecture, public extension point, component
  boundary, security model, protocol owner, or SDK family/major version, record
  `DESIGN RE-APPROVAL REQUIRED` and stop.

- [ ] **Step 5: Commit the verified migration result**

  ```bash
  git status --short
  git diff --check
  git add apps packages .github SPEC.md README.md README.ja.md docs
  git commit -m "feat: route OpenCode through Cloudflare Gateway provider"
  ```

## Handoff

Request a fresh code review after Task 8. Do not claim supported production use
unless the exact host contract, deterministic checks, protected acceptance, and
design-to-plan consistency review all pass. If OpenCode 1.18.31 cannot retain
OpenCode-owned OAuth while applying the required public header hook, stop with
`DESIGN RE-APPROVAL REQUIRED`; never restore the global fetch interposer or add
an alternate credential flow.
