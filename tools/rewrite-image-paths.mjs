/**
 * Reescribe referencias assets/images/... -> assets/images/opt/... (JPEG normalizado).
 * No toca assets/videos/. Ejecutar: node tools/rewrite-image-paths.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function rewriteText(content) {
  return content.replace(/assets\/images\/(?!opt\/)([^"'>\s\)]+)/gi, (_, rel) => {
    let r = String(rel);
    if (r.startsWith("residential-cards/")) {
      const base = r.slice("residential-cards/".length).replace(/\.(png|jpeg)$/i, ".jpg");
      return `assets/images/opt/c/${base}`;
    }
    const normalized = r.replace(/\.(png|jpeg)$/i, ".jpg");
    return `assets/images/opt/${normalized}`;
  });
}

const targets = fs.readdirSync(root).filter((f) => f.endsWith(".html"));
for (const name of targets) {
  const p = path.join(root, name);
  const s = fs.readFileSync(p, "utf8");
  const n = rewriteText(s);
  if (n !== s) {
    fs.writeFileSync(p, n, "utf8");
    console.log("updated", name);
  }
}
