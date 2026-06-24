# Documentation index (`docs/`)

Start here to navigate the repo. **Session log:** [context summary.md](context%20summary.md) (canonical; append dated sections at the top).

---

## Top-level files (keep stable paths)

| File | Purpose |
|------|---------|
| [context summary.md](context%20summary.md) | Running change log (humans + AI) |
| [PLAYER_CHANGELOG.md](PLAYER_CHANGELOG.md) | Player-facing beta notes (referenced in-game); **§ Unreleased** = draft for next beta |
| [development/releases/UNRELEASED_DRAFT.md](development/releases/UNRELEASED_DRAFT.md) | Full draft bullets + ship checklist (copy on release day) |
| [development/releases/DEV_BETA_4.2.md](development/releases/DEV_BETA_4.2.md) | Patreon dev drop **4.2** (dev pack only) |
| [marketing/PATREON_DEV_BETA_4.2.md](marketing/PATREON_DEV_BETA_4.2.md) | Paste-ready Patreon post for 4.2 |
| [RELEASE_BODY.md](RELEASE_BODY.md) | GitHub Release description (CI; edit before each tag) |
| [releasing.md](releasing.md) | Maintainer runbook: tag → Actions → `.mcpack` on Releases |
| [development/PERFORMANCE_OPTIMIZATION_ROADMAP.md](development/PERFORMANCE_OPTIMIZATION_ROADMAP.md) | Hot scripts, phased optimizations |
| [development/CURSOR_SDK.md](development/CURSOR_SDK.md) | Optional Cursor SDK ideas (not in repo) |
| [README.md](README.md) | This index |
| [ORGANIZATION.md](ORGANIZATION.md) | Folder tree and conventions |

---

## `design/` — Vision & world

| File | Purpose |
|------|---------|
| [DESIGN_VISION.md](design/DESIGN_VISION.md) | Design intent and principles |
| [SAFE_BIOMES.md](design/SAFE_BIOMES.md) | Safer biomes vs Maple Bear pressure |
| [MBA_ITEMS_MASTER_PLAN.md](design/MBA_ITEMS_MASTER_PLAN.md) | Planned MBA gear, loot, purification, journal (not implemented) |

---

## `development/` — Engineering

### Root (overview)

| File | Purpose |
|------|---------|
| [DEVELOPER_ONBOARDING.md](development/DEVELOPER_ONBOARDING.md) | Repo layout, `npm run check`, testing |
| [WORLD_SETUP.md](development/WORLD_SETUP.md) | Bedrock world: **no experiments on 1.26.2+** (verified) |
| [BRIDGE_EXPORT_AND_VERSIONING.md](development/BRIDGE_EXPORT_AND_VERSIONING.md) | Bridge `.mcpack` name + `npm run sync:pack-metadata` |
| [PERFORMANCE_DEBUG.md](development/PERFORMANCE_DEBUG.md) | Tick-stall / lag spike playbook (day 0–1, toggles, A/B) |
| [GITHUB_RENAME.md](development/GITHUB_RENAME.md) | Rename repo to `Maple-Bear-Apocalypse` on GitHub |
| [ADDON_SYSTEMS_AND_FEATURES.md](development/ADDON_SYSTEMS_AND_FEATURES.md) | Systems map + links to deep docs |
| [PROJECT_STATUS.md](development/PROJECT_STATUS.md) | Snapshot: done / gaps / next steps |
| [SCRIPTS_REFERENCE.md](development/SCRIPTS_REFERENCE.md) | What each `BP/scripts/*.js` module does |
| [github-versioning-releases-agent-guide.md](development/github-versioning-releases-agent-guide.md) | Reference playbook: SemVer, tags, GitHub Actions/Releases (adapt from MSBuild to pack versioning) |

### `marketing/` — Community copy

| File | Purpose |
|------|---------|
| [NAMING.md](marketing/NAMING.md) | Canonical names: **M.B.A** / Maple Bear Apocalypse |
| [PATREON_FIRST_POST_DRAFT.md](marketing/PATREON_FIRST_POST_DRAFT.md) | First Patreon post + Comet archive |
| [DISCORD_SERVER_COMET_PROMPT.md](marketing/DISCORD_SERVER_COMET_PROMPT.md) | Comet prompt to build official Discord server |

### `development/guides/` — How-to & compatibility

| File | Purpose |
|------|---------|
| [HOW_TO_ADD_SOUNDS.md](development/guides/HOW_TO_ADD_SOUNDS.md) | Adding sounds |
| [DEBUG_LOGGING.md](development/guides/DEBUG_LOGGING.md) | Debug logging notes |
| [MINECRAFT_1.26_COMPATIBILITY.md](development/guides/MINECRAFT_1.26_COMPATIBILITY.md) | Version compatibility notes |

### `development/sounds/` — Audio

| File | Purpose |
|------|---------|
| [SOUND_PROGRESS.md](development/sounds/SOUND_PROGRESS.md) | Integration status |
| [SOUND_GENERATION_PROMPT.md](development/sounds/SOUND_GENERATION_PROMPT.md) | Generation prompts |
| [maple_bear_sound_prompts.md](development/sounds/maple_bear_sound_prompts.md) | Extra prompts |

