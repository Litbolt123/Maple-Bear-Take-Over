# AGENTS.md

## Project overview

MapleBear TakeOver is a Minecraft Bedrock Edition addon (behavior pack + resource pack). It is **not** a traditional web application — there is no backend server, database, or frontend framework.

- `BP/` — Behavior Pack (game logic as JSON configs + JavaScript scripts using Minecraft Script API)
- `RP/` — Resource Pack (models, textures, sounds, particles, animations)
- `tools/` — Node.js developer tooling scripts
- `docs/` — Design docs, planning, and reference material

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

- `tools/updateMiningBlocks.js` regenerates mining bear block lists from `data/bedrock_blocks.json`. It requires the entity files to have `minecraft:break_blocks` component (currently missing in `mining_mb.json` — pre-existing issue). Run with `node tools/updateMiningBlocks.js` from workspace root.

### Gotchas

- There are no automated test frameworks. Testing is done manually inside Minecraft. See `docs/development/testing/TESTING_CHECKLIST.md` for manual test scenarios.
- The 21 JS files in `BP/scripts/` total ~25k lines. The main entry point `main.js` alone is ~8.5k lines.
- ESLint reports ~220 warnings (all `no-unused-vars`). These are pre-existing and expected — many variables/functions are reserved for future use or disabled debug features.
