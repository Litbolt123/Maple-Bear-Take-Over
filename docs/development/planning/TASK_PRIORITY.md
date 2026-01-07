# Task Priority List - Easiest to Hardest

## 🟢 EASY (Quick Checks/Fixes)

### 1. ✅ Check Daily Logs for Mining/Flying/Torpedo Spawns - COMPLETED
**Difficulty**: ⭐ (Easiest)  
**Time**: ~5 minutes  
**Task**: Verify if daily log entries exist for when mining (day 15), flying (day 11), and torpedo (day 17) bears start spawning. If missing, add them.

**Status**: ✅ **COMPLETED**
- Added daily log entries for:
  - Day 11: Flying Bears start spawning
  - Day 15: Mining Bears start spawning  
  - Day 17: Torpedo Bears start spawning
- Updated `MILESTONE_DAYS` array to include these days
- Updated milestone sound/message triggers

**Files to check**:
- `BP/scripts/main.js` - Check `recordDailyEvent` calls
- `BP/scripts/mb_codex.js` - Check daily log display

---

### 2. ✅ Document Heat-Seeking Vision System - COMPLETED
**Difficulty**: ⭐ (Easiest)  
**Time**: ~15 minutes  
**Task**: Read and document how the heat-seeking vision works in torpedo and mining AI systems.

**Status**: ✅ **COMPLETED**
- Created comprehensive documentation: `docs/development/HEAT_SEEKING_VISION.md`
- Documented Torpedo Bear vision (3 blocks through walls)
- Documented Mining Bear vision (5 blocks standard, 8 blocks under targets)
- Included technical details, gameplay implications, and comparison table

**Files to read**:
- `BP/scripts/mb_torpedoAI.js` - `canSeeTargetThroughBlocks()` function (line ~616)
- `BP/scripts/mb_miningAI.js` - Similar targeting logic

**What to document**:
- How many blocks can be seen through (3 blocks for torpedo)
- How it detects targets through walls
- When it breaks blocks vs. when it can see through them
- Backoff behavior after breaking blocks

---

## 🟡 EASY-MEDIUM (Straightforward Implementation)

