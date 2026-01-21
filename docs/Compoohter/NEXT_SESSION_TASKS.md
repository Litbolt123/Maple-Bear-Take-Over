# Next Session Tasks: AI Improvements

Tasks planned for the next development session.

---

## 🎯 Torpedo Bear Block Breaking Fix

### Issue
Torpedo bears are not breaking blocks **directly above them** when they detect a player. For example, if players are in a cobblestone box and torpedo bears are underneath, the bears can see the players but don't break the blocks immediately above them.

### Current Behavior
- Torpedo bears likely break blocks in front/in their path during dive attacks
- They may not be checking for blocks directly above (y+1, same x/z) when they detect a target

### Needed Fix
- Add block breaking logic for blocks **directly above** the torpedo bear
- Should trigger when the bear has line of sight to a player but there's a block above blocking vertical access
- Should work during dive attacks and when the bear is below a structure

### Also to Consider
- Increase Block Breaking Before Explosion Limit based on day variant, and world way.

### Files to Modify
- `BP/scripts/mb_torpedoAI.js`
- `BP/scripts/main.js` ?

---

## 🤖 Mining Bear AI Improvements

### Current Status
- Mining bears are "pretty good" but need refinement
- Currently using some vanilla behaviors mixed with script-based AI

### Proposed Changes
1. **Add Pathfinding from Discord Resources**
   - Look for A* pathfinder or movement utilities in Discord script resources
   - Implement smarter pathfinding for reaching players through tunnels

2. **Reduce Vanilla Behaviors**
   - Remove or disable vanilla AI behaviors that conflict with scripted behavior
   - Rely more on script-based AI for movement and targeting

3. **Improve Script-Based Intelligence**
   - Better tunnel planning
   - Smarter block selection
   - More efficient mining patterns

### Files to Modify
- `BP/scripts/mb_miningAI.js`
- Possibly `BP/entities/mining_mb.json` and `BP/entities/mining_mb_day20.json` (to disable vanilla behaviors)

### Questions to Answer
- What specific vanilla behaviors are causing issues?
- Which pathfinding algorithm from Discord resources is best suited? (Give the User the Options They Have)
- How to balance script control vs. vanilla movement?

---

## ❄️ Dusted Ground Infection Pressure System

### Goal
Create a lightweight system that increases a player's infection risk based on time spent standing on **dusted dirt** or **snow layers**, with recovery when leaving the blocks.

### Core Behavior
1. **Standing on Dust/Snow (Minor Infection Track)**
   - If a player stands/walks on dusted dirt or snow layers for **60 seconds**, send a warning message ("you start to feel off").
   - After the warning, if they continue for **30 more seconds**, they become **major infected** (or progress to major if already minor).
   - If they step off the blocks, the timer decreases gradually (**every 2 seconds, reduce by 1 second**) until it returns to 0.

2. **Standing on Dust/Snow While Already Major Infected**
   - Every **30 seconds** on dust/snow increases the player's **snow level** (same as eating snow or being hit).
   - If they step off, the timer decreases gradually (**every 4 seconds, reduce by 1 second**) until it returns to 0.

3. **Permanent Minor Immunity Modifier**
   - If the player has permanent immunity from minor infection, this system should be **half as effective**.
   - Example: progress is **50% slower**, or required time is **2x** longer before effects occur.

### Additional Area Pressure (Optional)
Use the **spawn controller's dusted dirt / snow layer scanner** to apply slow pressure when the player remains in a high-density area:
   - If there are **100+** dusted dirt/snow blocks nearby, the timer should **slowly build** even if the player is not directly standing on them.
   - Suggested ramp: **10-minute** buildup timer, decreases by **1 second per second** when block density falls below 100.

### Notes
- This should **not** be heavy on performance (reuse existing block scan logic if possible).
- The existing dusted dirt discovery message should still fire as the early warning.
- The system should feel like an **unofficial warning** about infected ground.

### Files Likely Involved
- `BP/scripts/main.js`
- `BP/scripts/mb_spawnController.js` (for reuse of dusted dirt/snow layer scanning)
- Possibly `BP/scripts/mb_utilities.js` (helper timers / state tracking)

