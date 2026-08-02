import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const migrations = await readD1Migrations(
  fileURLToPath(new URL("../../migrations", import.meta.url))
);

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "../../wrangler.toml" },
      miniflare: {
        bindings: { TEST_MIGRATIONS: migrations }
      }
    })
  ],
  test: {
    name: "api",
    include: ["**/*.test.js"],
    root: import.meta.dirname,
    setupFiles: ["./setup.js"]
  }
});
