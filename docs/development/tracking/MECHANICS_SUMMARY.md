# Maple Bear Takeover - Current Mechanics Summary

## ✅ Currently Implemented

### Player Transformation System
- **When infected players die** (from infection timer OR killed by any Maple Bear):
  - Spawns an infected bear at death location
  - NameTag: `§4! ${player.name}'s Infected Form`
  - Sets dynamic property `infected_by` with player ID
  - Bear type chosen based on current day:
    - Day 8+: `infected_day8`
    - Day 13+: `infected_day13`
    - Day 20+: `infected_day20`
    - Default: `infected` (base)
- **Multiple deaths** = Multiple infected forms (no limit)
- **NOT currently buffed** - They spawn as normal infected bears, just with a name tag

### Snow (White Powder) Consumption Mechanics
- **First consumption** (not infected): Starts major infection with immediate effects (blindness, nausea, mining fatigue)
- **While infected** - Tier-based system (major infection only):
  - **Tier 1 (1-5 snow)**: Slows infection, positive effects
  - **Tier 2 (6-10 snow)**: Neutral, no noticeable effect
  - **Tier 3 (11-20 snow)**: Accelerates infection, warning effects
  - **Tier 4 (21-50 snow)**: Heavy acceleration, dangerous effects
  - **Tier 5 (51-100 snow)**: Extreme acceleration
  - **Tier 6 (100+ snow)**: "Black Void" - infinite duration effects
- **Progressive effects**: Random effects based on severity level (0-4) and snow tier
- **Time manipulation**: Snow consumption affects infection timer (can slow or accelerate)

### Buff Bear Rewards
- **Current loot**: Only drops snow (3-15 for base, 5-18 for day20)
- **Status**: Mini-boss level (limited spawns, high health/damage)
- **Issue**: Gets stuck easily, needs better pathfinding/AI

### Infection System
- **Infection Types**: Two types tracked separately
  - **Minor Infection**: 10-day timer (scales with world day), mild effects, persists through death until cured
  - **Major Infection**: 5-day timer, severe effects, can be cured with Weakness + Enchanted Golden Apple
- **Minor Infection Effects**: Random, severity-scaling effects (per-player, not global)
  - Severity 0 (>75% time): No effects
  - Severity 1 (>50% time): Slowness I or Weakness I (cooldown: 7200 ticks)
  - Severity 2 (>20% time): Slowness I, Weakness I, or Mining Fatigue I (cooldown: 3600 ticks)
  - Severity 3 (<20% time): Slowness II, Weakness II, Mining Fatigue II, or Nausea I (cooldown: 2400 ticks)
  - Milder than major infection (no blindness until very late, lower amplifiers)
- **Major Infection Effects**: Progressive symptoms based on time remaining and snow count
  - Severity 0: No symptoms (above 75% time)
  - Severity 1: Mild (slowness)
  - Severity 2: Moderate (slowness + hunger)
  - Severity 3: Severe (slowness + weakness + blindness + nausea)
- **Infection Progression**: Minor can progress to major via:
  - 2 hits from Maple Bears (any type)
  - 1 snow consumption
- **Cure System**:
  - **Minor Cure**: Golden Apple + Golden Carrot (any order) → Permanent immunity
  - **Major Cure**: Weakness effect + Enchanted Golden Apple → Temporary immunity (5 min) + Permanent immunity
- **Permanent Immunity**: Prevents minor infection on respawn, requires 3 hits (instead of 2) to get infected
- **Respawn Behavior**:
  - First-time respawn with minor infection: Full message, on-screen title, sounds
  - Subsequent respawns: Minimal message only
  - No immediate effects on respawn (effects applied by timer loop only)

---

### Performance Optimizations
- **Dynamic Property Handler**: Cached read/write system with lazy loading and batch saving
- **Isolated Player Optimizations**: Reduced resource usage for players far from others (>96 blocks) with spawn compensation
- **Shared Caches**: Player and mob caching across all AI scripts
- **Block Caching**: Mining AI block queries cached for 1 tick

### Intro Sequence & Welcome System
- **World Intro**: Plays once per world with narrative messages, gives basic journal at end
- **Welcome Messages**: Returning players see current day + sound immediately, first-time players see "Day 0" after intro
- **Intro Persistence**: Uses persistent world property to prevent replay

## 🔧 Needs Implementation/Improvement

### Player-Infected Forms
- [ ] Make them buffed or higher variant than normal infected bears
- [ ] Could spawn as Day 20 variant even if it's Day 13
- [ ] Could give them buffed stats (health, damage)
- [ ] Could make them smarter (better AI)

### Buff Bear Improvements
- [ ] Better rewards for killing (currently only snow)
- [ ] Fix pathfinding/stuck issues
- [ ] Make them harder to kill when stuck
- [ ] Add escape behaviors when stuck

### Snow Mechanics (Already Good!)
- ✅ Tier system works well
- ✅ Progressive effects implemented
- ✅ Addiction metaphor maintained
- ✅ Darker effects at higher tiers

---

## 📝 Notes for Future Development

- Player-infected forms should feel "smarter" - they were players after all
- Buff bears need better rewards to justify their difficulty
- Snow mechanics are well-balanced for the addiction metaphor
- Transformation system works but could be enhanced

