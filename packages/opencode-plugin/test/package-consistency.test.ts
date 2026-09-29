import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { SUPPORTED_OPENCODE_RANGE } from "../src/host-version.js";

describe("package metadata consistency", () => {
  it("keeps engines.opencode in sync with the range", async () => {
    const raw = await readFile(
      new URL("../package.json", import.meta.url),
      "utf8",
    );
    const pkg = JSON.parse(raw) as {
      name: string;
      peerDependencies: {
        "@opencode-ai/plugin": string;
        opencode?: string;
      };
      devDependencies: {
        "@opencode-ai/plugin": string;
      };
      engines: { opencode: string };
      dependencies: Record<string, string>;
    };
    expect(pkg.name).toBe("@yohi/cf-ai-gw-relay");
    expect(pkg.peerDependencies["@opencode-ai/plugin"]).toBe(">=1.18.31 <1.18.32");
    expect(pkg.peerDependencies.opencode).toBeUndefined();
    expect(pkg.devDependencies["@opencode-ai/plugin"]).toBe("1.18.31");
    expect(pkg.engines.opencode).toBe(SUPPORTED_OPENCODE_RANGE);
    expect(SUPPORTED_OPENCODE_RANGE).toBe("1.18.31");
    expect(Object.keys(pkg.dependencies)).toEqual(["semver"]);
    expect(pkg.dependencies["@ai-sdk/openai"]).toBeUndefined();
  });
});
