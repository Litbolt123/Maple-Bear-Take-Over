# Context Summary

## Recent Changes

### Discovery-Based Knowledge Progression System (Latest)
- **Knowledge Progression**: Infection knowledge now grows as players discover items and gain experience
- **Gold Items Added**: Added Gold Ingot and Gold Nugget to items list with progressive discovery-based descriptions
- **Enhanced Item Descriptions**: Golden Apple, Golden Carrot, and Enchanted Golden Apple now have progressive descriptions based on:
  - Infection knowledge level (0-3: no knowledge, basic awareness, understanding, expert)
  - Related item discoveries (gold, golden items, cure items)
  - Current infection status and cure progress
  - Permanent immunity status
- **Major Infection Cure**: Curing major infection now also grants permanent immunity (like minor infection cure)
  - Both cures grant permanent immunity to minor infection
  - Major infection cure also grants temporary immunity (5 minutes)
  - Both cures update codex to mark minor cure as known/completed
- **Knowledge Level System**: Three-tier knowledge progression:
  - Level 1 (Basic Awareness): Any infection experience or discovery
  - Level 2 (Understanding): Multiple discoveries, cure knowledge, or related items
  - Level 3 (Expert): Deep knowledge from many experiences, both cures known, multiple related items
- **Progressive Item Information**: All cure-related items now show progressive information:
  - Basic information if no knowledge
  - Properties and connections with basic awareness
  - Cure details with understanding
  - Expert analysis with expert knowledge
- **Knowledge Triggers**: Knowledge progression automatically updates when:
  - Infections are discovered (bear, snow, minor, major)
  - Cure items are discovered (golden apple, golden carrot, enchanted golden apple, weakness potion)
  - Gold items are discovered (gold ingot, gold nugget)
  - Cures are completed
  - Golden apple infection reduction is discovered

### Minor Infection Starter System Implemented
- **Minor Infection on Spawn**: Players now spawn with a "minor infection" (10-day timer) that persists through death until cured
- **Minor Infection Cure**: Requires consuming both a Golden Apple and Golden Carrot separately (any order) to cure and gain permanent immunity
- **Permanent Immunity**: Once cured from minor infection, players gain permanent immunity - they never get minor infection again on respawn, and require 3 hits (instead of 2) to get infected
- **Infection Progression**: Minor infection can progress to major infection (2 hits from Maple Bears OR 1 snow consumption)
- **Infection Types**: System now tracks "minor" (10-day, mild effects) vs "major" (5-day, severe effects) infections
- **World Intro Sequence**: Added intro sequence that plays once per world with narrative messages and gives basic journal at the end
- **Journal Updates**: Updated goal screen and infection section to emphasize journal upgrade importance and show minor vs major infection details
- **Golden Carrot**: Added to codex items section with detailed information about its role in minor infection cure
- **Status Display**: Updated codex status display to show infection type, cure progress, and permanent immunity status

### Snow Layer System Archived
- **Snow Layer Falling/Breaking System**: Archived (commented out) the snow layer falling and breaking system in `main.js`. The system that made snow layers fall when placed without support and break when landing on other snow layers has been temporarily disabled. Code is preserved in comments marked with `[ARCHIVED]` for future reference.

### Sound System Integration
- **Sound Progress Document Created**: Added `docs/development/SOUND_PROGRESS.md` to track sound integration progress
- **Documentation Reorganized**: Moved all development-related MD files to `docs/development/` folder
- **Debug Logging Silenced**: Made all ambience debug logs conditional on codex debug flags for cleaner console output
- **Sound System Status**: ~95% complete - all core sounds implemented and working

### Sound Integration Complete
- ✅ All entity sounds implemented (tiny, infected, buff, flying, mining, torpedo bears)
- ✅ All script-triggered sounds working (flight, dive, dig, explode)
- ✅ Biome ambience system fully functional with day-based volume progression
- ✅ Buff bear proximity ambience system working (day 8+)
- ✅ All sounds registered in `sound_definitions.json` and `sounds.json`
- ✅ Debug logging integrated and conditional on codex debug flags

### Documentation Reorganization
- Moved `HOW_TO_ADD_SOUNDS.md` → `docs/development/`
- Moved `SOUND_GENERATION_PROMPT.md` → `docs/development/`
- Moved `SPAWN_SYSTEM_EXPLANATION.md` → `docs/development/`
- Moved `BIOME_GENERATION_VARIABLE_SIZES.md` → `docs/development/`
- Moved `maple_bear_condensed_prompts.md` → `docs/development/`
- Moved `maple_bear_sound_prompts.md` → `docs/development/`
- Moved `cursor ai/CONTEXT_SUMMARY.md` → `docs/ai/CONTEXT_SUMMARY.md`
- Created `docs/development/SOUND_PROGRESS.md` for tracking sound integration

### Previous Work: Spawn System Error Fixes
- Fixed spawn system errors related to entity queries and dimension handling
- Improved error handling in spawn controller
- Added better validation for entity spawning

## Current Project State

### Sound System
- **Status**: Production-ready, ~95% complete
- **Core Features**: All entity sounds, script-triggered sounds, and ambience systems implemented
- **Remaining Work**: Optional enhancements and quality-of-life improvements

### Documentation
- **Structure**: Organized into `design/`, `development/`, `reference/`, and `ai/` folders
- **New Files**: `SOUND_PROGRESS.md` tracks sound integration status
- **Organization**: All development docs now in `docs/development/` folder

### Key Files
- `RP/sounds/sound_definitions.json` - All sound definitions
- `RP/sounds.json` - Entity sound mappings
- `BP/scripts/mb_biomeAmbience.js` - Biome ambience system
- `BP/scripts/mb_spawnController.js` - Buff bear proximity ambience
- `BP/scripts/main.js` - Dive attack sounds
- `BP/scripts/mb_flyingAI.js` - Flight sounds
- `BP/scripts/mb_torpedoAI.js` - Flight and explosion sounds
- `BP/scripts/mb_miningAI.js` - Dig sounds

## Important Notes

### Sound System Architecture
- Entity-triggered sounds use `sounds.json` with template format (adjustable volume/pitch)
- Script-triggered sounds use `player.playSound()` or `dimension.playSound()`
- Ambience systems use periodic restart (every 100 ticks) to simulate looping
- All debug logs are conditional on codex debug flags

### Debug Logging
- Biome ambience: Codex → Debug Menu → Biome Ambience
- Buff ambience: Codex → Debug Menu → Spawn Controller → General Logging
- All logs are silent by default unless debug flags are enabled

### Documentation Structure
- `docs/design/` - Design philosophy and vision
- `docs/development/` - Technical docs, guides, and progress tracking
- `docs/reference/` - External resources and links
- `docs/ai/` - AI assistant context (this file)
