/**
 * Bundles the app into a single self-contained HTML file so it can be opened
 * straight from disk on a phone at the gym, with no server and no network.
 *
 * Emits two files from the same source:
 *   dist/index.html    - a complete document, for opening or hosting directly
 *   dist/artifact.html - the same page without the document wrapper, for
 *                        publishing where the host supplies <html> and <head>
 */
import { mkdir } from "node:fs/promises";

const SCRIPT_SLOT = "<!--APP_SCRIPT-->";
const ICON_SLOT = "<!--ICONS-->";

/**
 * Both icons are embedded rather than linked: the page has to work opened
 * straight from disk, where a sibling icon file would not resolve. The SVG
 * covers browser tabs; iOS needs a raster icon for the home screen.
 */
async function iconLinks() {
  const svg = (await Bun.file("./src/icon.svg").text()).trim();
  const png = Buffer.from(await Bun.file("./src/icon-180.png").arrayBuffer()).toString("base64");
  return [
    `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(svg)}" />`,
    `<link rel="apple-touch-icon" href="data:image/png;base64,${png}" />`,
  ].join("\n");
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

for (const slot of [SCRIPT_SLOT, ICON_SLOT]) {
  if (!page.includes(slot)) {
    console.error(`src/page.html is missing the ${slot} placeholder`);
    process.exit(1);
  }
}

// The bundle is inlined rather than linked; a CSP-restricted host blocks
// external requests, and a single file is easier for a coach to keep offline.
const body = page
  .replace(ICON_SLOT, await iconLinks())
  .replace(SCRIPT_SLOT, `<script type="module">\n${script}\n</script>`);

// <head> and <body> are left out on purpose. The page mixes head-level tags
// (title, icons, styles) with markup so the same file can also be published
// somewhere that supplies its own document wrapper; HTML makes both tags
// optional, and the parser sorts the elements into the right place.
const site = `<!doctype html>\n<html lang="en">\n<meta charset="utf-8" />\n${body}\n</html>\n`;

await mkdir("./dist", { recursive: true });
await Bun.write("./dist/index.html", site);
await Bun.write("./dist/artifact.html", body);

const kb = (text) => `${(text.length / 1024).toFixed(1)} kB`;
console.log(`dist/index.html    ${kb(site)}`);
console.log(`dist/artifact.html ${kb(body)}`);
