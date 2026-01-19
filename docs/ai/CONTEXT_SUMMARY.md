# Context Summary

## Recent Changes (Latest Session)

### Performance & Architecture Improvements
- **Dynamic Property Handler**: Implemented `mb_dynamicPropertyHandler.js` with cached read/write system and batch saving
  - Lazy loading for world properties to avoid early execution errors
  - 1-tick delay for loading properties of players already in world
  - Chunking support for large dynamic properties (codex, player settings)
  - Defensive checks for player validity and property existence
  - All scripts migrated to use new handler (`getPlayerProperty`, `setPlayerProperty`, `getWorldProperty`, `setWorldProperty`)
- **Item Finder Utility**: Created `mb_itemFinder.js` with priority-based inventory search
  - Replaces scattered inventory scanning code
  - Priority system: hotbar → main inventory → offhand
- **Item Event Registry**: Created `mb_itemRegistry.js` with modular event registration system
  - Replaced direct `itemCompleteUse` handler with registry pattern
  - Cleaner code organization for item consumption events
- **Isolated Player Optimizations**: Enhanced spawn system for players far from others (>96 blocks)
  - Reduced resource usage: scan radius (75→40), entity queries (45→30), tile limits (-40%), cache TTL (+50%)
  - Skip progressive scanning for isolated players
  - Compensate with increased spawn attempts (+25%) and spawn chance multiplier (1.4x)
  - Maintains balanced gameplay while reducing lag

### Minor Infection System Enhancements
- **Random Effects System**: Minor infection now has random, severity-scaling effects
  - Severity levels: 0 (no effects), 1 (mild), 2 (moderate), 3 (severe)
  - Cooldowns scale with severity (7200, 4800, 3600, 2400 ticks)
  - Effect pools by severity (milder than major infection)
  - Per-player effects (not global)
- **Respawn Messaging**: Enhanced respawn experience for minor infection
  - First-time respawn: Full message, on-screen title, sounds (enderman portal + villager idle)
  - Subsequent respawns: Minimal message only
  - No immediate slowness on respawn (effects applied by timer loop only)
  - Shorter blindness duration (60 ticks vs 200)
- **Progression Messaging**: Reduced message spam for subsequent infections
  - First minor reinfection: Full text
  - Subsequent minor reinfections: Minimal text ("§eMinor infection.")
  - First major infection: Full text
  - Subsequent major infections: Minimal text ("§cMajor infection.")
  - Suppress messages if player dies from the hit that would cause progression

### Intro Sequence & Welcome System
- **Intro Sequence Fixes**: Fixed replay issues and timing
  - Proper boolean handling for `introSeen` property (handles true, "true", 1, "1")
  - Uses persistent world property instead of in-memory Set
  - Consistent intro check across all handlers
- **Welcome Messages**: Fixed for both first-time and returning players
  - Returning players: Current day message + sound immediately on join
  - First-time players: "Day 0" after intro (consistent format)
  - `showPlayerTitle` only plays sound when day is not null/undefined
- **First-Time Welcome Screen**: Archived (disabled but code preserved)
  - `showFirstTimeWelcomeScreen` function commented out
  - Normal journal UI always shown instead

### Debug System Expansions
- **New Debug Menus**: Added to journal debugging section
  - Dynamic Property Handler: Chunking, caching, reads, writes, errors flags
  - Codex/Knowledge System: Progressive, experience, flags, chunking, saving flags
- **Expanded Existing Menus**:
  - Spawn Controller: Added isolated flag
  - Main Script: Added minorInfection flag
- **Updated Debug Defaults**: New categories and flags in `getDefaultDebugSettings()`

### Code Quality & Verification
- **Code Verification**: Comprehensive verification of all recent changes
  - No linter errors
  - All imports correct
  - All function dependencies verified
  - All constants and properties properly defined
  - Logic flow verified
- **Verification Report**: Created `docs/VERIFICATION_REPORT.md` documenting all checks

### Documentation Updates
- **Co-Creator Documentation**: Created `docs/Compoohter/` folder
  - `TASKS_FOR_CO_CREATOR.md`: Detailed task list with corrected line numbers
  - `UI_CREATION_GUIDE.md`: Guide for UI creation and patterns
  - `NEXT_SESSION_TASKS.md`: Planned AI improvements (torpedo bear block breaking, mining bear pathfinding)
- **Reference Documentation**: Updated `docs/reference/COLORS_AND_STYLING.md`
  - All current UI elements documented
  - Line numbers updated to match current code
  - New sections: Minor Infection Analysis, respawn messages, etc.

### Discovery-Based Knowledge Progression System
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

