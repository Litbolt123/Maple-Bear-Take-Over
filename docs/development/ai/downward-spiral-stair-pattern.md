# Spiral Staircase Pattern for 2-Block-Tall Bear (Ascending & Descending)

## Overview
This document describes the correct pattern for spiral stairs when the target is significantly above or below the bear (4+ blocks). The spiral staircase allows the bear to ascend or descend in a 3x3 area, rotating around a center pillar.

**Key Rules:**
- **Ascending (going UP)**: Bear rotates **clockwise** around the center pillar
- **Descending (going DOWN)**: Bear rotates **counter-clockwise** around the center pillar
- Each `S` (step) represents a **1 Y level change** in the stair

## Visual Pattern (Top-Down View)

### 3x3 Grid Layout
```
     Z-1  Z    Z+1
X-1 [  ] [  ] [  ]
X   [  ] [C] [  ]  <- C = Center pillar (NEVER break unless on same Y level as player!)
X+1 [  ] [  ] [  ]
```

**Legend:**
- `B` = Mining Maple Bear (shown as a dot in top-down view)
- `S` = Step position (where bear ascends/descends 1 Y level) - solid block below (foothold), air above
- `C` = Center pillar (solid, never break unless bear is on same Y level as player)
- `H` = Solid blocks that bear stands on (step footholds - NOT mined)
- `W` = Walkway designation (2-block high space for walking through)
- `AH` = Air for H space (3 blocks that are air - 3-block high space for jumping)
- `AW` = Air for Walkway (2 blocks that are air - walkway space)
- `A` = Air (empty space - what bear walks through, general air)
- `X` = Solid block (starting state, before mining)

**Important: Bear Height and Layer Occupancy**
Since the bear is **2 blocks tall**, it will be **partially in each layer** every time:
- If bear's feet are at Y=50, its head is at Y=51
- Bear occupies **both layer Y=50 (feet) and layer Y=51 (head)** simultaneously
- This means the bear spans across two adjacent layers at all times

### Spiral Rotation Pattern (4 steps per rotation - 3D Layered Structure)

**Important: 3D Layered Structure**
The spiral staircase has **multiple Y levels (3D layers)**. Each Y level has its own 3x3 grid pattern. The bear moves:
- **Horizontally**: Within the 3x3 grid (one block at a time)
- **Vertically**: Changes Y level when reaching an `S` position (1 Y level per step)

**Movement Pattern:**
- **Ascending (going UP)**: Bear rotates **clockwise** around the center pillar, moves up 1 Y level at each `S`
- **Descending (going DOWN)**: Bear rotates **counter-clockwise** around the center pillar, moves down 1 Y level at each `S`
- Each `S` (step) represents a **1 Y level change** in the stair (up or down depending on direction)
- Bear moves **one block horizontally** AND **changes Y level** at each step of the pattern

**Example:**
- Bear starts at Y=50, position (X+1, Y=50, Z)
- After Step 1 (descending): Bear moves to Y=49, position (X, Y=49, Z-1)
- Underneath the `H` spaces at Y=50, there are `S` positions at Y=49 (another layer of the spiral)
- The pattern repeats at each Y level, creating a 3D spiral structure

**Headroom Requirements:**
- **AH (Air for H space - 3 blocks high)**: Used when bear needs to jump before the step - provides room for jumping up/down
- **AW (Air for Walkway - 2 blocks high)**: Used for walking through - standard tunnel/stair size
- **H (Solid blocks)**: Step footholds that bear stands on - NOT mined, preserved
- **A (Air)**: General air blocks that bear walks through
- **S (Step)**: Position where bear ascends/descends 1 Y level - solid block (H) below, air (A/AW/AH) above

**Step 1 (North - Starting Position):**

The bear should have a space where he can jump up and move forward right now. The stair pattern shows **10 layers total**, each being a 3x3 grid. The layers represent the vertical (up/down) progression.

**Important Mining Strategy:**
- **All layers start filled with solid blocks (X)** - the bear must mine them out strategically
- Bear designates blocks as: **S** (Step - solid foothold), **W** (Walkway - 2-block high air), **H** (3-block high air for jumping)
- **Forward-thinking**: When mining, bear must NOT break blocks that will be needed for future steps/walkways in the next layers
- Bear preserves solid blocks for: step footholds (S), center pillar (C), and future step positions

- `A` = Air (empty space) - what bear walks through, created by mining solid blocks
- `AW` = Air for Walkway (2 blocks that are air for W - walkway space)
- `AH` = Air for H space (3 blocks that are air - 3-block high space for jumping)
- `H` = Solid blocks that bear stands on (step footholds - NOT mined, preserved)
- `W` = Walkway designation (2 blocks high) - solid blocks mined to create AW
- `S` = Step designation - **SOLID BLOCK** (foothold, NOT mined) - same as H
- `B` = Bear position
- `C` = Center pillar (solid block - NEVER mined)
- `X` = Solid block (starting state, before mining)

**All 10 Layers (Y=49 solid blocks up to Y=58):**

**Note:** Since bear is 2 blocks tall, if bear's feet are at Y=50, its head is at Y=51. Bear occupies **both layers simultaneously**. Bear stands on solid blocks at Y=49.

