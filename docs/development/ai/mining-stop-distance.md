# Mining Stop Distance - Visual Guide

## Overview
The mining Maple Bear should **stop mining** when it gets within **5-6 blocks** of the target. This prevents unnecessary mining and allows the bear to approach normally.

## Visual Aid - Side View (10 blocks wide × 5 blocks tall)

### Scenario 1: Bear is Far Away (>6 blocks) - CONTINUE MINING
```
Y+4: [X] [X] [X] [X] [X] [X] [X] [X] [X] [X]  <- Wall blocks
Y+3: [X] [X] [X] [X] [X] [X] [X] [X] [X] [X]  <- Wall blocks
Y+2: [X] [X] [X] [X] [X] [X] [X] [X] [X] [X]  <- Wall blocks
Y+1: [B] [X] [X] [X] [X] [X] [X] [X] [X] [P]  <- Wall blocks
Y+0: [B] [X] [X] [X] [X] [X] [X] [X] [X] [P]  <- Bear at position 0, Player at position 9, Wall blocks
     ^   ^   ^   ^   ^   ^   ^   ^   ^   ^
     0   1   2   3   4   5   6   7   8   9   10
     
Distance: ~9 blocks horizontal
Action: ✅ CONTINUE MINING through wall

What actually happens. It stops mining 5-6 blocks away from the player :/

Y+4: [X] [X] [X] [X] [X] [X] [X] [X] [X] [X]  <- Wall blocks
Y+3: [X] [X] [X] [X] [X] [X] [X] [X] [X] [X]  <- Wall blocks
Y+2: [X] [X] [X] [X] [X] [X] [X] [X] [X] [X]  <- Wall blocks
Y+1: [B] [ ] [ ] [ ] [X] [X] [X] [X] [X] [P]  <- Wall blocks
Y+0: [B] [ ] [ ] [ ] [X] [X] [X] [X] [X] [P]  <- Bear at position 0, Player at position 9, Wall Blocks
     ^   ^   ^   ^   ^   ^   ^   ^   ^   ^
     0   1   2   3   4   5   6   7   8   9   10

Whats supposed to happen.

     Y+4: [X] [X] [X] [X] [X] [X] [X] [X] [X] [X]  <- Wall blocks
Y+3: [X] [X] [X] [X] [X] [X] [X] [X] [X] [X]  <- Wall blocks
Y+2: [X] [X] [X] [X] [X] [X] [X] [X] [X] [X]  <- Wall blocks
Y+1: [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ] [B] [P]  <- Air
Y+0: [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ] [B] [P]  <- Bear at position 0, Player at position 9, Air
     ^   ^   ^   ^   ^   ^   ^   ^   ^   ^
     0   1   2   3   4   5   6   7   8   9   10
```

### Scenario 2: Bear is Medium Distance (6-7 blocks) - CONTINUE MINING

What actually happens. It still stops before getting to the player, even though it cannot walk to the player.
```
Y+4: [X] [X] [X] [X] [X] [X] [X] [X] [X] [X]  <- Wall blocks
Y+3: [X] [X] [X] [X] [X] [X] [X] [X] [X] [X]  <- Wall blocks
Y+2: [X] [X] [X] [X] [X] [X] [X] [X] [X] [X]  <- Wall blocks
Y+1: [B] [ ] [ ] [ ] [ ] [X] [X] [X] [X] [P]  <- Bear mined positions 1-4, Player at position 9
Y+0: [B] [ ] [ ] [ ] [ ] [X] [X] [X] [X] [P]  <- Bear at position 0, Player at position 9, Wall blocks still blocking
     ^   ^   ^   ^   ^   ^   ^   ^   ^   ^
     0   1   2   3   4   5   6   7   8   9   10
```

What's supposed to happen. Bear should mine ALL the way through the wall.
```
Y+4: [X] [X] [X] [X] [X] [X] [X] [X] [X] [X]  <- Wall blocks
Y+3: [X] [X] [X] [X] [X] [X] [X] [X] [X] [X]  <- Wall blocks
Y+2: [X] [X] [X] [X] [X] [X] [X] [X] [X] [X]  <- Wall blocks
Y+1: [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ] [B] [P]  <- Air - Bear mined all positions 0-8
Y+0: [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ] [B] [P]  <- Bear at position 8, Player at position 9, Clear path
     ^   ^   ^   ^   ^   ^   ^   ^   ^   ^
     0   1   2   3   4   5   6   7   8   9   10
```

### Scenario 3: Bear is Close (5-6 blocks) - CONTINUE MINING IF PATH BLOCKED

