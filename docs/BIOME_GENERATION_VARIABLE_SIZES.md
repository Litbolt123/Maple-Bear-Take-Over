# Variable Biome Sizes in Minecraft Bedrock

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

## Notes

- Stack several configurations with different scales and low amount values for natural variety
- The noise system is seed-dependent, so test with multiple seeds
- Balance is key: too many replacements can cause biome conflicts