```
Layer 0 (Y=49) - Solid blocks (bear stands on these):
     Z-1  Z    Z+1
X-1 [H] [H] [H]  <- H = Solid block (step footholds - bear stands on these)
X   [H] [C] [H]  <- H = Solid block (step foothold), C = Center pillar (solid)
X+1 [H] [H] [H]  <- H = Solid block (bear stands here at start)

Layer 1 (Y=50) - Bear's feet layer (INITIAL: All X, AFTER MINING: AH/AW for H/W):
     Z-1  Z    Z+1
X-1 [X→AH] [X→AH] [X→AH]  <- MINE: X becomes AH (H designation: 3-block high space for jumping)
X   [X→AW] [C] [X→AW]  <- MINE: X becomes AW (W designation: walkway), C = Center pillar (NEVER mined)
X+1 [X→AH] [B] [X→AH]  <- MINE: X becomes AH, B = Bear feet (at Y=50), head at Y=51

Layer 2 (Y=51) - Bear's head layer (INITIAL: All X, AFTER MINING: AH for H):
     Z-1  Z    Z+1
X-1 [X→AH] [X→AH] [X→AH]  <- MINE: X becomes AH (H designation: headroom above jumping space)
X   [X→AH] [C] [X→AH]  <- MINE: X becomes AH (H designation: headroom above walkway), C = Center pillar (solid)
X+1 [X→AH] [B] [X→AH]  <- MINE: X becomes AH, B = Bear head (at Y=51), feet at Y=50

Layer 3 (Y=52):
     Z-1  Z    Z+1
X-1 [AH] [AH] [AH]  <- AH = Air for H (3-block high space)
X   [AH] [C] [AH]  <- AH = Air for H (3-block high space), C = Center pillar continues
X+1 [AH] [H] [AH]  <- AH = Air for H, H = Solid step foothold (bear will stand here)

Layer 4 (Y=53):
     Z-1  Z    Z+1
X-1 [AH] [AH] [AH]  <- AH = Air for H (3-block high space)
X   [AW] [C] [AW]  <- AW = Air for Walkway, C = Center pillar
X+1 [AH] [S] [AH]  <- AH = Air, S = Step position (air above solid H foothold below)

Layer 5 (Y=54):
     Z-1  Z    Z+1
X-1 [AH] [AH] [AH]  <- AH = Air for H (3-block high space)
X   [AH] [C] [AH]  <- AH = Air for H (3-block high space), C = Center pillar
X+1 [AH] [H] [AH]  <- AH = Air for H, H = Solid step foothold

Layer 6 (Y=55):
     Z-1  Z    Z+1
X-1 [AH] [S] [AH]  <- AH = Air, S = Step position (air above solid H foothold below)
X   [AW] [C] [AW]  <- AW = Air for Walkway, C = Center pillar
X+1 [AH] [AH] [AH]  <- AH = Air for H (3-block high space)

Layer 7 (Y=56):
     Z-1  Z    Z+1
X-1 [AH] [AH] [AH]  <- AH = Air for H (3-block high space)
X   [AH] [C] [AH]  <- AH = Air for H (3-block high space), C = Center pillar
X+1 [AH] [H] [AH]  <- AH = Air for H, H = Solid step foothold

Layer 8 (Y=57):
     Z-1  Z    Z+1
X-1 [AH] [AH] [AH]  <- AH = Air for H (3-block high space)
X   [AW] [C] [AW]  <- AW = Air for Walkway, C = Center pillar
X+1 [AH] [S] [AH]  <- AH = Air, S = Step position (air above solid H foothold below)

Layer 9 (Y=58):
     Z-1  Z    Z+1
X-1 [AH] [AH] [AH]  <- AH = Air for H (3-block high space)
X   [AH] [C] [AH]  <- AH = Air for H (3-block high space), C = Center pillar
X+1 [AH] [H] [AH]  <- AH = Air for H, H = Solid step foothold
```

**Pattern Explanation:**
- **Layer 0 (Y=49)**: Solid blocks (H) - bear stands on these, step footholds (NOT mined)
- **Layer 1 (Y=50)**: Bear's feet layer - filled with A/AW/AH (air), H (solid footholds), B (bear)
- **Layer 2 (Y=51)**: Bear's head layer - filled with A/AW/AH (air), B (bear head)
- **Layers 3-9 (Y=52-58)**: Spiral pattern layers - **each layer has at least one W, H, or S** to show staircase structure
- **H** = Solid blocks (step footholds) - bear stands on these, NOT mined
- **AH** = Air for H space (3 blocks high) - provides room for jumping
- **AW** = Air for Walkway (2 blocks high) - provides walkway for walking through
- **A** = Air (general) - what bear walks through
- **S positions** = Step locations where bear changes Y level - air (A/AW/AH) above solid step foothold (H) below
- **W positions** = Walkway locations - air (AW) for walking through
- **C** = Center pillar (solid) - continues through all layers, NEVER mined
- **B** = Bear position - **occupies 2 layers** (feet at one Y, head at Y+1)
- **Each layer must have at least one W, H, or S** - this is a staircase, not just open air
- **Each layer must be filled** with either A, AW, AH, H (solid), S (step), W (walkway), B, C, or X (solid block before mining)

## Step-by-Step Mining and Movement Walkthrough

**Starting Position:**
- Bear at (X+1, Y=50 feet, Y=51 head) - standing on solid block at Y=49
- All layers filled with solid blocks (X) - bear must mine strategically

