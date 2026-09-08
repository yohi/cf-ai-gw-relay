import {
  createAppPayload,
  createDeployPayload,
  normalizeAppSlug,
  selectProductionOrigin,
} from "./provision-deno.ts";

function assertEquals(
  actual: unknown,
  expected: unknown,
  message: string,
): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }`,
    );
  }
}

function assertThrows(action: () => void, message: string): void {
  let thrown = false;
  try {
    action();
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    thrown = true;
  }
  if (!thrown) throw new Error(`${message}: expected an error`);
}

Deno.test("normalizes a valid Deno app slug", () => {
  assertEquals(
    normalizeAppSlug("cf-ai-gw-relay"),
    "cf-ai-gw-relay",
    "valid slug",
  );
});

Deno.test("rejects an invalid Deno app slug", () => {
  assertThrows(
    () => normalizeAppSlug("CF_AI_GW_RELAY"),
    "invalid slug",
  );
});

Deno.test("builds an app payload with a secret relay token", () => {
  assertEquals(
    createAppPayload("cf-ai-gw-relay", "relay-test-secret"),
    {
      slug: "cf-ai-gw-relay",
      config: {
        runtime: {
          type: "dynamic",
          entrypoint: "apps/deno-relay/main.ts",
        },
      },
      env_vars: [
        {
          key: "RELAY_SECRET",
          value: "relay-test-secret",
          secret: true,
          contexts: "all",
        },
      ],
    },
    "app payload",
  );
});

Deno.test("builds a production deploy payload without secrets", () => {
  const assets = {
    "apps/deno-relay/main.ts": {
      kind: "file",
      content: "main",
    },
    "apps/deno-relay/relay.ts": {
      kind: "file",
      content: "relay",
    },
  } as const;

  assertEquals(
    createDeployPayload(assets),
    { assets, production: true },
    "deploy payload",
  );
});

Deno.test("selects the production hostname", () => {
  assertEquals(
    selectProductionOrigin([
      { slug: "preview", domains: [{ domain: "preview.example.test" }] },
      { slug: "production", domains: [{ domain: "relay.example.test" }] },
    ]),
    "https://relay.example.test",
    "production origin",
  );
});
