import { describe, expect, test } from "bun:test";
import { DEFAULT_FILTERS, filterDrills, groupingFits, pickRandom, ballsFit } from "./filters.js";

/** Minimal drill factory so each test only states what it cares about. */
function drill(overrides = {}) {
  return {
    id: "test-drill",
    name: "Test Drill",
    category: "dribbling",
    type: "drill",
    levels: ["beginner", "intermediate", "advanced"],
    minPlayers: 1,
    grouping: "any",
    balls: "shared",
    needsHoop: false,
    minutes: 10,
    description: "A drill.",
    coachingPoints: [],
    ...overrides,
  };
}

describe("ballsFit", () => {
  test("drills needing no ball always fit", () => {
    for (const supply of ["few", "half", "all"]) {
      expect(ballsFit("none", supply)).toBe(true);
    }
  });

  test("shared-ball drills fit any supply because 2-3 balls are always on hand", () => {
    for (const supply of ["few", "half", "all"]) {
      expect(ballsFit("shared", supply)).toBe(true);
    }
  });

  test("one ball per pair needs at least half the players covered", () => {
    expect(ballsFit("per-pair", "few")).toBe(false);
    expect(ballsFit("per-pair", "half")).toBe(true);
    expect(ballsFit("per-pair", "all")).toBe(true);
  });

  test("one ball per player needs a full set", () => {
    expect(ballsFit("per-player", "few")).toBe(false);
    expect(ballsFit("per-player", "half")).toBe(false);
    expect(ballsFit("per-player", "all")).toBe(true);
  });
});

describe("groupingFits", () => {
  test("any grouping accepts any headcount", () => {
    expect(groupingFits("any", 5)).toBe(true);
    expect(groupingFits("any", 12)).toBe(true);
  });

  test("pairs require an even headcount", () => {
    expect(groupingFits("pairs", 6)).toBe(true);
    expect(groupingFits("pairs", 7)).toBe(false);
  });

  test("threes require a headcount divisible by three", () => {
    expect(groupingFits("threes", 9)).toBe(true);
    expect(groupingFits("threes", 10)).toBe(false);
  });

  test("even teams require an even headcount", () => {
    expect(groupingFits("even-teams", 8)).toBe(true);
    expect(groupingFits("even-teams", 9)).toBe(false);
  });
});

describe("filterDrills", () => {
  const drills = [
    drill({ id: "a", levels: ["beginner"], minPlayers: 4, balls: "per-player", category: "dribbling" }),
    drill({ id: "b", levels: ["advanced"], minPlayers: 8, balls: "shared", category: "defense" }),
    drill({ id: "c", levels: ["beginner", "intermediate"], minPlayers: 2, grouping: "pairs", balls: "per-pair" }),
  ];

  test("no filters returns everything", () => {
    expect(filterDrills(drills, DEFAULT_FILTERS).map((d) => d.id)).toEqual(["a", "b", "c"]);
  });

  test("drops drills that need more players than are present", () => {
    const got = filterDrills(drills, { ...DEFAULT_FILTERS, players: 6 });
    expect(got.map((d) => d.id)).toEqual(["a", "c"]);
  });

  test("drops pair drills when the headcount is odd", () => {
    const got = filterDrills(drills, { ...DEFAULT_FILTERS, players: 5, balls: "all" });
    expect(got.map((d) => d.id)).toEqual(["a"]);
  });

  test("drops ball-hungry drills when balls are scarce", () => {
    const got = filterDrills(drills, { ...DEFAULT_FILTERS, balls: "few" });
    expect(got.map((d) => d.id)).toEqual(["b"]);
  });

  test("matches a drill if the level is one of several it supports", () => {
    const got = filterDrills(drills, { ...DEFAULT_FILTERS, level: "intermediate" });
    expect(got.map((d) => d.id)).toEqual(["c"]);
  });

  test("filters by category", () => {
    const got = filterDrills(drills, { ...DEFAULT_FILTERS, category: "defense" });
    expect(got.map((d) => d.id)).toEqual(["b"]);
  });

  test("filters by type", () => {
    const games = [drill({ id: "g", type: "game" }), drill({ id: "d", type: "drill" })];
    expect(filterDrills(games, { ...DEFAULT_FILTERS, type: "game" }).map((d) => d.id)).toEqual(["g"]);
  });

  test("combines every filter at once", () => {
    const got = filterDrills(drills, {
      players: 6,
      balls: "half",
      level: "beginner",
      category: "any",
      type: "any",
    });
    expect(got.map((d) => d.id)).toEqual(["c"]);
  });
});

describe("pickRandom", () => {
  test("returns null for an empty list", () => {
    expect(pickRandom([], () => 0)).toBeNull();
  });

  test("uses the injected random source to choose", () => {
    const items = ["a", "b", "c"];
    expect(pickRandom(items, () => 0)).toBe("a");
    expect(pickRandom(items, () => 0.99)).toBe("c");
  });

  test("avoids repeating the previous pick when alternatives exist", () => {
    const items = [{ id: "a" }, { id: "b" }];
    expect(pickRandom(items, () => 0, { id: "a" }).id).toBe("b");
  });

  test("repeats the only option rather than returning nothing", () => {
    const items = [{ id: "a" }];
    expect(pickRandom(items, () => 0, { id: "a" }).id).toBe("a");
  });
});