### Minor Infection Starter System
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
- **Sound Progress Document Created**: Added `docs/development/sounds/SOUND_PROGRESS.md` to track sound integration progress
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
- Moved `HOW_TO_ADD_SOUNDS.md` → `docs/development/guides/`
- Moved `SOUND_GENERATION_PROMPT.md` → `docs/development/sounds/`
- Moved `SPAWN_SYSTEM_EXPLANATION.md` → `docs/development/systems/`
- Moved `BIOME_GENERATION_VARIABLE_SIZES.md` → `docs/development/systems/`
- Moved `maple_bear_condensed_prompts.md` → `docs/development/prompts/`
- Moved `maple_bear_sound_prompts.md` → `docs/development/sounds/`
- Moved `cursor ai/CONTEXT_SUMMARY.md` → `docs/ai/CONTEXT_SUMMARY.md`
- Created `docs/development/sounds/SOUND_PROGRESS.md` for tracking sound integration

### Previous Work: Spawn System Error Fixes
- Fixed spawn system errors related to entity queries and dimension handling
- Improved error handling in spawn controller
- Added better validation for entity spawning

## Current Project State

### Performance Optimizations
- **Status**: Major improvements implemented
- **Dynamic Properties**: Cached handler with lazy loading and batch saving
- **Isolated Players**: Optimized resource usage with spawn compensation
- **Shared Caches**: Player and mob caching across all AI scripts
- **Block Caching**: Mining AI block queries cached for 1 tick

### Minor Infection System
- **Status**: Fully implemented with enhancements
- **Core Features**: Random effects, respawn messaging, progression handling
- **Cure System**: Golden Apple + Golden Carrot grants permanent immunity
- **Progression**: Can advance to major infection via bear hits or snow consumption

### Documentation
- **Structure**: Organized into `design/`, `development/`, `reference/`, `ai/`, and `Compoohter/` folders
- **New Files**: Verification report, co-creator tasks, UI guide, next session tasks
- **Organization**: All development docs in `docs/development/` folder
- **Co-Creator Support**: Dedicated folder with tasks, UI guide, and line number references

### Key Files
- `BP/scripts/mb_dynamicPropertyHandler.js` - Cached dynamic property system
- `BP/scripts/mb_itemFinder.js` - Priority-based inventory search
- `BP/scripts/mb_itemRegistry.js` - Modular item event registration
- `BP/scripts/mb_sharedCache.js` - Shared player/mob caching
- `BP/scripts/mb_codex.js` - Journal UI with progressive knowledge system
- `BP/scripts/main.js` - Core game logic with minor infection system
- `BP/scripts/mb_spawnController.js` - Spawn system with isolated player optimizations
- `BP/scripts/mb_dayTracker.js` - Day tracking with welcome messages
- `RP/sounds/sound_definitions.json` - All sound definitions
- `RP/sounds.json` - Entity sound mappings
- `BP/scripts/mb_biomeAmbience.js` - Biome ambience system
- `BP/scripts/mb_flyingAI.js` - Flight sounds
- `BP/scripts/mb_torpedoAI.js` - Flight and explosion sounds
- `BP/scripts/mb_miningAI.js` - Dig sounds

## Important Notes

### Dynamic Property Handler
- All scripts use `getPlayerProperty`, `setPlayerProperty`, `getWorldProperty`, `setWorldProperty`
- Lazy loading prevents early execution errors
- Chunking supports large properties (codex, settings)
- Batch saving reduces I/O operations

### Minor Infection System
- Random effects scale with severity (0-3)
- Effects are per-player, not global
- Respawn messaging distinguishes first-time vs subsequent
- No immediate effects on respawn (applied by timer loop)

### Intro Sequence
- Uses persistent world property (`WORLD_INTRO_SEEN_PROPERTY`)
- Boolean handling supports multiple formats (true, "true", 1, "1")
- Welcome messages consistent for first-time and returning players

### Debug System
- New categories: Dynamic Property Handler, Codex/Knowledge System
- Expanded: Spawn Controller (isolated flag), Main Script (minorInfection flag)
- All debug flags toggleable in-game via journal

### Documentation Structure
- `docs/design/` - Design philosophy and vision
- `docs/development/` - Technical docs, guides, and progress tracking
- `docs/reference/` - External resources and links
- `docs/ai/` - AI assistant context (this file)
- `docs/Compoohter/` - Co-creator tasks and guides### Next Session Tasks
- Torpedo Bear: Fix block breaking for blocks directly above (when under structures)
- Mining Bear: Add pathfinding from Discord resources, reduce vanilla behaviors
- See `docs/Compoohter/NEXT_SESSION_TASKS.md` for details
