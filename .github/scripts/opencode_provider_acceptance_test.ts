import {
  buildBoundaryGatewayUrl,
  runBoundaryAcceptance,
} from "./opencode_provider_acceptance.ts";
import type {
  BoundaryAcceptanceDependencies,
  BoundaryProbe,
} from "./opencode_provider_acceptance.ts";

const testEnvironment = {
  RELAY_ACCEPTANCE_RELAY_SECRET: "relay-sentinel",
  RELAY_ACCEPTANCE_GATEWAY_BASE_URL:
    "https://gateway.ai.cloudflare.com/v1/acct/gateway",
  RELAY_ACCEPTANCE_GATEWAY_TOKEN: "gateway-sentinel",
  RELAY_ACCEPTANCE_COMMAND_CODE_API_KEY: "provider-sentinel",
  RELAY_ACCEPTANCE_MODEL: "gpt-5.6-luna",
};

Deno.test("builds the fixed Custom Provider Gateway URL", () => {
  const url = buildBoundaryGatewayUrl(
    testEnvironment.RELAY_ACCEPTANCE_GATEWAY_BASE_URL,
  );
  if (
    url !==
      "https://gateway.ai.cloudflare.com/v1/acct/gateway/custom-command-code/responses"
  ) {
    throw new Error(`unexpected Gateway URL: ${url}`);
  }
});

Deno.test("rejects a Gateway base containing a route suffix", () => {
  for (
    const baseUrl of [
      "https://gateway.ai.cloudflare.com/v1/acct/gateway/custom-command-code",
      "https://gateway.ai.cloudflare.com/v1/acct/gateway/responses",
      "https://gateway.ai.cloudflare.com/v1/acct/gateway/v1/responses",
    ]
  ) {
    try {
      buildBoundaryGatewayUrl(baseUrl);
      throw new Error(`accepted invalid Gateway URL: ${baseUrl}`);
    } catch (error) {
      if (!(error instanceof Error) || error.message.includes("accepted")) {
        throw error;
      }
    }
  }
});

Deno.test("runs both boundary scenarios exactly once", async () => {
  const scenarios: string[] = [];
  const probe: BoundaryProbe = (scenario: string) => {
    scenarios.push(scenario);
    return Promise.resolve(
      scenario === "valid-gateway-invalid-relay"
        ? { status: 401, responseClass: "relay-rejected" }
        : { status: 403, responseClass: "gateway-rejected" },
    );
  };
  const dependencies: BoundaryAcceptanceDependencies = {
    env: testEnvironment,
    probe,
  };

  await runBoundaryAcceptance(dependencies);

  if (
    scenarios.join(",") !==
      "valid-gateway-invalid-relay,invalid-gateway-valid-relay"
  ) {
    throw new Error(`unexpected probe scenarios: ${scenarios.join(",")}`);
  }
});

Deno.test("rejects missing required environment values", async () => {
  const env = { ...testEnvironment, RELAY_ACCEPTANCE_MODEL: "" };
  const probe: BoundaryProbe = () =>
    Promise.resolve({
      status: 401,
      responseClass: "relay-rejected" as const,
    });

  await assertRejects(() => runBoundaryAcceptance({ env, probe }), "MODEL");
});

Deno.test("rejects wrong status and response classes", async () => {
  const wrongResults: readonly [
    number,
    "gateway-rejected" | "relay-rejected",
  ][] = [
    [403, "relay-rejected"],
    [401, "gateway-rejected"],
  ];

  for (const [status, responseClass] of wrongResults) {
    let callCount = 0;
    const probe: BoundaryProbe = () => {
      callCount += 1;
      return Promise.resolve({ status, responseClass });
    };
    await assertRejects(
      () => runBoundaryAcceptance({ env: testEnvironment, probe }),
      "boundary",
    );
    if (callCount !== 1) {
      throw new Error(`expected one probe before rejection, got ${callCount}`);
    }
  }
});

async function assertRejects(
  operation: () => Promise<void>,
  message: string,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof Error && error.message.includes(message)) return;
    throw error;
  }
  throw new Error(`expected rejection containing ${message}`);
}
