(function () {
  "use strict";

  var STORAGE_KEY = "flc_lang";
  var DEFAULT_LANG = "en";
  var LOCALE_VERSION = "20260623-cl-projects-i18n";

  function getScriptUrl() {
    var s = document.currentScript;
    if (s && s.src) return s.src;
    var el = document.querySelector('script[src*="i18n.js"]');
    return el && el.src ? el.src : "";
  }

  function localeUrl(lang) {
    var base = getScriptUrl();
    var url = base ? new URL("./locales/" + lang + ".json", base).href : "js/locales/" + lang + ".json";
    return url + (url.indexOf("?") >= 0 ? "&" : "?") + "v=" + LOCALE_VERSION;
  }

  function bundledScriptUrl() {
    var base = getScriptUrl();
    var url = base ? new URL("./locales/bundled-locales.js", base).href : "js/locales/bundled-locales.js";
    return url + (url.indexOf("?") >= 0 ? "&" : "?") + "v=" + LOCALE_VERSION;
  }

  function isFileProtocol() {
    try {
      return typeof location !== "undefined" && location.protocol === "file:";
    } catch (_) {
      return false;
    }
  }

  var bundledInjected = null;

  function injectBundledLocales() {
    if (typeof window !== "undefined" && window.__FLC_LOCALES && window.__FLC_LOCALES.en && window.__FLC_LOCALES.es) {
      dictCache.en = window.__FLC_LOCALES.en;
      dictCache.es = window.__FLC_LOCALES.es;
      return Promise.resolve(window.__FLC_LOCALES);
    }
    if (bundledInjected) return bundledInjected;
    bundledInjected = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = bundledScriptUrl();
      s.async = true;
      s.onload = function () {
        if (typeof window !== "undefined" && window.__FLC_LOCALES && window.__FLC_LOCALES.en && window.__FLC_LOCALES.es) {
          dictCache.en = window.__FLC_LOCALES.en;
          dictCache.es = window.__FLC_LOCALES.es;
          resolve(window.__FLC_LOCALES);
        } else {
          reject(new Error("FLC bundled locales missing"));
        }
      };
      s.onerror = function () {
        reject(new Error("FLC bundled locales load failed"));
      };
      document.head.appendChild(s);
    });
    return bundledInjected;
  }

  function getLang() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "en" || stored === "es") return stored;
    } catch (_) {}
    var htmlLang = (document.documentElement.getAttribute("lang") || "en").toLowerCase();
    return htmlLang.indexOf("es") === 0 ? "es" : "en";
  }

  var dictCache = { en: null, es: null };
  var dict = {};

  function loadLocale(lang) {
    if (dictCache[lang]) return Promise.resolve(dictCache[lang]);
    function fromBundled() {
      return injectBundledLocales().then(function () {
        return dictCache[lang];
      });
    }
    if (isFileProtocol()) {
      return fromBundled();
    }
    return fetch(localeUrl(lang))
      .then(function (r) {
        if (!r.ok) throw new Error("bad status");
        return r.json();
      })
      .then(function (json) {
        var d = json && json.strings ? json.strings : json;
        dictCache[lang] = d;
        return d;
      })
      .catch(function () {
        return fromBundled();
      });
  }

  function setLang(lang) {
    if (lang !== "en" && lang !== "es") return;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (_) {}
    document.documentElement.setAttribute("lang", lang);
    loadLocale(lang)
      .then(function (d) {
        dict = d;
        apply(lang);
        updateLangSwitchUI(lang);
        try {
          window.dispatchEvent(new CustomEvent("flc-lang-change", { detail: { lang: lang } }));
        } catch (_) {}
      })
      .catch(function () {
        updateLangSwitchUI(lang);
      });
  }

  function updateLangSwitchUI(lang) {
    document.querySelectorAll("[data-lang-switch] .lang-toggle").forEach(function (btn) {
      var v = btn.getAttribute("data-set-lang");
      var on = v === lang;
      btn.classList.toggle("bg-brand-gold/20", on);
      btn.classList.toggle("text-brand-gold", on);
      btn.classList.toggle("text-white/70", !on);
    });
    document.querySelectorAll(".chile-lang .lang-toggle").forEach(function (btn) {
      var v = btn.getAttribute("data-set-lang");
      var on = v === lang;
      btn.classList.toggle("bg-white/15", on);
      btn.classList.toggle("text-white", on);
      btn.classList.toggle("text-red-100/70", !on);
    });
  }

  function patchMiamiNav() {
    if (!document.querySelector('header.site-nav a[href="residential.html"]')) return;
    if (document.querySelector("header.site-nav.chile-nav")) return;
    document.querySelectorAll("header.site-nav nav a[href]").forEach(function (a) {
      if (a.querySelector("img")) return;
      var href = (a.getAttribute("href") || "").split("#")[0];
      if (href.indexOf("../") === 0) return;
      if (href === "index.html") a.setAttribute("data-i18n", "nav.home");
      else if (href === "residential.html") a.setAttribute("data-i18n", "nav.projects");
      else if (href === "projects.html") a.setAttribute("data-i18n", "nav.land");
      else if (href === "about.html") a.setAttribute("data-i18n", "nav.about");
      else if (href === "contact.html" && !a.classList.contains("chile-inquire-btn")) a.setAttribute("data-i18n", "nav.contact");
    });
    document.querySelectorAll("aside[data-mobile-drawer] a[href]").forEach(function (a) {
      var href = (a.getAttribute("href") || "").split("#")[0];
      if (href.indexOf("../") === 0) return;
      if (href === "index.html") a.setAttribute("data-i18n", "nav.home");
      else if (href === "residential.html") a.setAttribute("data-i18n", "nav.projects");
      else if (href === "projects.html") a.setAttribute("data-i18n", "nav.land");
      else if (href === "about.html") a.setAttribute("data-i18n", "nav.about");
      else if (href === "contact.html" && !a.classList.contains("chile-inquire-btn")) a.setAttribute("data-i18n", "nav.contact");
    });
  }

  function patchChileNav() {
    if (!document.querySelector("header.site-nav.chile-nav")) return;
    document.querySelectorAll("header.site-nav.chile-nav nav a[href]").forEach(function (a) {
      if (a.querySelector("img")) return;
      var href = (a.getAttribute("href") || "").split("#")[0];
      if (href === "index.html") a.setAttribute("data-i18n", "nav.home");
      else if (href === "projects.html") a.setAttribute("data-i18n", "nav.projects");
      else if (href === "parcels.html") a.setAttribute("data-i18n", "nav.parcels");
      else if (href === "about.html") a.setAttribute("data-i18n", "nav.about");
      else if (href === "contact.html" && !a.classList.contains("chile-inquire-btn")) a.setAttribute("data-i18n", "nav.contact");
    });
    document.querySelectorAll("aside[data-mobile-drawer] a[href]").forEach(function (a) {
      var href = (a.getAttribute("href") || "").split("#")[0];
      if (href.indexOf("../") === 0) return;
      if (href === "index.html") a.setAttribute("data-i18n", "nav.home");
      else if (href === "projects.html") a.setAttribute("data-i18n", "nav.projects");
      else if (href === "parcels.html") a.setAttribute("data-i18n", "nav.parcels");
      else if (href === "about.html") a.setAttribute("data-i18n", "nav.about");
      else if (href === "contact.html" && !a.classList.contains("chile-inquire-btn")) a.setAttribute("data-i18n", "nav.contact");
    });
  }

  function t(key, lang) {
    var v = dict[key];
    if (v == null) return null;
    if (typeof v === "string") return v;
    if (typeof v === "object" && v[lang]) return v[lang];
    if (typeof v === "object" && v.en) return v.en;
    return null;
  }

  function apply(lang) {
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      if (!key) return;
      var val = t(key, lang);
      if (val == null) return;
      var attr = el.getAttribute("data-i18n-attr");
      if (attr) el.setAttribute(attr, val);
      else el.textContent = val;
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-placeholder");
      if (!key) return;
      var val = t(key, lang);
      if (val != null) el.setAttribute("placeholder", val);
    });
  }

  function initLangSwitch() {
    document.querySelectorAll("[data-lang-switch]").forEach(function (wrap) {
      wrap.querySelectorAll("[data-set-lang]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var lang = btn.getAttribute("data-set-lang");
          setLang(lang);
        });
      });
    });
  }

  function boot() {
    var lang = getLang();
    document.documentElement.setAttribute("lang", lang);
    patchMiamiNav();
    patchChileNav();
    loadLocale(lang)
      .then(function (d) {
        dict = d;
        apply(lang);
        updateLangSwitchUI(lang);
      })
      .catch(function () {
        dict = {};
      })
      .finally(function () {
        initLangSwitch();
        updateLangSwitchUI(lang);
      });
  }

  window.setLang = setLang;
  window.getFlcLang = getLang;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
