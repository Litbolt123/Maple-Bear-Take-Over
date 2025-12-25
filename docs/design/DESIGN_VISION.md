# Maple Bear Takeover - Design Vision & Intentions

This document captures the core design philosophy, intentions, and vision for the Maple Bear Takeover addon. This is the "source of truth" for understanding what the addon should feel like and how features should align with the overall vision.

---

## 🎯 Core Vision

**Maple Bear Takeover** is an apocalypse-style survival addon for Minecraft Bedrock Edition where evolving Maple Bears spread a mysterious white powdery infection across any world. The addon is designed to be:
- **Co-op focused** but fully playable solo
- **Progressive horror** that starts mysterious and gets darker as players go deeper
- **Emergent storytelling** through gameplay mechanics rather than explicit narrative
- **Challenging but fair** with clear progression and discovery systems

---

## 🌍 World & Atmosphere

### Tone & Feel
- **Drug/addiction metaphor** for the white powder (kept ambiguous - "mysterious white powdery substance")
- **Slow-burn horror** that escalates: early game is mysterious/unsettling, late game gets darker (paranoia, withdrawals, cravings at higher snow tiers)
- **Ambiguity first**: New players experience mystery and discovery; experienced players see darker implications
- **"The world remembers"** theme: Memory, counting, and observation motifs throughout

### No True Safety
- **Underground bases**: Countered by Mining Bears that dig to players
- **Sky bases**: Countered by Flying Bears and Torpedo Bears
- **Nether/End**: Will eventually have Maple Bear presence (Nether gets fire/lava-proof variants, End gets more flying/torpedo)
- **Only exception**: A few secluded overworld biomes remain relatively safer (no natural spawns or much lower rates)
  - **Mushroom Fields** appears to be the safest biome (not targeted by infected biome replacement)
  - See [SAFE_BIOMES.md](SAFE_BIOMES.md) for complete list of biomes not targeted by infection

### Biome Corruption
- Custom `mb:infected_biome` replaces many vanilla biomes at low densities
- **Long-term goal**: Infected biome generation increases over time as world corruption evolves
- Some overworld biomes intentionally excluded from replacement (safer zones)

---

## 🐻 Bear Ecosystem & Evolution

### Bear Variants
- **Tiny Maple Bears** (Day 2+): Weak, numerous, first threat
- **Infected Maple Bears** (Day 4+): Stronger, spread infection
- **Buff Maple Bears** (Day 8+): Mini-bosses, limited spawns, better rewards needed
- **Flying Maple Bears** (Day 15+): Counter sky bases, health tuned between Tiny and Infected
- **Mining Bears** (Day 20+): Smart pathfinding, dig to underground bases
- **Torpedo Bears** (Day 20+): Sky-borne threats, explosive attacks
- **Raptor Flying Bears** (Future): Super rare, grab players from sky

### Bear Intelligence & Behavior
- **Evolving intelligence**: Bears get smarter over time (mining bears already demonstrate this)
- **Late-game builders**: Bears that build bridges/structures to reach players
  - **Design philosophy**: Combo of obviously constructed (functional) but shaped to feel semi-natural (corruption-like)
  - **Pacing**: Slower than players at building
  - **Testing needed**: Balance between messy structures and natural-ish corruption
- **Player-observable**: Players can sometimes see what bears are doing, but only if they notice/pay attention (no block outlining, no explicit indicators)

### Bear Roles Over Time
- **Early game (Days 1-20)**: **60% plague agents / 40% killers**
  - Focus on spreading dust/infection to new areas
  - Ensures world corruption spreads even if players avoid combat
- **Late game (Day 20+)**: **40% plague agents / 60% killers**
  - Focus shifts to direct threat and base assault
  - Keeps established bases under constant pressure
- **New chunks**: Still get plague-agent treatment so new areas feel corrupted

---

## 💊 Infection & Snow Mechanics

### Snow (White Powder) System
- **Tier-based progression** (6 tiers currently):
  - **Tier 1 (1-5 snow)**: Slows infection, positive effects
  - **Tier 2 (6-10 snow)**: Neutral, no noticeable effect
  - **Tier 3 (11-20 snow)**: Accelerates infection, warning effects
  - **Tier 4 (21-50 snow)**: Heavy acceleration, dangerous effects
  - **Tier 5 (51-100 snow)**: Extreme acceleration
  - **Tier 6 (100+ snow)**: "Black Void" - extreme effects, infinite duration symptoms