### Visual: Starting State (All Solid Blocks)
```
Layer 0 (Y=49) - Solid blocks:
     Z-1  Z    Z+1
X-1 [X] [X] [X]
X   [X] [C] [X]
X+1 [X] [X] [X]  <- Bear stands here

Layer 1 (Y=50) - Bear's feet:
     Z-1  Z    Z+1
X-1 [X] [X] [X]
X   [X] [C] [X]
X+1 [X] [B] [X]  <- B = Bear feet

Layer 2 (Y=51) - Bear's head:
     Z-1  Z    Z+1
X-1 [X] [X] [X]
X   [X] [C] [X]
X+1 [X] [B] [X]  <- B = Bear head
```

---

**Step 1: Initial Mining and Movement**
1. Bear mines **in front of it** (or to the left from top-down view)
2. Mines **2 solid blocks** at Y=50 and Y=51 in front → creates **air (A)**
3. **Walks into that space** (moves forward into the cleared area)

### Visual: Step 1 - Initial Mining
```
Layer 0 (Y=49):
     Z-1  Z    Z+1
X-1 [X] [X] [X]
X   [X] [C] [X]
X+1 [X] [X] [X]

Layer 1 (Y=50) - BEFORE:
     Z-1  Z    Z+1
X-1 [X] [X] [X]
X   [X] [C] [X]
X+1 [X] [B] [X]  <- Bear at X+1, Z

Layer 1 (Y=50) - AFTER MINING:
     Z-1  Z    Z+1
X-1 [AH] [X] [X]  <- MINED: X→AH (in front/left)
X   [X] [C] [X]
X+1 [AH] [B] [X]

Layer 2 (Y=51) - AFTER MINING:
     Z-1  Z    Z+1
X-1 [AH] [X] [X]  <- MINED: X→AH (in front/left)
X   [X] [C] [X]
X+1 [AH] [B] [X]

Layer 1 (Y=50) - AFTER MOVING:
     Z-1  Z    Z+1
X-1 [B] [X] [X]  <- Bear moved here
X   [X] [C] [X]
X+1 [AH] [AH] [X]
```

---

**Step 2: Turn and Create H Space**
4. Bear **turns 90 degrees to the right** (clockwise for ascending, counter-clockwise for descending)
5. Mines **next 2 blocks in front** at Y=50 and Y=51 → creates air
6. **Also mines one block higher** at Y=52 → creates **H space (3-block high)** for headroom before ascending stair
7. **Walks into that 3-high space** (Y=50, Y=51, Y=52 all air)

### Visual: Step 2 - Turn and Create H Space
```
Layer 1 (Y=50) - AFTER TURNING RIGHT:
     Z-1  Z    Z+1
X-1 [B] [X] [X]  <- Bear facing new direction
X   [X] [C] [X]
X+1 [AH] [AH] [X]

Layer 1 (Y=50) - AFTER MINING 2 BLOCKS:
     Z-1  Z    Z+1
X-1 [B] [AH] [X]  <- MINED: X→AH (in front)
X   [AH] [C] [X]  <- MINED: X→AH (in front)
X+1 [X] [AH] [X]

Layer 2 (Y=51) - AFTER MINING 2 BLOCKS:
     Z-1  Z    Z+1
X-1 [B] [AH] [X]  <- MINED: X→AH (in front)
X   [AH] [C] [X]  <- MINED: X→AH (in front)
X+1 [X] [AH] [X]

Layer 3 (Y=52) - AFTER MINING 1 BLOCK HIGHER (H SPACE):
     Z-1  Z    Z+1
X-1 [AH] [X] [X]  <- MINED: X→AH (creates H - 3-block high space)
X   [AH] [C] [X]  <- MINED: X→AH
X+1 [B] [X] [X]

Layer 1 (Y=50) - AFTER MOVING INTO 3-HIGH SPACE:
     Z-1  Z    Z+1
X-1 [AH] [B] [X]  <- Bear moved into H space
X   [AH] [C] [X]
X+1 [X] [AH] [X]
```

---

**Step 3: Create Step and Ascend**
8. Bear does **NOT mine the 2 blocks directly in front** at Y=50 and Y=51
9. **PROTECTS the block in front of its feet** at Y=49 (below) → this becomes the **step foothold (H - solid block)**
10. Mines the **2 blocks on top of the stair** at Y=50 and Y=51 (above the protected foothold) → creates headroom (AH)
11. **Jumps onto that new stair** (moves forward and up 1 Y level)
12. Bear is now standing on the step foothold (H) at Y=49, feet at Y=50, head at Y=51

### Visual: Step 3 - Create Step and Ascend
```
Layer 0 (Y=49) - PROTECTED STEP FOOTHOLD:
     Z-1  Z    Z+1
X-1 [H] [H] [H]
X   [H] [C] [H]
X+1 [H] [H] [H]  <- PROTECTED: H = Step foothold (solid block, NOT mined - bear stands on this)

Layer 1 (Y=50) - MINING HEADROOM ABOVE STEP:
     Z-1  Z    Z+1
X-1 [AH] [B] [X]  <- Bear here
X   [AH] [C] [X]
X+1 [X] [AH] [X]  <- MINED: X→AH (headroom above step foothold)

Layer 2 (Y=51) - MINING HEADROOM ABOVE STEP:
     Z-1  Z    Z+1
X-1 [AH] [B] [X]  <- Bear head here
X   [AH] [C] [X]
X+1 [X] [AH] [X]  <- MINED: X→AH (headroom above step foothold)

Layer 1 (Y=50) - AFTER JUMPING ONTO STEP:
     Z-1  Z    Z+1
X-1 [AH] [AH] [X]
X   [AH] [C] [X]
X+1 [AH] [B] [X]  <- Bear jumped onto step (moved forward, now standing on H foothold at Y=49 below)
```

