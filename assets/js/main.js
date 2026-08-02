/* ==========================================================================
   main.js — shared chrome: theme toggle, icons, escaping, toasts.
   Loaded on every page. Page-specific logic lives in app.js / history.js.
   ========================================================================== */

window.TRH = window.TRH || {};

(function (TRH) {
  "use strict";

  var THEME_KEY = "trh.theme";

  /* --- Escaping ---------------------------------------------------------- */

  // Every string that reaches innerHTML goes through this. Item names and
  // comments are user input, even in a mock-up.
  TRH.esc = function (value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[ch];
    });
  };

  /* --- Icons ------------------------------------------------------------- */

  var P = {
    check: '<path d="M4 10.5 8 14.5 16 5"/>',
    chevron: '<path d="M5 7.5 10 12.5 15 7.5"/>',
    plus: '<path d="M10 4v12M4 10h12"/>',
    search:
      '<circle cx="9" cy="9" r="5.2"/><path d="M12.8 12.8 16.5 16.5"/>',
    dots:
      '<circle cx="10" cy="4.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="10" cy="10" r="1.3" fill="currentColor" stroke="none"/><circle cx="10" cy="15.5" r="1.3" fill="currentColor" stroke="none"/>',
    comment:
      '<path d="M16.5 12.2a1.8 1.8 0 0 1-1.8 1.8H6.5L3.5 17V4.8A1.8 1.8 0 0 1 5.3 3h9.4a1.8 1.8 0 0 1 1.8 1.8z"/>',
    lock:
      '<rect x="4" y="8.5" width="12" height="8" rx="1.8"/><path d="M6.8 8.5V6.2a3.2 3.2 0 0 1 6.4 0v2.3"/>',
    unlock:
      '<rect x="4" y="8.5" width="12" height="8" rx="1.8"/><path d="M6.8 8.5V6.2a3.2 3.2 0 0 1 6.2-.8"/>',
    close: '<path d="M5 5l10 10M15 5 5 15"/>',
    download: '<path d="M10 3v9m0 0 3.5-3.5M10 12 6.5 8.5M3.5 15.5h13"/>',
    printer:
      '<path d="M6 7.5V3h8v4.5"/><rect x="3" y="7.5" width="14" height="6" rx="1.5"/><path d="M6 12h8v5H6z"/>',
    sun:
      '<circle cx="10" cy="10" r="3.6"/><path d="M10 2v1.8M10 16.2V18M18 10h-1.8M3.8 10H2m12.7-4.7-1.3 1.3M6.6 13.4l-1.3 1.3m9.4 0-1.3-1.3M6.6 6.6 5.3 5.3"/>',
    moon: '<path d="M16.5 11.7A6.8 6.8 0 0 1 8.3 3.5a6.9 6.9 0 1 0 8.2 8.2z"/>',
    trash:
      '<path d="M3.8 5.5h12.4M8 5.5V3.8h4v1.7M5.5 5.5l.7 10.2a1.4 1.4 0 0 0 1.4 1.3h4.8a1.4 1.4 0 0 0 1.4-1.3l.7-10.2"/>',
    copy:
      '<rect x="7" y="7" width="9.5" height="9.5" rx="1.6"/><path d="M13 4.5A1.5 1.5 0 0 0 11.5 3H5a2 2 0 0 0-2 2v6.5A1.5 1.5 0 0 0 4.5 13"/>',
    arrow: '<path d="M4 10h12m0 0-4.5-4.5M16 10l-4.5 4.5"/>',
    calendar:
      '<rect x="3" y="4.5" width="14" height="12.5" rx="1.8"/><path d="M3 8.5h14M7 3v3M13 3v3"/>',
    info: '<circle cx="10" cy="10" r="7.2"/><path d="M10 9.2v4.3M10 6.6v.6"/>',
    upload: '<path d="M10 16V7m0 0 3.5 3.5M10 7 6.5 10.5M3.5 4h13"/>'
  };

  TRH.icon = function (name, cls) {
    var d = P[name];
    if (!d) return "";
    return (
      '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" ' +
      'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true"' +
      (cls ? ' class="' + cls + '"' : "") +
      ">" +
      d +
      "</svg>"
    );
  };

  /* --- Theme ------------------------------------------------------------- */

  // The <head> of each page runs a tiny inline script that applies the stored
  // theme before first paint; this only handles toggling afterwards.
  function resolve(pref) {
    if (pref === "dark" || pref === "light") return pref;
    return window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  TRH.getThemePref = function () {
    try {
      return localStorage.getItem(THEME_KEY) || "system";
    } catch (e) {
      return "system";
    }
  };

  TRH.setTheme = function (pref) {
    try {
      if (pref === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, pref);
    } catch (e) {
      /* private mode — theme just won't persist */
    }
    document.documentElement.dataset.theme = resolve(pref);
    paintToggle();
  };

  function paintToggle() {
    var btn = document.querySelector("[data-theme-toggle]");
    if (!btn) return;
    var isDark = document.documentElement.dataset.theme === "dark";
    btn.innerHTML = TRH.icon(isDark ? "sun" : "moon");
    btn.setAttribute(
      "aria-label",
      isDark ? "Switch to light theme" : "Switch to dark theme"
    );
    btn.title = btn.getAttribute("aria-label");
  }

  function initTheme() {
    var btn = document.querySelector("[data-theme-toggle]");
    if (!btn) return;
    paintToggle();
    btn.addEventListener("click", function () {
      TRH.setTheme(
        document.documentElement.dataset.theme === "dark" ? "light" : "dark"
      );
    });
    if (window.matchMedia) {
      window
        .matchMedia("(prefers-color-scheme: dark)")
        .addEventListener("change", function () {
          if (TRH.getThemePref() === "system") TRH.setTheme("system");
        });
    }
  }

  /* --- Toast ------------------------------------------------------------- */

  var toastEl = null;
  var toastTimer = null;

  /**
   * @param {string} message
   * @param {{label:string, onClick:Function}} [action] optional undo affordance
   */
  TRH.toast = function (message, action) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
      document.body.appendChild(toastEl);
    }
    toastEl.innerHTML = "<span>" + TRH.esc(message) + "</span>";
    if (action) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = action.label;
      btn.addEventListener("click", function () {
        hideToast();
        action.onClick();
      });
      toastEl.appendChild(btn);
    }
    // Re-trigger the transition even when a toast is already showing.
    void toastEl.offsetWidth;
    toastEl.classList.add("is-open");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, action ? 7000 : 3200);
  };

  function hideToast() {
    clearTimeout(toastTimer);
    if (toastEl) toastEl.classList.remove("is-open");
  }

  /* --- Misc helpers ------------------------------------------------------ */

  TRH.formatDate = function (iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString("en-CH", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  };

  TRH.download = function (filename, text, mime) {
    var blob = new Blob([text], { type: mime || "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  };

  /* --- Boot -------------------------------------------------------------- */

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  ready(function () {
    initTheme();
    var y = document.querySelector("[data-current-year]");
    if (y) y.textContent = String(new Date().getFullYear());
  });
})(window.TRH);
