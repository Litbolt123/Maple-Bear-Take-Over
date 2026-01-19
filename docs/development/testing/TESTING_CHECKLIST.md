# Testing Checklist - Performance Optimization & Snow Drop Balancing

This checklist covers all changes made during the performance optimization and snow drop balancing implementation.

## ✅ Verified Working (2026-01-18)

- **World Loading**: Loading the world works fine
- **Intro Sequence**: Intro sequence works correctly, no replay issues
- **Basic Journal**: Basic journal is working fine
- **Dusted Journal**: Overall working, no errors (needs more thorough testing)
- **Spawn System**: Spawning works correctly, even on day 20 (no errors)
- **Isolated Player Optimizations**: Working correctly (discovery radius: 40 blocks detected in logs for isolated players)

## ✅ Dynamic Property Handler Testing

### Codex Properties (Test Phase)
- [ ] **Codex Data Persistence**
  - [ ] Join world, check codex/journal
  - [ ] Modify codex entries (discover items, track infections)
  - [ ] Save world and reload
  - [ ] Verify all codex data persists correctly
  - [ ] Verify no data loss

- [ ] **Codex Performance**
  - [ ] Open journal multiple times
  - [ ] Check that journal opens quickly
  - [ ] Verify no lag when opening/closing journal

### All Dynamic Properties (Full Migration)
- [ ] **Player Properties**
  - [ ] Infection data (minor/major) persists on world reload
  - [ ] Immunity status persists correctly
  - [ ] Hit counts persist correctly
  - [ ] First-time messages state persists
  - [ ] Max snow levels persist
  - [ ] Cure progress (golden apple/carrot) persists

- [ ] **World Properties**
  - [ ] Intro seen flag persists (should prevent intro replay)
  - [ ] Day count persists correctly
  - [ ] Spawn difficulty setting persists
  - [ ] Day tracker initialization flag persists

- [ ] **Performance Check**
  - [ ] No early execution errors on world load
  - [ ] Properties load correctly after world is ready
  - [ ] Periodic saves (every 30 seconds) work without errors
  - [ ] No "not a function" errors in console

## ✅ Intro Sequence Fix

- [x] **Intro Replay Prevention**
  - [x] Join world first time - intro should play
  - [x] Get journal from intro
  - [x] Save world and leave
  - [x] Rejoin world - intro should NOT play again
  - [x] Journal should NOT be given again (already have one)

- [x] **Intro Flow**
  - [x] Intro sequence plays correctly on first join
  - [x] Journal is given during intro
  - [x] Intro completion message appears
  - [x] After intro, journal works normally

## ✅ Item Consumption Testing

### Golden Apple
- [ ] **Minor Infection Cure Progress**
  - [ ] Have minor infection
  - [ ] Consume golden apple
  - [ ] Check that cure progress is tracked
  - [ ] Verify progress message appears

- [ ] **Major Infection Reduction**
  - [ ] Have major infection
  - [ ] Consume golden apple
  - [ ] Verify snow count reduces by 0.5
  - [ ] Check codex entry is unlocked

### Golden Carrot
- [ ] **Minor Infection Cure Progress**
  - [ ] Have minor infection
  - [ ] Consume golden carrot
  - [ ] Check that cure progress is tracked
  - [ ] Verify progress message appears

- [ ] **Complete Minor Cure**
  - [ ] Have minor infection
  - [ ] Consume golden apple
  - [ ] Consume golden carrot
  - [ ] Verify minor infection is cured
  - [ ] Verify permanent immunity is granted
  - [ ] Verify cure effects play (sounds, messages)

### Snow Consumption
- [ ] **Snow Effects Work**
  - [ ] Consume snow item
  - [ ] Verify effects are applied
  - [ ] Check infection progression (if applicable)

### Potion Consumption
- [ ] **Potion Detection Works**
  - [ ] Consume potion
  - [ ] Verify potion knowledge unlocks in codex
  - [ ] Check that script-applied effects DON'T unlock potion knowledge

## ✅ Snow Drop System Testing

### Periodic Drops Removed
- [ ] **No Periodic Drops**
  - [ ] Follow a Maple Bear around
  - [ ] Verify NO snow items drop periodically
  - [ ] Only snow on bear death (via loot tables)