### `development/ai/` — Bear AI & pathing

| File | Purpose |
|------|---------|
| [MINING_BEAR_INTELLIGENCE_PLAN.md](development/ai/MINING_BEAR_INTELLIGENCE_PLAN.md) | Mining bear AI plan |
| [MINING_AI_OPTIMIZATION_OPTIONS.md](development/ai/MINING_AI_OPTIMIZATION_OPTIONS.md) | Performance options |
| [AI_OPTIMIZATION_AUDIT.md](development/ai/AI_OPTIMIZATION_AUDIT.md) | Audit |
| [HEAT_SEEKING_VISION.md](development/ai/HEAT_SEEKING_VISION.md) | Heat-seeking vision |
| [PATHFINDER_COMPARISON.md](development/ai/PATHFINDER_COMPARISON.md) | Pathfinder notes |
| [stair-pattern.md](development/ai/stair-pattern.md), [downward-spiral-stair-pattern.md](development/ai/downward-spiral-stair-pattern.md), [mining-stop-distance.md](development/ai/mining-stop-distance.md) | Mining movement / stairs |

### `development/systems/` — Game systems

| File | Purpose |
|------|---------|
| [SPAWN_SYSTEM_EXPLANATION.md](development/systems/SPAWN_SYSTEM_EXPLANATION.md) | Spawn algorithm |
| [INFECTION_SYSTEM.md](development/systems/INFECTION_SYSTEM.md) | Infection, cures, conversion |
| [CODEX_UNLOCKS.md](development/systems/CODEX_UNLOCKS.md) | Codex unlock conditions |
| [SNOW_STORM_DESIGN.md](development/systems/SNOW_STORM_DESIGN.md) | Storm design |
| [STORM_TROUBLESHOOTING.md](development/systems/STORM_TROUBLESHOOTING.md) | Storm / village recovery |
| [DIMENSION_ADAPTATIONS.md](development/systems/DIMENSION_ADAPTATIONS.md) | Nether / End |
| [BIOME_GENERATION_VARIABLE_SIZES.md](development/systems/BIOME_GENERATION_VARIABLE_SIZES.md) | Biome gen notes |
| [LEADER_DEATH_HANDLER.md](development/systems/LEADER_DEATH_HANDLER.md) | Leader death handling |

### `development/planning/` — Roadmaps & ideas

| File | Purpose |
|------|---------|
| [IMPLEMENTATION_PLAN.md](development/planning/IMPLEMENTATION_PLAN.md) | Implementation plan |
| [TASK_PRIORITY.md](development/planning/TASK_PRIORITY.md) | Priorities |
| [IDEA_BRAINSTORM.md](development/planning/IDEA_BRAINSTORM.md) | 100+ feature ideas |
| [QOL_AND_EDGE_CASES.md](development/planning/QOL_AND_EDGE_CASES.md) | QoL edge cases |
| [QoL_AND_DEV_TOOLS_IDEAS.md](development/planning/QoL_AND_DEV_TOOLS_IDEAS.md) | QoL & dev-tool ideas |
| [STORM_SHELTER_BRAINSTORM.md](development/planning/STORM_SHELTER_BRAINSTORM.md) | Shelter brainstorm |
| [INFECTION_MOD_CONCEPT_AUDIT_2026-04-28.md](development/planning/INFECTION_MOD_CONCEPT_AUDIT_2026-04-28.md) | Infection-mod archetypes vs Maple Bear (concepts) |
| [INFECTION_MOD_GAME_PLAN_2026-04-29.md](development/planning/INFECTION_MOD_GAME_PLAN_2026-04-29.md) | Phased implementation game plan (follows audit) |
| [INFECTION_MOD_PHASE1_STORM_TOUCH_SPEC.md](development/planning/INFECTION_MOD_PHASE1_STORM_TOUCH_SPEC.md) | Phase 1: storm-touch spawn pressure (implementation spec / patch list) |
| [INFECTION_MOD_PHASE2_RESERVOIR_SPEC.md](development/planning/INFECTION_MOD_PHASE2_RESERVOIR_SPEC.md) | Phase 2: storm-center reservoir spawn pressure (implementation spec) |
| [INFECTION_MOD_PHASE3_DIRECTOR_SPEC.md](development/planning/INFECTION_MOD_PHASE3_DIRECTOR_SPEC.md) | Phase 3: infection director tiers + spawn-load escalation (implementation spec) |
| [INFECTION_MOD_PHASE4_SHIP_SPEC.md](development/planning/INFECTION_MOD_PHASE4_SHIP_SPEC.md) | Phase 4: ship checklist — codex copy, changelog, balance/perf pointers |

### Villages & structures

| File | Purpose |
|------|---------|
| [ABANDONED_SETTLEMENTS.md](development/ABANDONED_SETTLEMENTS.md) | Script villages, tiers, loot, rulesets |
| [ABANDONED_VILLAGE_STRUCTURES.md](development/ABANDONED_VILLAGE_STRUCTURES.md) | Jigsaw worldgen + Structure Block export |
| [VILLAGE_STRUCTURE_COLLAB_GUIDE.md](development/VILLAGE_STRUCTURE_COLLAB_GUIDE.md) | **Maple Bear** — full **jigsaw** abandoned villages (script structure spawning on hold) |

