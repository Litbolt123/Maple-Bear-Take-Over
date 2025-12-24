# Mining AI Test Scenarios

**Created**: 2025-12-21  
**Last Updated**: 2025-12-21  
**Purpose**: Comprehensive test scenarios for mining bear AI behavior

## Recent Updates

This test suite has been updated to include tests for:

- **Spiral Stairs (Downward)**: Bears can now create spiral staircases when descending to targets below (Scenario 17)
- **Ramp Prioritization**: Bears prioritize creating ramps over straight-down mining (Scenario 16)
- **Target Coordination**: Bears can attack visible targets even if not actively targeting, but only mine when registered (Scenarios 18, 19)
- **Line of Sight Joining**: Bears with clear line of sight can join the targeting system dynamically (Scenario 19)
- **Enhanced Spectator Mode**: Multiple checkpoints ensure bears completely ignore spectator/creative players (Scenarios 8, 21)
- **Block Prioritization**: Bears prioritize breaking blocks in front when target is at different Y level (Scenario 20)

## How to Enable Debug Logging

1. Open your Journal (Codex) in-game
2. Navigate to Debug Menu
3. Select "Mining AI Debug"
4. Enable relevant debug flags:
   - **pitfall**: Pitfall creation logic
   - **general**: General mining decisions
   - **target**: Target detection and selection
   - **pathfinding**: Pathfinding and walking logic
   - **vertical**: Vertical mining (stairs, ramps)
   - **mining**: Mining actions and block breaking
   - **movement**: Movement impulses and stuck detection
   - **stairCreation**: Stair/ramp creation details
   - **all**: Enable all debug flags

## Test Scenarios

### Scenario 1: Same-Level Target Attack
**Setup**: 
- Spawn a mining bear
- Stand directly next to it (within 3 blocks horizontally, same Y level or ±1 block)

**Expected Behavior**:
- Bear should attack immediately without mining
- No "jumping in circles" behavior
- Should see: `canActuallyAttack=true` in logs

**Debug Flags**: `general`, `target`, `movement`

**What to Check**:
- [ ] Bear attacks without mining
- [ ] No movement impulses applied when attacking
- [ ] Logs show early return when `canActuallyAttack=true`

---

### Scenario 2: Target Behind Wall
**Setup**:
- Spawn a mining bear
- Stand 2-3 blocks away with a solid wall (2+ blocks thick) between you and the bear

**Expected Behavior**:
- Bear should break the wall first
- Should NOT try to attack through the wall
- After wall is broken, bear should attack

**Debug Flags**: `general`, `mining`, `target`

**What to Check**:
- [ ] Bear breaks wall blocks before attempting attack
- [ ] `hasLineOfSight=false` when wall is present
- [ ] `hasLineOfSight=true` after wall is broken
- [ ] Bear attacks after wall is cleared

---

### Scenario 3: Target Above (3-5 blocks) - Pitfall Strategy
**Setup**:
- Spawn a mining bear
- Stand 4 blocks above the bear, within 6 blocks horizontally
- Ensure there are breakable blocks under your feet

**Expected Behavior**:
- Bear should use **pitfall strategy** (score 10)
- Should break blocks directly under the target
- Should see: `strategy=pitfall` in logs

**Debug Flags**: `pitfall`, `general`, `mining`

**What to Check**:
- [ ] Strategy is `pitfall` (not `hybrid_pitfall` or `direct`)
- [ ] Bear breaks blocks under target
- [ ] Logs show: `Calling breakBlocksUnderTarget`
- [ ] Target falls down when blocks are broken

---

### Scenario 4: Target Above (4+ blocks) - Spiral Staircase (Upward)
**Setup**:
- Spawn a mining bear on flat terrain
- Stand 5-7 blocks above the bear, within 4-6 blocks horizontally
- Ensure terrain is suitable (breakable blocks, not too many unbreakable blocks)

**Expected Behavior**:
- Bear should check if spiral stair is viable
- Should use **spiral stair strategy** if terrain is suitable
- Should fall back to regular stairs if terrain is not suitable

