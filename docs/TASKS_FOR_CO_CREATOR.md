# Tasks for Co-Creator (Textures, Lore, & Brainstorming)

This document contains tasks specifically for team members who work on **textures**, **lore/content writing**, and **brainstorming/design** (not scripting).

---

## 🎨 TEXTURE WORK

### Missing or Inconsistent Textures

1. **Codex UI Icons** -  Consider creating custom icons for:
 Dusted Dirt Block Item Icon 16x16

2. **Texture Consistency Check** - Verify all mob egg textures match their entity textures:
   - Check that all day variant eggs (Day 4, 8, 13, 20) have proper textures
   - Ensure texture paths in `item_texture.json` match actual files
   - Some eggs might be using incorrect texture references (e.g., Day 20 variants using Day 13 textures)

3. **Particle Textures** - Review and potentially improve:
   - `white_dust_particle.png` - Could be enhanced for biome ambience
   - Consider variations for different infection states or effects

4. **Block Textures** - Check and improve:
   - `dusted_dirt.png` - Ensure it looks infected/corrupted
   - `'snow'_layer.png` - Should look like mysterious powder, not normal snow

### Texture Improvements

5. **Journal Evolution** - The Basic Journal and Powdery Journal use the same texture. Consider:
   - Making Powdery Journal slightly different (maybe with powder/dust particles?)
   - Or keeping them the same for lore consistency (your call)

6. **Mob Texture Variants** - Day variants might benefit from:
   - Subtle progression in corruption/corruption color
   - More obvious differences between Day 4, 8, 13, and 20 variants
   - Consider if infected mobs (pig, cow) could show more infection visually

7. **Item Texture Polish** - Review all custom items for:
   - Consistent art style
   - Readability at small sizes (16x16)
   - Proper lighting/shading

---

## 📖 LORE & CODEX CONTENT

**⚠️ IMPORTANT:** All text in codex uses Minecraft color codes (`§7`, `§e`, `§c`, etc.). Keep these codes when editing!

### Main Page Descriptions

**📍 File Location:** `BP/scripts/mb_codex.js`
- **Summary Text (Main Page Body)**: Lines **709-879** - `buildSummary()` function
  - Current status messages, infection info, immunity status
  - Progressive text based on player experience
- **Welcome Message**: Line **3833** - Basic Journal welcome text (`showBasicJournalUI`)
  - `"§7Welcome to your world..."`
- **Journal Info (Items Section)**: Lines **2054-2062** - Progressive journal descriptions
  - Basic (lines 2055-2056): `"A leather-bound journal..."`
  - Intermediate (lines 2057-2059): `"A sophisticated journal..."`
  - Expert (lines 2061-2062): `"An anomalous journal..."`

8. **Expand Main Page Flavor Text** - Currently basic. Could add:
   - Mysterious quotes or excerpts
   - Player character's thoughts/observations
   - Gradual reveal of journal's "awareness" or sentience
   - Different messages based on infection status or day progression

9. **Progressive Main Page** - The main page content changes based on kills/infections, but could be more:
   - Atmospheric and mysterious
   - Hint at deeper lore without spoiling
   - More personality in the journal's "voice"

### Infection Section Lore

**📍 File Location:** `BP/scripts/mb_codex.js` - `openInfections()` function (starts at line **991**)

- **Current Status Messages**: Lines **1008-1027** - Minor/Major infection status text
- **Minor Infection Info**: Lines **1056-1105** - Descriptions, timer, effects, cure
  - Line **1013**: `"§7You have a minor infection. Effects are mild."`
  - Line **1019**: `"§7You can still be cured with a Golden Apple + Golden Carrot."`
  - Line **1061**: Timer description text
  - Line **1075-1077**: Effects description
  - Lines **1085-1091**: Cure information
- **Major Infection Info**: Lines **1108-1146** - Similar structure to minor
  - Line **1027**: `"§7You have a major infection. Effects are severe..."`
  - Lines **1114-1126**: Timer and effects descriptions
  - Lines **1132-1140**: Cure information
- **Progression Warning**: Lines **1150-1158** - Text about minor→major progression
- **Cure Information Section**: Lines **1161-1202** - Detailed cure descriptions
- **Infection Mechanics**: Lines **1204-1211** - General mechanics text
- **Infection History**: Lines **1213-1237** - History tracking messages

10. **Minor Infection Descriptions** - Expand descriptions for:
    - Initial discovery text
    - Progression warnings
    - Symptom descriptions (make them more atmospheric)
    - Cure discovery messages

11. **Major Infection Lore** - Enhance:
    - Initial infection text (currently "You have been infected")
    - Progression stage descriptions
    - Final stages before transformation
    - Transformation event description

