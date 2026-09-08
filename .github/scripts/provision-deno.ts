import { provisionRelay } from "./provision-deno-api.ts";
import { writeGithubOutput } from "./github-actions.ts";
import {
  DenoProvisioningError,
  normalizeAppSlug,
} from "./provision-deno-helpers.ts";
import type { RequestFetcher } from "./provision-http.ts";

export {
  createAppPayload,
  createDeployPayload,
  normalizeAppSlug,
  selectProductionOrigin,
} from "./provision-deno-helpers.ts";
export type {
  DeployAssets,
  ProductionTimeline,
} from "./provision-deno-helpers.ts";

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (value === undefined || value.trim().length === 0) {
    throw new DenoProvisioningError(`${name} is not configured`);
  }
  return value;
}

async function main(): Promise<void> {
  const appSlug = normalizeAppSlug(requiredEnv("DENO_DEPLOY_APP"));
  const token = requiredEnv("DENO_DEPLOY_TOKEN");
  const relaySecret = requiredEnv("RELAY_SECRET");
  const fetcher: RequestFetcher = fetch;
  const relayOrigin = await provisionRelay({
    fetcher,
    token,
    appSlug,
    relaySecret,
  });
  await writeGithubOutput("relay_origin", relayOrigin);
  console.log(`Deno Deploy production origin: ${relayOrigin}`);
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error("Deno Deploy provisioning failed");
    }
    Deno.exit(1);
  });
}
