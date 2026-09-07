import {
  acceptanceTimeoutMs,
  anthropicAnyOfBody,
  anthropicInvalidJsonEnvelope,
  assertJsonResponse,
  assertSuccessfulResponse,
  isGatewayAcceptanceConfigured,
  normalizeAcceptanceOrigin,
  openAiAnyOfBody,
  openAiInvalidJsonEnvelope,
  readGatewayAcceptanceConfig,
  requestThroughGateway,
} from "./acceptance_support.ts";
import type { GatewayAcceptanceConfig } from "./acceptance_support.ts";

function readAcceptanceOrigin(): string | undefined {
  try {
    const value = Deno.env.get("RELAY_ACCEPTANCE_ORIGIN");
    return normalizeAcceptanceOrigin(value);
  } catch {
    return undefined;
  }
}

function readAcceptanceRelaySecret(): string | undefined {
  try {
    const value = Deno.env.get("RELAY_ACCEPTANCE_RELAY_SECRET");
    return value === undefined || value.trim().length === 0 ? undefined : value;
  } catch {
    return undefined;
  }
}

const origin = readAcceptanceOrigin();
const relaySecret = readAcceptanceRelaySecret();
const gatewayAcceptanceConfigured = isGatewayAcceptanceConfigured();

const genericUpstreamHandlerImplemented = false;

type ProtectedAcceptanceTest = (
  config: GatewayAcceptanceConfig,
) => Promise<void>;

function protectedAcceptanceTest(
  name: string,
  test: ProtectedAcceptanceTest,
): void {
  Deno.test({
    name,
    ignore: !gatewayAcceptanceConfigured,
    fn: async () => {
      await test(readGatewayAcceptanceConfig());
    },
  });
}

function futureGenericAcceptanceTest(
  name: string,
  test: ProtectedAcceptanceTest,
): void {
  Deno.test({
    name,
    ignore: !gatewayAcceptanceConfigured || !genericUpstreamHandlerImplemented,
    fn: async () => {
      await test(readGatewayAcceptanceConfig());
    },
  });
}

Deno.test({
  name: "acceptance: relay rejects wrong method with 404",
  ignore: origin === undefined || relaySecret === undefined,
  fn: async () => {
    if (origin === undefined || relaySecret === undefined) {
      return;
    }
    const response = await fetch(`${origin}/v1/responses`, {
      method: "GET",
      headers: {
        "X-ChatGPT-Relay-Authorization": `Bearer ${relaySecret}`,
      },
      signal: AbortSignal.timeout(acceptanceTimeoutMs),
    });
    try {
      if (response.status !== 404) {
        throw new Error(`expected 404, received ${response.status}`);
      }
    } finally {
      await response.body?.cancel();
    }
  },
});

Deno.test({
  name: "acceptance: relay rejects missing credentials with 401",
  ignore: origin === undefined,
  fn: async () => {
    if (origin === undefined) {
      return;
    }
    const response = await fetch(`${origin}/v1/responses`, {
      method: "POST",
      signal: AbortSignal.timeout(acceptanceTimeoutMs),
    });
    try {
      if (response.status !== 401) {
        throw new Error(`expected 401, received ${response.status}`);
      }
    } finally {
      await response.body?.cancel();
    }
  },
});

protectedAcceptanceTest(
  "acceptance: legacy POST /v1/responses reaches ChatGPT",
  async (config) => {
    const response = await requestThroughGateway(config, "/v1/responses", {
      method: "POST",
      headers: {
        authorization: "Bearer chatgpt-oauth-token",
        "ChatGPT-Account-Id": "acceptance-account",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Reply with ACCEPTANCE_OK." }],
      }),
    });
    await assertSuccessfulResponse(response, "legacy POST /v1/responses");
  },
);

futureGenericAcceptanceTest(
  "acceptance: OpenAI root anyOf reaches the provider validator",
  async (config) => {
    const response = await requestThroughGateway(
      config,
      "/v1/chat/completions",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.commandCodeApiKey}`,
          "content-type": "application/json",
        },
        body: openAiAnyOfBody(config),
      },
    );
    await assertSuccessfulResponse(response, "OpenAI root anyOf acceptance");
  },
);

futureGenericAcceptanceTest(
  "acceptance: Anthropic root anyOf route reaches the provider",
  async (config) => {
    const response = await requestThroughGateway(config, "/v1/messages", {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.commandCodeApiKey}`,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: anthropicAnyOfBody(config),
    });
    await assertSuccessfulResponse(
      response,
      "Anthropic root anyOf acceptance",
    );
  },
);

futureGenericAcceptanceTest(
  "acceptance: Command Code models endpoint is reachable",
  async (config) => {
    const response = await requestThroughGateway(config, "/v1/models", {
      method: "GET",
      headers: { authorization: `Bearer ${config.commandCodeApiKey}` },
    });
    await assertSuccessfulResponse(response, "Command Code models acceptance");
  },
);

futureGenericAcceptanceTest(
  "acceptance: OpenAI malformed JSON returns the provider envelope",
  async (config) => {
    const response = await requestThroughGateway(
      config,
      "/v1/chat/completions",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.commandCodeApiKey}`,
          "content-type": "application/json",
        },
        body: "{",
      },
    );
    await assertJsonResponse(response, {
      body: openAiInvalidJsonEnvelope,
      label: "OpenAI malformed JSON acceptance",
      status: 400,
    });
  },
);

futureGenericAcceptanceTest(
  "acceptance: Anthropic malformed JSON returns the provider envelope",
  async (config) => {
    const response = await requestThroughGateway(config, "/v1/messages", {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.commandCodeApiKey}`,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: "{",
    });
    await assertJsonResponse(response, {
      body: anthropicInvalidJsonEnvelope,
      label: "Anthropic malformed JSON acceptance",
      status: 400,
    });
  },
);

futureGenericAcceptanceTest(
  "acceptance: OpenAI empty JSON returns the provider envelope",
  async (config) => {
    const response = await requestThroughGateway(
      config,
      "/v1/chat/completions",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.commandCodeApiKey}`,
          "content-type": "application/json",
        },
      },
    );
    await assertJsonResponse(response, {
      body: openAiInvalidJsonEnvelope,
      label: "OpenAI empty JSON acceptance",
      status: 400,
    });
  },
);

futureGenericAcceptanceTest(
  "acceptance: Anthropic empty JSON returns the provider envelope",
  async (config) => {
    const response = await requestThroughGateway(config, "/v1/messages", {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.commandCodeApiKey}`,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
    });
    await assertJsonResponse(response, {
      body: anthropicInvalidJsonEnvelope,
      label: "Anthropic empty JSON acceptance",
      status: 400,
    });
  },
);
