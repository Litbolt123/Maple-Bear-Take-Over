# Implementation Plan - Remaining Hard Tasks

This document tracks the detailed implementation plan for tasks 8-11.

## Current Status

**Completed Tasks**: 1-7 ✅  
**In Progress**: None  
**Next Up**: Task 8 - Optimize AI Systems

---

## Task 8: Optimize AI Systems

### Phase 1: Audit Current Optimizations ✅
- [x] Review existing optimization constants
- [x] Verify AI_TICK_INTERVAL is enforced
- [x] Verify TARGET_CACHE_TICKS is working
- [x] Verify MAX_PROCESSING_DISTANCE is enforced
- [x] Document current performance bottlenecks

### Phase 2: Mining AI Optimizations
- [ ] Reduce entity queries (getEntities calls)
- [x] Optimize block scanning frequency ✅
- [x] Cache block lookups in getBlock() function ✅
- [x] Periodic cache cleanup to prevent memory bloat ✅
- [ ] Cache pathfinding calculations (future optimization)
- [x] Batch leader/follower assignments ✅
- [x] Optimize target detection loops ✅

### Phase 3: Torpedo AI Optimizations ✅
- [x] Add AI_TICK_INTERVAL (runs every 2 ticks)
- [x] Add target caching (TARGET_CACHE_TICKS = 5)
- [ ] Cache structure block queries
- [ ] Optimize block breaking checks
- [ ] Reduce redundant calculations

### Phase 4: Flying AI Optimizations ✅
- [x] Add AI_TICK_INTERVAL (runs every 2 ticks)
- [x] Add target caching (TARGET_CACHE_TICKS = 5)
- [ ] Cache air spawn tile calculations
- [ ] Optimize movement calculations
- [ ] Reduce entity queries

### Phase 5: Cross-AI Optimizations ✅
- [x] Shared player cache system (mb_sharedCache.js)
- [x] Reduce duplicate player queries across all AIs
- [ ] Shared target cache between AIs (future optimization)
- [ ] Optimize dimension checks
- [ ] Batch operations where possible

---

## Task 9: Mining AI Improvements

### Phase 1: Leader Death Handler ✅
- [x] Subscribe to entity death events
- [x] Detect when mining bear leader dies
- [x] Find nearest follower
- [x] Promote follower to leader
- [x] Reassign remaining followers
- [x] Track leader-follower relationships
- [x] Clean up mappings on death
- [ ] Test leader promotion (needs in-game testing)

### Phase 2: Multi-Directional Pathfinding ✅
- [x] Add direction priority system
- [x] Check all 6 directions when stuck (N, S, E, W, Up, Down)
- [x] Implement direction change logic
- [x] Add "stuck detection" system
- [ ] Test multi-directional mining (needs in-game testing)

### Phase 3: Improved Vertical Mining ✅
- [x] Better upward mining detection (needsVerticalMining function with VERTICAL_MINING_THRESHOLD)
- [x] Better downward mining detection (checks path and floor)
- [x] Add vertical pathfinding checks (VERTICAL_PATH_CHECK_DISTANCE)
- [x] Fix vertical mining logic (aggressive upward/downward modes)
- [ ] Test upward/downward mining (needs in-game testing)

### Phase 4: Debug Menu Integration ✅
- [x] Add "Pathfinding Debug" option to Mining AI Debug menu
- [x] Add "Vertical Mining Debug" option to Mining AI Debug menu
- [x] Add getDebugVertical() helper function
- [x] Add debug logging to needsVerticalMining function
- [x] Add debug logging to aggressive upward/downward mining

### Phase 5: Cave-Aware Mining ✅
- [x] Detect caves in front of bear (detectCaveAhead function with heat-seeking vision)
- [x] Mine towards cave entrance (shouldMineTowardsCave function)
- [x] Use heat-seeking vision for cave detection (raycast through up to 5 breakable blocks)
- [x] Enhanced cave mining when cave detected (more aggressive, checks diagonals)
- [x] Cave detection integrated with stuck detection (prioritizes caves when stuck)
- [ ] Test cave detection and mining (needs in-game testing)

### Phase 6: Testing & Refinement
- [ ] Test all improvements together
- [ ] Fix any bugs
- [ ] Performance check
- [ ] Final polish

---

## Task 10: Mining Bears Spawn in Mineshafts

### Phase 1: Mineshaft Detection
- [ ] Implement block pattern detection
- [ ] Scan for mineshaft blocks (rails, fence posts, planks)
- [ ] Cache detected mineshaft locations
- [ ] Alternative: Command-based detection
- [ ] Test detection accuracy

### Phase 2: Spawn Tile Generation
- [ ] Create `collectMineshaftSpawnTiles()` function
- [ ] Scan mineshafts for valid spawn locations
- [ ] Validate spawn requirements
- [ ] Add to spawn pool with special flag
- [ ] Test tile generation

### Phase 3: Integration
- [ ] Add mineshaft tiles to mining bear spawn pool
- [ ] Set lower spawn chance
- [ ] Ensure guaranteed spawn in mineshafts
- [ ] Only for mining bears
- [ ] Test spawn rates

### Phase 4: Testing
- [ ] Test mineshaft detection
- [ ] Test spawn rates
- [ ] Verify bears spawn correctly
- [ ] Balance spawn frequency

---

## Task 11: Maple Bears Spawn in Other Dimensions

### Phase 1: Audit Current System
- [ ] Check dimension restrictions in spawn controller
- [ ] Check dusted_dirt detection in other dimensions
- [ ] Identify required changes
- [ ] Document current limitations

### Phase 2: Nether Implementation
- [ ] Remove Nether dimension restriction
- [ ] Add netherrack detection
- [ ] Create/use fire/lava-proof variants
- [ ] Adjust spawn rates for Nether
- [ ] Test Nether spawning

### Phase 3: End Implementation
- [ ] Remove End dimension restriction
- [ ] Add end stone detection
- [ ] Increase flying/torpedo spawn rates
- [ ] Adjust spawn rates for End
- [ ] Test End spawning

### Phase 4: Multi-Dimension Support
- [ ] Update block detection for all dimensions
- [ ] Update cache system
- [ ] Handle dimension-specific blocks
- [ ] Test all dimensions

### Phase 5: Testing & Balance
- [ ] Test spawn rates per dimension
- [ ] Verify variant distribution
- [ ] Balance spawn rates
- [ ] Final testing

---

## Progress Tracking

**Last Updated**: [Will be updated as work progresses]

**Current Focus**: Task 8 - Phase 1 (Audit)

**Notes**: 
- Starting with optimization audit to understand current state
- Will proceed systematically through each phase
- Will update this document as work progresses

