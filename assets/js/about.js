/* Cache control on the About page. There is a real server now (Phase 2), so
   this can no longer reset real data — it clears the local offline cache and
   reloads from the server, which is only useful if a stale copy is stuck. */

(function (TRH) {
  "use strict";

  function init() {
    var btn = document.getElementById("btnReset");
    if (!btn) return;
    btn.addEventListener("click", function () {
      TRH.reset();
      location.reload();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window.TRH);
