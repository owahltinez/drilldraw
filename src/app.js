import DRILLS from "./drills.json";
import { CATEGORIES, DEFAULT_FILTERS, filterDrills, pickRandom } from "./filters.js";

const STORAGE_KEY = "drill-draw.filters";
const FAVORITES_KEY = "drill-draw.favorites";
const MAX_PLAYERS = 24;

/** Human labels for tag values. Kept next to the UI, not in the data. */
const BALL_LABELS = {
  none: "No ball needed",
  shared: "1–3 balls",
  "per-pair": "Ball per pair",
  "per-player": "Ball each",
};

const GROUPING_LABELS = {
  pairs: "Even numbers",
  threes: "Groups of 3",
  "even-teams": "Two even teams",
};

const BALL_SUPPLY_OPTIONS = [
  { value: "few", label: "2–3 balls" },
  { value: "half", label: "Half the kids" },
  { value: "all", label: "One each" },
];

const LEVEL_OPTIONS = [
  { value: "any", label: "All" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

const TYPE_OPTIONS = [
  { value: "any", label: "Both" },
  { value: "game", label: "Games" },
  { value: "drill", label: "Drills" },
];

const FAVORITE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "favorites", label: "★ Favorites" },
];

const CATEGORY_LABELS = {
  warmup: "Warm-up",
  dribbling: "Dribbling",
  passing: "Passing",
  shooting: "Shooting",
  finishing: "Finishing",
  footwork: "Footwork",
  defense: "Defense",
  rebounding: "Rebounding",
  "team-play": "Team play",
};

const state = { ...DEFAULT_FILTERS, players: 8, current: null, favorites: "all" };
let favorites = new Set();

/** Creates an element with optional class and text in one call. */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const dom = {
  get players() { return document.querySelector("#player-count"); },
  get fewer() { return document.querySelector("#fewer"); },
  get more() { return document.querySelector("#more"); },
  get balls() { return document.querySelector("#balls"); },
  get level() { return document.querySelector("#level"); },
  get type() { return document.querySelector("#type"); },
  get categories() { return document.querySelector("#categories"); },
  get favorites() { return document.querySelector("#favorites"); },
  get count() { return document.querySelector("#match-count"); },
  get draw() { return document.querySelector("#draw"); },
  get card() { return document.querySelector("#card"); },
  get browse() { return document.querySelector("#browse"); },
  get browseToggle() { return document.querySelector("#browse-toggle"); },
  get list() { return document.querySelector("#list"); },
};

/** Restores favorite drill IDs from storage. */
function loadFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    if (Array.isArray(saved)) favorites = new Set(saved);
  } catch {
    // A corrupt or blocked store starts with no favorites.
    favorites = new Set();
  }
}

/** Saves favorite drill IDs to storage. */
function saveFavorites() {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
  } catch {
    // Storage unavailable in private browsing mode.
  }
}

/** Restores the filters from the last session so settings survive a reload. */
function loadFilters() {
  state.players = 8;
  state.balls = DEFAULT_FILTERS.balls;
  state.level = DEFAULT_FILTERS.level;
  state.category = DEFAULT_FILTERS.category;
  state.type = DEFAULT_FILTERS.type;
  state.favorites = "all";
  state.current = null;

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    for (const key of ["players", "balls", "level", "category", "type", "favorites"]) {
      if (saved[key] !== undefined) state[key] = saved[key];
    }
  } catch {
    // A corrupt or blocked store just means we start from the defaults.
  }
}

function saveFilters() {
  const { players, balls, level, category, type, favorites: favFilter } = state;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ players, balls, level, category, type, favorites: favFilter }));
  } catch {
    // Private browsing blocks writes; the app still works for this session.
  }
}

/** Toggles favorite status for a drill. */
function toggleFavorite(drillId) {
  if (favorites.has(drillId)) {
    favorites.delete(drillId);
  } else {
    favorites.add(drillId);
  }
  saveFavorites();
  render();
  if (state.current && state.current.id === drillId) {
    renderCard(state.current);
  }
}

