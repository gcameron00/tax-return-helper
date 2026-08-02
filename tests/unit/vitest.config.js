import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "unit",
    environment: "jsdom",
    include: ["**/*.test.js"],
    root: import.meta.dirname
  }
});
