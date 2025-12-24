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
   - Filters by distance (15-45 blocks from player)
   - Checks for air above (2 blocks of headroom)

2. **Scan Around Cached Tiles** (if cache has 5+ tiles):
   - Scans 8 blocks around each cached tile
   - Much more efficient than full area scan
   - Only does this if cache has enough tiles

3. **Full Area Scan** (if cache is empty or has <5 tiles):
   - **Horizontal Range**: 15-45 blocks from player (ring area)
   - **Vertical Range**: +30 blocks above / -15 blocks below player Y level (initially, asymmetric)
   - **Query Limit**: 6000 block queries per scan
   - **Strategy**: 
     - Scans XZ rectangle (97×97 = 9,409 positions)
     - Filters to ring area (≈5,655 positions)
     - Checks Y levels from top to bottom
     - Stops early when hitting solid blocks
   - **Note**: Above-ground detection with surface level uses ±8 blocks from surface (symmetric, special case)

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
- Only tiles within 15-45 blocks horizontally are valid
- Prevents spawning too close or too far

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
3. **Cache System**: Avoids expensive block scans when possible
4. **Query Limits**: Caps at 6000 block queries per scan
5. **Early Breaks**: Stops scanning when hitting solid blocks
6. **Group Caching**: Shares tiles between nearby players

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

#### Step 2: Distance-Based Scanning

**Horizontal Scanning (Top-Down View):**
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
         Scan Area: Ring between 15-45 blocks
```

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
5. Full Area Scan (if cache insufficient)
   ├─ Horizontal: Ring 15-45 blocks from player
   ├─ Vertical: Adaptive range based on environment
   │  ├─ Default: +30/-15 blocks (asymmetric)
   │  ├─ Above ground with surface detection: ±8 blocks from surface (symmetric)
   │  └─ Expansion (if <8 tiles found): ±15 (multiplayer) or ±20 (single player)
   └─ Query limit: 6000 (normal) or 12000 (single player)
   ↓
6. For Each Found Block:
   ├─ Check 10×10 area around it
   ├─ Register in cache (with chunk key)
   └─ Add to candidates if valid
   ↓
7. Filter & Space Candidates
   ├─ Distance: 15-45 blocks ✓
   ├─ Spacing: 2.5 blocks minimum
   └─ Sample: Max 180 tiles
   ↓
8. Spawn Attempts
   └─ Use filtered tiles for spawning
```

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
- **Distance Range**: 15-45 blocks from player
- **Cluster Scan**: 10×10 area (5 blocks each direction)
- **Y Range (Default)**: +30/-15 blocks (asymmetric)
- **Y Range (Above Ground with Surface)**: ±8 blocks from surface (symmetric)
- **Y Range Expansion**: ±15 blocks (multiplayer) or ±20 blocks (single player)
- **Cache Trim Age**: 1 hour (72000 ticks)
- **Query Limit**: 6000 (normal) / 12000 (single player)

