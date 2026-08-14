/**
 * Selection logic for the drill picker. Pure functions only, so the whole
 * decision layer is testable without a browser.
 */

/** Skill areas a drill can belong to, in the order the UI lists them. */
export const CATEGORIES = [
  "warmup",
  "dribbling",
  "passing",
  "shooting",
  "finishing",
  "footwork",
  "defense",
  "rebounding",
  "team-play",
];

/** Ball supply on the day, ordered from scarcest to most plentiful. */
const BALL_SUPPLY_RANK = { few: 0, half: 1, all: 2 };

/** Minimum supply each drill's ball requirement needs to be runnable. */
const BALL_NEED_RANK = { none: 0, shared: 0, "per-pair": 1, "per-player": 2 };

export const DEFAULT_FILTERS = {
  players: 0, // 0 means "don't care"
  balls: "all",
  level: "any",
  category: "any",
  type: "any",
  favoritesOnly: false,
};

/** True when the day's ball supply covers what the drill needs. */
export function ballsFit(need, supply) {
  return BALL_SUPPLY_RANK[supply] >= BALL_NEED_RANK[need];
}

/** True when the headcount splits cleanly into the groups the drill needs. */
export function groupingFits(grouping, players) {
  if (!players) return true;

  switch (grouping) {
    case "pairs":
    case "even-teams":
      return players % 2 === 0;
    case "threes":
      return players % 3 === 0;
    default:
      return true;
  }
}

/** Narrows the catalog down to drills that can actually be run today. */
export function filterDrills(drills, filters, favorites = null) {
  const { players, balls, level, category, type, favoritesOnly } = { ...DEFAULT_FILTERS, ...filters };
  const favSet =
    favorites instanceof Set
      ? favorites
      : filters?.favorites instanceof Set
        ? filters.favorites
        : Array.isArray(filters?.favorites)
          ? new Set(filters.favorites)
          : null;

  return drills.filter((drill) => {
    if (favoritesOnly && favSet && !favSet.has(drill.id)) return false;
    if (players && drill.minPlayers > players) return false;
    if (!groupingFits(drill.grouping, players)) return false;
    if (!ballsFit(drill.balls, balls)) return false;
    if (level !== "any" && !drill.levels.includes(level)) return false;
    if (category !== "any" && drill.category !== category) return false;
    if (type !== "any" && drill.type !== type) return false;
    return true;
  });
}

/**
 * Picks one item at random, preferring anything other than `previous` so
 * pressing the button twice does not hand back the same drill.
 */
export function pickRandom(items, random = Math.random, previous = null) {
  if (items.length === 0) return null;

  const candidates = items.length > 1 && previous ? items.filter((item) => item.id !== previous.id) : items;
  const pool = candidates.length > 0 ? candidates : items;

  return pool[Math.min(Math.floor(random() * pool.length), pool.length - 1)];
}