---

## 📋 Implementation Notes

### For Torpedo Bear Fix:
1. Check current block breaking logic in `mb_torpedoAI.js`
2. Add check for blocks directly above bear (same x/z, y+1, y+2, etc.)
3. Break blocks when bear is below structure and sees target
4. Test with cobblestone box scenario

### For Mining Bear Improvements:
1. Review Discord script resources for pathfinding utilities
2. Identify which vanilla behaviors to disable (check entity JSON files)
3. Implement pathfinding in `mb_miningAI.js`
4. Test tunnel creation and player targeting
5. Ensure performance is acceptable

---

## ✅ Completed Features (Need Testing)

All three features below have been implemented and need comprehensive testing:

1. **Torpedo Bear Block Breaking Fix** - ✅ Completed
   - Added logic to break blocks directly above torpedo bears
   - Enhanced vertical block breaking during dive attacks

2. **Mining Bear AI Improvements** - ✅ Completed
   - Integrated nox7 performant pathfinder (A* algorithm)
   - Replaced steering with pathfinding-based movement
   - Enhanced neighbor generation with 8-directional movement
   - Improved path reconstruction and waypoint following

3. **Dusted Ground Infection Pressure System** - ✅ Completed
   - Ground infection system with adaptive checking intervals
   - Snow layers tick 2x faster than dusted dirt
   - Biome ambient pressure (gradual infection in infected biomes)
   - Water/boat handling improvements
   - Major infection warnings for ground exposure
   - Airborne pause for decay timers
   - Codex integration (Biomes and Blocks section)

## 🧪 Testing Requirements

### Priority: High
Before considering these features complete, comprehensive testing is needed:

#### General Testing Checklist
- [ ] Verify all three implemented features work as intended
- [ ] Test edge cases and boundary conditions
- [ ] Verify performance impact (adaptive checking should help)
- [ ] Check for any regressions or conflicts with existing systems
- [ ] Verify codex entries update correctly
- [ ] Test in multiplayer scenarios

#### Specific Feature Testing

**Torpedo Bear Block Breaking:**
- [ ] Test breaking blocks directly above bear when player is in structure above
- [ ] Verify vertical block breaking during dive attacks
- [ ] Test with various block types (cobblestone, stone, wood, etc.)
- [ ] Verify block breaking doesn't break too many blocks unnecessarily

**Mining Bear AI:**
- [ ] Test pathfinding with various tunnel layouts
- [ ] Verify bears reach players through complex paths
- [ ] Test pathfinding doesn't cause performance issues
- [ ] Verify waypoint following is smooth and doesn't cause jerky movement
- [ ] Test that bears still mine blocks effectively
- [ ] Verify no conflicts between pathfinding and vanilla AI behaviors

**Dusted Ground Infection Pressure:**
- [ ] Test standing on dusted dirt (60s warning, 90s infection)
- [ ] Test standing on snow layers (should be 2x faster - 30s warning, 45s infection)
- [ ] Test airborne pause (decay should pause when jumping/flying)
- [ ] Test adaptive checking (frequent when on ground, less frequent when off)
- [ ] Test biome ambient pressure (5 minute timer in infected biomes)
- [ ] Test permanent immunity modifier (should be 50% slower)
- [ ] Test temporary immunity (should block ground exposure)
- [ ] Test major infection snow increase from ground (30s intervals with meager warnings)
- [ ] Test water/boat scenarios (only count if walking on block underwater)
- [ ] Test in other dimensions (Nether/End)
- [ ] Verify codex entries unlock correctly (dusted dirt, snow layer, biome pressure)

**Codex Updates:**
- [ ] Verify "Biomes and Blocks" section displays correctly
- [ ] Verify dusted dirt entry appears with dynamic learning
- [ ] Verify snow layer entry appears with dynamic learning
- [ ] Verify Day 20 infection rate knowledge displays correctly
- [ ] Verify blocks removed from items section
- [ ] Test search function (should not find blocks in items)

---

**Status:** Features Completed - Testing Required  
**Priority:** High (Gameplay affecting)  
**Estimated Complexity:** Medium (Testing Phase)
