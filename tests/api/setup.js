import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach } from "vitest";

// D1 storage is not reset between tests automatically, so each test starts
// by making sure the schema exists (idempotent) and wiping any rows left
// over from the previous test. tax_years cascades to categories/items.
beforeEach(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM tax_years"),
    env.DB.prepare("DELETE FROM people")
  ]);
});
