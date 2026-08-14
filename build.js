/**
 * Builds the deployable site and a copy for publishing elsewhere.
 *
 * dist/index.html carries the data, styles and script inline, so it works
 * opened straight from disk with no server and no signal. Alongside it the
 * build emits the few separate files an installable app needs — a manifest,
 * a service worker and icons — which by specification cannot be inlined.
 *
 * dist/artifact.html is the same page without the document wrapper or the
 * install pieces, for hosts that supply their own <html> and <head>.
 */
import { mkdir } from "node:fs/promises";

const SCRIPT_SLOT = "<!--APP_SCRIPT-->";
const ICON_SLOT = "<!--ICONS-->";
const PWA_SLOT = "<!--PWA-->";

const ICONS = ["icon-192.png", "icon-512.png", "icon-maskable-512.png"];

/**
 * Tab and home screen icons are embedded rather than linked: the page has to
 * work from disk, where a sibling file would not resolve. iOS needs a raster
 * icon for the home screen, so the SVG is joined by a PNG.
 */
async function iconLinks() {
  const svg = (await Bun.file("./src/icon.svg").text()).trim();
  const png = Buffer.from(await Bun.file("./src/icon-180.png").arrayBuffer()).toString("base64");
  return [
    `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(svg)}" />`,
    `<link rel="apple-touch-icon" href="data:image/png;base64,${png}" />`,
  ].join("\n");
}

/**
 * The manifest and service worker have to be real same-origin files, so these
 * tags only go into the hosted build. Registration is skipped when the page is
 * opened from disk, where service workers do not run and the page needs no
 * help being offline anyway.
 */
function installTags() {
  return `<link rel="manifest" href="manifest.webmanifest" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<script>
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
</script>`;
}

const build = await Bun.build({
  entrypoints: ["./src/app.js"],
  minify: true,
  target: "browser",
});

if (!build.success) {
  console.error("Bundle failed:");
  for (const log of build.logs) console.error(log);
  process.exit(1);
}

const script = await build.outputs[0].text();
const page = await Bun.file("./src/page.html").text();

for (const slot of [SCRIPT_SLOT, ICON_SLOT, PWA_SLOT]) {
  if (!page.includes(slot)) {
    console.error(`src/page.html is missing the ${slot} placeholder`);
    process.exit(1);
  }
}

// The bundle is inlined rather than linked; a CSP-restricted host blocks
// external requests, and a single file is easier for a coach to keep offline.
const filled = page
  .replace(ICON_SLOT, await iconLinks())
  .replace(SCRIPT_SLOT, `<script type="module">\n${script}\n</script>`);

// <head> and <body> are left out on purpose. The page mixes head-level tags
// (title, icons, styles) with markup so the same file can also be published
// somewhere that supplies its own document wrapper; HTML makes both tags
// optional, and the parser sorts the elements into the right place.
const site = `<!doctype html>\n<html lang="en">\n<meta charset="utf-8" />\n${filled.replace(PWA_SLOT, installTags())}\n</html>\n`;
const artifact = filled.replace(`${PWA_SLOT}\n`, "");

// Versioning the cache by the page's own hash means a deploy that changes
// nothing does not churn the cache, and one that does gets picked up.
const version = new Bun.CryptoHasher("sha256").update(site).digest("hex").slice(0, 12);
const worker = (await Bun.file("./src/sw.js").text()).replace("__VERSION__", version);

await mkdir("./dist", { recursive: true });
await Bun.write("./dist/index.html", site);
await Bun.write("./dist/artifact.html", artifact);
await Bun.write("./dist/manifest.webmanifest", Bun.file("./src/manifest.webmanifest"));
await Bun.write("./dist/sw.js", worker);
for (const icon of ICONS) await Bun.write(`./dist/${icon}`, Bun.file(`./src/${icon}`));

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;
console.log(`dist/index.html            ${kb(site.length)}  (cache ${version})`);
console.log(`dist/artifact.html         ${kb(artifact.length)}`);
console.log(`dist/sw.js                 ${kb(worker.length)}`);
console.log(`dist/manifest.webmanifest  + ${ICONS.length} icons`);
