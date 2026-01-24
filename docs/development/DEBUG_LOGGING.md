# Mining Bear Debug Logging

Debug flags for the Mining Bear AI are toggled via the **Journal Debug Menu** (Basic Journal → Debug). Each flag controls a category of `[MINING AI]` / `[PITFALL DEBUG]` logs.

## Mining debug flags

| Flag | What it enables |
|------|------------------|
| **pitfall** | clearBlock budget exhaustion, protection checks, step-block refusals, "Block is protected stair/ramp" |
| **general** | Mining flow (clearForwardTunnel, breakWallAhead, carveStair skip/build), processContext, strategy |
| **target** | Target acquisition, canReachByWalking, "Cleared target" (e.g. creative/spectator) |
| **pathfinding** | Pathfinding waypoints, steering, "Target above – requiring stairs" |
| **vertical** | Vertical path blocked, tunnel height, dig straight down |
| **mining** | carveStair block checks, breakWallAhead "Breaking block", "Mined blocking block while moving closer", step-block refusals |
| **movement** | Movement impulses, "Applied JUMP movement after stairs", steerTowardStep |
| **stairCreation** | Stair-specific logs including **"Refusing to break step block"** |
| **all** | All of the above |

## What to enable for stair / step-block issues

If bears **break the first stair step** or **stop breaking blocks but have no way up**:

1. Enable **mining** and **pitfall**  
   - Or enable **mining** → **all** to turn on every mining-related log.

2. Optionally enable **stairCreation**  
   - Adds stair-specific messages, including every `clearBlock: Refusing to break step block at (x,y,z)`.

3. For full context, also enable **general**  
   - Shows when we skip clearForwardTunnel / breakWallAhead, when carveStair runs, and "After carveStair: cleared=X/Y".

### What to look for in logs

- **`Refusing to break step block at (x,y,z)`** – Step-block guard is working; we are correctly *not* breaking the block the bear steps onto.
- **`Cleared blocking block`** / **`Breaking block`** – Which blocks we clear and where (including "higher up", "along path", "in front at head level").
- **`Skipping clearForwardTunnel`** / **`Skipping breakWallAhead`** – We avoid tunnel/wall breaking when target is above so stairs can be used.
- **`carveStair called`** / **`carveStair Building UPWARD`** – Stair logic is running; **baseY**, **stepX**, **stepZ** show the step position.
- **`Skipping foot-level block breaking while moving closer - target is above`** – We avoid breaking at feet when target is above.

If you see **no** `Refusing to break step block` messages but the step is still being broken, either (a) that block is not the guarded step `(stepX, baseY, stepZ)` toward the target, or (b) it is being broken by a code path that does not use `clearBlock` (unusual). Enabling **pitfall** + **mining** (+ **stairCreation**) should make step-block refusals visible when they occur.