---

**Step 4: Turn and Create Walkway**
13. Bear **turns 90 degrees to the right** again
14. Mines **walkway (W) - 2 blocks high** in front at Y=50 and Y=51 → creates air
15. **Moves into that walkway space**

### Visual: Step 4 - Turn and Create Walkway
```
Layer 1 (Y=50) - AFTER TURNING RIGHT:
     Z-1  Z    Z+1
X-1 [A] [A] [X]
X   [A] [C] [X]
X+1 [A] [B] [X]  <- Bear facing new direction

Layer 1 (Y=50) - AFTER MINING WALKWAY (W):
     Z-1  Z    Z+1
X-1 [AW] [AW] [AW]  <- MINED: X→AW (W - walkway, 2 blocks high)
X   [AW] [C] [AW]  <- MINED: X→AW (W - walkway)
X+1 [AW] [B] [X]

Layer 2 (Y=51) - AFTER MINING WALKWAY (W):
     Z-1  Z    Z+1
X-1 [AW] [AW] [AW]  <- MINED: X→AW (W - walkway, 2 blocks high)
X   [AW] [C] [AW]  <- MINED: X→AW (W - walkway)
X+1 [AW] [B] [X]

Layer 1 (Y=50) - AFTER MOVING INTO WALKWAY:
     Z-1  Z    Z+1
X-1 [AW] [AW] [B]  <- Bear moved into walkway
X   [AW] [C] [AW]
X+1 [AW] [AW] [X]
```

---

**Step 5: Prepare for Next Stair**
16. Mines **3-block high (H) walkway** in front at Y=50, Y=51, Y=52 → creates air
17. This prepares the space for the next stair that will be created

### Visual: Step 5 - Prepare H Space for Next Stair
```
Layer 1 (Y=50) - MINING H SPACE:
     Z-1  Z    Z+1
X-1 [AW] [AW] [B]  <- Bear here
X   [AW] [C] [AW]
X+1 [AH] [AH] [AH]  <- MINED: X→AH (H - 3-block high space)

Layer 2 (Y=51) - MINING H SPACE:
     Z-1  Z    Z+1
X-1 [AW] [AW] [B]  <- Bear head here
X   [AW] [C] [AW]
X+1 [AH] [AH] [AH]  <- MINED: X→AH (H - 3-block high space)

Layer 3 (Y=52) - MINING H SPACE:
     Z-1  Z    Z+1
X-1 [AH] [AH] [X]
X   [AH] [C] [AH]  <- MINED: X→AH (H - 3-block high space)
X+1 [AH] [AH] [AH]  <- MINED: X→AH (H - 3-block high space)
```

---

**Step 6: Repeat Pattern**
18. Pattern repeats: Create step → ascend → create walkway → prepare H space → create next step
19. Each step involves: protecting foothold → mining headroom → jumping up → turning → mining walkway/H space

### Visual: Complete Pattern Overview
```
Pattern Cycle:
1. Mine initial space → Move
2. Turn 90° → Mine H space (3 blocks high) → Move
3. Protect foothold → Mine headroom → Jump onto step
4. Turn 90° → Mine walkway (W - 2 blocks high) → Move
5. Mine H space (3 blocks high) → Prepare for next step
6. Repeat from step 3
```

## Actual Mining Pattern (Tested in Minecraft)

**Starting Position:**
- Bear in a **1 block wide × 2 blocks tall** hole
- Center pillar (C) designated to the right

### Side View: Initial Mining Pattern

**Before Mining:**
```
     B   F
Y+3: [X] [X]  <- All solid blocks (center pillar is to the right, not shown)
Y+2: [X] [X]
Y+1: [B] [X]  <- B = Bear head (in 1×2 hole)
Y+0: [B] [X]  <- B = Bear feet
Y-1: [X] [X]  <- Solid ground
     B   F    <- B = Bear position, F = Front (center pillar is to the right, touching these blocks)
```

**Mining Steps:**
1. Mine block **above head** (Y+2, bear position - same X as bear)
2. Mine block **in front at head level** (Y+1, front position - one block forward)
3. Mine block **above that one** (Y+2, front position - one block forward, one block up)

**After Mining:**
```
     B   F
Y+3: [X] [X]  <- A = Air (mined: block above head at bear position)
Y+2: [A] [A]  <- A = Air (mined: above head at bear position, and above front at head level)
Y+1: [B] [A]  <- B = Bear head, A = Air (mined: in front at head level)
Y+0: [B] [X]  <- B = Bear feet
Y-1: [X] [X]  <- Solid ground
     B   F    <- Center pillar is to the right, touching these blocks
```

**Result:**
- Bear is now in a **1 wide × 3 high space** (Y+0 to Y+2 cleared)
- In front is a space **1 Y level up** that is **1 wide × 2 high** (Y+1 to Y+2 at front position)

### Side View: After Jumping Up and Turning

**After Jumping Up (into new 1×2 space):**
```
     O   F
Y+3: [X] [X]  <- A = Air (center pillar is to the right, not shown)
Y+2: [A] [B]  <- B = Bear head (jumped up into new space at front)
Y+1: [A] [B]  <- B = Bear feet (now 1 Y level higher, at front position)
Y+0: [A] [X]  <- Old position (empty now)
Y-1: [X] [X]  <- Solid ground
     O   F    <- O = Old position, F = Front (where bear jumped to, center pillar is to the right)
```

