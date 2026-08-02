import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../assets/js/store.js";

const TRH = window.TRH;

function jsonResponse(body, ok = true, status = ok ? 200 : 500) {
  return Promise.resolve({
    ok,
    status,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve(body)
  });
}

beforeEach(() => {
  localStorage.clear();
  TRH.onSyncError = function () {};
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TRH.load", () => {
  it("fetches /api/state, caches it, and reports not offline", async () => {
    const state = { schemaVersion: 1, household: "H", people: [], years: [] };
    const fetchMock = vi.fn(() => jsonResponse(state));
    vi.stubGlobal("fetch", fetchMock);

    const result = await TRH.load();
    expect(result.offline).toBe(false);
    expect(result.state).toEqual(state);
    expect(fetchMock).toHaveBeenCalledWith("/api/state", expect.objectContaining({ method: "GET" }));
    expect(JSON.parse(localStorage.getItem("trh.cache.v1"))).toEqual(state);
  });

  it("falls back to the cache and reports offline when the network fails", async () => {
    const cached = { schemaVersion: 1, household: "H", people: [], years: [{ taxYear: 2025 }] };
    localStorage.setItem("trh.cache.v1", JSON.stringify(cached));
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network down")))
    );

    const result = await TRH.load();
    expect(result.offline).toBe(true);
    expect(result.state).toEqual(cached);
  });

  it("rejects when the network fails and nothing is cached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network down")))
    );
    await expect(TRH.load()).rejects.toThrow();
  });
});

describe("TRH.applyPatch", () => {
  it("mutates the target immediately, before the network settles", () => {
    var deferred;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            deferred = resolve;
          })
      )
    );
    var state = { years: [] };
    var item = { id: "it_1", status: "outstanding" };

    TRH.applyPatch(state, item, { status: "received" }, "/items/it_1");
    expect(item.status).toBe("received"); // already applied, synchronously
  });

  it("merges the server's response over the optimistic value on success", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({ id: "it_1", status: "received", comment: "server-side" })));
    var state = { years: [] };
    var item = { id: "it_1", status: "outstanding", comment: "" };

    await TRH.applyPatch(state, item, { status: "received" }, "/items/it_1");
    expect(item.status).toBe("received");
    expect(item.comment).toBe("server-side");
  });

  it("rolls back and calls TRH.onSyncError when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({ error: "Year is final" }, false, 409)));
    var state = { years: [] };
    var item = { id: "it_1", status: "outstanding" };
    var onSyncError = vi.fn();
    TRH.onSyncError = onSyncError;

    await TRH.applyPatch(state, item, { status: "received" }, "/items/it_1");
    expect(item.status).toBe("outstanding"); // rolled back
    expect(onSyncError).toHaveBeenCalledTimes(1);
  });

  it("never rejects — TRH.onSyncError is the only failure signal", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    var state = { years: [] };
    var item = { id: "it_1", status: "outstanding" };
    await expect(TRH.applyPatch(state, item, { status: "received" }, "/items/it_1")).resolves.toBeDefined();
  });
});

describe("create/delete helpers hit the right endpoint", () => {
  it("TRH.createItem POSTs to the category's items route", async () => {
    const fetchMock = vi.fn(() => jsonResponse({ id: "it_1" }));
    vi.stubGlobal("fetch", fetchMock);
    await TRH.createItem("cat_1", { name: "X" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/categories/cat_1/items",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "X" }) })
    );
  });

  it("TRH.deleteCategory DELETEs the category route", async () => {
    const fetchMock = vi.fn(() => jsonResponse(null));
    vi.stubGlobal("fetch", fetchMock);
    await TRH.deleteCategory("cat_1");
    expect(fetchMock).toHaveBeenCalledWith("/api/categories/cat_1", expect.objectContaining({ method: "DELETE" }));
  });

  it("TRH.moveItem PATCHes categoryId", async () => {
    const fetchMock = vi.fn(() => jsonResponse({ id: "it_1", categoryId: "cat_2" }));
    vi.stubGlobal("fetch", fetchMock);
    await TRH.moveItem("it_1", "cat_2");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/items/it_1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ categoryId: "cat_2" }) })
    );
  });
});
