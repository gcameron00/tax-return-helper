import { defineConfig } from "vitest/config";

// Two projects with different runtimes: pure-function unit tests run under
// jsdom (fast, no Workers runtime needed); API tests run inside the actual
// Workers runtime via @cloudflare/vitest-pool-workers, against a real D1
// binding. See docs/implementation-plan.md, cross-cutting/Testing.
export default defineConfig({
  test: {
    projects: ["tests/unit/vitest.config.js", "tests/api/vitest.config.js"]
  }
});
