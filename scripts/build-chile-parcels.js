#!/usr/bin/env node
/*
 * Offline preprocesamiento para Valle de los Olivos.
 *
 * Entrada:  assets/chile/parcels.kml (MultiGeometry de LineString sueltos)
 * Salida:   assets/chile/parcels-lines.geojson  (FeatureCollection<LineString>, líneas snap-eadas)
 *           assets/chile/parcels.geojson        (FeatureCollection<Polygon>, top 17 por área)
 *
 * Uso:
 *   npm install --no-save @xmldom/xmldom @turf/polygonize @turf/area @turf/centroid
 *   node scripts/build-chile-parcels.js
 *
 * El script no se ejecuta en runtime: los GeoJSON resultantes se commitean.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const KML_PATH = path.join(ROOT, "assets/chile/parcels.kml");
const LINES_OUT = path.join(ROOT, "assets/chile/parcels-lines.geojson");
const POLYS_OUT = path.join(ROOT, "assets/chile/parcels.geojson");

const SNAP_TOLERANCE = 1e-5; // ≈ 1 metro (más laxo que 1e-6 para cerrar gaps reales)
const MIN_AREA_M2 = 200;     // descarta caras chiquitas (artefactos)
const KEEP_LARGEST = 17;     // máximo de parcelas a quedarse

function loadDeps() {
  let DOMParser, polygonize, area, centroid;
  try {
    ({ DOMParser } = require("@xmldom/xmldom"));
  } catch (err) {
    fail("Falta @xmldom/xmldom. Instala con `npm i --no-save @xmldom/xmldom`");
  }
  try {
    polygonize = require("@turf/polygonize").default || require("@turf/polygonize");
  } catch (err) {
    fail("Falta @turf/polygonize. Instala con `npm i --no-save @turf/polygonize`");
  }
  try {
    area = require("@turf/area").default || require("@turf/area");
  } catch (err) {
    fail("Falta @turf/area. Instala con `npm i --no-save @turf/area`");
  }
  try {
    centroid = require("@turf/centroid").default || require("@turf/centroid");
  } catch (err) {
    fail("Falta @turf/centroid. Instala con `npm i --no-save @turf/centroid`");
  }
  return { DOMParser, polygonize, area, centroid };
}

function fail(msg) {
  console.error("[build-chile-parcels] " + msg);
  process.exit(1);
}

function parseKml(xml, DOMParser) {
  const parser = new DOMParser({
    onError: (level, msg) => {
      if (level === "fatalError") throw new Error(msg);
    },
  });
  return parser.parseFromString(xml, "text/xml");
}

function getAllElementsByTagName(node, tag) {
  // El xmldom mock soporta getElementsByTagName.
  return Array.from(node.getElementsByTagName(tag));
}

function readCoordinates(coordsText) {
  if (!coordsText) return [];
  return coordsText
    .trim()
    .split(/\s+/)
    .map(triplet => {
      const parts = triplet.split(",");
      if (parts.length < 2) return null;
      const lng = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
      return [lng, lat];
    })
    .filter(Boolean);
}

function snapCoord(c, tol) {
  // Cuantiza al múltiplo más cercano de tol.
  return [
    Math.round(c[0] / tol) * tol,
    Math.round(c[1] / tol) * tol,
  ];
}

function dedupeRing(ring) {
  const out = [];
  let prevKey = null;
  for (const c of ring) {
    const key = c[0].toFixed(8) + "," + c[1].toFixed(8);
    if (key !== prevKey) {
      out.push(c);
      prevKey = key;
    }
  }
  return out;
}

function extractLineStrings(doc) {
  const lineNodes = getAllElementsByTagName(doc, "LineString");
  const lines = [];
  for (const node of lineNodes) {
    const coordsEl = node.getElementsByTagName("coordinates")[0];
    if (!coordsEl) continue;
    const coords = readCoordinates(coordsEl.textContent || coordsEl.firstChild?.data || "");
    if (coords.length >= 2) lines.push(coords);
  }
  return lines;
}

function snapAllLines(lines, tol) {
  const snapped = [];
  const seenEdges = new Set();
  for (const raw of lines) {
    const ring = dedupeRing(raw.map(c => snapCoord(c, tol)));
    if (ring.length < 2) continue;

    // Filtra LineStrings degeneradas y dedupea aristas (A↔B == B↔A).
    let kept = [];
    for (let i = 0; i < ring.length - 1; i += 1) {
      const a = ring[i];
      const b = ring[i + 1];
      const ka = a[0].toFixed(8) + "," + a[1].toFixed(8);
      const kb = b[0].toFixed(8) + "," + b[1].toFixed(8);
      if (ka === kb) continue;
      const edgeKey = ka < kb ? ka + "|" + kb : kb + "|" + ka;
      if (seenEdges.has(edgeKey)) continue;
      seenEdges.add(edgeKey);

      if (!kept.length) kept.push(a);
      else if (kept[kept.length - 1][0] !== a[0] || kept[kept.length - 1][1] !== a[1]) {
        // Hueco interno: empuja la línea acumulada y arranca otra.
        snapped.push(kept);
        kept = [a];
      }
      kept.push(b);
    }
    if (kept.length >= 2) snapped.push(kept);
  }
  return snapped;
}

function toLineFeatureCollection(lines) {
  return {
    type: "FeatureCollection",
    features: lines.map((coords, i) => ({
      type: "Feature",
      id: i,
      properties: {},
      geometry: { type: "LineString", coordinates: coords },
    })),
  };
}

function bboxOfCoords(features) {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const f of features) {
    walkCoords(f.geometry, ([lng, lat]) => {
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    });
  }
  return [minLng, minLat, maxLng, maxLat];
}

function walkCoords(geom, fn) {
  if (!geom) return;
  if (geom.type === "Point") fn(geom.coordinates);
  else if (geom.type === "LineString" || geom.type === "MultiPoint") geom.coordinates.forEach(fn);
  else if (geom.type === "Polygon" || geom.type === "MultiLineString") {
    geom.coordinates.forEach(ring => ring.forEach(fn));
  } else if (geom.type === "MultiPolygon") {
    geom.coordinates.forEach(poly => poly.forEach(ring => ring.forEach(fn)));
  }
}

function rankPolygons(polysFC, { area, centroid }) {
  const features = polysFC.features.map(f => {
    const a = area(f);
    const c = centroid(f).geometry.coordinates;
    return { feature: f, area: a, centroid: c };
  });
  features.sort((a, b) => b.area - a.area);
  return features;
}

function pickLots(ranked, n) {
  // Descarta áreas minúsculas
  const usable = ranked.filter(r => r.area >= MIN_AREA_M2);
  // Excluye el contorno exterior si es notoriamente más grande que el segundo
  if (usable.length >= 2 && usable[0].area > usable[1].area * 4) {
    usable.shift();
  }
  return usable.slice(0, n);
}

function assignLotNames(picked) {
  // Ordena por centroide: lat DESC, lng ASC.
  const sorted = picked.slice().sort((a, b) => {
    if (b.centroid[1] !== a.centroid[1]) return b.centroid[1] - a.centroid[1];
    return a.centroid[0] - b.centroid[0];
  });
  sorted.forEach((r, i) => {
    const id = "LOT-" + String(i + 1).padStart(2, "0");
    r.feature.properties = Object.assign({}, r.feature.properties, {
      name: id,
      number: String(i + 1).padStart(2, "0"),
      areaM2: Math.round(r.area),
      centroid: [Number(r.centroid[0].toFixed(6)), Number(r.centroid[1].toFixed(6))],
    });
    r.feature.id = id;
  });
  return sorted.map(r => r.feature);
}

function writeJSON(file, value) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

function main() {
  if (!fs.existsSync(KML_PATH)) fail("No existe " + path.relative(ROOT, KML_PATH));

  const deps = loadDeps();
  const xml = fs.readFileSync(KML_PATH, "utf8");
  const doc = parseKml(xml, deps.DOMParser);

  const rawLines = extractLineStrings(doc);
  console.log("[build-chile-parcels] LineStrings leídos:", rawLines.length);
  if (!rawLines.length) fail("No se encontraron <LineString> dentro del KML.");

  const snapped = snapAllLines(rawLines, SNAP_TOLERANCE);
  console.log("[build-chile-parcels] LineStrings tras snap+dedupe:", snapped.length);

  const linesFC = toLineFeatureCollection(snapped);
  const linesBbox = bboxOfCoords(linesFC.features);
  console.log("[build-chile-parcels] bbox líneas:", linesBbox.map(v => v.toFixed(6)).join(", "));

  writeJSON(LINES_OUT, linesFC);
  console.log("[build-chile-parcels] Escrito " + path.relative(ROOT, LINES_OUT));

  let polysFC;
  try {
    polysFC = deps.polygonize(linesFC);
  } catch (err) {
    fail("polygonize falló: " + err.message);
  }
  console.log("[build-chile-parcels] Polígonos resultantes:", polysFC.features.length);

  const ranked = rankPolygons(polysFC, deps);
  const picked = pickLots(ranked, KEEP_LARGEST);
  console.log("[build-chile-parcels] Top " + picked.length + " por área (m²):");
  picked.forEach((p, i) => {
    console.log("  #" + (i + 1).toString().padStart(2, "0"),
      "area=" + p.area.toFixed(1),
      "centroid=" + p.centroid.map(v => v.toFixed(5)).join(","));
  });

  const lots = assignLotNames(picked);
  const polysOut = { type: "FeatureCollection", features: lots };
  writeJSON(POLYS_OUT, polysOut);
  console.log("[build-chile-parcels] Escrito " + path.relative(ROOT, POLYS_OUT));
}

main();