What actually happens. Bear stops mining even though wall still blocks the path.
```
Y+4: [X] [X] [X] [X] [X] [X] [X] [X] [X] [X]  <- Wall blocks
Y+3: [X] [X] [X] [X] [X] [X] [X] [X] [X] [X]  <- Wall blocks
Y+2: [X] [X] [X] [X] [X] [X] [X] [X] [X] [X]  <- Wall blocks
Y+1: [B] [ ] [ ] [ ] [ ] [X] [X] [X] [X] [P]  <- Bear mined positions 1-4, Player at position 9
Y+0: [B] [ ] [ ] [ ] [ ] [X] [X] [X] [X] [P]  <- Bear at position 0, Player at position 9, Wall blocks still blocking
     ^   ^   ^   ^   ^   ^   ^   ^   ^   ^
     0   1   2   3   4   5   6   7   8   9   10
```

What's supposed to happen. Bear should continue mining until path is clear.
```
Y+4: [X] [X] [X] [X] [X] [X] [X] [X] [X] [X]  <- Wall blocks
Y+3: [X] [X] [X] [X] [X] [X] [X] [X] [X] [X]  <- Wall blocks
Y+2: [X] [X] [X] [X] [X] [X] [X] [X] [X] [X]  <- Wall blocks
Y+1: [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ] [B] [P]  <- Air - Bear mined all positions 0-8
Y+0: [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ] [B] [P]  <- Bear at position 8, Player at position 9, Clear path
     ^   ^   ^   ^   ^   ^   ^   ^   ^   ^
     0   1   2   3   4   5   6   7   8   9   10
```

### Scenario 4: Bear is Very Close (<5 blocks) - STOP MINING ONLY IF PATH CLEAR

What actually happens. Bear stops mining even though wall still blocks the path.
```
Y+4: [X] [X] [X] [X] [X] [X] [X] [X] [X] [X]  <- Wall blocks
Y+3: [X] [X] [X] [X] [X] [X] [X] [X] [X] [X]  <- Wall blocks
Y+2: [X] [X] [X] [X] [X] [X] [X] [X] [X] [X]  <- Wall blocks
Y+1: [B] [ ] [ ] [ ] [ ] [ ] [X] [X] [X] [P]  <- Bear mined positions 1-5, Player at position 9
Y+0: [B] [ ] [ ] [ ] [ ] [ ] [X] [X] [X] [P]  <- Bear at position 0, Player at position 9, Wall blocks still blocking
     ^   ^   ^   ^   ^   ^   ^   ^   ^   ^
     0   1   2   3   4   5   6   7   8   9   10
```

What's supposed to happen. Bear should continue mining until path is clear.
```
Y+4: [X] [X] [X] [X] [X] [X] [X] [X] [X] [X]  <- Wall blocks
Y+3: [X] [X] [X] [X] [X] [X] [X] [X] [X] [X]  <- Wall blocks
Y+2: [X] [X] [X] [X] [X] [X] [X] [X] [X] [X]  <- Wall blocks
Y+1: [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ] [B] [P]  <- Air - Bear mined all positions 0-8
Y+0: [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ] [B] [P]  <- Bear at position 8, Player at position 9, Clear path
     ^   ^   ^   ^   ^   ^   ^   ^   ^   ^
     0   1   2   3   4   5   6   7   8   9   10
```

### Scenario 5: Bear Reached Target (<2 blocks) - STOP MINING (Path is Clear)

What actually happens. Bear stops mining (correctly, since path is clear).
```
Y+4: [X] [X] [X] [X] [X] [X] [X] [X] [X] [X]  <- Wall blocks
Y+3: [X] [X] [X] [X] [X] [X] [X] [X] [X] [X]  <- Wall blocks
Y+2: [X] [X] [X] [X] [X] [X] [X] [X] [X] [X]  <- Wall blocks
Y+1: [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ] [B] [P]  <- Air - Bear mined all positions 0-8
Y+0: [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ] [B] [P]  <- Bear at position 8, Player at position 9, Clear path
     ^   ^   ^   ^   ^   ^   ^   ^   ^   ^
     0   1   2   3   4   5   6   7   8   9   10
```

What's supposed to happen. Bear should stop mining and just walk to player (path is clear).
```
Y+4: [X] [X] [X] [X] [X] [X] [X] [X] [X] [X]  <- Wall blocks
Y+3: [X] [X] [X] [X] [X] [X] [X] [X] [X] [X]  <- Wall blocks
Y+2: [X] [X] [X] [X] [X] [X] [X] [X] [X] [X]  <- Wall blocks
Y+1: [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ] [B] [P]  <- Air - Clear path
Y+0: [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ] [B] [P]  <- Bear at position 8, Player at position 9, Clear path
     ^   ^   ^   ^   ^   ^   ^   ^   ^   ^
     0   1   2   3   4   5   6   7   8   9   10
     
Distance: ~1 block horizontal
Action: ✅ STOP MINING - Path is clear, bear should just walk to player
```

