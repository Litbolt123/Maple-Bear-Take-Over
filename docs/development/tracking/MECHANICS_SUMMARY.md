# Maple Bear Takeover - Current Mechanics Summary

> **Broader map:** For script modules, storms, spawn controller, emulsifier, and dimension behavior at a glance, see [`../ADDON_SYSTEMS_AND_FEATURES.md`](../ADDON_SYSTEMS_AND_FEATURES.md). This file focuses on **mechanical detail** for designers and testers.

## ✅ Currently Implemented

### Player Transformation System
- **When infected players die** (from infection timer OR killed by any Maple Bear):
  - Spawns an infected bear at death location
  - NameTag: `§4! ${player.name}'s Infected Form`
  - Sets dynamic property `infected_by` with player ID
  - Bear type chosen based on current day (see **[INFECTION_SYSTEM.md](../systems/INFECTION_SYSTEM.md)** for exact branches—timer expiry vs bear-kill paths differ slightly)
  - **Bear-kill path**: Day 8+ / 13+ / **20+** variants when applicable
  - **Timer-expiry path**: Day 8+ / 13+ variants; base `infected` below day 8
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
**Full reference (player state, ground/storm pressure, mob conversion, flowcharts): [`../systems/INFECTION_SYSTEM.md`](../systems/INFECTION_SYSTEM.md)**

- **Infection Types**: Two types tracked separately
  - **Minor Infection**: Starting duration scales with **world day** (design cap tied to 10 in-game days in constants). Mild effects, persists through death until cured.
  - **Major Infection**: **5 in-game day** timer cap (`24000 * 5` ticks). Cured with **Weakness + Enchanted Golden Apple** only.
- **Bear hits to major**: Depends on **addon difficulty** (`hitsBase`: Easy 4, Normal 3, Hard 2). With **minor** infection, requires **one fewer** hit than a healthy player. **Permanent immunity** uses full `hitsBase` hits.
- **Minor Infection Effects**: Random, severity-scaling (per-player). Cooldowns by severity band: **7200 / 4800 / 3600 / 2400** ticks (see full doc).
- **Major Infection Effects**: Symptoms scale with **time left** and **`snowCount`** (powder tiers); optional rare “clarity” positive effect.
- **Minor → Major**: Enough Maple Bear hits, **one** `mb:snow` consume, or **environmental** thresholds (corrupted ground / dense dust / storm exposure).
- **Cures**: **Golden apple + golden carrot** (any order) → minor cured + permanent immunity. **Enchanted golden apple** with **weakness** → major cured + permanent immunity + short temporary immunity.
- **Normal golden apple** (major only): reduces **`snowCount`** by **0.5** (does not cure).
- **Environment**: Standing on **`mb:dusted_dirt`** / **`mb:snow_layer`**, ambient dust density, infected biome, and **dust storms** feed separate exposure timers; **emulsifier safe zones** in infected biomes decay pressure.
- **Respawn**: Major cleared on death → minor again unless permanently immune; minor persists through death.

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

