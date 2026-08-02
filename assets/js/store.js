/* ==========================================================================
   store.js — data model, seed data and persistence.

   MOCK-UP ONLY. Everything lives in localStorage under a single key so the
   prototype feels real (edits survive a reload) without a backend. When the
   API lands, the four functions at the bottom — load/save/patchYear/replace —
   are the seam to swap for fetch() calls. Nothing else touches storage.
   ========================================================================== */

window.TRH = window.TRH || {};

(function (TRH) {
  "use strict";

  var STORAGE_KEY = "trh.state.v1";
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

  /* --- Persistence (the backend seam) ------------------------------------ */

  TRH.load = function () {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.schemaVersion === SCHEMA_VERSION) return parsed;
      }
    } catch (e) {
      /* corrupt or unavailable storage — fall through to a fresh seed */
    }
    var fresh = seed();
    TRH.save(fresh);
    return fresh;
  };

  TRH.save = function (state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;
    }
  };

  TRH.reset = function () {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      /* nothing to do */
    }
  };
})(window.TRH);
