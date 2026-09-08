import type { JsonObject } from "./provision-http.ts";

export type DeployAssets = Readonly<Record<string, JsonObject>>;

export type ProductionTimeline = {
  readonly slug: string;
  readonly domains: readonly { readonly domain: string }[];
};

export class DenoProvisioningError extends Error {
  override readonly name = "DenoProvisioningError";
}

const APP_CONFIG = {
  runtime: {
    type: "dynamic",
    entrypoint: "apps/deno-relay/main.ts",
  },
} as const;

const ASSET_PATHS = [
  "apps/deno-relay/main.ts",
  "apps/deno-relay/relay.ts",
] as const;

export function normalizeAppSlug(value: string): string {
  const slug = value.trim();
  if (
    slug.length < 3 ||
    slug.length > 32 ||
    !/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/.test(slug) ||
    slug.includes("--")
  ) {
    throw new DenoProvisioningError(
      "DENO_DEPLOY_APP must be a lowercase Deno Deploy app slug",
    );
  }
  return slug;
}

export function createAppPayload(
  appSlug: string,
  relaySecret: string,
): JsonObject {
  return {
    slug: appSlug,
    config: APP_CONFIG,
    env_vars: [
      {
        key: "RELAY_SECRET",
        value: relaySecret,
        secret: true,
        contexts: "all",
      },
    ],
  };
}

export function createDeployPayload(assets: DeployAssets): JsonObject {
  return { assets, production: true };
}

export function selectProductionOrigin(
  timelines: readonly ProductionTimeline[],
): string {
  const production = timelines.find((timeline) =>
    timeline.slug === "production"
  );
  const domain = production?.domains[0]?.domain;
  if (domain === undefined || domain.length === 0) {
    throw new DenoProvisioningError(
      "Deno Deploy did not return a production hostname",
    );
  }

  try {
    return new URL(`https://${domain}`).origin;
  } catch (error) {
    if (error instanceof Error) {
      throw new DenoProvisioningError(
        "Deno Deploy returned an invalid production hostname",
        { cause: error },
      );
    }
    throw new DenoProvisioningError(
      "Deno Deploy returned an invalid production hostname",
    );
  }
}

export { APP_CONFIG, ASSET_PATHS };
