# Issue #28 C1 Provider Implementation Plan

> **For agentic workers:** Execute each task in dependency order with RED → verify RED → minimum GREEN → verify GREEN → REFACTOR → commit. This is a non-normative execution document; review against `SPEC.md` before implementation. This document authorizes no implementation, commit, deployment, or release.

## Goal

Implement Issue #28 so users can select `cf-ai-gw-relay/openai/<model>` while reusing the existing OpenCode-owned ChatGPT OAuth credential and leaving ordinary `openai/<model>` behavior unchanged.

## Architecture

- Selected provider identity: `cf-ai-gw-relay`; effective credential owner: `openai`.
- One shared resolver: `credentialProviderID`; OAuth lifecycle owner: OpenCode; model/profile semantics owner: `openai`; transport target owner: `cf-ai-gw-relay`.
- The project plugin registers the dedicated provider using the existing `config` hook and supplies only Gateway/relay controls. OpenCode core delegates credential semantics explicitly while keeping selected provider ID and Gateway route intact. No generic delegation graph.

## Tech Stack

OpenCode `1.18.31` (commit `014614d35b397775e5d397a490fc72368c894ec2`), TypeScript, Bun, `@ai-sdk/openai` `3.0.88`, `@opencode-ai/plugin` hooks, `@opencode-ai/core` `ConfigProviderV1`, built-in `CodexAuthPlugin`, Cloudflare AI Gateway, `@yohi/cf-ai-gw-relay` plugin, Deno `cf-ai-gw-relay`.

## Canonical Spec

`SPEC.md` §§1.1–1.3, 2–4.5, 5.1–5.8, 6, 9.1–9.2, 10 and Appendix B. It alone is normative. The OpenCode commit above is an **implementation inspection baseline**, not another specification. Historical deleted plans/specs are not inputs. Run OpenCode steps in a clean worktree at that commit; the inspected local OpenCode checkout is at a later, dirty commit and MUST NOT be modified or used as an unpinned execution baseline. In this document `OpenCode:` paths refer to the upstream OpenCode source root; `Project:` paths refer to this repository root. Never copy machine-specific absolute paths into either repository.

## Validated Runtime Baseline

Disposable spike: stock `openai/gpt-6-sol` PASS; first C1 reached Gateway/relay but returned HTTP 400 due to incomplete credential-owner request/model semantics; bounded fix propagated auth lookup, request preparation, materialization/profile, hooks and target-aware transport. Final `cf-ai-gw-relay/openai/gpt-6-sol` Gateway/relay/upstream HTTP 200 with usable response; subsequent ordinary `openai/gpt-6-sol` HTTP 200. Credential owner `openai`; no raw OAuth exposure to project plugin; no direct rewrite for C1. This is validated architecture evidence, **not** production integration or host-capability acceptance.

## Global Constraints

- DO NOT expose raw OAuth access/refresh tokens to project plugin code or read OpenCode's private auth store there. No new OAuth persistence/login, PAT, `CODEX_ACCESS_TOKEN`, or provider credential API.
- DO NOT collapse provider identity to `openai`; change ordinary `openai/*` routing; or fall back automatically from dedicated traffic to `openai/*` or direct ChatGPT.
- Delegation requires explicit `provider.cf-ai-gw-relay.options.credentialProvider = "openai"`; any other pairing fails closed. No retry, cache, body rewrite or payload persistence.
- Keep Gateway/relay credentials separate from opaque upstream `Authorization` and `ChatGPT-Account-Id`; never log token/header values, full auth objects or payloads.
- Keep the plugin runtime dependency constraint (`semver` only), Deno relay zero-dependency/stateless and existing host-version/request-blocking and OAuth-free protected acceptance gates. No CI OAuth state.

## Out of Scope

Generic `/upstream/*` contract, C2, separate OAuth flow, token extraction, new public plugin auth API, new credential store, generic N-to-N delegation, large provider refactor, production deployment, Cloudflare resource mutation, or declaring supported production release before §10 gates.

## Files to Modify

**OpenCode upstream (planned only):**

| File | Exact responsibility |
| --- | --- |
| `packages/opencode/src/provider/provider.ts` | Provider init/fetch, owner profile and loader, `resolveSDK` target retention and `Provider.Interface`. |
| `packages/core/src/v1/config/provider.ts` | Type `ConfigProviderV1.Info.options.credentialProvider` as optional literal `"openai"`. |
| `packages/opencode/src/session/llm.ts` | `LLM.run` effective-owner auth lookup and request-prep input. |
| `packages/opencode/src/session/llm/request.ts` | `LLMRequestPrep.PrepareInput`, `prepare` OAuth request semantics. |
| `packages/opencode/src/agent/agent.ts` | `Agent.generate` effective-owner auth/stream path. |
| `packages/opencode/src/plugin/openai/codex.ts` | `CodexAuthPlugin` hooks and built-in auth-loader fetch target selection. |

**Project (planned only):**