**After Turning 90 Degrees Right:**
- Bear now faces new direction (perpendicular to original)
- Center pillar is now to the right relative to new facing direction (not shown in side view)
- Bear is in the front position (F), which becomes the new bear position

**Next Mining Pattern (Repeating the same process):**
```
     B   F   N
Y+3: [X] [X] [X]  <- All solid blocks (except already mined, center pillar is to the right)
Y+2: [X] [B] [X]  <- B = Bear head (at new position after jump)
Y+1: [X] [B] [X]  <- B = Bear feet (at new position)
Y+0: [X] [X] [X]
Y-1: [X] [X] [X]  <- Solid ground
     B   F   N    <- B = Bear (new position), F = Front, N = New front (center pillar is to the right)

Mine (same pattern):
1. Block above head (Y+3, bear position)
2. Block in front at head level (Y+2, front position)
3. Block above that one (Y+3, front position)

After Mining:
     B   F   N
Y+3: [X] [A] [A]  <- A = Air (mined: above head, above front)
Y+2: [X] [B] [A]  <- B = Bear head, A = Air (mined: in front at head level)
Y+1: [X] [B] [X]  <- B = Bear feet
Y+0: [X] [X] [X]
Y-1: [X] [X] [X]
     B   F   N    <- Center pillar is to the right, touching these blocks
```

**Pattern Repeats:**
1. Bear jumps up into new 1×2 space (1 Y level higher)
2. Turns 90 degrees right
3. Mines 3 blocks: above head → in front at head level → above that
4. Creates new 1×3 space for bear, 1×2 space in front (1 Y level up)
5. Repeat from step 1

---

## Implementation Plan for Spiral Staircase Mining

### Core Algorithm

**State Tracking:**
- `centerPillar`: { x, y, z } - Center pillar position (NEVER mined)
- `currentDirection`: { x, z } - Current facing direction (normalized)
- `spiralStep`: Number - Current step in spiral (0-3, resets after 4 steps)
- `lastStepFoothold`: { x, y, z } - Last step foothold position (protected)

**Initialization:**
1. Bear starts in 1×2 hole
2. Designate center pillar: Choose block to the right of bear's facing direction
3. Set `centerPillar` = that block's position
4. Set `currentDirection` = bear's current facing direction
5. Set `spiralStep` = 0

### Mining Sequence (Per Step)

**Step 1: Mine Initial Space**
```
Input: bear position (bearX, bearY, bearZ), currentDirection (dirX, dirZ)
1. Calculate front position: frontX = bearX + dirX, frontZ = bearZ + dirZ
2. Mine block above head: (bearX, bearY + 2, bearZ) → creates air
3. Mine block in front at head level: (frontX, bearY + 1, frontZ) → creates air
4. Mine block above that: (frontX, bearY + 2, frontZ) → creates air
5. Result: Bear now in 1×3 space, front has 1×2 space (1 Y level up)
```

**Step 2: Jump Up and Turn**
```
1. Bear jumps up into front space (moves to frontX, bearY + 1, frontZ)
2. Rotate direction 90 degrees:
   - Clockwise (ascending): newDirX = -currentDirZ, newDirZ = currentDirX
   - Counter-clockwise (descending): newDirX = currentDirZ, newDirZ = -currentDirX
3. Update currentDirection = { x: newDirX, z: newDirZ }
4. Increment spiralStep = (spiralStep + 1) % 4
```

**Step 3: Repeat Mining Pattern**
```
1. Calculate new front position using updated currentDirection
2. Repeat Step 1 mining pattern with new positions
3. Continue spiral
```

### Block Protection Logic

**Protect Step Footholds:**
- When bear jumps up, the block it was standing on becomes a step foothold
- Store in `lastStepFoothold` = { x: oldBearX, y: oldBearY - 1, z: oldBearZ }
- NEVER mine blocks at `lastStepFoothold` position
- Check before mining: if (blockX === lastStepFoothold.x && blockY === lastStepFoothold.y && blockZ === lastStepFoothold.z) → SKIP

**Protect Center Pillar:**
- NEVER mine block at `centerPillar` position
- Check before mining: if (blockX === centerPillar.x && blockY === centerPillar.y && blockZ === centerPillar.z) → SKIP

**Forward-Thinking Protection:**
- When mining at Y level N, check Y level N-1 (below)
- If block at (X, Y-1, Z) will be needed as step foothold in next step → PROTECT it
- Pattern: Next step foothold will be at (frontX, bearY, frontZ) after jump
- Protect: (frontX, bearY, frontZ) before mining blocks above it

### Complete Mining Function Pseudocode