**Debug Flags**: `stairCreation`, `vertical`, `general`

**What to Check**:
- [ ] `isSpiralStairViable()` returns true/false appropriately (goingDown=false)
- [ ] Bear creates upward spiral staircase when viable
- [ ] Bear uses regular stairs when spiral is not viable
- [ ] No getting stuck in loops (`cleared=0/4` repeatedly)
- [ ] Spiral stairs go upward correctly

---

### Scenario 5: Target Above (4+ blocks) - Hillside/Unsuitable Terrain
**Setup**:
- Spawn a mining bear on a hillside with many unbreakable blocks (bedrock, obsidian)
- Stand 5-7 blocks above the bear

**Expected Behavior**:
- Bear should detect that spiral stair is NOT viable
- Should fall back to regular stairs
- Should NOT attempt spiral stair and get stuck

**Debug Flags**: `stairCreation`, `vertical`, `general`

**What to Check**:
- [ ] `isSpiralStairViable()` returns `false`
- [ ] Bear uses regular stairs instead
- [ ] No repeated `cleared=0/4` errors
- [ ] Bear makes progress upward

---

### Scenario 6: Bear Stuck on Edge
**Setup**:
- Spawn a mining bear on a narrow edge (1-block wide platform)
- Stand a few blocks away horizontally, same or slightly higher Y level
- No blocking blocks directly ahead, but bear can't walk forward

**Expected Behavior**:
- Bear should detect it's stuck on an edge
- Should apply stronger movement impulse (0.04) toward target
- Should apply small upward impulse (0.01)
- Should move off the edge

**Debug Flags**: `movement`, `pathfinding`, `general`

**What to Check**:
- [ ] Bear detects edge situation (`!canReachByWalking && !hasBlockingBlock`)
- [ ] Stronger movement impulse applied
- [ ] Bear successfully moves off edge
- [ ] Bear continues pursuing target

---

### Scenario 7: Target Villager
**Setup**:
- Spawn a mining bear
- Spawn a villager nearby (within detection range)

**Expected Behavior**:
- Bear should detect and target the villager
- Bear should pursue and attack the villager

**Debug Flags**: `target`, `general`

**What to Check**:
- [ ] Bear detects villager as target
- [ ] `targetType=minecraft:villager` in logs
- [ ] Bear pursues villager
- [ ] Bear attacks villager when close enough

---

### Scenario 8: Player in Creative/Spectator Mode
**Setup**:
- Spawn a mining bear
- Switch to creative or spectator mode
- Stand near the bear (even if already targeting you)

**Expected Behavior**:
- Bear should NOT target you
- Bear should ignore you completely
- If already targeting, bear should drop target immediately when you switch modes
- Check happens at multiple points: `findNearestTarget`, `getStoredTargetInfo`, `processContext` start, and before creating context

**Debug Flags**: `target`, `general`

**What to Check**:
- [ ] Bear does not target player in creative mode
- [ ] Bear does not target player in spectator mode
- [ ] If targeting, bear drops target immediately when mode switches
- [ ] Logs show game mode check skipping player at multiple points
- [ ] Early return in `processContext` when target is in spectator/creative mode

---

### Scenario 9: Walking Through Non-Solid Blocks
**Setup**:
- Spawn a mining bear
- Place non-solid blocks (grass, tall grass, water, etc.) between you and the bear
- Stand within walking distance

**Expected Behavior**:
- Bear should walk through non-solid blocks
- Should NOT mine them unnecessarily
- Should only mine if truly blocked by solid blocks

**Debug Flags**: `pathfinding`, `mining`, `general`

**What to Check**:
- [ ] Bear walks through grass/tall grass
- [ ] Bear walks through water (if possible)
- [ ] Bear does NOT mine non-solid blocks
- [ ] `canReachByWalking=true` for non-solid obstacles

---

### Scenario 10: Jumping Over Single Block
**Setup**:
- Spawn a mining bear
- Place a single solid block between you and the bear
- Stand 2-3 blocks away horizontally