- **First consumption**: Starts infection immediately (blindness, nausea, mining fatigue)
- **While infected**: Progressive effects based on tier and severity
- **Addiction metaphor**: Effects get darker at higher tiers (paranoia, withdrawals, cravings)

### Player Infection
- **Sources**: Eating snow once OR getting hit 3 times by any Maple Bear
- **Progression**: Timer-based with progressive symptoms (severity 0-4)
- **Cure**: Weakness effect + Enchanted Golden Apple
- **Immunity**: Temporary immunity after cure, broken by consuming snow
- **Player-to-player spread**: Always on in survival (at high infection stages), toggle in Developer Tools

### Player Transformation
- **On death**: Infected players spawn an infected Maple Bear at death location
- **NameTag**: `§4! <player>'s Infected Form` (red)
- **Current state**: Normal infected bear stats/variants (chosen by day)
- **Future**: Should be buffed/smarter (they were players after all)
- **Multiple deaths**: Multiple infected forms can exist simultaneously

---

## 🎮 Gameplay Systems

### Difficulty & Progression
- **Spawn difficulty**: Single global slider (Easy/Normal/Hard/Custom -5 to +5)
- **Developer Tools**: Extra toggles for testing (plague agent ratios, wave intensity, etc.)
- **Linear ramp**: Steady progression over time
- **Milestone spikes**: Big difficulty jumps at Days 50, 75, 100
- **Wave days**: Both short intense bursts AND mini-waves spread across day

### Day Progression
- **Current milestones**: Days 2, 4, 8, 13, 20, 25 (victory)
- **100-day arc**: Both achievement and lore payoff
  - **Main canon outcome**: Some form of cure/ruin resolution
  - **Branching outcomes**: Based on player behavior (heavy snow use vs minimal, world corruption level)
  - **Post-credits world**: World continues after Day 100 with altered rules
- **Wave days**: Days 50, 75, 100 get special wave mechanics

### Player Power Fantasy
- **Early-mid game**: Players always on back foot, survival-focused
- **Late game**: Special weapons/equipment help (clean/heroic theme, not corrupted magic)
- **Cured animals**: Become "scarred but special" variants
  - **Mechanical**: Slight buffs (more hearts, better drops)
  - **Cosmetic**: Visual changes showing corruption scars
  - **Both**: Not just vanilla resets

---

## 🏗️ World Building & Structures

### Structures Bears Build
- **Bridge-building bears**: Create paths to reach players
- **Structure-building bears**: Build ramps, dust columns, etc.
- **Design**: Combo of functional (obviously constructed) and natural-ish (corruption-like)
- **Pacing**: Slower than players, but persistent

### Player Structures
- **No true safety**: Underground, sky, Nether, End all countered
- **Secluded biomes**: Only relatively safer zones
- **Quarantine possible**: Players can clear dusted_dirt to reduce nearby spawns (but mining bears can still dig in)

---

## 🌌 Dimensions & Expansion

### Overworld
- **Primary focus**: Most bear variants spawn here
- **Infected biome**: Replaces many vanilla biomes
- **Safer zones**: Some biomes excluded from replacement

### Nether (Implemented)
- **Bear variants**: All bear types can spawn in Nether
- **Fire resistance adaptation**: Bears gain fire resistance based on day variant:
  - Day 4 and earlier: No fire resistance
  - Day 8-17: Fire Resistance I (temporary, requires 10 seconds in Nether first)
  - Day 20+: Fire Resistance III (complete immunity, immediate)
- **Infected biome**: Replaces all 5 vanilla Nether biomes with variable sizes
- **Spawn blocks**: `netherrack` is a valid spawn block in Nether

### End (Implemented)
- **Bear variants**: All bear types can spawn, but flying/torpedo bears have increased spawn rates
- **Spawn rate scaling**: Flying/torpedo spawn rates increase with world day (1.5x-3.0x), other types reduced (0.5x)
- **Infected biome**: Replaces all 5 vanilla End biomes with variable sizes (lowest density)
- **Spawn blocks**: `end_stone` is a valid spawn block in End

---

## 🎨 Content & Polish

### Weapons & Equipment
- **Theme**: Clean/heroic (not corrupted magic)
- **Late-game focus**: Help players fight back after being on back foot
- **Examples**: Special weapons, infection resistance items, cure enhancement tools

### Cured Animals
- **Design**: "Scarred but special" variants
- **Mechanical**: Slight buffs (more health, better drops)
- **Cosmetic**: Visual corruption scars
- **Not vanilla**: Don't fully revert to normal