/** Resolves a drill from the current URL hash. */
function getDrillFromHash() {
  const hash = (globalThis.location?.hash || "").replace(/^#/, "");
  if (!hash) return null;
  return DRILLS.find((drill) => drill.id === hash) || null;
}

/** Syncs the drill ID into the URL hash for deep linking. */
function syncHash(drill) {
  if (!globalThis.location) return;
  const newHash = drill ? `#${drill.id}` : "";
  if (typeof globalThis.history?.replaceState === "function") {
    const url = `${globalThis.location.pathname || ""}${globalThis.location.search || ""}${newHash}`;
    globalThis.history.replaceState(null, "", url);
  } else {
    globalThis.location.hash = drill ? drill.id : "";
  }
}

/** Builds one segmented control and wires it to a state key. */
function buildSegmented(container, options, key) {
  if (!container) return;
  container.replaceChildren();
  for (const option of options) {
    const button = el("button", "seg", option.label);
    button.type = "button";
    button.dataset.value = option.value;
    button.addEventListener("click", () => {
      state[key] = option.value;
      render();
    });
    container.append(button);
  }
}

/** Category chips scroll horizontally, so "Any" is built in as the first one. */
function buildCategories() {
  const options = [{ value: "any", label: "Any skill" }].concat(
    CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] })),
  );
  buildSegmented(dom.categories, options, "category");
}

