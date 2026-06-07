(function () {
  "use strict";

  var mqReduce =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function setCssVar(el, name, value) {
    if (el) el.style.setProperty(name, value);
  }

  function initNav() {
    var nav = document.querySelector(".site-nav");
    var btn = document.querySelector("[data-nav-toggle]");
    var drawer = document.querySelector("[data-mobile-drawer]");
    var close = document.querySelector("[data-nav-close]");
    var root = document.documentElement;
    var body = document.body;

    function setScrolled() {
      root.classList.toggle("nav-scrolled", window.scrollY > 48);
    }
    setScrolled();
    window.addEventListener("scroll", setScrolled, { passive: true });

    function closeMenu() {
      if (body) body.classList.remove("menu-open");
      if (drawer) drawer.classList.remove("is-open");
      if (btn) btn.setAttribute("aria-expanded", "false");
    }

    if (btn && drawer) {
      btn.addEventListener("click", function () {
        var open = !drawer.classList.contains("is-open");
        drawer.classList.toggle("is-open", open);
        if (body) body.classList.toggle("menu-open", open);
        btn.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }

    if (close) close.addEventListener("click", closeMenu);

    if (drawer) {
      drawer.querySelectorAll("a").forEach(function (link) {
        link.addEventListener("click", closeMenu);
      });
    }
    return nav;
  }

  function initReveal() {
    if (mqReduce) {
      document.querySelectorAll("[data-reveal]").forEach(function (el) {
        el.classList.add("is-visible");
      });
      return;
    }
    var els = Array.prototype.slice.call(document.querySelectorAll("[data-reveal]"));
    if (!("IntersectionObserver" in window)) {
      els.forEach(function (el) {
        el.classList.add("is-visible");
      });
      return;
    }
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    els.forEach(function (el) {
      io.observe(el);
    });
  }

  function initParallaxHero() {
    if (mqReduce) return;

    var section = document.querySelector("[data-hero-parallax]");
    var layer = document.querySelector(".hero-parallax-media");
    if (!section || !layer) return;

    function tick() {
      var rect = section.getBoundingClientRect();
      var vh = window.innerHeight || 1;
      var progress = Math.min(Math.max(-rect.top / rect.height, 0), 1.65);
      var y = -(progress * vh * 0.12);
      layer.style.transform = "translate3d(-50%, " + y + "px, 0) scale(1.08)";
    }

    tick();
    window.addEventListener("scroll", tick, { passive: true });
    window.addEventListener("resize", tick);
  }

  function initVideoPlaybackRates() {
    document.querySelectorAll("video[data-playback-rate]").forEach(function (video) {
      var rate = Number(video.getAttribute("data-playback-rate"));
      if (!Number.isFinite(rate) || rate <= 0) return;

      function applyRate() {
        try {
          video.playbackRate = rate;
        } catch (_) {}
      }

      applyRate();
      video.addEventListener("loadedmetadata", applyRate);
      video.addEventListener("play", applyRate);
    });
  }

  function initParallaxSections() {
    if (mqReduce) return;
    var nodes = Array.prototype.slice.call(document.querySelectorAll("[data-parallax-inner]"));
    if (!nodes.length) return;

    function tick() {
      nodes.forEach(function (inner) {
        var outer = inner.parentElement;
        if (!outer) return;
        var speed = Number(inner.getAttribute("data-speed") || 0.12);
        var rect = outer.getBoundingClientRect();
        var vh = window.innerHeight || 1;
        var center = rect.top + rect.height / 2;
        var offset = center - vh / 2;
        var shift = -(offset * speed);
        inner.style.transform = "translate3d(0," + shift + "px,0)";
      });
    }

    tick();
    window.addEventListener("scroll", tick, { passive: true });
    window.addEventListener("resize", tick);
  }

  function initMediaCards() {
    document.querySelectorAll(".media-card").forEach(function (card) {
      var vid = card.querySelector("video.loop-video");
      if (!vid || mqReduce || card.classList.contains("floor-plan-trigger")) return;

      function play() {
        card.classList.add("is-playing");
        var playPromise = vid.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(function () {});
        }
      }

      function pauseReset() {
        card.classList.remove("is-playing");
        try {
          vid.pause();
          vid.currentTime = 0;
        } catch (_) {}
      }

      card.addEventListener("mouseenter", play);
      card.addEventListener("mouseleave", pauseReset);
      card.addEventListener("focusin", play);
      card.addEventListener("focusout", pauseReset);
    });
  }

  function initHoverSlideshows() {
    if (mqReduce) return;

    var intervals = new WeakMap();

    function parseImages(attr) {
      if (!attr) return [];
      return attr
        .split(",")
        .map(function (s) {
          var src = s.trim();
          if (src.indexOf("assets/") === 0) return "../" + src;
          return src;
        })
        .filter(Boolean);
    }

    function preloadAll(list) {
      return Promise.all(
        list.map(function (src) {
          return new Promise(function (resolve) {
            var p = new Image();
            p.decoding = "async";
            p.loading = "eager";
            p.onload = function () {
              resolve(true);
            };
            p.onerror = function () {
              resolve(false);
            };
            p.src = src;
          });
        }),
      );
    }

    function fadeSwap(img, nextSrc) {
      if (!img || !nextSrc) return;
      if (img.dataset && img.dataset._slideSrc === nextSrc) return;
      if (img.dataset) img.dataset._slideSrc = nextSrc;

      // Smooth swap to avoid flicker (especially on first hover)
      img.style.opacity = "0";
      window.requestAnimationFrame(function () {
        img.src = nextSrc;
        if (img.decode) {
          img
            .decode()
            .catch(function () {})
            .finally(function () {
              img.style.opacity = "";
            });
        } else {
          window.setTimeout(function () {
            img.style.opacity = "";
          }, 140);
        }
      });
    }

    function start(el) {
      if (!el || intervals.has(el)) return;

      var img = el.querySelector("img.poster-img");
      if (!img) return;

      // If a video exists, we let video hover logic handle it.
      if (el.querySelector("video.loop-video")) return;

      var list = parseImages(el.getAttribute("data-hover-images"));
      if (list.length < 2) return;

      // Preload before starting to reduce flicker.
      preloadAll(list);

      var i = 0;
      var id = window.setInterval(function () {
        i = (i + 1) % list.length;
        fadeSwap(img, list[i]);
      }, 900);

      intervals.set(el, { id: id, img: img, first: list[0] });
    }

    function stop(el) {
      var state = intervals.get(el);
      if (!state) return;
      window.clearInterval(state.id);
      try {
        fadeSwap(state.img, state.first);
      } catch (_) {}
      intervals.delete(el);
    }

    document.querySelectorAll("[data-hover-images]").forEach(function (el) {
      el.addEventListener("mouseenter", function () {
        start(el);
      });
      el.addEventListener("mouseleave", function () {
        stop(el);
      });
      el.addEventListener("focusin", function () {
        start(el);
      });
      el.addEventListener("focusout", function () {
        stop(el);
      });
    });
  }

  function initFloorPlanModal() {
    var dlg = document.getElementById("floor-modal");
    if (!dlg || !window.HTMLDialogElement) return;

    var img = dlg.querySelector("[data-floor-modal-img]");
    document.querySelectorAll("[data-floor-open]").forEach(function (trigger) {
      trigger.addEventListener("click", function (e) {
        e.preventDefault();
        var src = trigger.getAttribute("data-floor-src") || "";
        var alt = trigger.getAttribute("data-floor-alt") || "";
        if (src && img) {
          img.src = src;
          img.alt = alt;
        }
        if (dlg.showModal) dlg.showModal();
      });
    });

    dlg.querySelectorAll("[data-floor-close]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        dlg.close();
      });
    });
  }

  function initCardLinks() {
    document.querySelectorAll("[data-card-link]").forEach(function (card) {
      var href = card.getAttribute("data-card-link");
      if (!href) return;

      // Accessibility
      if (!card.hasAttribute("tabindex")) card.setAttribute("tabindex", "0");
      if (!card.hasAttribute("role")) card.setAttribute("role", "link");

      function shouldIgnore(e) {
        var t = e.target;
        if (!t || !(t instanceof Element)) return false;
        return Boolean(
          t.closest("button") ||
            t.closest("a") ||
            t.closest("[data-floor-open]") ||
            t.closest("[data-floor-close]"),
        );
      }

      card.addEventListener("click", function (e) {
        if (shouldIgnore(e)) return;
        window.location.href = href;
      });

      card.addEventListener("keydown", function (e) {
        if (shouldIgnore(e)) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          window.location.href = href;
        }
      });
    });
  }

  function initMailtoForms() {
    document.querySelectorAll("form[data-mailto-form]").forEach(function (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();

        var to = form.getAttribute("data-mailto-to") || "contact@futurlatamcorp.com";
        var subject = form.getAttribute("data-mailto-subject") || "New inquiry — Futur Latam Corp";

        var fd = new FormData(form);
        var name = String(fd.get("name") || "").trim();
        var email = String(fd.get("email") || "").trim();
        var company = String(fd.get("company") || "").trim();
        var phone = String(fd.get("phone") || "").trim();
        var topic = String(fd.get("topic") || "").trim();
        var message = String(fd.get("message") || "").trim();

        var lines = [];
        if (name) lines.push("Name: " + name);
        if (email) lines.push("Email: " + email);
        if (company) lines.push("Company: " + company);
        if (phone) lines.push("Phone: " + phone);
        if (topic) lines.push("Topic: " + topic);
        lines.push("");
        if (message) lines.push(message);

        var body = encodeURIComponent(lines.join("\n"));
        var mailto =
          "mailto:" + encodeURIComponent(to) + "?subject=" + encodeURIComponent(subject) + "&body=" + body;

        window.location.href = mailto;
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  function boot() {
    initNav();
    initReveal();
    initVideoPlaybackRates();
    initParallaxHero();
    initParallaxSections();
    initMediaCards();
    initHoverSlideshows();
    initCardLinks();
    initMailtoForms();
    initFloorPlanModal();
  }
})();
