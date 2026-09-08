# Deployment

This guide describes the repository’s current provisioning and release
workflows. It does not redefine the runtime protocol contract; see
[../SPEC.md](../SPEC.md).

> [!WARNING]
> Supported production use of the OpenCode plugin is currently blocked by the
> host-capability release gate described in `SPEC.md`. Infrastructure can be
> provisioned and package artifacts can exist without satisfying that
> supported-use gate.

## Deployment Topology

```text
OpenCode
  -> Cloudflare AI Gateway Custom Provider
  -> Deno Deploy relay
  -> fixed ChatGPT Codex upstream
```

The Deno Deploy application directory is the repository root. Root `deno.json`
fixes the runtime entrypoint to:

```text
./apps/deno-relay/main.ts
```

## Provisioning Workflow

`.github/workflows/provision.yml` runs:

- on pushes to `master` that change the relay, provisioning scripts, workflow,
  or root `deno.json`;
- manually through `workflow_dispatch`.

It runs in the `production` GitHub Environment with a 15-minute job timeout and
does not cancel an in-progress provisioning run.

The workflow:

1. checks out the repository;
2. installs Deno 2.x;
3. validates required configuration;
4. runs format, lint, and Deno tests;
5. provisions or updates the Deno Deploy relay;
6. reconciles the Cloudflare AI Gateway and Custom Provider;
7. writes provisioned resource identifiers to the GitHub job summary.

Provisioning helpers are intended to reconcile resources. The workflow does not
contain a resource-deletion step.

## Required Production Configuration

Configure the values documented under **Infrastructure Provisioning
Configuration** in [configuration.md](configuration.md).

Typical repository identifiers are:

```text
DENO_DEPLOY_APP=cf-ai-gw-relay
CLOUDFLARE_GATEWAY_ID=relay-gateway
CLOUDFLARE_PROVIDER_SLUG=relay-chatgpt
```

Account IDs, API tokens, deployment tokens, and relay secrets are
environment-specific and must not be committed.

## Deno Deploy

The provisioning workflow supplies:

- `DENO_DEPLOY_APP`
- `DENO_DEPLOY_TOKEN`
- `RELAY_SECRET`

The provisioning helper deploys the repository entrypoint and records the
resulting production origin for the Cloudflare reconciliation step.

`RELAY_SECRET` is an application secret. Its value must not be printed in
workflow summaries or committed files.

## Cloudflare AI Gateway

The workflow supplies:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_GATEWAY_ID`
- `CLOUDFLARE_PROVIDER_SLUG`
- the Deno relay origin returned by the deployment step

For the current ChatGPT path, the Custom Provider uses the relay production
origin as its base URL. The plugin then calls:

```text
/v1/{account}/{gateway}/custom-{provider-slug}/v1/responses
```

which reaches the relay’s implemented:

```text
POST /v1/responses
```

The Custom Provider is a Cloudflare AI Gateway configuration record, not a
separate runtime service.

## Production Protection

The workflow uses the GitHub Environment named `production`.

Repository administrators may apply Environment protection rules so that
provisioning triggered by a `master` push requires approval before
infrastructure changes proceed.

## Release Workflow

`.github/workflows/release.yml` runs on pushes to `master`.

It uses release-please with:

- `release-please-config.json`
- `.release-please-manifest.json`

When release-please creates a release for `packages/opencode-plugin`, the
workflow:

1. checks out the released tag;
2. sets up Node.js 22 and the GitHub Packages npm registry;
3. runs `npm ci --legacy-peer-deps --ignore-scripts`;
4. runs plugin typecheck, tests, and build;
5. publishes the npm package to GitHub Packages with the workflow
   `GITHUB_TOKEN`;
6. creates an npm tarball;
7. uploads the tarball as a GitHub Release asset.

The package currently declares version `0.3.0` in
`packages/opencode-plugin/package.json`. Release history is canonical in
`packages/opencode-plugin/CHANGELOG.md`.

Do not maintain an “initial 0.1.0 release checklist” in the root README.

## Consuming GitHub Packages

When a consumer needs to authenticate to GitHub Packages, keep the token outside
the repository. A typical npm configuration is:

```ini
@yohi:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
```

The token value itself must not be stored in `.npmrc` or committed.

This installation mechanism does not override the project’s current
supported-use block.

## Release Gate

Package publication and supported use are different conditions.

Before treating a release as supported:

- the required OpenCode host capabilities must exist;
- the supported range in code and package metadata must match;
- repository verification must pass;
- protected acceptance must pass for the behavior included in the release.

See [../SPEC.md](../SPEC.md) for the normative gate and
[operations.md](operations.md) for acceptance and rollback procedures.
