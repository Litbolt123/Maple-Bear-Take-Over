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

**Status:** Ready for next session  
**Priority:** High (Gameplay affecting)  
**Estimated Complexity:** Medium
