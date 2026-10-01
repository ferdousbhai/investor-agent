import { defineWranglerConfig } from "wrangler/experimental-config";

export default defineWranglerConfig({
  // Polyfill __dirname for CJS dependencies (e.g. @deno/shim-deno via yahoo-finance2)
  define: {
    __dirname: "\"/\"",
  },
  types: {
    generate: false,
  },
});
