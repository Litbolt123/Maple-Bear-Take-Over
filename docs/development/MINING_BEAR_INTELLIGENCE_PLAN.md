# Mining Bear Intelligence Enhancement Plan

## Goal
Make mining bears "SUPER SMART and clever" with intelligent pathfinding, strategic positioning, and exploratory behavior.

## Current Issues
1. Bears break blocks when too far away instead of moving closer first
2. No strategic positioning - they don't find optimal spots to attack from
3. Idle behavior is basic - no tunnel network creation
4. No multi-step planning - they react immediately instead of planning ahead

## Proposed Enhancements

### 1. Smart Positioning System
**Problem**: Bears break blocks when far from target instead of moving closer first.

**Solution**: 
- Add distance-based decision making:
  - **Far (>12 blocks)**: Move closer first, THEN mine if needed
  - **Medium (6-12 blocks)**: Mine while moving toward target
  - **Close (<6 blocks)**: Focus on pitfall creation or direct path breaking
- Calculate "optimal attack position" - the best spot to reach the target from
- Move toward optimal position, mining only when necessary

### 2. Strategic Path Planning
**Problem**: Bears don't plan multi-step paths.

**Solution**:
- Create a "strategy" system with different approaches:
  - **Direct Path**: Target is reachable by walking - just move
  - **Tunnel Approach**: Target is blocked - tunnel toward target
  - **Pitfall Approach**: Target is above - get close, then break blocks under
  - **Hybrid**: Combine approaches (e.g., tunnel closer, then create pitfall)
- Plan 2-3 steps ahead:
  1. "Move to position X"
  2. "Then break blocks under target"
  3. "Or tunnel through wall at Y"

### 3. Idle Exploration System
**Problem**: No tunnel network creation when idle.

**Solution**:
- When idle (no target for 5+ seconds):
  - Create exploratory tunnel networks
  - Dig tunnels (not holes) in random directions
  - Create branching paths
  - Maintain tunnel structure (proper height, no gaps)
  - Occasionally check for targets while exploring

### 4. Adaptive Mining Behavior
**Problem**: Bears use same approach regardless of situation.

**Solution**:
- Situation-based decision making:
  - **Target on bridge above**: Move directly under, then break blocks
  - **Target behind wall**: Tunnel through wall
  - **Target below**: Create stairs/ramp down
  - **Target far away**: Move closer first, then assess
- Dynamic block breaking priority:
  - Prioritize blocks that get them closer to target
  - Break "strategic" blocks (e.g., support blocks for bridges)

### 5. Enhanced Pathfinding
**Problem**: `canReachTargetByWalking` is too simple.

**Solution**:
- Calculate multiple path options
- Score paths based on:
  - Distance
  - Blockage level
  - Elevation changes needed
- Choose best path, or decide to mine if all paths are blocked

## Implementation Details

### New Functions Needed

1. **`calculateOptimalAttackPosition(entity, targetInfo)`**
   - Finds best position to attack target from
   - Considers: distance, elevation, line of sight, reachability

2. **`determineMiningStrategy(entity, targetInfo)`**
   - Returns: "direct", "tunnel", "pitfall", "hybrid"
   - Based on target position, distance, elevation

3. **`shouldMoveCloserFirst(entity, targetInfo)`**
   - Returns true if bear should move closer before mining
   - Based on distance and current path blockage

4. **`createExploratoryTunnel(entity, tick)`**
   - Creates random tunnel when idle
   - Maintains tunnel structure
   - Checks for targets periodically

5. **`planMultiStepPath(entity, targetInfo)`**
   - Creates 2-3 step plan
   - Example: ["move_to", {x, y, z}, "then", "break_under_target"]

### Modified Functions

1. **`processContext()`**
   - Add strategy determination
   - Add distance-based behavior
   - Add idle exploration check

2. **`canReachTargetByWalking()`**
   - Enhance with multiple path scoring
   - Better blockage detection

3. **`breakBlocksUnderTarget()`**
   - Only activate when in optimal position
   - Check if bear should move closer first

## Behavior Flow

### With Target (Active Hunting)
```
1. Detect target
2. Calculate distance and elevation
3. Determine strategy:
   - If far (>12 blocks): Move closer first
   - If medium (6-12): Move while mining
   - If close (<6): Focus on pitfall or direct path
4. Calculate optimal attack position
5. Execute strategy:
   - Move toward optimal position
   - Mine only when necessary
   - Break blocks under target when in position
```

### Without Target (Idle Exploration)
```
1. Check if idle for 5+ seconds
2. If yes, enter exploration mode
3. Choose random direction
4. Create tunnel in that direction
5. Maintain tunnel structure
6. Periodically check for targets
7. Continue exploring until target found
```

## Constants to Add

```javascript
const OPTIMAL_ATTACK_DISTANCE = 6; // Best distance to attack from
const MOVE_CLOSER_THRESHOLD = 12; // Move closer if farther than this
const IDLE_EXPLORATION_DELAY = 100; // Ticks before idle exploration (5 seconds)
const EXPLORATION_TUNNEL_LENGTH = 8; // How long to dig exploration tunnels
const STRATEGY_RECALCULATE_INTERVAL = 20; // Recalculate strategy every second
```

## Testing Checklist

- [ ] Bears move closer when far from target
- [ ] Bears mine strategically (not randomly)
- [ ] Pitfall creation works when in optimal position
- [ ] Idle bears create tunnel networks
- [ ] Tunnels are properly structured (not holes)
- [ ] Bears find optimal attack positions
- [ ] Multi-step planning works
- [ ] Performance is acceptable

