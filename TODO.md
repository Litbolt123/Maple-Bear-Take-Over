# Maple Bear TakeOver — TODO

**Status snapshot:** [`docs/development/PROJECT_STATUS.md`](docs/development/PROJECT_STATUS.md)  
**Systems reference:** [`docs/development/ADDON_SYSTEMS_AND_FEATURES.md`](docs/development/ADDON_SYSTEMS_AND_FEATURES.md)

---

## Next steps (suggested order)

1. **Playtest**: Multiplayer + spawn presets + multi-storm + Emulsifier; watch TPS and edge cases.  
2. **Pick a vertical**: e.g. direct player infection spread, infection HUD, or endgame milestones (days 50/75/100) per design vision.  
3. **Docs**: Developer onboarding + troubleshooting (see Documentation section below).  
4. **Content**: Structures, raptor flying bear, or “scarred cured animals” — see Future Features.

---

## Implemented (summary)

### Core gameplay
- Maple Bear entities with **day-tier variants** (tiny, infected, buff, flying, mining, torpedo).  
- **Infection**: minor/major, snow/powder tiers, progressive symptoms, ground exposure on addon snow/dusted dirt (not vanilla snow layers).  
- **Cures**: minor (golden apple + golden carrot), major (weakness + enchanted golden apple); immunity layers; golden apple snow reduction (codex-gated info).  
- **Day tracking**, milestones, welcome/daily narrative hooks.  
- **Player death → infected bear form** with naming / tracking.  
- **Item corruption** on infected bear death; loot and world feedback tied to design.

### World & dimensions
- **Overworld** custom infected biome + **client** fog/sky/water (Custom Biomes experiment).  
- **Nether & End**: **block-based spawning** on native surfaces; **Nether fire resistance** by bear tier (`mb_dimensionAdaptation.js`); **End** flying/torpedo spawn emphasis scaling with day.  
- **Dusted dirt** registration and spread-related play; **Emulsifier** zones (fuel queue, dome purification scan, no-spawn bubble, machine UI, dev tools).

### Storms
- **Multi-storm** system with drift, intensity, overlap boost, shelter raycasts, persistence, dev hub (summon/end/list/settings/debug).

### Spawn controller
- Tile/block scanning, caps, weather modifiers, isolated-player optimizations, type toggles.  
- **Dev hub**: difficulty, speed multiplier, force spawn, **advanced scan tunables**, **presets** (Low → High).

### Journal / codex
- Powdery Journal (`mb:snow_book`): progressive unlocks, search, settings (sound, difficulty, search toggle), achievements (visible when journal held **or** persisted craft/unlock), knowledge sharing near players with book, daily log, biome discovery notes.  
- Developer Tools: debug categories, day tools, **infection inspect/adjust**, spawn hub, storm hub, emulsifier helpers.

### AI & performance
- Mining / torpedo / flying / buff / infected AI with shared **player/mob caches**, throttled ticks where used, mining leader promotion, adaptive mining strategies.  
- **Dynamic property handler**: cached, batched, chunked storage.

### Technical
- Script API **2.0.0** patterns; defensive effect detection; reduced redundant logging (`DEBUG_SNOW_MECHANICS` legacy flag in `main.js`).  
- Item registry + item finder utilities.

---

## Future features & enhancements

### Codex & meta
- [ ] Advanced symptom analytics / charts  
- [ ] Export/import codex data  
- [ ] Knowledge tree visualization  
- [ ] Hidden discoveries / secret lore entries  

### Gameplay
- [ ] Infection resistance gear  
- [ ] Quarantine / safe zones (structured)  
- [ ] Direct infection spread between players (design + optional world rule / dev toggle)  
- [ ] Extended brewing / cure recipes  
- [ ] Prevention items and clearer onboarding tutorial flow  

### World building
- [ ] Maple Bear structures / lairs  
- [ ] Labs, medical stations, warning props, shelters (environmental storytelling)  

### UI
- [ ] Dedicated infection HUD / timer bars  
- [ ] Interactive first-time tutorial  

### Advanced mechanics
- [ ] Bear mutation / evolution lines  
- [ ] Weather-driven infection rates (beyond current spawn weather modifier)  
- [ ] Seasonal cycles  
- [ ] Cure research tree  
- [ ] Dynamic difficulty from player count  

### Technical
- [ ] In-world performance metrics overlay  
- [ ] Automated testing harness (limited by Bedrock; still could add more static checks)  

### Content & polish
- [ ] **Raptor flying bear** — rare aerial grab attack variant  
- [ ] Seasonal / special events  
- [ ] **Safe biome config** — hooks so selected overworld biomes stay low-pressure  
- [ ] **Late endgame** — 100-day structure, milestone spikes (50/75/100), branching outcomes, post-credits rules  
- [ ] Wave / mini-wave spawn layering on top of linear day ramp  
- [ ] Role ratios over time (spreaders vs killers) in spawn controller  
- [ ] Cured infected animals → “scarred” buffed variants (mechanical + cosmetic)  
- [ ] Lava vs fire edge cases for Nether-adapted bears (if needed)  

---

## Known issues & notes

- **Custom biomes**: Experimental; enable **Custom Biomes**; old chunks can **seam** against new generation — test on fresh worlds or backups.  
- **Chat-based debug**: API 2.0.0 chat limitations led to **item/journal-based** debug flows.  
- **Animation controller** log noise: handled where possible; often non-fatal.  
- **Pre-existing**: `tools/updateMiningBlocks.js` needs `minecraft:break_blocks` on mining entities if you regenerate lists (see `AGENTS.md`).

---

## Technical notes

### Performance (historical / ongoing)
- Biome-related work uses **cooldowns** where applicable to limit scans.  
- Snow block handlers focus on **addon-relevant** blocks.  
- Spawn controller reduces **wide-area** entity queries when players are **spread out**.

### Debug
- **Snow book → Developer Tools → Debug**: per-system flags (mining, torpedo, flying, spawn, main).  
- **World/script flags** persisted per player where noted in codex.  
- Verbose legacy logging: `DEBUG_SNOW_MECHANICS` in `main.js`.

### Documentation tasks
- [ ] Verify external URL indexes against current Microsoft Learn structure  
- [ ] Developer onboarding guide  
- [ ] API usage patterns doc (Script API gotchas)  
- [ ] Troubleshooting guide (pack load, experiments, storm recovery — partial: `docs/development/STORM_TROUBLESHOOTING.md`)  

---

*Last updated: 2026-03-20*