### `development/tracking/` — Changelogs & sessions

| File | Purpose |
|------|---------|
| [MECHANICS_SUMMARY.md](development/tracking/MECHANICS_SUMMARY.md) | Implemented mechanics |
| [CHANGELOG.md](development/tracking/CHANGELOG.md) | Project changelog |
| [SESSION_SUMMARY.md](development/tracking/SESSION_SUMMARY.md) | Session summaries |

### `development/testing/` — QA

| File | Purpose |
|------|---------|
| [TEST_SCENARIOS.md](development/testing/TEST_SCENARIOS.md) | Scenarios |
| [TESTING_CHECKLIST.md](development/testing/TESTING_CHECKLIST.md) | Manual checklist |
| [SCRIPT_TEST_MAP.md](development/testing/SCRIPT_TEST_MAP.md) | Per-script tests + npm commands |
| [BETA_SMOKE_CHECKLIST.md](development/testing/BETA_SMOKE_CHECKLIST.md) | Beta smoke |

### `development/ui/` — UI references

| File | Purpose |
|------|---------|
| [Notifications.md](development/ui/Notifications.md) | Toast-style notification pattern (reference) |
| [Chest_UI_Editor.md](development/ui/Chest_UI_Editor.md) | Chest UI editor notes |

### `development/prompts/` — AI / generation prompts

| File | Purpose |
|------|---------|
| [maple_bear_condensed_prompts.md](development/prompts/maple_bear_condensed_prompts.md) | Condensed prompts |
| [Mining AI FIX/mining_ai_fixes.md](development/prompts/Mining%20AI%20FIX/mining_ai_fixes.md) | Mining AI fix notes |

---

## `reference/` — External Bedrock resources

| File | Purpose |
|------|---------|
| [DOCUMENTATION_INDEX.md](reference/DOCUMENTATION_INDEX.md) | Official + community doc index |
| [INDEXING_URLS.md](reference/INDEXING_URLS.md), [INDEXING_URLS_VERIFIED.md](reference/INDEXING_URLS_VERIFIED.md) | URL lists |
| [USEFUL_LINKS.md](reference/USEFUL_LINKS.md) | Quick links |
| [COLORS_AND_STYLING.md](reference/COLORS_AND_STYLING.md) | UI color codes |

---

## `collaborators/` — Art, lore, non-code tasks

| File | Purpose |
|------|---------|
| [TASKS_FOR_CO_CREATOR.md](collaborators/TASKS_FOR_CO_CREATOR.md) | Texture / lore tasks |
| [VILLAGE_STRUCTURE_COLLAB_GUIDE.md](development/VILLAGE_STRUCTURE_COLLAB_GUIDE.md) | **Hand-built village `.mcstructure` pieces** (jigsaw / Structure Block) |
| [UI_CREATION_GUIDE.md](collaborators/UI_CREATION_GUIDE.md) | UI for collaborators |
| [NEXT_SESSION_TASKS.md](collaborators/NEXT_SESSION_TASKS.md) | Next session ideas |
| [CODEX_TEXT_SIMPLIFY_CANDIDATES.md](collaborators/CODEX_TEXT_SIMPLIFY_CANDIDATES.md) | Codex copy simplification |

---

## `archive/` — Historical snapshots

| File | Purpose |
|------|---------|
| [README.md](archive/README.md) | What this folder is |
| [VERIFICATION_REPORT.md](archive/VERIFICATION_REPORT.md) | Old verification report |
| [COMMIT_2026-02-01_session.md](archive/COMMIT_2026-02-01_session.md) | Session commit notes |

---

## `ai/` — Redirect stub

| File | Purpose |
|------|---------|
| [CONTEXT_SUMMARY.md](ai/CONTEXT_SUMMARY.md) | Points to [context summary.md](context%20summary.md) |

---

## Repo root (outside `docs/`)

| File | Purpose |
|------|---------|
| [../README.md](../README.md) | Project README |
| [../TODO.md](../TODO.md) | Task list |
| [../AGENTS.md](../AGENTS.md) | Agent / tooling notes |

---

## Quick links

- **Vision:** [DESIGN_VISION.md](design/DESIGN_VISION.md)
- **Systems & features:** [ADDON_SYSTEMS_AND_FEATURES.md](development/ADDON_SYSTEMS_AND_FEATURES.md)
- **Scripts:** [SCRIPTS_REFERENCE.md](development/SCRIPTS_REFERENCE.md)
- **Testing:** [SCRIPT_TEST_MAP.md](development/testing/SCRIPT_TEST_MAP.md)
- **Ideas:** [IDEA_BRAINSTORM.md](development/planning/IDEA_BRAINSTORM.md)
- **Bedrock docs:** [DOCUMENTATION_INDEX.md](reference/DOCUMENTATION_INDEX.md)
