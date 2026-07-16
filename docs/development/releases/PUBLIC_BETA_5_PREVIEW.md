# Public release preview — v0.9.0-beta.5 (draft)

| | |
|---|---|
| **Status** | Code ready — `v0.9.0-beta.5` bumped; test in Bridge then Patreon export |
| **Audience** | Free / patron players on public **BP/** + **RP/** (not `BP - Dev/`) |
| **Distribution** | **Patreon** (primary download) · **CurseForge** optional later · **no** public GitHub Release or tag publicity |
| **Excluded** | Script-built abandoned villages (WIP; dev-only; not mentioned in player-facing copy) |

**Use this for:** Patreon post bullets, optional CurseForge description, `docs/PLAYER_CHANGELOG.md`, and in-game **What's new** when beta.5 ships. Paste-ready Patreon copy: [`docs/marketing/PATREON_BETA_5_UPDATE_DRAFT.md`](../../marketing/PATREON_BETA_5_UPDATE_DRAFT.md) (tone matched to [`PATREON_ORIGINAL_LAUNCH_POST.md`](../../marketing/PATREON_ORIGINAL_LAUNCH_POST.md)).

**Skip for this drop:** `docs/RELEASE_BODY.md`, `git tag v*`, and any “download on GitHub” messaging.

---

## What is The Maple Bear Apocalypse?

A Bedrock **infection survival** addon. White powder spreads from Maple Bears, storms, and the ground. You track symptoms in the **Powdery Journal**, fight escalating bear types as world days advance, and try not to transform.

---

## Core gameplay (beta.4 baseline + carried forward)

### Infection

- **Minor infection** — bear hits or powder exposure; timer, cough/audio cues, temptation to eat snow.
- **Major infection** — worse symptoms; eating `mb:snow` advances severity and shortens your timer.
- **Cures** — golden apple + carrot (minor); weakness + enchanted golden apple (major); immunity paths in the journal.
- **Death** — without permanent immunity, death **clears** active infection and respawns you with a **fresh minor** (no carrying a near-death major timer through respawn).
- **Ground exposure** — `mb:dusted_dirt` and snow layers add pressure in infected biomes.

### World & days

- **Addon day counter** — unlocks stronger bear variants (days 4, 8, 13, 20+).
- **Infected overworld biome** — overworld feel shifts via resource pack (fog, sky, ambience).
- **Nether / End** — script spawning on vanilla surfaces; dimension-specific bear emphasis (e.g. flying/torpedo in the End).

### Powdery Journal (`mb:snow_book`)

- Discovery codex: mobs, items, infections, cures, symptoms.
- Settings: sound volume, spawn difficulty, **camera shake** toggle, search.
- Achievements and knowledge sharing near players who hold the book.
- **What's new** on each beta bump.

### Maple Bear ecosystem

20+ bear and infected-livestock types — full catalog: [`MAPLE_BEAR_TYPES.md`](../../reference/MAPLE_BEAR_TYPES.md).

| Family | Examples |
|--------|----------|
| Scouts | Tiny bear, day 4 / 8 / 13 / 20 bears |
| Infected | Infected bear (+ day tiers), infected pig, infected cow |
| Specialists | Buff, flying, mining, torpedo (+ day variants) |

### Storms

- Multi-storm **snow / infection storms** — drift, intensity, shelter checks, mob damage, block effects.
- Storm exposure feeds spawn pressure and infection-adjacent effects.
- Far storms lighten particle/work when no player is nearby.

### Spawning & balance

- **Spawn controller** — tile scanning, day scaling, weather modifiers, difficulty setting.
- **Buff bear caps** — near-player cap + dimension cap; no stacking past the limit on death, respawn, or return; storm conversions respect caps.
- **Mob conversion** — bears killing mobs convert by **victim size**; storm deaths follow the same rules.
- **Torpedo duds** — ~5% do not explode on death (quieter, no powder ring).
- **Spawn load auto-scaling** — throttles scan/spawn when bear counts, items, storms, or lag stress rise.

### Mining bears

- Pathfinding, stair/spiral mining, block-break budgets.
- **Stair stall fix** — less freezing on blocked stairs.
- **More snow** while digging (trails + broken blocks).

### Emulsifier

- Purification machine — fuel, zones, journal UI; reclaim and no-spawn bubbles where implemented.

### Host tools (release build only)

- Gated **Host tools** for authorized hosts (not full Developer Tools): minor storms, capped spawns, list bears, journal pins.

---

## New in beta.5 (since last public beta)

### Camera feel

- **Snow buzz** — eating powder gives a short camera wobble (~1.1s base). Re-eat within ~5s → longer buzz, **softer** each pulse. High lifetime snow count dulls the effect.
- **Infection shake** — gentler day-to-day; **ramps over the last ~30 seconds** before transform; peaks in the final moments.
- **Bear hit shake** — melee hits cause tiered buzz (tiny lightest → buff heaviest). Flying bears stay **lighter** (aerial glances). **No blindness on first bear hit** (playtest tweak).
- **Torpedo blast** — players in blast radius: shake, forced cough dust, infection worsens (+snow, timer loss). **Shorter pulse** than early beta.5 tuning.
- **Buff death burst** — same blast class as torpedo (intensity + **short** pulse via shared explosion shake scale).
- **Sub-toggles:** Journal → Settings → **Camera shake** — master + infection / snow / combat / storm / cues.

### Cures & powder

- **Minor cure** still grants permanent immunity to **minor** infection on respawn — eating `mb:snow` can still cause or worsen **major** infection.

### Mining bears

- Scripted breaks use **natural drops** (no silk touch): `mb:snow_layer` → powder, `mb:dusted_dirt` → dirt + **15%** bonus snow (loot-table parity).
- **25% drop roll** per break to avoid item floods when bear inventories overflow.

### Performance & stability

- **Day 0–1** — lighter background entity scans and work-spread throttles until infection ramps.
- **Chunk travel** — heavy work spreads across ticks; brief defer when crossing chunk borders.
- **Village-adjacent perf** — fixed worldgen treating every player as always near a lamp post (a major day-0 hitch source). Natural jigsaw village work continues in the background; **script-placed villages are not part of this release**.
- **Entity query gating** — safer spread-section queries for mining, storms, and buff AI under load.

### Death & respawn

- Infection saves flush correctly on death (no stale major reloading).
- Camera shake clears through the death screen and respawn grace.
- No duplicate “Minor infection” chat on death respawn.

### Villages (beta.5)

- **Vanilla Minecraft villages** generate again in public `BP/` (removed `worldgen_no_village` biome overrides).
- **Living villagers** allowed on release — villager despawn defaults **off** (was on for abandoned-settlement era).
- **Script village builder** stays **off** — dev-only toggle; use fresh chunks or a new world for best village gen.

---

## Not in this public release

| Item | Notes |
|------|--------|
| **Script abandoned village placement** | WIP; dev-only toggle; laggy interim until jigsaw worldgen ships |
| **Full Developer Tools** | Dev pack only (`BP - Dev/`) — biome checker HUD, spawn hub, script self-test, etc. |

**Vanilla Minecraft villages:** **back on** for public beta.5 — removed `BP/biomes/worldgen_no_village/` overrides; villager despawn defaults **off** on release. Script-placed abandoned villages stay **off** (dev toggle only). Lamp-post jigsaw markers may still appear in infected biomes; they do not replace vanilla villages.

Lamp-post **jigsaw structures** and settlement **loot/processors** may exist in pack data; the live **block-by-block script builder** does not run for public players.

---

## Install (players)

1. Download **The Maple Bear Apocalypse** from **Patreon** (`.mcpack` — behavior + resource).
2. Import the pack; enable on your world under **Behavior** and **Resource**.
3. **Minecraft 1.26.10+** recommended (`min_engine_version` in manifest).
4. No experiments required on 1.26.2+.

**CurseForge (optional):** same Bridge export when/if you list it there.

---

## Maintainer checklist (when you say OK)

1. `npm run sync:bp-from-dev` — keep release `mb_buildConfig.js` (`INCLUDE_FULL_DEVELOPER_TOOLS = false`).
2. Bump `ADDON_VERSION_PRERELEASE` → `beta.5` in `BP/scripts/mb_buildConfig.js` and `PLAYER_CHANGELOG_VERSION` in `BP/scripts/mb_playerChangelog.js`.
3. Copy bullets above → `docs/PLAYER_CHANGELOG.md` + in-game changelog body.
4. `npm run sync:pack-metadata` → `npm run check` → commit to `main`.
5. **Bridge:** `./BP` + `./RP` → export **The Maple Bear Apocalypse** `.mcpack`.
6. **Patreon:** post + attach pack (paste-ready copy can live under `docs/marketing/`).
7. **CurseForge (optional):** upload same export.
8. **Do not:** `git tag`, GitHub Release publish, or public GitHub download messaging.
