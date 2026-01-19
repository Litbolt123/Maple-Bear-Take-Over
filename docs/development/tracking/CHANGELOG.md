# Changelog - Maple Bear Takeover

This file tracks all features added, removed, and changes made to the addon.

## Format
- **Added**: New features
- **Changed**: Modifications to existing features
- **Fixed**: Bug fixes
- **Removed**: Features that were removed

---

## [Unreleased]

### Added
- **Dynamic Property Handler**: Implemented cached dynamic property system (`mb_dynamicPropertyHandler.js`) with lazy loading, batch saving, and chunking support for large properties. All scripts migrated to use new handler functions.
- **Item Finder Utility**: Created `mb_itemFinder.js` with priority-based inventory search (hotbar → main inventory → offhand).
- **Item Event Registry**: Created `mb_itemRegistry.js` with modular event registration system for cleaner item consumption handling.
- **Isolated Player Optimizations**: Enhanced spawn system to detect players far from others (>96 blocks) and optimize resource usage while maintaining spawn balance through compensation.
- **Minor Infection Random Effects**: Implemented random, severity-scaling effects for minor infection (per-player, not global) with cooldowns that scale with severity level.
- **Minor Infection Respawn Messaging**: Enhanced respawn experience with full message/title/sounds for first-time respawn, minimal message for subsequent respawns.
- **Debug Menu Expansions**: Added new debug menus for Dynamic Property Handler and Codex/Knowledge System, expanded existing menus with new flags.
- **Verification Report**: Created comprehensive verification report documenting all code checks and validation.
- **Co-Creator Documentation**: Created `docs/Compoohter/` folder with tasks, UI guide, and next session planning.
- **Variable-sized infected biome generation**: Infected biomes now generate in three size variants (large/medium/small) across all dimensions. Each biome replacement category uses multiple `replace_biomes` entries with different `noise_frequency_scale` values: 0.1 for huge rare biomes, 5 for normal baseline, 80 for tiny scattered patches. This creates natural size variety in biome generation (seed-dependent).
- **Nether dimension infection**: Infected biome now replaces all 5 vanilla Nether biomes (nether_wastes, crimson_forest, warped_forest, soul_sand_valley, basalt_deltas) with variable sizes at ~0.08 density per biome (slightly lower than overworld for balance). Spawn system supports `netherrack` as a valid spawn block in the Nether dimension.
- **End dimension infection**: Infected biome now replaces all 5 vanilla End biomes (the_end, end_highlands, end_midlands, end_barrens, small_end_islands) with variable sizes at ~0.06 density per biome (lowest density - End should feel more isolated). Spawn system supports `end_stone` as a valid spawn block in the End dimension.
- **Nether bear fire resistance adaptation**: Bears in the Nether gain fire resistance based on their day variant. Day 4 and earlier variants have no fire resistance. Day 8-17 variants gain Fire Resistance I after spending 200 ticks (10 seconds) in Nether, with temporary 20-second duration that expires and needs refresh (time is a factor). Day 20+ variants gain Fire Resistance III (complete immunity) immediately upon entering Nether. Fire resistance is removed when bears leave the Nether. Implemented in `mb_dimensionAdaptation.js`.
- **End dimension spawn rate adjustments**: Flying and torpedo bear spawn rates are increased in the End dimension, scaling with world day progression: 1.5x at day 20+, 2.0x at day 30+, 2.5x at day 40+, capped at 3.0x maximum. Other bear types get reduced spawn rates (0.5x) in the End to make room for aerial threats. This reflects the End's void-heavy environment where flying is key.
- **Daily log entries for new bear types**: Added daily log entries for when Flying Bears (day 11), Mining Bears (day 15), and Torpedo Bears (day 17) start spawning. These entries appear in the journal's daily log one day after the bears first appear, providing players with narrative context about these new threats.
- **Heat-seeking vision documentation**: Created comprehensive documentation (`docs/development/HEAT_SEEKING_VISION.md`) explaining how the heat-seeking vision system works for Torpedo Bears and Mining Bears, including technical details, gameplay implications, and comparison between the two systems.
- **Infected player death logging**: Infected player deaths (transformation into Maple Bears) are now recorded in daily logs for all players. The events appear in the journal one day after they occur, matching the reflection format of other daily events.
- **Normal golden apple infection reduction with unlockable journal info**: Eating a normal golden apple now reduces the player's infection "snow" level by 0.5. This provides a way to slow infection progression, though it does not cure the infection (only enchanted golden apple + weakness can cure). Players receive a one-time discovery message when they first discover this property while infected - if they have the journal, they see "Check your journal." Otherwise, they see a narrative message. The information about this property is unlockable in the journal's Items section under "Golden Apple" - it only appears after the player has discovered it through gameplay.

