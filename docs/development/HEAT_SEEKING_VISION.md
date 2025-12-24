# Heat-Seeking Vision System Documentation

This document explains how the heat-seeking vision system works for Torpedo Bears and Mining Bears.

## Overview

Both Torpedo Bears and Mining Bears use a "heat-seeking" vision system that allows them to detect and target entities through a limited number of blocks. This creates more dynamic and challenging encounters, as players cannot simply hide behind walls.

---

## Torpedo Bear Heat-Seeking Vision

### Implementation Location
- **File**: `BP/scripts/mb_torpedoAI.js`
- **Function**: `canSeeTargetThroughBlocks()` (line ~616)
- **Usage**: Called in `findTarget()` function (line ~287)

### How It Works

1. **Target Detection**:
   - Torpedo bears scan for players and mobs within their detection radius
   - Prioritizes players over mobs
   - Can target entities at any Y level (they dive down to attack)

2. **Heat-Seeking Check**:
   - For each potential target, the bear checks if it can "see" the target through blocks
   - Uses `canSeeTargetThroughBlocks(entity, targetInfo, 3)` function
   - **Maximum blocks that can be seen through: 3 blocks**

3. **Raycast Algorithm**:
   ```javascript
   // Steps from entity location to target location
   // Counts solid blocks in the path
   // Returns true if 3 or fewer blocks block the path
   ```

4. **Block Breaking Behavior**:
   - If target is **visible** (3 or fewer blocks): Bear can see and dive towards target
   - If target is **not visible** (more than 3 blocks): Bear breaks blocks to reach target
   - After breaking `SEE_THROUGH_BREAK_COUNT` blocks, bear enters "backoff mode"
   - Backoff mode: Bear backs away slightly before continuing pursuit

5. **Unbreakable Blocks**:
   - If an unbreakable block (bedrock, barrier, etc.) is in the path, vision is **completely blocked**
   - Bear cannot see through unbreakable blocks at all

### Key Constants
- **Max blocks to see through**: 3 blocks
- **Break count before backoff**: `SEE_THROUGH_BREAK_COUNT` (likely 3-5 blocks)
- **Backoff duration**: `SEE_THROUGH_BACKOFF_TICKS` (likely 20-40 ticks)

---

## Mining Bear Heat-Seeking Vision

### Implementation Location
- **File**: `BP/scripts/mb_miningAI.js`
- **Function**: `canSeeBlock()` (line ~301)
- **Usage**: Used when determining which blocks to mine and when detecting targets

### How It Works

1. **Block Visibility Check**:
   - Mining bears use `canSeeBlock()` to determine if they can "see" a block to mine
   - More permissive than torpedo bears for pitfall creation

2. **Heat-Seeking Parameters**:
   - **Standard blocks**: Can see through up to **5 breakable blocks**
   - **Blocks under target** (pitfall creation): Can see through up to **8 breakable blocks**
   - Uses raycast from entity eye position (1.5 blocks above feet) to block center

3. **Raycast Algorithm**:
   ```javascript
   // Raycast from entity eye position to block center
   // Counts solid breakable blocks in the path
   // Returns true if within max block limit
   ```

4. **Special Cases**:
   - **Pitfall Creation**: When mining blocks directly under a target, bears are more permissive (8 blocks vs 5)
   - **Unbreakable Blocks**: Completely block vision (bedrock, barrier, etc.)
   - **Liquid Blocks**: Not counted as vision blockers

5. **Target Detection**:
   - Mining bears also use heat-seeking to detect players/mobs through walls
   - Allows them to dig towards targets even when not directly visible
   - Helps with pathfinding and strategic positioning

### Key Constants
- **Max blocks to see through (standard)**: 5 blocks
- **Max blocks to see through (under target)**: 8 blocks
- **Player reach distance**: 6 blocks
- **Target scan radius**: 32 blocks

---

## Comparison: Torpedo vs Mining

| Feature | Torpedo Bear | Mining Bear |
|---------|-------------|-------------|
| **Max blocks through** | 3 blocks | 5 blocks (standard), 8 blocks (under target) |
| **Primary use** | Target detection for diving | Block visibility for mining |
| **Backoff behavior** | Yes (after breaking blocks) | No (continuous mining) |
| **Y-level restriction** | None (can dive from sky) | Ground-based |
| **Unbreakable blocks** | Complete blocker | Complete blocker |

---

## Technical Details

### Raycast Implementation

Both systems use similar raycast algorithms:

1. **Calculate path**: From entity location to target/block location
2. **Step through path**: Sample at regular intervals (0.5-1 block steps)
3. **Count blocks**: Track solid, breakable blocks in the path
4. **Check limit**: Return true if block count ≤ max allowed
5. **Unbreakable check**: Immediately return false if unbreakable block found

### Performance Optimizations

- **Adaptive step size**: Fewer steps for longer distances
- **Early exit**: Stop checking if unbreakable block found
- **Caching**: Target lookups may be cached (mining AI uses `TARGET_CACHE_TICKS`)

### Block Types

- **Air blocks**: Not counted (cave_air, void_air, air)
- **Liquid blocks**: Not counted as vision blockers
- **Breakable blocks**: Counted towards max block limit
- **Unbreakable blocks**: Complete vision blocker (bedrock, barrier, command blocks, etc.)

---

## Gameplay Implications

1. **No True Hiding**: Players cannot completely hide behind thin walls (3-5 blocks)
2. **Strategic Positioning**: Thicker walls (6+ blocks) provide better protection
3. **Underground Safety**: Deep underground bases are safer (more blocks = harder to detect)
4. **Dynamic Encounters**: Bears can pursue players through walls, creating more engaging gameplay
5. **Pitfall Creation**: Mining bears can see blocks under players better, enabling strategic pitfall attacks

---

## Future Improvements

Potential enhancements to consider:
- Variable vision range based on bear variant/day
- Weather effects on vision (fog reduces range)
- Player armor/effects that reduce detection range
- Sound-based detection as alternative to vision
- Vision cooldown after breaking many blocks (temporary "blindness")