12. **Cure Descriptions** - Add more flavor to:
    - Minor cure discovery and consumption
    - Major cure discovery and consumption
    - Immunity messages (temporary and permanent)

### Mob Descriptions

**📍 File Location:** `BP/scripts/mb_codex.js` - `openMobs()` function (starts at line **1681**)

- **Mob List/Entries**: Lines **1683-1691** - Mob entry definitions
- **Mob Descriptions (Detailed)**: Lines **1737-1904** - Progressive descriptions based on kills/knowledge
  - Line **1769**: Basic description `"§7Hostile entity involved in the outbreak."`
  - Lines **1772-1774**: Basic analysis at 5+ kills
  - **Field Notes** (Lines **1776-1782**):
    - Flying Bear: `"Sky hunters that shower you with the white powder..."`
    - Mining Bear: `"Engineers that carve 1x2 tunnels..."`
    - Torpedo Bear: `"Airborne battering rams that streak..."`
  - **Combat Analysis** (Lines **1784-1804**): Stats at 25+ kills with level 2 knowledge
  - **Variant Analysis** (Lines **1806-1899**): Day variant descriptions
  - **Special Sections**:
    - Sky Doctrine (Flying Bear): Lines **1881-1887**
    - Tunnel Doctrine (Mining Bear): Lines **1889-1895**
    - Torpedo Profiles: Lines **1897-1899**

13. **Mob Discovery Entries** - Each mob entry could have:
    - Initial discovery description (brief, mysterious)
    - After first encounter (what player observed)
    - After multiple encounters (patterns noticed)
    - Day variant descriptions (how they change over time)

14. **Mob Behavior Lore** - Add descriptions for:
    - How each bear type behaves
    - Attack patterns
    - Special abilities (mining, flying, torpedo, buff)
    - Relationship to infection progression

15. **Infected Animal Descriptions** - Expand on:
    - How normal animals become infected
    - Visual differences from normal animals
    - Behavior changes
    - Their role in the infection spread

### Item Descriptions

**📍 File Location:** `BP/scripts/mb_codex.js` - `openItems()` function (starts at line **1940**)

- **Item Entry Definitions**: Lines **1960-1973** - Item list entries
- **Item Detail Descriptions**: Lines **2007-2405** - Detailed item descriptions based on selection
  - **"Snow" (Powder)**: Search for `snowFound` around lines **2007-2050**
  - **Cure Items**: Lines **2064-2085** - Progressive cure information
    - Line **2078**: Basic cure hints
    - Line **2081**: Known cure info
    - Line **2084**: Expert cure analysis
  - **Potions**: Lines **2086-2092** - Potion descriptions
  - **Golden Apple**: Lines **2093-2180** - Detailed golden apple lore
  - **Golden Carrot**: Search for similar structure after golden apple
  - **Other Items**: Each item has progressive descriptions based on discoveries

16. **"Snow" (Powder) Lore** - This is a key item. Expand:
    - First discovery description (more mysterious/foreboding)
    - Consumption warnings
    - Effect descriptions (make them more atmospheric)
    - Tier progression flavor text (tiers 1-5, 10, 20, 50)

17. **Journal Descriptions** - Enhance:
    - Basic Journal: Why it exists, who might have created it
    - Powdery Journal: Its transformation and purpose
    - How the journal updates itself (lore explanation)

18. **Cure Item Descriptions** - Add lore for:
    - Golden Apple + Golden Carrot (minor cure) - why these items?
    - Weakness Potion + Enchanted Golden Apple (major cure) - the ritual/process
    - Discovery hints and clues

### Symptoms & Effects Lore

**📍 File Location:** `BP/scripts/mb_codex.js`

- **Symptoms Menu**: `openSymptoms()` function (starts at line **1249**)
- **Infection Symptoms**: `openInfectionSymptoms()` (starts at line **1351**)
  - Lines **1353-1358**: Symptom entry definitions
  - Symptom detail descriptions: Search for individual symptom descriptions after line **1389**
- **Minor Infection Analysis**: `openMinorInfectionAnalysis()` (around line **1534**)
  - Lines **1601-1670**: Effect descriptions and cure progress
- **Snow Effects**: `openSnowEffects()` - Search for around line **1400+**
- **Snow Tier Analysis**: `openSnowTierAnalysis()` - Search for around line **1500+**

19. **Effect Descriptions** - Make each effect more atmospheric:
    - Weakness: How it feels, what it represents
    - Nausea: The disorientation, what the player perceives
    - Blindness: The corruption of vision
    - Slowness: The infection weighing them down
    - Mining Fatigue: The loss of strength
    - Hunger: The corruption consuming them

