import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertSupportedHost,
  OPENCODE_SERVER_HEALTH_PATHNAME,
  resolveHostVersionCapability,
  resolveHostVersionCapabilityAsync,
  SUPPORTED_OPENCODE_RANGE,
} from "../src/host-version.js";
import { UnsupportedOpenCodeVersionError } from "../src/errors.js";

const SERVER_URL = new URL("https://opencode.test");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveHostVersionCapability", () => {
  it("reads input.opencode.version", () => {
    expect(resolveHostVersionCapability({ opencode: { version: "1.19.0" } })).toEqual({
      available: true,
      version: "1.19.0",
    });
  });

  it("reads a string input.opencode", () => {
    expect(resolveHostVersionCapability({ opencode: "1.20.1" })).toEqual({
      available: true,
      version: "1.20.1",
    });
  });

  it("reads input.host.version and input.version as fallbacks", () => {
    expect(resolveHostVersionCapability({ host: { version: "1.19.2" } })).toEqual({
      available: true,
      version: "1.19.2",
    });
    expect(resolveHostVersionCapability({ version: "2.0.0" })).toEqual({
      available: true,
      version: "2.0.0",
    });
  });

  it("reads the host version from the official server health endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ healthy: true, version: "1.18.29" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    await expect(
      resolveHostVersionCapabilityAsync({ serverUrl: SERVER_URL }),
    ).resolves.toEqual({
      available: true,
      version: "1.18.29",
    });
    expect(OPENCODE_SERVER_HEALTH_PATHNAME).toBe("/global/health");
  });

  it("rejects a non-HTTP server URL before fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      resolveHostVersionCapabilityAsync({ serverUrl: new URL("file:///tmp/opencode") }),
    ).resolves.toEqual({ available: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses a timeout and rejects redirects for the health request", async () => {
    let requestInit: RequestInit | undefined;
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestInit = init;
      return new Response(JSON.stringify({ healthy: true, version: "1.18.29" }), {
        status: 200,
      });
    });

    await expect(
      resolveHostVersionCapabilityAsync({ serverUrl: SERVER_URL }),
    ).resolves.toEqual({ available: true, version: "1.18.29" });
    expect(requestInit?.redirect).toBe("error");
    expect(requestInit?.signal).toBeInstanceOf(AbortSignal);
  });

  it("does not use legacy version fields without the official health capability", async () => {
    await expect(
      resolveHostVersionCapabilityAsync({
        opencode: { version: "1.18.29" },
      }),
    ).resolves.toEqual({ available: false });
  });

  it("reports absent when no candidate holds a valid semver string", () => {
    expect(resolveHostVersionCapability({})).toEqual({ available: false });
    expect(resolveHostVersionCapability({ opencode: { version: "not-semver" } })).toEqual({
      available: false,
    });
    expect(resolveHostVersionCapability(undefined)).toEqual({
      available: false,
    });
  });

  it("reports absent when the health response has no valid version", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ healthy: true, version: "not-semver" }), {
          status: 200,
        }),
    );

    await expect(
      resolveHostVersionCapabilityAsync({ serverUrl: SERVER_URL }),
    ).resolves.toEqual({
      available: false,
    });
  });
});

describe("assertSupportedHost", () => {
  it("throws when the capability is absent", () => {
    expect(() => assertSupportedHost({ available: false })).toThrow(
      UnsupportedOpenCodeVersionError,
    );
  });

  it("throws for versions outside the supported range", () => {
    expect(() =>
      assertSupportedHost({ available: true, version: "1.18.19" }),
    ).toThrow(UnsupportedOpenCodeVersionError);
    expect(() =>
      assertSupportedHost({ available: true, version: "2.1.0" }),
    ).toThrow(UnsupportedOpenCodeVersionError);
  });

  it("accepts boundary versions of the range", () => {
    expect(() =>
      assertSupportedHost({ available: true, version: "1.18.20" }),
    ).not.toThrow();
    expect(() =>
      assertSupportedHost({ available: true, version: "1.99.9" }),
    ).not.toThrow();
  });

  it("keeps the range constant in sync with the documented value", () => {
    expect(SUPPORTED_OPENCODE_RANGE).toBe(">=1.18.20 <2");
  });
});
