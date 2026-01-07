# Maple Bear Spawning System Explanation

## Overview
The spawning system is a sophisticated, performance-optimized system that finds valid spawn locations for bears and attempts to spawn them based on day progression, player proximity, and various multipliers.

## Main Components

### 1. **Main Spawn Interval Loop** (`system.runInterval`)
- **Frequency**: Runs every 60 ticks (~3 seconds)
- **Purpose**: Processes one player per tick to spread load and prevent lag spikes
- **Rotation**: Cycles through dimensions and players to ensure fair processing

### 2. **Player Grouping System**
- **Purpose**: When multiple players are close together (within 96 blocks), they share a "group cache" of spawn tiles
- **Benefits**: 
  - Reduces redundant block scanning
  - More efficient tile collection
  - Better spawn rates for multiplayer
- **Group Cache**: Shared tile cache that updates when players move or cache expires

### 3. **Tile Collection System** (`getTilesForPlayer` → `collectDustedTiles` / `collectMiningSpawnTiles`)

#### **Cache System**
- **Global Cache**: `dustedDirtCache` - Stores positions of `mb:dusted_dirt` and `mb:snow_layer` blocks
- **Player Cache**: `playerTileCache` - Caches tiles per player (invalidates when player moves >8 blocks)
- **Group Cache**: `groupCaches` - Shared cache for player groups
- **Cache TTL**: 240 ticks (~12 seconds) for player cache, 600 ticks for dusted dirt cache

#### **Tile Collection Process**:
1. **Check Cache First**: 
   - Validates cached blocks still exist
   - Filters by distance (15-45 blocks from player) - **Validation Phase**
   - Checks for air above (2 blocks of headroom)

2. **Scan Around Cached Tiles** (if cache has 5+ tiles):
   - Scans 8 blocks around each cached tile
   - Much more efficient than full area scan
   - Only does this if cache has enough tiles

3. **Two-Phase Block Discovery System**:
   
   **Discovery Phase** (if cache is empty or has <5 tiles):
   - **Purpose**: Find ALL `dusted_dirt`/`snow_layer` blocks in a larger area to pre-cache them
   - **Horizontal Range**: 0-75 blocks from player (full circle, not just ring)
   - **For New Chunks**: Reduced to 0-20/30 blocks to prevent lag spikes
   - **No Distance Filtering**: Discovers blocks even if outside spawn range (15-45)
   - **Vertical Range**: +30 blocks above / -15 blocks below player Y level (initially, asymmetric)
   - **Query Limit**: 6000 block queries per scan (normal) or 12000 (single player)
   - **Strategy**: 
     - Scans XZ rectangle (151×151 = 22,801 positions for 75-block radius)
     - Checks Y levels from top to bottom
     - Stops early when hitting solid blocks
     - **Note**: Above-ground detection with surface level uses ±8 blocks from surface (symmetric, special case)
   
   **Validation Phase** (after discovery):
   - **Purpose**: Filter discovered blocks to valid spawn range
   - **Horizontal Range**: 15-45 blocks from player (ring area only)
   - **For New Chunks**: 15-20/30 blocks (reduced spawn range)
   - **Filtering**: Removes blocks that are too close (<15) or too far (>45) from player
   - **Result**: Only blocks in valid spawn range are returned for spawning

4. **Expanded Y Range** (if initial scan finds <8 tiles):
   - Expands by additional ±15 blocks vertically (multiplayer) or ±20 blocks (single player)
   - Only if query limit not reached
   - **Result**: Total range becomes +45/-30 (multiplayer) or +50/-35 (single player) after expansion

### 4. **Spawn Attempt System** (`attemptSpawnType`)

#### **Spawn Configs** (`SPAWN_CONFIGS`):
- Each bear type has a config with:
  - `startDay` / `endDay`: When this variant can spawn
  - `baseMaxCount`: Base max count of this type nearby
  - `maxCountStep` / `maxCountStepDays`: How count increases over time
  - `delayTicks`: Minimum ticks between spawn attempts
  - `baseChance`: Base spawn chance
  - `spreadRadius`: How far to search for spawn locations

