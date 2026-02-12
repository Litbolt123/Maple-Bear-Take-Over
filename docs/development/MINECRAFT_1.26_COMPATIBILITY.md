# Minecraft 1.26 Compatibility Analysis

**Source:** [Minecraft 26.0 Bedrock Changelog](https://www.minecraft.net/en-us/article/minecraft-26-0-bedrock-changelog)

*Analysis for Maple Bear Take Over addon — Feb 12, 2025*

---

## Summary

Minecraft 1.26 introduces stricter entity JSON parsing, a `minecraft:breedable` split into `minecraft:offspring_data`, deprecated `look_at` fields, and several other technical changes. **Infected Cow** and **Infected Pig** have been migrated to the new breeding format. `min_engine_version` updated to `[26, 0, 0]`. Most other entities use valid schemas but should be tested in-game. Several new beta APIs and features offer cool expansion opportunities.

---

## 🔧 Fixes & Adjustments Required

### 1. **Infected Cow & Pig: breedable / offspring_data**

The `minecraft:breedable` component has been split in 1.26:

| Old (breedable) | New Location |
|-----------------|--------------|
| `breeds_with`, `property_inheritance`, `blend_attributes`, etc. | `minecraft:offspring_data` |
| `breed_items`, `require_tame`, pregnancy logic | `minecraft:breedable` (keeps behavior-only) |

**Status:** `minecraft:offspring_data` is **not present in the schema** for current 1.26 builds—causes "component not present in Schema" warnings and pack load failures. Reverted to legacy format: `breeds_with` and `property_inheritance` kept inside `minecraft:breedable`. Both infected_cow and infected_pig use this format. When Mojang adds offspring_data to the schema, migrate to the split format.

Current structure (both entities):
```json
"minecraft:breedable": {
  "require_tame": false,
  "breed_items": "mb:snow",
  "breeds_with": {"mate_type": "...", "baby_type": "..."},
  "property_inheritance": {}
}
```

---

### 2. **AI Goal Schema Stricter (1.26+)** ✅ AUDITED

These goals now **fail to load** if they have invalid data:
- `minecraft:behavior.nearest_attackable_target` — used by addon
- `minecraft:behavior.melee_attack` — used by addon
- `minecraft:behavior.melee_box_attack`, `defend_village_target`, `move_towards_home_restriction`, `move_towards_dwelling_restriction`, `timer_flag_1/2/3`, `stomp_attack`, `delayed_attack`, `dragonchargeplayer`, `dragonstrafeplayer` — **not used** by addon

**Addon audit results:**
- **nearest_attackable_target:** All entities use standard fields (priority, reselect_targets, entity_types with filters/max_dist, must_see, set_persistent, target_search_height, target_invisible_multiplier, must_see_forget_duration, within_radius, target_sneak_visibility_multiplier). No `attack_interval` or deprecated fields.
- **melee_attack:** All entities use standard fields (priority, speed_multiplier, track_target, reach_multiplier, y_max_head_rotation). Torpedo omits `y_max_head_rotation` (optional for flying mobs).
- **buff_mb** uses `must_reach: false` in nearest_attackable_target — valid optional field.

**Affected entities:** infected (×4), infected_cow, infected_pig, mb (×5), mining_mb (×2), flying_mb (×3), torpedo_mb (×2), buff_mb (×3).

**Status:** Usage matches vanilla/documentation patterns. Schemas are stricter but exact invalid-field list is not published. **Recommended:** Test in 1.26; if entities fail to load, check ContentLog for the specific error.

---

### 3. **look_at_* Behavior: Deprecated Fields**

Deprecated:
- `min_look_time` / `max_look_time` → replaced by `look_time` (auto-upgraded)

Not auto-upgraded (was never passed correctly):
- `target_distance` — if used, replace with the correct field.

**Addon status:** ✅ No usage of `min_look_time`, `max_look_time`, or `target_distance` found. Safe.

---

### 4. **on_equip / on_unequip Fix**

`on_equip` and `on_unequip` on `minecraft:equippable` **only fire on player interaction**, not on world load.

**Affected:** Infected bears (and others) with `on_equip` for armor.

**Impact:** If any logic relied on equip events firing when entities load with pre-equipped items, it will no longer run. Review `equip_armor` and similar events; likely fine since your use case is player interaction.

---

### 5. **Block Geometry: full_block Change**

`minecraft:geometry.full_block` now rotates the DOWN face 180° (Java parity). Format version &lt; 1.26.0 keeps old behavior; format 1.26.0+ uses new rotation.

**Affected:** `mb:snow_layer` uses `geometry.'snow'_layer` (custom geometry), not `full_block`. ✅ No change needed.

---

### 6. **Manifest min_engine_version** ✅ DONE

**Was:** `[1, 21, 101]`  
**Updated:** `[26, 0, 0]` in both BP and RP manifests (new year-based versioning).

---

## ✅ Good News (No Action)

- **Storage items in armor/hand:** Vanilla fix—equipping items with storage in armor/hand no longer deletes contents. Helps any journal/item with storage.
- **Items flow in water again:** Fixed.
- **Nether Portals + lava:** Fixed.
- **Mob Effects update logic:** More aligned with Java.
- **Hand swing on interactions:** Many interactions now correctly swing the player hand (e.g., milking, shearing, name tags, feeding, bucketing).

---

## 🌟 New Features & Ideas

### Script API (Beta)

| Feature | Idea for Maple Bear |
|--------|----------------------|
| `WorldBeforeEvents.entityItemPickup` / `WorldAfterEvents.entityItemPickup` | Track when players pick up cure items (Golden Apple, Golden Carrot); update codex, infection hints, or analytics. |
| `World.seed` (beta) | Procedural storm placement, spawn variation, or world-specific behavior. |
| Blocks handling `entity execute_event_on_home_block` | Custom blocks that react when entities are nearby (e.g., infected-detection block). |

---

### Command Macros (Creator)

- 10 remappable keys (Alt + key) for custom commands.
- **Idea:** Quick dev commands (summon storm, toggle debug, teleport to storm center) without typing.

---

### Camera

- **Camera splines** (`camera/splines/`): Cinematic paths for the free camera preset.
- **Idea:** Storm arrival, buff bear spawn, or major infection progression cinematics.
- `CameraAttachOptions` / `attachToEntity`: Third-person camera attached to an entity.
- **Idea:** “Ride along” view when following a bear or during special events.

---

### Biomes

New tags: `surface_mineshaft`, `high_seas`, `fast_fishing`, `swamp_water_huge_mushroom`, `slime`.

- **Idea:** Add `slime` to infected biome for higher slime spawns as an optional threat.
- `Biome Replacement` enabled in Nether—could support infected nether content later.

---

### Vibrant Visuals

- Per–time-of-day sky light, ambient light, ambient color in config.
- **Idea:** Storm/infected biomes with distinct day/night lighting (e.g., dimmer days, eerie nights).

---

### Collision Box

- Max height 16 → 24.
- Array of collision boxes supported.

**Idea:** More accurate hitboxes for complex bear models.

---

### Molang (Beta)

- `query.get_level_seed_based_fraction` (Upcoming Creator Features toggle).
- **Idea:** Per-world variation in animations, particle intensity, or visual effects.

---

### Entity Improvements (Vanilla)

- Nautilus movement improved (less relevant).
- Baby zombie horses can no longer grow into adults (matches Java).
- Zombie Horses, Skeleton Horses, Camel Husks no longer panic when hit.
- More mobs can form Chicken Jockeys (including Zombified Piglin, Zombie Villager, Wolf, etc.).
- Staring-at-target duration reduced.
- Wolf, Turtle, Frog, etc. look-at distance fixed.

**Idea:** If you add any vanilla mounts or zombie-like variants, these changes may affect behavior.

---

### Experimental

- **Name Tags craftable** (paper + metal nugget).
- **Baby mob redesigns** (Cow, Mooshroom, Wolf, Rabbit, Cat, Chicken).
- Baby Pigs, Cats, Wolves: unique sounds.

---

## Checklist

- [x] Revert to legacy breedable format (offspring_data not in schema)
- [x] Infected pig has breeding (pig + pig, mb:snow) using legacy format
- [x] Update `min_engine_version` to `[26, 0, 0]` (BP and RP manifests)
- [x] Fix snow_layer block: display_name changed from `"\"Snow\" layer"` to `{"value":"Snow layer"}` (1.26 "Block name is missing in block descriptor" error)
- [ ] Validate all entity JSONs in 1.26 (run world and check for load errors)
- [ ] Test infected cow/pig breeding in 1.26
- [ ] Consider EntityItemPickup events for cure-item tracking
- [ ] Optional: Command macros for dev tools
- [ ] Optional: Camera splines for storm/boss moments
- [ ] Optional: Biome tags for infected biomes
- [ ] Optional: `World.seed` for procedural content
