# AGENTS.md

## Project overview

MapleBear TakeOver is a Minecraft Bedrock Edition addon (behavior pack + resource pack). It is **not** a traditional web application — there is no backend server, database, or frontend framework.

- `BP/` — Behavior Pack — **public / store release** tree: `mb_buildConfig.js` keeps **`INCLUDE_FULL_DEVELOPER_TOOLS` false** so no developer UI is reachable. **Admin tools** (storms, force spawn, list bears) stay available with cheats; players get a **one-time admin disclaimer** (`mb_admin_tools_disclaimer_v1`). Do **not** publish `BP - Dev/` to players.
- `BP - Dev/` — Internal/testing copy; `mb_buildConfig.js` enables full developer tools + same admin paths (admin disclaimer skipped when dev tools are on). **Public admin preview:** Developer Tools includes toggling §6Admin tools on the journal main menu (world flag `mb_world_dev_preview_admin_main`) and opening the admin panel through the same disclaimer flow as the public pack.
- `RP/` — Resource Pack (models, textures, sounds, particles, animations)
- `RP - Dev/` — Dev twin; keep manifest versions aligned with `BP - Dev/`
- `tools/` — Node.js developer tooling scripts
- `docs/` — Design docs, planning, and reference material

### Context log (single file)

- Maintain **one** running session / change log: **`docs/context summary.md`**.
- Add new work as **dated sections at the top** (newest first). Do **not** create or duplicate a second long-form context file; **`docs/ai/CONTEXT_SUMMARY.md`** is only a **stub** that links to the canonical file.

The JavaScript in `BP/scripts/` uses ES modules with `@minecraft/server` and `@minecraft/server-ui` APIs (provided at runtime by Minecraft, not npm packages).

## Cursor Cloud specific instructions

### Development commands

All commands are defined in `package.json`:

| Command | Purpose |
|---------|---------|
| `npm run lint` | ESLint check on `BP/scripts/` and `tools/` |
| `npm run lint:fix` | ESLint with auto-fix |
| `npm run validate:json` | Validate all JSON files in `BP/` and `RP/` |
| `npm run validate:syntax` | Node.js `--check` on all JS files |
| `npm run validate` | JSON + syntax validation |
| `npm run check` | Full validation + lint |

### Runtime constraints

- The addon can only truly run inside **Minecraft Bedrock Edition** (Windows/Xbox/mobile game client). There is no way to execute the game scripts headlessly in this cloud VM.
- `@minecraft/server` and `@minecraft/server-ui` imports will fail under Node.js — they are Minecraft-provided runtime modules. Syntax checking with `node --check` works, but `node BP/scripts/main.js` will not.
- ESLint is configured to treat these Minecraft modules as external globals; lint will succeed despite the unresolvable imports.

### Tools

- `tools/updateMiningBlocks.js` copies `MINING_BREAKABLE_BLOCKS` from `BP/scripts/mb_miningBlockList.js` into `minecraft:break_blocks` on mining bear entities (optional consistency with the list the **script** uses). **Actual digging** is done in `mb_miningAI.js` via `dimension.setPermutation` / break logic, not by vanilla entity break components. Run: `node tools/updateMiningBlocks.js` from repo root (requires Node on PATH).

**Other script-driven block clearing**: `mb_torpedoAI.js` clears blocks with `setType("minecraft:air")` in path bursts — same idea (no reliance on entity `break_blocks`).

### Bridge / local dev pack

Point Bridge (or any Bedrock pack project) at **`BP - Dev/`** and **`RP - Dev/`**: copy or sync those folders into your Bridge behavior pack and resource pack roots (replace the pack contents you use for Maple Bear). After a full sync from public `BP/`, restore **`BP - Dev/scripts/mb_buildConfig.js`** so `INCLUDE_FULL_DEVELOPER_TOOLS` stays `true`. Entry script loads **`./mb_buildConfig.js` first** from `main.js`; on **public** `BP/`, that module no-ops `console.log` / `info` / `warn` / `debug` so release builds stay quiet (`console.error` unchanged).

### Gotchas

- There are no automated test frameworks. Testing is done manually inside Minecraft. See `docs/development/testing/TESTING_CHECKLIST.md` for manual test scenarios.
- The 21 JS files in `BP/scripts/` total ~25k lines. The main entry point `main.js` alone is ~8.5k lines.
- ESLint reports ~220 warnings (all `no-unused-vars`). These are pre-existing and expected — many variables/functions are reserved for future use or disabled debug features.
