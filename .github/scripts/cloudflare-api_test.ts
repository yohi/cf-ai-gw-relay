import { assertEquals } from "./test_support.ts";
import { reconcileCloudflare } from "./cloudflare-api.ts";
import type { RequestFetcher } from "./provision-http.ts";

type RecordedRequest = {
  readonly method: string;
  readonly url: string;
  readonly body: unknown;
};

function jsonResponse(body: unknown, status = 200): Response {
  const encoded = JSON.stringify(body);
  if (encoded === undefined) throw new Error("Could not encode test response");
  return new Response(encoded, {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createOptions(fetcher: RequestFetcher) {
  return {
    fetcher,
    token: "token",
    accountId: "acct",
    gatewayId: "gateway",
    providerSlug: "relay-chatgpt",
    relayOrigin: "https://relay.example.test",
  } as const;
}

function createFetcher(
  responses: Response[],
  requests: RecordedRequest[],
): RequestFetcher {
  return (input, init) => {
    const response = responses.shift();
    if (response === undefined) {
      throw new Error("Test response queue was exhausted");
    }
    requests.push({
      method: init?.method ?? "GET",
      url: String(input),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return Promise.resolve(response);
  };
}

function gatewayResponses(): Response[] {
  return [
    jsonResponse({ success: true, result: [{ id: "gateway" }] }),
    jsonResponse({ success: true, result: {} }),
  ];
}

Deno.test("searches Custom Providers by slug before patching", async () => {
  const requests: RecordedRequest[] = [];
  const fetcher = createFetcher(
    [
      ...gatewayResponses(),
      jsonResponse({
        success: true,
        result: [{ id: "provider-id", slug: "relay-chatgpt" }],
      }),
      jsonResponse({ success: true, result: {} }),
    ],
    requests,
  );

  await reconcileCloudflare(createOptions(fetcher));

  assertEquals(
    requests.filter((request) => request.url.includes("/custom-providers")),
    [
      {
        method: "GET",
        url:
          "https://api.cloudflare.com/client/v4/accounts/acct/ai-gateway/custom-providers?per_page=100&search=relay-chatgpt",
      },
      {
        method: "PATCH",
        url:
          "https://api.cloudflare.com/client/v4/accounts/acct/ai-gateway/custom-providers/provider-id",
        body: {
          name: "ChatGPT Codex Deno Relay",
          slug: "relay-chatgpt",
          base_url: "https://relay.example.test",
          description: "Fixed-upstream relay for ChatGPT Codex traffic.",
          enable: true,
        },
      },
    ],
    "provider search and patch requests",
  );
});

Deno.test("re-fetches a Custom Provider after a create conflict", async () => {
  const requests: RecordedRequest[] = [];
  const fetcher = createFetcher(
    [
      ...gatewayResponses(),
      jsonResponse({ success: true, result: [] }),
      new Response(null, { status: 409 }),
      jsonResponse({
        success: true,
        result: [{ id: "created-by-other-run", slug: "relay-chatgpt" }],
      }),
      jsonResponse({ success: true, result: {} }),
    ],
    requests,
  );

  await reconcileCloudflare(createOptions(fetcher));

  assertEquals(
    requests.filter((request) => request.url.includes("/custom-providers")),
    [
      {
        method: "GET",
        url:
          "https://api.cloudflare.com/client/v4/accounts/acct/ai-gateway/custom-providers?per_page=100&search=relay-chatgpt",
      },
      {
        method: "POST",
        url:
          "https://api.cloudflare.com/client/v4/accounts/acct/ai-gateway/custom-providers",
        body: {
          name: "ChatGPT Codex Deno Relay",
          slug: "relay-chatgpt",
          base_url: "https://relay.example.test",
          description: "Fixed-upstream relay for ChatGPT Codex traffic.",
          enable: true,
        },
      },
      {
        method: "GET",
        url:
          "https://api.cloudflare.com/client/v4/accounts/acct/ai-gateway/custom-providers?per_page=100&search=relay-chatgpt",
      },
      {
        method: "PATCH",
        url:
          "https://api.cloudflare.com/client/v4/accounts/acct/ai-gateway/custom-providers/created-by-other-run",
        body: {
          name: "ChatGPT Codex Deno Relay",
          slug: "relay-chatgpt",
          base_url: "https://relay.example.test",
          description: "Fixed-upstream relay for ChatGPT Codex traffic.",
          enable: true,
        },
      },
    ],
    "provider conflict recovery requests",
  );
});
