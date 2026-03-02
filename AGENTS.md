# AGENTS.md

## Cursor Cloud specific instructions

### Project Overview

MapleBear TakeOver is a **Minecraft Bedrock Edition addon** (behavior pack + resource pack), not a traditional web/server application. There is no `package.json`, no package manager lockfile, no Docker, and no databases. See `README.md` and `docs/README.md` for full project documentation.

### Tech Stack

- **Platform:** Minecraft Bedrock Edition (target `1.21.130`, min engine `1.21.101`)
- **IDE/Toolchain:** bridge. IDE v2.7.54 with Dash compiler v0.11.7
- **Scripting:** JavaScript ES modules in `BP/scripts/` using `@minecraft/server` v2.3.0 and `@minecraft/server-ui` v2.0.0
- **Data:** JSON configuration files across `BP/` (behavior pack) and `RP/` (resource pack)

### Development Validation

Since Minecraft Bedrock Edition cannot run in this cloud environment, validation is limited to:

- **JSON validation:** All 181+ JSON files in `BP/`, `RP/`, and `data/` can be validated with a Node.js script (parse each file with `JSON.parse`).
- **JS syntax checking:** All scripts in `BP/scripts/` can be checked with `node --check <file>`.
- **Utility tool:** `node tools/updateMiningBlocks.js` regenerates mining block lists from `data/bedrock_blocks.json`. Note: this tool currently fails on the entity update step because `BP/entities/mining_mb.json` lacks a `minecraft:break_blocks` component — the script-generation part works correctly.

### Key Directories

| Path | Purpose |
|------|---------|
| `BP/` | Behavior Pack (entities, scripts, items, blocks, biomes, spawn rules, loot tables, recipes) |
| `RP/` | Resource Pack (models, textures, sounds, animations, particles, UI) |
| `data/` | Reference data (`bedrock_blocks.json`) |
| `tools/` | Utility scripts (e.g., `updateMiningBlocks.js`) |
| `docs/` | Comprehensive documentation |

### Limitations

- **No automated test framework** — all gameplay testing requires Minecraft Bedrock Edition.
- **No build step available in cloud** — the bridge. IDE Dash compiler is a desktop tool.
- **No linting configured** — the project does not include ESLint or similar; do not add linting tools unless explicitly requested.
