# Variable Biome Sizes in Minecraft Bedrock

## Status: ✅ Implemented

This system is now implemented in the Maple Bear Takeover addon. The infected biome (`mb:infected_biome`) uses variable sizes across all three dimensions (Overworld, Nether, End). See `BP/biomes/mb_infected_biome.json` for the implementation.

## Overview
To achieve much more variable biome sizes in Minecraft Bedrock—ranging from super small patches to massive expanses—use the `minecraft:replace_biomes` component with multiple replacement configurations.

## Key Concept
Each config's `noise_frequency_scale` (0.0-100.0) directly controls clump size:
- **Low values** (e.g., 0.01-0.5): Create huge rare biomes
- **Medium values** (e.g., 1-10): Normal-sized biomes as baseline
- **High values** (e.g., 50-100): Super-small scattered patches

## Multiple Replacement Strategy

Define several `replacements` entries in your biome JSON's `minecraft:replace_biomes.replacements` array, each targeting the same or overlapping base biomes but with different `noise_frequency_scale` values. This creates a mix of sizes probabilistically per world seed.

### Guidelines:
1. **Very low scales** (0.01-0.5): For super-large biomes that dominate regions rarely
2. **Medium scales** (1-10): For normal-sized ones as a baseline
3. **Very high scales** (50-100): For super-small scattered patches
4. **Keep each amount low** (0.01-0.05): To avoid over-replacement
5. **Total across configs**: Should stay under 0.3 per target biome for balance

## Example JSON Snippet

Add to your custom biome JSON file:

```json
"minecraft:replace_biomes": {
  "replacements": [
    {
      "dimension": "minecraft:overworld",
      "targets": ["minecraft:plains", "minecraft:forest"],
      "amount": 0.02,
      "noise_frequency_scale": 0.1   // Huge biomes
    },
    {
      "dimension": "minecraft:overworld",
      "targets": ["minecraft:plains", "minecraft:forest"],
      "amount": 0.03,
      "noise_frequency_scale": 5     // Medium biomes
    },
    {
      "dimension": "minecraft:overworld",
      "targets": ["minecraft:plains", "minecraft:forest"],
      "amount": 0.05,
      "noise_frequency_scale": 80    // Tiny biomes
    }
  ]
}
```

## Additional Tuning Tips

1. **Tune `generate_for_climates` weights** in `minecraft:overworld_generation_rules` to make your biome compete in more slots, increasing overall occurrence without fixed sizes.

2. **Test in new worlds**: Seeds affect noise; combine with `minecraft:overworld_height` noise params for terrain scale variety.

3. **For extreme variability**: Create duplicate biome files with different scales replacing each other, though this uses more pack space.

## Implementation in Maple Bear Takeover

The addon implements variable sizes for:
- **Overworld**: 5 biome categories (common land, ocean/water, arid/mountain, cold, cave) - each with 3 size variants
  - Large: `noise_frequency_scale: 0.1`, lower `amount` (0.01-0.02)
  - Medium: `noise_frequency_scale: 5`, moderate `amount` (0.02-0.03)
  - Small: `noise_frequency_scale: 80`, higher `amount` (0.03-0.05)

**Note**: Biome replacement (`minecraft:replace_biomes`) is **only available for the Overworld** in Minecraft Bedrock Edition. The `dimension` field must be `"minecraft:overworld"`. Nether and End dimensions use different generation systems and do not support biome replacement.

### Nether and End Spawning

Since biome replacement doesn't work in Nether/End, the spawn system uses **aggressive block scanning** instead:
- **Nether**: Scans for multiple block types:
  - `minecraft:netherrack` (most common)
  - `minecraft:soul_sand` (soul sand valleys)
  - `minecraft:soul_soil` (soul sand valleys - variant)
  - `minecraft:basalt` (basalt deltas top layer)
  - `minecraft:crimson_nylium` (crimson forests)
  - `minecraft:warped_nylium` (warped forests)
- **End**: Scans for `minecraft:end_stone` blocks
- **Enhanced Scanning**: Uses 1.5x query limits (9,000 queries normal, 18,000 single player)
- **Always Full Scan**: Nether/End always perform full area scans (doesn't rely on cache)
- **Block Registration**: Found blocks are cached for future spawn attempts

## Notes

- Stack several configurations with different scales and low amount values for natural variety
- The noise system is seed-dependent, so test with multiple seeds
- Balance is key: too many replacements can cause biome conflicts
- See `docs/development/DIMENSION_ADAPTATIONS.md` for details on Nether/End implementation

