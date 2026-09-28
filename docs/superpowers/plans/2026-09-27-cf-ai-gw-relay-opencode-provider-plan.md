# Issue #28 Dedicated OpenCode Provider Implementation Plan

> **For agentic workers:** Execute tasks in the dependency order below. Each implementation task uses RED → verify RED → minimum GREEN → verify GREEN → REFACTOR → commit. Do not declare production-ready until Task 11 passes on the released minimum-supported OpenCode artifact.

**Goal:** Implement Issue #28 so users select `cf-ai-gw-relay/openai/<model>` for Gateway-routed traffic while OpenCode reuses its existing ChatGPT OAuth, ordinary `openai/<model>` remains unchanged, and the final package is `@yohi/cf-ai-gw-relay` under `apps/opencode-plugin/`.

**Architecture:** The selected provider identity is `cf-ai-gw-relay`; the bounded credential/model-semantics owner is `openai`. The plugin registers a dedicated provider through OpenCode's public plugin API and passes the exact provider options; the host implements the C1 resolver and OAuth/Codex semantics. Gateway/relay configuration is resolved and validated only when a dedicated request is selected.

**Repository location decision:** Use `apps/opencode-plugin/` because this repository groups runtime deliverables under `apps/` (`apps/deno-relay` is the existing precedent); retain the npm package boundary there. Do not add a root npm package beside the Deno root configuration, create another `packages/` package, or vendor the OpenCode framework.

**Tech Stack:** OpenCode public plugin/provider API; TypeScript; `@opencode-ai/plugin` as a peer dependency plus exact development dependency; `@ai-sdk/openai` host integration; Bun and Vitest for OpenCode upstream; Node.js 22, npm, TypeScript and Vitest for the plugin package; Deno 2.x relay.

**Canonical Spec:** `SPEC.md`; product-requirement authority: GitHub Issue #28 (`yohi/cf-ai-gw-relay#28`). If the plan and SPEC disagree with Issue #28, Issue #28 wins. This plan is non-normative and MUST NOT amend Issue #28.

**C1 Validation Baseline:** Disposable patched OpenCode `1.18.31`, commit `014614d35b397775e5d397a490fc72368c894ec2`, bundled `@ai-sdk/openai` `3.0.88`, model `gpt-6-sol`. The dedicated C1 request and stock ordinary OpenAI regression both returned HTTP 200 after a bounded credential-owner/model-semantics fix. This validates architecture only; it does not set the production minimum host or prove the current source tree is production-ready.

## Global Constraints

- Issue #28 is the product authority; `SPEC.md` is its canonical technical expression.
- Final plugin source/package root: `apps/opencode-plugin/`. `packages/opencode-plugin/` MUST be removed; the publishable npm package itself remains.
- Use only public OpenCode plugin/provider/authentication contracts from a released supported host. The plugin MUST NOT import OpenCode private modules, read its private auth store, or vendor OpenCode source.
- Selected provider identity remains `cf-ai-gw-relay`; credential owner remains `openai`; selected namespace remains `cf-ai-gw-relay/openai/<model>`.
- Do not define or require `provider.openai` in user config. Reuse OpenCode-owned ChatGPT OAuth; never expose its raw value to plugin logic or relay.
- Support provider options and equivalent environment variables for `accountId`, `gatewayId`, `gatewayToken`, and `relaySecret`; precedence is ENV > provider option. Environment values that are present but empty/invalid fail; they do not fall back to the option.
- Loading/registering the plugin MUST succeed with incomplete C1 settings. Resolve completeness only on selected C1 use. Missing/invalid config MUST fail before network dispatch and MUST NOT affect ordinary `openai/*`.
- The plugin MUST NOT mutate `openai/*`, append to `enabled_providers`, or automatically fall back. Gateway/relay/upstream failures remain fail-closed.
- No secrets, raw auth objects, prompts, or bodies in errors/logs. No OAuth persistence, PAT, `CODEX_ACCESS_TOKEN`, retry, cache, or payload persistence.
- Gateway payload collection for C1 is fixed false; setting `RELAY_CF_AIG_COLLECT_LOG_PAYLOAD=true` is rejected when C1 is selected.
- Preserve streaming, abort, relay HTTP contract, protected OAuth-free CI scope, and the release gate in `SPEC.md`.

## Out of Scope

Anthropic/Google upstream implementations, generic credential graphs, plugin-owned OAuth, PAT/`CODEX_ACCESS_TOKEN`, direct fallback, generic `/upstream/*` implementation, OpenCode framework vendoring, and Cloudflare resource changes are not part of Issue #28's initial OpenAI release.

## Files to Modify

### Project repository

| Final path | Responsibility |
| --- | --- |
| `apps/opencode-plugin/package.json` | Published `@yohi/cf-ai-gw-relay` manifest; public SDK peer/dev dependency and supported-host range. |
| `apps/opencode-plugin/package-lock.json` | Reproducible plugin dependency lock. |
| `apps/opencode-plugin/tsconfig.json` | Plugin TypeScript build/typecheck. |
| `apps/opencode-plugin/vitest.config.ts` | Plugin test configuration. |
| `apps/opencode-plugin/src/index.ts` | Public package exports and OpenCode plugin entrypoint. |
| `apps/opencode-plugin/src/plugin.ts` | `CloudflareAiGatewayChatgpt`, public `config`, `provider.models`, and `chat.headers` hooks. |
| `apps/opencode-plugin/src/config.ts` | `C1ProviderOptions`, `ResolvedRelayConfig`, and request-time `resolveRequestConfig`. |
| `apps/opencode-plugin/src/errors.ts` | Exact redacted `MissingRelayConfigurationError`, `InvalidRelayConfigurationError`, and `UnsupportedUpstreamError`. |
| `apps/opencode-plugin/src/provider-models.ts` | Dedicated provider defaults and user-over-plugin model merge. |
| `apps/opencode-plugin/src/gateway-url.ts` | `buildGatewayModelUrl`, `buildRegisteredModelUrl`, and non-dispatch registration placeholder. |
| `apps/opencode-plugin/src/control-headers.ts` | C1-only Gateway/relay controls; ordinary OpenAI no-op. |
| `apps/opencode-plugin/src/host-version.ts` | Gate against the minimum released OpenCode version established by Task 5. |
| `apps/opencode-plugin/src/core.ts` | Final stable plugin name. |
| `apps/opencode-plugin/src/hooks.ts` | Public SDK hook types. |
| `apps/opencode-plugin/test/config.test.ts` | Source precedence, lazy validation, missing/invalid key enumeration. |
| `apps/opencode-plugin/test/plugin.test.ts` | Registration, allowlist preservation, and lazy error isolation. |
| `apps/opencode-plugin/test/provider-models.test.ts` | Default models, custom models, and partial user override merge. |
| `apps/opencode-plugin/test/gateway-url.test.ts` | Gateway route construction and placeholder no-dispatch guard. |
| `apps/opencode-plugin/test/control-headers.test.ts` | C1 header set, ordinary OpenAI isolation, secret redaction. |
| `apps/opencode-plugin/test/host-version.test.ts` | Minimum/unsupported host boundary. |
| `apps/opencode-plugin/test/package-consistency.test.ts` | Final package root/name/exports and removed legacy path. |
| `apps/opencode-plugin/test/redaction.test.ts` | Error messages exclude secret values. |
| `apps/opencode-plugin/test/smoke.test.ts` | Public package entrypoint smoke test. |
| `apps/opencode-plugin/README.md` | Published package usage and supported host notice. |
| `apps/opencode-plugin/CHANGELOG.md` | Release history relocated with package. |
| `.gitignore` | Ignore `apps/opencode-plugin/node_modules/` and `apps/opencode-plugin/dist/`; remove old package entries. |
| `deno.json` | Exclude `apps/opencode-plugin/` from Deno formatting/lint scans; keep relay workspace/entrypoint unchanged. |
| `.release-please-config.json` | Move release component key to `apps/opencode-plugin`. |
| `.release-please-manifest.json` | Move version key to `apps/opencode-plugin`. |
| `.github/workflows/ci.yml` | Run plugin CI from `apps/opencode-plugin`; cache its lockfile. |
| `.github/workflows/release.yml` | Release/publish/pack from `apps/opencode-plugin`. |
| `README.md`, `README.ja.md` | Dedicated provider install/config/model-selection journey and production status. |
| `docs/configuration.md`, `docs/configuration.ja.md` | Exact provider options, environment pairs, precedence, lazy validation, secrets. |
| `docs/deployment.md`, `docs/operations.md` | Relocated package path/release gate references; relay operation contract unchanged. |
| `AGENTS.md` | Replace old package path/tooling instructions and verification commands. |

The migration moves all tracked files from the old package path, except generated `dist/` and `node_modules/`, into the listed `apps/opencode-plugin/` paths. No second copy of the plugin package remains.

### OpenCode upstream repository (external prerequisite/implementation)

