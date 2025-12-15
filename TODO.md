# Maple Bear Takeover - TODO List

## 🔧 Current Status - Fully Implemented Features

### Core Systems
- ✅ Basic Maple Bear entities (tiny, infected, buff) with day-based variants
- ✅ Item pickup behavior for all bear types
- ✅ Bear infection system (20-day timer with progressive effects)
- ✅ Snow infection system (separate mechanics with tier-based progression)
- ✅ Cure system for bear infection (weakness + golden apple)
- ✅ Day tracking system with milestone events and world progression
- ✅ Item corruption on infected bear death
- ✅ API 2.0.0 compatibility fixes
- ✅ Safety checks for unavailable event handlers
- ✅ Robust effects detection with multiple fallback methods
- ✅ Fixed global object and command result handling

### Performance & Code Quality
- ✅ Performance optimizations (biome check cooldowns, module-scoped functions)
- ✅ Eliminated debug log spam with conditional DEBUG_SNOW_MECHANICS flag
- ✅ Optimized block placement handlers (snow layer conversion only)
- ✅ Centralized milestone messaging system
- ✅ Removed redundant code and improved maintainability
- ✅ Fixed unreachable code paths and redundant function calls

### User Interface & Experience
- ✅ Infection Tracker Book (`mb:snow_book`) with comprehensive on-demand UI
- ✅ Progressive codex system with discovery-based unlocks
- ✅ Biome discovery system with visual feedback
- ✅ Daily event logging with reflection-based storytelling
- ✅ Complete display transforms for snow layer model
- ✅ Alternative debug system using item interactions
- ✅ Day-based welcome messages and world state awareness
- ✅ Settings system - Sound volume controls, spawn difficulty adjustment, search button toggle
- ✅ Search functionality - Search codex entries by name across mobs, items, and symptoms
- ✅ Developer Tools menu - Reset codex, reset day, set day, spawn difficulty, debug menu (requires cheats)

### Progressive Knowledge System
- ✅ Multi-level knowledge progression (Basic Awareness → Understanding → Expert)
- ✅ Knowledge-based information gating (players must experience to learn)
- ✅ Dynamic welcome messages based on player knowledge level
- ✅ Progressive mob statistics (unlocked by kill count and knowledge level)
- ✅ Conditional item descriptions based on infection status and discovery
- ✅ Biome infection tracking with visit counts and infection level analysis
- ✅ Knowledge gates where advanced info requires other discoveries first
- ✅ Experience-driven information revelation (no spoilers for new players)

## 🚀 Future Features & Enhancements

### 📖 Enhanced Codex System
- [ ] Advanced symptom analysis with statistical data
- [ ] Infection progression charts and graphs
- ✅ Player achievement tracking and milestones - Day 25 victory, max days survived, post-victory milestones (30, 35, 40, 45, 50)
- ✅ Cross-player data sharing and comparisons - Knowledge sharing system when players are nearby with snow book
- [ ] Export/import codex data functionality
- [ ] Knowledge tree visualization showing unlock paths
- [ ] Hidden discoveries and secret information
- ✅ Knowledge-based achievement system - Achievements section in codex, milestone tracking

### 🎮 Gameplay Enhancements
- ✅ Infection symptoms (visual effects, random events) - Random effects system with severity-based symptoms
- [ ] Infection resistance items/armor
- [ ] Quarantine zones or safe areas
- [ ] Infection spread mechanics between players (always on in survival by default, with a toggle available in Developer Tools)
- [ ] Advanced cure recipes and brewing system
- [ ] Infection prevention items and strategies

### 🏗️ World Building & Environment
- ✅ Custom "infected" biome for increased Maple Bear activity - `mb:infected_biome` with spawn rules
- ✅ Client biome visuals (fog/sky) for infected biome - Fog settings, sky colors, water colors implemented
- [ ] Maple Bear spawn structures and lairs
- [ ] Infection research facilities and laboratories
- [ ] Cure crafting stations and medical areas
- [ ] Warning signs and information boards
- [ ] Emergency shelters and safe zones
- [ ] Environmental storytelling elements

### 📊 UI/UX Improvements
- [ ] Real-time infection status HUD element
- [ ] Progress bars for infection timers
- ✅ Warning notifications and alerts - Final warning before transformation, day-based notifications, actionbar messages
- ✅ Enhanced cure attempt feedback - Cure success/failure messages, immunity notifications
- ✅ Infection spread alerts and world events - Day progression messages, milestone events, daily event logging
- [ ] Interactive tutorial system for new players

### 🎯 Advanced Mechanics
- ✅ Multiple infection stages with unique effects - Severity levels 0-4 with progressive effects based on time and snow count
- [ ] Bear mutation and evolution system
- [ ] Weather effects on infection rates
- [ ] Seasonal infection patterns and cycles
- [ ] Cure research progression tree
- [ ] Dynamic difficulty scaling based on player count

### 🔧 Technical Improvements
- ✅ Enhanced debug tools for testing and development - Comprehensive debug menu system in snow book with per-category flags (Mining AI, Torpedo AI, Flying AI, Spawn Controller, Main Script)
- [ ] Performance monitoring and optimization metrics
- ✅ Advanced error handling and logging systems - Conditional debug logging, error tracking, safe codex operations
- ✅ Custom debug items with improved UI - Debug menu integrated into snow book codex with Developer Tools section
- [ ] Automated testing framework
- ✅ Configuration system for server administrators - Spawn difficulty adjustment (Easy/Normal/Hard/Custom -5 to +5), sound volume controls, search toggle

