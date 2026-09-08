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
      engines: { opencode: string };
    };
    expect(pkg.engines.opencode).toBe(SUPPORTED_OPENCODE_RANGE);
    expect(SUPPORTED_OPENCODE_RANGE).toBe(">=1.19.0 <2");
  });
});