| Final upstream path | Responsibility |
| --- | --- |
| `packages/core/src/v1/config/provider.ts` | Publicly type provider option `credentialProvider?: "openai"`. |
| `packages/opencode/src/provider/credential-provider.ts` | One shared bounded `credentialProviderID` resolver. |
| `packages/opencode/src/provider/provider.ts` | Dedicated model/profile materialization, owner loader, request-time C1 URL/option semantics. |
| `packages/opencode/src/session/llm.ts` | Owner-key auth lookup while preserving selected provider identity. |
| `packages/opencode/src/session/llm/request.ts` | Owner-aware OpenAI/Codex request preparation. |
| `packages/opencode/src/agent/agent.ts` | Owner-aware auth/model generation. |
| `packages/opencode/src/plugin/openai/codex.ts` | Owner-aware hooks and target-aware built-in OAuth transport. |
| `packages/opencode/test/provider/provider.test.ts` | Resolver, profile, route, and missing-settings host behavior. |
| `packages/opencode/test/session/llm.test.ts` | Auth lookup and request semantics. |
| `packages/opencode/test/agent/agent.test.ts` | Agent/model generation semantics. |
| `packages/opencode/test/plugin/codex.test.ts` | Hooks, OAuth transport, target marker, direct-route regression. |

The project plugin consumes only the published public contract (`@opencode-ai/plugin` plus documented provider configuration). Internal host helper symbols above are OpenCode implementation details and MUST NOT be imported by `apps/opencode-plugin`.

## Files to Create

- OpenCode upstream: `packages/opencode/src/provider/credential-provider.ts`.
- Project package files are relocated from `packages/opencode-plugin/` to `apps/opencode-plugin/`; no parallel legacy package is created.
- Plan output: this file only.

## Files Explicitly Not Modified in This Documentation Task

All source/test/package/workflow/configuration files listed above are future implementation targets only. In this task modify only `SPEC.md` and this implementation plan. Do not modify Issue #28, Cloudflare resources, or the relay source/tests.

## Exact Configuration and Runtime Interfaces

### Provider option/environment map

| `provider.cf-ai-gw-relay.options` key | Environment variable | Resolver result field | Required on C1 use |
| --- | --- | --- | --- |
| `accountId` | `RELAY_CF_ACCOUNT_ID` | `accountId` | Yes |
| `gatewayId` | `RELAY_CF_GATEWAY_ID` | `gatewayId` | Yes |
| `gatewayToken` | `RELAY_CF_AIG_TOKEN` | `gatewayToken` | Yes |
| `relaySecret` | `RELAY_SECRET` | `relaySecret` | Yes |
| `providerSlug` | `RELAY_CF_PROVIDER_SLUG` | `providerSlug` | No; default `relay-chatgpt` |

For each row, if the environment key exists it wins, then the chosen value is validated. An empty/malformed present ENV value is an error, not permission to fall back. Test-only variables are `RELAY_CF_AIG_BASE_URL` and `RELAY_CF_AIG_TEST_MODE`; production origin is `https://gateway.ai.cloudflare.com`, test origin is exactly `https://gateway.test.invalid`. C1 payload collection is hard-coded false; `RELAY_CF_AIG_COLLECT_LOG_PAYLOAD=true` is a C1 request-time configuration error.

### Exact plugin configuration symbols

In `apps/opencode-plugin/src/config.ts` define:

```ts
export type EnvSource = Readonly<Record<string, string | undefined>>;
export type RequiredRelayOption = "accountId" | "gatewayId" | "gatewayToken" | "relaySecret";
export type RelayConfigKey = RequiredRelayOption | "credentialProvider" | "providerSlug" | "collectLogPayload" | "gatewayBaseUrl";
export type C1ProviderOptions = Readonly<{
  credentialProvider?: unknown;
  accountId?: unknown;
  gatewayId?: unknown;
  gatewayToken?: unknown;
  relaySecret?: unknown;
  providerSlug?: unknown;
  collectLogPayload?: unknown;
}>;
export type ResolvedRelayConfig = Readonly<{
  accountId: string;
  gatewayId: string;
  gatewayToken: string;
  relaySecret: string;
  providerSlug: string;
  gatewayBaseUrl: string;
}>;
export class MissingRelayConfigurationError extends Error {
  readonly missingKeys: readonly RequiredRelayOption[];
  constructor(missingKeys: readonly RequiredRelayOption[]);
}
export class InvalidRelayConfigurationError extends Error {
  readonly invalidKeys: readonly RelayConfigKey[];
  constructor(invalidKeys: readonly RelayConfigKey[]);
}
export class UnsupportedUpstreamError extends Error {
  readonly upstream: string;
  constructor(upstream: string);
}
export type PartialRouteConfig = Readonly<{
  accountId?: unknown;
  gatewayId?: unknown;
  providerSlug?: unknown;
  gatewayBaseUrl?: unknown;
}>;
export const MISSING_C1_ROUTE_URL = "https://gateway.ai.cloudflare.com/v1/0/0/custom-relay-chatgpt/v1";
export function buildRegisteredModelUrl(config: PartialRouteConfig): string;
export function buildGatewayModelUrl(config: ResolvedRelayConfig): string;
export function resolveRequestConfig(
  env: EnvSource,
  options: C1ProviderOptions,
): ResolvedRelayConfig;
```

The plugin `config` hook installs the exact static marker `credentialProvider: "openai"` in `provider.cf-ai-gw-relay.options`; a user-supplied conflicting value is preserved during merge then rejected on C1 use, never silently changed. `resolveRequestConfig` checks that marker, then iterates required keys in stable order `accountId`, `gatewayId`, `gatewayToken`, `relaySecret`; it selects ENV when defined, otherwise the provider option; it records missing and invalid keys without including values. If one or more required keys are absent it throws `MissingRelayConfigurationError(missingKeys)` with message `Missing required cf-ai-gw-relay configuration: ${missingKeys.join(", ")}`. If any supplied key has a wrong type, empty value, invalid slug, wrong `credentialProvider`, or invalid C1 payload-collection setting it throws `InvalidRelayConfigurationError(invalidKeys)` with message `Invalid cf-ai-gw-relay configuration: ${invalidKeys.join(", ")}`; invalid values take precedence over missing values when both exist. Secrets are validated as strings with non-whitespace content and returned unchanged; they are never trimmed, normalized, logged, or serialized into errors.

`MissingRelayConfigurationError(missingKeys)` renders `Missing required cf-ai-gw-relay configuration: ${missingKeys.join(", ")}`. `InvalidRelayConfigurationError(invalidKeys)` renders `Invalid cf-ai-gw-relay configuration: ${invalidKeys.join(", ")}`; invalid keys take precedence if a request has both invalid and absent settings. `UnsupportedUpstreamError(upstream)` renders `Unsupported cf-ai-gw-relay upstream: <upstream>. Only openai is supported.` These fixed messages contain names only, never configured values. `providerSlug` uses ENV > option > `relay-chatgpt`; present empty/invalid ENV/option values are errors on C1 use. `collectLogPayload` is not user-overridable for C1: false is emitted; true from ENV or provider options adds `collectLogPayload` to the invalid keys.

At plugin activation, do not call `resolveRequestConfig`. The `config` hook registers a provider/model catalog without completeness or type validation and stores raw provider options in a closure. If `accountId` or `gatewayId` is absent or invalid during registration, `buildRegisteredModelUrl` uses the syntactically valid non-dispatch placeholder `https://gateway.ai.cloudflare.com/v1/0/0/custom-relay-chatgpt/v1`. On selected C1 `chat.headers`, call `resolveRequestConfig` before setting headers; the thrown error must abort dispatch. The OpenCode C1 host transport must ensure the same preflight happens before any request is sent. Ordinary models return before reading the C1 closure.

In `apps/opencode-plugin/src/gateway-url.ts`, retain `buildGatewayModelUrl(config: Pick<ResolvedRelayConfig, "accountId" | "gatewayId" | "providerSlug">): string`. It independently `encodeURIComponent`s account ID, Gateway ID and slug, and returns a suffix-free URL ending `/v1`; the AI SDK adds `/responses`.

## Issue #28 Acceptance Traceability

Every criterion below is a separate acceptance row. All are open before implementation; C1 rows note architecture validation only where evidence exists.