20. **Snow Effect Descriptions** - Each snow tier's effects need:
    - More atmospheric descriptions
    - Hints about what the powder is doing
    - Warnings about progression

21. **Minor Infection Analysis** - The analysis section needs:
    - More detailed symptom tracking
    - Player observations
    - Warnings about progression to major infection

### Late Lore Content

**📍 File Location:** `BP/scripts/mb_codex.js` - `openLateLore()` function (search around line **2550+**)

- **Tiny Vanguard Lore**: Search for `day20TinyLoreUnlocked` - Around line **2580+**
- **Hollow Procession Lore**: Search for `day20InfectedLoreUnlocked` - Around line **2594+**
  - Current text: `"Infected Maple Bears move like pallbearers..."`
- **Skybreaker Notes**: Search for `day20BuffLoreUnlocked` - Around line **2602+**
  - Current text: `"Buff Maple Bears clear the treeline..."`
- **World Memory**: Search for `day20WorldLoreUnlocked` - Around line **2610+**

22. **Day 20 Lore Sections** - These unlock at endgame. Create/expand:
    - **Tiny Vanguard Lore** - The role of Tiny Maple Bears as scouts
    - **Hollow Procession Lore** - What Infected Bears represent
    - **Skybreaker Notes** - Flying Maple Bear's purpose
    - **World Memory** - The infection's origin and purpose

23. **Timeline Section** - Expand the timeline with:
    - Historical events
    - Infection spread progression
    - Player's journey milestones
    - World transformation stages

### Intro Sequence Text (First-Time Player Experience)

**📍 File Location:** `BP/scripts/main.js` - `showWorldIntroSequence()` function (starts at line **5446**)

- **Message 1**: Line **5484** - `"§7Welcome to a completely normal world!"`
- **Message 2**: Line **5498** - `"§7But... it's not..."`
- **Message 3**: Line **5505** - `"§cIt's infected..."`
- **Message 4**: Line **5513** - `"§4And so are YOU!"` (Infection moment)
- **Message 5**: Line **5530** - `"§7Now, take this."` (Journal given)
- **Message 6**: Search for around line **5580** - `"§eIt should help you."`

### Biome & World Lore

**📍 File Location:** `BP/scripts/mb_codex.js` - `openBiomes()` function (search around line **2400+**)

