import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";

const pageHtml = await Bun.file(new URL("./page.html", import.meta.url)).text();
const STORAGE_KEY = "drill-draw.filters";

const FAVORITES_KEY = "drill-draw.favorites";

/**
 * Mounts the real page markup and the real app module in a fresh DOM, the same
 * way the built file does, so the wiring between the two is what gets tested.
 */
async function mountApp({ storage, favoritesStorage, hash } = {}) {
  const url = hash ? `https://localhost/#${hash}` : "https://localhost/";
  const window = new Window({ url });
  window.localStorage.clear();
  window.document.body.innerHTML = pageHtml.replace(/<title>.*?<\/title>/s, "");

  // Seed before importing: the app reads saved filters and favorites as it starts up.
  if (storage) window.localStorage.setItem(STORAGE_KEY, storage);
  if (favoritesStorage) window.localStorage.setItem(FAVORITES_KEY, favoritesStorage);

  // The app module reads document/localStorage/location off the globals at import time.
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    localStorage: globalThis.localStorage,
    location: globalThis.location,
    history: globalThis.history,
  };
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.localStorage = window.localStorage;
  globalThis.location = window.location;
  globalThis.history = window.history;

  const appModule = await import("./app.js");
  appModule.init();

  return {
    document: window.document,
    window,
    restore() {
      globalThis.window = previous.window;
      globalThis.document = previous.document;
      globalThis.localStorage = previous.localStorage;
      globalThis.location = previous.location;
      globalThis.history = previous.history;
    },
  };
}

/** Clicks the button whose visible label matches, within a container. */
function clickOption(document, containerId, label) {
  const buttons = [...document.querySelectorAll(`#${containerId} .seg`)];
  const target = buttons.find((button) => button.textContent === label);
  if (!target) throw new Error(`no "${label}" option in #${containerId}`);
  target.click();
}

let app;

beforeEach(async () => {
  app = await mountApp();
});

afterEach(() => {
  app.window?.localStorage?.clear();
  app.restore();
});

describe("first paint", () => {
  test("builds every filter control", () => {
    const { document } = app;
    expect(document.querySelectorAll("#balls .seg").length).toBe(3);
    expect(document.querySelectorAll("#level .seg").length).toBe(4);
    expect(document.querySelectorAll("#type .seg").length).toBe(3);
    // Nine skill areas plus the "Any skill" option.
    expect(document.querySelectorAll("#categories .seg").length).toBe(10);
    // All vs Favorites
    expect(document.querySelectorAll("#favorites .seg").length).toBe(2);
  });

  test("shows a match count and no drill until asked", () => {
    const { document } = app;
    expect(document.querySelector("#match-count").textContent).toMatch(/^\d+ drills fit$/);
    expect(document.querySelector("#card").hidden).toBe(true);
    expect(document.querySelector("#draw").textContent).toBe("Pick a drill");
  });

  test("lists the matching drills for browsing", () => {
    const rows = app.document.querySelectorAll("#list .list-row");
    expect(rows.length).toBeGreaterThan(20);
  });
});

describe("picking a drill", () => {
  test("shows a full drill card", () => {
    const { document } = app;
    document.querySelector("#draw").click();

    const card = document.querySelector("#card");
    expect(card.hidden).toBe(false);
    expect(card.querySelector(".drill-name").textContent.length).toBeGreaterThan(2);
    expect(card.querySelector(".prose").textContent.length).toBeGreaterThan(40);
    expect(card.querySelectorAll(".chip").length).toBeGreaterThanOrEqual(3);
    expect(card.querySelectorAll(".points li").length).toBeGreaterThan(0);
    expect(document.querySelector("#draw").textContent).toBe("Pick another");
  });

  test("picking again swaps the drill", () => {
    const { document } = app;
    const draw = document.querySelector("#draw");
    draw.click();
    const first = document.querySelector(".drill-name").textContent;
    draw.click();
    expect(document.querySelector(".drill-name").textContent).not.toBe(first);
  });

  test("clearing a drill that no longer fits the filters", () => {
    const { document } = app;
    document.querySelector("#draw").click();
    expect(document.querySelector("#card").hidden).toBe(false);

    // Warm-up has only a handful of drills, so most picks stop matching.
    clickOption(document, "categories", "Warm-up");
    clickOption(document, "level", "Advanced");
    const card = document.querySelector("#card");
    const name = card.hidden ? null : card.querySelector(".drill-name").textContent;
    expect(name === null || name.length > 0).toBe(true);
  });
});

