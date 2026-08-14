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

const PLACEHOLDER = "<!--APP_SCRIPT-->";

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

if (!page.includes(PLACEHOLDER)) {
  console.error(`src/page.html is missing the ${PLACEHOLDER} placeholder`);
  process.exit(1);
}

// The bundle is inlined rather than linked; a CSP-restricted host blocks
// external requests, and a single file is easier for a coach to keep offline.
const body = page.replace(PLACEHOLDER, `<script type="module">\n${script}\n</script>`);

await mkdir("./dist", { recursive: true });
await Bun.write("./dist/artifact.html", body);
await Bun.write(
  "./dist/index.html",
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8" />\n${body}\n</html>\n`,
);

const kb = (text) => `${(text.length / 1024).toFixed(1)} kB`;
console.log(`dist/index.html    ${kb(body)}`);
console.log(`dist/artifact.html ${kb(body)}`);