```javascript
function mineSpiralStairStep(entity, targetInfo) {
    const loc = entity.location;
    const bearX = Math.floor(loc.x);
    const bearY = Math.floor(loc.y);
    const bearZ = Math.floor(loc.z);
    
    // Get current direction (normalized)
    const dirX = currentDirection.x;
    const dirZ = currentDirection.z;
    
    // Calculate front position
    const frontX = bearX + dirX;
    const frontZ = bearZ + dirZ;
    
    // Step 1: Mine 3 blocks
    const blocksToMine = [
        { x: bearX, y: bearY + 2, z: bearZ, name: "above head" },
        { x: frontX, y: bearY + 1, z: frontZ, name: "in front at head level" },
        { x: frontX, y: bearY + 2, z: frontZ, name: "above front" }
    ];
    
    for (const block of blocksToMine) {
        // Check if protected
        if (isProtected(block, centerPillar, lastStepFoothold)) {
            continue; // Skip protected blocks
        }
        
        // Mine the block
        mineBlock(block.x, block.y, block.z);
    }
    
    // Step 2: Jump up and turn (happens after mining completes)
    // This will be handled by movement/impulse system
    // Direction rotation happens here
    rotateDirection90Degrees(ascending); // or descending
}

function isProtected(block, centerPillar, lastStepFoothold) {
    // Check center pillar
    if (block.x === centerPillar.x && block.y === centerPillar.y && block.z === centerPillar.z) {
        return true; // Protected - center pillar
    }
    
    // Check last step foothold
    if (block.x === lastStepFoothold.x && block.y === lastStepFoothold.y && block.z === lastStepFoothold.z) {
        return true; // Protected - step foothold
    }
    
    // Check future step foothold (forward-thinking)
    // Next step foothold will be at (frontX, bearY, frontZ)
    // Protect blocks at that position
    const futureFootholdX = /* calculate based on next step */;
    const futureFootholdY = bearY; // Same Y level as current bear feet
    const futureFootholdZ = /* calculate based on next step */;
    
    if (block.x === futureFootholdX && block.y === futureFootholdY && block.z === futureFootholdZ) {
        return true; // Protected - future step foothold
    }
    
    return false; // Not protected, can mine
}
```

### Direction Rotation Logic

**Clockwise (Ascending):**
```javascript
function rotateClockwise(currentDir) {
    return { x: -currentDir.z, z: currentDir.x };
}
```

**Counter-Clockwise (Descending):**
```javascript
function rotateCounterClockwise(currentDir) {
    return { x: currentDir.z, z: -currentDir.x };
}
```

### Movement and Jumping

**After Mining Complete:**
1. Apply impulse to move bear forward into mined space
2. Apply upward impulse to jump into 1×2 space (1 Y level up)
3. Update bear position tracking
4. Update `lastStepFoothold` to previous bear position

**Impulse Values:**
- Forward: 0.10 (gentle, walk not fly)
- Upward: 0.08 (gentle, walk up stairs)
- Applied when mining completes and space is ready

### Complete Flow

```
1. Initialize:
   - Designate center pillar (to the right)
   - Set current direction
   - Set spiral step = 0

2. Mining Loop:
   a. Calculate front position
   b. Check which blocks to mine (above head, in front at head level, above that)
   c. For each block:
      - Check if protected (center pillar, step foothold, future foothold)
      - If not protected, mine it
   d. After mining completes:
      - Apply movement impulse (forward + upward)
      - Bear jumps into new 1×2 space
      - Rotate direction 90 degrees
      - Update spiral step
      - Update last step foothold
   e. Repeat from step 2a

3. Protection Updates:
   - After each jump, update lastStepFoothold
   - Before mining, check future foothold positions
   - Never mine center pillar
```

### Edge Cases

**Bear Stuck:**
- If bear cannot move forward after mining, try alternative directions
- Check if blocks are actually breakable before mining
- If all directions blocked, mine center pillar (only if stuck 5+ seconds)

**Target Changes:**
- If target moves significantly, recalculate center pillar position
- If target moves to same Y level, can break center pillar if needed

**Multiple Bears:**
- Use `activeStairWork` map to prevent multiple bears working same block
- Lock blocks for 5 seconds (STAIR_WORK_LOCK_TICKS)

### Testing Checklist

- [ ] Bear starts in 1×2 hole
- [ ] Bear mines 3 blocks correctly (above head, in front, above that)
- [ ] Bear jumps up into new 1×2 space
- [ ] Bear turns 90 degrees correctly (clockwise ascending, counter-clockwise descending)
- [ ] Center pillar is never mined
- [ ] Step footholds are protected
- [ ] Future step footholds are protected (forward-thinking)
- [ ] Pattern repeats correctly for 4 steps (full rotation)
- [ ] Bear ascends/descends 1 Y level per step
- [ ] Spiral completes full rotation after 4 steps

**Step 2 (East - Counter-Clockwise at Y=49):**
```
     Z-1  Z    Z+1
X-1 [H] [W] [H]  <- H = 3-block high space, W = Walkway
X   [B] [C] [S]  <- B = Bear (at Y=49), S = Step (descend 1 Y to Y=48), C = Center pillar
X+1 [H] [S] [H]  <- H = 3-block high space for jumping, S = Step (descend 1 Y)
```
- Bear at (X, Y=49, Z-1) - moved from Y=50, now at Y=49
- Bear moves **one block horizontally** to (X, Y=49, Z+1) AND **descends 1 Y level** to Y=48
- Next step: (X, Y=48, Z+1) - rotate **counter-clockwise** to South (for descent)
- H spaces provide jumping room, W provides walkway
- **Underneath H spaces at Y=49, there are S positions at Y=48** (next layer down)

