# OpenCode Provider Routing Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy global fetch interposer with the validated OpenCode `provider.models` route for the fixed `openai/gpt-5.6-luna` production model while preserving opaque OAuth forwarding, Gateway and relay authentication, direct Responses forwarding, and fail-closed behavior.

**Architecture:** OpenCode remains the `openai` provider and owns ChatGPT OAuth. The plugin returns a public `provider.models` hook that changes only the selected model's `api.id` and `api.url`; the AI SDK appends `/responses`, Cloudflare Custom Provider maps to the relay's `POST /v1/responses`, and the relay forwards request, response, SSE, and tool data without semantic transformation. Gateway and relay control headers use the existing configuration ownership through a host-supported injection seam; a global fetch interposer is not retained as a fallback.

**Tech Stack:** TypeScript, OpenCode plugin API `@opencode-ai/plugin`, OpenCode SDK v2 model types, `@ai-sdk/openai` host runtime `3.0.88`, npm/Vitest for the plugin, Deno tests for the relay.

## Global Constraints

- Target runtime is OpenCode `1.18.31` and provider identity is exactly `openai`.
- The selected extension point is the public `provider.models` hook.
- The selected routing field is `model.api.url`.
- The route value is `https://gateway.ai.cloudflare.com/v1/<account>/<gateway>/custom-<slug>` and MUST NOT include `/responses` or `/v1/responses`.
- The Custom Provider `base_url` is `https://cf-ai-gw-relay.yohi.deno.net/v1`.
- The relay route is exactly `POST /v1/responses`.
- The initial production mapping is `openai/gpt-5.6-luna` -> `model.api.id=gpt-5.6-luna` -> AI SDK identifier `gpt-5.6-luna` via `@ai-sdk/openai 3.0.88` -> wire model `gpt-5.6-luna`.
- `REQUEST_PROTOCOL`, `RESPONSE_PROTOCOL`, and `STREAMING_PROTOCOL` are `DIRECT_FORWARDING`.
- `TOOLS = INCLUDED`, including Responses `function_call` and `function_call_output` continuation.
- OpenCode acquires, stores, refreshes, and injects the ChatGPT OAuth credential; the plugin never extracts, persists, refreshes, substitutes, or logs it.
- The plugin owns `cf-aig-authorization` and `x-chatgpt-relay-authorization` through the supported control-header seam without replacing `Authorization` or `ChatGPT-Account-Id`.
- Fail closed on missing host capability, model resolution, route configuration, authentication, or transport errors.
- Do not add direct ChatGPT/Codex fallback, retry loops, caching, payload persistence, a generic `/upstream/*` route, or a parallel global fetch interposer.
- Preserve the existing `RELAY_CF_AIG_COLLECT_LOG_PAYLOAD` configuration control and document Gateway retention/access behavior.
- Do not add `@ai-sdk/openai` as a package dependency unless the pinned OpenCode host typecheck proves that the plugin must import it; the current target-runtime observation is not a package-manifest change.
- Do not record credentials, account identifiers, raw request payloads, response contents, or raw probe logs in source, tests, fixtures, documentation, or logs.
- Keep `apps/deno-relay` free of external runtime dependencies and keep the plugin runtime dependency set within the package contract.
- Do not claim production readiness until the host request-blocking capability and protected acceptance release gate pass.

---

## File Map

- Create `packages/opencode-plugin/src/provider-models.ts` for the typed `provider.models` hook and fixed production model selection.
- Create `packages/opencode-plugin/test/provider-models.test.ts` for model selection, route mapping, fail-closed behavior, and credential non-ownership.
- Modify `packages/opencode-plugin/src/gateway-url.ts` and `packages/opencode-plugin/test/gateway-url.test.ts` to expose the suffix-free Custom Provider URL separately from the legacy request URL.
- Modify `packages/opencode-plugin/src/plugin.ts` and `packages/opencode-plugin/test/plugin.test.ts` to return the provider hook and stop installing the global interposer.
- Modify `packages/opencode-plugin/src/config.ts` and `packages/opencode-plugin/test/config.test.ts` only where eager configuration resolution or header-seam inputs require it.
- Modify or delete `packages/opencode-plugin/src/interposer.ts`, `packages/opencode-plugin/src/request-rewrite.ts`, `packages/opencode-plugin/src/matcher.ts`, `packages/opencode-plugin/src/index.ts`, and their tests only after no selected-path caller remains.
- Modify `apps/deno-relay/upstream_contract_test.ts` for non-stream JSON pass-through and existing stream/header behavior; do not change relay source unless a test demonstrates a contract violation.
- Modify `SPEC.md`, `README.md`, and `packages/opencode-plugin/README.md` after implementation to describe the new current path and remove statements that call the interposer current behavior.

