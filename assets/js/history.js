/* ==========================================================================
   history.js — the "previous years" screen. Read-only: every year links
   through to the checklist view, which is the one place editing happens.
   ========================================================================== */

(function (TRH) {
  "use strict";

  function render() {
    var list = document.getElementById("yearlist");
    var summary = document.getElementById("historySummary");
    var offlineNote = document.getElementById("offlineNote");
    list.innerHTML = '<div class="empty"><div class="empty__title">Loading…</div></div>';

    TRH.load().then(
      function (result) {
        renderYears(result.state, result.offline, list, summary, offlineNote);
      },
      function (err) {
        list.innerHTML =
          '<div class="empty"><div class="empty__title">Can\'t load history</div><p>' +
          TRH.esc(err.message) +
          "</p></div>";
      }
    );
  }

  function renderYears(state, offline, list, summary, offlineNote) {
    offlineNote.hidden = !offline;
    if (offline) {
      offlineNote.innerHTML =
        TRH.icon("info") + "<span>Can't reach the server — showing the last saved copy.</span>";
    }

    var years = TRH.sortedYears(state);

    var totalDocs = 0;
    var finalCount = 0;

    var html = years
      .map(function (y) {
        var items = TRH.allItems(y);
        var t = TRH.tally(items);
        totalDocs += t.total;
        if (y.status === "final") finalCount += 1;

        return (
          '<a class="yearcard" href="/?year=' +
          y.taxYear +
          '">' +
          '<div class="yearcard__top">' +
          '<span class="yearcard__year">' +
          y.taxYear +
          "</span>" +
          '<span class="badge ' +
          (y.status === "final" ? "badge--final" : "badge--open") +
          '"><span class="badge__dot"></span>' +
          (y.status === "final" ? "Final" : "In progress") +
          "</span>" +
          "</div>" +
          '<div style="text-align:end">' +
          '<div class="stat__n">' +
          t.percent +
          "%</div>" +
          '<div class="hint" style="margin:0">' +
          t.received +
          " of " +
          t.relevant +
          "</div>" +
          "</div>" +
          '<div class="yearcard__meta">' +
          '<span class="meter"><i style="width:' +
          t.percent +
          '%"></i></span>' +
          "</div>" +
          '<div class="yearcard__meta">' +
          "<span>" +
          y.categories.length +
          " categories · " +
          t.total +
          " documents</span>" +
          (y.status === "final"
            ? "<span>Finalised " + TRH.esc(TRH.formatDate(y.finalizedAt)) + "</span>"
            : "<span>Started " + TRH.esc(TRH.formatDate(y.createdAt)) + "</span>") +
          (y.note ? "<span>" + TRH.esc(y.note) + "</span>" : "") +
          "</div>" +
          "</a>"
        );
      })
      .join("");

    list.innerHTML =
      html ||
      '<div class="empty"><div class="empty__title">No years yet</div>' +
        "<p>Start a checklist from the Checklist page.</p></div>";

    if (summary) {
      summary.innerHTML =
        "<strong>" +
        years.length +
        "</strong> tax year" +
        (years.length === 1 ? "" : "s") +
        " on record · <strong>" +
        finalCount +
        "</strong> marked final · <strong>" +
        totalDocs +
        "</strong> documents tracked in total.";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})(window.TRH);