| File | Exact responsibility |
| --- | --- |
| `packages/opencode-plugin/src/plugin.ts` | `CloudflareAiGatewayChatgpt` dedicated provider config hook and control-header hook; remove old provider-model hook registration. |
| `packages/opencode-plugin/src/config.ts` | `ResolvedConfig`/`resolveConfig`: force disabled Gateway payload logging for C1. |
| `packages/opencode-plugin/src/gateway-url.ts` | `buildGatewayModelUrl`: append suffix-free `/v1`. |
| `packages/opencode-plugin/src/control-headers.ts` | `createChatHeaders`: dedicated provider only, fixed no-payload control header. |

## Files to Create

| File | Exact responsibility |
| --- | --- |
| OpenCode: `packages/opencode/src/provider/credential-provider.ts` | Shared, synchronous bounded resolver and redacted failure type. |

## Test Files to Modify/Create

| File | Exact responsibility |
| --- | --- |
| OpenCode: `packages/opencode/test/provider/provider.test.ts` | Resolver, config, owner init/model materialization/loader/URL. |
| OpenCode: `packages/opencode/test/session/llm.test.ts` | Effective-owner auth, request shape, ordinary route regression. |
| OpenCode: `packages/opencode/test/plugin/codex.test.ts` | Built-in hook parity, refresh/injection, URL and marker behavior. |
| OpenCode: `packages/opencode/test/agent/agent.test.ts` | `Agent.generate` OAuth owner branch. |
| Project: `packages/opencode-plugin/test/plugin.test.ts` | Dedicated registration and ordinary-provider isolation. |
| Project: `packages/opencode-plugin/test/control-headers.test.ts` | Dedicated-only control headers, no payload logging or OAuth handling. |
| Project: `packages/opencode-plugin/test/gateway-url.test.ts` | Exact Gateway `/v1/responses` path composition. |
| Project: `packages/opencode-plugin/test/config.test.ts` | Reject payload-log opt-in. |

## Files Explicitly Not Modified

`SPEC.md` (normative), `apps/deno-relay/**` (current fixed upstream), `.github/**` (protected acceptance/CI), all lockfiles/manifests/dependencies, `packages/opencode-plugin/src/provider-models.ts` and its existing tests (historical implementation snapshot: do not invoke the old hook), deleted historical design/plan paths, Issue #28 and Cloudflare resources. This file is the only artifact of the **planning** session; file tables above describe future implementation work, not edits made now.

## Exact contracts and decision rules

1. Configuration, read in `ConfigV1.Info.provider["cf-ai-gw-relay"].options` (`packages/core/src/v1/config/provider.ts:Info`): `credentialProvider?: "openai"`; absent means self. Only `cf-ai-gw-relay` may use the literal. Project `config` hook installs `{ provider: { "cf-ai-gw-relay": { npm: "@ai-sdk/openai", api: gatewayURL, options: { credentialProvider: "openai" }, models: { "openai/gpt-6-sol": { id: "gpt-6-sol", provider: { npm: "@ai-sdk/openai", api: gatewayURL } } } } }` by mutating the passed config. Do not assign `apiKey`, `Authorization`, `ChatGPT-Account-Id`, or `fetch` in this hook. `gatewayURL` ends in `/custom-relay-chatgpt/v1`; SDK adds `/responses`. Selected model ID is `openai/gpt-6-sol`; wire ID is `gpt-6-sol`. Owner catalog profile is copied inside OpenCode before exposing the model, so the minimal config entry is not a conflicting second profile. Resolve provider slug from `RELAY_CF_PROVIDER_SLUG`, then the existing `cfg.provider["cf-ai-gw-relay"]?.options?.providerSlug`, then `relay-chatgpt`; reject conflicting existing dedicated model definitions and credential-owner values rather than silently overwriting.
2. New symbols in `packages/opencode/src/provider/credential-provider.ts`:

   ```ts
   export class CredentialProviderError extends Error {}
   export const CODEX_TARGET_HEADER = "x-opencode-codex-target"
   export function credentialProviderID(provider: Pick<Provider.Info, "id" | "options">): ProviderV2.ID
   ```

   `Provider.Info` and `ProviderV2.ID` are type-only imports. Consumes selected provider identity and provider options; produces effective owner ID. Return selected ID if no marker (including ordinary `openai`); return `ProviderV2.ID.openai` only for marked `cf-ai-gw-relay`; throw `CredentialProviderError("Invalid credential provider delegation")` for any other marker/value/pair without echoing the value. Both core and built-in Codex hooks import this *same function*; no consumer reimplements ownership decisions. Verify the selected provider and owner exist before model/SDK use. `credentialProvider` is metadata: remove it from options passed into SDK factories, model options, wire headers and logs.
