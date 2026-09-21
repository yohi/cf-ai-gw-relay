export type BoundaryScenario =
  | "valid-gateway-invalid-relay"
  | "invalid-gateway-valid-relay";

export type BoundaryProbeResult = {
  readonly status: number;
  readonly responseClass: "gateway-rejected" | "relay-rejected";
};

export type BoundaryProbe = (
  scenario: BoundaryScenario,
  env: Readonly<Record<string, string | undefined>>,
) => Promise<BoundaryProbeResult>;

export type BoundaryAcceptanceDependencies = {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly probe: BoundaryProbe;
};

const ACCEPTANCE_PROVIDER_SLUG = "command-code";
const ACCEPTANCE_MODEL = "gpt-5.6-luna";
const BOUNDARY_REQUEST_TIMEOUT_MS = 30_000;
const MAX_BOUNDARY_RESPONSE_BYTES = 4096;
const RELAY_UNAUTHORIZED_BODY = '{"error":"unauthorized"}';
const REQUIRED_ENVIRONMENT_NAMES = [
  "RELAY_ACCEPTANCE_RELAY_SECRET",
  "RELAY_ACCEPTANCE_GATEWAY_BASE_URL",
  "RELAY_ACCEPTANCE_GATEWAY_TOKEN",
  "RELAY_ACCEPTANCE_COMMAND_CODE_API_KEY",
  "RELAY_ACCEPTANCE_MODEL",
] as const;

function gatewayBase(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("invalid protected acceptance Gateway URL");
  }

  if (
    url.protocol !== "https:" ||
    url.hostname !== "gateway.ai.cloudflare.com" ||
    url.port.length > 0 ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.search.length > 0 ||
    url.hash.length > 0 ||
    !/^\/v1\/[^/]+\/[^/]+\/?$/.test(url.pathname)
  ) {
    throw new Error("invalid protected acceptance Gateway URL");
  }
  return url;
}

export function buildBoundaryGatewayUrl(baseUrl: string): string {
  const url = gatewayBase(baseUrl);
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${path}/custom-${ACCEPTANCE_PROVIDER_SLUG}/responses`;
}

function requiredEnvironmentValue(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
): string {
  const value = env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function validateEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): void {
  for (const name of REQUIRED_ENVIRONMENT_NAMES) {
    requiredEnvironmentValue(env, name);
  }
  if (env.RELAY_ACCEPTANCE_MODEL !== ACCEPTANCE_MODEL) {
    throw new Error("RELAY_ACCEPTANCE_MODEL must be gpt-5.6-luna");
  }
  buildBoundaryGatewayUrl(env.RELAY_ACCEPTANCE_GATEWAY_BASE_URL as string);
}

function expectedResult(
  scenario: BoundaryScenario,
): {
  readonly status: readonly number[];
  readonly responseClass: BoundaryProbeResult["responseClass"];
} {
  return scenario === "valid-gateway-invalid-relay"
    ? { status: [401], responseClass: "relay-rejected" }
    : { status: [401, 403], responseClass: "gateway-rejected" };
}

function assertBoundaryResult(
  scenario: BoundaryScenario,
  result: BoundaryProbeResult,
): void {
  const expected = expectedResult(scenario);
  if (
    !expected.status.includes(result.status) ||
    result.responseClass !== expected.responseClass
  ) {
    throw new Error(`boundary ${scenario} returned an unexpected result`);
  }
}

export async function runBoundaryAcceptance(
  dependencies: BoundaryAcceptanceDependencies,
): Promise<void> {
  validateEnvironment(dependencies.env);
  const scenarios: readonly BoundaryScenario[] = [
    "valid-gateway-invalid-relay",
    "invalid-gateway-valid-relay",
  ];
  for (const scenario of scenarios) {
    const result = await dependencies.probe(scenario, dependencies.env);
    assertBoundaryResult(scenario, result);
  }
}

async function readBoundaryResponse(response: Response): Promise<string> {
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_BOUNDARY_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("boundary response exceeded the size limit");
      }
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function probeBoundary(
  scenario: BoundaryScenario,
  env: Readonly<Record<string, string | undefined>>,
): Promise<BoundaryProbeResult> {
  const gatewayToken = scenario === "valid-gateway-invalid-relay"
    ? requiredEnvironmentValue(env, "RELAY_ACCEPTANCE_GATEWAY_TOKEN")
    : "invalid-gateway-sentinel";
  const relaySecret = scenario === "valid-gateway-invalid-relay"
    ? "invalid-relay-sentinel"
    : requiredEnvironmentValue(env, "RELAY_ACCEPTANCE_RELAY_SECRET");
  const providerApiKey = requiredEnvironmentValue(
    env,
    "RELAY_ACCEPTANCE_COMMAND_CODE_API_KEY",
  );
  const model = requiredEnvironmentValue(env, "RELAY_ACCEPTANCE_MODEL");
  const response = await fetch(
    buildBoundaryGatewayUrl(
      requiredEnvironmentValue(env, "RELAY_ACCEPTANCE_GATEWAY_BASE_URL"),
    ),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${providerApiKey}`,
        "cf-aig-authorization": `Bearer ${gatewayToken}`,
        "content-type": "application/json",
        "x-chatgpt-relay-authorization": `Bearer ${relaySecret}`,
      },
      body: JSON.stringify({ model, input: [], stream: false }),
      redirect: "error",
      signal: AbortSignal.timeout(BOUNDARY_REQUEST_TIMEOUT_MS),
    },
  );
  try {
    const body = await readBoundaryResponse(response);
    if (body === RELAY_UNAUTHORIZED_BODY && response.status === 401) {
      return { status: response.status, responseClass: "relay-rejected" };
    }
    if (response.status === 401 || response.status === 403) {
      return { status: response.status, responseClass: "gateway-rejected" };
    }
    throw new Error("boundary response was not an authentication rejection");
  } catch (error) {
    await response.body?.cancel();
    throw error;
  }
}

function readProcessEnvironment(): Readonly<
  Record<string, string | undefined>
> {
  const env: Record<string, string | undefined> = {};
  for (const name of REQUIRED_ENVIRONMENT_NAMES) {
    env[name] = Deno.env.get(name);
  }
  return env;
}

if (import.meta.main) {
  try {
    const env = readProcessEnvironment();
    await runBoundaryAcceptance({ env, probe: probeBoundary });
    console.log("provider-boundary-acceptance: gateway-rejected");
    console.log("provider-boundary-acceptance: relay-rejected");
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "provider boundary acceptance failed",
    );
    Deno.exit(1);
  }
}
