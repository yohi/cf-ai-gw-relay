import { satisfies, valid } from "semver";
import { UnsupportedOpenCodeVersionError } from "./errors.js";

export const SUPPORTED_OPENCODE_RANGE = ">=1.18.20 <2";
export const OPENCODE_SERVER_HEALTH_PATHNAME = "/global/health";

export type HostVersionCapability =
  | { readonly available: true; readonly version: string }
  | { readonly available: false };

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function firstValidSemver(values: readonly unknown[]): string | undefined {
  for (const value of values) {
    if (
      typeof value === "string" &&
      value.length > 0 &&
      valid(value) !== null
    ) {
      return value;
    }
  }
  return undefined;
}

function healthVersion(response: unknown): string | undefined {
  const data =
    isRecord(response) && isRecord(response.data) ? response.data : response;
  if (!isRecord(data) || data.healthy !== true) {
    return undefined;
  }
  return firstValidSemver([data.version]);
}

async function resolveServerHealthVersion(
  serverUrl: URL,
): Promise<string | undefined> {
  try {
    const response = await fetch(
      new URL(OPENCODE_SERVER_HEALTH_PATHNAME, serverUrl),
      {
        redirect: "error",
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!response.ok) {
      return undefined;
    }
    return healthVersion(await response.json());
  } catch {
    // Health failures must remain unavailable so activation fails closed.
    return undefined;
  }
}

export function resolveHostVersionCapability(
  input: unknown,
): HostVersionCapability {
  const source = isRecord(input) ? input : {};
  const opencode = source.opencode;
  const host = source.host;
  const version = firstValidSemver([
    isRecord(opencode) ? opencode.version : undefined,
    typeof opencode === "string" ? opencode : undefined,
    isRecord(host) ? host.version : undefined,
    source.version,
  ]);
  return version === undefined
    ? { available: false }
    : { available: true, version };
}

export async function resolveHostVersionCapabilityAsync(
  input: unknown,
): Promise<HostVersionCapability> {
  const source = isRecord(input) ? input : {};
  if (
    source.serverUrl instanceof URL &&
    (source.serverUrl.protocol === "http:" || source.serverUrl.protocol === "https:")
  ) {
    const version = await resolveServerHealthVersion(source.serverUrl);
    return version === undefined
      ? { available: false }
      : { available: true, version };
  }
  return { available: false };
}

export function assertSupportedHost(capability: HostVersionCapability): void {
  if (!capability.available) {
    throw new UnsupportedOpenCodeVersionError(
      "cloudflare-ai-gateway-chatgpt: could not verify host" +
        " version capability. Activation rejected; ChatGPT Codex requests" +
        " will fail closed instead of bypassing the AI Gateway.",
    );
  }
  if (!satisfies(capability.version, SUPPORTED_OPENCODE_RANGE)) {
    throw new UnsupportedOpenCodeVersionError(
      `cloudflare-ai-gateway-chatgpt: unsupported OpenCode version ` +
        `${capability.version}. Supported range: ` +
        `${SUPPORTED_OPENCODE_RANGE}.`,
    );
  }
}
