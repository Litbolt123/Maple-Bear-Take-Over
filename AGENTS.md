---
description: 
alwaysApply: true
---

# AGENTS.md

## Project overview

**M.B.A (Maple Bear Apocalypse)** is a Minecraft Bedrock Edition addon (behavior pack + resource pack). Public name on packs: **M.B.A**; full title **Maple Bear Apocalypse**. (*Maple Bear Takeover* is an archived former title.) It is **not** a traditional web application — there is no backend server, database, or frontend framework.

- `BP/` — **Public release only** (CurseForge / players). `mb_buildConfig.js`: **`INCLUDE_FULL_DEVELOPER_TOOLS === false`** → gated **Host tools** for `mb_cheats` / Litbolt123 (minor storms, capped spawns, list bears, journal pins). No Developer Tools tree. Ship with `RP/`.
- `BP - Dev/` — **Never publish.** Same scripts as `BP/` for parity, but `mb_buildConfig.js` keeps **`INCLUDE_FULL_DEVELOPER_TOOLS === true`** → full Developer Tools, Debug, spawn controller, storm hub, etc. After copying dev scripts into `BP/`, **restore** `BP - Dev/scripts/mb_buildConfig.js` (do not paste release config over dev). Optional: dev menu can preview public Host tools via world flag `mb_world_dev_preview_admin_main`.
- `RP/` — Resource Pack (models, textures, sounds, particles, animations)
- `RP - Dev/` — Dev twin; keep manifest versions aligned with `BP - Dev/`
- `tools/` — Node.js developer tooling scripts
- `docs/` — Design docs, planning, and reference material. **Index:** `docs/README.md`. **Per-script overview:** `docs/development/SCRIPTS_REFERENCE.md`.

### Context log (single file)

- Maintain **one** running session / change log: **`docs/context summary.md`**.
- Add new work as **dated sections at the top** (newest first). Do **not** create or duplicate a second long-form context file; **`docs/ai/CONTEXT_SUMMARY.md`** is only a **stub** that links to the canonical file.

The JavaScript in `BP/scripts/` uses ES modules with `@minecraft/server` and `@minecraft/server-ui` APIs (provided at runtime by Minecraft, not npm packages).

