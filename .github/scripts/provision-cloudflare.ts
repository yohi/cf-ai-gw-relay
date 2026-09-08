import { reconcileCloudflare } from "./cloudflare-api.ts";
import { writeGithubOutput } from "./github-actions.ts";
import {
  CloudflareProvisioningError,
  normalizeGatewayId,
  normalizeProviderSlug,
  normalizeRelayOrigin,
} from "./provision-cloudflare-helpers.ts";
import type { RequestFetcher } from "./provision-http.ts";

export {
  createGatewayPayload,
  createProviderPayload,
  normalizeRelayOrigin,
} from "./provision-cloudflare-helpers.ts";
export type { JsonObject } from "./provision-http.ts";

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (value === undefined || value.trim().length === 0) {
    throw new CloudflareProvisioningError(`${name} is not configured`);
  }
  return value;
}

async function main(): Promise<void> {
  const accountId = requiredEnv("CLOUDFLARE_ACCOUNT_ID");
  const token = requiredEnv("CLOUDFLARE_API_TOKEN");
  const gatewayId = normalizeGatewayId(requiredEnv("CLOUDFLARE_GATEWAY_ID"));
  const providerSlug = normalizeProviderSlug(
    requiredEnv("CLOUDFLARE_PROVIDER_SLUG"),
  );
  const relayOrigin = normalizeRelayOrigin(requiredEnv("RELAY_ORIGIN"));
  const fetcher: RequestFetcher = fetch;
  await reconcileCloudflare({
    fetcher,
    token,
    accountId,
    gatewayId,
    providerSlug,
    relayOrigin,
  });
  await writeGithubOutput("gateway_id", gatewayId);
  await writeGithubOutput("provider_slug", providerSlug);
  console.log(`Cloudflare AI Gateway reconciled: ${gatewayId}`);
  console.log(`Cloudflare Custom Provider reconciled: ${providerSlug}`);
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error("Cloudflare provisioning failed");
    }
    Deno.exit(1);
  });
}