## Task 1: Pin the Host Hook Contract

**Files:**
- Read: `packages/opencode-plugin/node_modules/@opencode-ai/plugin/dist/index.d.ts`
- Read: `packages/opencode-plugin/node_modules/@opencode-ai/sdk/dist/v2/gen/types.gen.d.ts`
- Test: `packages/opencode-plugin/test/provider-models.test.ts`

**Interfaces:**
- Consume `ProviderHook`, `ProviderHookContext`, `ProviderV2`, and `ModelV2` from the installed OpenCode host packages.
- Produce the exact callback contract `models(provider: ProviderV2, ctx: ProviderHookContext): Promise<Record<string, ModelV2>>`.

- [ ] **Step 1: Confirm the installed types and header seam**

  Verify that `ProviderHook.models` returns `Record<string, ModelV2>`, that `ModelV2.api` contains `id`, `url`, and `npm`, and that the installed host exposes a supported way to add Gateway and relay control headers without a global fetch interceptor. Record the exact type names and injection seam in the implementation branch.

  If no supported header-injection seam exists, stop and record `DESIGN RE-APPROVAL REQUIRED` for the public extension point or security boundary. Do not introduce a fetch fallback.

- [ ] **Step 2: Write failing hook-contract tests**

  Add `provider-models.test.ts` tests that require:

  ```ts
  expect(result["gpt-5.6-luna"].api.id).toBe("gpt-5.6-luna");
  expect(result["gpt-5.6-luna"].api.url).toBe(
    "https://gateway.ai.cloudflare.com/v1/acct/gw/custom-relay-chatgpt",
  );
  expect(result["gpt-5.6-luna"].api.npm).toBe(source.api.npm);
  ```

  Also require rejection for a non-`openai` provider and for an `openai` provider whose `gpt-5.6-luna` model is absent.

- [ ] **Step 3: Run the focused test and confirm it fails**

  Run from `packages/opencode-plugin`:

  ```bash
  npm test -- --run test/provider-models.test.ts
  ```

  Expected: FAIL because `provider-models.ts` does not yet provide the hook.

- [ ] **Step 4: Commit the contract tests**

  ```bash
  GIT_MASTER=1 git add packages/opencode-plugin/test/provider-models.test.ts
  GIT_MASTER=1 git commit -m "test: pin OpenCode provider hook contract"
  ```

## Task 2: Add the Suffix-Free Model Route and Provider Hook

**Files:**
- Modify: `packages/opencode-plugin/src/gateway-url.ts`
- Test: `packages/opencode-plugin/test/gateway-url.test.ts`
- Create: `packages/opencode-plugin/src/provider-models.ts`
- Test: `packages/opencode-plugin/test/provider-models.test.ts`
- Reuse: `packages/opencode-plugin/src/config.ts`, `packages/opencode-plugin/src/errors.ts`

**Interfaces:**
- `buildGatewayModelUrl(config: ResolvedConfig): string` returns the Gateway Custom Provider URL without an operation suffix.
- `createProviderHook(config: ResolvedConfig): ProviderHook` returns `{ id: "openai", models }`.
- `models(provider, context)` returns exactly one production model entry keyed by `gpt-5.6-luna`.

- [ ] **Step 1: Add the failing URL cases**

  Extend `gateway-url.test.ts` with encoded account, gateway, and provider-slug cases. Assert that `buildGatewayModelUrl()` returns `.../custom-relay-chatgpt` and never `/responses` or `/v1/responses`; keep the existing legacy `buildGatewayUrl()` test unchanged until the interposer is removed.

- [ ] **Step 2: Implement the suffix-free URL helper**

  Add `buildGatewayModelUrl()` using the existing `ResolvedConfig` and `encodeURIComponent` for every path component:

  ```ts
  const path =
    `/v1/${encodeURIComponent(config.accountId)}` +
    `/${encodeURIComponent(config.gatewayId)}` +
    `/custom-${encodeURIComponent(config.providerSlug)}`;
  return `${new URL(config.gatewayBaseUrl).origin}${path}`;
  ```

- [ ] **Step 3: Implement the provider hook**

  In `provider-models.ts`, clone only the selected source model, preserve all capabilities/cost metadata and `api.npm`, set `id`, `providerID`, and `api.id` to `gpt-5.6-luna`, and set `api.url` using `buildGatewayModelUrl()`. Throw `PluginConfigurationError` before returning when `provider.id !== "openai"` or the selected model is missing.

- [ ] **Step 4: Run focused tests**

  ```bash
  npm test -- --run test/gateway-url.test.ts test/provider-models.test.ts
  npm run typecheck
  ```

  Expected: all focused tests and typecheck pass without adding a runtime dependency.

