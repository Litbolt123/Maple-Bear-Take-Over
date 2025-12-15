# Safe Biomes - Maple Bear Spawning

Based on `BP/biomes/mb_infected_biome.json`, the infected biome replaces specific vanilla biomes. Biomes **NOT** in that replacement list are considered "safer" zones where Maple Bears don't spawn naturally (or spawn at much lower rates).

## 🔴 Biomes Targeted by Infected Biome (NOT Safe)

The infected biome replaces these biomes at various densities:

### Common Land Biomes (8% replacement)
- Plains, Sunflower Plains
- Forest, Forest Hills
- Birch Forest (all variants)
- Taiga (all variants)
- Savanna (all variants)
- Meadow, Cherry Grove, Flower Forest
- Roofed Forest (all variants)
- Jungle (all variants)
- Bamboo Jungle (all variants)
- Swampland (all variants)
- Mangrove Swamp
- Pale Garden

### Ocean & Water Biomes (4% replacement)
- All Ocean variants (Ocean, Deep Ocean, Cold Ocean, Lukewarm Ocean, Warm Ocean, Frozen Ocean)
- All Beach variants (Beach, Cold Beach, Stone Beach)
- River, Frozen River

### Arid & Mountain Biomes (4% replacement)
- Desert (all variants)
- Mesa (all variants)
- Extreme Hills (all variants)
- Jagged Peaks, Frozen Peaks, Stony Peaks

### Cold Biomes (4% replacement)
- Ice Plains, Ice Plains Spikes
- Cold Taiga (all variants)
- Grove, Snowy Slopes

### Cave Biomes (6% replacement)
- Lush Caves
- Dripstone Caves
- Deep Dark

---

## 🟢 Potentially Safe Biomes (NOT in Replacement List)

These biomes are **NOT** targeted by the infected biome replacement, making them potentially safer zones:

### Mushroom Biomes
- **Mushroom Fields** (Mushroom Island)
- **Mushroom Fields Shore**

### Badlands Variants (if not already covered)
- Some mesa variants might be safe if not explicitly listed

### Other Rare/Uncommon Biomes
- Any biome not explicitly listed in the replacement targets
- Custom biomes from other addons (if they don't match vanilla biome IDs)

---

## ⚠️ Important Notes

1. **"Safer" doesn't mean "safe"**: 
   - Mining Bears can still dig to players in any biome
   - Flying/Torpedo Bears can reach any location
   - Players can still be infected and spawn bears anywhere
   - Dusted dirt can still be placed manually or by bear actions

2. **Spawn System**: 
   - The spawn controller (`mb_spawnController.js`) spawns bears based on finding `dusted_dirt` blocks, not directly checking biomes
   - However, the infected biome generates `dusted_dirt` as surface material, so infected biomes naturally have more spawn opportunities
   - Safe biomes won't have natural `dusted_dirt` generation, making them safer by default

3. **Future Plans**:
   - According to design vision, some overworld biomes should remain "relatively safer" (no natural spawns or much lower rates)
   - This document identifies which biomes currently fit that description
   - Future updates may explicitly configure certain biomes as "safe zones"

---

## 🎯 Recommendation

**Mushroom Fields** appears to be the most clearly "safe" biome, as it's:
- Not in any replacement list
- Already isolated in vanilla Minecraft
- Rare and hard to find (fitting the "secluded" description)

Other biomes not explicitly listed may also be safer, but Mushroom Fields is the most obvious candidate for a "safe zone" where players could theoretically build without natural Maple Bear spawns (though they'd still need to watch for mining/flying bears and manual dusted_dirt placement).

