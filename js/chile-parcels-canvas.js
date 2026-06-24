/**
 * chile-parcels-canvas.js
 * Canvas Konva para parcelas Valle de los Olivos.
 * Sin Leaflet, sin tiles OSM, sin JSZip, sin togeojson en runtime.
 *
 * Uso (proyectos.html):
 *   window.initChileParcelsCanvas({
 *     containerId : "chile-canvas",
 *     panelId     : "chile-parcel-panel",
 *     parcelsUrl  : "../assets/chile/parcels.geojson",
 *     linesUrl    : "../assets/chile/parcels-lines.geojson",
 *     manifestUrl : "../assets/chile/parcels.manifest.json",
 *     pinsUrl     : "../assets/chile/doc.kml"
 *   });
 */
(function (global) {
  "use strict";

  /* ── STATUS map ──────────────────────────────────────────────────────── */
  var STATUS = {
    available : { label: { en: "Available",  es: "Disponible" }, color: "#22c55e", fill: "#16a34a", fillAlpha: 0.45 },
    sold      : { label: { en: "Coming soon for sale", es: "Próxima a salir a la venta" }, color: "#facc15", fill: "#d97706", fillAlpha: 0.45 },
    reserved  : { label: { en: "Reserved",   es: "Reservada"  }, color: "#38bdf8", fill: "#0284c7", fillAlpha: 0.40 },
    hold      : { label: { en: "On hold",    es: "En pausa"   }, color: "#f59e0b", fill: "#d97706", fillAlpha: 0.35 },
    reference : { label: { en: "Reference",  es: "Referencial"}, color: "#94a3b8", fill: "#64748b", fillAlpha: 0.30 },
    other     : { label: { en: "Other",      es: "Otro"       }, color: "#7dd3fc", fill: "#38bdf8", fillAlpha: 0.35 },
  };

  function statusInfo(s) { return STATUS[s] || STATUS.available; }

  /* ── i18n helpers ────────────────────────────────────────────────────── */
  function getLang() {
    if (typeof global.getFlcLang === "function") return global.getFlcLang();
    var h = (document.documentElement.getAttribute("lang") || "en").toLowerCase();
    return h.indexOf("es") === 0 ? "es" : "en";
  }

  function pickLocalized(obj, lang) {
    if (obj == null) return "";
    if (typeof obj === "string") return obj;
    return obj[lang] || obj.en || obj.es || "";
  }

  function statusText(status, lang) {
    return pickLocalized(statusInfo(status).label, lang);
  }

  /* ── Asset path resolver ─────────────────────────────────────────────── */
  function resolveAsset(p) {
    if (!p) return "";
    if (/^(https?:|mailto:|tel:)/i.test(p)) return p;
    if (p.indexOf("../") === 0) return p;
    return "../" + p.replace(/^\//, "");
  }

  /* ── DOM helpers ─────────────────────────────────────────────────────── */
  function setCount(id, value) {
    document.querySelectorAll("#" + id + ', [data-count="' + id + '"]').forEach(function (el) {
      el.textContent = String(value);
    });
  }

  function mediaNode(type, src, label) {
    var url = resolveAsset(src);
    if (!url) return null;
    if (type === "video") {
      var v = document.createElement("video");
      v.className = "parcel-media"; v.controls = true; v.preload = "metadata"; v.src = url;
      return v;
    }
    if (type === "link") {
      var a = document.createElement("a");
      a.className = "parcel-action"; a.href = url; a.target = "_blank";
      a.rel = "noopener noreferrer"; a.textContent = label || "Abrir";
      return a;
    }
    var img = document.createElement("img");
    img.className = "parcel-media"; img.src = url; img.alt = label || "";
    img.loading = "lazy"; img.decoding = "async";
    return img;
  }

  /* ── Mini KML parser (solo Point) — detecta folder padre ─────────────── */
  var FOLDER_STATUS = {
    "disponibles": "available",
    "disponible" : "available",
    "ocupados"   : "sold",
    "ocupado"    : "sold",
    "vendidos"   : "sold",
    "letras"     : "reference",
    "letra"      : "reference",
    "otros"      : "other",
    "otro"       : "other",
  };

  function folderNameToStatus(folderName) {
    var key = (folderName || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return FOLDER_STATUS[key] || "reference";
  }

  function parseKmlPoints(xmlText) {
    var dom = new DOMParser().parseFromString(xmlText, "text/xml");
    if (dom.querySelector("parsererror")) return [];
    var out = [];
    // Iterar carpetas para preservar el nombre de la carpeta padre
    var folders = Array.from(dom.querySelectorAll("Folder"));
    if (!folders.length) folders = [null];   // sin carpeta, tratar como top-level
    folders.forEach(function (folder) {
      var folderNameEl = folder ? folder.querySelector(":scope > name, name") : null;
      var folderName   = folderNameEl ? (folderNameEl.textContent || "").trim() : "";
      var status       = folderNameToStatus(folderName);
      var pms = folder
        ? Array.from(folder.querySelectorAll("Placemark"))
        : Array.from(dom.querySelectorAll("Placemark"));
      pms.forEach(function (pm) {
        var pointEl = pm.querySelector("Point");
        if (!pointEl) return;
        var coordEl = pointEl.querySelector("coordinates");
        if (!coordEl) return;
        var parts = (coordEl.textContent || "").trim().split(",");
        var lng = parseFloat(parts[0]);
        var lat = parseFloat(parts[1]);
        if (!isFinite(lng) || !isFinite(lat)) return;
        var nameEl = pm.querySelector("name");
        var name = (nameEl ? nameEl.textContent || "" : "").trim();
        out.push({ name: name, lng: lng, lat: lat, folderStatus: status, folder: folderName });
      });
    });
    return out;
  }

  /* ── Manifest lookup (mirrors keyCandidates from chile-parcels.js) ───── */
  function keyCandidates(name, index) {
    var n = String(index + 1).padStart(2, "0");
    return [name, "LOT-" + n, "PARCEL-" + n, n].filter(Boolean);
  }

  function getEntry(manifest, name, index) {
    var parcels = manifest.parcels || {};
    var found = null;
    keyCandidates(name, index).some(function (k) {
      if (parcels[k]) { found = parcels[k]; return true; }
      return false;
    });
    return found;
  }

  /* ── OSM Tile helpers ────────────────────────────────────────────────── */
  var OSM_ZOOM = 15;
  var TILE_SIZE = 256;

  function lngLatToTileXY(lng, lat, z) {
    var n = Math.pow(2, z);
    var x = Math.floor((lng + 180) / 360 * n);
    var lr = lat * Math.PI / 180;
    var y = Math.floor((1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2 * n);
    return { tx: x, ty: y };
  }

  function tileNWCorner(tx, ty, z) {
    var n = Math.pow(2, z);
    var lng = tx / n * 360 - 180;
    var lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * ty / n))) * 180 / Math.PI;
    return { lng: lng, lat: lat };
  }

  function loadOsmTiles(proj, bbox, tilesLayer, stage) {
    var minLng = bbox[0], minLat = bbox[1], maxLng = bbox[2], maxLat = bbox[3];
    var z = OSM_ZOOM;
    var tMin = lngLatToTileXY(minLng, maxLat, z);   // maxLat → menor ty (norte)
    var tMax = lngLatToTileXY(maxLng, minLat, z);   // minLat → mayor ty (sur)
    var txMin = tMin.tx, txMax = tMax.tx;
    var tyMin = tMin.ty, tyMax = tMax.ty;
    var pending = 0;

    for (var tx = txMin; tx <= txMax; tx++) {
      for (var ty = tyMin; ty <= tyMax; ty++) {
        (function (tx, ty) {
          var nw = tileNWCorner(tx, ty, z);
          var se = tileNWCorner(tx + 1, ty + 1, z);
          var pNW = proj.project(nw.lng, nw.lat);
          var pSE = proj.project(se.lng, se.lat);
          var tileW = pSE.x - pNW.x;
          var tileH = pSE.y - pNW.y;

          var img = new Image();
          img.crossOrigin = "anonymous";
          pending++;
          img.onload = function () {
            var kImg = new global.Konva.Image({
              image: img,
              x: pNW.x, y: pNW.y,
              width: tileW, height: tileH,
              opacity: 0.65,
              listening: false,
              perfectDrawEnabled: false,
            });
            tilesLayer.add(kImg);
            pending--;
            if (pending === 0) {
              tilesLayer.batchDraw();
            }
          };
          img.onerror = function () {
            pending--;
            if (pending === 0) tilesLayer.batchDraw();
          };
          img.src = "https://tile.openstreetmap.org/" + z + "/" + tx + "/" + ty + ".png";
        })(tx, ty);
      }
    }
    if (pending === 0) tilesLayer.batchDraw();
  }

  /* ── Projection (flat linear, aspect-preserved) ──────────────────────── */
  function computeProjection(allCoords, W, H) {
    var minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    allCoords.forEach(function (c) {
      if (c[0] < minLng) minLng = c[0];
      if (c[1] < minLat) minLat = c[1];
      if (c[0] > maxLng) maxLng = c[0];
      if (c[1] > maxLat) maxLat = c[1];
    });
    var PAD = 32;
    var geoW = maxLng - minLng;
    var geoH = maxLat - minLat;
    if (!geoW || !geoH) { return null; }
    var availW = W - PAD * 2;
    var availH = H - PAD * 2;
    var scaleX = availW / geoW;
    var scaleY = availH / geoH;
    var scale  = Math.min(scaleX, scaleY);
    var offX = PAD + (availW - geoW * scale) / 2;
    var offY = PAD + (availH - geoH * scale) / 2;

    return {
      project: function (lng, lat) {
        return {
          x: offX + (lng - minLng) * scale,
          y: offY + (maxLat - lat) * scale,   // y invertido
        };
      },
      bbox: [minLng, minLat, maxLng, maxLat],
      scale: scale,
      offX: offX,
      offY: offY,
      geoW: geoW,
      geoH: geoH,
    };
  }

  /* ── Collect all coordinates from GeoJSON features ───────────────────── */
  function collectCoords(features) {
    var out = [];
    features.forEach(function (f) {
      walkGeomCoords(f.geometry, function (c) { out.push(c); });
    });
    return out;
  }

  function walkGeomCoords(geom, fn) {
    if (!geom) return;
    switch (geom.type) {
      case "Point": fn(geom.coordinates); break;
      case "LineString": geom.coordinates.forEach(fn); break;
      case "MultiLineString": geom.coordinates.forEach(function (r) { r.forEach(fn); }); break;
      case "Polygon": geom.coordinates.forEach(function (r) { r.forEach(fn); }); break;
      case "MultiPolygon": geom.coordinates.forEach(function (p) { p.forEach(function (r) { r.forEach(fn); }); }); break;
      case "GeometryCollection": (geom.geometries || []).forEach(function (g) { walkGeomCoords(g, fn); }); break;
    }
  }

  /* ── Hex color + alpha → Konva rgba string ───────────────────────────── */
  function hexAlpha(hex, alpha) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
  }

  /* ── Panel rendering ─────────────────────────────────────────────────── */
  function makePanelRenderer(panelId) {
    var panel        = document.getElementById(panelId);
    var emptyEl      = document.getElementById("chile-parcel-empty");
    var contentEl    = document.getElementById("chile-parcel-content");
    var statusEl     = document.getElementById("chile-parcel-status");
    var titleEl      = document.getElementById("chile-parcel-title");
    var numberEl     = document.getElementById("chile-parcel-number");
    var notesEl      = document.getElementById("chile-parcel-notes");
    var metaEl       = document.getElementById("chile-parcel-meta");
    var mediaEl      = document.getElementById("chile-parcel-media");
    var actionsEl    = document.getElementById("chile-parcel-actions");

    function showEmpty() {
      if (emptyEl)  { emptyEl.classList.remove("hidden", "is-loading", "is-error"); }
      if (contentEl) contentEl.classList.add("hidden");
    }

    function setPanelLoading(on) {
      if (!emptyEl) return;
      if (on) {
        emptyEl.classList.remove("hidden");
        emptyEl.classList.add("is-loading");
        emptyEl.classList.remove("is-error");
        if (contentEl) contentEl.classList.add("hidden");
      } else {
        emptyEl.classList.remove("is-loading");
      }
    }

    function showError(msg) {
      if (!emptyEl) return;
      emptyEl.classList.remove("hidden", "is-loading");
      emptyEl.classList.add("is-error");
      var errP = emptyEl.querySelector("[data-chile-map-error]");
      if (!errP) {
        errP = document.createElement("p");
        errP.className = "font-sans text-sm leading-relaxed text-red-300/90";
        errP.setAttribute("data-chile-map-error", "");
        emptyEl.appendChild(errP);
      }
      errP.textContent = msg || "Could not load data.";
      if (contentEl) contentEl.classList.add("hidden");
    }

    var ALLOWED_META = ["proyecto", "estado", "uso", "m2", "superficie"];

    function renderParcel(entry) {
      if (!entry) return;
      var lang = getLang();
      if (emptyEl)  emptyEl.classList.add("hidden");
      if (contentEl) contentEl.classList.remove("hidden");
      if (statusEl) {
        statusEl.textContent = statusText(entry.status, lang);
        statusEl.setAttribute("data-status", entry.status);
      }
      if (numberEl) numberEl.textContent = entry.number || "";
      if (titleEl)  titleEl.textContent  = pickLocalized(entry.title, lang) || "Parcela " + (entry.number || "");
      if (notesEl)  notesEl.textContent  = "";

      if (metaEl) {
        metaEl.innerHTML = "";
        Object.keys(entry.meta || {}).forEach(function (k) {
          if (ALLOWED_META.indexOf(k.toLowerCase()) === -1) return;
          var wrap = document.createElement("div");
          wrap.className = "parcel-meta";
          var dt = document.createElement("dt"); dt.textContent = k;
          var dd = document.createElement("dd"); dd.textContent = pickLocalized(entry.meta[k], lang);
          wrap.appendChild(dt); wrap.appendChild(dd);
          metaEl.appendChild(wrap);
        });
      }

      // Scroll panel into view on mobile
      if (panel && window.innerWidth < 1024) {
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }

    return { renderParcel: renderParcel, showEmpty: showEmpty, setPanelLoading: setPanelLoading, showError: showError };
  }

  /* ── Main init ───────────────────────────────────────────────────────── */
  function init(opts) {
    opts = opts || {};
    var containerId  = opts.containerId  || "chile-canvas";
    var panelId      = opts.panelId      || "chile-parcel-panel";
    var parcelsUrl   = opts.parcelsUrl   || "../assets/chile/parcels.geojson";
    var linesUrl     = opts.linesUrl     || "../assets/chile/parcels-lines.geojson";
    var manifestUrl  = opts.manifestUrl  || "../assets/chile/parcels.manifest.json";
    var pinsUrl      = opts.pinsUrl      || "";

    var container = document.getElementById(containerId);
    if (!container || !global.Konva) {
      console.error("[chile-canvas] Falta contenedor o Konva");
      return;
    }

    var panel = makePanelRenderer(panelId);
    panel.setPanelLoading(true);

    /* ── Load all inputs ─────────────────────────────────── */
      var promises = [
      fetch(parcelsUrl).then(function (r) { return r.ok ? r.json() : { type: "FeatureCollection", features: [] }; }),
      fetch(linesUrl).then(function (r)   { return r.ok ? r.json() : { type: "FeatureCollection", features: [] }; }),
      fetch(manifestUrl).then(function (r){ return r.ok ? r.json() : { parcels: {} }; }),
      pinsUrl
        ? fetch(pinsUrl).then(function (r) { return r.ok ? r.text() : ""; }).then(parseKmlPoints)
        : Promise.resolve([]),
    ];

    Promise.all(promises).then(function (results) {
      var parcelsFC = results[0];
      var linesFC   = results[1];
      var manifest  = results[2] || { parcels: {} };
      var pins      = results[3] || [];

      panel.setPanelLoading(false);

      /* ── Determine container size ─────────────────────── */
      var W = container.clientWidth  || 800;
      var H = container.clientHeight || 600;
      if (H < 200) H = Math.max(window.innerHeight * 0.62, 400);

      /* ── Compute projection from all coordinates ──────── */
      var allCoords = collectCoords(parcelsFC.features)
        .concat(collectCoords(linesFC.features));
      pins.forEach(function (p) { allCoords.push([p.lng, p.lat]); });

      var proj = computeProjection(allCoords, W, H);
      if (!proj) {
        panel.showError("No se pudo calcular la proyección.");
        return;
      }

      /* ── Build Konva stage ────────────────────────────── */
      var stage = new global.Konva.Stage({ container: containerId, width: W, height: H });
      var tilesLayer  = new global.Konva.Layer({ listening: false });
      var linesLayer  = new global.Konva.Layer({ listening: false });
      var polysLayer  = new global.Konva.Layer({ listening: false });
      var pinsLayer   = new global.Konva.Layer();                       // circles — interactive
      var labelsLayer = new global.Konva.Layer({ listening: false });   // text labels — no events
      stage.add(tilesLayer);
      stage.add(linesLayer);
      stage.add(polysLayer);
      stage.add(pinsLayer);
      stage.add(labelsLayer);

      /* ── OSM tiles (background) ───────────────────────── */
      loadOsmTiles(proj, proj.bbox, tilesLayer, stage);

      /* ── OSM attribution (HTML overlay, siempre fijo) ────────────────── */
      (function () {
        var wrap = container.parentElement || container;
        if (getComputedStyle(wrap).position === "static") wrap.style.position = "relative";
        var attr = document.createElement("a");
        attr.href = "https://www.openstreetmap.org/copyright";
        attr.target = "_blank";
        attr.rel = "noopener noreferrer";
        attr.textContent = "\u00a9 OpenStreetMap contributors";
        attr.style.cssText = [
          "position:absolute", "bottom:6px", "left:6px",
          "font-size:10px", "font-family:Inter,system-ui,sans-serif",
          "color:rgba(255,255,255,0.85)",
          "text-shadow:0 1px 3px rgba(0,0,0,0.7)",
          "text-decoration:none", "pointer-events:auto", "z-index:10",
        ].join(";");
        wrap.appendChild(attr);
      })();

      /* ── Fit-view helper ──────────────────────────────── */
      var minScale = 0.4;   // se actualiza al primer fitView()

      function fitView() {
        var contentW = proj.geoW * proj.scale;
        var contentH = proj.geoH * proj.scale;
        var fitScale = Math.min(W / (contentW + 64), H / (contentH + 64));
        var newScale = Math.min(fitScale, 3);
        // El fit-scale se convierte en el mínimo: no se puede alejar más que la vista completa
        minScale = newScale;
        var cx = W / 2 - ((proj.offX + contentW / 2) * newScale);
        var cy = H / 2 - ((proj.offY + contentH / 2) * newScale);
        stage.scale({ x: newScale, y: newScale });
        stage.position({ x: cx, y: cy });
        stage.batchDraw();
      }

      /* ── Pan + zoom ───────────────────────────────────── */
      stage.draggable(true);

      stage.on("wheel", function (e) {
        e.evt.preventDefault();
        var oldScale = stage.scaleX();
        var pointer  = stage.getPointerPosition();
        var mousePointTo = {
          x: (pointer.x - stage.x()) / oldScale,
          y: (pointer.y - stage.y()) / oldScale,
        };
        var direction = e.evt.deltaY < 0 ? 1 : -1;
        var factor    = 1.08;
        var newScale  = direction > 0 ? oldScale * factor : oldScale / factor;
        newScale = Math.max(minScale, Math.min(10, newScale));
        stage.scale({ x: newScale, y: newScale });
        stage.position({
          x: pointer.x - mousePointTo.x * newScale,
          y: pointer.y - mousePointTo.y * newScale,
        });
        stage.batchDraw();
      });

      stage.on("dblclick dbltap", function () { fitView(); });

      /* ── Draw demarcation lines ───────────────────────── */
      linesFC.features.forEach(function (f) {
        var coords = f.geometry && f.geometry.coordinates;
        if (!coords || coords.length < 2) return;
        var pts = [];
        coords.forEach(function (c) {
          var p = proj.project(c[0], c[1]);
          pts.push(p.x, p.y);
        });
        linesLayer.add(new global.Konva.Line({
          points: pts,
          stroke: "rgba(255,255,255,0.45)",
          strokeWidth: 1,
          perfectDrawEnabled: false,
        }));
      });
      linesLayer.batchDraw();

      /* ── Draw parcel outlines (visual only, no click) ────────────────── */
      parcelsFC.features.forEach(function (f) {
        var ring = f.geometry && f.geometry.coordinates && f.geometry.coordinates[0];
        if (!ring || ring.length < 3) return;
        var pts = [];
        ring.forEach(function (c) {
          var p = proj.project(c[0], c[1]);
          pts.push(p.x, p.y);
        });
        polysLayer.add(new global.Konva.Line({
          points: pts,
          closed: true,
          fill: "rgba(255,255,255,0.04)",   // casi transparente — solo demarcación
          stroke: "rgba(255,255,255,0.55)",
          strokeWidth: 1.2,
          listening: false,
          perfectDrawEnabled: false,
        }));
      });
      polysLayer.batchDraw();

      /* ── Build lot→entry map from parcels manifest ───────────────────── */
      var lotEntryMap = {};
      parcelsFC.features.forEach(function (f, idx) {
        var props = f.properties || {};
        var name  = String(props.name || "");
        var entry = getEntry(manifest, name, idx);
        if (!entry) {
          entry = {
            number: String(idx + 1).padStart(2, "0"),
            status: "reference",
            title: { en: "Parcel " + name, es: "Parcela " + name },
            notes: { en: "No manifest entry.", es: "Sin entrada en el manifiesto." },
            meta: {},
            photos: [],
          };
        }
        var num = parseInt(name.replace(/\D/g, ""), 10);
        if (num >= 1 && num <= 17) lotEntryMap[num] = entry;
      });

      /* ── Draw pins (todos los pines del KML = clickeables) ────────────── */
      var records      = [];
      var selected     = null;
      var activeFilter = "all";
      var counts       = { available: 0, sold: 0, reserved: 0, hold: 0, reference: 0, other: 0 };

      pins.forEach(function (pin) {
        var p    = proj.project(pin.lng, pin.lat);
        var lotNum = parseInt(pin.name, 10);
        var entry  = lotNum >= 1 && lotNum <= 17 ? lotEntryMap[lotNum] : null;
        // Usar el estado de la carpeta KML como color del pin;
        // si hay entrada en el manifest, usarla para el panel lateral
        var st     = pin.folderStatus || (entry ? entry.status : "reference");
        var info   = statusInfo(st);
        var isAvailable = st === "available";
        var PIN_RADIUS  = 5;   // radio uniforme para TODOS los pines
        var lblOffset   = PIN_RADIUS + 2;

        var circ = new global.Konva.Circle({
          x: p.x, y: p.y,
          radius: PIN_RADIUS,
          fill: info.fill,
          stroke: isAvailable ? "#facc15" : "rgba(255,255,255,0.55)",
          strokeWidth: 1,
          hitStrokeWidth: isAvailable ? 12 : 0,  // área de click 3× mayor para disponibles
          listening: isAvailable,
        });

        pinsLayer.add(circ);

        if (isAvailable) {
          var lbl = new global.Konva.Text({
            x: p.x - 14, y: p.y + lblOffset,
            text: pin.name,
            fontSize: 8,
            fontStyle: "bold",
            fontFamily: "Inter, system-ui, sans-serif",
            fill: "#000",
            shadowColor: "rgba(255,255,255,0.9)", shadowBlur: 3,
            width: 28, align: "center",
            listening: false,
          });
          labelsLayer.add(lbl);
        } else {
          var lbl = null;
        }

        // Entrada minimal para pines sin manifest
        var effectiveEntry = entry || {
          number: pin.name,
          status: st,
          title: { en: "Lot " + pin.name, es: "Lote " + pin.name },
          notes: { en: "", es: "" },
          meta: {},
          photos: [],
        };

        if (counts[effectiveEntry.status] !== undefined) counts[effectiveEntry.status]++;

        var record = { entry: effectiveEntry, circ: circ, lbl: lbl, baseRadius: PIN_RADIUS };
        records.push(record);

        if (isAvailable) {
          circ.on("mouseenter", function () {
            stage.container().style.cursor = "pointer";
            if (record !== selected) {
              circ.radius(PIN_RADIUS + 3);
              circ.strokeWidth(2);
              pinsLayer.batchDraw();
            }
          });
          circ.on("mouseleave", function () {
            stage.container().style.cursor = "";
            if (record !== selected) {
              circ.radius(PIN_RADIUS);
              circ.strokeWidth(1);
              pinsLayer.batchDraw();
            }
          });
          circ.on("click tap", function () {
            selected = record;
            updateParcelStyles();
            panel.renderParcel(effectiveEntry);
          });
        }
      });

      pinsLayer.batchDraw();
      labelsLayer.batchDraw();

      /* ── Update counts ────────────────────────────────── */
      setCount("parcel-count-available",  counts.available);
      setCount("parcel-count-sold",       counts.sold);
      setCount("parcel-count-reference",  counts.reference);
      setCount("parcel-count-linework",   linesFC.features.length);

      /* ── Style helper para estado activo / atenuado ──────────────────── */
      function updateParcelStyles() {
        records.forEach(function (rec) {
          var isActive    = rec === selected;
          var isMuted     = activeFilter !== "all"
                          && rec.entry.status !== activeFilter
                          && rec.entry.status !== "reference";
          var isAvailable = rec.entry.status === "available";
          var info        = statusInfo(rec.entry.status);
          rec.circ.fill(isMuted ? "rgba(120,120,120,0.35)" : info.fill);
          rec.circ.radius(isActive ? 5 + 3 : 5);
          rec.circ.strokeWidth(isActive ? 2 : 1);
          rec.circ.stroke(isActive ? "#fff" : (isAvailable ? "#facc15" : "rgba(255,255,255,0.55)"));
          rec.circ.opacity(isMuted ? 0.28 : 1);
          if (rec.lbl) rec.lbl.opacity(isMuted ? 0.22 : 1);
        });
        pinsLayer.batchDraw();
        labelsLayer.batchDraw();
      }

      /* ── Filter buttons ───────────────────────────────── */
      function applyFilter(status) {
        activeFilter = status || "all";
        document.querySelectorAll("[data-parcel-filter]").forEach(function (btn) {
          btn.classList.toggle("is-active", btn.getAttribute("data-parcel-filter") === activeFilter);
        });
        updateParcelStyles();
      }

      document.querySelectorAll("[data-parcel-filter]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          applyFilter(btn.getAttribute("data-parcel-filter"));
        });
      });

      /* ── Language change ──────────────────────────────── */
      global.addEventListener("flc-lang-change", function () {
        if (selected) panel.renderParcel(selected.entry);
      });

      /* ── Resize observer ──────────────────────────────── */
      if (global.ResizeObserver) {
        new global.ResizeObserver(function () {
          var nW = container.clientWidth;
          var nH = container.clientHeight || H;
          if (nW < 10 || nH < 10) return;
          stage.width(nW);
          stage.height(nH);
          stage.batchDraw();
        }).observe(container);
      }

      /* ── Initial fit ──────────────────────────────────── */
      fitView();

      /* Auto-select first available parcel */
      var firstAvailable = records.filter(function (r) { return r.entry.status === "available"; })[0];
      if (firstAvailable) {
        selected = firstAvailable;
        updateParcelStyles();
        panel.renderParcel(firstAvailable.entry);
      } else if (records.length) {
        selected = records[0];
        updateParcelStyles();
        panel.renderParcel(records[0].entry);
      }

    }).catch(function (err) {
      console.error("[chile-canvas]", err);
      panel.setPanelLoading(false);
      var errNode = document.querySelector("[data-i18n='cl.projects.map_error']");
      panel.showError(errNode ? errNode.textContent : "Could not load map data.");
    });
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
    if (!strip || !lightbox) return;

    var imgEl      = lightbox.querySelector("#gallery-img");
    var closeEl    = lightbox.querySelector("#gallery-close");
    var prevEl     = lightbox.querySelector("#gallery-prev");
    var nextEl     = lightbox.querySelector("#gallery-next");
    var counterEl  = lightbox.querySelector("#gallery-counter");
    var current    = 0;

    function openAt(idx) {
      current = (idx + SITE_PHOTOS.length) % SITE_PHOTOS.length;
      imgEl.src = SITE_PHOTOS[current];
      if (counterEl) counterEl.textContent = (current + 1) + " / " + SITE_PHOTOS.length;
      lightbox.classList.remove("hidden");
      document.body.style.overflow = "hidden";
    }
    function close() {
      lightbox.classList.add("hidden");
      document.body.style.overflow = "";
      imgEl.src = "";
    }

    SITE_PHOTOS.forEach(function (src, i) {
      var thumb = document.createElement("button");
      thumb.className = "gallery-thumb";
      thumb.setAttribute("aria-label", "Ampliar foto " + (i + 1));

      var img = document.createElement("img");
      img.src = src;
      img.alt = "Vista aérea Valle de los Olivos " + (i + 1);
      img.loading = "lazy";
      img.decoding = "async";

      // ícono de lupa al hacer hover
      var overlay = document.createElement("span");
      overlay.className = "gallery-thumb-overlay";
      overlay.setAttribute("aria-hidden", "true");
      overlay.innerHTML = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='11' cy='11' r='8'/><line x1='21' y1='21' x2='16.65' y2='16.65'/><line x1='11' y1='8' x2='11' y2='14'/><line x1='8' y1='11' x2='14' y2='11'/></svg>";

      thumb.appendChild(img);
      thumb.appendChild(overlay);
      thumb.addEventListener("click", function () { openAt(i); });
      strip.appendChild(thumb);
    });

    closeEl && closeEl.addEventListener("click", close);
    prevEl  && prevEl.addEventListener("click",  function () { openAt(current - 1); });
    nextEl  && nextEl.addEventListener("click",  function () { openAt(current + 1); });

    lightbox.addEventListener("click", function (e) {
      if (e.target === lightbox) close();
    });

    document.addEventListener("keydown", function (e) {
      if (lightbox.classList.contains("hidden")) return;
      if (e.key === "Escape")      close();
      if (e.key === "ArrowLeft")   openAt(current - 1);
      if (e.key === "ArrowRight")  openAt(current + 1);
    });
  }

  global.initChileParcelsCanvas = init;
  global.initPhotoGallery       = initPhotoGallery;

})(typeof window !== "undefined" ? window : this);
