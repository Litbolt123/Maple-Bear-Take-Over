# Developer onboarding

Short path for new contributors to the Maple Bear TakeOver Bedrock addon (behavior + resource packs, no web stack).

## Repo layout

| Path | Role |
|------|------|
| `BP/` | Behavior pack: entity/block/item JSON, `BP/scripts/` (JavaScript, Minecraft Script API) |
| `RP/` | Resource pack: models, textures, sounds, particles |
| `tools/` | Node scripts (e.g. sync mining `break_blocks` from `mb_miningBlockList.js`) |
| `docs/` | Design and system references |

## Where logic lives

- **Orchestration and many game flows**: `BP/scripts/main.js` (large file; search for handlers and `system.runInterval`).
- **Player journal / codex UI**: `BP/scripts/mb_codex.js`.
- **World flags / dev Script Toggles**: `BP/scripts/mb_scriptToggles.js` (`SCRIPT_IDS`, `isScriptEnabled`).
- **Per-system modules**: see `docs/development/ADDON_SYSTEMS_AND_FEATURES.md` and `docs/development/systems/` (e.g. `INFECTION_SYSTEM.md`).

## Local validation (Node.js)

From the repo root (requires Node on your machine):

- `npm run check` — JSON validation, JS syntax check, ESLint on scripts and tools.

Cloud or minimal environments may not have Node; run these on your PC before pushing when possible.

## Testing in-game

There is no headless runner. Install the packs in a Bedrock world (or `development_behavior_packs` / `development_resource_packs`), enable **Beta APIs** / experiments as required by `BP/manifest.json`, and exercise flows manually. See `docs/development/testing/TESTING_CHECKLIST.md` when present.

## Common pitfalls

- **Do not reformat entire entity JSON with generic PowerShell `ConvertTo-Json`** — it can mangle UTF-8 or structure. For mining bears, prefer `node tools/updateMiningBlocks.js` from repo root, or a **surgical** edit to `minecraft:break_blocks` only.
- **`@minecraft/server` imports** resolve only inside Minecraft; `node --check` and ESLint are still useful for syntax/style.
- **Circular imports**: new `import` edges between `BP/scripts/*.js` files can break load order; prefer shared small modules over `main.js` pulling everything.

## Related

- Root **`AGENTS.md`** — Cursor/agent notes and command table.
- **`docs/context summary.md`** — session / change log (canonical). **`docs/ai/CONTEXT_SUMMARY.md`** redirects there.