### Achievements & Rewards
- **Day 25**: Current victory milestone
- **Day 100**: Ultimate achievement + lore payoff
- **Post-victory**: Milestones at 30, 35, 40, 45, 50+ days
- **Knowledge-based**: Codex tracks discoveries and achievements

---

## 👥 Co-op & Social Systems

### Multiplayer Focus
- **Primary design**: Co-op survival with friends
- **Solo play**: Fully supported, but co-op is core use case
- **Knowledge sharing**: Already implemented - players can share codex knowledge when nearby with snow book
- **Infection spread**: Player-to-player infection always on (high stages), toggle in dev tools

### Player Interaction
- **Infected forms**: Don't seek out former owner, just act as strong generic infected bears
- **Knowledge economy**: Sharing discoveries enhances group survival
- **Group challenges**: Wave days and milestones scale with player count

---

## 🔧 Technical Philosophy

### Performance
- **Server-friendly**: Optimized for multiple players
- **Caching**: Biome checks, debug settings, spawn tiles all cached
- **Cooldowns**: Prevent spam (biome checks, error logging)

### Debug & Development
- **Comprehensive debug menu**: Integrated into snow book codex
- **Per-category flags**: Mining AI, Torpedo AI, Flying AI, Spawn Controller, Main Script
- **Developer Tools**: Reset codex, set day, spawn difficulty, debug toggles
- **Performance-optimized**: Cached debug state to avoid iteration overhead

### Code Quality
- **API 2.0.0**: Full compatibility with safety checks
- **Modular**: Separate scripts for different systems
- **Maintainable**: Clean, well-documented code
- **Robust**: Multiple fallback methods for critical operations

---

## 📖 Lore & Storytelling

### Journal/Codex
- **Gameplay-only**: No lore attached, purely mechanical
- **Discovery-based**: Players learn through experience
- **Progressive knowledge**: Basic → Understanding → Expert levels
- **No spoilers**: New players see mystery, experienced players see implications

### Themes
- **Memory**: "The world remembers" - areas track player actions
- **Counting**: "Whatever guides them is patient, and it keeps count"
- **Observation**: World watches players, adapts to strategies
- **Ambiguity**: White powder origin kept mysterious (drug metaphor, not explicit)

### Storytelling Method
- **Emergent**: Through gameplay mechanics, not explicit narrative
- **Environmental**: Codex entries, daily reflections, milestone messages
- **Player-driven**: Outcomes based on player choices (snow use, world clearing, etc.)

---

## 🎯 Design Principles

1. **No True Safety**: Every strategy has a counter (underground → mining, sky → flying, etc.)
2. **Progressive Horror**: Starts mysterious, gets darker as players go deeper
3. **Emergent Storytelling**: Mechanics tell the story, not cutscenes
4. **Co-op First**: Designed for multiplayer but solo-friendly
5. **Fair Challenge**: Clear progression, discoverable mechanics, no cheap deaths
6. **Ambiguity Early**: New players experience mystery, veterans see darker truth
7. **World Remembers**: Areas and systems adapt to player behavior
8. **Addiction Metaphor**: Snow mechanics reflect real addiction patterns (positive → neutral → negative)

---

## 🚀 Future Vision

### Short-term
- Enhanced player-infected forms (buffed/smarter)
- Better buff bear rewards and unstuck behaviors
- Raptor Flying Bear variant
- Nether/End spawning
- Player-to-player infection
- Cured animal variants

### Long-term
- 100-day endgame structure with branching outcomes
- Wave day mechanics (bursts + mini-waves)
- Role ratio system (plague agents vs killers over time)
- Building bear variants (bridges, structures)
- Special weapons/equipment (clean/heroic theme)
- Post-credits world state

### Experimental Ideas
- Bear civilization (Day 50+ evolution)
- "The Patient One" reveal (entity guiding bears)
- Memory-based world reset mechanics
- Parallel infected dimension
- Infection reversal endgame (Day 100+)

---

## 📝 Notes for Developers

- **Always check this document** when implementing new features
- **Align with vision**: Features should fit the tone, feel, and design principles
- **Test thoroughly**: Especially bear AI, spawn systems, and performance
- **Document decisions**: Update this file if design philosophy changes
- **Player experience first**: Mechanics should feel good, not just be technically impressive

---

*Last Updated: Based on comprehensive design discussion with project creators*
*This document should be updated as the vision evolves*

