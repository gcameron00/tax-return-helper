import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

async function api(method, path, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const ctx = createExecutionContext();
  const res = await exports.default.fetch(new Request("http://x" + path, init), env, ctx);
  await waitOnExecutionContext(ctx);
  const text = await res.text();
  const contentType = res.headers.get("content-type") || "";
  const parsed = text && contentType.includes("application/json") ? JSON.parse(text) : text || null;
  return { status: res.status, body: parsed };
}

describe("years", () => {
  it("creates an empty year", async () => {
    const res = await api("POST", "/api/years", { taxYear: 2025 });
    expect(res.status).toBe(201);
    expect(res.body.taxYear).toBe(2025);
    expect(res.body.status).toBe("open");
    expect(res.body.categories).toEqual([]);
  });

  it("rejects a duplicate taxYear with 409", async () => {
    await api("POST", "/api/years", { taxYear: 2025 });
    const res = await api("POST", "/api/years", { taxYear: 2025 });
    expect(res.status).toBe(409);
  });

  it("carries over categories and items, resetting status and dropping na/comments by default", async () => {
    await api("POST", "/api/years", { taxYear: 2024 });
    const cat = await api("POST", "/api/years/2024/categories", { name: "Bank accounts" });
    await api("POST", `/api/categories/${cat.body.id}/items`, {
      name: "Statement",
      status: "received",
      comment: "filed"
    });
    await api("POST", `/api/categories/${cat.body.id}/items`, { name: "Old doc", status: "na" });

    const res = await api("POST", "/api/years", { taxYear: 2025, fromYear: 2024 });
    expect(res.status).toBe(201);
    expect(res.body.categories).toHaveLength(1);
    const items = res.body.categories[0].items;
    expect(items.map((i) => i.name)).toEqual(["Statement"]); // na dropped
    expect(items[0].status).toBe("outstanding"); // reset
    expect(items[0].comment).toBe(""); // dropped by default
  });

  it("lists years with computed percent", async () => {
    await api("POST", "/api/years", { taxYear: 2025 });
    const cat = await api("POST", "/api/years/2025/categories", { name: "Salary" });
    await api("POST", `/api/categories/${cat.body.id}/items`, { name: "A", status: "received" });
    await api("POST", `/api/categories/${cat.body.id}/items`, { name: "B", status: "outstanding" });

    const res = await api("GET", "/api/years");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ taxYear: 2025, status: "open", percent: 50 }]);
  });
});

describe("the final-year lock", () => {
  async function finalYear() {
    await api("POST", "/api/years", { taxYear: 2025 });
    const cat = await api("POST", "/api/years/2025/categories", { name: "Salary" });
    await api("PATCH", "/api/years/2025", { status: "final" });
    return cat.body.id;
  }

  it("rejects creating a category in a final year", async () => {
    await finalYear();
    const res = await api("POST", "/api/years/2025/categories", { name: "New" });
    expect(res.status).toBe(409);
  });

  it("rejects creating, editing, and deleting items in a final year", async () => {
    const catId = await finalYear();
    expect((await api("POST", `/api/categories/${catId}/items`, { name: "X" })).status).toBe(409);
  });

  it("still allows reopening the year itself", async () => {
    await finalYear();
    const res = await api("PATCH", "/api/years/2025", { status: "open" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("open");
    expect(res.body.finalizedAt).toBeNull();

    // and now mutation works again
    const cat = await api("POST", "/api/years/2025/categories", { name: "New" });
    expect(cat.status).toBe(201);
  });
});

describe("items", () => {
  let categoryId;

  beforeEach(async () => {
    await api("POST", "/api/years", { taxYear: 2025 });
    const cat = await api("POST", "/api/years/2025/categories", { name: "Salary" });
    categoryId = cat.body.id;
  });

  it("creates an item with defaults", async () => {
    const res = await api("POST", `/api/categories/${categoryId}/items`, { name: "Lohnausweis" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("outstanding");
    expect(res.body.comment).toBe("");
    expect(res.body.ownerId).toBeNull();
  });

  it("rejects an invalid status", async () => {
    const res = await api("POST", `/api/categories/${categoryId}/items`, {
      name: "X",
      status: "done"
    });
    expect(res.status).toBe(400);
  });

  it("patches only the given fields", async () => {
    const created = await api("POST", `/api/categories/${categoryId}/items`, { name: "X" });
    const res = await api("PATCH", `/api/items/${created.body.id}`, { status: "received" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("received");
    expect(res.body.name).toBe("X"); // untouched
  });

  it("deletes an item", async () => {
    const created = await api("POST", `/api/categories/${categoryId}/items`, { name: "X" });
    const del = await api("DELETE", `/api/items/${created.body.id}`);
    expect(del.status).toBe(204);
    const patched = await api("PATCH", `/api/items/${created.body.id}`, { status: "received" });
    expect(patched.status).toBe(404);
  });
});

describe("GET /api/state", () => {
  it("returns the whole document, years newest first", async () => {
    await api("POST", "/api/years", { taxYear: 2024 });
    await api("POST", "/api/years", { taxYear: 2025 });
    const res = await api("GET", "/api/state");
    expect(res.status).toBe(200);
    expect(res.body.schemaVersion).toBe(1);
    expect(res.body.years.map((y) => y.taxYear)).toEqual([2025, 2024]);
  });
});

describe("static assets", () => {
  it("falls through to the assets binding for non-API routes", async () => {
    const res = await api("GET", "/about/");
    expect(res.status).toBe(200);
  });
});
