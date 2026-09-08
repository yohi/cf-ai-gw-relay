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
      peerDependencies: {
        "@opencode-ai/plugin": string;
        opencode?: string;
      };
      engines: { opencode: string };
    };
    expect(pkg.peerDependencies["@opencode-ai/plugin"]).toBe(">=1.18.20");
    expect(pkg.peerDependencies.opencode).toBeUndefined();
    expect(pkg.engines.opencode).toBe(SUPPORTED_OPENCODE_RANGE);
    expect(SUPPORTED_OPENCODE_RANGE).toBe(">=1.19.0 <2");
  });
});
