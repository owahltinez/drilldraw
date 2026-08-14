import { describe, expect, test } from "bun:test";
import DRILLS from "./drills.json";
import { CATEGORIES, filterDrills } from "./filters.js";

const LEVELS = ["beginner", "intermediate", "advanced"];
const GROUPINGS = ["any", "pairs", "threes", "even-teams"];
const BALLS = ["none", "shared", "per-pair", "per-player"];
const TYPES = ["drill", "game"];

describe("drill catalog", () => {
  test("is large enough to keep sessions varied", () => {
    expect(DRILLS.length).toBeGreaterThanOrEqual(60);
  });

  test("has unique ids", () => {
    const ids = DRILLS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test.each(DRILLS.map((d) => [d.id, d]))("%s has valid tags", (_id, drill) => {
    expect(drill.name.length).toBeGreaterThan(0);
    expect(CATEGORIES).toContain(drill.category);
    expect(TYPES).toContain(drill.type);
    expect(GROUPINGS).toContain(drill.grouping);
    expect(BALLS).toContain(drill.balls);
    expect(drill.levels.length).toBeGreaterThan(0);
    for (const level of drill.levels) expect(LEVELS).toContain(level);
    expect(drill.minPlayers).toBeGreaterThanOrEqual(1);
    expect(drill.minutes).toBeGreaterThan(0);
    expect(typeof drill.needsHoop).toBe("boolean");
    expect(drill.description.length).toBeGreaterThan(40);
    expect(Array.isArray(drill.coachingPoints)).toBe(true);
  });

  test("pair drills need an even minimum, threes a multiple of three", () => {
    for (const drill of DRILLS) {
      if (drill.grouping === "pairs" || drill.grouping === "even-teams") {
        expect(drill.minPlayers % 2, `${drill.id} minPlayers`).toBe(0);
      }
      if (drill.grouping === "threes") {
        expect(drill.minPlayers % 3, `${drill.id} minPlayers`).toBe(0);
      }
    }
  });

  test("solo-ball drills are not tagged as needing a ball each", () => {
    for (const drill of DRILLS) {
      if (drill.balls === "per-player") {
        expect(drill.minPlayers, `${drill.id}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  test("contains no character-building filler, only basketball", () => {
    const banned = /honesty|core value|team circle|respect circle|character/i;
    for (const drill of DRILLS) {
      expect(`${drill.name} ${drill.description}`, drill.id).not.toMatch(banned);
    }
  });
});

describe("the hardest real-world sessions still have options", () => {
  const scenarios = [
    { label: "4 kids, 2 balls, beginners", players: 4, balls: "few", level: "beginner" },
    { label: "5 kids, 2 balls, intermediate", players: 5, balls: "few", level: "intermediate" },
    { label: "5 kids, ball each, advanced", players: 5, balls: "all", level: "advanced" },
    { label: "7 kids (odd), balls for half, beginner", players: 7, balls: "half", level: "beginner" },
    { label: "12 kids, 2 balls, advanced", players: 12, balls: "few", level: "advanced" },
  ];

  test.each(scenarios)("$label yields at least 5 drills", (scenario) => {
    const got = filterDrills(DRILLS, { ...scenario, category: "any", type: "any" });
    expect(got.length).toBeGreaterThanOrEqual(5);
  });

  test("every level has both fun games and skill drills", () => {
    for (const level of LEVELS) {
      for (const type of TYPES) {
        const got = filterDrills(DRILLS, { players: 0, balls: "all", level, category: "any", type });
        expect(got.length, `${level}/${type}`).toBeGreaterThanOrEqual(5);
      }
    }
  });
});