**Step 3 (South - Counter-Clockwise at Y=48):**
```
     Z-1  Z    Z+1
X-1 [H] [S] [H]  <- H = 3-block high space, S = Step (descend 1 Y to Y=47)
X   [W] [C] [W]  <- W = Walkway (2-block high), C = Center pillar
X+1 [S] [B] [H]  <- S = Step (descend 1 Y), B = Bear (at Y=48), H = 3-block high space
```
- Bear at (X, Y=48, Z+1) - moved from Y=49, now at Y=48
- Bear moves **one block horizontally** to (X+1, Y=48, Z+1) AND **descends 1 Y level** to Y=47
- Next step: (X+1, Y=47, Z+1) - rotate **counter-clockwise** to West (for descent)

**Step 4 (West - Counter-Clockwise at Y=47):**
```
     Z-1  Z    Z+1
X-1 [S] [H] [H]  <- S = Step (descend 1 Y to Y=46), H = 3-block high space
X   [W] [C] [W]  <- W = Walkway (2-block high), C = Center pillar
X+1 [B] [S] [H]  <- B = Bear (at Y=47), S = Step (descend 1 Y), H = 3-block high space
```
- Bear at (X+1, Y=47, Z+1) - moved from Y=48, now at Y=47
- Bear moves **one block horizontally** to (X+1, Y=47, Z-1) AND **descends 1 Y level** to Y=46
- Next step: (X+1, Y=46, Z-1) - rotate **counter-clockwise** back to North (full rotation complete)
- After 4 steps, bear has descended 4 Y levels (50 → 49 → 48 → 47 → 46) and completed one full rotation

---

**Ascending Pattern (Clockwise Rotation - 3D Layered Structure):**

The bear rotates **clockwise** around the center pillar to **ascend**. Each `S` represents a 1 Y level change (going up). The pattern repeats at each Y level.

**Step 1 (North - Starting Position for Ascent at Y=46):**
```
Y Level 46 (Current Layer):
     Z-1  Z    Z+1
X-1 [H] [S] [H]  <- H = 3-block high space for jumping, S = Step (ascend 1 Y to Y=47)
X   [W] [C] [S]  <- W = Walkway (2-block high), S = Step (ascend 1 Y), C = Center pillar
X+1 [S] [B] [H]  <- S = Step (ascend 1 Y), B = Bear (at Y=46), H = 3-block high space

Y Level 47 (Layer Above):
     Z-1  Z    Z+1
X-1 [S] [H] [S]  <- S = Step positions from layer below, H = 3-block high space
X   [H] [C] [H]  <- H = 3-block high space, C = Center pillar continues up
X+1 [H] [S] [W]  <- H = 3-block high space, S = Step, W = Walkway
```
- Bear at (X+1, Y=46, Z)
- Bear moves **one block horizontally** to (X, Y=46, Z-1) AND **ascends 1 Y level** to Y=47
- Next step: (X, Y=47, Z-1) - rotate **clockwise** to East (for ascent)
- **Above each H at Y=46, there are S positions at Y=47** (another layer of the spiral)

**Step 2 (East - Clockwise at Y=47):**
```
     Z-1  Z    Z+1
X-1 [H] [W] [H]  <- H = 3-block high space, W = Walkway
X   [B] [C] [S]  <- B = Bear (at Y=47), S = Step (ascend 1 Y to Y=48), C = Center pillar
X+1 [H] [S] [H]  <- H = 3-block high space, S = Step (ascend 1 Y)
```
- Bear at (X, Y=47, Z-1) - moved from Y=46, now at Y=47
- Bear moves **one block horizontally** to (X, Y=47, Z+1) AND **ascends 1 Y level** to Y=48
- Next step: (X, Y=48, Z+1) - rotate **clockwise** to South (for ascent)

**Step 3 (South - Clockwise at Y=48):**
```
     Z-1  Z    Z+1
X-1 [H] [S] [H]  <- H = 3-block high space, S = Step (ascend 1 Y to Y=49)
X   [W] [C] [W]  <- W = Walkway (2-block high), C = Center pillar
X+1 [S] [B] [H]  <- S = Step (ascend 1 Y), B = Bear (at Y=48), H = 3-block high space
```
- Bear at (X, Y=48, Z+1) - moved from Y=47, now at Y=48
- Bear moves **one block horizontally** to (X+1, Y=48, Z+1) AND **ascends 1 Y level** to Y=49
- Next step: (X+1, Y=49, Z+1) - rotate **clockwise** to West (for ascent)

**Step 4 (West - Clockwise at Y=49):**
```
     Z-1  Z    Z+1
X-1 [S] [H] [H]  <- S = Step (ascend 1 Y to Y=50), H = 3-block high space
X   [W] [C] [W]  <- W = Walkway (2-block high), C = Center pillar
X+1 [B] [S] [H]  <- B = Bear (at Y=49), S = Step (ascend 1 Y), H = 3-block high space
```
- Bear at (X+1, Y=49, Z+1) - moved from Y=48, now at Y=49
- Bear moves **one block horizontally** to (X+1, Y=49, Z-1) AND **ascends 1 Y level** to Y=50
- Next step: (X+1, Y=50, Z-1) - rotate **clockwise** back to North (full rotation complete)
- After 4 steps, bear has ascended 4 Y levels (46 → 47 → 48 → 49 → 50) and completed one full rotation

## Side View (Downward Step Pattern)

For each step going down:

```
Y+3: [ ] [ ] [X]  <- Headroom above step (mine if solid)
Y+2: [ ] [X] [X]  <- Headroom above step (mine if solid)
Y+1: [ ] [X] [X]  <- Headroom above step (mine if solid)
Y+0: [B] [X] [S]  <- Bear at position 0, Step SOLID at position 1
Y-1: [B] [S] [ ]  <- Bear moves down, Step SOLID at position 1 (next step)
```

