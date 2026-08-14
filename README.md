# Drill Draw

A random basketball drill picker for youth coaching, built for the situation where
you find out what you have to work with only when the kids show up: how many of
them, how skilled they are, and how many basketballs made it to the gym.

Filter, tap **Pick a drill**, run it. Filters are remembered, so between the three
sessions on a practice day you usually only need to change the skill level.

Live at **https://owahltinez.github.io/drilldraw/**

## Installing it on a phone

Open the link and use the browser's install prompt — "Add to Home Screen" on iOS
Safari, "Install app" on Chrome. It launches without browser chrome and works with
no signal at all, which is the usual state of a school gym.

## Running it

```sh
bun test        # filter logic, catalog validation, UI wiring, build output
bun run build   # writes dist/
```

The build emits:

```
dist/index.html              the whole app — data, styles and script inlined
dist/manifest.webmanifest    so a browser will offer to install it
dist/sw.js                   service worker, precaches the app for offline use
dist/icon-*.png              install icons, including a maskable one
dist/artifact.html           the page without a document wrapper, for publishing elsewhere
```

`dist/index.html` needs nothing else to work: opened straight from disk it still
runs, and the service worker registration is skipped there since a local file is
already offline. The manifest and worker cannot be inlined — the spec requires them
to be real same-origin files — so they sit beside it and only matter when hosted.

## Filters

| Filter | Answers |
| --- | --- |
| **Players today** | Drops anything needing more bodies than you have, and anything whose groups do not divide evenly into your headcount |
| **Basketballs** | `2–3 balls` / `Half the kids` / `One each` |
| **Skill level** | Beginner, intermediate, advanced — a drill can belong to more than one |
| **Drills or games** | Fun games for the little ones vs. skill work for the older groups |
| **Focus** | Warm-up, dribbling, passing, shooting, finishing, footwork, defense, rebounding, team play |

Equipment is assumed to be 2–3 basketballs and a bag of cones, always. That is why
`shared` below means "1–3 balls" — anything tagged that way is runnable on any day.

## The catalog

141 drills in `src/drills.json`. One object per drill:

```json
{
  "id": "sharks-and-minnows",
  "name": "Sharks and Minnows",
  "category": "dribbling",
  "type": "game",
  "levels": ["beginner", "intermediate"],
  "minPlayers": 5,
  "grouping": "any",
  "balls": "per-player",
  "needsHoop": false,
  "minutes": 8,
  "description": "...",
  "coachingPoints": ["..."]
}
```

- `type` — `game` (fun, competitive, for younger kids) or `drill` (skill work)
- `grouping` — `any`, `pairs` (needs an even number), `threes` (needs a multiple of
  three), `even-teams` (needs an even number to split into sides)
- `balls` — `none`, `shared` (1–3 balls total), `per-pair`, `per-player`

Adding a drill means adding an object. `src/drills.test.js` validates every field,
checks that `pairs`/`threes` drills have a compatible `minPlayers`, and asserts that
the hard real-world sessions (4 kids and two balls, 12 kids and two balls, an odd
headcount) each still return at least five options.

Non-basketball filler was deliberately left out — there are no character-values
circles or team-motto discussions in here, and a test fails if one gets added.

## Layout

```
src/drills.json   the catalog (data only)
src/filters.js    selection logic — pure functions, no DOM
src/app.js        UI wiring
src/page.html     markup and styles
src/icon.svg      the tab icon
src/icon-180.png  the same icon rasterized, for the iOS home screen
src/icon-*.png    install icons at the sizes a manifest requires
src/manifest.webmanifest
src/sw.js         service worker; __VERSION__ is stamped at build time
build.js          inlines everything into dist/
```

The tab and home screen icons are embedded as data URIs at build time, so the page
keeps working opened straight from disk where a sibling file would not resolve.
`src/build.test.js` fails the build if the page gains a network dependency, loses an
icon, ships an invalid manifest, or the worker precaches a path that is not emitted.

## Sources

Drills were drawn from published youth coaching material and rewritten into a common
format: Breakthrough Basketball's youth and fun-drill collections and their *60 Fun
Youth Basketball Drills & Games*, Basketball For Coaches' drill and game lists, and
the YMCA/SportsEdTV practice plans for ages 5–6 and 11-and-up. A few drills that
needed equipment you will not have (flag belts, hula hoops, chairs) were adapted to
use cones instead.