### Loot Table Drops
- [ ] **Tiny Bear Drops**
  - [ ] Kill tiny Maple Bear
  - [ ] Verify 60% chance for 1 snow item
  - [ ] Check multiple kills (should average ~60%)

- [ ] **Infected Bear Drops**
  - [ ] Kill infected Maple Bear
  - [ ] Verify 80% chance for 1-5 snow items
  - [ ] Check drop quantities are correct

- [ ] **Buff Bear Drops**
  - [ ] Kill buff Maple Bear
  - [ ] Verify 80% chance for 3-15 snow items
  - [ ] Check drop quantities are correct

- [ ] **All Bear Types**
  - [ ] Test all bear variants
  - [ ] Verify drop rates match codex descriptions
  - [ ] No snow drops from periodic system (only on death)

## ✅ Utility Classes Testing (If Used)

- [ ] **Item Finder** (if inventory scanning is replaced)
  - [ ] Verify cure item detection works
  - [ ] Check priority-based search (offhand > mainhand > equipment)

- [ ] **Item Registry** (if used)
  - [ ] Verify all item handlers are registered
  - [ ] Test each item type (potion, golden apple, carrot, snow)
  - [ ] Check that handlers fire correctly

## ✅ Basic Journal Testing

- [x] **First Time Welcome Screen**
  - [x] First time opening journal
  - [x] Welcome screen appears
  - [x] "Play Audio" button works
  - [x] "Skip" button works
  - [x] Settings save correctly

- [x] **Journal Persistence**
  - [x] Open journal, check settings
  - [x] Save world and reload
  - [x] Verify settings persist
  - [x] Journal state persists

- [x] **No Duplicate Journals**
  - [x] Complete intro, receive journal
  - [x] Rejoin world
  - [x] Verify journal is NOT given again
  - [x] Can still open existing journal

## ✅ General Functionality Testing

- [ ] **Infection System**
  - [ ] Minor infection initializes correctly
  - [ ] Minor infection effects apply periodically
  - [ ] Minor infection timer scales with day
  - [ ] Minor infection progression to major works
  - [ ] Major infection works as before

- [ ] **Day Tracking**
  - [ ] Day count increments correctly
  - [ ] Day count persists on world reload
  - [ ] Milestone days trigger correctly

- [x] **Spawn System**
  - [x] Bear spawns work correctly
  - [x] Spawn caps are respected
  - [x] Spawn difficulty setting works
  - [x] Spawning works correctly on day 20 (no errors)
  - [x] Isolated player optimizations working (discovery radius: 40 blocks detected in logs)

## 🔍 Regression Testing

- [ ] **No Breaking Changes**
  - [ ] All existing functionality works
  - [ ] No new errors in console
  - [ ] No data corruption
  - [ ] Performance is same or better

- [ ] **Error Handling**
  - [ ] Check console for warnings
  - [ ] No "not a function" errors
  - [ ] No early execution errors
  - [ ] All error messages are informative

## 📋 Specific Test Scenarios

### Scenario 1: First-Time Player
1. ✅ Join world for first time
2. ✅ Intro sequence plays
3. ✅ Journal is given
4. Minor infection is initialized
5. ✅ Save and reload
6. ✅ Intro does NOT play again
7. ✅ Journal persists
8. Infection data persists

### Scenario 2: Returning Player
1. ✅ Join world with existing data
2. ✅ Intro does NOT play (already seen)
3. ✅ Journal is NOT given again (already have)
4. ✅ All saved data loads correctly
5. Infection state persists correctly

### Scenario 3: Minor Infection Cure
1. Get minor infection
2. Consume golden apple (progress tracked)
3. Consume golden carrot (cure completes)
4. Verify cure effects
5. Verify permanent immunity
6. Save and reload
7. Verify immunity persists

### Scenario 4: Snow Drops
1. Follow bears around (no periodic drops)
2. Kill various bear types
3. Verify snow drops only on death
4. Check drop rates match expectations

### Scenario 5: Property Handler Stress Test
1. Rapidly open/close journal
2. Modify multiple properties quickly
3. Save world multiple times
4. Verify all data persists
5. Check for performance issues

---

## Notes

- **Priority**: Focus on Dynamic Property Handler and Intro Sequence fixes first
- **Breaking Issues**: If any test fails critically, report immediately
- **Performance**: If performance degrades, check property handler cache
- **Data Loss**: If any data is lost, check property handler save logic