| Issue #28 criterion | SPEC | Task | Required test/manual acceptance | Pre-implementation status |
| --- | --- | --- | --- | --- |
| 1. Install `@yohi/cf-ai-gw-relay` as an OpenCode plugin | §§1, 4.1 | 6, 10 | Local package entrypoint smoke + released-package install in Task 11 | Open; C1 architecture only |
| 2. Remove independent `packages/opencode-plugin` structure | §1 | 6 | Package-layout RED/GREEN; old path absent and new package root builds | Open |
| 3. Do not vendor OpenCode SDK/framework | §§3, 4.1 | 1, 6 | Package consistency asserts no SDK source copy; source import scan | Open |
| 4. Use public plugin SDK/API dependency | §§3, 4.1 | 1, 5, 6 | Released public SDK contract/typecheck and manifest dependency assertion | Open |
| 5. Define `provider.cf-ai-gw-relay` in `opencode.json[c]` | §§4.1, 4.4 | 6, 8 | Registration hook test and isolated runtime config fixture | Open |
| 6. Do not require `provider.openai` config | §4.1 | 8, 9, 11 | Runtime fixture with only dedicated provider and OpenCode OAuth | Open |
| 7. Reuse existing OpenCode ChatGPT OAuth identity and subscription quota | §§4.2, 6 | 1–4, 9, 11 | Upstream auth-owner tests and released-host runtime using the existing subscription identity; no separate OAuth/billing path | C1 architecture validated; production open |
| 8. Select `cf-ai-gw-relay/openai/<model>` | §4.1 | 2, 8, 11 | Provider/model resolution test and runtime model invocation | C1 architecture validated; production open |
| 9. Plugin provides baseline models | §4.1 | 8 | Default model catalog availability test | Open |
| 10. User can add models | §4.1 | 8 | User-only custom model fixture is retained | Open |
| 11. User can partially override plugin model | §4.1 | 8 | Merge table test: user fields override; unspecified defaults remain | Open |
| 12. Provider options and ENV both configure | §4.3 | 7 | Table-driven config-only/ENV-only tests for all four required fields | Open |
| 13. ENV overrides provider options | §4.3 | 7 | Table-driven conflicting sentinel test for each field | Open |
| 14. Missing settings validated on provider use, not plugin load | §4.4 | 7, 8 | Plugin registration PASS with all four absent; selected C1 raises before fetch | Open |
| 15. Missing OAuth gives actionable error | §§4.6, 6 | 3, 9, 11 | Host test asserts sign-in guidance and no outbound request | C1 architecture validated; production open |
| 16. Unsupported upstream rejected explicitly | §4.1 | 8, 9 | `cf-ai-gw-relay/anthropic/...` test yields unsupported-upstream error | Open |
| 17. Gateway/relay failure has no direct fallback | §§4.6, 5, 6 | 9, 11 | Failure injection asserts one request, no direct ChatGPT/OpenAI second request | C1 architecture validated; production open |
| 18. Ordinary and dedicated routes coexist | §§4.1, 4.2 | 8, 9, 11 | Both-enabled XDG fixture yields separate HTTP 200 paths | C1 architecture validated; production open |
| 19. Plugin does not intercept/rewrite `openai/*` | §§4.1, 6 | 3, 4, 8, 9, 11 | Ordinary hook/request characterization before GREEN and integrated regression | C1 architecture validated; production open |
| 20. Remove old fetch interception | §§1.1, 4.1 | 6, 8 | Legacy symbol/path scan and package test; no compatibility mode | Open |
| 21. No OpenCode private/internal API copy/dependency | §§3, 4.2 | 1, 5, 6 | SDK public-contract tests and package import/source scan | Open |
| 22. Determine minimum supported OpenCode version | §3.2 | 1, 5, 11 | Official released artifact/type contract and min/predecessor runtime matrix | Open; exact min deliberately determined by Task 5 |
| 23. Resolve fetch-interposition production blocker | §§3.2, 4.5, 10 | 1–5, 11 | Released-host C1 acceptance proves dedicated Gateway target and no direct rewrite | C1 architecture validated; production open |
| 24. Check for any other production blockers | §10 | 5, 9, 11 | Release checklist covers security, streams, abort, errors, compatibility | Open |
| 25. README may say production-ready only after gates | §§3.2, 10 | 10, 11 | README assertion/status test; production wording remains gated until Task 11 passes | Open |
| 26. Major flows have automated tests | §4.6 | 1–4, 7–9 | Full OpenCode and plugin suites/typecheck/build | Open |
| 27. Manual real Cloudflare acceptance passes | §§5, 9, 10 | 11 | Protected manual real Gateway/relay acceptance and local OAuth C1 runtime | Open; C1 disposable validation only |
| 28. README main path updated | §1, 4.1 | 10 | English/Japanese README check for dedicated install/config/model examples | Open |

## Dependency Graph

```text
Task 1 public OpenCode C1 contract + core capability
  -> Task 2 model/profile and request-time target materialization
  -> Task 3 LLM auth, request-prep, and agent consumers
  -> Task 4 Codex hooks, target-aware transport, and all remaining host runtime behavior
  -> External Gate: Tasks 1–4 upstream contribution merged
  -> Task 5 authoritative merge provenance + released minimum-host determination
  -> Task 6 move package to apps/opencode-plugin and rewire build/release paths
  -> Task 7 provider-option/ENV resolver and lazy missing-config errors
  -> Task 8 dedicated registration, models, and config-hook isolation
  -> Task 9 security, OAuth-missing, unsupported-upstream, streaming, regressions
  -> Task 10 README/config/deployment/operations/docs and release workflows
  -> Task 11 production-host runtime acceptance and production-ready decision
```

No implementation task is parallelized: package and host types cross these boundaries, and committing out of order would obscure the required public-host dependency.

## OpenCode Worktree Provenance

At Task 1 start, set `C1_OPENCODE_SOURCE` to the root of the clean OpenCode source worktree at commit `014614d35b397775e5d397a490fc72368c894ec2`. Task 5 verifies its `origin` matches the public repository URL published in `@opencode-ai/plugin` metadata. Capture it as `C1_INTEGRATED_OPENCODE`, create a detached `C1_BASELINE_OPENCODE` at that commit, and install its dependencies with `bun install --frozen-lockfile`. Tasks 1–4 modify and commit only `C1_INTEGRATED_OPENCODE`; `C1_BASELINE_OPENCODE` remains unchanged for Task 11 RED. Task 5 uses the merged/released public artifact; Task 11 GREEN runs the official minimum-supported OpenCode binary, not the local patched source tree. Never claim production readiness from the C1 patched validation worktree.

## Task 1 — Public OpenCode C1 Option and Shared Credential Owner

**Files (OpenCode upstream worktree):** Modify `packages/core/src/v1/config/provider.ts` (`ConfigProviderV1.Info.options`); create `packages/opencode/src/provider/credential-provider.ts`; modify `packages/opencode/test/provider/provider.test.ts`.

**Consumes:** provider ID, provider options, and the existing `ProviderV2.ID`. **Produces:** public config option `credentialProvider?: "openai"`; internal shared symbol `credentialProviderID(provider: Pick<Provider.Info, "id" | "options">): ProviderV2.ID`; internal `CredentialProviderError` with no secret-bearing message; `OpenAIOAuthRequiredError` that maps missing owner auth to a sign-in action.

Exact new OpenCode error signature in `packages/opencode/src/provider/credential-provider.ts`:

```ts
export class OpenAIOAuthRequiredError extends Error {
  readonly providerID: ProviderV2.ID;
  constructor(providerID: ProviderV2.ID);
}
```

Its exact user message is `OpenAI/ChatGPT OAuth is required. Sign in through OpenCode before using cf-ai-gw-relay/openai/<model>.` The existing host `ProviderAuth.OauthMissing` remains the auth lookup result; the C1 branch maps that result to this actionable error for credential owner `openai`.

- [ ] **PROVENANCE:** From the clean upstream checkout, run `C1_INTEGRATED_OPENCODE="$(git rev-parse --show-toplevel)"`; assert `git rev-parse HEAD` equals `014614d35b397775e5d397a490fc72368c894ec2` and `git status --porcelain` is empty. Set `C1_BASELINE_PARENT="$(mktemp -d)"`, `C1_BASELINE_OPENCODE="$C1_BASELINE_PARENT/opencode-baseline"`; run `git -C "$C1_INTEGRATED_OPENCODE" worktree add --detach "$C1_BASELINE_OPENCODE" 014614d35b397775e5d397a490fc72368c894ec2`, then `(cd "$C1_BASELINE_OPENCODE" && bun install --frozen-lockfile)`. Export all three variables; all Task 1–4 commands run from `$C1_INTEGRATED_OPENCODE/packages/opencode`.
- [ ] **RED:** Add `test("credentialProviderID is self-owned except explicit C1 delegation", ...)` and `test("provider config accepts explicit credentialProvider", ...)` in `packages/opencode/test/provider/provider.test.ts`. Cases: normal `openai` → `openai`; marked `cf-ai-gw-relay` → `openai`; unmarked `anthropic` → itself; marked non-C1/unknown owner throws without echo; provider config schema accepts only explicit `"openai"`. Run `bun test test/provider/provider.test.ts -t "credentialProviderID is self-owned|provider config accepts explicit credentialProvider"` from `$C1_INTEGRATED_OPENCODE/packages/opencode`. Expected: failing resolver and config-schema assertions, not import failures.
- [ ] **GREEN:** Add `credentialProvider?: "openai"` to `ConfigProviderV1.Info.options`; export one bounded resolver from `packages/opencode/src/provider/credential-provider.ts`. Only `cf-ai-gw-relay` with the exact `openai` opt-in delegates; all unmarked providers resolve to themselves; other marker values throw `CredentialProviderError` with a fixed redacted message. In C1, map existing `ProviderAuth.OauthMissing({ providerID: ProviderV2.ID.openai })` to `OpenAIOAuthRequiredError(ProviderV2.ID.openai)` with the exact message above. Run the schema/resolver tests and `bun typecheck`; expected PASS and exit 0.
- [ ] **REFACTOR:** None required. **Commit (OpenCode upstream):** `git add packages/core/src/v1/config/provider.ts packages/opencode/src/provider/credential-provider.ts packages/opencode/test/provider/provider.test.ts && git commit -m "feat(opencode): add explicit relay credential owner"`.

## Task 2 — OpenCode Owner Model/Profile and Late Route Materialization

**Files (OpenCode upstream worktree):** Modify `packages/opencode/src/provider/provider.ts` (`InstanceState.make`, model loops, `getLanguage`, `resolveSDK`); modify `packages/opencode/test/provider/provider.test.ts`.

**Consumes:** Task 1 `credentialProviderID`; user `provider.cf-ai-gw-relay.options`; built-in `openai` model/profile and loader. **Produces:** a dedicated model with provider ID `cf-ai-gw-relay`, OpenAI owner model semantics, Responses loader, and request-time Gateway target resolution without mutating the OpenAI model.

