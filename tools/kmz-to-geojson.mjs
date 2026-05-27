/**
 * kmz-to-geojson.mjs
 *
 * Converts the Valle de los Olivos KML (exported from a KMZ) into a
 * compact GeoJSON FeatureCollection that Leaflet can render directly.
 *
 * Folders / categories recognised:
 *   - Block Reference [F95F]  → lineas (parcel/road demarcations) — visible
 *   - Block Reference [71C9]  → skipped (hidden in Google Earth)
 *   - Letras                  → reference letter pins (A, B, C…)
 *   - Ocupados                → sold lots
 *   - Disponibles             → available lots
 *   - OTROS                   → misc reference points
 *   - IMAGENES                → photo placemarks (description holds <img>)
 *
 * Usage:
 *   node tools/kmz-to-geojson.mjs
 *
 * Input  : assets/images/mapa/doc.kml
 * Output : assets/chile/valle-olivos.geojson
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const SRC = resolve(ROOT, "assets/images/mapa/doc.kml");
const OUT = resolve(ROOT, "assets/chile/valle-olivos.geojson");

/* ── helpers ───────────────────────────────────────────────────────────── */

function decodeXml(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseCoordsBlock(text) {
  // KML coords come as "lng,lat[,alt] lng,lat[,alt] …" separated by whitespace
  const pts = [];
  text
    .trim()
    .split(/\s+/)
    .forEach((tuple) => {
      if (!tuple) return;
      const parts = tuple.split(",");
      const lng = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      if (Number.isFinite(lng) && Number.isFinite(lat)) pts.push([lng, lat]);
    });
  return pts;
}

/** Try to merge contiguous line segments into longer polylines (cuts node count). */
function mergeSegments(segments, tolerance = 1e-7) {
  if (!segments.length) return [];
  const remaining = segments.map((s) => s.slice());
  const out = [];
  while (remaining.length) {
    let current = remaining.shift();
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < remaining.length; i++) {
        const seg = remaining[i];
        const head = current[0];
        const tail = current[current.length - 1];
        const sHead = seg[0];
        const sTail = seg[seg.length - 1];
        const close = (a, b) =>
          Math.abs(a[0] - b[0]) < tolerance && Math.abs(a[1] - b[1]) < tolerance;
        if (close(tail, sHead)) {
          current = current.concat(seg.slice(1));
          remaining.splice(i, 1);
          grew = true;
          break;
        }
        if (close(tail, sTail)) {
          current = current.concat(seg.slice().reverse().slice(1));
          remaining.splice(i, 1);
          grew = true;
          break;
        }
        if (close(head, sTail)) {
          current = seg.concat(current.slice(1));
          remaining.splice(i, 1);
          grew = true;
          break;
        }
        if (close(head, sHead)) {
          current = seg.slice().reverse().concat(current.slice(1));
          remaining.splice(i, 1);
          grew = true;
          break;
        }
      }
    }
    if (current.length >= 2) out.push(current);
  }
  return out;
}

/* ── streaming KML parser tailored to this file ────────────────────────── */

function* iterateTags(kml, tag) {
  const open = `<${tag}`;
  const close = `</${tag}>`;
  let i = 0;
  while (i < kml.length) {
    const start = kml.indexOf(open, i);
    if (start === -1) return;
    // Find end of opening tag '>'
    const openEnd = kml.indexOf(">", start);
    if (openEnd === -1) return;
    // Check for self-closing tag (rare for these elements)
    if (kml[openEnd - 1] === "/") {
      i = openEnd + 1;
      continue;
    }
    const end = kml.indexOf(close, openEnd + 1);
    if (end === -1) return;
    yield { start, end: end + close.length, inner: kml.slice(openEnd + 1, end) };
    i = end + close.length;
  }
}

function firstTagText(xml, tag) {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const a = xml.indexOf(open);
  if (a === -1) return "";
  const b = xml.indexOf(close, a + open.length);
  if (b === -1) return "";
  return xml.slice(a + open.length, b).trim();
}