- [ ] **Step 5: Commit the route and hook**

  ```bash
  GIT_MASTER=1 git add packages/opencode-plugin/src/gateway-url.ts packages/opencode-plugin/test/gateway-url.test.ts packages/opencode-plugin/src/provider-models.ts packages/opencode-plugin/test/provider-models.test.ts
  GIT_MASTER=1 git commit -m "feat: add OpenCode provider model routing hook"
  ```

## Task 3: Integrate the Hook and Control Headers Fail-Closed

**Files:**
- Modify: `packages/opencode-plugin/src/plugin.ts`
- Modify: `packages/opencode-plugin/test/plugin.test.ts`
- Modify: `packages/opencode-plugin/src/config.ts` only if eager resolution is required by the host seam
- Test: `packages/opencode-plugin/test/config.test.ts`

**Interfaces:**
- `CloudflareAiGatewayChatgpt()` performs host capability validation, resolves configuration once, and returns `{ provider: createProviderHook(config) }`.
- The selected host-supported header seam receives the resolved Gateway and relay control headers without replacing OpenCode OAuth headers.

- [ ] **Step 1: Add failing plugin integration tests**

  Replace the current `hooks.toEqual({})` expectation with tests that require `hooks.provider.id === "openai"`, a `models` callback, no change to `globalThis.fetch`, and rejection before hook creation when host capability or required credentials are unavailable.

- [ ] **Step 2: Integrate configuration and provider hook**

  Keep `assertSupportedHost(await resolveHostVersionCapabilityAsync(input))` first. Resolve `process.env` and plugin options once, pass the result to `createProviderHook(config)`, and configure control headers only through the host-supported seam confirmed in Task 1. Do not call `installFetchInterposer()`.

- [ ] **Step 3: Add header ownership tests**

  Assert that `Authorization` and `ChatGPT-Account-Id` remain untouched, that `cf-aig-authorization` and `x-chatgpt-relay-authorization` use only resolved control credentials, that `cf-aig-collect-log-payload` follows the existing explicit boolean configuration, and that missing required configuration rejects before a model is returned.

- [ ] **Step 4: Run plugin tests**

  ```bash
  npm test -- --run test/plugin.test.ts test/config.test.ts
  npm run typecheck
  ```

  Expected: provider hook integration passes; no global fetch replacement occurs.

- [ ] **Step 5: Commit the integration**

  ```bash
  GIT_MASTER=1 git add packages/opencode-plugin/src/plugin.ts packages/opencode-plugin/test/plugin.test.ts packages/opencode-plugin/src/config.ts packages/opencode-plugin/test/config.test.ts
  GIT_MASTER=1 git commit -m "feat: route OpenCode through provider models"
  ```

## Task 4: Remove the Legacy Routing Owner

**Files:**
- Delete only after reference search: `packages/opencode-plugin/src/interposer.ts`, `packages/opencode-plugin/src/request-rewrite.ts`, and `packages/opencode-plugin/src/matcher.ts`
- Modify: `packages/opencode-plugin/src/index.ts`
- Modify/delete: `packages/opencode-plugin/test/interposer.test.ts`, `packages/opencode-plugin/test/request-rewrite.test.ts`, and `packages/opencode-plugin/test/matcher.test.ts`

- [ ] **Step 1: Prove the selected path has no legacy callers**

  Run:

  ```bash
  git grep -n "installFetchInterposer\|rewriteCodexRequest\|isChatgptCodexResponsesRequest" -- packages/opencode-plugin/src packages/opencode-plugin/test
  ```

  Expected: only legacy implementation files and their tests are listed; `plugin.ts` and the selected provider hook contain no interposer call.

- [ ] **Step 2: Remove the competing routing owner**

  Delete the legacy interposer/matcher/request-rewrite modules and remove their exports/imports. Keep `applyControlHeaders()` only if the Task 1 host seam uses it; otherwise move its exact header behavior into the selected seam before deletion. Do not leave a fallback path.

- [ ] **Step 3: Replace legacy tests with regression tests**

  Preserve tests for fail-closed configuration, OAuth header opacity, control-header separation, request body identity, stream signal cancellation, and no routing of non-Codex traffic in the new provider-hook test suite.

- [ ] **Step 4: Run the complete plugin gate**

  ```bash
  npm run typecheck
  npm test
  npm run build
  ```

  Expected: all tests pass, the package builds, and no global fetch interposer symbol remains on the production path.

- [ ] **Step 5: Commit the owner migration**

  ```bash
  GIT_MASTER=1 git add packages/opencode-plugin/src packages/opencode-plugin/test
  GIT_MASTER=1 git commit -m "refactor: remove legacy OpenCode fetch routing"
  ```

## Task 5: Lock Relay Non-Stream and Streaming Contracts

