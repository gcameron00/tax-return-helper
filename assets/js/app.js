/* ==========================================================================
   app.js — the checklist screen.

   Render model: the whole list is re-rendered from state on every change.
   The lists are small (tens of rows) and all editing happens in the drawer,
   so there is no focus to lose and no diffing to justify.
   ========================================================================== */

(function (TRH) {
  "use strict";

  var state = null;
  var offline = false; // true when showing a cached copy, not the live server
  var currentYear = null; // tax year (number)
  var editingId = null; // item id open in the drawer
  var drawerOpenerId = null; // item id whose row should regain focus on close

  var view = {
    query: "",
    statuses: [], // empty = all
    ownerId: ""
  };

  var el = {};

  /* --- Boot -------------------------------------------------------------- */

  function init() {
    [
      "yearSelect",
      "yearBadge",
      "summary",
      "lockNote",
      "offlineNote",
      "checklist",
      "search",
      "ownerFilter",
      "filterInfo",
      "drawer",
      "drawerBody",
      "drawerTitle",
      "scrim",
      "btnNewYear",
      "btnFinal",
      "btnExport",
      "btnPrint",
      "btnAddCategory",
      "btnCollapse",
      "btnDrawerClose",
      "btnDelete",
      "btnDrawerDone",
      "dlgNewYear",
      "dlgText",
      "dlgConfirm"
    ].forEach(function (k) {
      el[k] = document.getElementById(k);
    });

    el.checklist.innerHTML = '<div class="empty"><div class="empty__title">Loading…</div></div>';

    TRH.onSyncError = function (err) {
      renderAll();
      TRH.toast(err && err.message ? err.message : "Couldn't save — reverted");
    };

    TRH.load().then(
      function (result) {
        state = result.state;
        offline = result.offline;
        boot();
      },
      function (err) {
        el.checklist.innerHTML =
          '<div class="empty"><div class="empty__title">Can\'t load the checklist</div>' +
          "<p>" +
          TRH.esc(err.message) +
          "</p></div>";
      }
    );
  }

  function boot() {
    // Deep link: /?year=2024. Falls back to the most recent year, or shows
    // an empty state in the unlikely case the household has no years yet.
    var params = new URLSearchParams(location.search);
    var requested = Number(params.get("year"));
    var match = requested ? TRH.yearByTaxYear(state, requested) : null;
    var latest = TRH.latestYear(state);
    if (!match && !latest) {
      el.checklist.innerHTML =
        '<div class="empty"><div class="empty__title">No tax years yet</div>' +
        "<p>Something has gone wrong with the setup — there should always be at least one.</p></div>";
      return;
    }
    currentYear = match ? match.taxYear : latest.taxYear;

    bindChrome();
    renderAll();
  }

  function year() {
    return TRH.yearByTaxYear(state, currentYear);
  }

  // Every existing call site uses this to gate interactivity (disable a
  // control, hide an add/delete button), never to decide what the lock
  // banner says — so folding "offline" in here, rather than threading a
  // second check through every one of them, keeps read-only read-only for
  // both reasons without changing any call site.
  function isLocked() {
    var y = year();
    return offline || (!!y && y.status === "final");
  }

  // Local-only: caches state and re-renders. Anything that needs the server
  // calls TRH.applyPatch/createX/deleteX itself, separately — this never
  // touches the network. `onUndo`, when given, runs before the snapshot is
  // restored, so a caller can cancel a network call it hasn't sent yet.
  function commit(message, undoSnapshot, onUndo) {
    TRH.cacheState(state);
    renderAll();
    if (message) {
      TRH.toast(
        message,
        undoSnapshot
          ? {
              label: "Undo",
              onClick: function () {
                if (onUndo) onUndo();
                state = JSON.parse(undoSnapshot);
                TRH.cacheState(state);
                renderAll();
              }
            }
          : null
      );
    }
  }

  function snapshot() {
    return JSON.stringify(state);
  }

  /* --- Rendering: year bar ----------------------------------------------- */

  function renderYearBar() {
    var years = TRH.sortedYears(state);
    el.yearSelect.innerHTML = years
      .map(function (y) {
        return (
          '<option value="' +
          y.taxYear +
          '"' +
          (y.taxYear === currentYear ? " selected" : "") +
          ">" +
          y.taxYear +
          (y.status === "final" ? " · final" : "") +
          "</option>"
        );
      })
      .join("");

    var y = year();
    el.yearBadge.className = "badge " + (y.status === "final" ? "badge--final" : "badge--open");
    el.yearBadge.innerHTML =
      '<span class="badge__dot"></span>' +
      (y.status === "final"
        ? "Final · " + TRH.esc(TRH.formatDate(y.finalizedAt))
        : "In progress");

    el.btnFinal.innerHTML =
      TRH.icon(y.status === "final" ? "unlock" : "lock") +
      "<span>" +
      (y.status === "final" ? "Reopen" : "Mark final") +
      "</span>";
    el.btnFinal.disabled = offline;

    el.btnAddCategory.disabled = isLocked();

    // Only the newest year can spawn a successor, and only one per tax year.
    var latest = TRH.latestYear(state);
    el.btnNewYear.title = "Start the " + (latest.taxYear + 1) + " checklist";
    el.btnNewYear.disabled = offline;
  }

  function renderLockNote() {
    var y = year();
    if (y.status !== "final") {
      el.lockNote.hidden = true;
      el.lockNote.innerHTML = "";
      return;
    }
    el.lockNote.hidden = false;
    el.lockNote.innerHTML =
      TRH.icon("lock") +
      "<span>This checklist was marked final on " +
      TRH.esc(TRH.formatDate(y.finalizedAt)) +
      " and is read-only.</span>" +
      '<button class="btn btn--sm" type="button" data-action="reopen">Reopen</button>';
  }

  function renderOfflineNote() {
    el.offlineNote.hidden = !offline;
    if (!offline) return;
    el.offlineNote.innerHTML =
      TRH.icon("info") +
      "<span>Can't reach the server — showing the last saved copy. Read-only until it's back.</span>";
  }

  /* --- Rendering: summary ------------------------------------------------ */

  function renderSummary() {
    var items = TRH.allItems(year());
    var t = TRH.tally(items);

    var R = 46;
    var C = 2 * Math.PI * R;
    var offset = C * (1 - t.percent / 100);

    var tiles = [
      { id: "outstanding", label: "Outstanding", n: t.outstanding },
      { id: "requested", label: "Requested", n: t.requested },
      { id: "received", label: "Received", n: t.received },
      { id: "na", label: "Not applicable", n: t.na }
    ];

    el.summary.innerHTML =
      '<div class="ring">' +
      '<svg viewBox="0 0 108 108" aria-hidden="true">' +
      '<circle class="ring__track" cx="54" cy="54" r="' +
      R +
      '" fill="none" stroke-width="9"/>' +
      '<circle class="ring__value" cx="54" cy="54" r="' +
      R +
      '" fill="none" stroke-width="9" stroke-dasharray="' +
      C.toFixed(1) +
      '" stroke-dashoffset="' +
      offset.toFixed(1) +
      '"/>' +
      "</svg>" +
      '<div class="ring__label">' +
      '<div class="ring__pct">' +
      t.percent +
      "%</div>" +
      '<div class="ring__sub">collected</div>' +
      "</div></div>" +
      '<div><div class="stats">' +
      tiles
        .map(function (tile) {
          var on = view.statuses.indexOf(tile.id) !== -1;
          return (
            '<button class="stat stat--' +
            tile.id +
            '" type="button" data-filter-status="' +
            tile.id +
            '" aria-pressed="' +
            on +
            '">' +
            '<div class="stat__n">' +
            tile.n +
            "</div>" +
            '<div class="stat__k"><span class="pill__dot"></span>' +
            tile.label +
            "</div></button>"
          );
        })
        .join("") +
      "</div>" +
      '<p class="hint" style="margin-top:10px">' +
      t.received +
      " of " +
      t.relevant +
      " relevant documents collected · " +
      t.na +
      " marked not applicable</p>" +
      "</div>";
  }

  /* --- Rendering: filters ------------------------------------------------ */

  function renderFilters() {
    if (el.ownerFilter.options.length <= 1) {
      el.ownerFilter.innerHTML =
        '<option value="">All owners</option>' +
        state.people
          .map(function (p) {
            return '<option value="' + p.id + '">' + TRH.esc(p.name) + "</option>";
          })
          .join("");
    }
    el.ownerFilter.value = view.ownerId;
    el.search.value = view.query;

    var active =
      view.statuses.length > 0 || view.ownerId !== "" || view.query.trim() !== "";
    el.filterInfo.innerHTML = active
      ? '<button class="btn btn--sm btn--ghost" type="button" data-action="clear-filters">Clear filters</button>'
      : "";
  }

  function matches(item) {
    if (view.statuses.length && view.statuses.indexOf(item.status) === -1) return false;
    if (view.ownerId && item.ownerId !== view.ownerId) return false;
    var q = view.query.trim().toLowerCase();
    if (q) {
      var person = TRH.personById(state, item.ownerId);
      var hay = (
        item.name +
        " " +
        (item.comment || "") +
        " " +
        (person ? person.name : "")
      ).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }

  /* --- Rendering: checklist ---------------------------------------------- */

  function avatar(person, cls) {
    if (!person) {
      return '<span class="avatar ' + (cls || "") + '" style="--av-bg:#8b8b94">?</span>';
    }
    return (
      '<span class="avatar ' +
      (cls || "") +
      '" style="--av-bg:' +
      TRH.avatarColor(person) +
      '" aria-hidden="true">' +
      TRH.esc(person.initials) +
      "</span>"
    );
  }

  function statusPill(status) {
    var s = TRH.STATUS_BY_ID[status] || TRH.STATUS_BY_ID.outstanding;
    return (
      '<span class="pill pill--' +
      (status === "na" ? "na" : status) +
      '"><span class="pill__dot"></span>' +
      TRH.esc(s.short) +
      "</span>"
    );
  }

  function renderRow(item) {
    var person = TRH.personById(state, item.ownerId);
    var cls =
      "row" +
      (item.status === "received" ? " is-received" : "") +
      (item.status === "na" ? " is-na" : "");
    // A just-added row has no name until it is typed.
    var label = item.name || "Untitled document";

    // The row is click-to-open for the mouse; keyboard users reach the same
    // editor through the labelled "⋯" button, so the row itself stays a plain
    // container rather than a role="button" with buttons nested inside it.
    return (
      '<div class="' +
      cls +
      '" data-item="' +
      item.id +
      '">' +
      '<button class="row__check" type="button" data-toggle="' +
      item.id +
      '"' +
      (isLocked() ? " disabled" : "") +
      ' aria-label="' +
      (item.status === "received" ? "Mark as outstanding" : "Mark as received") +
      '">' +
      TRH.icon("check") +
      "</button>" +
      '<div class="row__main">' +
      '<div class="row__name"' +
      (item.name ? "" : ' style="color:var(--c-text-3)"') +
      ">" +
      TRH.esc(label) +
      "</div>" +
      (item.comment
        ? '<div class="row__comment">' +
          TRH.icon("comment") +
          "<span>" +
          TRH.esc(item.comment) +
          "</span></div>"
        : "") +
      "</div>" +
      '<div class="row__owner owner">' +
      avatar(person) +
      "<span>" +
      TRH.esc(person ? person.name : "Unassigned") +
      "</span></div>" +
      "<div>" +
      statusPill(item.status) +
      "</div>" +
      '<button class="btn btn--icon btn--sm btn--ghost row__more" type="button" ' +
      'data-open="' +
      item.id +
      '" aria-label="Edit ' +
      TRH.esc(label) +
      '">' +
      TRH.icon("dots") +
      "</button>" +
      "</div>"
    );
  }

  function renderChecklist() {
    var y = year();
    var locked = isLocked();
    var anyVisible = false;
    var filtering = !!(view.statuses.length || view.ownerId || view.query.trim());

    var html = y.categories
      .map(function (cat) {
        var visible = cat.items.filter(matches);
        if (visible.length) anyVisible = true;

        // A category with no matches at all disappears while filtering, but
        // stays put (as an empty shell you can add to) when nothing is filtered.
        if (filtering && !visible.length) return "";

        var t = TRH.tally(cat.items);

        return (
          '<section class="cat' +
          (cat.collapsed ? " is-collapsed" : "") +
          '" data-cat="' +
          cat.id +
          '">' +
          '<header class="cat__head">' +
          '<button class="cat__toggle" type="button" data-collapse="' +
          cat.id +
          '" aria-expanded="' +
          !cat.collapsed +
          '">' +
          TRH.icon("chevron", "cat__chev") +
          '<span class="cat__name">' +
          TRH.esc(cat.name) +
          "</span>" +
          '<span class="cat__count">' +
          t.received +
          "/" +
          t.relevant +
          "</span></button>" +
          '<div class="cat__bar" aria-hidden="true"><i style="width:' +
          t.percent +
          '%"></i></div>' +
          (locked
            ? ""
            : '<div class="cat__actions">' +
              '<button class="btn btn--icon btn--sm btn--ghost" type="button" data-rename-cat="' +
              cat.id +
              '" aria-label="Rename category">' +
              TRH.icon("copy") +
              "</button>" +
              '<button class="btn btn--icon btn--sm btn--ghost" type="button" data-delete-cat="' +
              cat.id +
              '" aria-label="Delete category">' +
              TRH.icon("trash") +
              "</button></div>") +
          "</header>" +
          '<div class="cat__body">' +
          (visible.length
            ? visible.map(renderRow).join("")
            : '<p class="row--empty">No documents in this category yet.</p>') +
          "</div>" +
          (locked
            ? ""
            : '<button class="cat__add" type="button" data-add-item="' +
              cat.id +
              '">' +
              TRH.icon("plus") +
              "<span>Add document</span></button>") +
          "</section>"
        );
      })
      .join("");

    if (!y.categories.length) {
      html =
        '<div class="empty"><div class="empty__title">Nothing on the list yet</div>' +
        "<p>Add a category to start building the " +
        y.taxYear +
        " checklist.</p></div>";
    } else if (filtering && !anyVisible) {
      html =
        '<div class="empty"><div class="empty__title">No matching documents</div>' +
        "<p>Try a different search term or clear the filters.</p></div>";
    }

    el.checklist.innerHTML = html;

    var allCollapsed =
      y.categories.length > 0 &&
      y.categories.every(function (c) {
        return c.collapsed;
      });
    el.btnCollapse.textContent = allCollapsed ? "Expand all" : "Collapse all";
  }

  function renderAll() {
    renderYearBar();
    renderLockNote();
    renderOfflineNote();
    renderSummary();
    renderFilters();
    renderChecklist();
    if (editingId) renderDrawer();
  }

  /* --- Drawer ------------------------------------------------------------ */

  function findItem(id) {
    var y = year();
    for (var i = 0; i < y.categories.length; i++) {
      var items = y.categories[i].items;
      for (var j = 0; j < items.length; j++) {
        if (items[j].id === id) return { item: items[j], cat: y.categories[i] };
      }
    }
    return null;
  }

  function openDrawer(id, focusName) {
    drawerOpenerId = id;
    editingId = id;
    renderDrawer();
    el.drawer.classList.add("is-open");
    el.scrim.classList.add("is-open");
    el.drawer.setAttribute("aria-hidden", "false");
    var nameField = el.drawer.querySelector("#f-name");
    if (nameField) {
      nameField.focus();
      if (focusName) nameField.select();
    } else {
      el.drawer.focus();
    }
  }

  // Focusable elements inside the drawer, in DOM order — used to trap Tab
  // while it is open and to know its first/last stop.
  function drawerFocusables() {
    return Array.prototype.slice
      .call(
        el.drawer.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        )
      )
      .filter(function (elm) {
        return elm.offsetParent !== null;
      });
  }

  function closeDrawer() {
    var openerId = drawerOpenerId;
    editingId = null;
    drawerOpenerId = null;
    el.drawer.classList.remove("is-open");
    el.scrim.classList.remove("is-open");
    el.drawer.setAttribute("aria-hidden", "true");
    // Return focus to the row's "Edit" control rather than dropping it to
    // <body> — the row itself is not a focus stop, that button is.
    var trigger =
      openerId && el.checklist.querySelector('[data-open="' + openerId + '"]');
    if (trigger) trigger.focus();
  }

  function renderDrawer() {
    var found = findItem(editingId);
    if (!found) {
      closeDrawer();
      return;
    }
    var item = found.item;
    var locked = isLocked();
    var y = year();

    el.drawerTitle.textContent = locked ? "Document" : "Edit document";
    el.btnDelete.hidden = locked;

    el.drawerBody.innerHTML =
      '<label class="field"><span class="label">Document</span>' +
      '<input class="input" id="f-name" type="text" value="' +
      TRH.esc(item.name) +
      '" placeholder="e.g. Lohnausweis 2025"' +
      (locked ? " readonly" : "") +
      "></label>" +
      '<div class="field"><span class="label">Category</span>' +
      '<select class="select" id="f-cat"' +
      (locked ? " disabled" : "") +
      ">" +
      y.categories
        .map(function (c) {
          return (
            '<option value="' +
            c.id +
            '"' +
            (c.id === found.cat.id ? " selected" : "") +
            ">" +
            TRH.esc(c.name) +
            "</option>"
          );
        })
        .join("") +
      "</select></div>" +
      '<div class="field"><span class="label">Owner</span>' +
      '<select class="select" id="f-owner"' +
      (locked ? " disabled" : "") +
      ">" +
      state.people
        .map(function (p) {
          return (
            '<option value="' +
            p.id +
            '"' +
            (p.id === item.ownerId ? " selected" : "") +
            ">" +
            TRH.esc(p.name) +
            "</option>"
          );
        })
        .join("") +
      "</select></div>" +
      '<div class="field"><span class="label">Status</span>' +
      '<div class="segmented" id="f-status" role="group" aria-label="Status">' +
      TRH.STATUSES.map(function (s) {
        return (
          '<button type="button" data-status="' +
          s.id +
          '" aria-pressed="' +
          (item.status === s.id) +
          '"' +
          (locked ? " disabled" : "") +
          '><span class="pill__dot" style="background:currentColor"></span>' +
          TRH.esc(s.label) +
          "</button>"
        );
      }).join("") +
      "</div></div>" +
      '<label class="field"><span class="label">Comment</span>' +
      '<textarea class="textarea" id="f-comment" placeholder="Where it is, who was chased, anything the tax advisor should know…"' +
      (locked ? " readonly" : "") +
      ">" +
      TRH.esc(item.comment) +
      "</textarea>" +
      '<p class="hint">Optional. Shown under the document name in the list.</p></label>';

    if (locked) return;

    // Live-bind the fields. Every edit writes straight through to state.
    var nameEl = el.drawerBody.querySelector("#f-name");
    var commentEl = el.drawerBody.querySelector("#f-comment");

    nameEl.addEventListener("input", function () {
      TRH.applyPatch(state, item, { name: nameEl.value }, "/items/" + item.id);
      TRH.cacheState(state);
      renderChecklist();
      renderSummary();
    });

    commentEl.addEventListener("input", function () {
      TRH.applyPatch(state, item, { comment: commentEl.value }, "/items/" + item.id);
      TRH.cacheState(state);
      renderChecklist();
    });

    el.drawerBody.querySelector("#f-owner").addEventListener("change", function (e) {
      TRH.applyPatch(state, item, { ownerId: e.target.value }, "/items/" + item.id);
      TRH.cacheState(state);
      renderChecklist();
    });

    el.drawerBody.querySelector("#f-cat").addEventListener("change", function (e) {
      moveItem(item.id, e.target.value);
    });

    el.drawerBody.querySelector("#f-status").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-status]");
      if (!btn) return;
      TRH.applyPatch(state, item, { status: btn.dataset.status }, "/items/" + item.id);
      TRH.cacheState(state);
      renderAll();
    });
  }

  function moveItem(itemId, targetCatId) {
    var y = year();
    var found = findItem(itemId);
    if (!found || found.cat.id === targetCatId) return;
    var target = y.categories.filter(function (c) {
      return c.id === targetCatId;
    })[0];
    if (!target) return;
    var sourceCat = found.cat;
    // Category membership is structural (which array the item sits in), not
    // a field on the item, so this isn't a TRH.applyPatch case — move it
    // locally, then sync, then undo the move on failure ourselves.
    sourceCat.items = sourceCat.items.filter(function (i) {
      return i.id !== itemId;
    });
    target.items.push(found.item);
    commit();

    TRH.moveItem(itemId, targetCatId).catch(function (err) {
      target.items = target.items.filter(function (i) {
        return i.id !== itemId;
      });
      sourceCat.items.push(found.item);
      TRH.cacheState(state);
      renderAll();
      TRH.toast(err.message || "Couldn't move the document — reverted");
    });
  }

  /* --- Dialog helpers ---------------------------------------------------- */

  // `returnValue` survives between openings, so it is always cleared before
  // showing — otherwise dismissing with Escape reads as the previous "ok".
  function promptText(opts) {
    return new Promise(function (resolve) {
      var dlg = el.dlgText;
      dlg.querySelector("[data-title]").textContent = opts.title;
      dlg.querySelector("[data-label]").textContent = opts.label;
      dlg.querySelector("[data-cta]").textContent = opts.cta || "Save";
      var input = dlg.querySelector("input");
      input.value = opts.value || "";
      input.placeholder = opts.placeholder || "";

      function onClose() {
        dlg.removeEventListener("close", onClose);
        resolve(
          dlg.returnValue === "ok" && input.value.trim() ? input.value.trim() : null
        );
      }
      dlg.addEventListener("close", onClose);
      dlg.returnValue = "";
      dlg.showModal();
      input.focus();
      input.select();
    });
  }

  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      var dlg = el.dlgConfirm;
      dlg.querySelector("[data-title]").textContent = opts.title;
      dlg.querySelector("[data-body]").innerHTML = opts.body;
      var cta = dlg.querySelector("[data-cta]");
      cta.textContent = opts.cta || "Confirm";
      cta.className = "btn " + (opts.danger ? "btn--danger" : "btn--primary");

      function onClose() {
        dlg.removeEventListener("close", onClose);
        resolve(dlg.returnValue === "ok");
      }
      dlg.addEventListener("close", onClose);
      dlg.returnValue = "";
      dlg.showModal();
    });
  }

  /* --- Actions ----------------------------------------------------------- */

  function toggleReceived(id) {
    if (isLocked()) return;
    var found = findItem(id);
    if (!found) return;
    var next = found.item.status === "received" ? "outstanding" : "received";
    TRH.applyPatch(state, found.item, { status: next }, "/items/" + id);
    commit();
  }

  function addItem(catId) {
    var y = year();
    var cat = y.categories.filter(function (c) {
      return c.id === catId;
    })[0];
    if (!cat) return;
    var owner = state.people[0];
    TRH.createItem(catId, {
      name: "",
      ownerId: owner ? owner.id : null,
      status: "outstanding",
      comment: ""
    }).then(
      function (item) {
        cat.items.push(item);
        cat.collapsed = false;
        // Clear filters that would immediately hide the new empty row.
        view.query = "";
        view.statuses = [];
        view.ownerId = "";
        TRH.cacheState(state);
        renderAll();
        openDrawer(item.id, true);
      },
      function (err) {
        TRH.toast(err.message || "Couldn't add the document");
      }
    );
  }

  function addCategory() {
    promptText({
      title: "New category",
      label: "Category name",
      placeholder: "e.g. Bank accounts",
      cta: "Add category"
    }).then(function (name) {
      if (!name) return;
      TRH.createCategory(currentYear, name).then(
        function (cat) {
          year().categories.push(cat);
          commit("Category added");
        },
        function (err) {
          TRH.toast(err.message || "Couldn't add the category");
        }
      );
    });
  }

  function renameCategory(catId) {
    var cat = year().categories.filter(function (c) {
      return c.id === catId;
    })[0];
    if (!cat) return;
    promptText({
      title: "Rename category",
      label: "Category name",
      value: cat.name,
      cta: "Rename"
    }).then(function (name) {
      if (!name) return;
      TRH.applyPatch(state, cat, { name: name }, "/categories/" + catId);
      commit();
    });
  }

  function deleteCategory(catId) {
    var cat = year().categories.filter(function (c) {
      return c.id === catId;
    })[0];
    if (!cat) return;
    confirmDialog({
      title: "Delete category?",
      body:
        "<strong>" +
        TRH.esc(cat.name) +
        "</strong> and its " +
        cat.items.length +
        " document" +
        (cat.items.length === 1 ? "" : "s") +
        " will be removed from the " +
        currentYear +
        " checklist.",
      cta: "Delete",
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      var before = snapshot();
      var y = year();
      y.categories = y.categories.filter(function (c) {
        return c.id !== catId;
      });
      // The actual DELETE waits out the undo window — clicking Undo within
      // it means nothing was ever sent, so there is nothing to reconcile.
      // Known gap: closing the tab inside that window drops the pending
      // delete; the row reappears next load (GET /api/state is the source
      // of truth), which is surprising but not destructive.
      var timer = setTimeout(function () {
        TRH.deleteCategory(catId).catch(function () {
          state = JSON.parse(before);
          TRH.cacheState(state);
          renderAll();
          TRH.toast("Couldn't delete — restored");
        });
      }, 7000);
      commit("Category deleted", before, function () {
        clearTimeout(timer);
      });
    });
  }

  function deleteItem() {
    var found = findItem(editingId);
    if (!found) return;
    var before = snapshot();
    var name = found.item.name || "Untitled document";
    var id = editingId;
    found.cat.items = found.cat.items.filter(function (i) {
      return i.id !== id;
    });
    closeDrawer();
    var timer = setTimeout(function () {
      TRH.deleteItem(id).catch(function () {
        state = JSON.parse(before);
        TRH.cacheState(state);
        renderAll();
        TRH.toast("Couldn't delete — restored");
      });
    }, 7000);
    commit('"' + name + '" deleted', before, function () {
      clearTimeout(timer);
    });
  }

  function toggleFinal() {
    var y = year();
    if (y.status === "final") {
      // finalizedAt is server-computed, not set optimistically here, so the
      // banner needs a second render once the real value comes back.
      TRH.applyPatch(state, y, { status: "open" }, "/years/" + y.taxYear).then(renderAll);
      commit(y.taxYear + " reopened for editing");
      return;
    }

    var t = TRH.tally(TRH.allItems(y));
    var open = t.outstanding + t.requested;
    confirmDialog({
      title: "Mark " + y.taxYear + " as final?",
      body:
        (open
          ? "<strong>" +
            open +
            " document" +
            (open === 1 ? " is" : "s are") +
            " still open.</strong> You can mark the year final anyway — " +
            "it can always be reopened later.<br><br>"
          : "") +
        "The checklist becomes read-only and moves into the history.",
      cta: "Mark final"
    }).then(function (ok) {
      if (!ok) return;
      TRH.applyPatch(state, y, { status: "final" }, "/years/" + y.taxYear).then(renderAll);
      commit(y.taxYear + " marked final");
    });
  }

  function openNewYear() {
    var latest = TRH.latestYear(state);
    var next = latest.taxYear + 1;
    var dlg = el.dlgNewYear;
    dlg.querySelector("[data-next-year]").textContent = next;
    dlg.querySelector("[data-source-year]").textContent = latest.taxYear;
    dlg.querySelector("#ny-year").value = next;
    dlg.querySelector("#ny-skipna").checked = true;
    dlg.querySelector("#ny-comments").checked = false;
    dlg.returnValue = "";
    dlg.showModal();
  }

  function createNewYear() {
    var dlg = el.dlgNewYear;
    var taxYear = Number(dlg.querySelector("#ny-year").value);
    if (!taxYear || TRH.yearByTaxYear(state, taxYear)) {
      TRH.toast("A checklist for " + taxYear + " already exists");
      return;
    }
    var source = TRH.latestYear(state);
    TRH.createYear({
      fromYear: source.taxYear,
      taxYear: taxYear,
      skipNa: dlg.querySelector("#ny-skipna").checked,
      keepComments: dlg.querySelector("#ny-comments").checked
    }).then(
      function (fresh) {
        state.years.push(fresh);
        currentYear = taxYear;
        view.query = "";
        view.statuses = [];
        view.ownerId = "";
        commit(taxYear + " checklist created from " + source.taxYear);
      },
      function (err) {
        TRH.toast(err.message || "Couldn't create the " + taxYear + " checklist");
      }
    );
  }

  function exportYear() {
    var y = year();
    var payload = {
      exportedAt: new Date().toISOString(),
      household: state.household,
      people: state.people,
      year: y
    };
    TRH.download(
      "tax-checklist-" + y.taxYear + ".json",
      JSON.stringify(payload, null, 2)
    );
    TRH.toast("Exported " + y.taxYear + " checklist");
  }

  /* --- Events ------------------------------------------------------------ */

  function bindChrome() {
    el.yearSelect.addEventListener("change", function (e) {
      currentYear = Number(e.target.value);
      history.replaceState(null, "", "?year=" + currentYear);
      closeDrawer();
      renderAll();
    });

    el.search.addEventListener("input", function (e) {
      view.query = e.target.value;
      renderFilters();
      renderChecklist();
    });

    el.ownerFilter.addEventListener("change", function (e) {
      view.ownerId = e.target.value;
      renderFilters();
      renderChecklist();
    });

    el.btnCollapse.addEventListener("click", function () {
      var cats = year().categories;
      var allCollapsed = cats.every(function (c) {
        return c.collapsed;
      });
      cats.forEach(function (c) {
        c.collapsed = !allCollapsed;
      });
      commit();
    });

    el.btnAddCategory.addEventListener("click", addCategory);
    el.btnNewYear.addEventListener("click", openNewYear);
    el.btnFinal.addEventListener("click", toggleFinal);
    el.btnExport.addEventListener("click", exportYear);
    el.btnPrint.addEventListener("click", function () {
      window.print();
    });

    el.btnDrawerClose.addEventListener("click", closeDrawer);
    el.btnDrawerDone.addEventListener("click", closeDrawer);
    el.btnDelete.addEventListener("click", deleteItem);
    el.scrim.addEventListener("click", closeDrawer);

    el.dlgNewYear.addEventListener("close", function () {
      if (el.dlgNewYear.returnValue === "ok") createNewYear();
    });

    // Delegated handlers for everything rendered from state.
    el.summary.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-filter-status]");
      if (!btn) return;
      var s = btn.dataset.filterStatus;
      var at = view.statuses.indexOf(s);
      if (at === -1) view.statuses.push(s);
      else view.statuses.splice(at, 1);
      renderSummary();
      renderFilters();
      renderChecklist();
    });

    el.filterInfo.addEventListener("click", function (e) {
      if (!e.target.closest('[data-action="clear-filters"]')) return;
      view.query = "";
      view.statuses = [];
      view.ownerId = "";
      renderAll();
    });

    el.lockNote.addEventListener("click", function (e) {
      if (e.target.closest('[data-action="reopen"]')) toggleFinal();
    });

    el.checklist.addEventListener("click", function (e) {
      var t;
      if ((t = e.target.closest("[data-toggle]"))) {
        e.stopPropagation();
        toggleReceived(t.dataset.toggle);
      } else if ((t = e.target.closest("[data-collapse]"))) {
        var cat = year().categories.filter(function (c) {
          return c.id === t.dataset.collapse;
        })[0];
        if (cat) {
          cat.collapsed = !cat.collapsed;
          commit();
        }
      } else if ((t = e.target.closest("[data-rename-cat]"))) {
        renameCategory(t.dataset.renameCat);
      } else if ((t = e.target.closest("[data-delete-cat]"))) {
        deleteCategory(t.dataset.deleteCat);
      } else if ((t = e.target.closest("[data-add-item]"))) {
        addItem(t.dataset.addItem);
      } else if ((t = e.target.closest("[data-open]"))) {
        openDrawer(t.dataset.open);
      } else if ((t = e.target.closest("[data-item]"))) {
        openDrawer(t.dataset.item);
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && editingId) {
        closeDrawer();
        return;
      }
      // Trap Tab inside the drawer while it is open — a dialog must not
      // hand focus back to the page behind it.
      if (e.key === "Tab" && editingId) {
        var focusables = drawerFocusables();
        if (!focusables.length) return;
        var first = focusables[0];
        var last = focusables[focusables.length - 1];
        var active = document.activeElement;
        if (e.shiftKey ? active === first || !el.drawer.contains(active) : active === last || !el.drawer.contains(active)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        }
        return;
      }
      // "/" focuses search, the way every list view worth using does.
      var active = document.activeElement;
      if (
        e.key === "/" &&
        !(active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))
      ) {
        e.preventDefault();
        el.search.focus();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window.TRH);