function firstTagInnerCdata(xml, tag) {
  const raw = firstTagText(xml, tag);
  const m = raw.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return m ? m[1] : raw;
}

function extractImgSrc(html) {
  if (!html) return "";
  const m = html.match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i);
  return m ? m[1] : "";
}

/** Read the *direct* name of a Folder/Placemark block — the first <name> in its top-level content (not inside a nested <Folder>/<Placemark>). */
function directName(inner) {
  // Search for the first <name> that appears before any nested <Folder> or <Placemark>
  const firstFolder = inner.indexOf("<Folder");
  const firstPlace  = inner.indexOf("<Placemark");
  let limit = inner.length;
  if (firstFolder !== -1) limit = Math.min(limit, firstFolder);
  if (firstPlace  !== -1) limit = Math.min(limit, firstPlace);
  const head = inner.slice(0, limit);
  const m = head.match(/<name>([\s\S]*?)<\/name>/);
  return m ? m[1].trim() : "";
}

/** Slice every <Folder>…</Folder> in `xml` (only the top-level ones at the current depth). */
function* topLevelFolders(xml) {
  let i = 0;
  while (i < xml.length) {
    const start = xml.indexOf("<Folder", i);
    if (start === -1) return;
    const headEnd = xml.indexOf(">", start);
    let depth = 1;
    let cursor = headEnd + 1;
    while (depth > 0 && cursor < xml.length) {
      const nextOpen = xml.indexOf("<Folder", cursor);
      const nextClose = xml.indexOf("</Folder>", cursor);
      if (nextClose === -1) return;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        cursor = xml.indexOf(">", nextOpen) + 1;
      } else {
        depth--;
        cursor = nextClose + "</Folder>".length;
      }
    }
    const inner = xml.slice(headEnd + 1, cursor - "</Folder>".length);
    yield { inner, name: directName(inner) };
    i = cursor;
  }
}

/** Recursively find a folder by name anywhere in the KML tree. */
function extractFolderByName(xml, name) {
  for (const folder of topLevelFolders(xml)) {
    if (folder.name === name) return folder.inner;
    const nested = extractFolderByName(folder.inner, name);
    if (nested) return nested;
  }
  return null;
}

/* ── main extraction ───────────────────────────────────────────────────── */