### Changed
- **Dynamic Property Access**: All scripts now use cached handler (`getPlayerProperty`, `setPlayerProperty`, `getWorldProperty`, `setWorldProperty`) instead of direct dynamic property calls, improving performance and preventing early execution errors.
- **Item Consumption Handling**: Refactored to use Item Event Registry pattern for cleaner code organization.
- **Isolated Player Spawn Optimization**: Reduced resource usage for isolated players (scan radius 75→40, entity queries 45→30, tile limits -40%, cache TTL +50%, skip progressive scanning) with spawn compensation (attempts +25%, chance 1.4x, tile density 1.5x).
- **Minor Infection Effects**: Changed from fixed effects to random, severity-scaling system with per-player tracking.
- **Minor Infection Respawn**: Removed immediate slowness on respawn, shortened blindness duration (200→60 ticks), effects now only applied by timer loop.
- **Infection Progression Messaging**: Reduced message spam - first occurrence shows full text, subsequent occurrences show minimal text.
- **Intro Sequence**: Fixed to use persistent world property and proper boolean handling, preventing replay for returning players.
- **Welcome Messages**: Fixed to show current day and sound for returning players, consistent "Day 0" format for first-time players.
- **First-Time Welcome Screen**: Disabled (archived) - normal journal UI always shown instead.
- **Mining Bear Inventory**: Reduced from 20/24 slots to 3 slots to reduce lag.
- **Spawn Caps**: Reduced Tiny Maple Bear cap from 75 to 50, Infected Maple Bear cap from 50 to 35.
- **Improved Stair Casing**: Enhanced stair creation with better side clearance to prevent getting stuck on stair edges. Stairs now clear adjacent blocks that might block movement, making navigation smoother and less damaging.
- **Spiral Staircases**: Mining bears can now create spiral staircases for climbs of 4+ blocks. Spiral stairs are more efficient, require less block breaking, and provide easier navigation for tall structures. The spiral rotates around the forward direction, creating a 4-step cycle pattern. Bears automatically choose between regular stairs (for shorter climbs) and spiral stairs (for taller climbs) based on target elevation.
- **Adaptive Mining Strategy**: Mining bears now evaluate multiple mining options (pitfall, regular stairs, spiral stairs) and choose the most effective one based on the current situation and terrain. Uses a scoring system: Pitfall (Score 10) for targets 3-5 blocks above with breakable blocks underneath, Regular Stair (Score 5) as default for moderate climbs, Spiral Stair (Score 3) for targets 4+ blocks above with viable terrain. Bears adaptively choose the best strategy rather than always using the same approach.
- **Cave-Aware Mining**: Mining bears can now detect caves ahead using heat-seeking vision (raycasting through up to 5 breakable blocks). When a cave is detected, bears prioritize mining towards it, using more aggressive mining (up to 4 steps ahead instead of 2) and checking diagonal directions for faster cave access. Cave detection is integrated with stuck detection - when stuck, bears first check all directions for caves before using standard pathfinding. This allows bears to find and utilize natural cave systems more effectively.
- **Improved Vertical Mining**: Enhanced upward and downward mining detection with a new `needsVerticalMining()` function that uses a more aggressive threshold (1.5 blocks vs 0.75). Added vertical pathfinding checks that look up to 4 blocks ahead. Implemented "aggressive" upward and downward mining modes that clear blocks 2 levels up/down when targets are close and significantly above/below. This fixes issues where bears sometimes didn't mine upwards or downwards well.
- **Debug Menu Integration**: Added two new debug options to the Mining AI Debug menu: "Pathfinding Debug" (for stuck detection and multi-directional pathfinding) and "Vertical Mining Debug" (for vertical mining detection and aggressive modes). Both options can be toggled in-game via the Developer Tools in the journal.
- **Multi-Directional Pathfinding**: Mining bears now detect when they're stuck and check all 6 directions (N, S, E, W, Up, Down) to find the best path. When stuck for 2+ seconds, bears automatically switch to the best available direction based on priority: towards target > vertical (up/down based on target) > already clear > has breakable blocks. This prevents bears from getting stuck mining in one direction.
- **Block Caching System**: Added block caching to Mining AI's `getBlock()` function. Blocks are cached for 1 tick to reduce redundant queries when the same block position is checked multiple times (e.g., in loops checking forward blocks, headroom, etc.). Cache is automatically cleaned up every 10 ticks to prevent memory bloat.
- **Shared Cache System**: Enhanced `mb_sharedCache.js` with mob caching. Added `getCachedMobs()` to batch entity queries per dimension instead of per-entity. All AIs now use cached mob queries, reducing `getEntities()` calls significantly. Mining AI: 2 fewer per-entity queries, Torpedo AI: 1 fewer, Flying AI: 1 fewer.
- **Shared Player Cache System**: Created `mb_sharedCache.js` to cache player queries across all AI scripts. All AIs (Mining, Torpedo, Flying) now use the shared cache instead of querying players independently, reducing duplicate `getAllPlayers()` calls by ~66%.
- **Mining AI Leader Death Handler**: When a mining bear leader dies, the nearest follower is automatically promoted to leader. All remaining followers are reassigned to the new leader. This ensures mining groups continue functioning even when leaders are killed.
- **AI Performance Optimizations**: 
  - Added `AI_TICK_INTERVAL = 2` to Torpedo and Flying AI (50% reduction in processing frequency)
  - Added target caching (`TARGET_CACHE_TICKS = 5`) to Torpedo and Flying AI to reduce player/mob queries
  - Both AIs now run every 2 ticks instead of every tick, matching Mining AI optimization
  - Target lookups are cached for 5 ticks, reducing expensive queries by ~80%
