import { defineConfig } from "@neon/config/v1";

// This config is local to the PoC folder. Do not deploy the repository root.
export default defineConfig({
  functions: {
    xmock: {
      name: "X OAuth Gateway infrastructure PoC (MOCK ONLY)",
      source: "./src/index.ts",
    },
  },
});
