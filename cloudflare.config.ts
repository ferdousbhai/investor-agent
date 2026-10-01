import { defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    name: "investor-agent",
    compatibilityDate: "2026-02-20",
    compatibilityFlags: ["nodejs_compat"],
    entrypoint: "src/worker.ts",
    previewUrls: true,
    observability: {
      enabled: true,
    },
  },
});
