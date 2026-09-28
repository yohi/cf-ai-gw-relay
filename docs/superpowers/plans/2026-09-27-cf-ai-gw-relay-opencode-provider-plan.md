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
| `docs/configuration.md` | Synchronize public C1 configuration guidance and examples with `SPEC.md`. |
| `docs/configuration.ja.md` | Japanese equivalent of the C1 configuration guidance; keep behavior and precedence in parity with English. |

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
| Project: `packages/opencode-plugin/test/config.test.ts` | Reject payload-log opt-in; environment-only secret resolution. |
| Project: `packages/opencode-plugin/test/redaction.test.ts` | Verify exact C1 unavailable error does not include config/secret values. |

## Files Explicitly Not Modified

`SPEC.md` (normative), `apps/deno-relay/**` (current fixed upstream), `.github/**` (protected acceptance/CI), all lockfiles/manifests/dependencies, `packages/opencode-plugin/src/provider-models.ts` and its existing tests (historical implementation snapshot: do not invoke the old hook), deleted historical design/plan paths, Issue #28 and Cloudflare resources. This file is the only artifact of the **planning** session; file tables above describe future implementation work, not edits made now.

## Exact contracts and decision rules

1. Configuration, read in `ConfigV1.Info.provider["cf-ai-gw-relay"].options` (`packages/core/src/v1/config/provider.ts:Info`): `credentialProvider?: "openai"`; absent means self. Only `cf-ai-gw-relay` may use the literal. Project `config` hook installs `{ provider: { "cf-ai-gw-relay": { npm: "@ai-sdk/openai", api: gatewayURL, options: { credentialProvider: "openai" }, models: { "openai/gpt-6-sol": { id: "gpt-6-sol", provider: { npm: "@ai-sdk/openai", api: gatewayURL } } } } }` by mutating the passed config. Do not assign `apiKey`, `Authorization`, `ChatGPT-Account-Id`, or `fetch` in this hook. `gatewayURL` ends in `/custom-relay-chatgpt/v1`; SDK adds `/responses`. Selected model ID is `openai/gpt-6-sol`; wire ID is `gpt-6-sol`. Owner catalog profile is copied inside OpenCode before exposing the model, so the minimal config entry is not a conflicting second profile. Resolve provider slug from `RELAY_CF_PROVIDER_SLUG`, then the existing `cfg.provider["cf-ai-gw-relay"]?.options?.providerSlug`, then `relay-chatgpt`; reject conflicting existing dedicated model definitions and credential-owner values rather than silently overwriting. Preserve `cfg.enabled_providers` exactly: do not append, remove, or bypass entries. With the property absent use normal provider discovery; if it is present, dedicated use requires `cf-ai-gw-relay`; both-route acceptance also requires `openai`. An excluded dedicated provider is unavailable, fails closed, and never falls back.
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

6. Host allowlist: in OpenCode `packages/opencode/src/provider/provider.ts`, `Provider` applies `enabled_providers` after plugin `config` hooks and filters provider IDs without mutating the config. C1 preserves this user-owned behavior. Absent allowlist uses standard discovery; explicit allowlist including `cf-ai-gw-relay` allows C1; explicit list excluding it makes C1 unavailable; no fallback. Tests for ordinary `openai/*` must set `enabled_providers: ["openai", "cf-ai-gw-relay"]` when asserting both routes.

7. Config hook errors: in OpenCode 1.18.31 `packages/opencode/src/plugin/index.ts` logs and ignores external `config` hook exceptions, so project code MUST NOT treat a throw as plugin-init abort. Use existing `PluginConfigurationError` from `packages/opencode-plugin/src/errors.ts`. Resolve configuration into locals, construct the full provider value, then assign atomically. In `createChatHeaders`, check `input.model.providerID !== "cf-ai-gw-relay"` first and return `{}` without reading the config closure; only then read resolved C1 state and throw `PluginConfigurationError("C1 configuration unavailable")` if absent. Thus failed C1 resolution cannot change config or break normal OpenAI; dedicated request stops before dispatch.

8. Human documentation contract: update both `docs/configuration.md` and `docs/configuration.ja.md` in Task 8. They are explanatory guides, not normative authority. Both must identify `cf-ai-gw-relay/openai/gpt-6-sol`, provider identity and credential owner, `credentialProvider`, env-only `RELAY_CF_AIG_TOKEN`/`RELAY_SECRET`, no plugin `apiKey`/`relayToken` secret fallbacks, payload collection fixed false with `true` rejected, provider slug precedence, explicit `enabled_providers` rules, and ordinary `openai/*` separation.

## Dependency graph and execution commands

```text
Task 1 resolver/config → Task 2 provider initialization/model/profile
Task 1 → Task 5 Codex hooks
Task 2 + Task 5 → Task 6 transport
Task 6 → Task 3 LLM auth → Task 4 request prep → Task 7 agent/generation
Task 2 + Task 6 → Task 8 project plugin + EN/JA docs integration
Task 7 + Task 8 → Task 9 security boundary → Task 10 ordinary OpenAI regression
Task 9 + Task 10 → Task 11 production-source runtime acceptance
```

Tasks 2 and 5 can be developed independently after Task 1 (different consumers); Task 8 can be developed alongside Tasks 3–4 after Task 6 (different repositories). Integrate and run both suites before either merged commit; never share mutable working trees. All `bun test ...` and `bun typecheck` commands below run in OpenCode `packages/opencode`; all `npm test -- ...` commands run in Project `packages/opencode-plugin`. Never run Bun tests from the OpenCode repository root. RED must be a behavior assertion failing against unchanged implementation, not an import/compiler failure; when adding a test for a new symbol, import it only after the RED test uses an existing public seam, or treat the missing symbol as an explicitly stated RED signal.

OpenCode runtime provenance is fixed for all tasks: Task 1 creates `C1_INTEGRATED_OPENCODE` from the clean worktree at the pinned base and creates a detached `C1_BASELINE_OPENCODE` at that exact base commit. Tasks 1–7 modify and commit only `C1_INTEGRATED_OPENCODE`; run their commands from `$C1_INTEGRATED_OPENCODE/packages/opencode`. Task 10 and Task 11 GREEN use `C1_INTEGRATED_OPENCODE`; Task 11 RED uses `C1_BASELINE_OPENCODE` and runs from `$C1_BASELINE_OPENCODE/packages/opencode`. Never reset the integrated worktree to baseline or use it for baseline RED.

### Task 1 — Explicit configuration and bounded resolver (A)

**Files:** OpenCode create `packages/opencode/src/provider/credential-provider.ts`; modify `packages/core/src/v1/config/provider.ts` `Info.options`; modify `packages/opencode/test/provider/provider.test.ts`.

**Consumes:** `Provider.Info.id`, `.options.credentialProvider`, `ProviderV2.ID`. **Produces:** `credentialProviderID(Pick<Provider.Info, "id" | "options">): ProviderV2.ID`, `CredentialProviderError`.