## Distance Calculation

### Horizontal Distance
- **Horizontal distance** = `Math.hypot(dx, dz)` where:
  - `dx = targetX - bearX`
  - `dz = targetZ - bearZ`

### Total Distance (3D)
- **Total distance** = `Math.hypot(dx, dy, dz)` where:
  - `dx = targetX - bearX`
  - `dy = targetY - bearY`
  - `dz = targetZ - bearZ`

## Decision Logic

**CRITICAL**: Bear should NOT stop mining based on distance alone. Bear should only stop mining if:
1. Distance is within 5-6 blocks AND
2. There is a clear path to the target (no blocks blocking)

```javascript
const horizontalDist = Math.hypot(dx, dz);
const totalDist = Math.hypot(dx, dy, dz);

// Check if there's a clear path to target
const hasClearPath = checkClearPathToTarget(bear, target);

if (horizontalDist <= 6 && hasClearPath) {
    // STOP MINING - Bear is close enough AND path is clear
    // Let bear approach normally using pathfinding/movement
    return false; // Don't mine
} else {
    // CONTINUE MINING - Either far away OR path is blocked
    // Continue mining through wall/stairs toward target
    return true; // Mine
}

function checkClearPathToTarget(bear, target) {
    // Check if there's a clear path (no solid blocks) between bear and target
    // At bear's Y level (Y+0 and Y+1 for 2-block-tall bear)
    // Return true if path is clear, false if blocked
    const bearX = Math.floor(bear.location.x);
    const bearY = Math.floor(bear.location.y);
    const bearZ = Math.floor(bear.location.z);
    const targetX = Math.floor(target.location.x);
    const targetY = Math.floor(target.location.y);
    const targetZ = Math.floor(target.location.z);
    
    const dx = targetX - bearX;
    const dz = targetZ - bearZ;
    const steps = Math.max(Math.abs(dx), Math.abs(dz));
    
    if (steps === 0) return true; // Same position
    
    const stepX = dx / steps;
    const stepZ = dz / steps;
    
    // Check each step along the path
    for (let i = 1; i < steps; i++) {
        const checkX = bearX + Math.round(stepX * i);
        const checkZ = bearZ + Math.round(stepZ * i);
        
        // Check at bear's Y level (Y+0 and Y+1)
        const block0 = getBlock(dimension, checkX, bearY, checkZ);
        const block1 = getBlock(dimension, checkX, bearY + 1, checkZ);
        
        // If any block is solid and blocking, path is not clear
        if (isSolidBlock(block0) || isSolidBlock(block1)) {
            return false; // Path is blocked
        }
    }
    
    return true; // Path is clear
}
```

## Questions to Clarify

1. **Which distance should we use?**
   - Horizontal distance only (ignores Y difference)?
   - Total 3D distance (includes Y difference)?

2. **What should happen when bear stops mining?**
   - Bear should just walk/approach normally?
   - Bear should still try to pathfind upward if target is above?
   - Bear should stop all mining behavior entirely?

3. **Should there be a "buffer zone"?**
   - Stop mining at 6 blocks?
   - Stop mining at 5 blocks?
   - Gradual reduction between 6-5 blocks?

4. **What if target moves away?**
   - Resume mining if distance increases above 6 blocks?
   - Or stay stopped once stopped?

## Expected Behavior

When bear gets within 5-6 blocks:
- ✅ **IF path is clear**: Stop calling `carveStair()` and stop mining blocks
- ✅ **IF path is blocked**: Continue mining until path is clear (even if within 5-6 blocks)
- ✅ Use normal pathfinding/movement to approach when path is clear
- ✅ Still respond to target movement
- ✅ Resume mining if target moves away (>6 blocks) OR if path becomes blocked again

## Implementation Notes

- Check distance **AND path clearance** before calling `carveStair()`
- Check in `processContext()` or main mining logic
- Use horizontal distance (since stairs are for vertical traversal)
- **CRITICAL**: Only stop mining if BOTH conditions are true:
  1. Distance <= 6 blocks
  2. Clear path exists (no solid blocks blocking at bear's Y level)
- If path is blocked, continue mining regardless of distance
- Consider target movement - if target moves away, resume mining
