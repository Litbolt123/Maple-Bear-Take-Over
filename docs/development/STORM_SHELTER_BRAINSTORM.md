# Storm Shelter System — Brainstorm

**Goal**: Only players with a clear path from the storm (sky) to them should be affected by storm infection. Players in caves, houses, or underground bunkers should be safe.

---

## Current Behavior

- Storm adds players to `playersInStorm` when within horizontal radius of storm center
- Any player in `playersInStorm` gets storm exposure (infection timer increase), blindness, nausea, ambience
- No shelter check — being under a roof or underground does nothing

---

## Desired Behavior

| Scenario | Should Be Affected? |
|----------|---------------------|
| Player in open field during storm | Yes |
| Player in cave (underground) | No — storm howls above, dust doesn't reach |
| Player in house with solid roof | No |
| Player in house with glass window | No while glass intact; yes if storm breaks glass and hole allows dust in |
| Player digs 3 blocks down, places block above head | No — simple bunker works |
| Player under a single block (e.g. tree, overhang) | Debatable — partial shelter? |

---

## Implementation Options

### Option A: Upward Raycast (Simple)

**Logic**: Raycast from player's head upward. If a solid block is found within N blocks (e.g. 64), the player is sheltered.

**API**: `dimension.getBlockFromRay(location, direction, options)` or `dimension.getBlockAbove(location, options)`

- `getBlockAbove` — "Gets the first block found above a given block location" (default: first solid block). Returns block or undefined.
- If block returned → sheltered
- If undefined (no solid block above within maxDistance) → exposed

**Pros**: Simple, fast, covers cave + house + 3-block hole  
**Cons**: Single column — player under 1-block overhang might be "sheltered" even if dust could blow in from the side. Arguably acceptable.

### Option B: Multi-Ray Sample

**Logic**: Raycast upward from player head + maybe a few offset points (e.g. corners of hitbox). Sheltered only if ALL rays hit solid blocks.

**Pros**: More realistic — side openings would expose player  
**Cons**: More expensive, might be too strict (small gap = fully exposed)

### Option C: Sky Light Level

**Logic**: Use `dimension.getSkyLightLevel(location)`. If sky light is 0 (or very low), player is underground/covered.

**Pros**: Built-in, might be cheap  
**Cons**: Sky light can be 0 at night even in open field; doesn't distinguish storm from night. Probably unsuitable.

### Option D: Hybrid — Raycast + Glass Tracking

**Logic**:
1. Upward raycast as in Option A
2. If ray hits **glass** — count as shelter (intact glass blocks dust)
3. Storm already has `STORM_DESTRUCT_GLASS_CHANCE` — when storm breaks glass, that block becomes air
4. Next raycast would see air (or next block above) — so broken glass = hole = no shelter at that column

**No extra tracking needed** — we just raycast each check. If glass is there, it blocks; if storm broke it, it's air now.

---

## Recommended Approach: Option A (Upward Raycast)

**Function**: `isPlayerShelteredFromStorm(player)` in `mb_snowStorm.js`

```js
// Pseudocode
function isPlayerShelteredFromStorm(player) {
    const dim = player.dimension;
    const loc = player.location;
    const headY = { x: Math.floor(loc.x), y: Math.floor(loc.y) + 1, z: Math.floor(loc.z) };
    const blockAbove = dim.getBlockFromRay(headY, { x: 0, y: 1, z: 0 }, {
        maxDistance: 64,
        includeLiquidBlocks: true,
        includePassableBlocks: false  // vines, flowers, etc. don't block
    });
    return blockAbove !== undefined;  // Solid block above = sheltered
}
```

**Glass**: Glass blocks are solid — they will stop the ray. So intact glass = sheltered. When storm breaks glass, that position becomes air; ray goes through to next block or sky. So broken glass naturally = exposed (if that was the only thing above).

**Passable blocks**: `includePassableBlocks: false` — vines, flowers, tall grass shouldn't count as shelter. Leaves — need to check. If leaves block the ray with default options, they might count as shelter. That could be desirable (under a tree = partial shelter) or not. Can tune later.

---

## Integration Point

**Current flow** (main.js ~5443):

```js
const inStorm = isPlayerInStorm(player.id);
if (inStorm) {
    state.stormSeconds += ...
}
```

**New flow**:

```js
const inStorm = isPlayerInStorm(player.id);
const sheltered = inStorm ? isPlayerShelteredFromStorm(player) : false;
if (inStorm && !sheltered) {
    state.stormSeconds += ...
}
```

