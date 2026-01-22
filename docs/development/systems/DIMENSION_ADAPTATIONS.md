# Dimension Adaptations - Maple Bear Takeover

This document describes how Maple Bears adapt to different dimensions based on environmental pressures.

## Overview

Maple Bears have evolved to survive in all three dimensions (Overworld, Nether, End). Each dimension presents unique challenges that bears adapt to based on their day variant (evolutionary stage).

## Nether Dimension Adaptations

### Fire Resistance System

Bears in the Nether gain fire resistance based on their day variant. The system is implemented in `BP/scripts/mb_dimensionAdaptation.js`.

#### Day 4 and Earlier Variants
- **Variants**: `mb:mb_day00`, `mb:mb_day04`, `mb:infected`
- **Fire Resistance**: None
- **Behavior**: These early-stage bears have no protection from fire or lava in the Nether

#### Day 8-17 Variants (Time-Based Adaptation)
- **Variants**: `mb:mb_day08`, `mb:mb_day13`, `mb:infected_day08`, `mb:infected_day13`, `mb:buff_mb`, `mb:buff_mb_day13`, `mb:flying_mb`, `mb:flying_mb_day15`, `mb:mining_mb`, `mb:torpedo_mb`
- **Fire Resistance**: Fire Resistance I (temporary)
- **Time Requirement**: Must spend 200 ticks (10 seconds) in Nether before gaining fire resistance
- **Duration**: 20 seconds (400 ticks), then expires
- **Refresh**: Effect refreshes every 5 seconds while in Nether (after initial 10-second wait)
- **Reset**: Timer resets to 0 when bear leaves Nether
- **Rationale**: Since any level of fire resistance blocks all fire damage in Minecraft, time must be a factor. These bears are vulnerable for the first 10 seconds, and their protection can expire if not refreshed.

#### Day 20+ Variants (Complete Immunity)
- **Variants**: `mb:mb_day20`, `mb:infected_day20`, `mb:buff_mb_day20`, `mb:flying_mb_day20`, `mb:mining_mb_day20`, `mb:torpedo_mb_day20`
- **Fire Resistance**: Fire Resistance III (complete immunity)
- **Duration**: Permanent while in Nether
- **Behavior**: These advanced bears spawn with complete fire/lava immunity immediately upon entering the Nether

### Implementation Details

- **Check Interval**: System checks all bears every 100 ticks (5 seconds)
- **Tracking**: Day 13 variants use entity dynamic property `mb_nether_time` to track time spent in Nether
- **Effect Application**: Uses Minecraft's native `fire_resistance` effect
- **Dimension Detection**: Bears are checked across all dimensions, fire resistance is applied/removed based on current dimension

## End Dimension Adaptations

### Spawn Rate Adjustments

The End's void-heavy environment favors aerial threats. Spawn rates are adjusted in `BP/scripts/mb_spawnController.js` within the `attemptSpawnType` function.

#### Flying and Torpedo Bears
- **Base Multiplier**: 1.0x (normal rates)
- **Day 20+**: 1.5x spawn rate
- **Day 30+**: 2.0x spawn rate
- **Day 40+**: 2.5x spawn rate
- **Maximum**: 3.0x cap
- **Rationale**: The End's void makes flying essential for survival and hunting

#### Other Bear Types
- **Multiplier**: 0.5x (reduced spawn rates)
- **Rationale**: Makes room for increased flying/torpedo presence while still allowing other variants

### Implementation Details

- **Location**: Spawn rate multipliers applied in `attemptSpawnType` function around line 3270
- **Dimension Check**: Only applies when `dimension.id === "minecraft:the_end"`
- **Scaling**: Multipliers scale with world day progression from `getCurrentDay()`

## Biome Generation

### Overworld Biome Replacement

The Overworld uses variable-sized infected biome generation with three size variants:

- **Large Biomes**: `noise_frequency_scale: 0.1`, lower `amount` values (huge rare biomes)
- **Medium Biomes**: `noise_frequency_scale: 5`, moderate `amount` values (normal baseline)
- **Small Biomes**: `noise_frequency_scale: 80`, higher `amount` values (tiny scattered patches)

### Nether and End Spawning (Block-Based)

**Important**: Biome replacement (`minecraft:replace_biomes`) is **not available** for Nether or End dimensions in Minecraft Bedrock Edition. The `dimension` field must be `"minecraft:overworld"`.

Instead, the spawn system uses **aggressive block scanning** to find spawn locations:

- **Overworld**: `mb:dusted_dirt`, `mb:snow_layer` (from biome replacement)
- **Nether**: Multiple block types scanned directly:
  - `minecraft:netherrack` (most common)
  - `minecraft:soul_sand` (soul sand valleys)
  - `minecraft:soul_soil` (soul sand valleys - variant)
  - `minecraft:basalt` (basalt deltas top layer)
  - `minecraft:crimson_nylium` (crimson forests)
  - `minecraft:warped_nylium` (warped forests)
- **End**: `minecraft:end_stone` (scanned directly)

#### Aggressive Scanning Features

- **1.5x Query Limits**: Nether/End use 50% more block queries than Overworld
  - Normal: 9,000 queries (vs 6,000 for Overworld)
  - Single Player: 18,000 queries (vs 12,000 for Overworld)
- **Always Full Scan**: Nether/End always perform full area scans, regardless of cache state
- **Block Caching**: Found blocks are registered in the spawn cache for future use
- **Dimension Detection**: `isValidTargetBlock()` function accepts dimension ID to check appropriate blocks

The `collectDustedTiles()` function in `mb_spawnController.js` detects Nether/End dimensions and automatically switches to aggressive scanning mode.

## Technical Notes

### Performance
- Dimension adaptation checks run every 100 ticks (5 seconds) to balance responsiveness with performance
- Entity queries are batched per dimension
- Fire resistance effects use maximum duration for day 20+ variants to minimize refresh overhead

### Compatibility
- System works with all existing bear variants
- No changes required to entity JSON files
- Fire resistance is applied via script, not hardcoded in entity definitions

## Future Considerations

- **Lava Immunity**: Currently only fire resistance is implemented. Lava damage may need separate handling if fire resistance doesn't fully protect against lava.
- **Adaptation Progression**: Could add visual indicators (particle effects, texture changes) for adapted bears
- **Dimension-Specific Variants**: Could create unique Nether/End variants in the future if needed