### 🎨 Content & Polish
- ✅ Additional bear variants and special types - Flying, Mining, Torpedo, Buff, Infected variants with day-based progression
  - [ ] **Raptor Flying Bear Variant** - Super rare flying maple bear that can grab players out of the sky (velociraptor-style aerial attack)
- ✅ Custom sounds and ambient audio - Infected bear sounds, infected cow/pig sounds, snow layer sounds, journal sounds
- ✅ Enhanced particle effects for infections and cures - White dust particle effects, death particles for infected entities
- ✅ Custom items, tools, and equipment - Snow item (`mb:snow`), Snow Book (`mb:snow_book`) with codex system
- ✅ Achievement system with rewards - Day 25 victory achievement, max days survived tracking, post-victory milestones displayed in codex
- [ ] Seasonal events and special encounters

### 🌌 Dimension & Endgame Expansion
- [ ] Extend Maple Bear spawning into the Nether (mix of normal variants plus fire-/lava-proof variants; tied into world corruption progression over time)
- [ ] Extend Maple Bear spawning into the End (increased flying/torpedo bear presence over the void, mixed with existing variants)
- [ ] Add configuration hooks so certain peaceful or secluded overworld biomes remain low-pressure “safer” zones (no natural Maple Bear spawns or much lower rates)
- [ ] Design and implement a 100-day endgame structure with milestone spikes (50, 75, 100) and at least one "canon" outcome plus branching outcomes based on player behavior (e.g., heavy dust use vs minimal, how much of the world is corrupted)
  - [ ] Post-credits world state: World continues after Day 100 with altered rules
- [ ] Implement wave-day logic on top of the existing linear ramp (short intense bursts AND mini-waves), respecting the global spawn difficulty slider
- [ ] Implement role ratios over time: early game plague-agent heavy (≈60% spreaders / 40% killers), late game killer heavy (≈60% killers / 40% spreaders), integrated with spawn controller
- [ ] Implement curing of infected animals into "scarred but special" variants with both mechanical buffs (more health, better drops) and cosmetic changes (corruption scars)

## 🐛 Known Issues & Resolved
- ✅ Chat event handler not available in API 2.0.0 (replaced with item-based debug system)
- ✅ Animation controller errors (non-critical, handled gracefully)
- ✅ Command syntax differences in API 2.0.0 (fixed)
- ✅ Global object not available in API 2.0.0 (fixed)
- ✅ Debug log spam (resolved with conditional DEBUG_SNOW_MECHANICS flag)
- ✅ Performance issues with biome checks (optimized with cooldown system)
- ✅ Redundant code and unreachable paths (cleaned up)

## 📌 Technical Notes

### Custom Biomes
- Custom biomes require enabling the "Custom Biomes" experiment on the world
- Partial biome replacement is experimental and may change
- Mixing custom biome generation with existing saved chunks can create seams; test on a fresh world or backup first

### Performance Optimizations
- Biome checks now use 10-second cooldown per player to reduce server load
- Block placement handlers optimized to only process snow-related blocks
- Module-scoped functions prevent recreation on every interval
- Debug logging conditionally enabled to prevent console spam

### API Compatibility
- Using API version 2.0.0 with comprehensive safety checks
- Robust effects detection with 3 fallback methods:
  1. `getEffect("minecraft:weakness")` - Direct method
  2. `getEffects()` - List all effects and find weakness  
  3. Command method - Final fallback (with proper null checking)

### Debug System
- ✅ Comprehensive debug menu system integrated into snow book codex
- ✅ Per-category debug flags: Mining AI (pitfall, general, target, pathfinding, mining, movement, stairCreation), Torpedo AI (general, targeting, diving, blockBreaking), Flying AI (general, targeting, pathfinding), Spawn Controller (general, tileScanning), Main Script (death, conversion, infection)
- ✅ Debug settings persistence - Saved per-player via dynamic properties
- ✅ Developer Tools menu - Reset codex, reset world day, set day, spawn difficulty adjustment, debug menu access
- ✅ Performance-optimized debug checking - Cached debug state to avoid iterating all players on every call
- Debug flag: Set `DEBUG_SNOW_MECHANICS = true` in main.js to enable verbose logging (legacy)

### 📚 Documentation & Project Organization
- ✅ Comprehensive documentation index created (`docs/reference/DOCUMENTATION_INDEX.md`)
- ✅ URL indexing guides created (`docs/reference/INDEXING_URLS.md` and `docs/reference/INDEXING_URLS_VERIFIED.md`)
- ✅ Updated `docs/reference/USEFUL_LINKS.md` with official documentation resources
- ✅ Updated README.md with documentation references
- ✅ Organized documentation resources for AI assistant indexing
- ✅ Organized all markdown files into `docs/` folder structure (design/, development/, reference/, ai/)
- [ ] Verify and test documentation URL indexing
- [ ] Create developer onboarding guide
- [ ] Document API usage patterns and best practices
- [ ] Create troubleshooting guide for common issues

## 🎯 Current Focus Areas
1. **Stability**: All core systems are stable and performant
2. **User Experience**: Comprehensive codex system provides rich discovery mechanics
3. **Performance**: Optimized for server environments with multiple players
4. **Maintainability**: Clean, well-documented code with centralized systems
5. **Documentation**: Comprehensive documentation resources organized and indexed 