#### **Spawn Process**:
1. **Check Day**: Must be within `startDay` and `endDay`
2. **Check Delay**: Must have waited `delayTicks` since last spawn
3. **Check Max Count**: Can't exceed `maxCount` nearby entities
4. **Calculate Chance**: 
   - Base chance × multipliers
   - Multipliers include:
     - Day-based scaling (day 20+ gets boost)
     - Density bonus (more tiles = higher chance)
     - Sunrise boost (1.25x for 200 ticks after day 20+)
     - Weather multiplier (rain = 1.2x, thunder = 1.5x)
     - Single player bonus (1.25x to compensate for no group cache)
     - Sunset window (1.35x between ticks 12000-12500)
     - Spawn difficulty state: Based on global difficulty setting (Easy=-1: 0.85x, Normal=0: 1.0x, Hard=1: 1.15x, custom range -5 to +5), multiplies the base chance after other multipliers are applied
5. **Attempt Spawn**: 
   - Tries up to `SPAWN_ATTEMPTS` (18) times
   - Picks random tile from `spacedTiles`
   - Checks if location is valid (air above, solid below)
   - Spawns entity if valid

### 5. **Tile Filtering & Spacing**

#### **Distance Filtering**:
- **Discovery Phase**: Finds all blocks in 0-75 range (or 0-20/30 for new chunks) - no distance filtering
- **Validation Phase**: Filters discovered blocks to 15-45 blocks horizontally (spawn range)
- Prevents spawning too close (<15 blocks) or too far (>45 blocks)
- Blocks discovered outside spawn range are cached for future use when player moves

#### **Spacing Filter** (`filterTilesWithSpacing`):
- Ensures tiles are at least `spacing` blocks apart (default 2.5)
- Prevents clustering
- Day 20+: Spacing adaptively reduced to between 2.0 and 2.5 based on tile density (2.0 for very dense areas with >30 tiles, 2.5 for medium/low density areas with ≤30 tiles)

#### **Sampling**:
- Limits to `MAX_CANDIDATES_PER_SCAN` (180) tiles
- Randomly samples if more tiles found

### 6. **Performance Optimizations**

1. **Player Rotation**: Only processes 1 player per tick
2. **Dimension Rotation**: Processes one dimension per tick
3. **Two-Phase Discovery**: Separates block discovery (0-75 range) from spawn validation (15-45 range), allowing pre-caching of blocks before players move into range
4. **Cache System**: Avoids expensive block scans when possible - blocks discovered in larger radius are cached for reuse
5. **Query Limits**: Caps at 6000 block queries per scan (normal) or 12000 (single player)
6. **Early Breaks**: Stops scanning when hitting solid blocks
7. **Group Caching**: Shares tiles between nearby players
8. **Dimension-Specific Y Bounds**: Prevents spawning in unspawnable locations (Nether ceiling Y=128, void, etc.)

### 7. **Special Features**

#### **Sunrise Boost**:
- Day 20+: 1.25x multiplier for 200 ticks after day change
- Day 25+: Extended duration based on days past victory

#### **Weather Effects**:
- Rain: 1.2x spawn chance
- Thunder: 1.5x spawn chance
- Clear: 1.0x (normal)

#### **Density Bonuses**:
- High tile density (>80): Increases spawn chance
- Very high density (>140): Adds extra spawn attempts

#### **Variant Prioritization**:
- On day 20+, only highest variant of each bear type spawns
- Lower variants are skipped (e.g., day 4 variant skipped if day 8+ available)

## Block Scanning Visualization

### Spatial Chunking System

The world is divided into **128×128 block chunks** for efficient cache management:

```
World Map (Top-Down View):
┌─────────────────────────────────────────────────────────┐
│  Chunk Grid (128×128 blocks each)                       │
│                                                          │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                  │
│  │      │ │      │ │      │ │      │                  │
│  │ Chunk│ │ Chunk│ │ Chunk│ │ Chunk│                  │
│  │ (0,0)│ │ (1,0)│ │ (2,0)│ │ (3,0)│                  │
│  └──────┘ └──────┘ └──────┘ └──────┘                  │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                  │
│  │      │ │      │ │      │ │      │                  │
│  │ Chunk│ │[ACTIVE]│ │[ACTIVE]│ │ Chunk│              │
│  │ (0,1)│ │[ACTIVE]│ │[ACTIVE]│ │ (3,1)│              │
│  └──────┘ └──────┘ └──────┘ └──────┘                  │
│         ┌─────────────┐                                 │
│         │   Player    │  ← Player activates chunks      │
│         │  (256 block │     within 2 chunks (256 blocks)│
│         │   radius)   │                                 │
│         └─────────────┘                                 │
└─────────────────────────────────────────────────────────┘
```

