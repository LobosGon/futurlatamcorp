/**
 * chile-parcels-leaflet.js
 *
 * Renders the Valle de los Olivos KMZ data on a Leaflet map with Esri
 * satellite imagery, preserving the original layer organisation:
 *
 *   - demarcation : white parcel/road lines from "Block Reference [F95F]"
 *   - letter      : reference letter pins (A, B, …)
 *   - sold        : occupied lots (clic abre popup chico sobre el mapa)
 *   - available   : available lots (clic abre popup chico sobre el mapa)
 *   - other       : misc reference points
 *   - photo       : aerial photo placemarks (clic abre el lightbox global)
 *
 * Public API:
 *   window.initChileParcelsLeaflet({
 *     containerId  : "chile-canvas",
 *     geojsonUrl   : "../assets/chile/valle-olivos.geojson",
 *     manifestUrl  : "../assets/chile/parcels.manifest.json",
 *     photoBaseUrl : "../assets/images/mapa/",
 *   });
 *
 *   window.initPhotoGallery("site-gallery", "gallery-lightbox");
 *   // → expone window.openSitePhotoAt(idx, title)
 */
(function (global) {
  "use strict";

  /* ── i18n helpers ────────────────────────────────────────────────────── */
  function getLang() {
    if (typeof global.getFlcLang === "function") return global.getFlcLang();
    var h = (document.documentElement.getAttribute("lang") || "en").toLowerCase();
    return h.indexOf("es") === 0 ? "es" : "en";
  }

  /* ── DOM helpers ─────────────────────────────────────────────────────── */
  function setCount(id, value) {
    document.querySelectorAll("#" + id + ', [data-count="' + id + '"]').forEach(function (el) {
      el.textContent = String(value);
    });
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  /* ── Marker icon factories ───────────────────────────────────────────── */

  // Letter / zone pin — a square chip with the letter inside (clearly NOT a circle)
  function makeLetterIcon(L, letter) {
    return L.divIcon({
      className: "kmz-pin kmz-pin--letter",
      html: '<span class="kmz-pin__chip">' + escapeHtml(letter) + "</span>",
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  }

  // Available parcel — classic teardrop map pin with the number inside
  function makeAvailableIcon(L, label) {
    return L.divIcon({
      className: "kmz-pin kmz-pin--available",
      html:
        '<span class="kmz-pin__teardrop">' +
          '<span class="kmz-pin__num">' + escapeHtml(label || "") + "</span>" +
        "</span>",
      iconSize: [30, 38],
      iconAnchor: [15, 36],
    });
  }

  // Sold parcel — small circular badge (less prominent than available)
  function makeSoldIcon(L, label) {
    return L.divIcon({
      className: "kmz-pin kmz-pin--sold",
      html:
        '<span class="kmz-pin__dot">' +
          '<span class="kmz-pin__num">' + escapeHtml(label || "") + "</span>" +
        "</span>",
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
  }

  // Reference / "other" point — tiny dot
  function makeReferenceIcon(L) {
    return L.divIcon({
      className: "kmz-pin kmz-pin--reference",
      html: '<span class="kmz-pin__dot"></span>',
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });
  }

  // Photo placemark — refined camera icon in a bright disc
  function makePhotoIcon(L) {
    return L.divIcon({
      className: "kmz-pin kmz-pin--photo",
      html:
        '<span class="kmz-pin__camera">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>' +
        '<circle cx="12" cy="13" r="4"></circle>' +
        "</svg>" +
        "</span>",
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
  }

  /* ── Map error overlay ───────────────────────────────────────────────── */
  function showMapError(container, message) {
    var box = document.createElement("div");
    box.className = "kmz-map-error";
    box.textContent = message || "Could not load map data.";
    container.appendChild(box);
  }

  /* ── Main init ───────────────────────────────────────────────────────── */
  function init(opts) {
    opts = opts || {};
    var L = global.L;
    if (!L) { console.error("[chile-leaflet] Leaflet not loaded"); return; }

    var containerId  = opts.containerId  || "chile-canvas";
    var geojsonUrl   = opts.geojsonUrl   || "../assets/chile/valle-olivos.geojson";
    var photoBaseUrl = opts.photoBaseUrl || "../assets/images/mapa/";

    var container = document.getElementById(containerId);
    if (!container) { console.error("[chile-leaflet] missing container"); return; }

    fetch(geojsonUrl)
      .then(function (r) { return r.ok ? r.json() : { type: "FeatureCollection", features: [] }; })
      .then(buildMap)
      .catch(function (err) {
        console.error("[chile-leaflet]", err);
        var errNode = document.querySelector("[data-i18n='cl.projects.map_error']");
        showMapError(container, errNode ? errNode.textContent : "Could not load map data.");
      });

    function buildMap(fc) {
      var features = (fc && fc.features) || [];

      var minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
      features.forEach(function (f) {
        walkCoords(f.geometry, function (c) {
          if (c[0] < minLng) minLng = c[0];
          if (c[1] < minLat) minLat = c[1];
          if (c[0] > maxLng) maxLng = c[0];
          if (c[1] > maxLat) maxLat = c[1];
        });
      });

      if (!Number.isFinite(minLng)) {
        showMapError(container, "No data to display.");
        return;
      }

      var initialBounds = L.latLngBounds([minLat, minLng], [maxLat, maxLng]).pad(0.04);

      var map = L.map(container, {
        zoomControl: true,
        attributionControl: true,
        preferCanvas: true,
        maxZoom: 21,
        minZoom: 1,
      }).fitBounds(initialBounds);

      var initialZoom = map.getBoundsZoom(initialBounds);
      map.setMinZoom(initialZoom);

      var FitControl = L.Control.extend({
        options: { position: "topleft" },
        onAdd: function () {
          var btn = L.DomUtil.create("a", "leaflet-bar leaflet-control kmz-fit-btn");
          btn.href = "#";
          btn.title = "Encuadrar el mapa";
          btn.setAttribute("role", "button");
          btn.setAttribute("aria-label", "Encuadrar el mapa");
          btn.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
              '<path d="M4 9V4h5"></path><path d="M20 9V4h-5"></path>' +
              '<path d="M4 15v5h5"></path><path d="M20 15v5h-5"></path>' +
            "</svg>";
          L.DomEvent.disableClickPropagation(btn);
          L.DomEvent.on(btn, "click", function (e) {
            L.DomEvent.stop(e);
            map.fitBounds(initialBounds);
          });
          return btn;
        },
      });
      new FitControl().addTo(map);

      var esri = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          maxZoom: 21,
          maxNativeZoom: 19,
          attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics",
        }
      ).addTo(map);

      var osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors",
      });

      L.control.layers(
        { "Satélite": esri, "Mapa": osm },
        null,
        { position: "topright", collapsed: true }
      ).addTo(map);

      var lineRenderer = L.canvas({ padding: 0.5 });

      var demarcationLayer = L.featureGroup().addTo(map);
      var letterLayer      = L.featureGroup().addTo(map);
      var soldLayer        = L.featureGroup().addTo(map);
      var availableLayer   = L.featureGroup().addTo(map);
      var otherLayer       = L.featureGroup().addTo(map);
      var photoLayer       = L.featureGroup().addTo(map);

      var counts = { available: 0, sold: 0, reference: 0, photo: 0, lines: 0 };

      features.forEach(function (f) {
        var geom = f.geometry || {};
        var props = f.properties || {};
        var cat = props.category;

        if (cat === "demarcation") {
          if (geom.type === "MultiLineString" || geom.type === "LineString") {
            var coords = geom.type === "LineString" ? [geom.coordinates] : geom.coordinates;
            coords.forEach(function (line) {
              if (!line || line.length < 2) return;
              counts.lines++;
              var latlngs = line.map(function (c) { return [c[1], c[0]]; });
              L.polyline(latlngs, {
                renderer: lineRenderer,
                color: "#ffffff",
                weight: 1,
                opacity: 0.65,
                interactive: false,
              }).addTo(demarcationLayer);
            });
          }
          return;
        }

        if (!geom.coordinates || geom.type !== "Point") return;
        var lng = geom.coordinates[0];
        var lat = geom.coordinates[1];
        var name = props.name || "";

        if (cat === "letter") {
          counts.reference++;
          var mLetter = L.marker([lat, lng], {
            icon: makeLetterIcon(L, name),
            interactive: true,
            riseOnHover: true,
            keyboard: false,
          });
          mLetter.bindTooltip(name, { direction: "top", offset: [0, -8], opacity: 0.9 });
          mLetter.addTo(letterLayer);
          return;
        }

        if (cat === "sold") {
          counts.sold++;
          var mSold = L.marker([lat, lng], {
            icon: makeSoldIcon(L, name),
            riseOnHover: true,
          });
          mSold.bindTooltip(
            (getLang() === "es" ? "Vendida " : "Sold ") + name,
            { direction: "top", offset: [0, -14], opacity: 0.92 }
          );
          mSold.addTo(soldLayer);
          return;
        }

        if (cat === "available") {
          counts.available++;
          var mAvail = L.marker([lat, lng], {
            icon: makeAvailableIcon(L, name),
            riseOnHover: true,
          });
          mAvail.bindTooltip(
            (getLang() === "es" ? "Disponible " : "Available ") + name,
            { direction: "top", offset: [0, -38], opacity: 0.92 }
          );
          mAvail.addTo(availableLayer);
          return;
        }

        if (cat === "other") {
          counts.reference++;
          var mOther = L.marker([lat, lng], {
            icon: makeReferenceIcon(L),
            riseOnHover: true,
          });
          if (name) mOther.bindTooltip(name, { direction: "top", offset: [0, -8] });
          mOther.addTo(otherLayer);
          return;
        }

        if (cat === "photo") {
          counts.photo++;
          var photoFile = (props.photo || "").split("/").pop();
          var photoIdx  = SITE_PHOTOS.findIndex(function (p) { return p.endsWith(photoFile); });
          var mPhoto = L.marker([lat, lng], {
            icon: makePhotoIcon(L),
            riseOnHover: true,
          });
          mPhoto.bindTooltip(name || "Foto", { direction: "top", offset: [0, -18], opacity: 0.92 });
          mPhoto.on("click", function () {
            if (typeof global.openSitePhotoAt === "function" && photoIdx >= 0) {
              global.openSitePhotoAt(photoIdx, name);
            } else if (props.photo) {
              // fallback: open the photo in a new tab if the gallery isn't ready
              global.open(photoBaseUrl + props.photo, "_blank");
            }
          });
          mPhoto.addTo(photoLayer);
          return;
        }
      });

      /* ── Counts ──────────────────────────────────────────── */
      setCount("parcel-count-available", counts.available);
      setCount("parcel-count-sold",      counts.sold);
      setCount("parcel-count-reference", counts.reference);
      setCount("parcel-count-linework",  counts.lines);

      /* ── Filters ─────────────────────────────────────────── */
      function applyFilter(status) {
        var f = status || "available";
        document.querySelectorAll("[data-parcel-filter]").forEach(function (btn) {
          btn.classList.toggle("is-active", btn.getAttribute("data-parcel-filter") === f);
        });

        var showAvailable = f === "all" || f === "available";
        var showSold      = f === "all" || f === "sold";
        var showLetters   = f === "all" || f === "available";
        var showPhoto     = f === "all" || f === "available";
        var showOther     = f === "all";

        toggleLayer(map, availableLayer, showAvailable);
        toggleLayer(map, soldLayer,      showSold);
        toggleLayer(map, letterLayer,    showLetters);
        toggleLayer(map, otherLayer,     showOther);
        toggleLayer(map, photoLayer,     showPhoto);
      }

      document.querySelectorAll("[data-parcel-filter]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          applyFilter(btn.getAttribute("data-parcel-filter"));
        });
      });

      /* ── Resize observer for the container ───────────────── */
      if (global.ResizeObserver) {
        new global.ResizeObserver(function () { map.invalidateSize(); }).observe(container);
      }

      /* ── Initial state: filter 'Disponibles' active ──────── */
      applyFilter("available");

      setTimeout(function () {
        map.invalidateSize();
        map.fitBounds(initialBounds);
        map.setMinZoom(map.getBoundsZoom(initialBounds));
      }, 60);
    }
  }

  function toggleLayer(map, layer, show) {
    if (show) { if (!map.hasLayer(layer)) layer.addTo(map); }
    else      { if (map.hasLayer(layer))  map.removeLayer(layer); }
  }

  function walkCoords(geom, fn) {
    if (!geom) return;
    switch (geom.type) {
      case "Point":           fn(geom.coordinates); break;
      case "LineString":      geom.coordinates.forEach(fn); break;
      case "MultiLineString": geom.coordinates.forEach(function (line) { line.forEach(fn); }); break;
      case "Polygon":         geom.coordinates.forEach(function (ring) { ring.forEach(fn); }); break;
      case "MultiPolygon":    geom.coordinates.forEach(function (poly) { poly.forEach(function (ring) { ring.forEach(fn); }); }); break;
    }
  }

  /* ── Photo gallery grid + lightbox ──────────────────────────────────── */
  var SITE_PHOTOS = [
    "../assets/images/mapa/104-DJI_0459.jpg",
    "../assets/images/mapa/105-DJI_0460-1.jpg",
    "../assets/images/mapa/40-DJI_0089.jpg",
    "../assets/images/mapa/83-DJI_0407.jpg",
    "../assets/images/mapa/91-MTF_7372-1.jpg",
  ];

  function initPhotoGallery(stripId, lightboxId) {
    var strip    = document.getElementById(stripId);
    var lightbox = document.getElementById(lightboxId);
    if (!lightbox) return;

    var imgEl     = lightbox.querySelector("#gallery-img");
    var closeEl   = lightbox.querySelector("#gallery-close");
    var prevEl    = lightbox.querySelector("#gallery-prev");
    var nextEl    = lightbox.querySelector("#gallery-next");
    var counterEl = lightbox.querySelector("#gallery-counter");
    var current   = 0;
    var lastTitle = "";

    function setCounter() {
      if (!counterEl) return;
      counterEl.textContent =
        (lastTitle ? lastTitle + "  ·  " : "") +
        (current + 1) + " / " + SITE_PHOTOS.length;
    }

    function openAt(idx) {
      current = (idx + SITE_PHOTOS.length) % SITE_PHOTOS.length;
      imgEl.src = SITE_PHOTOS[current];
      setCounter();
      lightbox.classList.remove("hidden");
      document.body.style.overflow = "hidden";
    }
    function close() {
      lightbox.classList.add("hidden");
      document.body.style.overflow = "";
      imgEl.src = "";
      lastTitle = "";
    }

    if (strip) {
      SITE_PHOTOS.forEach(function (src, i) {
        var thumb = document.createElement("button");
        thumb.className = "gallery-thumb";
        thumb.setAttribute("aria-label", "Ampliar foto " + (i + 1));

        var img = document.createElement("img");
        img.src = src;
        img.alt = "Vista aérea Valle de los Olivos " + (i + 1);
        img.loading = "lazy";
        img.decoding = "async";

        var overlay = document.createElement("span");
        overlay.className = "gallery-thumb-overlay";
        overlay.setAttribute("aria-hidden", "true");
        overlay.innerHTML = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='11' cy='11' r='8'/><line x1='21' y1='21' x2='16.65' y2='16.65'/><line x1='11' y1='8' x2='11' y2='14'/><line x1='8' y1='11' x2='14' y2='11'/></svg>";

        thumb.appendChild(img);
        thumb.appendChild(overlay);
        thumb.addEventListener("click", function () { lastTitle = ""; openAt(i); });
        strip.appendChild(thumb);
      });
    }

    closeEl && closeEl.addEventListener("click", close);
    prevEl  && prevEl.addEventListener("click",  function () { openAt(current - 1); });
    nextEl  && nextEl.addEventListener("click",  function () { openAt(current + 1); });

    lightbox.addEventListener("click", function (e) {
      if (e.target === lightbox) close();
    });

    document.addEventListener("keydown", function (e) {
      if (lightbox.classList.contains("hidden")) return;
      if (e.key === "Escape")     close();
      if (e.key === "ArrowLeft")  openAt(current - 1);
      if (e.key === "ArrowRight") openAt(current + 1);
    });

    global.openSitePhotoAt = function (idx, title) {
      lastTitle = title || "";
      openAt(idx);
    };
  }

  global.initChileParcelsLeaflet = init;
  global.initPhotoGallery        = initPhotoGallery;

})(typeof window !== "undefined" ? window : this);