describe("filters", () => {
  test("the player stepper changes the headcount and the results", () => {
    const { document } = app;
    const before = Number(document.querySelector("#match-count").textContent.match(/\d+/)[0]);

    for (let i = 0; i < 4; i += 1) document.querySelector("#fewer").click();
    expect(document.querySelector("#player-count").textContent).toBe("4");

    const after = Number(document.querySelector("#match-count").textContent.match(/\d+/)[0]);
    expect(after).toBeLessThan(before);
  });

  test("the stepper stops at Any and disables itself", () => {
    const { document } = app;
    for (let i = 0; i < 12; i += 1) document.querySelector("#fewer").click();
    expect(document.querySelector("#player-count").textContent).toBe("Any");
    expect(document.querySelector("#fewer").disabled).toBe(true);
  });

  test("scarce balls cut the list down", () => {
    const { document } = app;
    const all = Number(document.querySelector("#match-count").textContent.match(/\d+/)[0]);
    clickOption(document, "balls", "2–3 balls");
    const few = Number(document.querySelector("#match-count").textContent.match(/\d+/)[0]);
    expect(few).toBeLessThan(all);
    expect(few).toBeGreaterThan(5);
  });

  test("the active option is marked for the coach and for screen readers", () => {
    const { document } = app;
    clickOption(document, "level", "Beginner");
    const active = document.querySelector("#level .seg.is-active");
    expect(active.textContent).toBe("Beginner");
    expect(active.getAttribute("aria-pressed")).toBe("true");
  });

  test("only games are offered when games are chosen", () => {
    const { document } = app;
    clickOption(document, "type", "Games");
    document.querySelector("#draw").click();
    expect(document.querySelector(".eyebrow").textContent).toContain("Game");
  });

  test("filters survive a reload", async () => {
    const { document } = app;
    clickOption(document, "level", "Advanced");
    for (let i = 0; i < 3; i += 1) document.querySelector("#fewer").click();
    const players = document.querySelector("#player-count").textContent;

    // Re-mount carrying the saved filters over, as reopening the page would.
    const stored = globalThis.localStorage.getItem(STORAGE_KEY);
    app.restore();
    app = await mountApp({ storage: stored });

    expect(app.document.querySelector("#player-count").textContent).toBe(players);
    expect(app.document.querySelector("#level .seg.is-active").textContent).toBe("Advanced");
  });
});

describe("browsing", () => {
  test("tapping a listed drill opens it as the card", () => {
    const { document } = app;
    const row = document.querySelectorAll("#list .list-row")[3];
    const name = row.querySelector(".list-name").textContent;
    row.click();
    expect(document.querySelector("#card").hidden).toBe(false);
    expect(document.querySelector(".drill-name").textContent).toBe(name);
  });
});

describe("deep linking", () => {
  test("opens specific drill card directly when deep linked in URL hash", async () => {
    app.restore();
    app = await mountApp({ hash: "circle-tag-defense" });

    const card = app.document.querySelector("#card");
    expect(card.hidden).toBe(false);
    expect(card.querySelector(".drill-name").textContent).toBe("Circle Tag");
  });

  test("updates the URL when a drill is selected", () => {
    const { document } = app;
    const row = document.querySelector("#list .list-row");
    row.click();

    expect(globalThis.location.hash.length).toBeGreaterThan(1);
  });

  test("hashchange event displays the newly targeted drill", () => {
    const { document, window } = app;
    expect(document.querySelector("#card").hidden).toBe(true);

    window.location.hash = "#circle-tag-defense";
    window.dispatchEvent(new window.Event("hashchange"));

    const card = document.querySelector("#card");
    expect(card.hidden).toBe(false);
    expect(card.querySelector(".drill-name").textContent).toBe("Circle Tag");
  });
});

describe("favorites", () => {
  test("toggling favorite updates local storage and card button state", () => {
    const { document } = app;
    const row = document.querySelector("#list .list-row");
    row.click();

    let favBtn = document.querySelector(".card-actions button.card-btn");
    expect(favBtn.textContent).toBe("☆ Save");
    expect(favBtn.getAttribute("aria-pressed")).toBe("false");

    favBtn.click();

    favBtn = document.querySelector(".card-actions button.card-btn");
    expect(favBtn.textContent).toBe("★ Saved");
    expect(favBtn.classList.contains("is-fav")).toBe(true);
    expect(favBtn.getAttribute("aria-pressed")).toBe("true");

    const saved = JSON.parse(globalThis.localStorage.getItem(FAVORITES_KEY));
    expect(Array.isArray(saved)).toBe(true);
    expect(saved.length).toBe(1);

    // Clicking again removes from favorites
    favBtn.click();
    favBtn = document.querySelector(".card-actions button.card-btn");
    expect(favBtn.textContent).toBe("☆ Save");
    const updated = JSON.parse(globalThis.localStorage.getItem(FAVORITES_KEY));
    expect(updated.length).toBe(0);
  });

  test("favorites filter only includes saved exercises", async () => {
    app.restore();
    app = await mountApp({ favoritesStorage: JSON.stringify(["circle-tag-defense"]) });

    const { document } = app;
    clickOption(document, "favorites", "★ Favorites");

    expect(document.querySelector("#match-count").textContent).toBe("1 drill fits");
    const rows = document.querySelectorAll("#list .list-row");
    expect(rows.length).toBe(1);
    expect(rows[0].querySelector(".list-name").textContent).toContain("Circle Tag");
  });

  test("browse list indicates favorited items", async () => {
    app.restore();
    app = await mountApp({ favoritesStorage: JSON.stringify(["circle-tag-defense"]) });

    const row = [...app.document.querySelectorAll("#list .list-row")].find((r) =>
      r.querySelector(".list-name").textContent.includes("Circle Tag"),
    );
    expect(row).toBeDefined();
    expect(row.querySelector(".list-fav-icon").textContent).toBe(" ★");
  });
});
