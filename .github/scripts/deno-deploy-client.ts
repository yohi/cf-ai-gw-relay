import {
  HttpStatusError,
  isRecord,
  type JsonObject,
  type RequestFetcher,
  requestJson,
  requiredString,
} from "./provision-http.ts";
import {
  ASSET_PATHS,
  createAppPayload,
  DenoProvisioningError,
  type DeployAssets,
} from "./provision-deno-helpers.ts";

export const DEPLOY_API_ORIGIN = "https://api.deno.com";

type AppEnvironmentVariable = {
  readonly id: string;
  readonly key: string;
};

type App = {
  readonly envVars: readonly AppEnvironmentVariable[];
};

export type DenoDeployClientOptions = {
  readonly fetcher: RequestFetcher;
  readonly token: string;
};

class DenoApiResponseError extends Error {
  override readonly name = "DenoApiResponseError";
}

function parseApp(value: unknown): App {
  if (!isRecord(value)) {
    throw new DenoApiResponseError("Deno Deploy returned an invalid app");
  }
  const rawEnvironmentVariables = value["env_vars"];
  if (rawEnvironmentVariables === undefined) return { envVars: [] };
  if (!Array.isArray(rawEnvironmentVariables)) {
    throw new DenoApiResponseError(
      "Deno Deploy returned invalid app environment variables",
    );
  }

  const envVars: AppEnvironmentVariable[] = [];
  for (const rawEnvironmentVariable of rawEnvironmentVariables) {
    if (!isRecord(rawEnvironmentVariable)) {
      throw new DenoApiResponseError(
        "Deno Deploy returned an invalid environment variable",
      );
    }
    envVars.push({
      id: requiredString(rawEnvironmentVariable, "id"),
      key: requiredString(rawEnvironmentVariable, "key"),
    });
  }
  return { envVars };
}

async function getApp(
  options: DenoDeployClientOptions,
  appSlug: string,
): Promise<App | null> {
  try {
    const body = await requestJson({
      baseUrl: DEPLOY_API_ORIGIN,
      fetcher: options.fetcher,
      token: options.token,
      method: "GET",
      path: `/v2/apps/${encodeURIComponent(appSlug)}`,
    });
    return parseApp(body);
  } catch (error) {
    if (error instanceof HttpStatusError && error.status === 404) return null;
    throw error;
  }
}

export async function ensureDenoApp(options: {
  readonly client: DenoDeployClientOptions;
  readonly appSlug: string;
  readonly relaySecret: string;
}): Promise<void> {
  const existingApp = await getApp(options.client, options.appSlug);
  if (existingApp === null) {
    await requestJson({
      baseUrl: DEPLOY_API_ORIGIN,
      fetcher: options.client.fetcher,
      token: options.client.token,
      method: "POST",
      path: "/v2/apps",
      body: createAppPayload(options.appSlug, options.relaySecret),
    });
    return;
  }

  const existingSecret = existingApp.envVars.find(
    (environmentVariable) => environmentVariable.key === "RELAY_SECRET",
  );
  const environmentVariable: JsonObject = existingSecret === undefined
    ? {
      key: "RELAY_SECRET",
      value: options.relaySecret,
      secret: true,
      contexts: "all",
    }
    : {
      id: existingSecret.id,
      value: options.relaySecret,
      secret: true,
      contexts: "all",
    };
  const appPayload = createAppPayload(options.appSlug, options.relaySecret);
  await requestJson({
    baseUrl: DEPLOY_API_ORIGIN,
    fetcher: options.client.fetcher,
    token: options.client.token,
    method: "PATCH",
    path: `/v2/apps/${encodeURIComponent(options.appSlug)}`,
    body: {
      config: appPayload["config"],
      env_vars: [environmentVariable],
    },
  });
}

export async function readDeployAssets(): Promise<DeployAssets> {
  const assets: Record<string, JsonObject> = {};
  for (const assetPath of ASSET_PATHS) {
    const content = await Deno.readTextFile(
      new URL(`../../${assetPath}`, import.meta.url),
    );
    assets[assetPath] = { kind: "file", encoding: "utf-8", content };
  }
  return assets;
}

export { DenoProvisioningError };
