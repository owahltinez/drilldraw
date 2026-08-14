import { beforeAll, describe, expect, test } from "bun:test";

const root = new URL("..", import.meta.url).pathname;
const dist = (name) => Bun.file(`${root}dist/${name}`);

/** Reads width and height out of a PNG's IHDR header. */
async function pngSize(name) {
  const bytes = new DataView(await dist(name).arrayBuffer());
  return { width: bytes.getUint32(16), height: bytes.getUint32(20) };
}

let html = "";
let manifest = {};
let worker = "";

beforeAll(async () => {
  const built = Bun.spawnSync(["bun", "run", "build.js"], { cwd: root });
  if (built.exitCode !== 0) throw new Error(`build failed: ${built.stderr.toString()}`);

  html = await dist("index.html").text();
  manifest = await dist("manifest.webmanifest").json();
  worker = await dist("sw.js").text();
});

describe("the page works on its own", () => {
  test("needs nothing from the network at runtime", () => {
    const external = html.match(/(src|href)="(https?:)?\/\/[^"]*"/g) ?? [];
    expect(external).toEqual([]);
  });

  test("carries the drill data and the app inline", () => {
    expect(html).toContain("Sharks and Minnows");
    expect(html).toContain('<script type="module">');
  });

  test("embeds both icons so a saved page keeps its identity", () => {
    expect(html).toContain('rel="icon" href="data:image/svg+xml,');
    expect(html).toContain('rel="apple-touch-icon" href="data:image/png;base64,');
  });

  test("is a complete document", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>Drill Draw</title>");
  });
});

describe("installability", () => {
  test("the page links the manifest and registers the worker", () => {
    expect(html).toContain('rel="manifest" href="manifest.webmanifest"');
    expect(html).toContain('navigator.serviceWorker.register("sw.js")');
  });

  test("registration is skipped when opened from disk", () => {
    expect(html).toContain('location.protocol.startsWith("http")');
  });

  test("the manifest has everything a browser needs to offer an install", () => {
    expect(manifest.name).toBe("Drill Draw");
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.start_url).toBe("./");
    expect(manifest.scope).toBe("./");
    expect(manifest.display).toBe("standalone");
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/);
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/);
  });

  test("declares a 192px icon, a 512px icon and a maskable one", async () => {
    const sizes = manifest.icons.map((icon) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);

    // Every declared icon must exist at exactly the size it claims.
    for (const icon of manifest.icons) {
      const [width, height] = icon.sizes.split("x").map(Number);
      expect(await dist(icon.src).exists(), icon.src).toBe(true);
      expect(await pngSize(icon.src), icon.src).toEqual({ width, height });
    }
  });
});

describe("offline behaviour", () => {
  test("the worker precaches the launch URL and the document", () => {
    expect(worker).toContain('"./"');
    expect(worker).toContain('"./index.html"');
  });

  test("every precached path is actually emitted", async () => {
    const list = worker.match(/const ASSETS = \[(.*?)\]/s)[1];
    const paths = [...list.matchAll(/"\.\/([^"]*)"/g)].map((match) => match[1]);
    for (const path of paths) {
      if (path === "") continue; // "./" is the directory, served as index.html
      expect(await dist(path).exists(), path).toBe(true);
    }
  });

  test("the cache is versioned by the page hash, not left as a placeholder", () => {
    expect(worker).not.toContain("__VERSION__");
    expect(worker).toMatch(/const VERSION = "[0-9a-f]{12}"/);
  });

  test("a rebuild of the same source keeps the same cache version", async () => {
    const first = worker.match(/const VERSION = "([0-9a-f]{12})"/)[1];
    Bun.spawnSync(["bun", "run", "build.js"], { cwd: root });
    const second = (await dist("sw.js").text()).match(/const VERSION = "([0-9a-f]{12})"/)[1];
    expect(second).toBe(first);
  });
});

describe("the artifact copy", () => {
  test("leaves out the document wrapper and the install pieces", async () => {
    const artifact = await dist("artifact.html").text();
    expect(artifact.startsWith("<!doctype")).toBe(false);
    expect(artifact).not.toContain("serviceWorker");
    expect(artifact).not.toContain("manifest.webmanifest");
    // It is still the whole app, just without the wrapper.
    expect(artifact).toContain("Sharks and Minnows");
  });
});
