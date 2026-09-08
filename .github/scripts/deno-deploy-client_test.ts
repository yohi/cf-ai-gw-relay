import { assertEquals } from "./test_support.ts";
import {
  type DenoDeployClientOptions,
  ensureDenoApp,
} from "./deno-deploy-client.ts";

type RecordedRequest = {
  readonly method: string;
  readonly url: string;
  readonly body: unknown;
};

function jsonResponse(body: unknown): Response {
  const encoded = JSON.stringify(body);
  if (encoded === undefined) throw new Error("Could not encode test response");
  return new Response(encoded, {
    headers: { "content-type": "application/json" },
  });
}

Deno.test("re-fetches a Deno app after a create conflict", async () => {
  const requests: RecordedRequest[] = [];
  const responses = [
    new Response(null, { status: 404 }),
    new Response(null, { status: 409 }),
    jsonResponse({
      env_vars: [{ id: "secret-id", key: "RELAY_SECRET" }],
    }),
    jsonResponse({}),
  ];
  const fetcher: DenoDeployClientOptions["fetcher"] = (input, init) => {
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

  await ensureDenoApp({
    client: { fetcher, token: "token" },
    appSlug: "app-slug",
    relaySecret: "new-secret",
  });

  assertEquals(
    requests,
    [
      {
        method: "GET",
        url: "https://api.deno.com/v2/apps/app-slug",
      },
      {
        method: "POST",
        url: "https://api.deno.com/v2/apps",
        body: {
          slug: "app-slug",
          config: {
            runtime: {
              type: "dynamic",
              entrypoint: "apps/deno-relay/main.ts",
            },
          },
          env_vars: [
            {
              key: "RELAY_SECRET",
              value: "new-secret",
              secret: true,
              contexts: "all",
            },
          ],
        },
      },
      {
        method: "GET",
        url: "https://api.deno.com/v2/apps/app-slug",
      },
      {
        method: "PATCH",
        url: "https://api.deno.com/v2/apps/app-slug",
        body: {
          config: {
            runtime: {
              type: "dynamic",
              entrypoint: "apps/deno-relay/main.ts",
            },
          },
          env_vars: [
            {
              id: "secret-id",
              value: "new-secret",
              secret: true,
              contexts: "all",
            },
          ],
        },
      },
    ],
    "Deno app conflict recovery requests",
  );
});