**Balance / tuning:** `mb_balance.js` centralizes spawn **entity-type caps**, **natural buff cooldown** tick length, **mob→bear conversion pressure** multipliers, **buff conversion near-cap**, **getInfectionRate** (day-step table), storm-reservoir spawn bumps (Phase 2), and **infection director** tier constants (Phase 3). **`mb_spawnConfigs.js`** owns **`SPAWN_CONFIGS`** (per-entity spawn curves). **`mb_spawnEntityIds.js`** centralizes spawn/conversion entity IDs.  
**Helpers (flat `scripts/`):** `mb_propertyMigration.js` (world schema version + one-shot key migrations), `mb_playerChangelog.js` / `mb_journalWhatsNew.js` (in-game **What's new**), `mb_bearTelemetry.js` (dev-only bear counts by type → content log when Spawn → **Bear telemetry** is on), `mb_miningConstants.js` (dimension IDs + mining bear types + pathfinding union + air set).

## Cursor Cloud specific instructions

### Development commands

All commands are defined in `package.json`:

| Command | Purpose |
|---------|---------|
| `npm run lint` | ESLint check on `BP/scripts/` and `tools/` |
| `npm run lint:fix` | ESLint with auto-fix |
| `npm run validate:json` | Validate all JSON files in `BP/` and `RP/` |
| `npm run validate:syntax` | Node.js `--check` on all BP scripts (`tools/testAllScripts.js`; works on Windows) |
| `npm run test:scripts` | Same as `validate:syntax` |
| `npm run test:scripts:release` | Syntax check `BP/scripts/` only |
| `npm run validate` | JSON + syntax validation |
| `npm run check` | Full validation + lint |

### Runtime constraints

- The addon can only truly run inside **Minecraft Bedrock Edition** (Windows/Xbox/mobile game client). There is no way to execute the game scripts headlessly in this cloud VM.
- `@minecraft/server` and `@minecraft/server-ui` imports will fail under Node.js — they are Minecraft-provided runtime modules. Syntax checking with `node --check` works, but `node BP/scripts/main.js` will not.
- ESLint is configured to treat these Minecraft modules as external globals; lint will succeed despite the unresolvable imports.

### Tools

- `tools/testAllScripts.js` — Cross-platform **`node --check`** on every `*.js` under `BP/scripts/` and `BP - Dev/scripts/`. Used by **`npm run validate:syntax`** and **`npm run test:scripts`**. Per-script manual smoke ideas: **`docs/development/testing/SCRIPT_TEST_MAP.md`**.
- **In-game (dev pack):** **Journal → Developer Tools → Systems → Script self-test** runs **`mb_devScriptSelfTest.js`** (day, spawn load snapshot, storms, toggles, dimensions, etc.); also **`console.warn`**’d for the Content Log. Not a substitute for **`npm run check`** on your PC.
- `tools/updateMiningBlocks.js` copies `MINING_BREAKABLE_BLOCKS` from `BP/scripts/mb_miningBlockList.js` into `minecraft:break_blocks` on mining bear entities (optional consistency with the list the **script** uses). **Actual digging** is done in `mb_miningAI.js` via `dimension.setPermutation` / break logic, not by vanilla entity break components. Run: `node tools/updateMiningBlocks.js` from repo root (requires Node on PATH).

**Other script-driven block clearing**: `mb_torpedoAI.js` clears blocks with `setType("minecraft:air")` in path bursts — same idea (no reliance on entity `break_blocks`).

### Bridge / local dev pack

**[`config.json`](config.json)** at repo root is **Bridge’s** project file (`type: minecraftBedrock`, `packs` → `./BP`, `./RP`). It is not loaded by Minecraft scripts. Point Bridge at **`BP - Dev/`** and **`RP - Dev/`** for internal work (adjust `packs` paths in Bridge if you use a dev-only Bridge project).

Point Bridge (or any Bedrock pack project) at **`BP - Dev/`** and **`RP - Dev/`**: copy or sync those folders into your Bridge behavior pack and resource pack roots (replace the pack contents you use for Maple Bear). After a full sync from public `BP/`, restore **`BP - Dev/scripts/mb_buildConfig.js`** so `INCLUDE_FULL_DEVELOPER_TOOLS` stays `true`. Entry script loads **`./mb_buildConfig.js` first** from `main.js`; on **public** `BP/`, that module no-ops `console.log` / `info` / `warn` / `debug` so release builds stay quiet (`console.error` unchanged).

**Bridge `.mcpack` export:** Bump semver in `BP/scripts/mb_buildConfig.js`, then run **`npm run sync:pack-metadata`** so manifests + `config.json` show **The Maple Bear Apocalypse** and `v0.9.0-beta.x` in descriptions. See [`docs/development/BRIDGE_EXPORT_AND_VERSIONING.md`](docs/development/BRIDGE_EXPORT_AND_VERSIONING.md).

### Release checklist (public `BP/` + `RP/`)

When folding work from **`BP - Dev/`** / **`RP - Dev/`** into a store or public drop:

- **Merge into public trees:** copy or sync changed scripts, JSON, and assets into **`BP/`** and **`RP/`** (whatever actually changed in dev). For all behavior scripts except build config: **`npm run sync:bp-from-dev`** (`tools/syncBpFromDev.js` — skips **`mb_buildConfig.js`**).
- **Do not swap build configs between packs:** **`BP/scripts/mb_buildConfig.js`** → `BUILD_FLAVOR = "release"`, **`INCLUDE_FULL_DEVELOPER_TOOLS = false`**. **`BP - Dev/scripts/mb_buildConfig.js`** → `BUILD_FLAVOR = "dev"`, **`INCLUDE_FULL_DEVELOPER_TOOLS = true`**. One file controls all journal gating (`isReleaseAdminBuild()` in codex).
- **Manifests:** confirm **`BP/manifest.json`** and **`RP/manifest.json`** (name, description, uuid/version policy) match what you publish; **description** beta label should match **`ADDON_VERSION_PRERELEASE`** and **`PLAYER_CHANGELOG_VERSION`** in **`mb_buildConfig.js`** / **`mb_playerChangelog.js`** (same for **`BP - Dev/`** + **`RP - Dev/`** when tagging dev builds).
- **Validate:** run **`npm run check`** (or at least `npm run validate` + `npm run lint`) against the **`BP/`** and **`RP/`** trees after the merge.
- **Ship only public packs** to players: **`BP/`** + **`RP/`** — do not distribute **`BP - Dev/`** or **`RP - Dev/`** as the main download.
- **Optional:** add a short note to **`docs/context summary.md`** (dated section) for notable release-facing changes.
- **GitHub Releases (tag-driven CI):** bump **`BP/scripts/mb_buildConfig.js`**, edit **`docs/RELEASE_BODY.md`**, `npm run sync:pack-metadata`, `npm run check`, commit, `git tag v<semver>`, `git push origin v<semver>`. CI attaches **`BP/`** + **`RP/`** zips only; **`BP - Dev/`** and **`RP - Dev/`** stay in the repo (Bridge), not as release downloads. Export **`.mcpack` in Bridge**. See **`docs/releasing.md`**.
- **Performance:** [`docs/development/PERFORMANCE_OPTIMIZATION_ROADMAP.md`](docs/development/PERFORMANCE_OPTIMIZATION_ROADMAP.md) + [`PERFORMANCE_DEBUG.md`](docs/development/PERFORMANCE_DEBUG.md).

### Adaptive storm / mining load (no true MSPT)

- Scripts cannot read server MSPT. **`mb_performanceProfile.js`** runs a **wall-clock ms-per-game-tick** median (spike proxy) and a **weighted count** of expensive Maple Bear types (mining, buff, flying, torpedo) every 40 ticks, and **only when storm & mining multipliers are on Auto** multiplies the existing auto storm/mining work factors (capped). **Journal → LAGGY** tier disables this nudge. World property **`mb_perf_disable_adaptive`** = `1` turns adaptive off.

### Spawn load auto-scaling (spawn controller only)

- **`mb_spawnLoadMetrics.js`** samples **addon mob counts** (all types in `ALL_MB_MOB_TYPES`) across overworld/nether/end every **40t**, and **overworld `minecraft:item`** count every **120t** (capped at 4000 for the formula). It combines those with **active storm count** (`getActiveStormCount` from **`mb_snowStorm.js`**) and optional probes wired from **`main.js`**: **`getPerfWallStress01`**, **`getPerfMobPressureForSpawn01`**. World properties: **`mb_spawn_load_auto`** (default on — use snapshot + probes), **`mb_spawn_load_bias`** (0–4 manual thrift tier). Outputs drive **`mb_spawnController.js`**: main-loop interval multiplier, block-query budget scale, candidate/global spawn caps, and scan cooldown multiplier. **Developer Tools → Performance → Spawn load & efficiency** (and optional journal pin) toggles auto/bias and shows a live snapshot; **`initializeSpawnLoadScalerWatch()`** + **`registerSpawnLoadProbes(...)`** run next to adaptive perf init in **`main.js`**.
- **Spawn/scan preset labels:** **`SPAWN_INTENSITY_PRESETS`** and **`resolveSpawnTuningRecognition()`** in **`mb_spawnController.js`** infer the active **spawn intensity** tier, **scan preset**, **quick combo**, and (when storm/mining manuals match) **world perf combo**. Dev spawn menus show **`menuBody`**; optional action-bar preset hint uses world property **`mb_spawn_preset_hud`** (toggle under **Spawn → Performance**, dev builds, slot **`ACTION_BAR_SLOT.SPAWN_TUNING`**).

### Gotchas

- There are no in-game automated test frameworks. Run **`npm run check`** before commits (JSON + syntax + ESLint). Use **`docs/development/testing/SCRIPT_TEST_MAP.md`** for per-script manual checks; **`TESTING_CHECKLIST.md`** for deeper historical scenarios.
- The behavior pack has many JS modules under `BP/scripts/` (entry: `main.js` is large; total line count grows with features).
- ESLint reports ~220 warnings (all `no-unused-vars`). These are pre-existing and expected — many variables/functions are reserved for future use or disabled debug features.
