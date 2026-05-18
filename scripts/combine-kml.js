// Combina los cuatro KML de pines (Disponibles / Ocupados / Letras / OTROS) en doc.kml
"use strict";
const fs = require("fs");
const path = require("path");

const TRANSCRIPT = "C:/Users/Lenovo/.cursor/projects/c-xampp-htdocs-futur-futurlatamcorp/agent-transcripts/eb2a6a64-4d23-4ccc-a0aa-ff954857c3a3/eb2a6a64-4d23-4ccc-a0aa-ff954857c3a3.jsonl";
const OUT = path.resolve(__dirname, "../assets/chile/doc.kml");

function unescape(raw) {
  return raw
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function extractKmlsFromLine(lineStr) {
  const txt = JSON.parse(lineStr);
  const raw = JSON.stringify(txt);
  const re = /<\?xml[\s\S]*?<\/kml>/g;
  const out = [];
  let m;
  while ((m = re.exec(raw)) !== null) {
    out.push(unescape(m[0]));
  }
  return out;
}

function getFolder(kml) {
  const m = kml.match(/<Folder>[\s\S]*<\/Folder>/);
  return m ? m[0] : "";
}

const lines = fs.readFileSync(TRANSCRIPT, "utf8").split(/\r?\n/);

const kmlsByLine = {};
lines.forEach((l, i) => {
  if (!l.trim()) return;
  try {
    const o = JSON.parse(l);
    if (o.role !== "user") return;
    const kmls = extractKmlsFromLine(l);
    if (!kmls.length) return;
    kmlsByLine[i] = kmls;
    kmls.forEach((k, ki) => {
      const folder = (k.match(/<Folder>\s*<name>(.*?)<\/name>/) || [])[1] || "unknown";
      const pms = (k.match(/<Placemark>/g) || []).length;
      console.log("line=" + i + " kml[" + ki + "] folder=" + folder + " placemarks=" + pms);
    });
  } catch (e) {}
});

// Collect the four folders — usar ÚLTIMA coincidencia para cada carpeta
let dispFolder = "", ocupFolder = "", letrasFolder = "", otrosFolder = "";
Object.entries(kmlsByLine).forEach(([idx, kmls]) => {
  kmls.forEach(k => {
    const foldName = (k.match(/<Folder>\s*<name>(.*?)<\/name>/) || [])[1] || "";
    // Sobreescribe siempre → queda la última (más reciente) del transcript
    if (foldName === "Disponibles") dispFolder   = getFolder(k);
    if (foldName === "Ocupados")    ocupFolder   = getFolder(k);
    if (foldName === "Letras")      letrasFolder = getFolder(k);
    if (foldName === "OTROS")       otrosFolder  = getFolder(k);
  });
});

if (!dispFolder)   { console.error("No se encontró carpeta Disponibles"); process.exit(1); }
if (!ocupFolder)   { console.error("No se encontró carpeta Ocupados");    process.exit(1); }
if (!letrasFolder) { console.error("No se encontró carpeta Letras");      process.exit(1); }
if (!otrosFolder)  { console.warn("Aviso: no se encontró carpeta OTROS (opcional)"); }

const combined = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2" xmlns:kml="http://www.opengis.net/kml/2.2" xmlns:atom="http://www.w3.org/2005/Atom">
<Document>
  <name>Valle de los Olivos</name>
  ${dispFolder}
  ${ocupFolder}
  ${letrasFolder}
  ${otrosFolder}
</Document>
</kml>`;

fs.writeFileSync(OUT, combined, "utf8");
console.log("Escrito:", path.relative(process.cwd(), OUT), "bytes:", combined.length);

// Verify
const { DOMParser } = require("@xmldom/xmldom");
const dom = new DOMParser({ onError: () => {} }).parseFromString(combined, "text/xml");
const folders = Array.from(dom.getElementsByTagName("Folder"));
folders.forEach(f => {
  const name = f.getElementsByTagName("name")[0].textContent;
  const pms  = f.getElementsByTagName("Placemark").length;
  console.log("  Folder:", name, "→", pms, "Placemarks");
});