### Block States for Each Downward Step

**Position 0 (Bear's current position):**
- Y+0: Bear's feet (solid ground)
- Y+1, Y+2, Y+3: Headroom (mine if solid)

**Position 1 (Next step down - 1 forward, 1 down):**
- Y-1: Step foothold (KEEP SOLID - bear steps onto this)
- Y+0: Headroom above step (mine if solid)
- Y+1: Headroom above step (mine if solid)
- Y+2: Headroom above step (mine if solid)

**Position 2 (Forward position - 2 forward, 2 down):**
- Y-2: Next step foothold (KEEP SOLID)
- Y-1: Headroom above next step (mine if solid)
- Y+0: Headroom above next step (mine if solid)
- Y+1: Headroom above next step (mine if solid)

## Mining Pattern for Downward Spiral

### Blocks to MINE:
1. **Headroom above current position**:
   - If jumping: Y+1, Y+2, Y+3 at stepX, stepZ (3-block space)
   - If walking: Y+1, Y+2 at stepX, stepZ (2-block space)
2. **Headroom above next step**:
   - If jumping: Y+0, Y+1, Y+2 at forwardX, forwardZ (3-block space)
   - If walking: Y+0, Y+1 at forwardX, forwardZ (2-block space)
3. **Headroom above step after next**:
   - If jumping: Y-1, Y+0, Y+1 at forwardX+dirX, forwardZ+dirZ (3-block space)
   - If walking: Y-1, Y+0 at forwardX+dirX, forwardZ+dirZ (2-block space)

### Blocks to KEEP SOLID:
1. **Current step foothold** (stepX, baseY, stepZ) - bear is standing here
2. **Next step foothold** (forwardX, baseY-1, forwardZ) - bear steps onto this
3. **Center pillar** (centerX, any Y, centerZ) - NEVER break this! **EXCEPTION**: Can break if bear is on same Y level as player

## Bear Movement

1. **Bear is 2 blocks tall** - occupies Y+0 and Y+1 when standing
2. **When descending**, bear moves from (stepX, baseY, stepZ) to (forwardX, baseY-1, forwardZ) - rotates **counter-clockwise**
3. **When ascending**, bear moves from (stepX, baseY, stepZ) to (forwardX, baseY+1, forwardZ) - rotates **clockwise**
4. **Bear occupies TOP 2 blocks** of 3-block space when jumping/moving
5. **After each step**, rotate direction based on ascent/descent:
   - **Descending**: Rotate 90 degrees **counter-clockwise** for next step
   - **Ascending**: Rotate 90 degrees **clockwise** for next step

## Rotation Logic

**For Ascending (Clockwise Rotation):**
```javascript
// Rotate 90 degrees clockwise: (x, z) -> (-z, x)
const newX = -currentDir.z;
const newZ = currentDir.x;
currentDir = { x: newX, z: newZ };
```

**For Descending (Counter-Clockwise Rotation):**
```javascript
// Rotate 90 degrees counter-clockwise: (x, z) -> (z, -x)
const newX = currentDir.z;
const newZ = -currentDir.x;
currentDir = { x: newX, z: newZ };
```

## Common Mistakes

1. **Breaking center pillar** - This destroys the spiral structure (unless on same Y level as player)
2. **Breaking step footholds** - Steps must remain solid for bear to stand on
3. **Wrong rotation direction** - Must rotate **clockwise** for ascending, **counter-clockwise** for descending
4. **Mining too many blocks** - Only mine headroom, not footholds
5. **Not checking line of sight** - Only mine blocks bear can see
6. **Wrong headroom size** - Use 3-block space (H) when jumping, 2-block space (W) when walking through
7. **Not protecting center pillar** - Center pillar should be protected unless bear is on same Y level as player
8. **Confusing step direction** - Each `S` represents 1 Y level change: up when ascending, down when descending

## Testing Checklist

**For Descending (Counter-Clockwise):**
- [ ] Bear descends 1 block per step (each S = -1 Y level)
- [ ] Bear rotates 90 degrees **counter-clockwise** each step
- [ ] Center pillar remains intact (unless bear is on same Y level as player)
- [ ] Step footholds remain solid
- [ ] Headroom is cleared correctly:
  - [ ] 3-block high room (H) when jumping
  - [ ] 2-block high room (W) when walking through
- [ ] Bear can see all blocks being mined
- [ ] Spiral completes full rotation after 4 steps
- [ ] Bear reaches target Y level efficiently

**For Ascending (Clockwise):**
- [ ] Bear ascends 1 block per step (each S = +1 Y level)
- [ ] Bear rotates 90 degrees **clockwise** each step
- [ ] Center pillar remains intact (unless bear is on same Y level as player)
- [ ] Step footholds remain solid
- [ ] Headroom is cleared correctly:
  - [ ] 3-block high room (H) when jumping
  - [ ] 2-block high room (W) when walking through
- [ ] Bear can see all blocks being mined
- [ ] Spiral completes full rotation after 4 steps
- [ ] Bear reaches target Y level efficiently

**General:**
- [ ] Bear position (B) is shown correctly in top-down view
- [ ] Step positions (S) represent 1 Y level change correctly
- [ ] Rotation direction matches ascent/descent (clockwise for up, counter-clockwise for down)