**Chunk States:**
- **Active**: Player is within 2 chunks (256 blocks) - cache is used
- **Inactive**: Player left - cache is saved but not checked
- **Trimmed**: Not visited in 1 hour - cache is deleted

### Block Scanning Process

#### Step 1: Active Chunk Detection
```
Player Position: (1000, 70, 2000)

Active Chunks (2 chunk radius):
┌─────────────────────────────────────┐
│  Chunk (7,15)  │  Chunk (8,15)     │
│  Chunk (7,16)  │  Chunk (8,16)  ← Player here
│  Chunk (7,17)  │  Chunk (8,17)     │
└─────────────────────────────────────┘

Only cache entries from these 9 chunks are checked!
```

#### Step 2: Two-Phase Distance-Based Scanning

**Discovery Phase (Top-Down View):**
```
                    Player (P)
                      │
                      │
         ┌────────────┼────────────┐
         │            │          │
         │ Discovery  │ Discovery │ Discovery
         │  Phase     │  Phase   │  Phase
         │  (0-15)    │ (15-45)  │ (45-75)
         │            │          │
         │            │          │
         └────────────┼────────────┘
                      │
                      │
    Discovery: Full circle 0-75 blocks
    (Finds ALL blocks, caches them)
```

**Validation Phase (Top-Down View):**
```
                    Player (P)
                      │
                      │
         ┌────────────┼────────────┐
         │            │          │
         │   Too      │  Valid   │  Too
         │   Close    │  Range   │  Far
         │  (<15)     │ (15-45)  │ (>45)
         │            │          │
         │            │          │
         └────────────┼────────────┘
                      │
                      │
    Validation: Ring between 15-45 blocks
    (Filters discovered blocks to spawn range)
```

**Combined Two-Phase Visualization:**
```
                    Player (P)
                      │
                      │
    ┌─────────────────┼─────────────────┐
    │                 │                 │
    │   Discovery     │   Discovery     │   Discovery
    │   Phase         │   Phase         │   Phase
    │   (0-15)        │   (15-45)       │   (45-75)
    │   [Cached]      │   [Cached]      │   [Cached]
    │   [Not Used]    │   [Used]        │   [Not Used]
    │                 │                 │
    │   Too Close     │   ✓ Valid       │   Too Far
    │   (Filtered)    │   Spawn Range   │   (Filtered)
    │                 │                 │
    └─────────────────┼─────────────────┘
                      │
                      │
    Discovery: Scans 0-75 blocks (full circle)
    Validation: Filters to 15-45 blocks (ring)
    
    Result: Blocks in 15-45 range are used for spawning
            Blocks in 0-15 and 45-75 are cached for future use
```

**Combined Two-Phase Visualization:**
```
                    Player (P)
                      │
                      │
    ┌─────────────────┼─────────────────┐
    │                 │                 │
    │   Discovery     │   Discovery     │   Discovery
    │   Phase         │   Phase         │   Phase
    │   (0-15)        │   (15-45)       │   (45-75)
    │   [Cached]      │   [Cached]      │   [Cached]
    │   [Not Used]    │   [Used]        │   [Not Used]
    │                 │                 │
    │   Too Close     │   ✓ Valid       │   Too Far
    │   (Filtered)    │   Spawn Range   │   (Filtered)
    │                 │                 │
    └─────────────────┼─────────────────┘
                      │
                      │
    Discovery: Scans 0-75 blocks (full circle)
    Validation: Filters to 15-45 blocks (ring)
    
    Result: Blocks in 15-45 range are used for spawning
            Blocks in 0-15 and 45-75 are cached for future use
```

**Key Difference:**
- **Discovery Phase**: Scans 0-75 blocks to find ALL blocks (no distance filtering)
- **Validation Phase**: Filters discovered blocks to 15-45 spawn range
- Blocks discovered outside spawn range (0-15 and 45-75) are cached but not used for spawning
- When player moves, cached blocks may enter spawn range without needing a new scan