**Expected Behavior**:
- Bear should jump over the single block
- Should NOT mine it unnecessarily
- Should only mine if it's a 2+ block wall

**Debug Flags**: `pathfinding`, `movement`, `mining`

**What to Check**:
- [ ] Bear jumps over single block obstacle
- [ ] Bear does NOT mine single block
- [ ] Bear mines 2+ block walls
- [ ] Pathfinding detects jumpable obstacles

---

### Scenario 11: Adaptive Strategy Selection (Upward)
**Setup**:
- Test multiple scenarios with different target positions above bear
- Monitor strategy selection

**Expected Behavior**:
- Bear should choose best strategy based on context:
  - **Pitfall** (score 10): Target 3-5 blocks above, close horizontally
  - **Regular Stair** (score 5-7): Default for moderate climbs (higher score for higher targets)
  - **Spiral Stair** (score 3): Target 4+ blocks above, viable terrain

**Debug Flags**: `general`, `mining`

**What to Check**:
- [ ] Strategy scores calculated correctly
- [ ] Highest scoring strategy chosen
- [ ] Strategy adapts to terrain and target position
- [ ] Logs show strategy selection reasoning

---

### Scenario 11b: Adaptive Descending Strategy Selection
**Setup**:
- Test multiple scenarios with different target positions below bear
- Monitor descending strategy selection

**Expected Behavior**:
- Bear should choose best descending strategy based on context:
  - **Spiral Stair** (score 6): Deep descents (4+ blocks below), close horizontally, viable terrain
  - **Regular Ramp** (score 2-4): Moderate/shallow descents (2-4 blocks below)
  - **Straight-Down Mining**: Only when target is very close (within 1 block below)

**Debug Flags**: `general`, `mining`, `vertical`

**What to Check**:
- [ ] Descending strategy scores calculated correctly
- [ ] Spiral stairs chosen for deep descents when viable
- [ ] Regular ramps chosen for moderate descents
- [ ] Straight-down mining only for very close targets
- [ ] Logs show: `Chosen descending action: SPIRAL_STAIR` or `RAMP`

---

### Scenario 12: Bear Walking vs Mining Priority
**Setup**:
- Spawn a mining bear
- Stand on a slope that the bear can climb
- Ensure there's a walkable path (not completely blocked)

**Expected Behavior**:
- Bear should prioritize walking/climbing
- Should only mine when truly blocked
- Should NOT mine unnecessarily when it can walk

**Debug Flags**: `pathfinding`, `mining`, `general`

**What to Check**:
- [ ] `canReachByWalking=true` when path is walkable
- [ ] Bear walks instead of mining
- [ ] Bear only mines when `hasBlockingBlock=true`
- [ ] Mining decision: `canReachByWalking=true` → no mining

---

### Scenario 13: Protected Stair Breaking When Stuck
**Setup**:
- Spawn a mining bear
- Let bear create stairs/ramps
- Position bear so it gets stuck on its own stairs
- Ensure target is below or moved away

**Expected Behavior**:
- Bear should be able to break protected stairs when stuck
- Should see: `stuckTicks >= 2` allowing stair break
- Bear should not get stuck in loops

**Debug Flags**: `pitfall`, `mining`, `general`

**What to Check**:
- [ ] Bear detects it's stuck (`stuckTicks >= 2`)
- [ ] Bear breaks protected stairs when stuck
- [ ] Logs show: `Allowing stair break - entity is stuck`
- [ ] Bear does not get stuck in infinite loops

---

### Scenario 14: High Target (8+ blocks above)
**Setup**:
- Spawn a mining bear
- Stand 8+ blocks above the bear

**Expected Behavior**:
- Bear should NOT call `breakBlocksUnderTarget` (only for 3-5 block range)
- Bear should use stairs to climb up
- Should see: `NOT calling breakBlocksUnderTarget` in logs

**Debug Flags**: `pitfall`, `vertical`, `general`