/** Marks the active button in every segmented control. */
function paintSegmented(container, value) {
  if (!container) return;
  for (const button of container.querySelectorAll(".seg")) {
    const active = button.dataset.value === String(value);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

function changePlayers(delta) {
  state.players = Math.min(MAX_PLAYERS, Math.max(0, state.players + delta));
  render();
}

/** The chips that tell a coach at a glance whether a drill can run today. */
function buildChips(drill) {
  const chips = el("div", "chips");
  const players = drill.minPlayers > 1 ? `${drill.minPlayers}+ players` : "Any number";
  chips.append(el("span", "chip", players));
  chips.append(el("span", "chip", BALL_LABELS[drill.balls]));
  if (GROUPING_LABELS[drill.grouping]) {
    chips.append(el("span", "chip chip-warn", GROUPING_LABELS[drill.grouping]));
  }
  chips.append(el("span", "chip", `~${drill.minutes} min`));
  for (const level of drill.levels) {
    chips.append(el("span", "chip chip-level", LEVEL_OPTIONS.find((o) => o.value === level).label));
  }
  return chips;
}

function renderCard(drill) {
  if (!dom.card) return;
  dom.card.replaceChildren();
  if (!drill) {
    dom.card.hidden = true;
    return;
  }

  const isFav = favorites.has(drill.id);
  const topRow = el("div", "card-top");
  const eyebrow = el("p", "eyebrow", `${CATEGORY_LABELS[drill.category]} · ${drill.type === "game" ? "Game" : "Drill"}`);

  const actions = el("div", "card-actions");
  const favBtn = el("button", `card-btn ${isFav ? "is-fav" : ""}`, isFav ? "★ Saved" : "☆ Save");
  favBtn.type = "button";
  favBtn.setAttribute("aria-pressed", String(isFav));
  favBtn.setAttribute("aria-label", isFav ? "Remove from favorites" : "Save to favorites");
  favBtn.addEventListener("click", () => toggleFavorite(drill.id));

  const shareBtn = el("button", "card-btn", "🔗 Link");
  shareBtn.type = "button";
  shareBtn.setAttribute("aria-label", "Copy link to drill");
  shareBtn.addEventListener("click", async () => {
    const url = `${globalThis.location?.origin || ""}${globalThis.location?.pathname || ""}${globalThis.location?.search || ""}#${drill.id}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      }
      shareBtn.textContent = "Copied!";
      setTimeout(() => {
        shareBtn.textContent = "🔗 Link";
      }, 1500);
    } catch {
      // Clipboard access not available.
    }
  });

  actions.append(favBtn, shareBtn);
  topRow.append(eyebrow, actions);

  dom.card.append(topRow, el("h2", "drill-name", drill.name), buildChips(drill), el("p", "prose", drill.description));

  // Coaching points are the part a coach reads out loud, so they stay a list.
  if (drill.coachingPoints.length > 0) {
    dom.card.append(el("h3", "sub-head", "Coaching points"));
    const list = el("ul", "points");
    for (const point of drill.coachingPoints) list.append(el("li", null, point));
    dom.card.append(list);
  }

  dom.card.hidden = false;
  dom.card.classList.remove("is-fresh");
  void dom.card.offsetWidth; // Restart the entrance animation on every draw.
  dom.card.classList.add("is-fresh");
}

function renderList(matches) {
  if (!dom.list) return;
  dom.list.replaceChildren();
  for (const drill of matches) {
    const item = el("li");
    const button = el("button", "list-row");
    button.type = "button";

    const nameSpan = el("span", "list-name", drill.name);
    if (favorites.has(drill.id)) {
      nameSpan.append(el("span", "list-fav-icon", " ★"));
    }
    button.append(nameSpan);
    button.append(el("span", "list-meta", `${CATEGORY_LABELS[drill.category]} · ${drill.minutes} min`));
    button.addEventListener("click", () => {
      state.current = drill;
      syncHash(drill);
      renderCard(drill);
      dom.card?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    item.append(button);
    dom.list.append(item);
  }
}

function render() {
  if (!dom.players) return;
  dom.players.textContent = state.players === 0 ? "Any" : String(state.players);
  dom.fewer.disabled = state.players === 0;
  dom.more.disabled = state.players === MAX_PLAYERS;
  paintSegmented(dom.balls, state.balls);
  paintSegmented(dom.level, state.level);
  paintSegmented(dom.type, state.type);
  paintSegmented(dom.categories, state.category);
  if (dom.favorites) paintSegmented(dom.favorites, state.favorites);

  const filterParams = { ...state, favoritesOnly: state.favorites === "favorites" };
  const matches = filterDrills(DRILLS, filterParams, favorites);
  dom.count.textContent = matches.length === 1 ? "1 drill fits" : `${matches.length} drills fit`;
  dom.count.classList.toggle("is-empty", matches.length === 0);
  dom.draw.disabled = matches.length === 0;
  dom.draw.textContent = state.current ? "Pick another" : "Pick a drill";

  // A drill left on screen that no longer fits the filters would be misleading.
  if (state.current && !matches.some((drill) => drill.id === state.current.id)) {
    state.current = null;
    renderCard(null);
    syncHash(null);
  }

  if (dom.browseToggle && dom.browse) {
    dom.browseToggle.textContent = dom.browse.open ? "Hide all matches" : "Browse all matches";
  }
  renderList(matches);
  saveFilters();
}

function draw() {
  const filterParams = { ...state, favoritesOnly: state.favorites === "favorites" };
  const matches = filterDrills(DRILLS, filterParams, favorites);
  state.current = pickRandom(matches, Math.random, state.current);
  syncHash(state.current);
  renderCard(state.current);
  render();
}

export function init() {
  buildSegmented(dom.balls, BALL_SUPPLY_OPTIONS, "balls");
  buildSegmented(dom.level, LEVEL_OPTIONS, "level");
  buildSegmented(dom.type, TYPE_OPTIONS, "type");
  buildCategories();
  if (dom.favorites) buildSegmented(dom.favorites, FAVORITE_OPTIONS, "favorites");
  dom.fewer?.addEventListener("click", () => changePlayers(-1));
  dom.more?.addEventListener("click", () => changePlayers(1));
  dom.draw?.addEventListener("click", draw);
  dom.browse?.addEventListener("toggle", () => {
    if (dom.browseToggle && dom.browse) {
      dom.browseToggle.textContent = dom.browse.open ? "Hide all matches" : "Browse all matches";
    }
  });

  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("hashchange", () => {
      const drill = getDrillFromHash();
      state.current = drill;
      renderCard(drill);
      render();
    });
  }

  loadFavorites();
  loadFilters();

  const initialDrill = getDrillFromHash();
  if (initialDrill) {
    state.current = initialDrill;
    renderCard(initialDrill);
  }

  render();
}

init();