**Vertical Scanning (Side View):**
```
Adaptive Y Range Based on Player Y Level:

Default Range (Most Cases):
┌─────────────────────────────────────┐
│  Y=101  ← +30 blocks up             │
│  ...                                 │
│  Y=71   ← Player (example)           │
│  ...                                 │
│  Y=56   ← -15 blocks down            │
└─────────────────────────────────────┘
Total: 45 blocks (asymmetric: +30/-15)

Above Ground with Surface Detection:
┌─────────────────────────────────────┐
│  Y=79   ← +8 blocks from surface    │
│  ...                                 │
│  Y=71   ← Surface level             │
│  ...                                 │
│  Y=63   ← -8 blocks from surface    │
└─────────────────────────────────────┘
Total: 16 blocks (symmetric: ±8 from surface)

Underground (Same as Default):
┌─────────────────────────────────────┐
│  Y=60   ← +30 blocks up              │
│  ...                                 │
│  Y=30   ← Player (example)          │
│  ...                                 │
│  Y=15   ← -15 blocks down            │
└─────────────────────────────────────┘
Total: 45 blocks (asymmetric: +30/-15)

Expansion (if <8 tiles found):
┌─────────────────────────────────────┐
│  Y=116  ← +30 +15 = +45 up          │
│  ...                                 │
│  Y=71   ← Player                     │
│  ...                                 │
│  Y=41   ← -15 -15 = -30 down        │
└─────────────────────────────────────┘
Total: 75 blocks (multiplayer: +45/-30)
```

#### Step 3: Cluster Detection (10×10 Scan)

When a `dusted_dirt` or `snow_layer` block is found:

```
Found Block at (100, 70, 200):
┌─────────────────────────────────────┐
│  [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ]│
│  [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ]│
│  [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ]│
│  [ ] [ ] [ ] [ ] [X] [ ] [ ] [ ] [ ]│
│  [ ] [ ] [ ] [X] [★] [X] [ ] [ ] [ ]│  ← 10×10 scan
│  [ ] [ ] [ ] [ ] [X] [ ] [ ] [ ] [ ]│     area (5 blocks
│  [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ]│     in each direction)
│  [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ]│
│  [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ]│
│  [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ]│
└─────────────────────────────────────┘
★ = Found block
X = Additional blocks found in 10×10 scan
[ ] = Checked positions

This finds clusters of dusted_dirt/snow_layer efficiently!
```

### Complete Scanning Flow

```
1. Player Position: (1000, 70, 2000)
   ↓
2. Update Active Chunks (9 chunks within 256 blocks)
   ↓
3. Check Cache (only from active chunks)
   ├─ Found 20 cached blocks ✓
   └─ Validate: Still exist? Distance 15-45? Air above?
   ↓
4. Scan Around Cached Blocks (if cache has 5+ tiles)
   ├─ For each cached block:
   │  └─ Scan 10×10 area around it
   └─ Find additional nearby blocks
   ↓
5. Discovery Phase Scan (if cache insufficient)
   ├─ Horizontal: Full circle 0-75 blocks from player (or 0-20/30 for new chunks)
   ├─ Vertical: Adaptive range based on environment
   │  ├─ Default: +30/-15 blocks (asymmetric)
   │  ├─ Above ground with surface detection: ±8 blocks from surface (symmetric)
   │  └─ Expansion (if <8 tiles found): ±15 (multiplayer) or ±20 (single player)
   ├─ Query limit: 6000 (normal) or 12000 (single player)
   └─ **No distance filtering** - finds ALL blocks in discovery radius
   ↓
6. For Each Found Block (Discovery Phase):
   ├─ Check 10×10 area around it
   ├─ Register in cache (with chunk key) - **Cached even if outside spawn range**
   └─ Add to candidates (all discovered blocks)
   ↓
7. Validation Phase - Filter Discovered Blocks:
   ├─ Distance: Filter to 15-45 blocks ✓ (removes blocks <15 or >45)
   ├─ Log filtering results (X discovered → Y in spawn range)
   └─ Blocks outside spawn range remain cached for future use
   ↓
8. Filter & Space Candidates
   ├─ Distance: Already filtered to 15-45 blocks ✓
   ├─ Spacing: 2.5 blocks minimum
   └─ Sample: Max 180 tiles
   ↓
9. Spawn Attempts
   └─ Use filtered tiles for spawning
```

### Two-Phase System Flow Visualization