- [ ] **PROVENANCE PREPARATION:** From the clean OpenCode 1.18.31 worktree capture the integrated worktree and its exact starting commit, verify cleanliness, and create the baseline worktree:

  ```sh
  C1_INTEGRATED_OPENCODE="$(git rev-parse --show-toplevel)"
  C1_CORE_BASELINE_COMMIT="$(git rev-parse HEAD)"
  test "$C1_CORE_BASELINE_COMMIT" = "014614d35b397775e5d397a490fc72368c894ec2"
  test -z "$(git -C "$C1_INTEGRATED_OPENCODE" status --porcelain)"
  C1_CORE_BASELINE_PARENT="$(mktemp -d)"
  C1_BASELINE_OPENCODE="$C1_CORE_BASELINE_PARENT/opencode-baseline"
  git -C "$C1_INTEGRATED_OPENCODE" worktree add --detach "$C1_BASELINE_OPENCODE" "$C1_CORE_BASELINE_COMMIT"
  (cd "$C1_BASELINE_OPENCODE" && bun install --frozen-lockfile)
  export C1_INTEGRATED_OPENCODE C1_CORE_BASELINE_COMMIT C1_CORE_BASELINE_PARENT C1_BASELINE_OPENCODE
  ```

  Keep both worktrees and variables until Task 11 completes. Only `C1_BASELINE_OPENCODE` is disposable; `C1_INTEGRATED_OPENCODE` is the implementation worktree and MUST NOT be removed.

- [ ] **RED:** In `test/provider/provider.test.ts` add `test("C1 credential owner is explicit and bounded", ...)`: normal `openai` → `openai`; marked `cf-ai-gw-relay` → `openai`; unmarked `anthropic` → itself; marked `anthropic` or unknown owner throws without echo. Run `bun test test/provider/provider.test.ts -t "C1 credential owner is explicit and bounded"`. Expected FAIL: missing resolver export or wrong delegated value; proves no shared bounded decision exists yet.
- [ ] **GREEN:** Add the exact symbol and error above; add optional literal field in `ConfigProviderV1.Info.options` (rest fields stay intact). Run `bun test test/provider/provider.test.ts -t "C1 credential owner is explicit and bounded"`; expected PASS for all four identity categories. Run `bun typecheck`; expected exit 0.
- [ ] **REFACTOR:** None required. **Commit (OpenCode):** `git add packages/core/src/v1/config/provider.ts packages/opencode/src/provider/credential-provider.ts packages/opencode/test/provider/provider.test.ts && git commit -m "feat(opencode): resolve explicit relay credential owner"`.

### Task 2 — Provider initialization, owner profile and loader (A, D)

