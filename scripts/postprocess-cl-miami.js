/**
 * Postprocess website/cl/*.html (Miami clone) for Chile deployment:
 * region -> Miami, Land nav (desktop only 8-space indent; drawer once).
 */
const fs = require("fs");
const path = require("path");

const clDir = path.join(__dirname, "..", "cl");

function landClassFromProjectLine(projFull) {
  if (projFull.includes("font-sans")) {
    return "nav-link-underline font-sans text-xs font-semibold uppercase tracking-[0.2em] text-white/85 hover:text-brand-gold";
  }
  return "nav-link-underline text-xs uppercase tracking-[0.2em] text-white/85 hover:text-brand-gold";
}

function processHtml(content) {
  let c = content;

  c = c.replace(/href="\.\.\/cl\/index\.html"/g, 'href="../us/index.html"');
  c = c.replace(/class="([^"]*?)region-switch-miami([^"]*?)"/g, (_, a, b) => `class="${a}region-switch-chile${b}"`);
  c = c.replace(/data-i18n="nav\.visit_chile"/g, 'data-i18n="nav.visit_miami"');
  c = c.replace(
    /(<a[^>]*href="\.\.\/us\/index\.html"[^>]*data-i18n="nav\.visit_miami"[^>]*>)Chile(<\/a>)/g,
    "$1Miami$2"
  );

  c = c.replace(
    /^(        <a class="([^"]*)" href="(?:residential|retail|industrial)\.html">Projects<\/a>)\s*(        <a class="([^"]*)" href="about\.html">About Us<\/a>)/gm,
    (full, projFull, projClass, aboutFull, aboutClass) => {
      const landClass = landClassFromProjectLine(projFull);
      return `${projFull}\n        <a class="${landClass}" href="projects.html" data-i18n="nav.land">Land</a>\n${aboutFull}`;
    }
  );

  c = c.replace(
    /(<a[^>]*href="contact\.html"[^>]*>Contact<\/a>)\n(    <a href="\.\.\/us\/index\.html")/g,
    '$1\n    <a class="font-sans text-sm font-semibold uppercase tracking-[0.2em] text-white/90" href="projects.html" data-i18n="nav.land">Land</a>\n$2'
  );

  return c;
}

for (const name of fs.readdirSync(clDir)) {
  if (!name.endsWith(".html") || name === "projects.html") continue;
  const fp = path.join(clDir, name);
  fs.writeFileSync(fp, processHtml(fs.readFileSync(fp, "utf8")));
  console.log("postprocessed", name);
}