3. Materialization: from selected `cfg.provider["cf-ai-gw-relay"]`, resolve owner `database["openai"].models["gpt-6-sol"]` **after** the OpenAI OAuth `provider.models` hook; build dedicated `openai/gpt-6-sol` from that owner model, overriding `id`, `providerID`, `api.id`, `api.url`, explicit per-model config and variants. Never overwrite the owner's entry or alter the dedicated provider's configured URL; do not clone token-bearing provider options. In `getLanguage`, select `s.modelLoaders[credentialProviderID(provider)]` while `resolveSDK` uses selected provider URL and owner `fetch`/dummy API key only. Guard owner missing/model missing with existing `ModelNotFoundError`; invalid marker with `CredentialProviderError`; do not silently synthesize fallback models.
4. Core `resolveSDK` imports `CODEX_TARGET_HEADER` from the shared resolver module and inserts value `"gateway"` only in dedicated SDK request headers after validating explicit delegation; normal OpenAI gets no marker. Built-in `auth.loader` fetch imports the same constant, removes marker before dispatch and *only* skips ChatGPT rewrite when it equals `"gateway"` and request URL is the configured Gateway host/path. Marker is **not** a credential, not an application log value, and does not enter project plugin hooks. Reject unexpected marker values or gateway marker with non-Gateway URL; do not infer safety from an arbitrary URL passed into fetch. With experimental WebSocket enabled, dedicated requests use HTTP fetch (WebSocket cannot target Gateway); ordinary route retains existing WebSocket behavior.
5. Cloudflare contract: Gateway ID `relay-gateway`; stored Custom Provider slug `relay-chatgpt`; route `custom-relay-chatgpt`; stored Custom Provider base origin `https://cf-ai-gw-relay.yohi.deno.net/` (no path); Gateway model URL `https://gateway.ai.cloudflare.com/v1/<account>/relay-gateway/custom-relay-chatgpt/v1`; relay `POST /v1/responses`; fixed upstream `https://chatgpt.com/backend-api/codex/responses`. `cf-aig-authorization` authenticates Gateway, `x-chatgpt-relay-authorization` authenticates relay, `Authorization` carries OpenCode-owned OAuth, `ChatGPT-Account-Id` remains OpenCode-owned where required. Set `cf-aig-collect-log: true`, `cf-aig-collect-log-payload: false`, `cf-aig-skip-cache: true`, `cf-aig-max-attempts: 1`. Static `cf-aig-metadata` fields only: `source`, `auth_type`, `plugin`.

## Dependency graph and execution commands

```text
Task 1 resolver/config → Task 2 provider initialization/model/profile
Task 1 → Task 5 Codex hooks
Task 2 + Task 5 → Task 6 transport
Task 6 → Task 3 LLM auth → Task 4 request prep → Task 7 agent/generation
Task 2 + Task 6 → Task 8 project plugin integration
Task 7 + Task 8 → Task 9 security boundary → Task 10 ordinary OpenAI regression
Task 9 + Task 10 → Task 11 production-source runtime acceptance
```

Tasks 2 and 5 can be developed independently after Task 1 (different consumers); Task 8 can be developed alongside Tasks 3–4 after Task 6 (different repositories). Integrate and run both suites before either merged commit; never share mutable working trees. All `bun test ...` and `bun typecheck` commands below run in OpenCode `packages/opencode`; all `npm test -- ...` commands run in Project `packages/opencode-plugin`. Never run Bun tests from the OpenCode repository root. RED must be a behavior assertion failing against unchanged implementation, not an import/compiler failure; when adding a test for a new symbol, import it only after the RED test uses an existing public seam, or treat the missing symbol as an explicitly stated RED signal.

### Task 1 — Explicit configuration and bounded resolver (A)

**Files:** OpenCode create `packages/opencode/src/provider/credential-provider.ts`; modify `packages/core/src/v1/config/provider.ts` `Info.options`; modify `packages/opencode/test/provider/provider.test.ts`.

**Consumes:** `Provider.Info.id`, `.options.credentialProvider`, `ProviderV2.ID`. **Produces:** `credentialProviderID(Pick<Provider.Info, "id" | "options">): ProviderV2.ID`, `CredentialProviderError`.

- [ ] **RED:** In `test/provider/provider.test.ts` add `test("C1 credential owner is explicit and bounded", ...)`: normal `openai` → `openai`; marked `cf-ai-gw-relay` → `openai`; unmarked `anthropic` → itself; marked `anthropic` or unknown owner throws without echo. Run `bun test test/provider/provider.test.ts -t "C1 credential owner is explicit and bounded"`. Expected FAIL: missing resolver export or wrong delegated value; proves no shared bounded decision exists yet.
- [ ] **GREEN:** Add the exact symbol and error above; add optional literal field in `ConfigProviderV1.Info.options` (rest fields stay intact). Run `bun test test/provider/provider.test.ts -t "C1 credential owner is explicit and bounded"`; expected PASS for all four identity categories. Run `bun typecheck`; expected exit 0.
- [ ] **REFACTOR:** None required. **Commit (OpenCode):** `git add packages/core/src/v1/config/provider.ts packages/opencode/src/provider/credential-provider.ts packages/opencode/test/provider/provider.test.ts && git commit -m "feat(opencode): resolve explicit relay credential owner"`.

### Task 2 — Provider initialization, owner profile and loader (A, D)