```
┌─────────────────────────────────────────────────────────────┐
│                    DISCOVERY PHASE                          │
│                                                              │
│  Player Position: (1000, 70, 2000)                          │
│                                                              │
│         ┌───────────────────────────────────┐                │
│         │                                   │                │
│         │   Discovery Radius: 0-75 blocks  │                │
│         │                                   │                │
│         │   ┌─────────────────────────┐   │                │
│         │   │                         │   │                │
│         │   │   Spawn Range: 15-45    │   │                │
│         │   │                         │   │                │
│         │   │      ┌───────┐         │   │                │
│         │   │      │ Player │         │   │                │
│         │   │      └───────┘         │   │                │
│         │   │                         │   │                │
│         │   └─────────────────────────┘   │                │
│         │                                   │                │
│         └───────────────────────────────────┘                │
│                                                              │
│  Scans: ALL blocks in 0-75 range                            │
│  Result: Finds 50 blocks total                              │
│  Cache: All 50 blocks registered in cache                   │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                    VALIDATION PHASE                          │
│                                                              │
│         ┌───────────────────────────────────┐                │
│         │                                   │                │
│         │   [Filtered Out]                 │                │
│         │   Blocks 0-15: 8 blocks          │                │
│         │   (Too close - cached only)     │                │
│         │                                   │                │
│         │   ┌─────────────────────────┐   │                │
│         │   │ ✓ VALID SPAWN RANGE     │   │                │
│         │   │   Blocks 15-45: 30 blocks│   │                │
│         │   │   (Used for spawning)    │   │                │
│         │   └─────────────────────────┘   │                │
│         │                                   │                │
│         │   [Filtered Out]                 │                │
│         │   Blocks 45-75: 12 blocks       │                │
│         │   (Too far - cached only)       │                │
│         │                                   │                │
│         └───────────────────────────────────┘                │
│                                                              │
│  Filters: 50 discovered → 30 in spawn range              │
│  Result: 30 blocks available for spawning                 │
│  Cache: All 50 blocks remain cached for future use          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                    SPAWN ATTEMPTS                            │
│                                                              │
│  Uses: 30 validated blocks (15-45 range)                    │
│  After spacing filter: 12 spaced tiles                     │
│  Spawn attempts: Up to 18 attempts per bear type            │
└─────────────────────────────────────────────────────────────┘
```

**Benefits of Two-Phase System:**
1. **Pre-caching**: Blocks discovered outside spawn range are cached before player moves into range
2. **Reduced Rescans**: When player moves, cached blocks may enter spawn range without new scan
3. **Better Performance**: Discovery happens once, validation is fast filtering
4. **Smoother Gameplay**: Less lag when players move to new areas

### Cache Lifecycle

```
Block Found → Registered in Cache
     │
     ├─ Chunk Key: "7,15" (calculated from X,Z)
     ├─ Stored: {x, y, z, tick, dimension, chunkKey}
     └─ Chunk Tracked: chunkLastVisit["7,15"] = currentTick
          │
          ├─ Player Near Chunk (within 256 blocks)
          │  └─ Chunk Activated → Cache Used ✓
          │
          ├─ Player Leaves Chunk
          │  └─ Chunk Deactivated → Cache Saved (not used)
          │
          ├─ Player Returns
          │  └─ Chunk Reactivated → Cache Used Again ✓
          │
          └─ Not Visited for 1 Hour
             └─ Chunk Trimmed → Cache Deleted
```

### Performance Benefits

1. **Spatial Chunking**: Only checks cache from nearby chunks (9 chunks vs entire world)
2. **Cluster Detection**: 10×10 scan finds multiple blocks with minimal queries
3. **Adaptive Y Range**: Reduces unnecessary deep scanning when above ground
4. **Persistent Cache**: Blocks remembered when you return to an area
5. **Smart Trimming**: Only removes chunks not visited in 1+ hour

### Current Settings

- **Chunk Size**: 128×128 blocks
- **Activation Radius**: 2 chunks (256 blocks)
- **Discovery Radius**: 0-75 blocks from player (normal chunks) or 0-20/30 blocks (new chunks)
- **Spawn Range**: 15-45 blocks from player (validation phase filters to this)
- **Cluster Scan**: 10×10 area (5 blocks each direction)
- **Y Range (Default)**: +30/-15 blocks (asymmetric)
- **Y Range (Above Ground with Surface)**: ±8 blocks from surface (symmetric)
- **Y Range Expansion**: ±15 blocks (multiplayer) or ±20 blocks (single player)
- **Cache Trim Age**: 1 hour (72000 ticks)
- **Query Limit**: 6000 (normal) / 12000 (single player)
- **Dimension Y Bounds**: 
  - Nether: -64 to 127 (ceiling at Y=128)
  - Overworld/End: -64 to 320