### 3. ✅ Record Infected Player Deaths in Daily Logs - COMPLETED
**Difficulty**: ⭐⭐  
**Time**: ~20 minutes  
**Task**: When an infected player dies (transforms into bear), record it in the daily log for all players (since it's already in global chat).

**Status**: ✅ **COMPLETED**
- Added daily log recording in both `handleInfectionExpiration()` and `handleInfectedPlayerDeath()` functions
- Events are recorded for all players and appear in the journal one day after they occur (reflection format)
- Different messages for timer expiration vs. killed by bear

**Files to modify**:
- `BP/scripts/main.js` - `handleInfectedPlayerDeath()` function
- `BP/scripts/main.js` - `handleInfectionExpiration()` function
- Use `recordDailyEvent()` to log player deaths

**Implementation**:
- Hook into existing death handlers
- Record event like: `"[PlayerName] has been consumed by the infection and transformed into a Maple Bear."`
- Store in daily log for the next day (reflection format)

---

### 4. ✅ Fix Day 8 Variant Unlock Triggering on Day 5 - COMPLETED
**Difficulty**: ⭐⭐  
**Time**: ~30 minutes  
**Task**: Day 8 variants are unlocking on day 5 when players see bears attack animals. Need to add day checks.

**Status**: ✅ **COMPLETED**
- Fixed kill-based variant unlocks to only trigger when current day >= required day
- Day 8 variants: kill unlock only works on day 8+
- Day 13 variants: kill unlock only works on day 13+
- Day 20 variants: kill unlock only works on day 20+
- Day-based unlocks still work as before (unlock when day is reached)

**Files to modify**:
- `BP/scripts/main.js` - `checkVariantUnlock()` function (line ~566)
- `BP/scripts/main.js` - `trackMobKill()` function (line ~446)

**Issue**: The unlock logic checks for 3 kills of day 4+ variants OR day >= 8, but it's not properly gating the day 8 unlock message.

**Fix**: Ensure day 8 variant unlock messages only show when `currentDay >= 8`, even if the kill condition is met earlier.

---

### 5. ✅ Normal Golden Apple Reduces Infection - COMPLETED
**Difficulty**: ⭐⭐  
**Time**: ~30 minutes  
**Task**: Eating a normal golden apple reduces snow count by a certain amount. Enchanted golden apple still requires weakness and is the only cure.

**Status**: ✅ **COMPLETED**
- Added infection reduction logic to normal golden apple handler
- Reduces snow count by 0.5 per golden apple consumed
- Shows message to player with updated snow count
- Does not cure infection (only enchanted + weakness does that)
- Updates max snow level tracking

**Files to modify**:
- `BP/scripts/main.js` - Add handler for `minecraft:golden_apple` (similar to enchanted apple handler at line ~2060)
- Reduce `snowCount` by a fixed amount (e.g., 0.5 or 1.0)
- Show message to player
- Don't cure infection (only enchanted + weakness does that)

---

## 🟠 MEDIUM (Requires System Integration)

### 6. ✅ Weather Reduces Spawns (Except Thunderstorms) - COMPLETED
**Difficulty**: ⭐⭐⭐  
**Time**: ~45 minutes  
**Task**: Weather (rain, snow) should reduce Maple Bear spawn rates. Thunderstorms should NOT reduce spawns (or even increase them).

**Status**: ✅ **COMPLETED**
- Implemented weather detection system using command-based approach (Script API doesn't support weather directly)
- Weather cache system for performance (updates every 10 seconds)
- Weather multipliers: Rain = 0.7x, Snow = 0.7x, Thunderstorm = 1.0x, Clear = 1.0x
- Integrated into spawn chance multiplier system
- Weather detection runs asynchronously and updates cache periodically

**Files to modify**:
- `BP/scripts/mb_spawnController.js` - Main spawn loop (line ~2397)
- Need to check weather API: `dimension.getWeather()`

**Implementation**:
- Check weather before calculating spawn chances
- Apply multiplier: Rain = 0.7x, Snow = 0.7x, Thunderstorm = 1.0x (or 1.2x)
- Integrate with existing `chanceMultiplier` system

**Current state**: Need to check if weather is already being considered (doesn't appear to be).

---

### 7. ✅ Buff Bear Spawn Rarity & Player Count Caps - COMPLETED
**Difficulty**: ⭐⭐⭐  
**Time**: ~1 hour  
**Task**: 
- Make buff bears even more rare
- Decrease extra chance when multiple players nearby
- Cap: 1 buff bear for 2 players, 2 for 3 players, 3 for 5+ players

**Status**: ✅ **COMPLETED**
- Reduced all buff bear spawn chances by 30-40%:
  - BUFF_BEAR_ID: baseChance 0.032 → 0.020, chancePerDay 0.0025 → 0.0015, maxChance 0.06 → 0.04
  - BUFF_BEAR_DAY13_ID: baseChance 0.028 → 0.018, chancePerDay 0.002 → 0.0012, maxChance 0.07 → 0.05
  - BUFF_BEAR_DAY20_ID: baseChance 0.035 → 0.022, chancePerDay 0.0015 → 0.001, maxChance 0.065 → 0.045
- Increased spawn delays (slower spawn rate)
- Reduced multiplayer bonus: Now scales from 0.7x (2 players) to 0.6x (5+ players) instead of flat 0.5x
- Implemented dynamic caps based on nearby player count:
  - 1-2 players: Max 1 buff bear
  - 3-4 players: Max 2 buff bears
  - 5+ players: Max 3 buff bears

**Files to modify**:
- `BP/scripts/mb_spawnController.js` - Buff bear configs (lines ~538, 550, 606)
- `BP/scripts/mb_spawnController.js` - Player count logic (line ~2637)
- `BP/scripts/mb_spawnController.js` - Buff bear cap check (line ~2192)

**Changes needed**:
- Reduce `baseChance` and `chancePerDay` for all buff bear variants
- Reduce multiplayer chance bonus
- Replace hardcoded cap of 5 with dynamic cap based on player count:
  - 1 player: 1 buff bear
  - 2 players: 1 buff bear
  - 3 players: 2 buff bears
  - 4 players: 2 buff bears
  - 5+ players: 3 buff bears

---

## 🔴 HARD (Complex AI/System Work)

### 8. Optimize AI Systems
**Difficulty**: ⭐⭐⭐⭐  
**Time**: ~2-3 hours  
**Task**: Performance optimization across mining, torpedo, and flying AI systems.

**Areas to optimize**:
- Reduce tick frequency where possible
- Cache expensive calculations
- Limit processing distance
- Batch operations
- Reduce entity queries

**Files to review**:
- `BP/scripts/mb_miningAI.js`
- `BP/scripts/mb_torpedoAI.js`
- `BP/scripts/mb_flyingAI.js`

**Current optimizations already present**:
- Mining AI: `AI_TICK_INTERVAL = 2`, `TARGET_CACHE_TICKS = 5`, `MAX_PROCESSING_DISTANCE = 64`
- Need to verify these are working and add more if needed

**Implementation Plan**:
1. **Audit current optimizations** (15 min)
   - Verify AI_TICK_INTERVAL is being used correctly
   - Check target cache is working
   - Verify MAX_PROCESSING_DISTANCE is enforced
   
2. **Mining AI optimizations** (45 min)
   - Review entity queries (getEntities calls)
   - Optimize block scanning (reduce frequency)
   - Cache pathfinding calculations
   - Batch leader/follower assignments
   
3. **Torpedo AI optimizations** (30 min)
   - Review target detection frequency
   - Cache structure block queries
   - Optimize block breaking checks
   
4. **Flying AI optimizations** (30 min)
   - Review target scanning
   - Cache air spawn tile calculations
   - Optimize movement calculations
   
5. **Cross-AI optimizations** (30 min)
   - Shared target cache between AIs
   - Reduce duplicate player queries
   - Optimize dimension checks

---

### 9. Mining AI: Leaders/Followers & Multi-Directional Mining
**Difficulty**: ⭐⭐⭐⭐⭐  
**Time**: ~4-6 hours  
**Task**: 
- Implement leader/follower system where followers take over when leader dies
- Fix linear mining - allow mining in multiple directions
- Improve upward/downward mining towards targets
- Better pathfinding when targets are in caves

**Files to modify**:
- `BP/scripts/mb_miningAI.js` - Major refactoring needed

**Current issues**:
- Mining bears get stuck mining one direction
- Don't mine downwards/upwards well
- Don't adapt when target is in a cave in front of them

**Implementation needed**:
- Leader assignment system (already has some follower logic)
- Leader death handler → promote follower
- Multi-directional pathfinding
- Better target detection in 3D space
- Cave-aware mining logic

**Implementation Plan**:
1. **Leader death handler** (1 hour)
   - Subscribe to entity death events for mining bears
   - When leader dies, find nearest follower
   - Promote follower to leader
   - Reassign remaining followers to new leader
   - Update leaderSummaryById map
   
2. **Multi-directional pathfinding** (2 hours)
   - Current: Bears mine in one direction (forward)
   - Fix: Check all 6 directions (N, S, E, W, Up, Down) when stuck
   - Add direction priority system:
     - Primary: Towards target
     - Secondary: Up/Down if target is above/below
     - Tertiary: Lateral if blocked
   - Implement direction change logic when blocked
   
3. **Improved vertical mining** (1 hour)
   - Better upward mining: Check if target is above, mine up
   - Better downward mining: Check if target is below, mine down
   - Fix: Current system doesn't mine well vertically
   - Add vertical pathfinding checks
   
4. **Cave-aware mining** (1 hour)
   - Detect when target is in a cave in front
   - Instead of mining forward blindly, check if cave exists
   - Mine towards cave entrance if detected
   - Use heat-seeking vision to detect caves
   
5. **Testing & refinement** (1 hour)
   - Test leader promotion
   - Test multi-directional mining
   - Test vertical mining improvements
   - Test cave detection

---

### 10. Mining Bears Spawn in Mineshafts
**Difficulty**: ⭐⭐⭐⭐⭐  
**Time**: ~3-4 hours  
**Task**: Mining bears should spawn naturally in mineshafts, even without snow/dusted dirt.

**Files to modify**:
- `BP/scripts/mb_spawnController.js` - Add mineshaft detection
- `BP/spawn_rules/` - May need custom spawn rules

**Implementation needed**:
- Detect mineshaft structures (structure blocks or biome-based)
- Add mineshaft spawn tiles to spawn pool
- Lower spawn chance but guaranteed presence in mineshafts
- May need structure detection API or biome-based detection

**Challenges**:
- Minecraft Bedrock structure detection is limited
- May need to detect by block patterns (fence posts, rails, planks)
- Or use biome-based detection if mineshafts have unique biomes

**Implementation Plan**:
1. **Mineshaft detection system** (1.5 hours)
   - Method 1: Block pattern detection
     - Scan for mineshaft blocks: rails, fence posts, planks, cobwebs
     - Look for patterns: rails + planks + fence posts together
     - Cache detected mineshaft locations
   - Method 2: Structure detection (if available)
     - Use `/locate structure minecraft:mineshaft` command
     - Parse results and cache locations
   - Method 3: Biome-based (fallback)
     - Check if certain biomes have higher mineshaft density
   
2. **Mineshaft spawn tile generation** (1 hour)
   - Add function: `collectMineshaftSpawnTiles()`
   - Scan detected mineshafts for valid spawn locations
   - Requirements: Air block, solid floor, within spawn range
   - Add to spawn pool with special flag
   
3. **Integrate into spawn system** (1 hour)
   - Add mineshaft tiles to mining bear spawn pool
   - Lower spawn chance (mineshafts are special, not common)
   - Ensure at least 1 mining bear spawns in mineshafts when detected
   - Only for mining bears (not other types)
   
4. **Testing & refinement** (30 min)
   - Test mineshaft detection
   - Test spawn rates
   - Verify bears spawn correctly

---

### 11. Maple Bears Spawn in Other Dimensions
**Difficulty**: ⭐⭐⭐⭐⭐  
**Time**: ~4-6 hours  
**Task**: Extend spawning system to Nether and End dimensions.

**Files to modify**:
- `BP/scripts/mb_spawnController.js` - Dimension filtering
- `BP/biomes/mb_infected_biome.json` - May need dimension-specific biomes
- `BP/spawn_rules/` - Dimension-specific spawn rules

**Implementation needed**:
- Remove or modify dimension restrictions
- Add Nether-specific variants (fire/lava-proof)
- Add End-specific spawn logic (more flying/torpedo)
- Handle dimension-specific block detection (netherrack, end stone)
- Test spawn rates per dimension

**Current state**: Need to check if dimensions are currently restricted.

**Implementation Plan**:
1. **Audit current dimension restrictions** (30 min)
   - Check spawn controller for dimension filters
   - Check if dusted_dirt detection works in other dimensions
   - Identify what needs to change
   
2. **Nether implementation** (2 hours)
   - Remove dimension restriction for Nether
   - Add netherrack detection (alternative to dusted_dirt)
   - Create fire/lava-proof bear variants (or use existing)
   - Adjust spawn rates for Nether (lower density)
   - Test: Bears spawn in Nether, don't burn in lava
   
3. **End implementation** (1.5 hours)
   - Remove dimension restriction for End
   - Add end stone detection (alternative to dusted_dirt)
   - Increase flying/torpedo bear spawn rates in End
   - Adjust spawn rates for End (lower density, more air spawns)
   - Test: Bears spawn in End, more flying/torpedo
   
4. **Dimension-specific block detection** (1 hour)
   - Update `collectDustedTiles()` to work in all dimensions
   - Add netherrack/end stone as valid spawn blocks
   - Update cache system for multi-dimension support
   - Handle dimension-specific block types
   
5. **Testing & balance** (1 hour)
   - Test spawn rates in each dimension
   - Verify bears don't spawn too frequently
   - Test variant distribution (Nether vs End vs Overworld)
   - Balance spawn rates per dimension

---

## 📊 Summary

| Task | Difficulty | Estimated Time | Priority |
|------|-----------|----------------|----------|
| Check daily logs | ⭐ | 5 min | Do first |
| Document heat-seeking | ⭐ | 15 min | Do first |
| Record player deaths | ⭐⭐ | 20 min | Quick win |
| Fix day 8 unlock bug | ⭐⭐ | 30 min | Bug fix |
| Golden apple reduction | ⭐⭐ | 30 min | Feature |
| Weather spawn reduction | ⭐⭐⭐ | 45 min | Feature |
| Buff bear rarity/caps | ⭐⭐⭐ | 1 hour | Balance |
| Optimize AIs | ⭐⭐⭐⭐ | 2-3 hours | Performance |
| Mining AI improvements | ⭐⭐⭐⭐⭐ | 4-6 hours | Major refactor |
| Mineshaft spawning | ⭐⭐⭐⭐⭐ | 3-4 hours | Feature |
| Other dimensions | ⭐⭐⭐⭐⭐ | 4-6 hours | Major feature |

---

## 🎯 Recommended Order

1. **Check daily logs** (5 min) - Quick verification
2. **Document heat-seeking** (15 min) - Understanding before changes
3. **Record player deaths** (20 min) - Quick feature
4. **Fix day 8 unlock** (30 min) - Bug fix
5. **Golden apple reduction** (30 min) - Feature
6. **Weather spawn reduction** (45 min) - Feature
7. **Buff bear adjustments** (1 hour) - Balance pass
8. **Optimize AIs** (2-3 hours) - Performance before major changes
9. **Mining AI improvements** (4-6 hours) - Major work
10. **Mineshaft spawning** (3-4 hours) - Feature
11. **Other dimensions** (4-6 hours) - Major feature

**Total estimated time for all tasks**: ~18-24 hours of work

