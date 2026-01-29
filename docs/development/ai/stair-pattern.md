# Stair Pattern for Mining Maple Bear

## Overview
The mining Maple Bear is **2 blocks tall** and needs to create upward stairs to reach targets above. This document describes the correct pattern for building stairs.

## Visual Pattern

### Side View (Before Mining)
```
Y+5: [ ] [ ] [ ] [X]  <- Headroom above step 3, mine position 3
Y+4: [ ] [ ] [X] [X]  <- Headroom above step 2, mine positions 2,3
Y+3: [ ] [X] [X] [X]  <- Headroom above step 1, mine positions 1,2,3
Y+2: [X] [X] [X] [S]  <- Mine positions 0,1,2, Step 3 SOLID at position 3
Y+1: [B] [X] [S] [ ]  <- Bear at position 0, mine position 1, Step 2 SOLID at position 2
Y+0: [B] [S] [ ] [ ]  <- Bear at position 0, Step 1 SOLID at position 1
```

### Side View (After Mining Step 2 - Ready to Jump)
```
Y+5: [ ] [ ] [ ] [ ]  <- Headroom above step 3 (clear)
Y+4: [ ] [ ] [ ] [ ]  <- Air (top of 3-block space above step 2)
Y+3: [ ] [ ] [ ] [ ]  <- Air (middle of 3-block space above step 2)
Y+2: [ ] [ ] [ ] [ ]  <- Air (bottom of 3-block space above step 2)
Y+1: [B] [S] [S] [ ]  <- Bear at position 0, Step 1 SOLID, Step 2 SOLID at position 2
Y+0: [B] [S] [S] [ ]  <- Bear at position 0, Step 1 SOLID, Step 2 SOLID
```

### Side View (After Bear Jumps onto Step 2)
```
Y+5: [ ] [ ] [ ] [ ]  <- Headroom above step 3 (clear)
Y+4: [ ] [ ] [B] [ ]  <- Bear's head (baseY+3) - TOP block of 3-block space
Y+3: [ ] [ ] [B] [ ]  <- Bear's body (baseY+2) - MIDDLE block of 3-block space
Y+2: [ ] [S] [ ] [ ]  <- Air (bottom of 3-block space), Step 1 SOLID
Y+1: [S] [S] [S] [ ]  <- Step 1 SOLID, Step 2 SOLID (bear's feet stand here)
Y+0: [S] [S] [S] [ ]  <- Ground level
```

## Step Definitions

### Step 1 (Current Position)
- **Position**: `(stepX, baseY, stepZ)` = position 1, Y+0
- **Foothold**: SOLID block (bear stands on this)
- **Bear's feet**: `baseY` (standing on step 1)
- **Bear's body/head**: `baseY+1` (2 blocks tall total)
- **Headroom**: `baseY+2` - AIR (1 block above head)

### Step 2 (Next Step - 1 Forward, 1 Up)
- **Position**: `(stepX+dirX, baseY+1, stepZ+dirZ)` = position 2, Y+1
- **Foothold**: SOLID block (keep this! DO NOT MINE!)
- **Bear's feet after jump**: `baseY+1` (standing on step 2 foothold)
- **Bear's body after jump**: `baseY+2` (middle of 3-block space)
- **Bear's head after jump**: `baseY+3` (top of 3-block space)
- **Headroom**: `baseY+4` - AIR (1 block above head)

### Step 3 (Future Step - 2 Forward, 2 Up)
- **Position**: `(stepX+2*dirX, baseY+2, stepZ+2*dirZ)` = position 3, Y+2
- **Foothold**: SOLID block (keep this! DO NOT MINE!)
- **Bear's feet after jump**: `baseY+2` (standing on step 3 foothold)
- **Bear's body after jump**: `baseY+3` (middle of 3-block space)
- **Bear's head after jump**: `baseY+4` (top of 3-block space)
- **Headroom**: `baseY+5` - AIR (1 block above head)

## Blocks to Mine (For Step 2)

When creating step 2, mine these blocks in priority order:

1. **Position 1, Y+1**: `(stepX, baseY+1, stepZ)` - Block in front at same level as bear's head
2. **Position 1, Y+2**: `(stepX, baseY+2, stepZ)` - Block above that
3. **Position 1, Y+3**: `(stepX, baseY+3, stepZ)` - Headroom above
4. **Position 2, Y+2**: `(stepX+dirX, baseY+2, stepZ+dirZ)` - Bottom of 3-block space above step 2
5. **Position 2, Y+3**: `(stepX+dirX, baseY+3, stepZ+dirZ)` - Middle of 3-block space (bear's body will be here)
6. **Position 2, Y+4**: `(stepX+dirX, baseY+4, stepZ+dirZ)` - Top of 3-block space (bear's head will be here)

## Blocks to Keep SOLID (DO NOT MINE!)

1. **Step 1 Foothold**: `(stepX, baseY, stepZ)` - Position 1, Y+0
2. **Step 2 Foothold**: `(stepX+dirX, baseY+1, stepZ+dirZ)` - Position 2, Y+1 ⚠️ CRITICAL!
3. **Step 3 Foothold**: `(stepX+2*dirX, baseY+2, stepZ+2*dirZ)` - Position 3, Y+2

## Bear Movement

### When Standing on Step 1
- Bear's feet: `baseY` (standing on step 1 foothold)
- Bear's body: `baseY+1`
- Bear's head: `baseY+2`
- Total height: 2 blocks

### When Jumping onto Step 2
- Bear jumps up 1 Y level and forward 1 block
- Bear's feet: `baseY+1` (standing on step 2 foothold)
- Bear's body: `baseY+2` (middle of 3-block space)
- Bear's head: `baseY+3` (top of 3-block space)
- Bear occupies the **TOP 2 blocks** of the 3-block air space above step 2

### After Landing on Step 2
- Bear is now 1 Y level higher than before
- Bear is ready to mine blocks for step 3 (2 forward, 2 up from original position)

## Key Principles

1. **Bear is 2 blocks tall** - occupies 2 vertical blocks
2. **Headroom needed** - 1 block of air above bear's head (total 3 blocks of space)
3. **Steps are diagonal** - Each step is 1 block forward AND 1 block up from the previous step
4. **Footholds stay SOLID** - Never mine the step foothold blocks
5. **Mine 3-block space above next step** - Create space for bear to jump into
6. **Bear occupies TOP 2 blocks** - When jumping, bear takes the top 2 blocks of the 3-block space

## Implementation Notes

- Use `directionTowardTarget()` to get `dirX` and `dirZ` toward the target
- Protect step footholds using `recentStairBlocks` map
- Apply impulse (`applyImpulse`) when mining blocks for the 3-block space above step 2
- Mine blocks one at a time (return after each successful mine)
- Check protection before mining (skip protected blocks unless stuck or target very high)

## Code Pattern

```javascript
// Step 1 foothold
const step1X = baseX + dirX;
const step1Z = baseZ + dirZ;
// Protect: (step1X, baseY, step1Z) - SOLID

// Step 2 foothold (next step)
const step2X = step1X + dirX;  // 2 forward from bear
const step2Z = step1Z + dirZ;
// Protect: (step2X, baseY+1, step2Z) - SOLID (1 forward, 1 up)

// Blocks to mine for step 2 (only if targetDy > 1):
// 1. (step1X, baseY+1, step1Z) - Position 1, Y+1
// 2. (step1X, baseY+2, step1Z) - Position 1, Y+2
// 3. (step1X, baseY+3, step1Z) - Position 1, Y+3
// 4. (step2X, baseY+2, step2Z) - Position 2, Y+2 (only if targetDy > 2)
// 5. (step2X, baseY+3, step2Z) - Position 2, Y+3 (only if targetDy > 2)
// 6. (step2X, baseY+4, step2Z) - Position 2, Y+4 (only if targetDy > 2)

// After mining Y+3 block, apply GENTLE impulse ONCE per step
// Check if bear is already too high before applying
const bearY = loc.y;
const step2Y = baseY + 1;
const expectedBearY = step2Y + 0.5;
const bearHeightAboveStep = bearY - expectedBearY;
const isAlreadyTooHigh = bearHeightAboveStep > 0.5;

if (!isAlreadyTooHigh) {
    entity.applyImpulse({
        x: forwardDirX * 0.10,  // GENTLE forward impulse (walk, don't fly!)
        y: 0.08,                 // GENTLE upward impulse (walk up stairs)
        z: forwardDirZ * 0.10   // GENTLE forward impulse
    });
}
```

## Common Mistakes to Avoid

1. ❌ Mining step footholds (they must stay SOLID)
2. ❌ Creating 2-block-high stairs (only mine up to baseY+4, not baseY+5)
3. ❌ Mining blocks at baseY+5 (that's headroom, should be air but don't mine it)
4. ❌ Not protecting step footholds (they get mined by mistake)
5. ❌ Mining blocks too far ahead (only mine for immediate next step)
6. ❌ Mining blocks too high when target changes direction (check targetDy > 2 before mining position 2 blocks)
7. ❌ Using too strong impulse values (bear flies instead of walks - use 0.10 forward, 0.08 upward)
8. ❌ Applying impulse multiple times per step (only apply once when mining Y+3 block)
9. ❌ Not checking if bear is already too high before applying impulse (prevents excessive upward movement)

## Testing Checklist

- [ ] Step 1 foothold stays SOLID
- [ ] Step 2 foothold stays SOLID
- [ ] 3 blocks of air above step 2 (Y+2, Y+3, Y+4)
- [ ] Bear jumps up 1 Y level and forward 1 block
- [ ] Bear occupies TOP 2 blocks of 3-block space
- [ ] Headroom (1 block above bear's head) is clear
- [ ] Stairs go in one direction toward target
