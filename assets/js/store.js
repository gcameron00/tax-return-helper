/* ==========================================================================
   store.js — data model, seed data and the backend seam.

   Phase 2.4: the checklist lives in D1, behind the API in worker/index.js.
   Everything that reaches the server goes through the functions in the
   "Backend seam" section at the bottom of this file — nothing else in the
   app touches `fetch`. A copy of the last-loaded state is cached to
   localStorage so a stale, read-only view is possible offline (see
   TRH.load); it is a cache of the server, not a second source of truth.
   ========================================================================== */

window.TRH = window.TRH || {};

(function (TRH) {
  "use strict";

  var CACHE_KEY = "trh.cache.v1";
  var SCHEMA_VERSION = 1;

  /* --- Vocabularies ------------------------------------------------------ */

  // Order matters: this is the order statuses appear in filters and editors.
  TRH.STATUSES = [
    { id: "outstanding", label: "Outstanding", short: "Outstanding" },
    { id: "requested", label: "Requested", short: "Requested" },
    { id: "received", label: "Received", short: "Received" },
    { id: "na", label: "Not applicable", short: "N/A" }
  ];

  TRH.STATUS_BY_ID = TRH.STATUSES.reduce(function (m, s) {
    m[s.id] = s;
    return m;
  }, {});

  // Avatar colours are derived from the person's id, so a person keeps the
  // same colour everywhere without a colour being stored on the record.
  var AVATAR_COLORS = [
    "#4c6ef5",
    "#0b7a5b",
    "#9a3412",
    "#6d28d9",
    "#0e7490",
    "#a16207"
  ];

  TRH.avatarColor = function (person) {
    if (!person) return "#6b6b74";
    var h = 0;
    for (var i = 0; i < person.id.length; i++) {
      h = (h * 31 + person.id.charCodeAt(i)) >>> 0;
    }
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  };

  TRH.initials = function (name) {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map(function (w) {
        return w.charAt(0);
      })
      .join("")
      .toUpperCase();
  };

  /* --- IDs --------------------------------------------------------------- */

  var idCounter = 0;

  TRH.uid = function (prefix) {
    idCounter += 1;
    return (
      (prefix || "id") +
      "_" +
      Date.now().toString(36) +
      "_" +
      idCounter.toString(36)
    );
  };

  /* --- Seed -------------------------------------------------------------- */

  var PEOPLE = [
    { id: "p_anna", name: "Anna" },
    { id: "p_daniel", name: "Daniel" },
    { id: "p_joint", name: "Joint" },
    { id: "p_kids", name: "Children" }
  ];

  // The template a fresh install starts from. [name, ownerId, status, comment]
  var TEMPLATE = [
    [
      "Personal & household",
      [
        ["Tax return access code (eSteuerkonto login)", "p_joint", "received", ""],
        ["Confirmation of residence / commune registration", "p_joint", "received", ""],
        ["Changes in family status during the year", "p_joint", "na", "No changes in 2025"]
      ]
    ],
    [
      "Salary & employment",
      [
        ["Lohnausweis (salary certificate)", "p_anna", "received", ""],
        ["Lohnausweis (salary certificate)", "p_daniel", "requested", "HR said end of February"],
        ["Expense allowance regulations (Spesenreglement)", "p_daniel", "outstanding", ""],
        ["Board / director fee statement", "p_daniel", "na", ""],
        ["Unemployment or daily allowance statements", "p_joint", "na", ""]
      ]
    ],
    [
      "Bank accounts & securities",
      [
        ["Year-end statement — joint current account", "p_joint", "received", ""],
        ["Year-end statement — salary account", "p_anna", "received", ""],
        ["Year-end statement — salary account", "p_daniel", "outstanding", ""],
        ["Interest & tax statement (Zinsausweis), all accounts", "p_joint", "requested", "Ordered via e-banking on 14 Jan"],
        ["Securities depot statement (Depotauszug)", "p_joint", "outstanding", ""],
        ["Youth savings accounts — year-end balances", "p_kids", "outstanding", "One per child"],
        ["Crypto holdings — 31 December valuation", "p_daniel", "outstanding", "Export from exchange + wallet"]
      ]
    ],
    [
      "Property & mortgage",
      [
        ["Mortgage interest statement (Hypothekarzinsausweis)", "p_joint", "received", ""],
        ["Mortgage balance at 31 December", "p_joint", "received", ""],
        ["Official property tax value (Steuerwert)", "p_joint", "outstanding", "Same as last year unless reassessed"],
        ["Imputed rental value (Eigenmietwert) notice", "p_joint", "outstanding", ""],
        ["Maintenance & renovation invoices", "p_joint", "requested", "Bathroom refit — collect all invoices"],
        ["Building insurance premium (Gebäudeversicherung)", "p_joint", "outstanding", ""]
      ]
    ],
    [
      "Pensions & insurance",
      [
        ["Pillar 3a contribution certificate", "p_anna", "received", ""],
        ["Pillar 3a contribution certificate", "p_daniel", "received", ""],
        ["Pension fund (2nd pillar) certificate", "p_anna", "outstanding", ""],
        ["Pension fund (2nd pillar) certificate", "p_daniel", "outstanding", ""],
        ["Voluntary pension buy-in confirmation", "p_daniel", "requested", "CHF 10'000 buy-in in October"],
        ["Health insurance premium statement", "p_joint", "outstanding", ""],
        ["Health insurance — out-of-pocket cost statement", "p_joint", "outstanding", ""]
      ]
    ],
    [
      "Deductions",
      [
        ["Childcare / daycare invoices", "p_kids", "requested", "Full-year summary from the Kita"],
        ["Donation receipts", "p_joint", "outstanding", ""],
        ["Professional training & education costs", "p_anna", "outstanding", ""],
        ["Commuting costs — season ticket receipt", "p_anna", "received", ""],
        ["Unreimbursed medical & dental expenses", "p_joint", "outstanding", "Only worth it if above the threshold"],
        ["Alimony payments confirmation", "p_joint", "na", ""]
      ]
    ],
    [
      "Other income & assets",
      [
        ["Foreign accounts & assets statement", "p_joint", "outstanding", "UK account still open"],
        ["Rental income statement", "p_joint", "na", ""],
        ["Inheritances or gifts received", "p_joint", "na", ""],
        ["Vehicle — purchase price and year of purchase", "p_joint", "received", ""]
      ]
    ]
  ];

  function buildCategories(template, transform) {
    return template.map(function (entry, ci) {
      var items = entry[1]
        .map(function (row, ii) {
          var item = {
            id: TRH.uid("it"),
            name: row[0],
            ownerId: row[1],
            status: row[2],
            comment: row[3] || ""
          };
          return transform ? transform(item, ci, ii) : item;
        })
        .filter(Boolean);
      return { id: TRH.uid("cat"), name: entry[0], collapsed: false, items: items };
    });
  }

  function seed() {
    var years = [];

    // Two closed years so the history view has something to show. Everything
    // in a closed year is either received or explicitly not applicable.
    [2023, 2024].forEach(function (y, yi) {
      years.push({
        taxYear: y,
        status: "final",
        createdAt: y + 1 + "-01-10",
        finalizedAt: y + 1 + "-04-" + (yi === 0 ? "18" : "26"),
        note:
          yi === 0
            ? "First year with the new mortgage."
            : "Filed with an extension to 30 September.",
        categories: buildCategories(TEMPLATE, function (item, ci, ii) {
          // Drop a couple of rows so the years are not identical.
          if (y === 2023 && ci === 2 && ii === 6) return null; // no crypto yet
          return Object.assign({}, item, {
            status: item.status === "na" ? "na" : "received",
            comment: ""
          });
        })
      });
    });

    // The live year.
    years.push({
      taxYear: 2025,
      status: "open",
      createdAt: "2026-01-08",
      finalizedAt: null,
      note: "Carried over from 2024 and adjusted for the bathroom refit.",
      categories: buildCategories(TEMPLATE)
    });

    return {
      schemaVersion: SCHEMA_VERSION,
      household: "Cameron household",
      people: PEOPLE.map(function (p) {
        return { id: p.id, name: p.name, initials: TRH.initials(p.name) };
      }),
      years: years
    };
  }

  TRH.seed = seed;

  /* --- Derived helpers --------------------------------------------------- */

  TRH.allItems = function (year) {
    if (!year) return [];
    return year.categories.reduce(function (acc, c) {
      return acc.concat(c.items);
    }, []);
  };

  // "Relevant" = everything except N/A. Progress is measured against that so
  // marking a row N/A moves the needle instead of dragging it down forever.
  TRH.tally = function (items) {
    var t = { outstanding: 0, requested: 0, received: 0, na: 0, total: items.length };
    items.forEach(function (i) {
      if (t[i.status] === undefined) t[i.status] = 0;
      t[i.status] += 1;
    });
    t.relevant = t.total - t.na;
    t.percent = t.relevant === 0 ? 100 : Math.round((t.received / t.relevant) * 100);
    return t;
  };

  TRH.personById = function (state, id) {
    return (
      (state.people || []).filter(function (p) {
        return p.id === id;
      })[0] || null
    );
  };

  TRH.yearByTaxYear = function (state, taxYear) {
    return (
      state.years.filter(function (y) {
        return y.taxYear === Number(taxYear);
      })[0] || null
    );
  };

  // Newest first — every list in the UI reads most-recent-first.
  TRH.sortedYears = function (state) {
    return state.years.slice().sort(function (a, b) {
      return b.taxYear - a.taxYear;
    });
  };

  TRH.latestYear = function (state) {
    return TRH.sortedYears(state)[0] || null;
  };

  /* --- Carry-over -------------------------------------------------------- */

  /**
   * Build a new open year from `source`.
   * @param {object} source        year to copy structure from
   * @param {number} taxYear       new tax year
   * @param {object} opts
   * @param {boolean} opts.skipNa  leave out rows that were N/A last year
   * @param {boolean} opts.keepComments carry the comments across too
   */
  TRH.carryOver = function (source, taxYear, opts) {
    opts = opts || {};
    var categories = (source ? source.categories : []).map(function (c) {
      return {
        id: TRH.uid("cat"),
        name: c.name,
        collapsed: false,
        items: c.items
          .filter(function (i) {
            return !(opts.skipNa && i.status === "na");
          })
          .map(function (i) {
            return {
              id: TRH.uid("it"),
              name: i.name,
              ownerId: i.ownerId,
              // Everything starts outstanding: last year's evidence is not
              // this year's evidence.
              status: "outstanding",
              comment: opts.keepComments ? i.comment : ""
            };
          })
      };
    });

    return {
      taxYear: Number(taxYear),
      status: "open",
      createdAt: new Date().toISOString().slice(0, 10),
      finalizedAt: null,
      note: source ? "Carried over from " + source.taxYear + "." : "",
      categories: categories
    };
  };

  /* --- Backend seam -------------------------------------------------------
     Every function here either reads from D1 (via the API) or writes to it.
     Mutations apply optimistically to the `state` object passed in — the
     caller re-renders right after calling, before the network settles — and
     roll back and call TRH.onSyncError() if the request fails. Conflict
     policy is silent last-write-wins (docs/implementation-plan.md, 2.2): a
     failed write means *this* write didn't land, not that someone else's did.
     ------------------------------------------------------------------------- */

  function cacheState(state) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(state));
    } catch (e) {
      /* private mode or full storage — the cache is best-effort */
    }
  }
  TRH.cacheState = cacheState;

  function cachedState() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && parsed.schemaVersion === SCHEMA_VERSION ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  // Set by app.js/history.js at boot. Called when a background write fails
  // after already having been applied optimistically, so the screen can
  // re-render the rolled-back state and say something happened.
  TRH.onSyncError = function () {};

  function request(method, path, body) {
    var init = { method: method, headers: {} };
    if (body !== undefined) {
      init.headers["content-type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    return fetch("/api" + path, init).then(function (res) {
      var ct = res.headers.get("content-type") || "";
      var parse = ct.indexOf("application/json") !== -1 ? res.json() : res.text();
      return parse.then(function (data) {
        if (!res.ok) {
          throw new Error((data && data.error) || "Request failed (" + res.status + ")");
        }
        return data;
      });
    });
  }

  /**
   * Loads the household's state from the server. Falls back to the last
   * cached copy — read-only, per the caller — if the network is unavailable;
   * throws only when there is truly nothing to show (offline on first visit).
   * @returns {Promise<{state: object, offline: boolean}>}
   */
  TRH.load = function () {
    return request("GET", "/state").then(
      function (state) {
        cacheState(state);
        return { state: state, offline: false };
      },
      function () {
        var cached = cachedState();
        if (!cached) throw new Error("Can't reach the server and nothing is cached yet.");
        return { state: cached, offline: true };
      }
    );
  };

  // Applies `fields` to `target` (an item/category/year object already
  // living inside `state`) immediately, persists the merged server response
  // over it on success, or reverts it and calls TRH.onSyncError on failure.
  // Never rejects — onSyncError is the one place failure is handled, so
  // every call site can fire-and-forget without a .catch().
  TRH.applyPatch = function (state, target, fields, path) {
    var before = {};
    Object.keys(fields).forEach(function (k) {
      before[k] = target[k];
    });
    Object.assign(target, fields);
    cacheState(state);
    return request("PATCH", path, fields).then(
      function (fresh) {
        if (fresh && typeof fresh === "object") Object.assign(target, fresh);
        cacheState(state);
        return target;
      },
      function (err) {
        Object.assign(target, before);
        cacheState(state);
        TRH.onSyncError(err);
        return target;
      }
    );
  };

  TRH.createYear = function (opts) {
    return request("POST", "/years", opts);
  };

  TRH.createCategory = function (taxYear, name) {
    return request("POST", "/years/" + taxYear + "/categories", { name: name });
  };

  TRH.deleteCategory = function (id) {
    return request("DELETE", "/categories/" + id);
  };

  TRH.createItem = function (categoryId, fields) {
    return request("POST", "/categories/" + categoryId + "/items", fields);
  };

  // Category membership is structural in the client's tree (not a field on
  // the item), so this is a plain request rather than a TRH.applyPatch call
  // — the caller moves the item between category.items arrays itself.
  TRH.moveItem = function (id, categoryId) {
    return request("PATCH", "/items/" + id, { categoryId: categoryId });
  };

  TRH.deleteItem = function (id) {
    return request("DELETE", "/items/" + id);
  };

  // Not on the live app's path — TRH.createYear() asks the server to carry a
  // year forward now, and TRH.seed() (assigned above, near its definition)
  // isn't called by app.js any more — but both stay for tests, per
  // implementation-plan.md's cross-cutting/Testing section, and as a
  // documented reference for what carry-over means.
  TRH.reset = function () {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch (e) {
      /* nothing to do */
    }
  };
})(window.TRH);
