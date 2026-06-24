# Unreleased — draft release notes (next **public** beta)

**Dev Beta 4.2** shipped as a **Patreon dev-only** drop (`BP - Dev/`, `v0.9.0-beta.4.2`) — see [DEV_BETA_4.2.md](DEV_BETA_4.2.md). Public `BP/` remains **beta.4** until next store/GitHub release.

**Status:** Work landed on `main` in dev commit `67d9de8` — **do not bump public version** until maintainer says release.  
**When shipping:** copy player bullets → `docs/PLAYER_CHANGELOG.md`, `docs/RELEASE_BODY.md`, `BP/scripts/mb_playerChangelog.js`, run `npm run sync:pack-metadata`, tag `v*`. CI attaches **BP + RP** zips only (no dev pack downloads on the Release).

---

## Player-facing (What's new / Patreon / GitHub Release)

### Performance

- **Villages & chunk travel:** Less hitch when walking into villages or **back through chunks you already visited** — heavy script work spreads across ticks and **briefly defers** when you cross a 16×16 chunk edge.
- **Early world (day 0–1):** Background scans and entity work run on **lighter schedules** until infection ramps.
- **Crowded worlds:** Spawn controller **auto-throttles** scan/spawn effort when addon bear counts, overworld item entities, active storms, or tick stress rise (Journal → Performance still available).

### Buff bears

- **Cap fix:** Buff bears no longer **stack past the limit** when you die, respawn elsewhere, or leave and return — two limits apply: **near you** (tight) and **whole dimension** (higher ceiling). Excess buffs far from players are trimmed over time.
- **Near you (solo):** max **1** buff bear in your spawn/scan area; **3** max loaded in the overworld (solo).
- **Multiplayer:** near cap **2–3** by player count; dimension cap **5–6** (see `mb_balance.js` for exact table).

### Torpedo bears

- **~5% duds:** Some torpedo bears are **duds** — they dive and break blocks but **do not explode** on death (quiet death sound, no powder ring).

### Mining bears

- **Stair stall fix:** Less likely to get stuck on stairs when the step is blocked but nothing was cleared — they keep mining headroom or nudging forward.
- **More snow while digging:** Trails and broken blocks place **`mb:snow_layer`** more often (stronger spread pressure).

### Balance (unchanged from beta.4 but still true)

- Buff death **powder burst** is back; mob kills still respect **victim size** (tiny / infected / buff).
- Storm conversions respect buff caps; no double-convert when a bear killed the mob.

---

## Dev pack only (journal — not in public release notes unless you want)

- **Biome checker:** Journal → Developer Tools → Systems — compare `getBiome` at your feet vs infected biome JSON; optional **action-bar HUD**; safe-by-design list (mushroom island, mega taiga, etc.).
- **Pinnable shortcuts:** Pin menu organized by category (Performance, Systems, Bears, …); new pins for Spawn AUTO, biome checker, emulsifier, etc.
- **Force spawn bears** moved under **Developer Tools → Bears** (not Spawn controller).
- **Script self-test**, spawn load HUDs, perf roadmap docs (`docs/development/PERFORMANCE_OPTIMIZATION_ROADMAP.md`).

---

## Maintainer checklist (on release day)

1. [ ] Playtest day **8–20**, village **re-pass**, death/respawn loops (day 0 route was smooth — see context summary 2026-05-19).
2. [ ] Pick version (e.g. `0.9.0-beta.5`).
3. [ ] `PLAYER_CHANGELOG.md` — move draft bullets under new `## v…` section.
4. [ ] `mb_playerChangelog.js` + `BP - Dev` copy — bump `PLAYER_CHANGELOG_VERSION` + in-game body.
5. [ ] `docs/RELEASE_BODY.md` — GitHub Release text.
6. [ ] `mb_buildConfig.js` — `ADDON_VERSION_PRERELEASE`; `npm run sync:pack-metadata`.
7. [ ] Merge dev → public: `npm run sync:bp-from-dev`; copy any changed JSON/assets in `BP/` + `RP/` from dev twins (keep release `mb_buildConfig.js`).
8. [ ] `npm run check`; tag; GitHub Release (**BP + RP** zips only).

---

## Git reference

| Commit | Summary |
|--------|---------|
| `67d9de8` | Dev: perf pass, biome checker, buff dual-cap, journal pins |