**Files:** OpenCode modify `packages/opencode/src/provider/provider.ts` (`layer`'s `InstanceState.make` config/model loops, plugin auth loader, `resolveSDK`, `getLanguage`); modify `packages/opencode/test/provider/provider.test.ts`.

**Consumes:** Task 1 resolver, `ConfigProviderV1.Info`, existing OpenAI database/profile/`CustomModelLoader`. **Produces:** dedicated `Provider.Model` with `providerID = cf-ai-gw-relay`, `id = openai/gpt-6-sol`, `api.id = gpt-6-sol`, `api.npm = @ai-sdk/openai`, `api.url` = Gateway `/v1`, owner capabilities/variants/limits and owner Responses loader; selected provider SDK options remain route owner.

- [ ] **CHARACTERIZATION + RED:** In `test/provider/provider.test.ts`, add `it.instance("enabled_providers preserves explicit C1 allowlist policy", ...)` with three exact fixtures: property absent → default discovery includes C1 after plugin config; `enabled_providers: ["openai", "cf-ai-gw-relay"]` → both remain available; `enabled_providers: ["openai"]` → C1 absent, OpenAI present, input list unchanged and no fallback. Assert provider listing/model lookup results, not only config-hook mutation. Run `bun test test/provider/provider.test.ts -t "enabled_providers preserves explicit C1 allowlist policy"`; this is a host-behavior characterization and MUST PASS on unmodified OpenCode 1.18.31: the test fixture supplies config-hook output before provider enumeration, and the existing `enabled_providers` filter omits C1 without changing the list. It is not a RED implementation step because C1 does not modify the host filter; project hook allowlist mutation is tested in Task 8. Also add `it.instance("C1 model inherits OAuth OpenAI profile without losing Gateway target", ...)` with synthetic OAuth, owner reasoning/variants/limits, selected ID and Gateway URL, and OpenAI Responses loader assertions; add `it.instance("C1 refuses missing owner model", ...)` asserting `Provider.ModelNotFoundError` before fetch. Run `bun test test/provider/provider.test.ts -t "enabled_providers|C1"`. Expected RED in the C1 model test: selected owner profile/Responses loader is not yet materialized; the allowlist characterization passes. No import/type failure is accepted as RED. Actual wire-body parity is checked after Task 6 in Task 4's integrated `llm.test.ts` scenario.
- [ ] **GREEN:** In config model materialization, copy the *post-hook* owner `gpt-6-sol` profile for only this pair; override selected identity, wire ID, Gateway URL, explicit model options/variants; preserve owner model unchanged. In plugin auth loader initialization, use the same resolver to copy OpenAI loader-produced **`fetch` and dummy `apiKey` only into core's selected provider runtime state**, not into `toPublicInfo` or project plugin; apply after config re-merge so config `credentialProvider`/URL survive. In `resolveSDK`, remove `credentialProvider` from SDK options, retain selected `baseURL`, and use owner `fetch`/dummy API key; in `getLanguage`, choose owner model loader and pass dedicated model as selected. Run `bun test test/provider/provider.test.ts -t "C1"` (PASS), `bun typecheck` (exit 0). No new persistent auth entry.
- [ ] **REFACTOR:** Remove any duplicated owner tests in the two provider initialization loops; both call Task 1 resolver. Rerun `bun test test/provider/provider.test.ts -t "C1"`. **Commit (OpenCode):** `git add packages/opencode/src/provider/provider.ts packages/opencode/test/provider/provider.test.ts && git commit -m "feat(opencode): materialize delegated OpenAI model profile"`.

### Task 3 — LLM authentication lookup (B)

**Files:** OpenCode modify `packages/opencode/src/session/llm.ts` `LLM.run`; modify `packages/opencode/test/session/llm.test.ts`.

**Consumes:** Task 1 resolver, Task 6 transport, selected `input.model.providerID`, `provider.getProvider`, `Auth.Service.get`. **Produces:** `auth.get(openai)` result for C1 while `input.model.providerID` remains dedicated.

- [ ] **CHARACTERIZATION — ordinary OpenAI behavior:** Add `it.instance("ordinary OpenAI auth lookup remains self-owned", ...)` to `test/session/llm.test.ts`; assert `Auth.Service.get` receives `openai` for selected `openai/gpt-6-sol`. Run `bun test test/session/llm.test.ts -t "ordinary OpenAI auth lookup remains self-owned"`. Expected PASS against unchanged OpenCode; this locks the existing self-owned behavior before Task 3's GREEN.
- [ ] **RED:** Add `it.instance("C1 LLM uses OpenAI auth without changing provider identity", ...)` to `test/session/llm.test.ts`, using its `drain`, `Provider.use.getModel`, and an `Auth.Service.get` test layer recording the lookup key. Assert key `openai` while `input.model.providerID` is `cf-ai-gw-relay`; use a synthetic OAuth result and the Task 6 local transport test endpoint, without exposing an auth value in output. Run `bun test test/session/llm.test.ts -t "C1 LLM uses OpenAI auth"`. Expected FAIL: `LLM.run` calls `auth.get(input.model.providerID)` (recorded key is `cf-ai-gw-relay`), independently of Task 4's request-prep behavior.
- [ ] **GREEN:** In `run` resolve selected provider before auth (split the current concurrent `Effect.all`, because `auth.get` depends on `provider.getProvider`), then `auth.get(credentialProviderID(item))`; retain the effective ID locally; Task 4 adds it to `PrepareInput`. Never rewrite the selected provider/model. Run `bun test test/session/llm.test.ts -t "C1 LLM uses OpenAI auth"` (PASS) and `bun typecheck` (exit 0). **REFACTOR:** None required. **Commit (OpenCode):** `git add packages/opencode/src/session/llm.ts packages/opencode/test/session/llm.test.ts && git commit -m "feat(opencode): use delegated credential for LLM auth"`.

### Task 4 — Request preparation semantics (C)

**Files:** OpenCode modify `packages/opencode/src/session/llm/request.ts` `PrepareInput`, `prepare`, `packages/opencode/src/session/llm.ts` `LLM.run`; modify `packages/opencode/test/session/llm.test.ts`.

**Consumes:** Task 3's effective owner ID, `input.auth?.type`, `ProviderTransform.options`. **Produces:** OpenAI OAuth `instructions` and no system-message duplication under dedicated provider; unchanged selected IDs.

- [ ] **CHARACTERIZATION — ordinary OpenAI behavior:** Add `it.instance("ordinary OpenAI OAuth request preparation is unchanged", ...)` in `test/session/llm.test.ts`; assert OpenAI OAuth still produces `instructions`, no synthetic system message and `store: false`. Run `bun test test/session/llm.test.ts -t "ordinary OpenAI OAuth request preparation is unchanged"`. Expected PASS before Task 4's GREEN; this captures current ordinary-provider semantics.
- [ ] **RED:** Add `it.instance("C1 request preparation matches OpenAI OAuth instructions", ...)` in `test/session/llm.test.ts`; capture both requests through `waitRequest` and assert `instructions` present, no synthetic `system` message, `store: false`, and selected model stays dedicated. Run `bun test test/session/llm.test.ts -t "C1 request preparation"`. Expected FAIL: `prepare` currently checks `input.provider.id === "openai"`.
- [ ] **GREEN:** Extend `PrepareInput` with `readonly credentialProviderID: ProviderV2.ID`; change `LLM.run` in `packages/opencode/src/session/llm.ts` to pass Task 3's local effective ID; set `isOpenaiOauth = input.credentialProviderID === ProviderV2.ID.openai && input.auth?.type === "oauth"`. Leave tool handling and hooks' selected provider context unchanged. Run `bun test test/session/llm.test.ts -t "C1 request preparation"` (PASS) and `bun typecheck` (exit 0). **REFACTOR:** None required. **Commit (OpenCode):** `git add packages/opencode/src/session/llm.ts packages/opencode/src/session/llm/request.ts packages/opencode/test/session/llm.test.ts && git commit -m "feat(opencode): preserve delegated Codex request preparation"`.

### Task 5 — Built-in Codex hooks (E)

**Files:** OpenCode modify `packages/opencode/src/plugin/openai/codex.ts` `CodexAuthPlugin` `chat.params`/`chat.headers`; modify `packages/opencode/test/plugin/codex.test.ts`.

**Consumes:** `credentialProviderID(input.provider)` from Task 1, selected `input.model.providerID`; built-in hook only (not project plugin). **Produces:** `maxOutputTokens: undefined`, Codex originator/user-agent/session headers for C1 and unchanged normal OpenAI; no token in hook output.

- [ ] **CHARACTERIZATION — ordinary OpenAI behavior:** Add `test("ordinary OpenAI Codex hooks remain unchanged", ...)` to `test/plugin/codex.test.ts`; assert current OpenAI OAuth `chat.params` and `chat.headers` outputs, including `originator`, `session-id`, and cleared `maxOutputTokens`. Run `bun test test/plugin/codex.test.ts -t "ordinary OpenAI Codex hooks remain unchanged"`. Expected PASS before Task 5's GREEN; this protects the pre-existing hook behavior independently of C1.
- [ ] **RED:** Add `test("C1 hooks honor delegated OpenAI semantics and ordinary OpenAI", ...)` to `test/plugin/codex.test.ts`: invoke both hooks with dedicated `model.providerID`, `provider.options.credentialProvider = "openai"` (`@opencode-ai/plugin.ProviderContext`), normal `openai`, and unmarked other provider. Assert both OpenAI paths set `originator`, `session-id`, clear `maxOutputTokens`; unmarked path untouched. Run `bun test test/plugin/codex.test.ts -t "C1 hooks"`. Expected FAIL: dedicated hooks return early on selected provider ID.
- [ ] **GREEN:** Replace both selected-ID guards with `credentialProviderID({ id: ProviderV2.ID.make(input.model.providerID), options: input.provider.options }) === ProviderV2.ID.openai`; `ProviderContext` exposes `.options`, but not `.id`, so do not pass it to the resolver directly. Do not put OAuth access/refresh on hook input or output. Run same command (PASS) and `bun typecheck` (exit 0). **REFACTOR:** None required. **Commit (OpenCode):** `git add packages/opencode/src/plugin/openai/codex.ts packages/opencode/test/plugin/codex.test.ts && git commit -m "feat(opencode): apply Codex hooks to delegated provider"`.

### Task 6 — Target-aware OAuth transport (F)

**Files:** OpenCode modify `packages/opencode/src/provider/provider.ts` `resolveSDK`; modify `packages/opencode/src/plugin/openai/codex.ts` `CodexAuthPlugin.auth.loader` returned `fetch`; modify `packages/opencode/test/plugin/codex.test.ts` and `packages/opencode/test/provider/provider.test.ts`.

**Consumes:** Task 2 owner fetch, Task 5 hooks, selected configured Gateway URL, Task 1 resolver. **Produces:** OAuth Authorization/account injection with Gateway URL unchanged for C1, existing direct ChatGPT rewrite for normal OpenAI, no marker on wire.

- [ ] **CHARACTERIZATION — ordinary OpenAI behavior:** Add `test("ordinary OpenAI OAuth transport keeps direct rewrite and no C1 marker", ...)` in `test/plugin/codex.test.ts`; use synthetic OAuth and a local fetch recorder to assert the existing direct Codex destination and absence of `CODEX_TARGET_HEADER`. Run `bun test test/plugin/codex.test.ts -t "ordinary OpenAI OAuth transport keeps direct rewrite and no C1 marker"`. Expected PASS after Task 5 and before Task 6's GREEN; this records the baseline transport boundary.
- [ ] **RED:** Add `test("C1 OAuth fetch keeps Gateway URL and strips internal target marker", ...)` to `test/plugin/codex.test.ts` using `Bun.serve` and `CodexAuthPlugin` with synthetic OAuth. Invoke loader fetch with Gateway `/v1/responses` and marker `gateway`, inspect destination/header *presence* and absent marker; call unmarked OpenAI `/v1/responses` and assert existing Codex rewrite. Add `it.instance("C1 resolveSDK selects Gateway transport target", ...)` to `test/provider/provider.test.ts` asserting core adds marker only to dedicated internal fetch invocation, not normal. Run `bun test test/plugin/codex.test.ts -t "C1 OAuth fetch"` and `bun test test/provider/provider.test.ts -t "C1 resolveSDK"`. Expected FAIL: current fetch rewrites any `/v1/responses` to direct ChatGPT; core lacks marker.
- [ ] **GREEN:** Core adds `CODEX_TARGET_HEADER` internally for the dedicated selected SDK only; built-in loader strips it before HTTP/WebSocket dispatch, validates marker/Gateway target, retains OAuth injection/refresh, disables WebSocket for dedicated target, retains normal routing. Reject mismatched target before any network request; do not ship marker to Gateway. Run `bun test test/plugin/codex.test.ts -t "C1 OAuth fetch"` and `bun test test/provider/provider.test.ts -t "C1 resolveSDK"` (both PASS), then `bun typecheck` (exit 0). **REFACTOR:** Centralize marker stripping in the one fetch path so WebSocket and HTTP do not diverge. Rerun `bun test test/plugin/codex.test.ts -t "C1 OAuth fetch"` and `bun test test/provider/provider.test.ts -t "C1 resolveSDK"` (both PASS). **Commit (OpenCode):** `git add packages/opencode/src/provider/provider.ts packages/opencode/src/plugin/openai/codex.ts packages/opencode/test/provider/provider.test.ts packages/opencode/test/plugin/codex.test.ts && git commit -m "feat(opencode): preserve gateway target in Codex OAuth transport"`.

### Task 7 — Agent generation consumer (G)

**Files:** OpenCode modify `packages/opencode/src/agent/agent.ts` `Agent.generate`; modify `packages/opencode/test/agent/agent.test.ts`.

**Consumes:** `provider.getModel`, `provider.getProvider`, `credentialProviderID`, `auth.get`, `provider.getLanguage`. **Produces:** delegated OAuth `streamObject` instructions branch with dedicated selected model; normal `generateObject` for unmarked providers.

- [ ] **RED:** Add `it.instance("C1 Agent.generate selects OpenAI OAuth semantics", ...)` in `test/agent/agent.test.ts` using a local Responses fixture/stream and a dedicated selected model. Assert no system role, `instructions` present, selected Gateway target retained; normal non-OAuth branch unaffected. Run `bun test test/agent/agent.test.ts -t "C1 Agent.generate"`. Expected FAIL: `Agent.generate` looks up `auth.get(model.providerID)` and checks selected ID.
- [ ] **GREEN:** Lookup `provider.getProvider(model.providerID)`, call shared resolver, use `auth.get(credentialProviderID(selected))` in `Agent.generate` and gate existing `streamObject` branch on owner OpenAI plus OAuth. Preserve selected `resolved` for model/`ProviderTransform.providerOptions`. Run `bun test test/agent/agent.test.ts -t "C1 Agent.generate"` (PASS) and `bun typecheck` (exit 0). **REFACTOR:** None required. **Commit (OpenCode):** `git add packages/opencode/src/agent/agent.ts packages/opencode/test/agent/agent.test.ts && git commit -m "feat(opencode): use credential owner for agent generation"`.

### Task 8 — Dedicated project plugin registration and controls

**Files:** Project modify `packages/opencode-plugin/src/plugin.ts` `CloudflareAiGatewayChatgpt`, `packages/opencode-plugin/src/config.ts` `ResolvedConfig`/`resolveConfig`, `packages/opencode-plugin/src/gateway-url.ts` `buildGatewayModelUrl`, `packages/opencode-plugin/src/control-headers.ts` `createChatHeaders`, `docs/configuration.md`, `docs/configuration.ja.md`; modify `packages/opencode-plugin/test/plugin.test.ts`, `packages/opencode-plugin/test/control-headers.test.ts`, `packages/opencode-plugin/test/gateway-url.test.ts`, `packages/opencode-plugin/test/config.test.ts`, `packages/opencode-plugin/test/redaction.test.ts`.

**Consumes:** Task 1 config contract, `ResolvedConfig` gateway/relay values, `@opencode-ai/plugin.Hooks.config`. **Produces:** dedicated provider config with `openai/gpt-6-sol` and C1 control headers; untouched ordinary OpenAI; payload logging always false.

- [ ] **RED — registration, controls and ordinary-provider isolation:** Add `it("registers only cf-ai-gw-relay provider with explicit OpenAI owner", ...)` in `test/plugin.test.ts` invoking returned `config` hook on `{ provider: { openai: sentinelProvider } }`; assert `openai` deep-equals the sentinel, `cf-ai-gw-relay.options.credentialProvider === "openai"`, model `openai/gpt-6-sol` maps to wire `gpt-6-sol`, and no OAuth fields are registered. Add `it("does not register legacy OpenAI provider model hook", ...)` in `test/plugin.test.ts`, asserting `hooks.provider?.models` is absent. Add `it("ordinary OpenAI config and headers are untouched", ...)` in the same file; run the C1 `config` hook on a fixture with sentinel `openai` config and assert it remains deep-equal, then call the returned `chat.headers` hook with `openai/gpt-6-sol` and assert no throw, C1 header, or mutation. Add `it("adds C1 controls only for dedicated model", ...)` in `test/control-headers.test.ts`, `it("adds /v1 to the Gateway model URL", ...)` in `test/gateway-url.test.ts`, and `it("rejects C1 payload-log opt-in", ...)` in `test/config.test.ts`. Run `npm test -- --run test/plugin.test.ts test/control-headers.test.ts test/gateway-url.test.ts test/config.test.ts`. Expected FAIL: current plugin exposes the legacy `provider.models` hook and has no `config` hook; its model hook rewrites the pre-C1 OpenAI target model. URL has no `/v1`; current payload logging defaults to true. These assertion failures demonstrate RED; module/import failures do not.
- [ ] **RED:** Add `it("scopes failed C1 configuration to dedicated provider", ...)` in `test/plugin.test.ts` using a missing required Gateway token. Assert plugin factory returns hooks; invoke `config`, catch its expected `PluginConfigurationError`, and assert input config has no `cf-ai-gw-relay` entry. Then invoke `chat.headers` for `openai/gpt-6-sol` and assert no throw, no C1 headers and no mutation; invoke it for `cf-ai-gw-relay/openai/gpt-6-sol` and assert `PluginConfigurationError("C1 configuration unavailable")` and zero fetches. The hooks test calls `config` and catches its error because OpenCode logs/ignores that hook failure; it must not assert plugin activation fails. Add `it("C1 unavailable diagnostic is fixed and redacted", ...)` in `test/redaction.test.ts`; it asserts exact class/message and no sentinel gateway/relay values. Run `npm test -- --run test/plugin.test.ts test/control-headers.test.ts test/gateway-url.test.ts test/config.test.ts test/redaction.test.ts`. Expected FAIL: current plugin construction throws before returning hooks when the required Gateway token is missing; the first assertion requires hook creation to succeed so ordinary/C1 failure paths can be tested independently. The current implementation has no `config` hook, so the test's config-hook assertion also fails behaviorally. No module-resolution failure is accepted as RED.
- [ ] **CHARACTERIZATION — allowlist preservation:** The project `config` hook MUST preserve `enabled_providers` and never append C1. Cover this assertion in `test/plugin.test.ts` alongside the registration tests above; run `npm test -- --run test/plugin.test.ts -t "enabled_providers"`. Expected PASS on the old implementation because it does not mutate the allowlist; this is a characterization, not a claimed failing RED. The OpenCode host filtering cases live in Task 2 and pass against the pinned host baseline.
- [ ] **PROVENANCE PREPARATION — preserve local baseline artifact for Task 11:** Before modifying Project source, run these commands from the Project repository root. They capture the current committed Project source in a detached worktree so Task 11 can run its RED preflight against a local package without consulting npm for `@yohi/cf-ai-gw-relay`:

  ```sh
  PROJECT_ROOT="$(git rev-parse --show-toplevel)"
  C1_PROJECT_BASELINE_COMMIT="$(git rev-parse HEAD)"
  C1_BASELINE_PARENT="$(mktemp -d)"
  C1_BASELINE_PROJECT="$C1_BASELINE_PARENT/project-baseline"
  git -C "$PROJECT_ROOT" worktree add --detach "$C1_BASELINE_PROJECT" "$C1_PROJECT_BASELINE_COMMIT"
  npm --prefix "$C1_BASELINE_PROJECT/packages/opencode-plugin" ci --ignore-scripts
  npm --prefix "$C1_BASELINE_PROJECT/packages/opencode-plugin" run build
  test -f "$C1_BASELINE_PROJECT/packages/opencode-plugin/dist/index.js"
  C1_BASELINE_PLUGIN_SPEC="$(node --input-type=module -e 'import { pathToFileURL } from "node:url"; console.log(pathToFileURL(process.argv[1]).href)' "$C1_BASELINE_PROJECT/packages/opencode-plugin")"
  export PROJECT_ROOT C1_PROJECT_BASELINE_COMMIT C1_BASELINE_PARENT C1_BASELINE_PROJECT C1_BASELINE_PLUGIN_SPEC
  ```

  Require `C1_BASELINE_PLUGIN_SPEC` to begin with `file://` and point to this detached local package directory. Keep the worktree and variables until Task 11 completes; do not publish or install this package by registry specifier. Task 11's `verify_plugin_spec` helper checks URL identity, package name, and local `main` file before execution.
- [ ] **GREEN:** In `config.ts` define `resolveConfig(env: EnvSource, options: PluginOptions = {}, providerOptions: { providerSlug?: unknown } = {}): ResolvedConfig`; use the existing generic `PluginConfigurationError` from `packages/opencode-plugin/src/errors.ts` with the exact message `C1 configuration unavailable`, and test redaction in `packages/opencode-plugin/test/redaction.test.ts`. Require `RELAY_CF_AIG_TOKEN` and `RELAY_SECRET` from environment only; reject `apiKey`/`relayToken` as secret fallbacks; resolve slug from `RELAY_CF_PROVIDER_SLUG`, then `providerOptions.providerSlug`, then `relay-chatgpt`; reject `collectLogPayload: true` and `RELAY_CF_AIG_COLLECT_LOG_PAYLOAD=true`, and always return `collectLogPayload: false`. In `CloudflareAiGatewayChatgpt`, retain host-version validation. `config` MUST first resolve config and construct `nextProvider` in local variables; only after success assign `cfg.provider = { ...cfg.provider, "cf-ai-gw-relay": nextProvider }`, preserving any `enabled_providers` value exactly. No mutation occurs on resolution/construction failure. The host logs and ignores this exception, so the plugin remains loaded: in `chat.headers`, first return `{}` if `input.model.providerID !== "cf-ai-gw-relay"`, without reading closure state; for C1, if closure state is unset, throw `new PluginConfigurationError("C1 configuration unavailable")` before returning any headers or dispatch. Update `test/config.test.ts` to assert environment-only secret sources; update `test/plugin.test.ts` config errors at hook time plus the 3 allowlist and 3 failed-config cases in RED; never expect an exception to abort plugin activation. Remove `provider.models` registration. Build `options.credentialProvider = "openai"`, preserve validated dedicated `providerSlug`, reject conflicting existing config, set `api`/per-model `provider.api` from `buildGatewayModelUrl`, and model `openai/gpt-6-sol` → wire `gpt-6-sol`; never add auth/refresh/options.apiKey. `buildGatewayModelUrl` appends `/v1`; `createChatHeaders` scopes by selected provider/model and fixes payload header false. Run `npm test -- --run test/plugin.test.ts test/control-headers.test.ts test/gateway-url.test.ts test/config.test.ts test/redaction.test.ts` (PASS), `npm run typecheck` (exit 0), `npm run build` (exit 0). After build, create `C1_INTEGRATED_PLUGIN_SPEC` as the file URL of `$PROJECT_ROOT/packages/opencode-plugin` using the Node `pathToFileURL(process.argv[1]).href` command from the Task 8 RED baseline procedure; verify `$PROJECT_ROOT/packages/opencode-plugin/dist/index.js` exists and the spec is `file://`. Update both public guides: model example `cf-ai-gw-relay/openai/gpt-6-sol`; selected provider/owner split and exact `credentialProvider`; env-only tokens/no plugin secret fallback; payload=false and true rejected; slug precedence; explicit allowlist behavior; ordinary `openai/*` remains separate. Preserve current host capability/release gate language. **REFACTOR:** Remove only obsolete `createProviderModels` invocation/import from `plugin.ts`; update existing tests that expect `apiKey`, `relayToken`, or payload logging true. Keep `provider-models.ts` historical snapshot unchanged. Run `npm test -- --run test/plugin.test.ts test/control-headers.test.ts test/gateway-url.test.ts test/config.test.ts test/redaction.test.ts`, `npm run typecheck`, `npm run build` (all pass). Run `rg -n 'openai/gpt-5\\.6-luna' docs/configuration.md docs/configuration.ja.md` and expect no matches. Run `rg -n 'apiKey|relayToken|defaults to `true`' docs/configuration.md docs/configuration.ja.md`; every match must explicitly say C1 does not accept that option/precedence or that payload collection is no longer true by default—no active example/table may advertise it. Run `rg -n 'cf-ai-gw-relay/openai/gpt-6-sol|credentialProvider|RELAY_CF_AIG_TOKEN|RELAY_SECRET|enabled_providers' docs/configuration.md docs/configuration.ja.md`; each concept must appear in both documents with equivalent guidance. **Commit (Project implementation):** `git add packages/opencode-plugin/src/plugin.ts packages/opencode-plugin/src/config.ts packages/opencode-plugin/src/gateway-url.ts packages/opencode-plugin/src/control-headers.ts packages/opencode-plugin/test/plugin.test.ts packages/opencode-plugin/test/control-headers.test.ts packages/opencode-plugin/test/gateway-url.test.ts packages/opencode-plugin/test/config.test.ts packages/opencode-plugin/test/redaction.test.ts && git commit -m "feat(plugin): register dedicated relay provider without OAuth access"`. **Separate documentation commit:** `git add docs/configuration.md docs/configuration.ja.md && git commit -m "docs: C1設定ガイドを日英で同期"`.

### Task 9 — Security boundaries (H)

**Files:** OpenCode modify `packages/opencode/test/provider/provider.test.ts`, `packages/opencode/test/plugin/codex.test.ts`; Project modify `packages/opencode-plugin/test/plugin.test.ts`, `packages/opencode-plugin/test/control-headers.test.ts`.

**Consumes:** Tasks 6–8 runtime state, fake OAuth access/refresh sentinels, separate Gateway/relay sentinels. **Produces:** proof of privilege isolation and fail-closed behavior.

- [ ] **RED:** Add OpenCode `test("C1 marker alone cannot access OAuth credential object", ...)` in `test/plugin/codex.test.ts` (a marker with absent/invalid owner cannot dispatch); provider test `it.instance("C1 rejects absent credential owner and model", ...)` (no network). Add Project `it("config hook exposes no OAuth credential or private auth store", ...)` in `test/plugin.test.ts` with a throwing fake `client.auth` getter, asserting no read of `auth.json`, access or refresh and no such fields in returned hooks; `it("control headers keep auth and account opaque", ...)` in `test/control-headers.test.ts` verifies OAuth-related header unchanged and no secret in metadata. Run `bun test test/plugin/codex.test.ts -t "C1 marker alone"`, `bun test test/provider/provider.test.ts -t "C1 rejects absent"`, `npm test -- --run test/plugin.test.ts test/control-headers.test.ts`. Expected FAIL only at assertions requiring missing fail-closed guard or old plugin behavior; if an assertion already passes on unchanged source, record it as baseline regression protection instead of claiming RED.
- [ ] **GREEN:** Enforce missing owner/model and invalid target guards in exact Task 2/6 functions, and prevent project plugin activation from accessing `client.auth`/raw tokens in `CloudflareAiGatewayChatgpt`. No new credential API. Run `bun test test/plugin/codex.test.ts -t "C1 marker alone"`, `bun test test/provider/provider.test.ts -t "C1 rejects absent"`, and `npm test -- --run test/plugin.test.ts test/control-headers.test.ts` (all PASS), then `bun typecheck` and `npm run typecheck` (exit 0). **REFACTOR:** None required. **Commit:** OpenCode `git add packages/opencode/test/provider/provider.test.ts packages/opencode/test/plugin/codex.test.ts && git commit -m "test(opencode): guard delegated OAuth boundaries"`; Project `git add packages/opencode-plugin/test/plugin.test.ts packages/opencode-plugin/test/control-headers.test.ts && git commit -m "test(plugin): protect delegated OAuth boundary"`.

### Task 10 — Final ordinary OpenAI regression verification (I)

**Files:** No files created or modified. Re-run only tests introduced in Tasks 3, 4, 5, 6 and 8.

**Consumes:** Integrated Tasks 1–9 and the ordinary-OpenAI guards established before the corresponding GREEN changes. **Produces:** final proof that stock `openai/gpt-6-sol` remains self-owned, uses its existing direct Codex transport, receives no C1 marker or project control headers, and is unaffected by failed C1 config.

- [ ] **VERIFY:** From `$C1_INTEGRATED_OPENCODE/packages/opencode`, run `bun test test/session/llm.test.ts -t "ordinary OpenAI auth lookup remains self-owned"`, `bun test test/session/llm.test.ts -t "ordinary OpenAI OAuth request preparation is unchanged"`, `bun test test/plugin/codex.test.ts -t "ordinary OpenAI Codex hooks remain unchanged"`, and `bun test test/plugin/codex.test.ts -t "ordinary OpenAI OAuth transport keeps direct rewrite and no C1 marker"`. From `$PROJECT_ROOT/packages/opencode-plugin`, run `npm test -- --run test/plugin.test.ts -t "ordinary OpenAI config and headers are untouched"`. Expected: all PASS. If any fails, stop and classify as a regression; do not edit production code in this verification task.
- [ ] **Full verification:** From `$C1_INTEGRATED_OPENCODE/packages/opencode`, run `bun test test/provider/provider.test.ts test/session/llm.test.ts test/plugin/codex.test.ts test/agent/agent.test.ts` and `bun typecheck`; from `$PROJECT_ROOT/packages/opencode-plugin`, run `npm test`, `npm run typecheck`, `npm run build`. Expected: all exit 0.

**RED:** Not applicable; Task 10 creates no tests and makes no implementation change. The characterization tests were added and passed before their associated production GREEN changes in Tasks 3/4/5/6/8.

**GREEN:** Verification only; all five ordinary-provider guards and full suite pass.

**REFACTOR:** None required. **Commit:** None; no Task-10-only test or implementation changes.

### Task 11 — Production-source runtime acceptance (J; last)

**Files:** No tracked source, test, configuration, or documentation edits. Use only the detached OpenCode/Project baseline worktrees and isolated XDG config fixture created below; the integrated runtime uses the existing Tasks 1–7 OpenCode implementation worktree and Task-8 Project implementation worktree. No commit.

**Consumes:** `C1_BASELINE_OPENCODE` at commit `014614d35b397775e5d397a490fc72368c894ec2`; `C1_INTEGRATED_OPENCODE` containing the seven Task 1–7 commits; Task-8 Project implementation worktree and its `dist/index.js`; detached Task-8 baseline Project worktree and its local `dist/index.js`; existing local OpenCode OAuth in the existing `XDG_DATA_HOME` (OpenCode alone reads it); valid Gateway/relay runtime configuration; deployed existing Custom Provider and relay. **Produces:** sanitized, provenance-verified baseline RED plus integrated C1/ordinary OpenAI acceptance evidence.

| Phase | OpenCode runtime | Project plugin | Expected result |
| --- | --- | --- | --- |
| RED | `C1_BASELINE_OPENCODE`, HEAD exactly `014614d35b397775e5d397a490fc72368c894ec2` | detached baseline Project package via local file URL | C1 unavailable; ordinary `openai/gpt-6-sol` HTTP 200; no Gateway fallback |
| GREEN | `C1_INTEGRATED_OPENCODE`, Tasks 1–7 commits present and base is ancestor; HEAD is not required or expected to equal the pinned base | Task-8 integrated Project package via local file URL | C1 HTTP 200 and ordinary `openai/gpt-6-sol` HTTP 200 under the stated allowlist fixtures |

- [ ] **Prepare isolated runtime config and verify OpenCode provenance:** With Task 1's `C1_BASELINE_OPENCODE`, `C1_INTEGRATED_OPENCODE`, `C1_CORE_BASELINE_COMMIT`, and Task 8's `PROJECT_ROOT`, `C1_BASELINE_PROJECT`, `C1_BASELINE_PLUGIN_SPEC`, and `C1_PROJECT_BASELINE_COMMIT` values exported, run:

  ```sh
  test "$(git -C "$C1_BASELINE_OPENCODE" rev-parse HEAD)" = "014614d35b397775e5d397a490fc72368c894ec2"
  test -z "$(git -C "$C1_BASELINE_OPENCODE" status --porcelain)"
  test "$C1_CORE_BASELINE_COMMIT" = "014614d35b397775e5d397a490fc72368c894ec2"
  git -C "$C1_INTEGRATED_OPENCODE" merge-base --is-ancestor "$C1_CORE_BASELINE_COMMIT" HEAD
  test -z "$(git -C "$C1_INTEGRATED_OPENCODE" status --porcelain)"
  for subject in \
    'feat(opencode): resolve explicit relay credential owner' \
    'feat(opencode): materialize delegated OpenAI model profile' \
    'feat(opencode): use delegated credential for LLM auth' \
    'feat(opencode): preserve delegated Codex request preparation' \
    'feat(opencode): apply Codex hooks to delegated provider' \
    'feat(opencode): preserve gateway target in Codex OAuth transport' \
    'feat(opencode): use credential owner for agent generation'
  do
    git -C "$C1_INTEGRATED_OPENCODE" log --format=%s "$C1_CORE_BASELINE_COMMIT..HEAD" | rg -Fxq "$subject" || exit 1
  done
  test -f "$C1_INTEGRATED_OPENCODE/packages/opencode/src/provider/credential-provider.ts"
  rg -q '^export function credentialProviderID' "$C1_INTEGRATED_OPENCODE/packages/opencode/src/provider/credential-provider.ts"
  rg -q 'credentialProviderID' "$C1_INTEGRATED_OPENCODE/packages/opencode/src/session/llm.ts"
  rg -q 'credentialProviderID' "$C1_INTEGRATED_OPENCODE/packages/opencode/src/session/llm/request.ts"
  rg -q 'credentialProviderID' "$C1_INTEGRATED_OPENCODE/packages/opencode/src/agent/agent.ts"
  rg -q 'credentialProviderID' "$C1_INTEGRATED_OPENCODE/packages/opencode/src/plugin/openai/codex.ts"
  test "$(git -C "$C1_BASELINE_PROJECT" rev-parse HEAD)" = "$C1_PROJECT_BASELINE_COMMIT"
  test -z "$(git -C "$C1_BASELINE_PROJECT" status --porcelain)"
  test -f "$C1_BASELINE_PROJECT/packages/opencode-plugin/package.json"
  test -f "$C1_BASELINE_PROJECT/packages/opencode-plugin/dist/index.js"
  case "$C1_BASELINE_PLUGIN_SPEC" in file://*) ;; *) exit 1 ;; esac
  verify_plugin_spec() {
    C1_PLUGIN_DIR="$1" C1_PLUGIN_SPEC="$2" node --input-type=module -e '
      import { existsSync, readFileSync } from "node:fs";
      import { resolve } from "node:path";
      import { pathToFileURL } from "node:url";
      const dir = resolve(process.env.C1_PLUGIN_DIR);
      const pkg = JSON.parse(readFileSync(resolve(dir, "package.json"), "utf8"));
      if (pkg.name !== "@yohi/cf-ai-gw-relay") process.exit(1);
      if (typeof pkg.main !== "string" || !existsSync(resolve(dir, pkg.main))) process.exit(1);
      if (pathToFileURL(dir).href !== process.env.C1_PLUGIN_SPEC) process.exit(1);
    '
  }
  verify_plugin_spec "$C1_BASELINE_PROJECT/packages/opencode-plugin" "$C1_BASELINE_PLUGIN_SPEC"
  test -f "$PROJECT_ROOT/packages/opencode-plugin/dist/index.js"
  C1_XDG_CONFIG_HOME="$(mktemp -d)"
  mkdir -p "$C1_XDG_CONFIG_HOME/opencode"
  unset OPENCODE_CONFIG OPENCODE_CONFIG_DIR
  export XDG_CONFIG_HOME="$C1_XDG_CONFIG_HOME"
  ```

  Preserve the existing `XDG_DATA_HOME` so OpenCode reuses its own OAuth state; do not import or merge global user config. Define this exact config writer and use it for each fixture:

  ```sh
  write_c1_config() {
    C1_CONFIG_FILE="$C1_XDG_CONFIG_HOME/opencode/opencode.json" \
    C1_PLUGIN_SPEC="$1" \
    C1_ENABLED_PROVIDERS_JSON="$2" \
      node --input-type=module -e '
        import { writeFileSync } from "node:fs";
        const config = {
          plugin: [process.env.C1_PLUGIN_SPEC],
          model: "openai/gpt-6-sol",
        };
        if (process.env.C1_ENABLED_PROVIDERS_JSON !== "") {
          config.enabled_providers = JSON.parse(process.env.C1_ENABLED_PROVIDERS_JSON);
        }
        writeFileSync(process.env.C1_CONFIG_FILE, JSON.stringify(config, null, 2));
      '
  }
  ```

  The only runtime plugin specifiers allowed are `C1_BASELINE_PLUGIN_SPEC` and `C1_INTEGRATED_PLUGIN_SPEC`, both generated with Node's `pathToFileURL` from the respective local Project package directory. Verify each is a `file://` URL, resolves to its expected worktree's `packages/opencode-plugin/package.json`, whose `name` is `@yohi/cf-ai-gw-relay`, and whose `main` resolves to that same worktree's existing `dist/index.js`. OpenCode 1.18.31 classifies `file://` as a path plugin and resolves the directory's package `main`; a bare package specifier would use `Npm.add` and is forbidden here. npm may install the package's declared dependencies in the local worktree, but Task 11 MUST NOT fetch/execute the plugin itself by registry specifier or published version.

- [ ] **RED preflight — baseline OpenCode + baseline local Project artifact:** Call `write_c1_config "$C1_BASELINE_PLUGIN_SPEC" '["openai","cf-ai-gw-relay"]'`. Run only from `$C1_BASELINE_OPENCODE/packages/opencode`: `if (cd "$C1_BASELINE_OPENCODE/packages/opencode" && bun run src/index.ts run -m cf-ai-gw-relay/openai/gpt-6-sol "Reply OK" > "$C1_XDG_CONFIG_HOME/baseline.out" 2>&1); then exit 1; fi`; then require `rg -q 'ProviderModelNotFoundError' "$C1_XDG_CONFIG_HOME/baseline.out"`. Expected: provider/model unavailable before any Gateway/relay request; no automatic `openai/*` route. Confirm Gateway/relay logs show no request for this attempt. Then run `(cd "$C1_BASELINE_OPENCODE/packages/opencode" && bun run src/index.ts run -m openai/gpt-6-sol "Reply OK")` with the same config and expect usable HTTP 200 through the ordinary direct Codex route, without a C1 marker. Inspect only sanitized status/boundary evidence; never print raw headers, OAuth state, prompts or response body. Both the OpenCode binary source and plugin are the baseline local artifacts; no integrated OpenCode code or registry plugin is used for RED.

- [ ] **GREEN — Tasks 1–7 integrated OpenCode + Task-8 integrated local Project artifact:** From the Task-8 Project worktree run `npm --prefix "$PROJECT_ROOT/packages/opencode-plugin" run build`; expect exit 0 and `$PROJECT_ROOT/packages/opencode-plugin/dist/index.js` exists. The integrated runtime uses `C1_INTEGRATED_OPENCODE`; it MUST NOT be checked for equality with `014614d35b397775e5d397a490fc72368c894ec2`. Its required base ancestry, Task 1–7 commit subjects, source artifacts, clean status, and passing Task 10 tests/typecheck are verified by the provenance checks above and Task 10. Verify Project tracked worktree cleanliness with `test -z "$(git -C "$PROJECT_ROOT" status --porcelain)"`. Generate and verify the integrated plugin spec:

  ```sh
  C1_INTEGRATED_PLUGIN_DIR="$PROJECT_ROOT/packages/opencode-plugin"
  test -f "$C1_INTEGRATED_PLUGIN_DIR/package.json"
  test -f "$C1_INTEGRATED_PLUGIN_DIR/dist/index.js"
  C1_INTEGRATED_PLUGIN_SPEC="$(node --input-type=module -e 'import { pathToFileURL } from "node:url"; console.log(pathToFileURL(process.argv[1]).href)' "$C1_INTEGRATED_PLUGIN_DIR")"
  case "$C1_INTEGRATED_PLUGIN_SPEC" in file://*) ;; *) exit 1 ;; esac
  verify_plugin_spec "$C1_INTEGRATED_PLUGIN_DIR" "$C1_INTEGRATED_PLUGIN_SPEC"
  export C1_INTEGRATED_PLUGIN_SPEC
  ```

  Verify the package `main` in `package.json` resolves to this worktree's `dist/index.js`, package `name` is `@yohi/cf-ai-gw-relay`, and `C1_INTEGRATED_PLUGIN_SPEC` equals the `pathToFileURL` of this Project worktree (not `C1_BASELINE_PROJECT`).

  Run all three host allowlist fixtures with the integrated file URL:

  1. `write_c1_config "$C1_INTEGRATED_PLUGIN_SPEC" ''` omits `enabled_providers`; normal host discovery applies. Run `(cd "$C1_INTEGRATED_OPENCODE/packages/opencode" && XDG_CONFIG_HOME="$C1_XDG_CONFIG_HOME" bun run src/index.ts run -m cf-ai-gw-relay/openai/gpt-6-sol "Reply OK")`; expect usable HTTP 200.
  2. `write_c1_config "$C1_INTEGRATED_PLUGIN_SPEC" '["openai","cf-ai-gw-relay"]'` explicitly enables both routes. Run `(cd "$C1_INTEGRATED_OPENCODE/packages/opencode" && XDG_CONFIG_HOME="$C1_XDG_CONFIG_HOME" bun run src/index.ts run -m cf-ai-gw-relay/openai/gpt-6-sol "Reply OK")` and then `(cd "$C1_INTEGRATED_OPENCODE/packages/opencode" && XDG_CONFIG_HOME="$C1_XDG_CONFIG_HOME" bun run src/index.ts run -m openai/gpt-6-sol "Reply OK")`; expect each usable HTTP 200 with C1 Gateway path and ordinary direct Codex route respectively.
  3. `write_c1_config "$C1_INTEGRATED_PLUGIN_SPEC" '["openai"]'` excludes the dedicated provider. Run `if (cd "$C1_INTEGRATED_OPENCODE/packages/opencode" && XDG_CONFIG_HOME="$C1_XDG_CONFIG_HOME" bun run src/index.ts run -m cf-ai-gw-relay/openai/gpt-6-sol "Reply OK" > "$C1_XDG_CONFIG_HOME/excluded.out" 2>&1); then exit 1; fi` and require `rg -q 'ProviderModelNotFoundError' "$C1_XDG_CONFIG_HOME/excluded.out"`; expect no Gateway/relay request and no fallback. Then run `(cd "$C1_INTEGRATED_OPENCODE/packages/opencode" && XDG_CONFIG_HOME="$C1_XDG_CONFIG_HOME" bun run src/index.ts run -m openai/gpt-6-sol "Reply OK")` and expect usable HTTP 200 with its existing direct Codex behavior.

  For each C1 HTTP 200, inspect only sanitized runtime boundaries: selected provider `cf-ai-gw-relay`, effective credential owner `openai`, existing OpenCode OAuth reused, Gateway `custom-relay-chatgpt/v1/responses` preserved, no direct ChatGPT rewrite, Gateway auth PASS, relay `POST /v1/responses`, fixed upstream accepted HTTP 200, usable OpenCode response. No raw header/token/account value or request/response body may be printed or retained. **REFACTOR:** None required. **Commit:** None; attach both OpenCode provenance categories (`pinned baseline detached worktree`, `Tasks 1–7 integrated worktree`) and both plugin provenance categories (`local baseline file URL`, `integrated local file URL`) with redacted status/boundary results to review handoff. After evidence is saved, remove only the generated detached baseline worktrees with `git -C "$PROJECT_ROOT" worktree remove --force "$C1_BASELINE_PROJECT"` and `git -C "$C1_INTEGRATED_OPENCODE" worktree remove --force "$C1_BASELINE_OPENCODE"`; do not remove or alter either actual integrated Project/OpenCode worktree.

## Error handling and observability matrix

| Boundary | Owner and exact propagation |
| --- | --- |
| Selected provider/model absent | `Provider.getModel` yields existing `Provider.ModelNotFoundError`; no network request. |
| Invalid credential owner pairing/value | `credentialProviderID` throws new `CredentialProviderError` without credential/config value; stop before auth/SDK. |
| Host `enabled_providers` excludes dedicated provider | OpenCode's existing provider filter omits `cf-ai-gw-relay`; plugin does not change the allowlist; C1 selection fails as provider/model unavailable with no fallback. |
| Project C1 config resolution fails | OpenCode logs/ignores the `config` hook exception. The plugin has no committed C1 closure state or partial provider entry; ordinary models no-op before closure access, while C1 `chat.headers` throws `PluginConfigurationError("C1 configuration unavailable")` before dispatch. |
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
3. Run the English/Japanese guide parity checks specified in Task 8 and compare every task/interface against `SPEC.md`: provider identity/owner, allowlist, config-hook error lifecycle, env-only secrets, payload logging false, OAuth ownership, model semantics, hooks, target-aware transport, ordinary OpenAI isolation, public configuration docs and runtime acceptance must agree. Final pre-implementation condition: **設計書と実装計画書に仕様・用語・型/インターフェース・エラー処理・テスト方針・非機能要件の乖離がないこと**. This plan is `READY FOR REVIEW` only; it does not self-authorize implementation, production support, or release. The §3/§9 protected host-capability and OAuth-free CI gates remain mandatory and separate from local OAuth runtime acceptance.