**Files:** OpenCode modify `packages/opencode/src/provider/provider.ts` (`layer`'s `InstanceState.make` config/model loops, plugin auth loader, `resolveSDK`, `getLanguage`); modify `packages/opencode/test/provider/provider.test.ts`.

**Consumes:** Task 1 resolver, `ConfigProviderV1.Info`, existing OpenAI database/profile/`CustomModelLoader`. **Produces:** dedicated `Provider.Model` with `providerID = cf-ai-gw-relay`, `id = openai/gpt-6-sol`, `api.id = gpt-6-sol`, `api.npm = @ai-sdk/openai`, `api.url` = Gateway `/v1`, owner capabilities/variants/limits and owner Responses loader; selected provider SDK options remain route owner.

- [ ] **RED:** Add `it.instance("C1 model inherits OAuth OpenAI profile without losing Gateway target", ...)` to `test/provider/provider.test.ts` with isolated config defining dedicated model and `credentialProvider: "openai"`; provision synthetic OpenAI OAuth through existing `Auth` test seam, inspect `provider.getModel(...)` and `provider.getLanguage(...)`. Assert owner reasoning/variants/limits, distinct selected provider and `language.config.baseURL` ending in `/custom-relay-chatgpt/v1`; assert `language` is the OpenAI Responses model (not its default Chat model). Add `it.instance("C1 refuses missing owner model", ...)` asserting `Provider.ModelNotFoundError` before fetch. Run `bun test test/provider/provider.test.ts -t "C1"`. Expected FAIL: config entry is synthesized with incomplete metadata or SDK uses `languageModel` rather than owner's `responses`; missing-owner path must not silently create a profile. Failures demonstrate initial runtime-400 defect without relying on a full response snapshot. Actual wire-body parity is checked after Task 6 in Task 4's integrated `llm.test.ts` scenario.
- [ ] **GREEN:** In config model materialization, copy the *post-hook* owner `gpt-6-sol` profile for only this pair; override selected identity, wire ID, Gateway URL, explicit model options/variants; preserve owner model unchanged. In plugin auth loader initialization, use the same resolver to copy OpenAI loader-produced **`fetch` and dummy `apiKey` only into core's selected provider runtime state**, not into `toPublicInfo` or project plugin; apply after config re-merge so config `credentialProvider`/URL survive. In `resolveSDK`, remove `credentialProvider` from SDK options, retain selected `baseURL`, and use owner `fetch`/dummy API key; in `getLanguage`, choose owner model loader and pass dedicated model as selected. Run `bun test test/provider/provider.test.ts -t "C1"` (PASS), `bun typecheck` (exit 0). No new persistent auth entry.
- [ ] **REFACTOR:** Remove any duplicated owner tests in the two provider initialization loops; both call Task 1 resolver. Rerun `bun test test/provider/provider.test.ts -t "C1"`. **Commit (OpenCode):** `git add packages/opencode/src/provider/provider.ts packages/opencode/test/provider/provider.test.ts && git commit -m "feat(opencode): materialize delegated OpenAI model profile"`.

### Task 3 — LLM authentication lookup (B)

**Files:** OpenCode modify `packages/opencode/src/session/llm.ts` `LLM.run`; modify `packages/opencode/test/session/llm.test.ts`.

**Consumes:** Task 1 resolver, Task 6 transport, selected `input.model.providerID`, `provider.getProvider`, `Auth.Service.get`. **Produces:** `auth.get(openai)` result for C1 while `input.model.providerID` remains dedicated.

- [ ] **RED:** Add `it.instance("C1 LLM uses OpenAI auth without changing provider identity", ...)` to `test/session/llm.test.ts`, using its `drain`, `Provider.use.getModel`, and an `Auth.Service.get` test layer recording the lookup key. Assert key `openai` while `input.model.providerID` is `cf-ai-gw-relay`; use a synthetic OAuth result and the Task 6 local transport test endpoint, without exposing an auth value in output. Run `bun test test/session/llm.test.ts -t "C1 LLM uses OpenAI auth"`. Expected FAIL: `LLM.run` calls `auth.get(input.model.providerID)` (recorded key is `cf-ai-gw-relay`), independently of Task 4's request-prep behavior.
- [ ] **GREEN:** In `run` resolve selected provider before auth (split the current concurrent `Effect.all`, because `auth.get` depends on `provider.getProvider`), then `auth.get(credentialProviderID(item))`; retain the effective ID locally; Task 4 adds it to `PrepareInput`. Never rewrite the selected provider/model. Run `bun test test/session/llm.test.ts -t "C1 LLM uses OpenAI auth"` (PASS) and `bun typecheck` (exit 0). **REFACTOR:** None required. **Commit (OpenCode):** `git add packages/opencode/src/session/llm.ts packages/opencode/test/session/llm.test.ts && git commit -m "feat(opencode): use delegated credential for LLM auth"`.

### Task 4 — Request preparation semantics (C)

**Files:** OpenCode modify `packages/opencode/src/session/llm/request.ts` `PrepareInput`, `prepare`, `packages/opencode/src/session/llm.ts` `LLM.run`; modify `packages/opencode/test/session/llm.test.ts`.

**Consumes:** Task 3's effective owner ID, `input.auth?.type`, `ProviderTransform.options`. **Produces:** OpenAI OAuth `instructions` and no system-message duplication under dedicated provider; unchanged selected IDs.

- [ ] **RED:** Add `it.instance("C1 request preparation matches OpenAI OAuth instructions", ...)` in `test/session/llm.test.ts`; capture both requests through `waitRequest` and assert `instructions` present, no synthetic `system` message, `store: false`, and selected model stays dedicated. Run `bun test test/session/llm.test.ts -t "C1 request preparation"`. Expected FAIL: `prepare` currently checks `input.provider.id === "openai"`.
- [ ] **GREEN:** Extend `PrepareInput` with `readonly credentialProviderID: ProviderV2.ID`; change `LLM.run` in `packages/opencode/src/session/llm.ts` to pass Task 3's local effective ID; set `isOpenaiOauth = input.credentialProviderID === ProviderV2.ID.openai && input.auth?.type === "oauth"`. Leave tool handling and hooks' selected provider context unchanged. Run `bun test test/session/llm.test.ts -t "C1 request preparation"` (PASS) and `bun typecheck` (exit 0). **REFACTOR:** None required. **Commit (OpenCode):** `git add packages/opencode/src/session/llm.ts packages/opencode/src/session/llm/request.ts packages/opencode/test/session/llm.test.ts && git commit -m "feat(opencode): preserve delegated Codex request preparation"`.

### Task 5 — Built-in Codex hooks (E)

**Files:** OpenCode modify `packages/opencode/src/plugin/openai/codex.ts` `CodexAuthPlugin` `chat.params`/`chat.headers`; modify `packages/opencode/test/plugin/codex.test.ts`.

**Consumes:** `credentialProviderID(input.provider)` from Task 1, selected `input.model.providerID`; built-in hook only (not project plugin). **Produces:** `maxOutputTokens: undefined`, Codex originator/user-agent/session headers for C1 and unchanged normal OpenAI; no token in hook output.

- [ ] **RED:** Add `test("C1 hooks honor delegated OpenAI semantics and ordinary OpenAI", ...)` to `test/plugin/codex.test.ts`: invoke both hooks with dedicated `model.providerID`, `provider.options.credentialProvider = "openai"` (`@opencode-ai/plugin.ProviderContext`), normal `openai`, and unmarked other provider. Assert both OpenAI paths set `originator`, `session-id`, clear `maxOutputTokens`; unmarked path untouched. Run `bun test test/plugin/codex.test.ts -t "C1 hooks"`. Expected FAIL: dedicated hooks return early on selected provider ID.
- [ ] **GREEN:** Replace both selected-ID guards with `credentialProviderID({ id: ProviderV2.ID.make(input.model.providerID), options: input.provider.options }) === ProviderV2.ID.openai`; `ProviderContext` exposes `.options`, but not `.id`, so do not pass it to the resolver directly. Do not put OAuth access/refresh on hook input or output. Run same command (PASS) and `bun typecheck` (exit 0). **REFACTOR:** None required. **Commit (OpenCode):** `git add packages/opencode/src/plugin/openai/codex.ts packages/opencode/test/plugin/codex.test.ts && git commit -m "feat(opencode): apply Codex hooks to delegated provider"`.

### Task 6 — Target-aware OAuth transport (F)

**Files:** OpenCode modify `packages/opencode/src/provider/provider.ts` `resolveSDK`; modify `packages/opencode/src/plugin/openai/codex.ts` `CodexAuthPlugin.auth.loader` returned `fetch`; modify `packages/opencode/test/plugin/codex.test.ts` and `packages/opencode/test/provider/provider.test.ts`.

**Consumes:** Task 2 owner fetch, Task 5 hooks, selected configured Gateway URL, Task 1 resolver. **Produces:** OAuth Authorization/account injection with Gateway URL unchanged for C1, existing direct ChatGPT rewrite for normal OpenAI, no marker on wire.

- [ ] **RED:** Add `test("C1 OAuth fetch keeps Gateway URL and strips internal target marker", ...)` to `test/plugin/codex.test.ts` using `Bun.serve` and `CodexAuthPlugin` with synthetic OAuth. Invoke loader fetch with Gateway `/v1/responses` and marker `gateway`, inspect destination/header *presence* and absent marker; call unmarked OpenAI `/v1/responses` and assert existing Codex rewrite. Add `it.instance("C1 resolveSDK selects Gateway transport target", ...)` to `test/provider/provider.test.ts` asserting core adds marker only to dedicated internal fetch invocation, not normal. Run `bun test test/plugin/codex.test.ts -t "C1 OAuth fetch"` and `bun test test/provider/provider.test.ts -t "C1 resolveSDK"`. Expected FAIL: current fetch rewrites any `/v1/responses` to direct ChatGPT; core lacks marker.
- [ ] **GREEN:** Core adds `CODEX_TARGET_HEADER` internally for the dedicated selected SDK only; built-in loader strips it before HTTP/WebSocket dispatch, validates marker/Gateway target, retains OAuth injection/refresh, disables WebSocket for dedicated target, retains normal routing. Reject mismatched target before any network request; do not ship marker to Gateway. Run `bun test test/plugin/codex.test.ts -t "C1 OAuth fetch"` and `bun test test/provider/provider.test.ts -t "C1 resolveSDK"` (both PASS), then `bun typecheck` (exit 0). **REFACTOR:** Centralize marker stripping in the one fetch path so WebSocket and HTTP do not diverge. Rerun `bun test test/plugin/codex.test.ts -t "C1 OAuth fetch"` and `bun test test/provider/provider.test.ts -t "C1 resolveSDK"` (both PASS). **Commit (OpenCode):** `git add packages/opencode/src/provider/provider.ts packages/opencode/src/plugin/openai/codex.ts packages/opencode/test/provider/provider.test.ts packages/opencode/test/plugin/codex.test.ts && git commit -m "feat(opencode): preserve gateway target in Codex OAuth transport"`.

### Task 7 — Agent generation consumer (G)

**Files:** OpenCode modify `packages/opencode/src/agent/agent.ts` `Agent.generate`; modify `packages/opencode/test/agent/agent.test.ts`.

**Consumes:** `provider.getModel`, `provider.getProvider`, `credentialProviderID`, `auth.get`, `provider.getLanguage`. **Produces:** delegated OAuth `streamObject` instructions branch with dedicated selected model; normal `generateObject` for unmarked providers.

- [ ] **RED:** Add `it.instance("C1 Agent.generate selects OpenAI OAuth semantics", ...)` in `test/agent/agent.test.ts` using a local Responses fixture/stream and a dedicated selected model. Assert no system role, `instructions` present, selected Gateway target retained; normal non-OAuth branch unaffected. Run `bun test test/agent/agent.test.ts -t "C1 Agent.generate"`. Expected FAIL: `Agent.generate` looks up `auth.get(model.providerID)` and checks selected ID.
- [ ] **GREEN:** Lookup `provider.getProvider(model.providerID)`, call shared resolver, use `auth.get(credentialProviderID(selected))` in `Agent.generate` and gate existing `streamObject` branch on owner OpenAI plus OAuth. Preserve selected `resolved` for model/`ProviderTransform.providerOptions`. Run `bun test test/agent/agent.test.ts -t "C1 Agent.generate"` (PASS) and `bun typecheck` (exit 0). **REFACTOR:** None required. **Commit (OpenCode):** `git add packages/opencode/src/agent/agent.ts packages/opencode/test/agent/agent.test.ts && git commit -m "feat(opencode): use credential owner for agent generation"`.

### Task 8 — Dedicated project plugin registration and controls

**Files:** Project modify `packages/opencode-plugin/src/plugin.ts` `CloudflareAiGatewayChatgpt`, `packages/opencode-plugin/src/config.ts` `ResolvedConfig`/`resolveConfig`, `packages/opencode-plugin/src/gateway-url.ts` `buildGatewayModelUrl`, `packages/opencode-plugin/src/control-headers.ts` `createChatHeaders`; modify `test/plugin.test.ts`, `test/control-headers.test.ts`, `test/gateway-url.test.ts`, `test/config.test.ts`.

**Consumes:** Task 1 config contract, `ResolvedConfig` gateway/relay values, `@opencode-ai/plugin.Hooks.config`. **Produces:** dedicated provider config with `openai/gpt-6-sol` and C1 control headers; untouched ordinary OpenAI; payload logging always false.

- [ ] **RED:** Add `it("registers only cf-ai-gw-relay provider with explicit OpenAI owner", ...)` in `test/plugin.test.ts` invoking returned `config` hook on `{provider:{openai:...}}` and checking OpenAI object unchanged, dedicated namespace/config key, no OAuth fields. Add `it("adds controls only for dedicated model", ...)` in `test/control-headers.test.ts` asserting `cf-aig-collect-log-payload=false` and no OAuth token mutation; `it("adds /v1 before SDK responses suffix", ...)` in `test/gateway-url.test.ts`; `it("rejects C1 payload collection opt-in", ...)` in `test/config.test.ts`. Run `npm test -- --run test/plugin.test.ts test/control-headers.test.ts test/gateway-url.test.ts test/config.test.ts`. Expected FAIL: old hook mutates OpenAI; URL lacks `/v1`; logging defaults true. Failure in each assertion proves distinct missing contract.
- [ ] **GREEN:** In `config.ts` define `resolveConfig(env: EnvSource, options: PluginOptions = {}, providerOptions: { providerSlug?: unknown } = {}): ResolvedConfig`. Require `RELAY_CF_AIG_TOKEN` and `RELAY_SECRET` from environment only; resolve slug from `RELAY_CF_PROVIDER_SLUG`, then `providerOptions.providerSlug`, then `relay-chatgpt`; reject `collectLogPayload: true` and `RELAY_CF_AIG_COLLECT_LOG_PAYLOAD=true`, and always return `collectLogPayload: false`. In `CloudflareAiGatewayChatgpt`, retain the existing host-version check and return `config: async (cfg) => { cfg.provider ??= {}; const resolved = resolveConfig(process.env, options, cfg.provider["cf-ai-gw-relay"]?.options); cfg.provider["cf-ai-gw-relay"] = ... }` plus `chat.headers`; hold `resolved` in a plugin-instance closure and reject header invocation before config. Update `test/config.test.ts` to assert `apiKey` and `relayToken` plugin-option fallbacks fail when the corresponding required environment value is missing; update `test/plugin.test.ts` to assert configuration errors during the `config` hook instead of activation. Remove `provider.models` registration. Build `options.credentialProvider = "openai"`, preserve validated dedicated `providerSlug`, reject conflicting existing config, set `api`/per-model `provider.api` from `buildGatewayModelUrl`, and model `openai/gpt-6-sol` → wire `gpt-6-sol`; never add auth/refresh/options.apiKey. `buildGatewayModelUrl` appends `/v1`; `createChatHeaders` scopes by `input.model.providerID === "cf-ai-gw-relay"` and selected model ID, with fixed payload header false. Run `npm test -- --run test/plugin.test.ts test/control-headers.test.ts test/gateway-url.test.ts test/config.test.ts` (PASS), `npm run typecheck` (exit 0), `npm run build` (exit 0). **REFACTOR:** Remove obsolete invocation/import of `createProviderModels` in `plugin.ts` only; preserve historical file unchanged. Rerun `npm test -- --run test/plugin.test.ts`. **Commit (Project):** `git add packages/opencode-plugin/src/plugin.ts packages/opencode-plugin/src/config.ts packages/opencode-plugin/src/gateway-url.ts packages/opencode-plugin/src/control-headers.ts packages/opencode-plugin/test/plugin.test.ts packages/opencode-plugin/test/control-headers.test.ts packages/opencode-plugin/test/gateway-url.test.ts packages/opencode-plugin/test/config.test.ts && git commit -m "feat(plugin): register dedicated relay provider without OAuth access"`.

### Task 9 — Security boundaries (H)

**Files:** OpenCode modify `packages/opencode/test/provider/provider.test.ts`, `packages/opencode/test/plugin/codex.test.ts`; Project modify `packages/opencode-plugin/test/plugin.test.ts`, `packages/opencode-plugin/test/control-headers.test.ts`.

**Consumes:** Tasks 6–8 runtime state, fake OAuth access/refresh sentinels, separate Gateway/relay sentinels. **Produces:** proof of privilege isolation and fail-closed behavior.

- [ ] **RED:** Add OpenCode `test("C1 marker alone cannot access OAuth credential object", ...)` in `test/plugin/codex.test.ts` (a marker with absent/invalid owner cannot dispatch); provider test `it.instance("C1 rejects absent credential owner and model", ...)` (no network). Add Project `it("config hook exposes no OAuth credential or private auth store", ...)` in `test/plugin.test.ts` with a throwing fake `client.auth` getter, asserting no read of `auth.json`, access or refresh and no such fields in returned hooks; `it("control headers keep auth and account opaque", ...)` in `test/control-headers.test.ts` verifies OAuth-related header unchanged and no secret in metadata. Run `bun test test/plugin/codex.test.ts -t "C1 marker alone"`, `bun test test/provider/provider.test.ts -t "C1 rejects absent"`, `npm test -- --run test/plugin.test.ts test/control-headers.test.ts`. Expected FAIL only at assertions requiring missing fail-closed guard or old plugin behavior; if an assertion already passes on unchanged source, record it as baseline regression protection instead of claiming RED.
- [ ] **GREEN:** Enforce missing owner/model and invalid target guards in exact Task 2/6 functions, and prevent project plugin activation from accessing `client.auth`/raw tokens in `CloudflareAiGatewayChatgpt`. No new credential API. Run `bun test test/plugin/codex.test.ts -t "C1 marker alone"`, `bun test test/provider/provider.test.ts -t "C1 rejects absent"`, and `npm test -- --run test/plugin.test.ts test/control-headers.test.ts` (all PASS), then `bun typecheck` and `npm run typecheck` (exit 0). **REFACTOR:** None required. **Commit:** OpenCode `git add packages/opencode/test/provider/provider.test.ts packages/opencode/test/plugin/codex.test.ts && git commit -m "test(opencode): guard delegated OAuth boundaries"`; Project `git add packages/opencode-plugin/test/plugin.test.ts packages/opencode-plugin/test/control-headers.test.ts && git commit -m "test(plugin): protect delegated OAuth boundary"`.

### Task 10 — Ordinary OpenAI regression (I)

**Files:** OpenCode modify `packages/opencode/test/plugin/codex.test.ts`, `packages/opencode/test/session/llm.test.ts`; Project modify `packages/opencode-plugin/test/plugin.test.ts`.

**Consumes:** tasks 1–9; stock `openai/gpt-6-sol`. **Produces:** normal provider self-owned, no marker, direct Codex rewrite unchanged, no project control headers or plugin config mutation.

- [ ] **RED (characterization before applying Tasks 2–8):** In OpenCode `test("ordinary OpenAI has direct Codex rewrite without C1 marker", ...)` and `it.instance("ordinary OpenAI retains self-owned OAuth request", ...)`, Project `it("ordinary OpenAI config and headers are untouched", ...)`, run `bun test test/plugin/codex.test.ts -t "ordinary OpenAI"`, `bun test test/session/llm.test.ts -t "ordinary OpenAI"`, `npm test -- --run test/plugin.test.ts`. Expected OpenCode PASS on unmodified baseline (characterization guards, not fabricated failing RED). Expected Project FAIL on unmodified baseline because the old plugin mutates ordinary `openai`; after Task 8 it must PASS. After Tasks 2–9, an OpenCode regression makes the characterization tests FAIL, identifying delegation leakage.
- [ ] **GREEN verification:** No production edit for this independent regression task; rerun `bun test test/plugin/codex.test.ts -t "ordinary OpenAI"`, `bun test test/session/llm.test.ts -t "ordinary OpenAI"`, and `npm test -- --run test/plugin.test.ts` against the integrated tree (all PASS), then `bun typecheck`, `npm run typecheck`, `npm test` (all exit 0). **REFACTOR:** None required. **Commit:** OpenCode `git add packages/opencode/test/plugin/codex.test.ts packages/opencode/test/session/llm.test.ts && git commit -m "test(opencode): protect ordinary OpenAI Codex route"`; Project `git add packages/opencode-plugin/test/plugin.test.ts && git commit -m "test(plugin): preserve ordinary OpenAI isolation"`.

### Task 11 — Production-source runtime acceptance (J; last)

**Files:** No production/test edits; runtime validation record remains in the implementation review handoff, not in this plan or CI. No commit.

**Consumes:** integrated OpenCode and Project source, existing local OpenCode OAuth (outside CI), valid Gateway/relay runtime configuration, deployed existing Custom Provider and relay. **Produces:** sanitized evidence of end-to-end C1 and normal OpenAI HTTP 200, or named failing boundary.

- [ ] **RED preflight:** From the clean OpenCode worktree verify baseline with `bun run src/index.ts run -m openai/gpt-6-sol "Reply OK"` (working directory OpenCode `packages/opencode`); expect usable output and HTTP 200 with no C1 marker. For dedicated selection before source integration, same command with `-m cf-ai-gw-relay/openai/gpt-6-sol` must fail provider/model resolution (not bypass); this is the runtime RED, **not** a new test or a repeat of the already validated disposable spike. Never output raw HTTP headers/auth state.
- [ ] **GREEN:** With integrated source and local OAuth, run `bun run src/index.ts run -m cf-ai-gw-relay/openai/gpt-6-sol "Reply OK"` from OpenCode `packages/opencode`; inspect sanitized host/Gateway/relay boundaries only: selected ID dedicated, credential owner `openai`, OAuth reused, Gateway destination `custom-relay-chatgpt/v1/responses`, no direct rewrite, Gateway auth PASS, relay `POST /v1/responses`, fixed upstream accepted HTTP 200, usable OpenCode output. Then run `bun run src/index.ts run -m openai/gpt-6-sol "Reply OK"` and confirm normal HTTP 200/direct Codex path/no C1 marker. If any boundary fails, stop and classify; no fallback or retry. **REFACTOR:** None required. **Commit:** None; attach redacted acceptance results to review handoff only.

## Error handling and observability matrix

| Boundary | Owner and exact propagation |
| --- | --- |
| Selected provider/model absent | `Provider.getModel` yields existing `Provider.ModelNotFoundError`; no network request. |
| Invalid credential owner pairing/value | `credentialProviderID` throws new `CredentialProviderError` without credential/config value; stop before auth/SDK. |
| Effective owner absent/model absent | Provider initialization fails closed with existing `Provider.ModelNotFoundError` for model absence; owner provider absence uses `Provider.InitError` with selected ID and no secret. |
| Auth lookup missing/refresh fails | Preserve `Auth.Service.get` error/undefined behavior and built-in Codex refresh error; no new token store or fallback. Dedicated missing OAuth fails before dispatch, not as anonymous Gateway request. |
| Profile/request semantics mismatch | Provider model-loader error remains `Provider.InitError`/`Provider.ModelNotFoundError` at existing boundary; rejected upstream HTTP 400 surfaces unchanged. Never retry by switching profile/provider. |
| Gateway transport/auth | Native fetch/AI SDK error or Gateway 401/403 surfaces to caller; no direct rewrite/fallback. |
| Relay | Relay 401/503/504/other existing error or stream abort surfaces unchanged; no second request. |
| Upstream Codex | Relay forwards upstream status and sanitized response unchanged; no fallback. |

Existing OpenCode diagnostics need no new log fields: safe IDs and existing HTTP status/boundary are sufficient. If attaching a local acceptance record, allow selected/effective provider ID, target category, failing boundary and HTTP status only. Never record `Authorization`, OAuth access/refresh, raw `ChatGPT-Account-Id`, full headers/auth object, prompt or response body. Project plugin and relay must remain blind to OAuth internals.

## Verification and review gate

1. Run OpenCode `bun test test/provider/provider.test.ts test/session/llm.test.ts test/plugin/codex.test.ts test/agent/agent.test.ts` and `bun typecheck` from `packages/opencode`; Project `npm ci --ignore-scripts`, `npm run typecheck`, `npm test`, `npm run build` from `packages/opencode-plugin`. Run project root `deno test apps/deno-relay .github/scripts`, `deno fmt --check`, `deno lint` only if relay/provisioning files change; these are outside this implementation scope.
2. Verify task-level RED failures are behavior-specific and GREEN commands pass; compare normal and delegated Responses bodies by semantically important field presence/absence (`max_output_tokens`, `reasoning`, `text`), not complete snapshots or a permanent hard-coded allowlist.
3. Compare every task and interface against `SPEC.md`; final pre-implementation review condition: **設計書と実装計画書に仕様・用語・型/インターフェース・エラー処理・テスト方針・非機能要件の乖離がないこと**. This plan is `READY FOR REVIEW` only; it does not self-authorize implementation, production support, or release. The §3/§9 protected host-capability and OAuth-free CI gates remain mandatory and separate from local OAuth runtime acceptance.