**Other storm effects**: Blindness, nausea, ambience — should these also respect shelter? Options:
- **A**: Only infection respects shelter; blindness/nausea/ambience still apply (you "experience" the storm but don't get infected)
- **B**: All effects respect shelter (fully safe when sheltered)

Recommendation: **B** — if you're in a cave, you shouldn't get blindness or nausea either. The storm is above; you're safe.

That means the change belongs in `mb_snowStorm.js` where `playersInStorm` is populated — don't add sheltered players to the set used for infection, OR add a separate `playersExposedToStorm` that excludes sheltered. Cleanest: when iterating players, only add to `playersInStorm` (or a new "exposed" set) if `!isPlayerShelteredFromStorm(player)`.

---

## Edge Cases

1. **Slabs / stairs**: Block top half — ray might pass through bottom half. API behavior TBD. If they count as solid, good; if not, players under slab might be exposed. Test in-game.
2. **Leaves**: Block rain in vanilla. Should block dust? Probably yes.
3. **Trapdoors / doors**: When closed, likely solid. When open, ray might pass through. Acceptable.
4. **Fence / wall**: Partial block — ray might pass through gaps. Could be "partial shelter" — reduce exposure? Keep simple for v1: solid block = sheltered.
5. **Water**: `includeLiquidBlocks: true` — water above would count as shelter. Makes sense (underwater = no dust).
6. **Lava**: Same — technically sheltered. Niche case.

---

## Performance

- Raycast per player in storm radius, once per tick (or every N ticks). Storm loop runs every 100 ticks. Players in storm might be 0–10 typically.
- `getBlockFromRay` / `getBlockAbove` is a single ray — very cheap. Acceptable.

---

## Summary

| Item | Decision |
|------|----------|
| Core mechanic | Upward raycast from player head |
| Sheltered if | Any solid block within 64 blocks above |
| Glass | Counts as shelter when intact; when storm breaks it, air = exposed |
| Passable blocks | Don't block (vines, flowers, etc.) |
| Integration | Only treat as "in storm" for exposure/blindness/nausea when NOT sheltered |
| Performance | One ray per player in storm radius — acceptable |

---

## Storm Flow & Obstacle Avoidance (New Ideas)

### Desired Behavior

1. **Storm does not occupy solid blocks** — The storm (dust, infection zone) should only exist in air. It flows *around* buildings, terrain, mountains—not through them.

2. **Storm movement around obstacles** — When the storm center drifts, it should not "go through" solid blocks. It should deflect and flow around terrain (e.g. a mountain in the path).

3. **Connected air spaces** — A 5×5 hollow cube with a hole in the side: dust blows in through the hole → inside is affected. Same cube with the hole blocked: interior is fully enclosed → inside is safe.

### Current State

- **Storm center**: A 2D point (x, z) that drifts. No obstacle check—it can drift "through" mountains.
- **Storm presence**: 2D disk—if you're within radius of center, you're in storm. No 3D consideration.
- **Snow/particles**: Use per-column surface (top solid block). Storm already "stays on surface" and doesn't go through ground.
- **Player check**: Pure 2D distance. No shelter, no flood-fill.

### Implementation Difficulty

| Feature | Difficulty | Notes |
|--------|------------|-------|
| **Storm center deflects around obstacles** | Medium | Before applying drift, sample the target position. If storm center would end up "inside" solid (e.g. block at surface is solid and we're below it), deflect the drift angle. Could also raycast along drift path—if we hit a wall, bounce. |
| **Storm only in air (no inside solid)** | Implicit | Snow/particles already use surface—they don't place inside mountains. The main gap is *player exposure*: we treat everyone in the 2D disk as "in storm" even if they're in a cave. That's the shelter check. |
| **Hollow cube with hole vs sealed** | Medium–Hard | Requires knowing if air at player is "connected" to storm exterior. |

### Hollow Cube: Two Approaches

**Approach 1: Multi-direction raycast (simpler)**

- Cast rays from player in 6 directions (up, down, ±x, ±y, ±z) or 26 (including diagonals).
- If **any** ray reaches `maxDistance` (e.g. 48) without hitting solid → there's an opening in that direction → player is exposed.
- If **all** rays hit solid within maxDistance → player is fully enclosed → sheltered.

**Pros**: Uses `getBlockFromRay`; no flood fill. ~6–26 rays per player.  
**Cons**: Diagonal hole in a corner might need a diagonal ray to detect; 26 rays improve that. Long corridors could "escape" after 48 blocks—acceptable.

**Approach 2: 3D flood fill (more accurate)**

- From storm perimeter (surface blocks in storm radius with sky access), flood fill through air only. Never cross solid.
- All reachable air blocks = "storm-occupied."
- Player in storm-occupied block = exposed. Player in unreachable air = sheltered.

**Pros**: Correct for any geometry.  
**Cons**: Expensive. Storm radius ~55, height 64 → ~200k blocks in cylinder. Flood fill could touch 10k–100k. In JS, that may be tens or hundreds of ms per tick—too heavy. Could limit to a smaller volume (e.g. around players) or run incrementally over multiple ticks.

### Recommendation

- **Phase 1**: Implement the upward raycast shelter (covers caves, houses, 3-block hole). Fast and simple.
- **Phase 2**: Add **multi-direction raycast** (6 or 26 directions) to handle "hole in the side of a cube." If any ray escapes = exposed. Covers the hollow-cube case without flood fill.
- **Phase 3** (optional): Add **storm center obstacle deflection** so the storm deflects when drifting into mountains. Improves feel but is not critical for shelter logic.

The multi-direction raycast is a good middle ground: no flood fill, handles lateral openings, and fits the hollow-cube mental model.

---

## Next Steps

1. Implement `isPlayerShelteredFromStorm(player)` using `getBlockFromRay` or `getBlockAbove`
2. In storm loop, only add to `playersInStorm` (or gate storm exposure) when `!isPlayerShelteredFromStorm(player)`
3. Test: cave, house, 3-block hole, glass window (before/after break)
4. Tune `maxDistance`, `includePassableBlocks`, slab/leaf behavior if needed