function parsePlacemarks(folderXml, defaultCategory) {
  const features = [];
  let cursor = 0;
  while (cursor < folderXml.length) {
    const start = folderXml.indexOf("<Placemark", cursor);
    if (start === -1) break;
    const endTag = "</Placemark>";
    const end = folderXml.indexOf(endTag, start);
    if (end === -1) break;
    const xml = folderXml.slice(start, end + endTag.length);
    cursor = end + endTag.length;

    // Skip hidden placemarks
    if (/<visibility>\s*0\s*<\/visibility>/.test(xml)) continue;

    const name = firstTagText(xml, "name");
    const description = firstTagInnerCdata(xml, "description");
    const photo = extractImgSrc(description);

    // Points
    const pointMatch = xml.match(/<Point[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/Point>/);
    if (pointMatch) {
      const pts = parseCoordsBlock(pointMatch[1]);
      if (pts.length) {
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: pts[0] },
          properties: {
            name,
            category: defaultCategory,
            photo: photo || undefined,
            description: description || undefined,
          },
        });
        continue;
      }
    }

    // LineStrings (inside or outside MultiGeometry — we treat all the same)
    const lineSegments = [];
    let lsCursor = 0;
    while (true) {
      const ls = xml.indexOf("<LineString", lsCursor);
      if (ls === -1) break;
      const co = xml.indexOf("<coordinates>", ls);
      const coEnd = xml.indexOf("</coordinates>", co);
      if (co === -1 || coEnd === -1) break;
      const pts = parseCoordsBlock(xml.slice(co + "<coordinates>".length, coEnd));
      if (pts.length >= 2) lineSegments.push(pts);
      lsCursor = coEnd + "</coordinates>".length;
    }
    if (lineSegments.length) {
      const merged = mergeSegments(lineSegments);
      if (merged.length === 1) {
        features.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: merged[0] },
          properties: { category: defaultCategory },
        });
      } else if (merged.length > 1) {
        features.push({
          type: "Feature",
          geometry: { type: "MultiLineString", coordinates: merged },
          properties: { category: defaultCategory },
        });
      }
    }

    // Polygons (outerBoundaryIs/LinearRing)
    const polyRings = [];
    let pgCursor = 0;
    while (true) {
      const pg = xml.indexOf("<Polygon", pgCursor);
      if (pg === -1) break;
      const pgEnd = xml.indexOf("</Polygon>", pg);
      if (pgEnd === -1) break;
      const polyXml = xml.slice(pg, pgEnd);
      const ringMatch = polyXml.match(/<coordinates>([\s\S]*?)<\/coordinates>/);
      if (ringMatch) {
        const pts = parseCoordsBlock(ringMatch[1]);
        if (pts.length >= 3) polyRings.push([pts]);
      }
      pgCursor = pgEnd + "</Polygon>".length;
    }
    if (polyRings.length === 1) {
      features.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: polyRings[0] },
        properties: { category: defaultCategory },
      });
    } else if (polyRings.length > 1) {
      features.push({
        type: "Feature",
        geometry: { type: "MultiPolygon", coordinates: polyRings },
        properties: { category: defaultCategory },
      });
    }
  }
  return features;
}

async function main() {
  console.log("[kmz→geojson] reading", SRC);
  const kml = await readFile(SRC, "utf8");

  // Locate the visible Block Reference [F95F] folder
  const blockF95F = extractFolderByName(kml, "Block Reference [F95F]");
  if (!blockF95F) throw new Error("Folder Block Reference [F95F] not found");

  const features = [];

  // 1) Lineas / Polygons from the block reference (excluding the sub-folders inside)
  //    Strip child folders first so we only parse the top-level placemarks
  const blockNoChildren = blockF95F.replace(/<Folder>[\s\S]*?<\/Folder>/g, "");
  const lineFeatures = parsePlacemarks(blockNoChildren, "demarcation");
  console.log("[kmz→geojson] demarcation features:", lineFeatures.length);
  features.push(...lineFeatures);

  // 2) Letras
  const letras = extractFolderByName(blockF95F, "Letras");
  if (letras) {
    const f = parsePlacemarks(letras, "letter");
    console.log("[kmz→geojson] letter pins:", f.length);
    features.push(...f);
  }

  // 3) Ocupados
  const ocupados = extractFolderByName(blockF95F, "Ocupados");
  if (ocupados) {
    const f = parsePlacemarks(ocupados, "sold");
    console.log("[kmz→geojson] sold pins:", f.length);
    features.push(...f);
  }

  // 4) Disponibles
  const disponibles = extractFolderByName(blockF95F, "Disponibles");
  if (disponibles) {
    const f = parsePlacemarks(disponibles, "available");
    console.log("[kmz→geojson] available pins:", f.length);
    features.push(...f);
  }

  // 5) OTROS
  const otros = extractFolderByName(blockF95F, "OTROS");
  if (otros) {
    const f = parsePlacemarks(otros, "other");
    console.log("[kmz→geojson] other pins:", f.length);
    features.push(...f);
  }

  // 6) IMAGENES
  const imagenes = extractFolderByName(blockF95F, "IMAGENES");
  if (imagenes) {
    const f = parsePlacemarks(imagenes, "photo");
    console.log("[kmz→geojson] photo pins:", f.length);
    features.push(...f);
  }

  const fc = { type: "FeatureCollection", features };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(fc));
  console.log("[kmz→geojson] wrote", OUT, "—", features.length, "features");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