**What to Check**:
- [ ] `breakBlocksUnderTarget` NOT called for high targets
- [ ] Bear uses stairs instead
- [ ] Logs show: `NOT calling breakBlocksUnderTarget (dy > 5)`
- [ ] Bear climbs using stairs

---

### Scenario 15: Multiple Bears Coordination (Targeting System)
**Setup**:
- Spawn multiple mining bears (3+ bears)
- Have them target the same player
- Observe leader/follower behavior and targeting system limits

**Expected Behavior**:
- Only 2 bears can actively target the same target (MAX_BEARS_PER_TARGET = 2)
- One bear should be leader (with target, can mine)
- One bear should be follower (follows leader, doesn't mine)
- Extra bears should find different targets or wait
- Bears should not interfere with each other's mining

**Debug Flags**: `general`, `target`

**What to Check**:
- [ ] Only 2 bears actively targeting same target
- [ ] Leader has `role=leader` and `hasTarget=true` and `isActivelyTargeting=true`
- [ ] Follower has `role=follower` and follows leader
- [ ] Extra bears see "Target is full" message
- [ ] Bears coordinate without conflicts
- [ ] Mining actions don't interfere with each other

---

### Scenario 16: Target Below - Ramp vs Straight-Down Mining
**Setup**:
- Spawn a mining bear on a platform
- Stand 3-5 blocks below the bear
- Ensure there are breakable blocks below

**Expected Behavior**:
- Bear should prioritize creating **ramps** (`carveRampDown`) over mining straight down
- Straight-down mining (`clearVerticalColumn`) should only be used when target is very close (within 1 block below)
- Bear should create walkable ramps for natural descent

**Debug Flags**: `vertical`, `mining`, `general`

**What to Check**:
- [ ] Bear creates ramps when target is 2+ blocks below
- [ ] Bear does NOT mine straight down when target is far below
- [ ] Logs show: `Calling carveRampDown` (not `clearVerticalColumn`)
- [ ] Ramps are walkable and allow natural descent
- [ ] Straight-down mining only when target is within 1 block below

---

### Scenario 17: Target Below - Spiral Staircase (Downward)
**Setup**:
- Spawn a mining bear on a platform
- Stand 5-7 blocks below the bear, within 12 blocks horizontally
- Ensure terrain is suitable for spiral stairs

**Expected Behavior**:
- Bear should check if downward spiral stair is viable
- Should use **spiral stair strategy** (score 6) for deep descents (4+ blocks)
- Should fall back to regular ramps if spiral is not viable
- Spiral stairs should go downward correctly

**Debug Flags**: `stairCreation`, `vertical`, `general`

**What to Check**:
- [ ] `isSpiralStairViable()` returns true/false appropriately (goingDown=true)
- [ ] Bear creates downward spiral staircase when viable and target is 4+ blocks below
- [ ] Bear uses regular ramps when spiral is not viable
- [ ] Spiral stairs go downward correctly (not upward)
- [ ] Logs show: `Chosen descending action: SPIRAL_STAIR` for deep descents

---

### Scenario 18: Bears Attacking Without Active Targeting
**Setup**:
- Spawn 3+ mining bears
- Have 2 bears actively targeting you (targeting system full)
- Stand near the 3rd bear so it can see you

**Expected Behavior**:
- The 3rd bear should still **attack** you like a normal hostile mob
- Bear should NOT mine (since not actively targeting)
- Native AI should handle the attack
- Bear should see target but `isActivelyTargeting=false`

**Debug Flags**: `target`, `general`, `pathfinding`

**What to Check**:
- [ ] Bear can see and attack target even when targeting system is full
- [ ] Bear does NOT mine (`isActivelyTargeting=false`)
- [ ] Logs show: `can see target but not actively targeting - letting native AI handle attack`
- [ ] Bear attacks like normal hostile mob
- [ ] Native AI handles movement and attacking

---

### Scenario 19: Bears Joining Targeting System with Line of Sight
**Setup**:
- Spawn 2 mining bears actively targeting you (targeting system full)
- Spawn a 3rd bear nearby with clear line of sight to you (0 blocks obstruction)
- Stand within 12 blocks horizontally and 8 blocks vertically of the 3rd bear

**Expected Behavior**:
- The 3rd bear should detect clear line of sight
- Bear should **join the targeting system** (if one of the first 2 bears leaves or dies)
- Once registered, bear should start mining
- Bear should see: `joined targeting system for target (clear line of sight)` in logs

**Debug Flags**: `target`, `general`, `mining`

**What to Check**:
- [ ] Bear detects clear line of sight (0 blocks obstruction)
- [ ] Bear joins targeting system when there's room
- [ ] Bear starts mining once registered (`isActivelyTargeting=true`)
- [ ] Logs show registration message
- [ ] Bear can now mine blocks to reach target

---

### Scenario 20: Prioritizing Blocks in Front When Target at Different Y Level
**Setup**:
- Spawn a mining bear
- Stand 3-4 blocks above the bear
- Place blocks directly in front of the bear (at bear's Y level)
- Place blocks at your Y level (above)

**Expected Behavior**:
- Bear should prioritize breaking blocks **directly in front** (at bear's Y level) FIRST
- Should break blocks at target's Y level AFTER clearing front blocks
- This ensures immediate progress and prevents trying to break unreachable blocks

**Debug Flags**: `mining`, `general`, `vertical`

**What to Check**:
- [ ] Bear breaks blocks in front (at bear's Y level) first
- [ ] Bear breaks blocks at target's Y level after front is clear
- [ ] No attempts to break blocks that are too far away
- [ ] Logs show priority order in `breakWallAhead`

---

### Scenario 21: Spectator Mode - Complete Ignore
**Setup**:
- Spawn a mining bear
- Switch to spectator mode
- Stand near the bear (even if already targeting you)

**Expected Behavior**:
- Bear should immediately drop target when you switch to spectator mode
- Bear should NOT target you at all in spectator mode
- Bear should ignore you completely
- Check happens at multiple points: `findNearestTarget`, `getStoredTargetInfo`, `processContext` start

**Debug Flags**: `target`, `general`

**What to Check**:
- [ ] Bear drops target immediately when switching to spectator mode
- [ ] Bear does NOT target player in spectator mode
- [ ] Logs show: `Cleared target - player in creative/spectator mode`
- [ ] Check happens at start of `processContext` (early return)
- [ ] Bear finds other targets or goes idle

---

## Testing Checklist

After running each scenario, verify:

- [ ] No errors in console (`TypeError`, `ReferenceError`, etc.)
- [ ] Bear behavior matches expected behavior
- [ ] Debug logs provide useful information
- [ ] Performance is acceptable (no lag spikes)
- [ ] Bear eventually reaches/attacks target (where applicable)
- [ ] No infinite loops or stuck behavior

## Common Issues to Watch For

1. **Jumping in circles**: Bear should stop mining when `canActuallyAttack=true`
2. **Stuck on edges**: Bear should apply movement impulse to move off edges
3. **Mining unnecessarily**: Bear should walk through non-solid blocks and jump over single blocks
4. **Spiral stair loops**: Bear should check viability before attempting spiral stairs (both up and down)
5. **Attacking through walls**: Bear should break walls before attacking
6. **Not attacking same-level targets**: Bear should attack when very close horizontally
7. **Mining straight down**: Bear should create ramps/spirals instead of mining straight down (except when target is very close)
8. **Bears not attacking**: Bears should attack visible targets even if not actively targeting (but won't mine)
9. **Targeting system full**: Extra bears should still attack but not mine until they join the system
10. **Spectator mode targeting**: Bears should completely ignore players in spectator/creative mode

## Reporting Issues

When reporting issues, include:
1. **Scenario number** and description
2. **Expected behavior** vs **actual behavior**
3. **Debug logs** (relevant sections)
4. **Screenshots/video** if possible
5. **Minecraft version** and addon version
6. **Steps to reproduce**