**Files:**
- Modify: `apps/deno-relay/upstream_contract_test.ts`
- Modify only if a test fails: `apps/deno-relay/relay.ts`

- [ ] **Step 1: Add a non-stream Responses JSON pass-through test**

  Use a synthetic upstream response with `Content-Type: application/json`, status `200`, and a non-secret JSON body. Assert unchanged status/body, hop-by-hop header removal, relay-header removal, and no SSE idle timer behavior.

- [ ] **Step 2: Preserve the existing stream/tool tests**

  Assert that `text/event-stream` body bytes, `response.completed`, `function_call`, and `function_call_output` continuation data pass through unchanged, and that client cancellation aborts the upstream request without retry or fallback.

- [ ] **Step 3: Run relay tests**

  ```bash
  deno test apps/deno-relay .github/scripts
  ```

  Expected: all existing tests plus the non-stream test pass; no relay source change is needed when the current direct-forwarding implementation satisfies the test.

- [ ] **Step 4: Commit the relay contract tests**

  ```bash
  GIT_MASTER=1 git add apps/deno-relay/upstream_contract_test.ts apps/deno-relay/relay.ts
  GIT_MASTER=1 git commit -m "test: lock relay Responses forwarding contracts"
  ```

## Task 6: Update Canonical Documentation and Acceptance Boundaries

**Files:**
- Modify: `SPEC.md`
- Modify: `README.md`
- Modify: `packages/opencode-plugin/README.md`
- Modify: `docs/superpowers/specs/2026-09-14-cf-ai-gw-relay-opencode-provider-design.md`
- Test/inspect: `.github/workflows/*`, `apps/deno-relay/acceptance_test.ts`, and protected acceptance configuration

- [ ] **Step 1: Replace current-path statements**

  Change only statements that currently call `installFetchInterposer()` the active production routing owner. State that the provider hook is the selected route and that implementation remains unsupported until the host request-blocking capability and protected acceptance gates pass.

- [ ] **Step 2: Record the implementation-validation boundary**

  Keep non-stream request/response validation, host hook type pinning, header injection, payload retention/access, and no-double-routing checks as explicit acceptance items. Do not record credentials, payloads, or raw probe logs.

- [ ] **Step 3: Run documentation consistency checks**

  ```bash
  git grep -n "installFetchInterposer\|provider.models\|gpt-5.6-luna\|POST /v1/responses" -- README.md SPEC.md packages/opencode-plugin/README.md docs/superpowers/specs
  git diff --check
  ```

  Expected: current-path statements identify the provider hook, legacy interposer references are historical or migration-only, and all canonical documents retain the same fail-closed contract.

- [ ] **Step 4: Commit documentation updates**

  ```bash
  GIT_MASTER=1 git add SPEC.md README.md packages/opencode-plugin/README.md docs/superpowers/specs/2026-09-14-cf-ai-gw-relay-opencode-provider-design.md
  GIT_MASTER=1 git commit -m "docs: record provider hook implementation boundary"
  ```

## Task 7: Run the Protected Verification Gate

**Files:**
- Inspect only: repository source, tests, CI, deployment, and protected acceptance configuration

- [ ] **Step 1: Run all deterministic checks**

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

- [ ] **Step 2: Run protected acceptance with approved credentials**

  Execute the repository's protected acceptance command without printing environment values or request/response payloads. Verify the host request-blocking capability, Gateway authentication, relay authentication, non-stream JSON, streaming SSE termination, tool continuation, cancellation, and fail-closed error paths.

- [ ] **Step 3: Verify no direct fallback or duplicate owner**

  Confirm that a Gateway or relay failure produces an owning-boundary failure, that `chatgpt.com` is not contacted directly by the production route, and that no global fetch interception remains active.

- [ ] **Step 4: Record the gate result**

  Update `SPEC.md` and the design document only with pass/fail summaries, command names, runtime versions, and bounded error classes. Do not record credentials, account identifiers, raw payloads, or response contents.

- [ ] **Step 5: Commit the verified implementation**

  ```bash
  GIT_MASTER=1 git status --short
  GIT_MASTER=1 git diff --check
  GIT_MASTER=1 git add apps packages SPEC.md README.md docs/superpowers/specs/2026-09-14-cf-ai-gw-relay-opencode-provider-design.md
  GIT_MASTER=1 git commit -m "feat: route OpenCode through Cloudflare Gateway provider"
  ```

## Handoff

After Task 7, request a fresh code review of the implementation commit. Do not claim production readiness until the host-capability release gate and protected acceptance pass. If the host API cannot provide the required control-header injection seam without a second routing owner, stop and record `DESIGN RE-APPROVAL REQUIRED` instead of implementing a fallback.
