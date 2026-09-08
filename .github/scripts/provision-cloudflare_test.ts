import {
  createGatewayPayload,
  createProviderPayload,
  normalizeRelayOrigin,
} from "./provision-cloudflare.ts";

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

Deno.test("normalizes a relay origin without a path", () => {
  assertEquals(
    normalizeRelayOrigin("https://relay.example.test/"),
    "https://relay.example.test",
    "relay origin",
  );
});

Deno.test("rejects a relay URL with a path", () => {
  assertThrows(
    () => normalizeRelayOrigin("https://relay.example.test/v1"),
    "relay URL path",
  );
});

Deno.test("builds an observability gateway payload", () => {
  assertEquals(
    createGatewayPayload("relay-gateway"),
    {
      id: "relay-gateway",
      authentication: true,
      collect_logs: true,
      cache_ttl: 0,
      cache_invalidate_on_update: true,
      rate_limiting_interval: 0,
      rate_limiting_limit: 0,
    },
    "gateway payload",
  );
});

Deno.test("maps the relay origin to the Custom Provider payload", () => {
  assertEquals(
    createProviderPayload("relay-chatgpt", "https://relay.example.test"),
    {
      name: "ChatGPT Codex Deno Relay",
      slug: "relay-chatgpt",
      base_url: "https://relay.example.test",
      description: "Fixed-upstream relay for ChatGPT Codex traffic.",
      enable: true,
    },
    "provider payload",
  );
});