24. **Biome Descriptions** - Add lore for:
    - Infected biomes (how they're different)
    - Safe biomes (why some resist infection)
    - Visual changes as days progress
    - Player's observations of world corruption

25. **World State Descriptions** - Describe how the world changes:
    - Early days (Day 0-4)
    - Mid infection (Day 8-13)
    - Advanced infection (Day 15-20)
    - Post-Day 20 (if applicable)

---

## 💡 BRAINSTORMING & DESIGN

### Story & World Building

26. **Origin Story** - Develop the backstory:
    - Where did the infection come from?
    - Why Maple Bears specifically?
    - What is the "snow" powder really?
    - What is the journal's true nature?

27. **Character Development** - Build the player's story:
    - Who are they?
    - How did they end up here?
    - What are their goals?
    - How does the infection affect their identity?

28. **Mystery & Discovery** - Design:
    - Clues players can find (through codex entries)
    - Red herrings and false leads
    - Gradual reveals of truth
    - Questions that remain unanswered (for atmosphere)

### Feature Ideas (Non-Scripting)

29. **New Journal Features** - Ideas for journal improvements:
    - Drawings/sketches that appear as players discover things
    - Handwritten notes vs. typed text (visual distinction)
    - Folded pages or bookmarks
    - Different journal types or upgrades

30. **Visual Storytelling** - Ways to tell story without words:
    - Texture variations that tell a story
    - Particle effects that suggest corruption
    - Color palettes that evolve with infection
    - Environmental storytelling through visuals

31. **Lore Integration Ideas** - How to weave lore into gameplay:
    - Journal entries that reference player actions
    - Secret codes or ciphers in journal
    - References to other players' experiences (multiplayer)
    - Foreshadowing future events

### Balance & Game Feel

32. **Progression Pacing** - Brainstorm:
    - When should players discover key information?
    - What order should lore reveal in?
    - How to balance mystery with clarity?
    - What should remain mysterious vs. explained?

33. **Emotional Journey** - Design the player experience:
    - Initial confusion and mystery
    - Growing dread as infection spreads
    - Moments of hope (cures, discoveries)
    - Desperation in late game
    - Acceptance or resistance in endgame

34. **Player Agency** - Ideas for player choice:
    - Different paths based on playstyle
    - Moral dilemmas (if applicable)
    - Multiple ways to solve problems
    - Consequences of choices (if implementing)

### Polish & Atmosphere

35. **Codex UI Text Styling** - Improve readability and atmosphere:
    - Which sections need more visual separation?
    - What text should be highlighted vs. subtle?
    - Color coding for different types of information
    - Consistent tone and voice throughout

36. **Discover Messages** - Review and improve all "discovery" messages:
    - Are they atmospheric enough?
    - Do they reveal the right amount?
    - Are they consistently styled?
    - Do they build mystery effectively?

37. **Intro Sequence Text** - Review the intro messages:
    - "Welcome to a completely normal world!"
    - "But... it's not..."
    - "It's infected..."
    - "And so are YOU!"
    - "Now, take this."
    - "It should help you."
    
    Could these be more impactful? More mysterious? More foreboding?

### Content Gaps to Fill

38. **Missing Descriptions** - These sections might need content:
    - Achievement descriptions
    - Status effect combinations
    - Rare event descriptions
    - Special encounter lore

39. **Context for Mechanics** - Add lore explanation for:
    - Why bears spawn more as days progress
    - What the infection timer represents (narratively)
    - Why certain cures work
    - The meaning of immunity

40. **Environmental Storytelling** - Design visual elements that tell story:
    - Corruption spreading through textures
    - Visual cues for infection level
    - Atmospheric details in biomes
    - Particle effects that suggest the infection's nature

---

## 📝 SPECIFIC WRITING TASKS

### High Priority (Start Here)

1. **Expand Late Lore** (Day 20 sections) - These unlock at endgame and need substantial content
2. **Enhance Main Page** - First thing players see, needs more personality
3. **Mob Discovery Entries** - Core gameplay content, needs detailed descriptions
4. **Snow/Powder Lore** - Key item, needs atmospheric descriptions
5. **Intro Sequence** - First impression, could be more impactful

### Medium Priority

6. **Infection Descriptions** - Make them more atmospheric and less clinical
7. **Cure Descriptions** - Add mystery and ritual feel
8. **Effect Descriptions** - Make status effects feel more meaningful
9. **Timeline Content** - Historical context for the infection
10. **Biome Descriptions** - World-building through environment

### Lower Priority (Polish)

11. **Codex UI Text Styling** - Consistent voice and tone
12. **Discovery Messages** - Atmospheric consistency
13. **Achievement Descriptions** - Player milestones
14. **Journal Evolution Story** - Why the journal transforms

---

## 🎯 NOTES FOR COLLABORATION

### Communication Tips

- **Ask About Lore Hooks**: If you have ideas that might require scripting changes, discuss them first (some can be done purely through text)
- **Consistency**: Keep the journal's "voice" consistent - is it observing? Warning? Recording? Mysterious entity?
- **Progressive Reveal**: Remember that information is gated by player experience - some descriptions only show after discovery
- **Tone**: Maintain the mysterious, foreboding atmosphere while still being helpful

### Quick Reference: All Text Locations

**Main Codex File:** `BP/scripts/mb_codex.js`
- **Main Page**: Lines 709-879 (`buildSummary()`), Line 3833 (Basic Journal welcome)
- **Journal Descriptions**: Lines 2054-2062 (progressive descriptions)
- **Infection Section**: Lines 991-1247 (`openInfections()`)
- **Mobs Section**: Lines 1681-2400 (`openMobs()`)
- **Items Section**: Lines 1940-2405 (`openItems()`)
- **Symptoms Section**: Lines 1249+ (`openSymptoms()`)
- **Late Lore**: Search for `openLateLore()` around line 2550+
- **Biomes Section**: Search for `openBiomes()` around line 2400+
- **Timeline Section**: Search for `openTimeline()` around line 2700+

**Main Script File:** `BP/scripts/main.js`
- **Intro Sequence**: Lines 5446-5600+ (`showWorldIntroSequence()`)
  - Messages at: 5484, 5498, 5505, 5513, 5530

**Other File Locations:**
- **Texture Files**: `RP/textures/` - See subfolders for items, entity, blocks, etc.
- **Texture Registry**: `RP/textures/item_texture.json` - Maps texture paths to shortnames
- **Sound Prompts**: `docs/development/sounds/maple_bear_sound_prompts.md` - For lore inspiration

**💡 Tip:** Use your editor's "Find" feature (`Ctrl+F`) to search for specific text strings like `"You have a minor infection"` to find exact locations quickly!

### Questions to Consider

- What is the journal's true nature? (Is it sentient? Cursed? Magical? Infected itself?)
- What is the infection's origin and purpose?
- Why do Maple Bears carry/spread it?
- What is the "snow" powder really?
- How does the player fit into this story?
- What happens after Day 20? (World state, player's fate, etc.)

---

**Remember**: Focus on creating atmosphere and mystery. The technical implementation can come later - good lore and visual design elevate the entire experience!
