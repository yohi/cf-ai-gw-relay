# GitHub Actions Infrastructure Provisioning Implementation Plan

> **For agentic workers:** This plan is executed inline in the current session.
> Subagents are not used.

**Goal:** Provision or update the Deno Deploy relay and Cloudflare AI Gateway
Custom Provider from GitHub Actions.

**Architecture:** A Deno TypeScript helper calls the Deno Deploy v2 API to
create or update the app, store `RELAY_SECRET` as an app secret, deploy the two
relay runtime files, and return the production hostname. A second Deno
TypeScript helper calls the Cloudflare API to reconcile the Gateway and
`chatgpt-codex-deno` Custom Provider. The workflow invokes both helpers after
local relay verification and passes only non-secret outputs between steps.

**Tech Stack:** GitHub Actions, Deno 2.x, Deno Deploy v2 REST API, Cloudflare AI
Gateway REST API, TypeScript, Deno test.

## Global Constraints

- Use `deno` commands at the repository root for relay and provisioning checks.
- Keep `apps/deno-relay` free of runtime dependencies.
- Never print or persist `DENO_DEPLOY_TOKEN`, `RELAY_SECRET`, or
  `CLOUDFLARE_API_TOKEN`.
- Reuse resources by exact identifier; create only when absent.
- Do not delete resources or introduce a direct ChatGPT fallback.
- Deploy only `apps/deno-relay/main.ts` and its local `relay.ts` dependency.
- Keep the workflow runnable by `workflow_dispatch` and on `master` pushes.

---

### Task 1: Add provisioning helper tests

**Files:**

- Create: `.github/scripts/provision-deno_test.ts`
- Create: `.github/scripts/provision-cloudflare_test.ts`

**Interfaces:**

- Tests consume the pure payload, slug, and origin helpers exported by the two
  provisioning modules.
- The tests require no network access and must never contain real credentials.

- [ ] **Step 1: Write failing tests**

  Cover Deno app slug validation, app secret payload shape, production deploy
  payload shape, and production hostname selection. Cover Cloudflare origin
  normalization, gateway payload settings, and Custom Provider payload mapping.

- [ ] **Step 2: Run the focused tests**

  Run:
  `deno test .github/scripts/provision-deno_test.ts .github/scripts/provision-cloudflare_test.ts`

  Expected: FAIL because the provisioning modules and exported helpers do not
  exist yet.

---

### Task 2: Implement Deno Deploy provisioning

**Files:**

- Create: `.github/scripts/provision-deno.ts`

**Interfaces:**

- Produces `normalizeAppSlug`, `createAppPayload`, `createDeployPayload`, and
  `selectProductionOrigin` for unit tests.
- Produces GitHub output `relay_origin` when run as the main module.
- Reads `DENO_DEPLOY_TOKEN`, `RELAY_SECRET`, and `DENO_DEPLOY_APP` from the
  environment.

- [ ] **Step 1: Implement typed Deno Deploy API requests**

  Use `fetch` with bearer authentication, parse responses as `unknown`, reject
  non-success responses without including response bodies, and distinguish a
  missing app (`404`) from all other failures.

- [ ] **Step 2: Reconcile and deploy the app**

  Create the app when absent, patch the existing app with the dynamic runtime
  entrypoint and secret `RELAY_SECRET`, upload the two relay source assets to
  `/v2/apps/{app}/deploy`, poll the returned revision until it succeeds or
  fails, and select the production timeline hostname.

- [ ] **Step 3: Run focused tests**

  Run: `deno test .github/scripts/provision-deno_test.ts`

  Expected: PASS.

---

### Task 3: Implement Cloudflare reconciliation

**Files:**

- Create: `.github/scripts/provision-cloudflare.ts`

**Interfaces:**

- Produces `normalizeRelayOrigin`, `createGatewayPayload`, and
  `createProviderPayload` for unit tests.
- Reads `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`,
  `CLOUDFLARE_GATEWAY_ID`, `CLOUDFLARE_PROVIDER_SLUG`, and `RELAY_ORIGIN` from
  the environment.

- [ ] **Step 1: Implement typed Cloudflare API requests**

  Parse the Cloudflare envelope, list exact gateway/provider identifiers, create
  missing resources, update existing resources, and stop on all non-success
  responses without logging response bodies.

- [ ] **Step 2: Run focused tests**

  Run: `deno test .github/scripts/provision-cloudflare_test.ts`

  Expected: PASS.

---

### Task 4: Add the provisioning workflow and documentation

**Files:**

- Create: `.github/workflows/provision.yml`
- Modify: `README.md`
- Modify: `.gitignore`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Workflow inputs default to Gateway `relay-gateway`, Deno app `cf-ai-gw-relay`,
  and provider slug `chatgpt-codex-deno`.
- Required credentials are `CLOUDFLARE_API_TOKEN`, `DENO_DEPLOY_TOKEN`, and
  `RELAY_SECRET`; account ID may be a repository variable or secret.
- Workflow summary exposes only the relay origin, Gateway ID, and provider slug.

- [ ] **Step 1: Add workflow**

  Run relay tests, format, and lint; invoke both provisioning helpers with
  least-privilege Deno permissions; use `workflow_dispatch` and `master` push
  triggers; serialize deployments with concurrency; and pass the Deno output
  hostname to the Cloudflare step.

- [ ] **Step 2: Document GitHub settings**

  Document secrets, optional variables, defaults, the Deno organization/token
  scope requirement, and the manual execution path without documenting secret
  values.

- [ ] **Step 3: Run repository verification**

  Run `deno test apps/deno-relay .github/scripts`, `deno fmt --check`,
  `deno lint`, `npm run typecheck`, `npm test`, and `npm run build` from their
  documented directories.
