/* Reset control on the About page — the prototype's only escape hatch back to
   the seeded example data. */

(function (TRH) {
  "use strict";

  function init() {
    var btn = document.getElementById("btnReset");
    if (!btn) return;
    btn.addEventListener("click", function () {
      TRH.reset();
      TRH.load(); // re-seeds and writes back
      TRH.toast("Example data restored");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window.TRH);
