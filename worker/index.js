/* ==========================================================================
   worker/index.js — the API, in front of the static assets.

   Routes as specified in docs/data-model.md#planned-api-shape. Two rules
   enforced here because the front-end's locks are UI-only:
     - writes to a category/item inside a `final` year are rejected (409)
     - `taxYear` is unique (409 on duplicate creation)

   Conflict policy is silent last-write-wins (docs/implementation-plan.md
   2.2): `items.updated_at` is stamped on every write for future debugging,
   but a write is never rejected because something changed underneath it.
   ========================================================================== */

const HOUSEHOLD = "Cameron household";
const SCHEMA_VERSION = 1;
const STATUSES = new Set(["outstanding", "requested", "received", "na"]);

function uid(prefix) {
  return prefix + "_" + crypto.randomUUID().replace(/-/g, "").slice(0, 20);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function json(data, status) {
  return new Response(data === null ? null : JSON.stringify(data), {
    status: status || 200,
    headers: data === null ? {} : { "content-type": "application/json" }
  });
}

function error(status, message) {
  return json({ error: message }, status);
}

async function readBody(request) {
  try {
    return (await request.json()) || {};
  } catch (e) {
    return null;
  }
}

/* --- Derived values (mirrors TRH.tally in assets/js/store.js) ----------- */

function tally(items) {
  var total = items.length;
  var na = items.filter(function (i) {
    return i.status === "na";
  }).length;
  var received = items.filter(function (i) {
    return i.status === "received";
  }).length;
  var relevant = total - na;
  return relevant === 0 ? 100 : Math.round((received / relevant) * 100);
}

/* --- Reads ---------------------------------------------------------------- */

async function loadPeople(env) {
  var r = await env.DB.prepare("SELECT id, name, initials FROM people ORDER BY name").all();
  return r.results;
}

async function loadYearsSummary(env) {
  var years = await env.DB.prepare(
    "SELECT tax_year, status FROM tax_years ORDER BY tax_year DESC"
  ).all();
  var out = [];
  for (var i = 0; i < years.results.length; i++) {
    var y = years.results[i];
    var items = await env.DB.prepare(
      "SELECT i.status FROM items i JOIN categories c ON c.id = i.category_id WHERE c.tax_year = ?"
    ).bind(y.tax_year).all();
    out.push({ taxYear: y.tax_year, status: y.status, percent: tally(items.results) });
  }
  return out;
}

async function loadYearFull(env, taxYear) {
  var yearRow = await env.DB.prepare(
    "SELECT tax_year, status, created_at, finalized_at, note FROM tax_years WHERE tax_year = ?"
  ).bind(taxYear).first();
  if (!yearRow) return null;

  var catRows = await env.DB.prepare(
    "SELECT id, name, collapsed FROM categories WHERE tax_year = ? ORDER BY rowid"
  ).bind(taxYear).all();
  var itemRows = await env.DB.prepare(
    "SELECT i.id, i.category_id, i.name, i.owner_id, i.status, i.comment " +
      "FROM items i JOIN categories c ON c.id = i.category_id " +
      "WHERE c.tax_year = ? ORDER BY i.rowid"
  ).bind(taxYear).all();

  var itemsByCat = {};
  itemRows.results.forEach(function (row) {
    (itemsByCat[row.category_id] = itemsByCat[row.category_id] || []).push({
      id: row.id,
      name: row.name,
      ownerId: row.owner_id,
      status: row.status,
      comment: row.comment
    });
  });

  return {
    taxYear: yearRow.tax_year,
    status: yearRow.status,
    createdAt: yearRow.created_at,
    finalizedAt: yearRow.finalized_at,
    note: yearRow.note,
    categories: catRows.results.map(function (c) {
      return {
        id: c.id,
        name: c.name,
        collapsed: !!c.collapsed,
        items: itemsByCat[c.id] || []
      };
    })
  };
}

async function loadState(env) {
  var summaries = await env.DB.prepare(
    "SELECT tax_year FROM tax_years ORDER BY tax_year DESC"
  ).all();
  var years = [];
  for (var i = 0; i < summaries.results.length; i++) {
    years.push(await loadYearFull(env, summaries.results[i].tax_year));
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    household: HOUSEHOLD,
    people: await loadPeople(env),
    years: years
  };
}

/* --- Lock check ------------------------------------------------------------
   A category/item mutation is rejected if the year it belongs to is final.
   PATCH /api/years/:taxYear is exempt — it is how a year gets reopened. */

async function categoryYear(env, categoryId) {
  return env.DB.prepare(
    "SELECT t.tax_year AS taxYear, t.status FROM categories c " +
      "JOIN tax_years t ON t.tax_year = c.tax_year WHERE c.id = ?"
  ).bind(categoryId).first();
}

async function itemYear(env, itemId) {
  return env.DB.prepare(
    "SELECT t.tax_year AS taxYear, t.status FROM items i " +
      "JOIN categories c ON c.id = i.category_id " +
      "JOIN tax_years t ON t.tax_year = c.tax_year WHERE i.id = ?"
  ).bind(itemId).first();
}

/* --- Handlers --------------------------------------------------------------- */

async function createYear(request, env) {
  var body = await readBody(request);
  if (!body || !Number.isInteger(body.taxYear)) return error(400, "taxYear (integer) is required");

  var exists = await env.DB.prepare("SELECT 1 FROM tax_years WHERE tax_year = ?")
    .bind(body.taxYear)
    .first();
  if (exists) return error(409, "taxYear " + body.taxYear + " already exists");

  var sourceCats = [];
  var sourceItems = [];
  if (body.fromYear != null) {
    var source = await env.DB.prepare("SELECT 1 FROM tax_years WHERE tax_year = ?")
      .bind(body.fromYear)
      .first();
    if (!source) return error(404, "fromYear " + body.fromYear + " not found");
    sourceCats = (
      await env.DB.prepare("SELECT id, name FROM categories WHERE tax_year = ? ORDER BY rowid")
        .bind(body.fromYear)
        .all()
    ).results;
    sourceItems = (
      await env.DB.prepare(
        "SELECT i.category_id, i.name, i.owner_id, i.status, i.comment FROM items i " +
          "JOIN categories c ON c.id = i.category_id WHERE c.tax_year = ? ORDER BY i.rowid"
      )
        .bind(body.fromYear)
        .all()
    ).results;
  }

  var note = body.fromYear != null ? "Carried over from " + body.fromYear + "." : "";
  var stmts = [
    env.DB.prepare(
      "INSERT INTO tax_years (tax_year, status, created_at, finalized_at, note) VALUES (?, 'open', ?, NULL, ?)"
    ).bind(body.taxYear, today(), note)
  ];

  var skipNa = body.skipNa !== false; // default on, matches TRH.carryOver
  var keepComments = !!body.keepComments; // default off
  var catIdMap = {};
  sourceCats.forEach(function (c) {
    var newId = uid("cat");
    catIdMap[c.id] = newId;
    stmts.push(
      env.DB.prepare("INSERT INTO categories (id, tax_year, name, collapsed) VALUES (?, ?, ?, 0)").bind(
        newId,
        body.taxYear,
        c.name
      )
    );
  });
  sourceItems.forEach(function (i) {
    if (skipNa && i.status === "na") return;
    var newCatId = catIdMap[i.category_id];
    if (!newCatId) return;
    stmts.push(
      env.DB.prepare(
        "INSERT INTO items (id, category_id, name, owner_id, status, comment, updated_at) " +
          "VALUES (?, ?, ?, ?, 'outstanding', ?, ?)"
      ).bind(uid("it"), newCatId, i.name, i.owner_id, keepComments ? i.comment : "", new Date().toISOString())
    );
  });

  await env.DB.batch(stmts);
  return json(await loadYearFull(env, body.taxYear), 201);
}

async function patchYear(taxYear, request, env) {
  var body = await readBody(request);
  if (!body) return error(400, "Invalid JSON body");
  var row = await env.DB.prepare("SELECT tax_year FROM tax_years WHERE tax_year = ?").bind(taxYear).first();
  if (!row) return error(404, "Year not found");

  if (body.status !== undefined) {
    if (body.status !== "final" && body.status !== "open") return error(400, "status must be 'final' or 'open'");
    await env.DB.prepare(
      "UPDATE tax_years SET status = ?, finalized_at = ? WHERE tax_year = ?"
    ).bind(body.status, body.status === "final" ? new Date().toISOString() : null, taxYear).run();
  }
  if (body.note !== undefined) {
    await env.DB.prepare("UPDATE tax_years SET note = ? WHERE tax_year = ?").bind(body.note, taxYear).run();
  }
  return json(await loadYearFull(env, taxYear));
}

async function createCategory(taxYear, request, env) {
  var year = await env.DB.prepare("SELECT status FROM tax_years WHERE tax_year = ?").bind(taxYear).first();
  if (!year) return error(404, "Year not found");
  if (year.status === "final") return error(409, "Year " + taxYear + " is final");

  var body = await readBody(request);
  if (!body || !body.name) return error(400, "name is required");

  var id = uid("cat");
  await env.DB.prepare("INSERT INTO categories (id, tax_year, name, collapsed) VALUES (?, ?, ?, 0)")
    .bind(id, taxYear, body.name)
    .run();
  return json({ id: id, name: body.name, collapsed: false, items: [] }, 201);
}

async function patchCategory(id, request, env) {
  var loc = await categoryYear(env, id);
  if (!loc) return error(404, "Category not found");
  if (loc.status === "final") return error(409, "Year " + loc.taxYear + " is final");

  var body = await readBody(request);
  if (!body || !body.name) return error(400, "name is required");

  await env.DB.prepare("UPDATE categories SET name = ? WHERE id = ?").bind(body.name, id).run();
  var row = await env.DB.prepare("SELECT id, name, collapsed FROM categories WHERE id = ?").bind(id).first();
  return json({ id: row.id, name: row.name, collapsed: !!row.collapsed });
}

async function deleteCategory(id, env) {
  var loc = await categoryYear(env, id);
  if (!loc) return error(404, "Category not found");
  if (loc.status === "final") return error(409, "Year " + loc.taxYear + " is final");

  await env.DB.prepare("DELETE FROM categories WHERE id = ?").bind(id).run();
  return json(null, 204);
}

async function createItem(categoryId, request, env) {
  var loc = await categoryYear(env, categoryId);
  if (!loc) return error(404, "Category not found");
  if (loc.status === "final") return error(409, "Year " + loc.taxYear + " is final");

  var body = await readBody(request);
  if (!body || typeof body.name !== "string") return error(400, "name is required");
  if (body.status !== undefined && !STATUSES.has(body.status)) return error(400, "Invalid status");

  var id = uid("it");
  var status = body.status || "outstanding";
  var comment = body.comment || "";
  var ownerId = body.ownerId || null;
  var updatedAt = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO items (id, category_id, name, owner_id, status, comment, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, categoryId, body.name, ownerId, status, comment, updatedAt).run();

  return json(
    { id: id, name: body.name, ownerId: ownerId, status: status, comment: comment },
    201
  );
}

async function patchItem(id, request, env) {
  var loc = await itemYear(env, id);
  if (!loc) return error(404, "Item not found");
  if (loc.status === "final") return error(409, "Year " + loc.taxYear + " is final");

  var body = await readBody(request);
  if (!body) return error(400, "Invalid JSON body");
  if (body.status !== undefined && !STATUSES.has(body.status)) return error(400, "Invalid status");

  if (body.categoryId !== undefined) {
    var target = await categoryYear(env, body.categoryId);
    if (!target) return error(404, "Target category not found");
    if (target.taxYear !== loc.taxYear) return error(400, "Cannot move an item to a different tax year");
  }

  var fields = [];
  var values = [];
  if (body.name !== undefined) {
    fields.push("name = ?");
    values.push(body.name);
  }
  if (body.ownerId !== undefined) {
    fields.push("owner_id = ?");
    values.push(body.ownerId);
  }
  if (body.status !== undefined) {
    fields.push("status = ?");
    values.push(body.status);
  }
  if (body.comment !== undefined) {
    fields.push("comment = ?");
    values.push(body.comment);
  }
  if (body.categoryId !== undefined) {
    fields.push("category_id = ?");
    values.push(body.categoryId);
  }
  fields.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(id);

  var stmt = env.DB.prepare("UPDATE items SET " + fields.join(", ") + " WHERE id = ?");
  await stmt.bind.apply(stmt, values).run();

  var row = await env.DB.prepare(
    "SELECT id, name, owner_id, status, comment, category_id FROM items WHERE id = ?"
  ).bind(id).first();
  return json({
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    status: row.status,
    comment: row.comment,
    categoryId: row.category_id
  });
}

async function deleteItem(id, env) {
  var loc = await itemYear(env, id);
  if (!loc) return error(404, "Item not found");
  if (loc.status === "final") return error(409, "Year " + loc.taxYear + " is final");

  await env.DB.prepare("DELETE FROM items WHERE id = ?").bind(id).run();
  return json(null, 204);
}

/* --- Router ------------------------------------------------------------- */

async function routeApi(request, url, env) {
  var method = request.method;
  var path = url.pathname;
  var m;

  if (path === "/api/state" && method === "GET") return json(await loadState(env));
  if (path === "/api/years" && method === "GET") return json(await loadYearsSummary(env));
  if (path === "/api/years" && method === "POST") return createYear(request, env);

  if ((m = path.match(/^\/api\/years\/(\d+)$/))) {
    var taxYear = Number(m[1]);
    if (method === "GET") {
      var y = await loadYearFull(env, taxYear);
      return y ? json(y) : error(404, "Year not found");
    }
    if (method === "PATCH") return patchYear(taxYear, request, env);
  }

  if ((m = path.match(/^\/api\/years\/(\d+)\/categories$/)) && method === "POST") {
    return createCategory(Number(m[1]), request, env);
  }

  if ((m = path.match(/^\/api\/categories\/([^/]+)$/))) {
    if (method === "PATCH") return patchCategory(m[1], request, env);
    if (method === "DELETE") return deleteCategory(m[1], env);
  }

  if ((m = path.match(/^\/api\/categories\/([^/]+)\/items$/)) && method === "POST") {
    return createItem(m[1], request, env);
  }

  if ((m = path.match(/^\/api\/items\/([^/]+)$/))) {
    if (method === "PATCH") return patchItem(m[1], request, env);
    if (method === "DELETE") return deleteItem(m[1], env);
  }

  return error(404, "Not found");
}

export default {
  async fetch(request, env, ctx) {
    var url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await routeApi(request, url, env);
      } catch (err) {
        console.error(err);
        return error(500, "Internal error");
      }
    }
    return env.ASSETS.fetch(request);
  }
};
