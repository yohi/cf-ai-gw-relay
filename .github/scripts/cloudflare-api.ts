import {
  HttpStatusError,
  isRecord,
  type JsonObject,
  type RequestFetcher,
  requestJson,
  requiredString,
} from "./provision-http.ts";
import {
  createGatewayPayload,
  createProviderPayload,
} from "./provision-cloudflare-helpers.ts";

const CLOUDFLARE_API_ORIGIN = "https://api.cloudflare.com/client/v4";

type Gateway = { readonly id: string };
type Provider = { readonly id: string; readonly slug: string };

class CloudflareApiResponseError extends Error {
  override readonly name = "CloudflareApiResponseError";
}

function parseEnvelope(
  value: unknown,
): { readonly success: boolean; readonly result: unknown } {
  if (!isRecord(value) || typeof value["success"] !== "boolean") {
    throw new CloudflareApiResponseError(
      "Cloudflare returned an invalid response",
    );
  }
  return { success: value["success"], result: value["result"] };
}

async function requestCloudflare(options: {
  readonly fetcher: RequestFetcher;
  readonly token: string;
  readonly method: "GET" | "PATCH" | "POST" | "PUT";
  readonly path: string;
  readonly body?: JsonObject;
}): Promise<unknown> {
  const raw = await requestJson({
    baseUrl: CLOUDFLARE_API_ORIGIN,
    fetcher: options.fetcher,
    token: options.token,
    method: options.method,
    path: options.path,
    body: options.body,
  });
  const envelope = parseEnvelope(raw);
  if (!envelope.success) {
    throw new CloudflareApiResponseError(
      `Cloudflare rejected ${options.method} ${options.path}`,
    );
  }
  return envelope.result;
}

function accountPath(accountId: string, suffix: string): string {
  return `/accounts/${encodeURIComponent(accountId)}/ai-gateway${suffix}`;
}

function parseGateways(value: unknown): Gateway[] {
  if (!Array.isArray(value)) {
    throw new CloudflareApiResponseError(
      "Cloudflare returned invalid gateways",
    );
  }
  const gateways: Gateway[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      throw new CloudflareApiResponseError(
        "Cloudflare returned an invalid gateway",
      );
    }
    gateways.push({ id: requiredString(item, "id") });
  }
  return gateways;
}

function parseProviders(value: unknown): Provider[] {
  if (!Array.isArray(value)) {
    throw new CloudflareApiResponseError(
      "Cloudflare returned invalid providers",
    );
  }
  const providers: Provider[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      throw new CloudflareApiResponseError(
        "Cloudflare returned an invalid provider",
      );
    }
    providers.push({
      id: requiredString(item, "id"),
      slug: requiredString(item, "slug"),
    });
  }
  return providers;
}

async function reconcileGateway(options: {
  readonly client: {
    readonly fetcher: RequestFetcher;
    readonly token: string;
  };
  readonly accountId: string;
  readonly gatewayId: string;
}): Promise<void> {
  const list = await requestCloudflare({
    ...options.client,
    method: "GET",
    path: accountPath(options.accountId, "/gateways?per_page=100"),
  });
  const existing = parseGateways(list).find(
    (gateway) => gateway.id === options.gatewayId,
  );
  if (existing === undefined) {
    try {
      await requestCloudflare({
        ...options.client,
        method: "POST",
        path: accountPath(options.accountId, "/gateways"),
        body: createGatewayPayload(options.gatewayId),
      });
    } catch (error) {
      if (!(error instanceof HttpStatusError) || error.status !== 409) {
        throw error;
      }
      await requestCloudflare({
        ...options.client,
        method: "PUT",
        path: accountPath(
          options.accountId,
          `/gateways/${encodeURIComponent(options.gatewayId)}`,
        ),
        body: createGatewayPayload(options.gatewayId),
      });
    }
    return;
  }
  await requestCloudflare({
    ...options.client,
    method: "PUT",
    path: accountPath(
      options.accountId,
      `/gateways/${encodeURIComponent(existing.id)}`,
    ),
    body: createGatewayPayload(options.gatewayId),
  });
}

async function reconcileProvider(options: {
  readonly client: {
    readonly fetcher: RequestFetcher;
    readonly token: string;
  };
  readonly accountId: string;
  readonly providerSlug: string;
  readonly relayOrigin: string;
}): Promise<void> {
  const providerSearchPath = accountPath(
    options.accountId,
    `/custom-providers?per_page=100&search=${
      encodeURIComponent(options.providerSlug)
    }`,
  );
  const list = await requestCloudflare({
    ...options.client,
    method: "GET",
    path: providerSearchPath,
  });
  let existing = parseProviders(list).find(
    (provider) => provider.slug === options.providerSlug,
  );
  const body = createProviderPayload(options.providerSlug, options.relayOrigin);
  if (existing === undefined) {
    try {
      await requestCloudflare({
        ...options.client,
        method: "POST",
        path: accountPath(options.accountId, "/custom-providers"),
        body,
      });
      return;
    } catch (error) {
      if (!(error instanceof HttpStatusError) || error.status !== 409) {
        throw error;
      }
      const refreshedList = await requestCloudflare({
        ...options.client,
        method: "GET",
        path: providerSearchPath,
      });
      existing = parseProviders(refreshedList).find(
        (provider) => provider.slug === options.providerSlug,
      );
      if (existing === undefined) throw error;
    }
  }
  await requestCloudflare({
    ...options.client,
    method: "PATCH",
    path: accountPath(
      options.accountId,
      `/custom-providers/${encodeURIComponent(existing.id)}`,
    ),
    body,
  });
}

export async function reconcileCloudflare(options: {
  readonly fetcher: RequestFetcher;
  readonly token: string;
  readonly accountId: string;
  readonly gatewayId: string;
  readonly providerSlug: string;
  readonly relayOrigin: string;
}): Promise<void> {
  const client = { fetcher: options.fetcher, token: options.token };
  await reconcileGateway({
    client,
    accountId: options.accountId,
    gatewayId: options.gatewayId,
  });
  await reconcileProvider({
    client,
    accountId: options.accountId,
    providerSlug: options.providerSlug,
    relayOrigin: options.relayOrigin,
  });
}
