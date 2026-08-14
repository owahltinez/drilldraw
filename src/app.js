import DRILLS from "./drills.json";
import { CATEGORIES, DEFAULT_FILTERS, filterDrills, pickRandom } from "./filters.js";

const STORAGE_KEY = "drill-draw.filters";
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

const state = { ...DEFAULT_FILTERS, players: 8, current: null };

/** Creates an element with optional class and text in one call. */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const dom = {
  players: document.querySelector("#player-count"),
  fewer: document.querySelector("#fewer"),
  more: document.querySelector("#more"),
  balls: document.querySelector("#balls"),
  level: document.querySelector("#level"),
  type: document.querySelector("#type"),
  categories: document.querySelector("#categories"),
  count: document.querySelector("#match-count"),
  draw: document.querySelector("#draw"),
  card: document.querySelector("#card"),
  browse: document.querySelector("#browse"),
  browseToggle: document.querySelector("#browse-toggle"),
  list: document.querySelector("#list"),
};

/** Restores the filters from the last session so settings survive a reload. */
function loadFilters() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    for (const key of ["players", "balls", "level", "category", "type"]) {
      if (saved[key] !== undefined) state[key] = saved[key];
    }
  } catch {
    // A corrupt or blocked store just means we start from the defaults.
  }
}

function saveFilters() {
  const { players, balls, level, category, type } = state;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ players, balls, level, category, type }));
  } catch {
    // Private browsing blocks writes; the app still works for this session.
  }
}

/** Builds one segmented control and wires it to a state key. */
function buildSegmented(container, options, key) {
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
  dom.card.replaceChildren();
  if (!drill) {
    dom.card.hidden = true;
    return;
  }

  const eyebrow = el("p", "eyebrow", `${CATEGORY_LABELS[drill.category]} · ${drill.type === "game" ? "Game" : "Drill"}`);
  dom.card.append(eyebrow, el("h2", "drill-name", drill.name), buildChips(drill), el("p", "prose", drill.description));

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
  dom.list.replaceChildren();
  for (const drill of matches) {
    const item = el("li");
    const button = el("button", "list-row");
    button.type = "button";
    button.append(el("span", "list-name", drill.name));
    button.append(el("span", "list-meta", `${CATEGORY_LABELS[drill.category]} · ${drill.minutes} min`));
    button.addEventListener("click", () => {
      state.current = drill;
      renderCard(drill);
      dom.card.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    item.append(button);
    dom.list.append(item);
  }
}

function render() {
  dom.players.textContent = state.players === 0 ? "Any" : String(state.players);
  dom.fewer.disabled = state.players === 0;
  dom.more.disabled = state.players === MAX_PLAYERS;
  paintSegmented(dom.balls, state.balls);
  paintSegmented(dom.level, state.level);
  paintSegmented(dom.type, state.type);
  paintSegmented(dom.categories, state.category);

  const matches = filterDrills(DRILLS, state);
  dom.count.textContent = matches.length === 1 ? "1 drill fits" : `${matches.length} drills fit`;
  dom.count.classList.toggle("is-empty", matches.length === 0);
  dom.draw.disabled = matches.length === 0;
  dom.draw.textContent = state.current ? "Pick another" : "Pick a drill";

  // A drill left on screen that no longer fits the filters would be misleading.
  if (state.current && !matches.some((drill) => drill.id === state.current.id)) {
    state.current = null;
    renderCard(null);
  }

  dom.browseToggle.textContent = dom.browse.open ? "Hide all matches" : "Browse all matches";
  renderList(matches);
  saveFilters();
}

function draw() {
  const matches = filterDrills(DRILLS, state);
  state.current = pickRandom(matches, Math.random, state.current);
  renderCard(state.current);
  render();
}

buildSegmented(dom.balls, BALL_SUPPLY_OPTIONS, "balls");
buildSegmented(dom.level, LEVEL_OPTIONS, "level");
buildSegmented(dom.type, TYPE_OPTIONS, "type");
buildCategories();
dom.fewer.addEventListener("click", () => changePlayers(-1));
dom.more.addEventListener("click", () => changePlayers(1));
dom.draw.addEventListener("click", draw);
dom.browse.addEventListener("toggle", () => {
  dom.browseToggle.textContent = dom.browse.open ? "Hide all matches" : "Browse all matches";
});
loadFilters();
render();
