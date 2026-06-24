# Dev Beta 4.2 — The Maple Bear Apocalypse (Dev pack only)

**Label:** `v0.9.0-beta.4.2 (dev build)`  
**Base public release:** `v0.9.0-beta.4` (unchanged on GitHub Releases)  
**Audience:** Patreon / internal playtest — **`BP - Dev/` + `RP - Dev/`** (Bridge `.mcpack` export).

## Install

1. Remove old dev packs from the world.
2. Import **`The Maple Bear Apocalypse (Dev)`** behavior + resource from Bridge.
3. **Recommended:** fresh world or new chunks if you were stress-testing abandoned villages on 4.1.

## Highlights

### Camera feel (good for short video)

- **Snow buzz** — eating `mb:snow` gives a short camera wobble (~2s). Spam it and the buzz **lastens** but each bite hits **softer**; high lifetime snow count dulls the effect (matches tier text).
- **Infection shake** — softer overall; ramps over the **last 30s** before transform instead of spiking early.
- **Journal → Settings → Camera shake (infection + snow buzz)** — one toggle for both.

### Day 0 performance

- Major fix: abandoned village worldgen no longer treats every player as “near a lamp” (224-block grid bug) → far less background scanning on join.
- **Script village placement is OFF by default** — enable only when testing: **Settings → Dev world features**.
- Lamp-at-post detection faster when villages are enabled; idle sleep when far from sites.

### Structure pipeline

- Clean `.mcstructure` exports (no `structure_block` in volume) — no runtime artifact cleanup pass.
- Re-exported lamp markers + export docs updated.

## Not in this drop

- Public **`BP/`** / **`RP/`** GitHub Release (still beta.4).
- Natural jigsaw village worldgen (collab track — script villages remain WIP opt-in).

## Patreon copy

See **`docs/marketing/PATREON_DEV_BETA_4.2.md`**.

## Journal / version alignment

- **`BP - Dev/scripts/mb_buildConfig.js`** → `beta.4.2`
- **`BP - Dev/scripts/mb_playerChangelog.js`** → What's new body + `PLAYER_CHANGELOG_VERSION`
- **`npm run sync:pack-metadata`** → dev manifests use **BP - Dev** prerelease (public `BP/` stays `beta.4`)
- Settings footer: **`v0.9.0-beta.4.2 (dev build)`**
