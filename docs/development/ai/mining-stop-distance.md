# Mining Stop Distance - Visual Guide

## Overview
The mining Maple Bear should **stop mining** when it gets within **5-6 blocks** of the target. This prevents unnecessary mining and allows the bear to approach normally.

## Visual Aid - Side View

### Scenario 1: Bear is Far Away (>6 blocks) - CONTINUE MINING
```
Target (Player)
     |
     | 10+ blocks away
     |
     [T]  <- Target at Y+5
     [ ]
     [ ]
     [ ]
     [ ]
     [ ]
     [B]  <- Bear at Y+0
     [S]  <- Mining stairs upward
     
Action: ✅ CONTINUE MINING STAIRS
```

### Scenario 2: Bear is Medium Distance (6-7 blocks) - CONTINUE MINING
```
Target (Player)
     |
     | ~6 blocks away
     |
     [T]  <- Target at Y+5
     [ ]
     [ ]
     [ ]
     [B]  <- Bear at Y+2 (on stairs)
     [S]  <- Still mining stairs
     
Action: ✅ CONTINUE MINING STAIRS (approaching threshold)
```

### Scenario 3: Bear is Close (5-6 blocks) - STOP MINING
```
Target (Player)
     |
     | ~5 blocks away
     |
     [T]  <- Target at Y+5
     [ ]
     [B]  <- Bear at Y+3 (on stairs)
     [S]  <- STOP MINING HERE
     
Action: ❌ STOP MINING - Bear should approach normally
```

### Scenario 4: Bear is Very Close (<5 blocks) - STOP MINING
```
Target (Player)
     |
     | ~3 blocks away
     |
     [T]  <- Target at Y+5
     [B]  <- Bear at Y+4 (on stairs)
     [S]  <- STOP MINING - Too close!
     
Action: ❌ STOP MINING - Bear should approach normally
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

```javascript
const horizontalDist = Math.hypot(dx, dz);
const totalDist = Math.hypot(dx, dy, dz);

if (horizontalDist <= 6) {
    // STOP MINING - Bear is close enough
    // Let bear approach normally using pathfinding/movement
    return false; // Don't mine
} else {
    // CONTINUE MINING - Bear is far away
    // Continue building stairs toward target
    return true; // Mine stairs
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
- ✅ Stop calling `carveStair()`
- ✅ Stop mining blocks for stairs
- ✅ Use normal pathfinding/movement to approach
- ✅ Still respond to target movement
- ✅ Resume mining if target moves away (>6 blocks)

## Implementation Notes

- Check distance **before** calling `carveStair()`
- Check distance in `processContext()` or main mining logic
- Use horizontal distance (probably) since stairs are for vertical traversal
- Consider target movement - if target moves away, resume mining
