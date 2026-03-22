MapleBear TakeOver
Don't do drugs kids...

Minecraft **Bedrock Edition** behavior + resource pack: a day-driven invasion of Maple Bears, infection and “snow” mechanics, journals that unlock knowledge over time, storms, and deep dev tooling. *Don’t do drugs kids…*

## What you get

- **World progression**: Days unlock stronger bear variants and new threats (flying, mining, torpedo, buff, infected).
- **Infection & cures**: Minor vs major infection, powder tiers, cures, immunity, and journal entries that respect spoilers.
- **Journal (codex)**: Powdery Journal UI with search, settings, achievements, daily log, and optional knowledge sharing.
- **Environment**: Custom **infected overworld biome** (experimental), dusted ground, **Emulsifier** purification machines, **snow storms** (multi-storm capable).
- **Dimensions**: Bears spawn in **Nether** and **End** on native blocks; Nether fire adaptation and End aerial spawn bias.
- **Admin / dev**: Spawn controller hub, storm controls, AI debug flags, day/infection utilities (cheats-gated).

## Repository structure

| Folder | Role |
|--------|------|
| `BP/` | Behavior pack (JSON + `BP/scripts/` JavaScript) |
| `RP/` | Resource pack (models, textures, sounds, client biomes) |
| `docs/` | Design, mechanics, systems reference, testing checklists |
| `tools/` | Node maintenance scripts |

## Documentation

Full index: **[`docs/README.md`](docs/README.md)**.

**Start here**

- **[Design vision](docs/design/DESIGN_VISION.md)** — goals and tone  
- **[Systems & features](docs/development/ADDON_SYSTEMS_AND_FEATURES.md)** — what each script/system does  
- **[Project status & next steps](docs/development/PROJECT_STATUS.md)** — current snapshot  
- **[Mechanics summary](docs/development/tracking/MECHANICS_SUMMARY.md)** — detailed gameplay mechanics  
- **[TODO](TODO.md)** — backlog and implemented checklist  
- **[AGENTS.md](AGENTS.md)** — tooling, `npm run check`, Script API constraints  

## Development

Requires Node.js for lint/validation only (game APIs are provided by Minecraft at runtime).

```bash
npm install
npm run check
```

| Command | Purpose |
|---------|---------|
| `npm run lint` | ESLint on `BP/scripts/` and `tools/` |
| `npm run validate` | JSON parse + JS syntax check |
| `npm run check` | Full validate + lint |

## Installing in Minecraft

1. Copy or symlink the **behavior pack** and **resource pack** into your Bedrock worlds/packs location.  
2. Enable the world’s required **experiments** (including **Custom Biomes** if you use the infected biome — see `TODO.md` technical notes).  
3. Apply both packs to a world and playtest with [`docs/development/testing/TESTING_CHECKLIST.md`](docs/development/testing/TESTING_CHECKLIST.md).

## License

See `package.json` / repository metadata for license and links.