- [ ] **RED:** Add `it.instance("C1 materializes OpenAI owner profile under dedicated identity", ...)` and `it.instance("C1 model resolution does not validate absent route credentials", ...)`. Assert inherited OpenAI profile/variants/limits and Responses loader, selected provider remains C1, unresolved account/Gateway settings do not collapse the provider into `openai` or send a request. Run `bun test test/provider/provider.test.ts -t "C1 materializes|C1 model resolution"`. Expected: profile/loader parity fails on the dedicated candidate; absent settings must not cause model-not-found.
- [ ] **GREEN:** In `Provider` model materialization, load the owner profile through `credentialProviderID`, overwrite only selected identity/model API target, and keep provider options. Resolve the Gateway target on selected C1 request using the public C1 provider options; ordinary OpenAI retains its existing API URL and loader. Run the same focused command and `bun typecheck`; expected PASS, with no auth value copied to a public provider record.
- [ ] **REFACTOR:** Centralize all ownership decisions in Task 1. **Commit:** `git add packages/opencode/src/provider/provider.ts packages/opencode/test/provider/provider.test.ts && git commit -m "feat(opencode): preserve owner model semantics for relay"`.

## Task 3 — LLM Auth, Request Preparation, and Agent Consumers

**Files (OpenCode upstream worktree):** Modify `packages/opencode/src/session/llm.ts` (`LLM.run`), `packages/opencode/src/session/llm/request.ts` (`PrepareInput`, `prepare`), `packages/opencode/src/agent/agent.ts` (`Agent.generate`); modify corresponding `packages/opencode/test/session/llm.test.ts` and `packages/opencode/test/agent/agent.test.ts`.

**Consumes:** Task 1 resolver, Task 2 selected model/owner profile, existing `Auth.Service.get`. **Produces:** owner-key auth lookup and OAuth-aware OpenAI/Codex request/generation semantics while retaining selected provider ID and target model.

- [ ] **CHARACTERIZATION before GREEN:** Add and run `it.instance("ordinary openai auth lookup and request preparation remain unchanged", ...)` in `test/session/llm.test.ts`, asserting auth key `openai`, ordinary provider ID, and existing OpenAI OAuth request shape. Run `bun test test/session/llm.test.ts -t "ordinary openai auth lookup and request preparation remain unchanged"`; expected PASS on unchanged OpenCode.
- [ ] **RED:** Add `it.instance("C1 uses owner auth and OpenAI OAuth request semantics", ...)` to the same test, recording `Auth.Service.get` key and captured prepared request; add `it.instance("C1 missing OAuth requests OpenCode sign-in", ...)` asserting `OpenAIOAuthRequiredError` has provider ID `openai`, the exact message from Task 1, and a zero-call fetch recorder; add `it.instance("C1 agent generation uses OpenAI OAuth semantics", ...)` in `test/agent/agent.test.ts`. Add `test("C1 preserves Responses SSE and propagates abort", ...)` in `test/session/llm.test.ts`, asserting SSE events are forwarded and downstream abort cancels upstream fetch. Assert auth key `openai`, selected provider remains `cf-ai-gw-relay`, `instructions`/`store` behavior matches stock OpenAI OAuth, and the selected Gateway model reaches generation. Run `bun test test/session/llm.test.ts -t "C1 uses owner auth|C1 missing OAuth|C1 preserves Responses SSE"` and `bun test test/agent/agent.test.ts -t "C1 agent generation"`. Expected failures: selected provider ID is used for auth, owner semantics/actionable auth error are absent, or stream/abort propagation fails.
- [ ] **GREEN:** Pass `credentialProviderID` from `LLM.run` to `LLMRequestPrep.prepare`; resolve auth using the owner; make `Agent.generate` use the same resolver. Gate OpenAI OAuth behavior on effective owner `openai` and auth type `oauth`, never by changing `model.providerID`. If delegated owner auth is absent, map `ProviderAuth.OauthMissing` to Task 1's `OpenAIOAuthRequiredError`. Preserve existing SSE chunks and propagate downstream abort through the selected transport. Run focused tests and `bun typecheck`; expected PASS.
- [ ] **REFACTOR:** None required. Commit `feat(opencode): propagate delegated credential semantics` with only these files/tests.

## Task 4 — Codex Hooks and Target-Aware OAuth Transport

**Files (OpenCode upstream worktree):** Modify `packages/opencode/src/plugin/openai/codex.ts` (`CodexAuthPlugin` hooks and auth-loader fetch), `packages/opencode/src/provider/provider.ts` (`resolveSDK`); modify `packages/opencode/test/plugin/codex.test.ts` and `packages/opencode/test/provider/provider.test.ts`.

**Consumes:** Tasks 1–3. **Produces:** C1 OAuth headers/`chat.params` Codex semantics with Gateway target preserved; ordinary OpenAI keeps its existing direct Codex rewrite.

- [ ] **CHARACTERIZATION before GREEN:** Add `test("ordinary openai OAuth hooks and direct route remain unchanged", ...)` in `test/plugin/codex.test.ts`; run `bun test test/plugin/codex.test.ts -t "ordinary openai OAuth hooks and direct route remain unchanged"`. Expected PASS before changes.
- [ ] **RED:** Add `test("C1 applies Codex hooks and preserves Gateway target", ...)` with synthetic OAuth and local fetch recorder. Assert OpenAI owner hooks apply, the configured Gateway URL remains the target, `chatgpt.com` rewrite does not occur for C1, the internal marker is stripped before network, and no OAuth value is recorded. Add ordinary provider assertion to the same fixture but separately named. Run `bun test test/plugin/codex.test.ts -t "C1 applies Codex hooks"` and `bun test test/provider/provider.test.ts -t "C1 resolveSDK"`. Expected: C1 hooks return early or direct transport rewrite changes the destination.
- [ ] **GREEN:** Use `credentialProviderID` for OpenAI semantics; use selected provider ID for route choice. Inject OAuth/account headers through the host owner path; preserve Gateway URL for C1; strip any internal target marker before dispatch; disable incompatible WebSocket target only for C1. Run focused tests and `bun typecheck`; expected PASS.
- [ ] **REFACTOR:** None required. Commit `feat(opencode): preserve target-aware Codex OAuth transport`. Combine the Task 1–4 host commits in one upstream contribution PR; after creation, export its URL as `C1_OPENCODE_UPSTREAM_PR_URL`. Do not start Task 5 until that PR is merged into the authoritative OpenCode repository.

## Task 5 — Establish the Released Minimum OpenCode Host

**Files:** OpenCode official upstream release/source evidence and a temporary isolated npm CLI installation only. Task 5 MUST NOT edit Project files; package metadata and host-version tests are created in Task 6 after relocation.

**Consumes:** Tasks 1–4 public host capability and tests plus the merged upstream PR metadata. **Produces:** authoritative merged C1 commit SHA, exact `C1_MINIMUM_SUPPORTED_VERSION`, exact published `@opencode-ai/plugin` SDK version, tested compatibility interval, and exact `C1_MINIMUM_OPEN_CODE_BIN` path to the matching official `opencode-ai` artifact. The version comes from a released official artifact containing the merged public C1 commit, not a local HEAD or patched spike.