- **Weather affects spawn rates**: Weather now affects Maple Bear spawn rates. Rain and snow reduce spawns by 30% (0.7x multiplier), while thunderstorms have no reduction (1.0x multiplier). Weather is detected via command-based system and cached for performance.
- **Buff bear spawn rarity increased**: Buff bears are now significantly rarer:
  - Base spawn chances reduced by 30-40%
  - Spawn delay increased (slower spawn rate)
  - Max chance caps reduced
  - Multiplayer bonus reduced (less extra chance when multiple players nearby)
- **Buff bear caps based on player count**: Buff bear spawn caps are now dynamic based on nearby player count:
  - 1-2 players: Max 1 buff bear
  - 3-4 players: Max 2 buff bears
  - 5+ players: Max 3 buff bears
  - Replaces the old static cap of 5 buff bears
- **Milestone days list**: Updated `MILESTONE_DAYS` array to include days 11, 15, and 17 for Flying Bears, Mining Bears, and Torpedo Bears respectively.

### Fixed
- **Early Execution Errors**: Fixed `ReferenceError` for world dynamic properties by implementing lazy loading in dynamic property handler.
- **Dynamic Property Handler Errors**: Added defensive checks for `player.isValid` and `player.setDynamicProperty` to prevent `TypeError: not a function` errors.
- **Intro Sequence Replay**: Fixed intro replaying for returning players by using persistent world property and consistent boolean handling.
- **Returning Player Welcome**: Fixed silent welcome messages - now shows day message and sound immediately on join.
- **First-Time Player Day Display**: Fixed to show "Day 0" after intro (consistent with returning players).
- **Back Button Navigation**: Fixed back buttons in new debug menus (Dynamic Property Handler, Codex/Knowledge System) to correctly return to main debug menu.
- **Flying Maple Bear Egg Texture**: Fixed icon path in items menu from `flying_mb_egg` to `flying_mb_egg_texture`.
- **Minor Infection Progression**: Fixed edge case where minor-to-major conversion might reset timer incorrectly.
- **Minor Infection on Bear Hit**: Fixed issue where minor infection progression messages/effects weren't triggering when hit by "maple thrall" (infected bear).
- **Minor Infection Respawn Effects**: Fixed immediate slowness and long blindness on respawn - effects now only applied by timer loop.
- **Codex Line Numbers**: Corrected all line number references in co-creator tasks documentation.
- **Day 8 variant unlock bug**: Fixed issue where day 8+ variants were unlocking on day 5 when players saw bears attack animals. Now, kill-based variant unlocks (3 kills of day 4+ variants) only trigger when the current day is >= 8, ensuring day 8 variants only unlock on day 8 or later. Same fix applied to day 13 and day 20 variant unlocks.
- **Spiral staircase viability check**: Added `isSpiralStairViable()` function to check if terrain is suitable for spiral staircases before attempting to build them. Spiral stairs are now only used when the terrain has breakable blocks and isn't too obstructed by unbreakable blocks. This prevents bears from attempting spiral stairs on unsuitable terrain (e.g., hillsides with too many unbreakable blocks).
- **Mining bears not targeting villagers**: Fixed issue where mining bears were not targeting villagers. Updated `getCachedMobs()` in `mb_sharedCache.js` to include both `"mob"` and `"villager"` families in entity queries, allowing mining bears to properly detect and target villagers.
- **Mining bears jumping in circles**: Fixed issue where mining bears would jump in circles when `canActuallyAttack=true`. Added early return in `processContext` that stops all mining logic and movement impulses when the bear can actually attack, letting the native AI handle the attack without interference.
- **Mining bears stuck on edges**: Added edge detection logic that detects when a bear is stuck on a narrow edge (no blocking blocks but `canReachByWalking=false`). When detected, the bear applies a stronger movement impulse (0.04) towards the target and a small upward impulse (0.01) to help it move off the edge.
- **Mining bears not attacking same-level targets**: Fixed issue where mining bears were not attacking targets that were directly adjacent and on the same Y level. Adjusted `canActuallyAttack` logic to be more lenient for very close targets (within 2 blocks horizontally and vertically), allowing up to 1 block in the way for minor obstructions. Also made `canSeeTargetThroughBlocks` more lenient for very close targets, assuming line of sight when within 2 blocks horizontally and vertically.
- **Mining bears attacking through walls**: Fixed issue where bears would try to attack through walls when very close. Updated line-of-sight check to allow up to 1 block in the way for very close targets (for minor obstructions like grass), but if there's a wall (2+ blocks), `hasLineOfSight` returns `false` and the bear will mine to break the wall first before attacking. This ensures bears always break walls first, even when close to the target.
- **Bears with null role**: Fixed issue where bears with targets but no assigned role (not picked as leader or follower in a target bucket) would have `role=null`. Now defaults to `role: "leader"` if a bear has a target but no role was assigned.
- **Spiral staircase breaking protected blocks**: Modified `clearBlock` to allow breaking protected stair/ramp blocks if the entity is detected as stuck. This prevents bears from getting stuck in loops when building spiral staircases.
- **Break blocks under target when target too high**: Fixed issue where `breakBlocksUnderTarget` was called when the target was excessively high (8+ blocks above). Now only calls `breakBlocksUnderTarget` when the target is 3-5 blocks above, preventing unnecessary block breaking for very high targets.
- **Spiral staircase not breaking blocks**: Fixed issue where `carveSpiralStair` wasn't breaking blocks because it attempted to break air or non-solid blocks. Added `isSolidBlock()` checks within `carveSpiralStair` to ensure it only attempts to break solid blocks.

### Removed
- **Snow layer falling/breaking system**: Archived (commented out) the snow layer falling and breaking system in `main.js`. The system that made snow layers fall when placed without support and break when landing on other snow layers has been temporarily disabled. Code is preserved in comments marked with `[ARCHIVED]` for future reference. This includes:
  - Snow layer floating detection and breaking (system.runInterval)
  - Falling block spawning when placing snow layers without support
  - Falling block tracking and landing detection system
  - Entity spawn handler for tracking falling blocks

---

## Notes
- Date format: YYYY-MM-DD
- Group changes by category (Added/Changed/Fixed/Removed)
- Include brief description of what changed and why

