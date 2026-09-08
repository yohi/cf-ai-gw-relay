import {
  isRecord,
  type RequestFetcher,
  requestJson,
  requiredString,
} from "./provision-http.ts";
import {
  createDeployPayload,
  type DeployAssets,
  type ProductionTimeline,
  selectProductionOrigin,
} from "./provision-deno-helpers.ts";
import {
  type DenoDeployClientOptions,
  ensureDenoApp,
  readDeployAssets,
} from "./deno-deploy-client.ts";

const DEPLOY_API_ORIGIN = "https://api.deno.com";
const REVISION_POLL_INTERVAL_MS = 2_000;
const REVISION_POLL_ATTEMPTS = 180;
const REVISION_STATUSES = [
  "skipped",
  "queued",
  "building",
  "succeeded",
  "failed",
] as const;
type RevisionStatus = (typeof REVISION_STATUSES)[number];

class DenoApiResponseError extends Error {
  override readonly name = "DenoApiResponseError";
}

class RevisionFailureError extends Error {
  override readonly name = "RevisionFailureError";
}

class RevisionTimeoutError extends Error {
  override readonly name = "RevisionTimeoutError";
}

function parseRevision(value: unknown): {
  readonly id: string;
  readonly status: RevisionStatus;
} {
  if (!isRecord(value)) {
    throw new DenoApiResponseError("Deno Deploy returned an invalid revision");
  }
  const id = requiredString(value, "id");
  const status = value["status"];
  for (const knownStatus of REVISION_STATUSES) {
    if (status === knownStatus) return { id, status: knownStatus };
  }
  throw new DenoApiResponseError(
    "Deno Deploy returned an unknown revision status",
  );
}

function parseTimelines(value: unknown): ProductionTimeline[] {
  if (!Array.isArray(value)) {
    throw new DenoApiResponseError("Deno Deploy returned invalid timelines");
  }

  const timelines: ProductionTimeline[] = [];
  for (const rawTimeline of value) {
    if (!isRecord(rawTimeline) || !Array.isArray(rawTimeline["domains"])) {
      throw new DenoApiResponseError(
        "Deno Deploy returned an invalid timeline",
      );
    }
    const domains: { domain: string }[] = [];
    for (const rawDomain of rawTimeline["domains"]) {
      if (!isRecord(rawDomain)) {
        throw new DenoApiResponseError(
          "Deno Deploy returned an invalid domain",
        );
      }
      domains.push({ domain: requiredString(rawDomain, "domain") });
    }
    timelines.push({
      slug: requiredString(rawTimeline, "slug"),
      domains,
    });
  }
  return timelines;
}

async function waitForRevision(options: {
  readonly client: DenoDeployClientOptions;
  readonly revisionId: string;
}): Promise<void> {
  for (let attempt = 0; attempt < REVISION_POLL_ATTEMPTS; attempt += 1) {
    const body = await requestJson({
      baseUrl: DEPLOY_API_ORIGIN,
      fetcher: options.client.fetcher,
      token: options.client.token,
      method: "GET",
      path: `/v2/revisions/${encodeURIComponent(options.revisionId)}`,
    });
    const revision = parseRevision(body);
    switch (revision.status) {
      case "succeeded":
        return;
      case "failed":
      case "skipped":
        throw new RevisionFailureError(
          `Deno Deploy revision ${revision.id} ended with status ${revision.status}`,
        );
      case "queued":
      case "building":
        break;
      default:
        throw new DenoApiResponseError(
          "Deno Deploy returned an unknown revision status",
        );
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, REVISION_POLL_INTERVAL_MS);
    });
  }
  throw new RevisionTimeoutError("Deno Deploy revision did not finish in time");
}

async function deployRelay(options: {
  readonly client: DenoDeployClientOptions;
  readonly appSlug: string;
  readonly assets: DeployAssets;
}): Promise<string> {
  const body = await requestJson({
    baseUrl: DEPLOY_API_ORIGIN,
    fetcher: options.client.fetcher,
    token: options.client.token,
    method: "POST",
    path: `/v2/apps/${encodeURIComponent(options.appSlug)}/deploy`,
    body: createDeployPayload(options.assets),
  });
  const revision = parseRevision(body);
  if (revision.status !== "succeeded") {
    await waitForRevision({ client: options.client, revisionId: revision.id });
  }

  const timelinesBody = await requestJson({
    baseUrl: DEPLOY_API_ORIGIN,
    fetcher: options.client.fetcher,
    token: options.client.token,
    method: "GET",
    path: `/v2/revisions/${encodeURIComponent(revision.id)}/timelines`,
  });
  return selectProductionOrigin(parseTimelines(timelinesBody));
}

export async function provisionRelay(options: {
  readonly fetcher: RequestFetcher;
  readonly token: string;
  readonly appSlug: string;
  readonly relaySecret: string;
}): Promise<string> {
  const client: DenoDeployClientOptions = {
    fetcher: options.fetcher,
    token: options.token,
  };
  await ensureDenoApp({
    client,
    appSlug: options.appSlug,
    relaySecret: options.relaySecret,
  });
  return deployRelay({
    client,
    appSlug: options.appSlug,
    assets: await readDeployAssets(),
  });
}
