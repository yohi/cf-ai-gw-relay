import { describe, expect, it } from "vitest";
import {
  assertSupportedHost,
  resolveHostVersionCapability,
  resolveHostVersionCapabilityAsync,
  SUPPORTED_OPENCODE_RANGE,
} from "../src/host-version.js";
import { UnsupportedOpenCodeVersionError } from "../src/errors.js";

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

  it("reads the host version from client.global.health", async () => {
    const input = {
      client: {
        global: {
          health: async () => ({ data: { version: "1.19.0" } }),
        },
      },
    };

    await expect(resolveHostVersionCapabilityAsync(input)).resolves.toEqual({
      available: true,
      version: "1.19.0",
    });
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
    const input = {
      client: {
        global: {
          health: async () => ({ data: { version: "not-semver" } }),
        },
      },
    };

    await expect(resolveHostVersionCapabilityAsync(input)).resolves.toEqual({
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
      assertSupportedHost({ available: true, version: "1.19.0" }),
    ).not.toThrow();
    expect(() =>
      assertSupportedHost({ available: true, version: "1.99.9" }),
    ).not.toThrow();
  });

  it("keeps the range constant in sync with the documented value", () => {
    expect(SUPPORTED_OPENCODE_RANGE).toBe(">=1.19.0 <2");
  });
});
