# Player-facing changelog

Short bullets for patch notes and in-game **What's new** (`mb_playerChangelog.js` — **`BP - Dev/`** for dev drops; **`BP/`** for public).
Bump **`PLAYER_CHANGELOG_VERSION`** in `mb_playerChangelog.js` when you ship a new beta.

## Dev Beta 4.2 (dev pack only · `v0.9.0-beta.4.2`)

Patreon / **`BP - Dev/`** playtest — public **`BP/`** remains **v0.9.0-beta.4** until next store release.  
Release notes: [`development/releases/DEV_BETA_4.2.md`](development/releases/DEV_BETA_4.2.md)

### Feel

- **Snow buzz:** eating `mb:snow` gives a short camera wobble (~2s). Re-eat within ~5s → longer buzz, weaker each pulse. High lifetime snow count dulls the effect.
- **Infection camera shake:** softer overall; ramps over the **last ~30 seconds** before transform (not constant heavy shake early).
- **Journal → Settings → Camera shake (infection + snow buzz)** — one toggle.

### Performance & villages

- Fixed abandoned-village worldgen treating almost every player as “near a lamp” (day-0 lag spikes).
- **Script village placement OFF by default** — **Settings → Dev world features** (WIP; ship goal is natural jigsaw worldgen).
- Clean structure exports — no runtime `structure_block` cleanup at lamp posts.

---

## Unreleased (draft — next public beta)

**Copy from here when releasing.** Full draft + dev bullets: [`docs/development/releases/UNRELEASED_DRAFT.md`](development/releases/UNRELEASED_DRAFT.md).  
**Do not bump version** until release day.

### Performance

- Villages and **revisiting chunks** you already passed: less hitch — work spreads across ticks and **defers briefly** when you cross a chunk border.
- **Day 0–1:** lighter background scans until infection ramps.
- **Heavy worlds:** spawn system **auto-throttles** scan/spawn when bear counts, items, storms, or lag stress rise.

### Buff bears

- **Fix:** buff bears no longer **stack past the limit** when you leave, die/respawn elsewhere, or return — **near-you** cap (tight) plus a higher **dimension** cap; extras far from players trim down over time.
- Solo reference: **1** buff near you, up to **3** in the dimension (loaded).

### Torpedo bears

- **~5% duds** — no death explosion; quieter death, no powder ring.

### Mining bears

- **Stair stall fix** — less freezing on blocked stairs; keeps mining headroom or pushing forward.
- **More snow** while digging (trails + blocks broken).

---

## v0.9.0-beta.4

- Performance: day 0–1 and approaching villages should hitch less — heavy work is spread across ticks and uses smaller entity scans near players.
- **Snow buzz:** eating powder gives a short camera wobble (Settings → camera shake); stacks softer if eaten quickly; dulls at high snow count.
- **Infection camera shake:** softer overall; ramps over the last ~30 seconds before transform.
- Buff bears: death powder explosion is back; kills convert by victim size (tiny / normal / large), not always the smallest bear.
- Balance: buff bear count is capped on **all** spawn paths (including storms and conversions); extra conversions become infected bears for the current day.
- Storms: fixed double conversion when a bear killed the mob; storm waves no longer flood buff bears past the cap.

## v0.9.0-beta.3

- Storms: when no overworld player is within horizontal range of a storm center, that storm does less particles/snow/drift work (far storms still expire normally). Mob damage and major destruct remain gated by nearby players as before.
- Bear population cull: lower global trigger toward a smaller target; eligible types default to tiny + infected family (buff/flying/mining/torpedo unchanged). Dev pack: journal tuning for thresholds and per-type eligibility overrides.
- Mining bears: pathfinding cleanup uses direct entity lookup instead of scanning dimensions by type.
- Codex: storm hub copy clarifies concurrent Maple Bear storms vs the engine’s storm cap.

## v0.9.0-beta.2

- Infection evolution (Phases 1–3): storm exposure and proximity to active storms influence natural Maple Bear spawn pressure; day bands and world load feed a staged “director” that adjusts spawn attempts on top of chance; HUD may toast when day phases advance.
- Journal / codex: **Biomes → Infection Storm** — schedule by addon difficulty (Hard day 2 / Normal 4 / Easy 6 first eligible day); minors dominate through day 10, majors from day 11, only majors after day 20; shelter, emulsifier reclaim, and pressure notes as before.
- Performance: existing spawn-load scaling and adaptive perf continue to apply alongside the new systems—use **Journal → Performance** if the world feels heavy.

## v0.9.0-beta.1

- Spawn balance: infected and flying bear caps adjusted; natural buff spawns respect a world cooldown between spawn-controller buffs (conversions unchanged).
- Journal: new **What's new** entry on the Powdery Journal main menu.
- Internal: balance numbers centralized in `mb_balance.js` for easier tuning.
