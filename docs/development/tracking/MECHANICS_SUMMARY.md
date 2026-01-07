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
- **First consumption** (not infected): Starts infection with immediate effects (blindness, nausea, mining fatigue)
- **While infected** - Tier-based system:
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

### Infection Symptoms
- **Immediate on infection**: Blindness, nausea, mining fatigue (short duration)
- **Progressive symptoms**: Based on time remaining and snow count
  - Severity 0: No symptoms (above 75% time)
  - Severity 1: Mild (slowness)
  - Severity 2: Moderate (slowness + hunger)
  - Severity 3: Severe (slowness + weakness + blindness + nausea)
- **Random symptom application**: Based on cooldown and severity level
- **Snow tier affects**: Higher snow count = worse symptoms, longer durations

---

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