- [ ] **BASELINE EVIDENCE:** On the detached stock OpenCode `1.18.31` worktree, run `if git -C "$C1_BASELINE_OPENCODE" grep -n credentialProvider -- packages/core/src/v1/config/provider.ts; then exit 1; fi`. Expected: no C1 public option in the stock baseline. Record the pinned commit and this negative result as architecture-validation context only; do not label this host production-supported.
- [ ] **RELEASE VERIFICATION:** Only after OpenCode Tasks 1–4 are merged into the authoritative upstream, run from the OpenCode source root and save the resulting values for Tasks 6 and 11:

  ```sh
  C1_OPEN_CODE_SDK_REPO_URL="$(npm view @opencode-ai/plugin@1.18.31 repository.url)"
  C1_OPEN_CODE_REPO_URL="${C1_OPEN_CODE_SDK_REPO_URL#git+}"
  C1_OPEN_CODE_REPOSITORY="$(node --input-type=module -e 'const url = new URL(process.argv[1]); const [owner, repo] = url.pathname.split("/").filter(Boolean); console.log(`${owner}/${repo.endsWith(".git") ? repo.slice(0, -4) : repo}`)' "$C1_OPEN_CODE_REPO_URL")"
  C1_SOURCE_REPOSITORY_URL="$(git remote get-url origin)"
  C1_SOURCE_REPOSITORY_URL="${C1_SOURCE_REPOSITORY_URL#git+}"
  C1_SOURCE_REPOSITORY="$(node --input-type=module -e 'const raw = process.argv[1].startsWith("git@github.com:") ? `https://github.com/${process.argv[1].slice("git@github.com:".length)}` : process.argv[1]; const url = new URL(raw); const [owner, repo] = url.pathname.split("/").filter(Boolean); console.log(`${owner}/${repo.endsWith(".git") ? repo.slice(0, -4) : repo}`)' "$C1_SOURCE_REPOSITORY_URL")"
  test "$C1_SOURCE_REPOSITORY" = "$C1_OPEN_CODE_REPOSITORY"
  C1_PR_STATE="$(gh pr view "$C1_OPENCODE_UPSTREAM_PR_URL" --repo "$C1_OPEN_CODE_REPOSITORY" --json state --jq .state)"
  test "$C1_PR_STATE" = "MERGED"
  C1_PR_MERGED_AT="$(gh pr view "$C1_OPENCODE_UPSTREAM_PR_URL" --repo "$C1_OPEN_CODE_REPOSITORY" --json mergedAt --jq .mergedAt)"
  test -n "$C1_PR_MERGED_AT"
  C1_PUBLIC_CORE_COMMIT="$(gh pr view "$C1_OPENCODE_UPSTREAM_PR_URL" --repo "$C1_OPEN_CODE_REPOSITORY" --json mergeCommit --jq .mergeCommit.oid)"
  test -n "$C1_PUBLIC_CORE_COMMIT"
  git fetch --tags origin
  C1_DEFAULT_BRANCH="$(gh repo view "$C1_OPEN_CODE_REPOSITORY" --json defaultBranchRef --jq .defaultBranchRef.name)"
  git fetch origin "$C1_DEFAULT_BRANCH"
  git -C "$C1_OPENCODE_SOURCE" merge-base --is-ancestor "$C1_PUBLIC_CORE_COMMIT" "origin/$C1_DEFAULT_BRANCH"
  C1_MINIMUM_RELEASE_TAG=""
  for tag in $(git tag --sort=version:refname --contains "$C1_PUBLIC_CORE_COMMIT"); do
    case "$tag" in *-*) continue ;; esac
    version="${tag#v}"
    if gh release view "$tag" --repo "$C1_OPEN_CODE_REPOSITORY" >/dev/null 2>&1 && npm view "@opencode-ai/plugin@$version" version >/dev/null 2>&1; then
      C1_MINIMUM_RELEASE_TAG="$tag"
      C1_MINIMUM_SUPPORTED_VERSION="$version"
      C1_PLUGIN_SDK_VERSION="$(npm view "@opencode-ai/plugin@$version" version)"
      break
    fi
  done
  test -n "$C1_MINIMUM_RELEASE_TAG"
  npm view "opencode-ai@$C1_MINIMUM_SUPPORTED_VERSION" version
  C1_MINIMUM_OPEN_CODE_INSTALL_PREFIX="$(mktemp -d)"
  npm install --prefix "$C1_MINIMUM_OPEN_CODE_INSTALL_PREFIX" --no-save --no-audit --no-fund "opencode-ai@$C1_MINIMUM_SUPPORTED_VERSION"
  C1_MINIMUM_OPEN_CODE_BIN="$C1_MINIMUM_OPEN_CODE_INSTALL_PREFIX/node_modules/.bin/opencode"
  test -x "$C1_MINIMUM_OPEN_CODE_BIN"
  C1_ACTUAL_OPEN_CODE_VERSION="$("$C1_MINIMUM_OPEN_CODE_BIN" --version)"
  test "$C1_ACTUAL_OPEN_CODE_VERSION" = "$C1_MINIMUM_SUPPORTED_VERSION"
  export C1_PUBLIC_CORE_COMMIT C1_OPEN_CODE_REPOSITORY C1_DEFAULT_BRANCH C1_MINIMUM_RELEASE_TAG C1_MINIMUM_SUPPORTED_VERSION C1_PLUGIN_SDK_VERSION C1_MINIMUM_OPEN_CODE_INSTALL_PREFIX C1_MINIMUM_OPEN_CODE_BIN C1_ACTUAL_OPEN_CODE_VERSION
  ```

  `C1_OPENCODE_UPSTREAM_PR_URL` is the merged PR containing all Tasks 1–4 host changes; Task 4 records it. `mergeCommit.oid` is authoritative for merge, squash, and rebase merge strategies; verify that SHA is an ancestor of the official default branch. The loop then selects the lowest stable release tag containing that merged SHA for which both the official release and matching public SDK package exist. On that released source tag, run `bun test test/provider/provider.test.ts test/session/llm.test.ts test/agent/agent.test.ts test/plugin/codex.test.ts` and `bun typecheck`; the C1 Codex/transport tests use synthetic OAuth and a local fetch recorder to prove Gateway URL preservation and owner semantics. Task 11 performs the full C1 product runtime acceptance on the official released CLI. Verify the immediately preceding stable release is rejected by `host-version.test.ts`. Record PR URL/state/merge SHA, official repository/default branch, release tag/URL, `C1_MINIMUM_SUPPORTED_VERSION`, SDK version, and test output. If no qualifying release exists, stop and keep production support blocked; do not select the disposable patched `1.18.31` runtime.
- [ ] **Task boundary:** Task 5 produces `C1_PUBLIC_CORE_COMMIT`, `C1_MINIMUM_SUPPORTED_VERSION`, `C1_PLUGIN_SDK_VERSION`, `C1_MINIMUM_OPEN_CODE_BIN`, official release evidence, and the tested compatibility range. Task 5 MUST NOT edit Project package metadata or tests; Task 6 applies the host values after relocating the package.

## Task 6 — Relocate the Publishable Plugin Package

**Files:** Move every tracked `packages/opencode-plugin/{CHANGELOG.md,README.md,package-lock.json,package.json,tsconfig.json,vitest.config.ts,src/**,test/**}` to the same relative path under `apps/opencode-plugin/`; modify `.gitignore`, `deno.json`, `.release-please-config.json`, `.release-please-manifest.json`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`.

**Consumes:** Task 5 minimum host version/SDK version. **Produces:** one npm-publishable `@yohi/cf-ai-gw-relay` package rooted at `apps/opencode-plugin/`; zero `packages/opencode-plugin/` directory; no vendor copy of OpenCode SDK.

- [ ] **PROVENANCE PREPARATION:** Before editing the package tree, run from project root:

  ```sh
  PROJECT_ROOT="$(git rev-parse --show-toplevel)"
  git diff --quiet
  git diff --cached --quiet
  C1_PROJECT_BASELINE_COMMIT="$(git rev-parse HEAD)"
  C1_PROJECT_BASELINE_PARENT="$(mktemp -d)"
  C1_BASELINE_PROJECT="$C1_PROJECT_BASELINE_PARENT/project-baseline"
  git -C "$PROJECT_ROOT" worktree add --detach "$C1_BASELINE_PROJECT" "$C1_PROJECT_BASELINE_COMMIT"
  npm --prefix "$C1_BASELINE_PROJECT/packages/opencode-plugin" ci --ignore-scripts
  npm --prefix "$C1_BASELINE_PROJECT/packages/opencode-plugin" run build
  test -f "$C1_BASELINE_PROJECT/packages/opencode-plugin/dist/index.js"
  C1_BASELINE_PLUGIN_SPEC="$(node --input-type=module -e 'import { pathToFileURL } from "node:url"; console.log(pathToFileURL(process.argv[1]).href)' "$C1_BASELINE_PROJECT/packages/opencode-plugin")"
  export PROJECT_ROOT C1_PROJECT_BASELINE_COMMIT C1_PROJECT_BASELINE_PARENT C1_BASELINE_PROJECT C1_BASELINE_PLUGIN_SPEC
  ```

  Keep this detached worktree, local file URL, and environment values through Task 11 RED. The pre-migration package artifact is local; do not install it by npm registry specifier.

- [ ] **RED:** In the existing `packages/opencode-plugin/test/package-consistency.test.ts`, add `it("uses apps/opencode-plugin as the only package root", ...)` asserting `apps/opencode-plugin/package.json` exists, `packages/opencode-plugin/package.json` does not, and manifest/release config point to the new root. Add `it("accepts minimum released host and rejects previous host", ...)` to `host-version.test.ts`, driven by `C1_MINIMUM_SUPPORTED_VERSION` and the preceding stable version returned by Task 5. Run `npm test -- --run test/package-consistency.test.ts test/host-version.test.ts` from `packages/opencode-plugin`; expected path assertion fails and the host guard still pins the architecture-validation version.
- [ ] **GREEN:** `git mv packages/opencode-plugin apps/opencode-plugin`; update package scripts/config references and the consistency test. Use `peerDependencies["@opencode-ai/plugin"]` for the host-supplied SDK contract and an exact matching `devDependencies["@opencode-ai/plugin"]` for typecheck/tests; do not bundle or list the SDK as a runtime dependency. Set `engines.opencode` to `C1_MINIMUM_SUPPORTED_VERSION`, `SUPPORTED_OPENCODE_RANGE` to the tested compatible range, and the SDK peer/dev versions from Task 5. Keep `semver` as the only runtime dependency. Update `.gitignore`, release-please paths, workflow working directories/cache path, and Deno fmt/lint exclusions. Run `(cd apps/opencode-plugin && npm ci --ignore-scripts && npm run typecheck && npm test && npm run build)`; expected all pass. Run `test ! -e packages/opencode-plugin`.
- [ ] **REFACTOR:** Remove stale path aliases and release references; do not maintain a compatibility copy/symlink. Run `rg -n 'packages/opencode-plugin' .github .release-please-config.json .release-please-manifest.json deno.json .gitignore`; expected no active references. Stage only the package move and layout config with `git add -A packages/opencode-plugin apps/opencode-plugin .gitignore deno.json .release-please-config.json .release-please-manifest.json .github/workflows/ci.yml .github/workflows/release.yml` and commit `refactor: relocate OpenCode plugin under apps`.

## Task 7 — Provider Options, ENV Resolver, and Request-Time Errors

**Files:** Modify `apps/opencode-plugin/src/config.ts`, `apps/opencode-plugin/src/errors.ts`, `apps/opencode-plugin/src/plugin.ts`; tests `apps/opencode-plugin/test/config.test.ts`, `apps/opencode-plugin/test/redaction.test.ts`, `apps/opencode-plugin/test/plugin.test.ts`.

**Consumes:** Task 6 package root and `C1ProviderOptions` public contract. **Produces:** exact exported types and `resolveRequestConfig(env, options)` signature in “Exact Configuration and Runtime Interfaces”; `MissingRelayConfigurationError` for absent keys and `InvalidRelayConfigurationError` for supplied invalid keys; no startup completeness validation.

- [ ] **RED:** In `apps/opencode-plugin/test/config.test.ts`, add table-driven tests for all four fields `accountId`, `gatewayId`, `gatewayToken`, and `relaySecret`: `it("resolves required config from provider options", ...)`, `it("resolves required config from ENV", ...)`, `it("ENV wins for conflicting config", ...)`, `it("present empty ENV does not fall back to option", ...)`, and `it("reports each absent required key", ...)` with one field removed per case. Add `it("reports all absent required keys in stable order", ...)` and use safe distinct sentinels compared only inside tests. Add `it("rejects malformed values without echoing sentinels", ...)` and `it("rejects payload collection true for C1", ...)`. In `redaction.test.ts`, add `it("configuration errors omit all secret sentinels", ...)`. Run `npm test -- --run test/config.test.ts test/redaction.test.ts` from `apps/opencode-plugin`; expected failures for unsupported option keys, incorrect precedence, and absent request-time resolver.
- [ ] **GREEN:** Implement `resolveRequestConfig(env: EnvSource, options: C1ProviderOptions): ResolvedRelayConfig` exactly as specified above. If any required value is absent, throw `MissingRelayConfigurationError(missingKeys)`; if supplied fields are invalid, throw `InvalidRelayConfigurationError(invalidKeys)` with invalid taking precedence; preserve secret bytes and never echo values. ENV presence takes precedence before validation. Resolve slug ENV > option > default; reject C1 payload collection true. Run the same focused tests; expected PASS.
- [ ] **RED — lazy registration and provider-option wiring:** Add `it("registers C1 without complete settings and isolates ordinary OpenAI", ...)` in `apps/opencode-plugin/test/plugin.test.ts`; with all four fields absent, invoke plugin factory/config successfully, assert the provider/default catalog is registered, then invoke ordinary `openai/gpt-6-sol` headers and assert no throw, mutation, or C1 header. Add `it("selected C1 request resolves provider-options-only credentials", ...)`; set all four provider options to safe distinct sentinels, invoke config and C1 `chat.headers`, and assert the expected gateway/relay header values by equality without logging. Add `it("C1 missing config fails before fetch with exact missing keys", ...)` and assert ordered keys plus a zero fake-fetch count. Run `npm test -- --run test/plugin.test.ts -t "registers C1 without complete settings|provider-options-only credentials|C1 missing config fails before fetch"`; expected FAIL because current plugin validates at activation and does not read provider-level settings.
- [ ] **GREEN:** Make the plugin factory and `config` hook register successfully with all four fields absent. Capture provider options/environment without completeness validation. In `chat.headers`, return for any non-C1 model before reading the captured C1 options; for C1, call `resolveRequestConfig` before writing Gateway/relay headers. Run the three tests above; expect registration and ordinary OpenAI pass, C1 missing config raises `MissingRelayConfigurationError` with zero fetch calls, and provider-option sentinels reach only their intended headers.
- [ ] **REFACTOR:** Remove `apiKey` and `relayToken` aliases; retain no duplicate resolver. Stage `apps/opencode-plugin/src/config.ts`, `errors.ts`, `plugin.ts`, `test/config.test.ts`, `test/redaction.test.ts`, and `test/plugin.test.ts`; commit `feat: resolve C1 settings lazily with ENV precedence`.

## Task 8 — Dedicated Registration, Model Catalog, Merge, and Routing

**Files:** Modify `apps/opencode-plugin/src/plugin.ts` (`CloudflareAiGatewayChatgpt`), `apps/opencode-plugin/src/provider-models.ts` (`createProviderModels`), `apps/opencode-plugin/src/gateway-url.ts` (`buildGatewayModelUrl`), `apps/opencode-plugin/src/control-headers.ts` (`createChatHeaders`); tests `apps/opencode-plugin/test/plugin.test.ts`, `provider-models.test.ts`, `gateway-url.test.ts`, `control-headers.test.ts`.

**Consumes:** Task 1–5 released public C1 host; Task 7 resolver. **Produces:** config hook registers `cf-ai-gw-relay`; `provider.models` provides OpenAI upstream models only for this provider; URL and headers target the Gateway; user-added/overridden models merge with user values taking precedence.

- [ ] **RED:** Add `it("registers cf-ai-gw-relay without changing openai", ...)` to `test/plugin.test.ts`; assert exact provider ID, `credentialProvider: "openai"`, no `provider.openai` requirement, and unchanged normal OpenAI config. Add `it("provider models hook is scoped to C1", ...)` asserting ordinary `openai` provider model input is returned unchanged, with no C1 routing URL or mutation. Add `it("provides gpt-6-sol and merges custom C1 models", ...)` to `provider-models.test.ts`; assert the plugin supplies `openai/gpt-6-sol` when present in the OpenAI owner catalog, preserves other C1 models, allows a user-only model, and lets a partial user override replace only supplied fields. Add `it("constructs encoded Gateway v1 base URL", ...)` to `gateway-url.test.ts` and `it("adds controls only to selected C1 model", ...)` to `control-headers.test.ts`. Run `npm test -- --run test/plugin.test.ts test/provider-models.test.ts test/gateway-url.test.ts test/control-headers.test.ts`; expected fail because current hook targets built-in `openai`, no dedicated provider is registered, and the URL/control headers use old IDs.
- [ ] **GREEN:** In `CloudflareAiGatewayChatgpt`, use public `config` hook to atomically register `provider.cf-ai-gw-relay`, preserving user options/models and adding static `credentialProvider: "openai"` only when absent; reject conflicting markers on C1 use. `createProviderModels` MUST return ordinary providers untouched before reading C1 state. Merge the C1 model map so `openai/gpt-6-sol` is included when present in the owner catalog, user-only models are retained, and user fields win over plugin defaults. The model base URL uses resolved route settings when available; when account/Gateway ID is absent at load, use `MISSING_C1_ROUTE_URL = "https://gateway.ai.cloudflare.com/v1/0/0/custom-relay-chatgpt/v1"`, which is never dispatched because Task 7 request preflight errors first. `createChatHeaders` returns before C1 state access for non-C1; for C1 it resolves config then adds Gateway/relay controls and fixed payload false. Run focused tests; expected PASS and zero ordinary OpenAI mutation.
- [ ] **REFACTOR:** Remove old `provider.models` registration under `openai` and hard-coded `gpt-5.6-luna` target. Keep one provider-scoped model builder and route helper. Stage `apps/opencode-plugin/src/plugin.ts`, `provider-models.ts`, `gateway-url.ts`, `control-headers.ts`, and their four tests; commit `feat: register dedicated cf-ai-gw-relay provider`.

## Task 9 — OAuth Errors, Unsupported Upstream, Security, and Ordinary Regression

**Files:** Project modify `apps/opencode-plugin/src/errors.ts`, `apps/opencode-plugin/src/plugin.ts`, and tests `apps/opencode-plugin/test/plugin.test.ts`, `apps/opencode-plugin/test/control-headers.test.ts`, `apps/opencode-plugin/test/redaction.test.ts`. OpenCode files/tests from Tasks 1–4 are read-only verification inputs in this task.

**Consumes:** Tasks 1–8. **Produces:** missing OAuth guidance; explicit unsupported-upstream error; no credentials in logs; tests for streaming/abort and no fallback; ordinary OpenAI invariant.

- [ ] **VERIFY — no new OpenCode implementation:** Re-run the Task 3 OAuth-missing/SSE-abort tests and Task 4 Codex transport tests from `$C1_INTEGRATED_OPENCODE/packages/opencode`; expected PASS. Do not edit OpenCode source or add a second OAuth RED/GREEN in this task.
- [ ] **RED — project security/error boundaries:** Add Project tests `it("unsupported upstream fails before fetch", ...)`, `it("C1 missing config reports names and sends no request", ...)`, and `it("invalid C1 config leaves ordinary OpenAI unaffected", ...)` to `apps/opencode-plugin/test/plugin.test.ts`; add `it("C1 headers never contain provider-option secret values", ...)` in `control-headers.test.ts` and `it("C1 errors omit secret sentinels", ...)` in `redaction.test.ts`. Use fake fetch counters and safe sentinels; assert unsupported/config errors occur before network and normal OpenAI is unaffected. Run `(cd apps/opencode-plugin && npm test -- --run test/plugin.test.ts test/control-headers.test.ts test/redaction.test.ts)`; expected failures for missing explicit boundaries or secret leakage.
- [ ] **GREEN:** In `apps/opencode-plugin/src/errors.ts` define `UnsupportedUpstreamError(upstream)` with the fixed supported-upstream message. Ensure the config/header hook only resolves C1 for `cf-ai-gw-relay`, returns unchanged for ordinary `openai`, and throws on incomplete/invalid C1 config before fetch. Run the Project focused suite, full `npm test`, `npm run typecheck`, and `npm run build`; expected PASS. OpenCode tests from Tasks 3–4 remain unchanged and passing.
- [ ] **REFACTOR:** Remove duplicate Project fixtures through a named safe-sentinel helper. Commit only Project source/tests with `git add apps/opencode-plugin/src/errors.ts apps/opencode-plugin/src/plugin.ts apps/opencode-plugin/test/plugin.test.ts apps/opencode-plugin/test/control-headers.test.ts apps/opencode-plugin/test/redaction.test.ts && git commit -m "test: protect C1 failures and ordinary OpenAI isolation"`.

## Task 10 — Package/Release/Documentation Synchronization

**Files:** Project `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.release-please-config.json`, `.release-please-manifest.json`, `.gitignore`, `deno.json`, `README.md`, `README.ja.md`, `docs/configuration.md`, `docs/configuration.ja.md`, `docs/deployment.md`, `docs/operations.md`, `AGENTS.md`, and `apps/opencode-plugin/README.md`/`CHANGELOG.md`.

**Consumes:** final package path and exact released host/config contract. **Produces:** no active docs/build/release reference to the old package path and equivalent English/Japanese product guidance.

- [ ] **RED:** Add `it("release, build, and user documentation paths use apps/opencode-plugin", ...)` in `apps/opencode-plugin/test/package-consistency.test.ts` asserting release config/workflows and user docs refer to `apps/opencode-plugin`, package `main`/`exports` resolve under that root, and the old package root is absent. Run `(cd apps/opencode-plugin && npm test -- --run test/package-consistency.test.ts -t "paths use apps/opencode-plugin")`; expected fail while old paths are present.
- [ ] **GREEN:** Update both READMEs to install `@yohi/cf-ai-gw-relay`, require OpenCode OpenAI/ChatGPT OAuth, define provider `cf-ai-gw-relay`, select `cf-ai-gw-relay/openai/<model>`, explain direct `openai/*` coexistence and no fallback, state only `openai` upstream is initially supported, and route future upstreams to a non-normative future section. State the established `C1_MINIMUM_SUPPORTED_VERSION` and keep production-ready claims blocked until Task 11 succeeds. Update both configuration guides with provider option keys, matching ENV keys, ENV > provider precedence, request-time missing-config behavior, and secret handling: token options are supported but must not be committed; environment variables let users keep secret values out of Git-managed files. Update deployment/operations package references, release-please component/manifest path, CI/release working directory/cache path, `deno.json` lint/fmt exclusion, `.gitignore`, and AGENTS.

  Verify the produced npm package is installable without resolving the plugin itself from a registry:

  ```sh
  C1_PACKAGE_PACK_DIR="$(mktemp -d)"
  npm --prefix apps/opencode-plugin pack --pack-destination "$C1_PACKAGE_PACK_DIR"
  C1_PACKAGE_TARBALL="$(node --input-type=module -e 'import { readdirSync } from "node:fs"; const files = readdirSync(process.argv[1]).filter((name) => name.endsWith(".tgz")); if (files.length !== 1) process.exit(1); console.log(`${process.argv[1]}/${files[0]}`)' "$C1_PACKAGE_PACK_DIR")"
  C1_PACKAGE_SMOKE_DIR="$(mktemp -d)"
  npm --prefix "$C1_PACKAGE_SMOKE_DIR" init -y
  npm --prefix "$C1_PACKAGE_SMOKE_DIR" install --ignore-scripts --legacy-peer-deps "$C1_PACKAGE_TARBALL"
  (cd "$C1_PACKAGE_SMOKE_DIR" && node --input-type=module -e 'import { CloudflareAiGatewayChatgpt } from "@yohi/cf-ai-gw-relay"; if (typeof CloudflareAiGatewayChatgpt !== "function") process.exit(1)')
  ```

  Expected: the locally packed artifact installs and its public entrypoint imports; only declared runtime dependencies may resolve from npm. Run the package reference test, English/Japanese parity grep checks, `deno fmt --check`, and `deno lint`; expected no active `packages/opencode-plugin` references outside SPEC's explicitly historical notice, this plan's migration steps, and the package-consistency negative assertion. Commit build/release path changes and `package-consistency.test.ts` with `git add .gitignore deno.json .release-please-config.json .release-please-manifest.json .github/workflows/ci.yml .github/workflows/release.yml apps/opencode-plugin/test/package-consistency.test.ts && git commit -m "build: release plugin from apps path"`. Commit human docs separately with `git add README.md README.ja.md docs/configuration.md docs/configuration.ja.md docs/deployment.md docs/operations.md AGENTS.md apps/opencode-plugin/README.md apps/opencode-plugin/CHANGELOG.md && git commit -m "docs: document Issue 28 dedicated provider"`.
- [ ] **REFACTOR:** Remove obsolete install instructions and stale `apiKey`/`relayToken` precedence from human docs. Run `rg -n 'packages/opencode-plugin|openai/gpt-5\.6-luna|apiKey|relayToken|defaults to .true.' README.md README.ja.md docs/configuration.md docs/configuration.ja.md docs/deployment.md docs/operations.md apps/opencode-plugin/README.md .github .release-please-config.json .release-please-manifest.json deno.json`; permitted `apiKey`/`relayToken` matches must explicitly label them as rejected legacy options, and the two named model/path strings must have no active user guidance/config matches. Separately scan production/config paths (excluding the deliberate negative migration assertion in `apps/opencode-plugin/test/package-consistency.test.ts`) for `packages/opencode-plugin`; require zero matches outside SPEC's explicit historical note and this implementation plan. Positive checks for `cf-ai-gw-relay/openai/gpt-6-sol`, `credentialProvider`, `accountId`, `gatewayId`, `gatewayToken`, `relaySecret`, and all four ENV names must find equivalent guidance in English/Japanese. Commit source/config path synchronization with `git add .gitignore deno.json .release-please-config.json .release-please-manifest.json .github/workflows/ci.yml .github/workflows/release.yml && git commit -m "build: relocate plugin package release paths"`; commit English/Japanese human docs with `git add README.md README.ja.md docs/configuration.md docs/configuration.ja.md docs/deployment.md docs/operations.md AGENTS.md apps/opencode-plugin/README.md apps/opencode-plugin/CHANGELOG.md && git commit -m "docs: document Issue 28 dedicated provider"`.

## Task 11 — Production Host/Runtime Acceptance (last)

**Files:** No source/test edits for acceptance; only local `dist/` builds and temporary worktrees/XDG config outside tracked files.

**Consumes:** Task 5 released minimum OpenCode host; Tasks 1–4 released public C1 core capability; Task 6–10 implementation and documentation; existing local OpenCode OAuth state. **Produces:** redacted RED/GREEN runtime evidence and a production-readiness decision based only on the released host artifact.

| Phase | OpenCode artifact | Plugin artifact | Required result |
| --- | --- | --- | --- |
| RED | Detached stock source worktree at `014614d35b397775e5d397a490fc72368c894ec2`, invoked by its `bun run src/index.ts` | Local file URL to the detached pre-migration `packages/opencode-plugin` package | C1 unavailable before network; ordinary OpenAI HTTP 200; no fallback |
| GREEN | Official released `C1_MINIMUM_SUPPORTED_VERSION` CLI containing the C1 public core commit | Local file URL to the Task 6–10 `apps/opencode-plugin` build | C1 and ordinary OpenAI HTTP 200; lazy configuration and all three allowlist cases pass |

- [ ] **Prepare local plugin artifacts and isolated config:** From Project root run `npm --prefix "$PROJECT_ROOT/apps/opencode-plugin" ci --ignore-scripts`, then `npm --prefix "$PROJECT_ROOT/apps/opencode-plugin" run build`; require `dist/index.js`. Generate `C1_INTEGRATED_PLUGIN_SPEC` as a file URL to the package directory:

  ```sh
  C1_INTEGRATED_PLUGIN_DIR="$PROJECT_ROOT/apps/opencode-plugin"
  C1_INTEGRATED_PLUGIN_SPEC="$(node --input-type=module -e 'import { pathToFileURL } from "node:url"; console.log(pathToFileURL(process.argv[1]).href)' "$C1_INTEGRATED_PLUGIN_DIR")"
  test -n "$C1_INTEGRATED_PLUGIN_SPEC"
  test -f "$C1_INTEGRATED_PLUGIN_DIR/package.json"
  test -f "$C1_INTEGRATED_PLUGIN_DIR/dist/index.js"
  C1_ACTUAL_OPEN_CODE_VERSION="$("$C1_MINIMUM_OPEN_CODE_BIN" --version)"
  test "$C1_ACTUAL_OPEN_CODE_VERSION" = "$C1_MINIMUM_SUPPORTED_VERSION"
  export C1_INTEGRATED_PLUGIN_SPEC C1_MINIMUM_OPEN_CODE_BIN C1_ACTUAL_OPEN_CODE_VERSION
  ```

  For RED use `C1_BASELINE_PLUGIN_SPEC` generated in Task 6. Verify each URL decodes to its stated local package directory, `package.json.name` is `@yohi/cf-ai-gw-relay`, and `package.json.main` resolves to that same directory's `dist/index.js`. Run `npm --prefix "$PROJECT_ROOT/apps/opencode-plugin" pack --dry-run` and verify the generated package contains `dist/index.js` and no OpenCode SDK source. A bare registry specifier MUST NOT be used.

  Create and export an isolated config directory; preserve the existing `XDG_DATA_HOME` for OpenCode OAuth and remove environment overrides that could reintroduce global config:

  ```sh
  C1_XDG_CONFIG_HOME="$(mktemp -d)"
  mkdir -p "$C1_XDG_CONFIG_HOME/opencode"
  unset OPENCODE_CONFIG OPENCODE_CONFIG_DIR
  export XDG_CONFIG_HOME="$C1_XDG_CONFIG_HOME"
  ```

  Define this config writer for all scenarios:

  ```sh
  write_c1_config() {
    C1_CONFIG_FILE="$C1_XDG_CONFIG_HOME/opencode/opencode.json" \
    C1_PLUGIN_SPEC="$1" \
    C1_ENABLED_PROVIDERS_JSON="$2" \
    C1_PROVIDER_OPTIONS_JSON="$3" \
      node --input-type=module -e '
        import { writeFileSync } from "node:fs";
        const config = {
          plugin: [process.env.C1_PLUGIN_SPEC],
          model: "openai/gpt-6-sol",
          provider: { "cf-ai-gw-relay": { options: JSON.parse(process.env.C1_PROVIDER_OPTIONS_JSON) } },
        };
        if (process.env.C1_ENABLED_PROVIDERS_JSON !== "") {
          config.enabled_providers = JSON.parse(process.env.C1_ENABLED_PROVIDERS_JSON);
        }
        writeFileSync(process.env.C1_CONFIG_FILE, JSON.stringify(config, null, 2));
      '
  }
  ```

  Verify the local package URL with this exact helper before either runtime phase:

  ```sh
  verify_c1_plugin_spec() {
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
  verify_c1_plugin_spec "$C1_BASELINE_PROJECT/packages/opencode-plugin" "$C1_BASELINE_PLUGIN_SPEC"
  verify_c1_plugin_spec "$C1_INTEGRATED_PLUGIN_DIR" "$C1_INTEGRATED_PLUGIN_SPEC"
  export C1_XDG_CONFIG_HOME
  ```

  The provider-option JSON for runtime acceptance contains `credentialProvider: "openai"`, plus account/Gateway IDs when testing option-sourced configuration. Do not write real `gatewayToken` or `relaySecret` into the file; supply live secret values through the existing environment/secret mechanism only.

- [ ] **RED — baseline OpenCode + local pre-migration plugin:** Call `write_c1_config "$C1_BASELINE_PLUGIN_SPEC" '["openai","cf-ai-gw-relay"]' '{"credentialProvider":"openai"}'`. From `$C1_BASELINE_OPENCODE/packages/opencode`, run `(cd "$C1_BASELINE_OPENCODE/packages/opencode" && XDG_CONFIG_HOME="$C1_XDG_CONFIG_HOME" bun run src/index.ts run --model cf-ai-gw-relay/openai/gpt-6-sol "Reply OK" > "$C1_XDG_CONFIG_HOME/c1-baseline.log" 2>&1)`; require nonzero exit and `rg -q 'ProviderModelNotFoundError' "$C1_XDG_CONFIG_HOME/c1-baseline.log"`. Confirm no Gateway/relay event occurred. Then run `(cd "$C1_BASELINE_OPENCODE/packages/opencode" && XDG_CONFIG_HOME="$C1_XDG_CONFIG_HOME" bun run src/index.ts run --model openai/gpt-6-sol "Reply OK")`; expect usable HTTP 200 with direct Codex routing. This is baseline RED evidence, not production acceptance.

- [ ] **GREEN — released minimum host + integrated local package:** Use only the official binary at `C1_MINIMUM_OPEN_CODE_BIN`, created and version-checked by Task 5. Do not resolve a host executable from PATH. Require its `--version` to equal `C1_MINIMUM_SUPPORTED_VERSION`. Use the local `C1_INTEGRATED_PLUGIN_SPEC`, not a registry package. Run the following isolated scenarios:

  For success fixtures, first assert that the four required environment values are present without printing them; actual values come from the protected local environment and MUST NOT be recorded:

  ```sh
  for name in RELAY_CF_ACCOUNT_ID RELAY_CF_GATEWAY_ID RELAY_CF_AIG_TOKEN RELAY_SECRET; do
    test -n "${!name:-}"
  done
  ```

  Prepare the non-secret option fixture from those environment values without printing them:

  ```sh
  C1_ROUTE_OPTIONS_JSON="$(node --input-type=module -e '
    const options = { credentialProvider: "openai" };
    for (const [key, name] of [["accountId", "RELAY_CF_ACCOUNT_ID"], ["gatewayId", "RELAY_CF_GATEWAY_ID"]]) {
      if (process.env[name] !== undefined) options[key] = process.env[name];
    }
    console.log(JSON.stringify(options));
  ')"
  ```

  1. `write_c1_config "$C1_INTEGRATED_PLUGIN_SPEC" '' "$C1_ROUTE_OPTIONS_JSON"` omits `enabled_providers`; normal discovery applies. Run `"$C1_MINIMUM_OPEN_CODE_BIN" run --model cf-ai-gw-relay/openai/gpt-6-sol "Reply OK"`; require HTTP 200.
  2. `write_c1_config "$C1_INTEGRATED_PLUGIN_SPEC" '["openai","cf-ai-gw-relay"]' "$C1_ROUTE_OPTIONS_JSON"` enables both. Require non-empty `RELAY_CF_ACCOUNT_ID`, `RELAY_CF_GATEWAY_ID`, `RELAY_CF_AIG_TOKEN`, and `RELAY_SECRET` in the protected local acceptance environment without printing values. Run `"$C1_MINIMUM_OPEN_CODE_BIN" run --model cf-ai-gw-relay/openai/gpt-6-sol "Reply OK"` and then `"$C1_MINIMUM_OPEN_CODE_BIN" run --model openai/gpt-6-sol "Reply OK"`; require usable HTTP 200 for both, C1 through Gateway and ordinary OpenAI direct.
  3. `write_c1_config "$C1_INTEGRATED_PLUGIN_SPEC" '["openai"]' "$C1_ROUTE_OPTIONS_JSON"` excludes C1. Run `if "$C1_MINIMUM_OPEN_CODE_BIN" run --model cf-ai-gw-relay/openai/gpt-6-sol "Reply OK" > "$C1_XDG_CONFIG_HOME/c1-excluded.log" 2>&1; then exit 1; fi`; require `rg -q 'ProviderModelNotFoundError' "$C1_XDG_CONFIG_HOME/c1-excluded.log"`, no network request/fallback, then invoke `"$C1_MINIMUM_OPEN_CODE_BIN" run --model openai/gpt-6-sol "Reply OK"` and require HTTP 200.
  4. Call `write_c1_config "$C1_INTEGRATED_PLUGIN_SPEC" '["openai","cf-ai-gw-relay"]' '{"credentialProvider":"openai"}'`. Run `env -u RELAY_CF_ACCOUNT_ID -u RELAY_CF_GATEWAY_ID -u RELAY_CF_AIG_TOKEN -u RELAY_SECRET "$C1_MINIMUM_OPEN_CODE_BIN" run --model openai/gpt-6-sol "Reply OK"`; ordinary OpenAI MUST return HTTP 200. Run `if env -u RELAY_CF_ACCOUNT_ID -u RELAY_CF_GATEWAY_ID -u RELAY_CF_AIG_TOKEN -u RELAY_SECRET "$C1_MINIMUM_OPEN_CODE_BIN" run --model cf-ai-gw-relay/openai/gpt-6-sol "Reply OK" > "$C1_XDG_CONFIG_HOME/c1-missing.log" 2>&1; then exit 1; fi`; require `rg -q 'MissingRelayConfigurationError' "$C1_XDG_CONFIG_HOME/c1-missing.log"` and `rg -q 'accountId.*gatewayId.*gatewayToken.*relaySecret' "$C1_XDG_CONFIG_HOME/c1-missing.log"`, and confirm zero Gateway/relay calls.

  For each successful C1 call, verify selected provider identity `cf-ai-gw-relay`, effective owner `openai`, reuse of the existing OpenCode ChatGPT OAuth identity and subscription quota (no separate OAuth/billing path), Gateway `custom-relay-chatgpt/v1/responses`, Gateway authentication, relay `POST /v1/responses`, upstream HTTP 200, usable streaming response and abort behavior, no direct rewrite, and no fallback. Never print or retain secret values, headers, prompts, response bodies, or raw `ChatGPT-Account-Id` values. The temporary XDG config is deleted after acceptance.

- [ ] **Production readiness decision:** Mark production-ready only if every Issue #28 acceptance row passes on the released minimum host and real Cloudflare manual acceptance succeeds. If the public host capability has not shipped or any blocker remains, preserve `production-ready: blocked` and report the exact version/release dependency; do not reopen the validated C1 architecture.
- [ ] **Cleanup:** Remove only generated detached baseline OpenCode/Project worktrees, Task 5's temporary `C1_MINIMUM_OPEN_CODE_INSTALL_PREFIX`, and the temporary XDG config. Do not remove the actual integrated worktrees or published package.

## Verification Commands

From `apps/opencode-plugin`: `npm ci --ignore-scripts`, `npm run typecheck`, `npm test`, `npm run build`. From repository root: `deno fmt --check`, `deno lint`, `deno test apps/deno-relay .github/scripts`. From the OpenCode upstream worktree's `packages/opencode`: `bun typecheck` and the provider/LLM/agent/Codex focused suites. Protected OAuth-free acceptance remains separate and MUST NOT be represented as a live OAuth test.

## Completion Gate

This plan is `READY FOR REVIEW`, not implementation approval. Before claiming Issue #28 complete, verify both directions: every Issue #28 acceptance row maps to a normative SPEC rule and a task/test/manual acceptance; every plan behavior agrees with SPEC and Issue #28. Production readiness remains blocked until Task 11 passes on the released minimum host and real Cloudflare manual acceptance succeeds.
