# Colors and Styling Reference

This document lists all color codes and easy-to-change styling elements in the Maple Bear TakeOver addon. Use this as a quick reference when you want to adjust colors manually without using AI credits.

**Last Updated:** Based on current codebase (January 2026)

---

## Minecraft Color Codes

| Code | Color | Name | Common Usage |
|------|-------|------|--------------|
| `§0` | Black | Very dark text | Maximum danger (Day 75+), extreme warnings |
| `§1` | Dark Blue | Dark blue text | Rarely used |
| `§2` | Dark Green | Dark green text | Early escalation days (3-5) |
| `§3` | Dark Aqua | Dark cyan text | Rarely used |
| `§4` | Dark Red | Dark red text | Major infection status, extreme danger days (17-24) |
| `§5` | Dark Purple | Dark purple text | Post-victory progression (Day 50+) |
| `§6` | Gold | Gold/amber text | Titles, section headers, important info |
| `§7` | Gray | Gray text | Default body text, normal information |
| `§8` | Dark Gray | Dark gray text | Hidden/unknown info, masked content |
| `§9` | Blue | Blue text | Rarely used |
| `§a` | Green | Green text | Positive/healthy status, safe days, permanent immunity |
| `§b` | Aqua | Aqua/cyan text | Settings, search, debug menus, temporary immunity |
| `§c` | Red | Red text | Danger/infected status, warnings, negative effects |
| `§d` | Light Purple | Light purple text | Post-victory progression (Day 75+) |
| `§e` | Yellow | Yellow text | Warnings/goals, headings, important notices |
| `§f` | White | White text | Emphasis, values, section buttons |

## Formatting Codes

| Code | Effect | Usage |
|------|--------|-------|
| `§k` | Obfuscated (random characters) | Rarely used |
| `§l` | Bold | Titles, emphasis (e.g., `§c§lMAJOR INFECTION`) |
| `§m` | Strikethrough | Rarely used |
| `§n` | Underline | Rarely used |
| `§o` | Italic | Rarely used |
| `§r` | Reset (removes all formatting) | Reset formatting mid-string |

---

## Basic Journal UI Colors

**File:** `BP/scripts/mb_codex.js` - `showBasicJournalUI()` function (starts at line **3822**)

### Main Menu
- **Title**: `§6Basic Journal` - Line **3827**
- **Welcome Message**: `§7Welcome to your world...` - Line **3833**
- **Current Day Display**: Uses dynamic color from `getDayDisplayInfo()` - Line **3831**

### Buttons
- **"Your Goal" Button**: `§0` (Black) - Line **3839**
- **"Settings" Button**: `§b` (Aqua) - Line **3843**
- **"Recipe: Powdery Journal" Button**: `§a` (Green) - Line **3847**
- **"Tips" Button**: `§e` (Yellow) - Line **3851**

### Button Icons
- **Your Goal Icon**: `textures/items/mb_snow` - Line **3840**
- **Settings Icon**: `textures/ui/settings_glyph_color_2x` - Line **3844**
- **Recipe Icon**: `textures/items/snow_book` - Line **3848**
- **Tips Icon**: `textures/items/book_writable` - Line **3852**

### Goal Screen
**File:** `BP/scripts/mb_codex.js` - `showGoalScreen()` function (starts at line **4028**)
- **Title**: `§6Your Goal` - Line **4029**
- **Section Title**: `§eThe Infection` - Line **4030**
- **Body Text**: `§7` (Gray) for normal text) - Line **4030**
- **Objectives List**: `§e` (Yellow) for "Your Objectives:" header, `§7` (Gray) for items - Line **4030**
- **Important Warning**: `§cIMPORTANT:` (Red) - Line **4030**
- **Back Button**: `§8` (Dark Gray) - Line **4031**

---

## Powdery Journal UI Colors

**File:** `BP/scripts/mb_codex.js` - `showCodexBook()` function (starts at line **637**)

### Main Menu
**Function:** `openMain()` (starts at line **882**)
- **Title**: `§6Powdery Journal` - Line **884**
- **Body Summary Text**: `§7` (Gray) for most text, `§e` (Yellow) for "Choose a section:" - Line **885**
- **Status Colors** (from `buildSummary()` function, lines **710-879**):
  - Minor Infection: `§eStatus: §cMINOR INFECTION` - Line **742**
  - Major Infection: `§eStatus: §cMAJOR INFECTION` - Line **744**
  - Time Display: `§eTime: §c${ticks} (§f~${days} day(s)§c)` - Line **754**
  - Unknown Time: `§eTime: §8???` - Line **756**
  - Snow Consumed: `§eSnow consumed: §c${count}` - Line **764**
  - Healthy (Permanently Immune): `§eStatus: §aHealthy (Permanently Immune)` - Line **819**
  - Healthy (Previously Infected): `§eStatus: §aHealthy (Previously Infected)` - Line **823**
  - Healthy (Normal): `§eStatus: §aHealthy` - Line **825**
  - Permanent Immunity: `§bImmunity: §aPERMANENT` - Line **834**
  - Active Immunity: `§bImmunity: §fACTIVE (§b${time} left§f)` - Line **839**
  - No Immunity: `§bImmunity: §7None` - Line **841**
  - Bear Hits: `§eBear Hits: §f${count}/${total}` - Line **860**

### Section Buttons (Main Menu)
- **Infection Button**: `§f` (White) - Line **892**
- **Symptoms Button**: `§f` (White) - Line **903**
- **Mobs Button**: `§f` (White) - Line **910**
- **Items Button**: `§f` (White) - Line **917**
- **Biomes Button**: `§f` (White) - Line **923**
- **Late Lore Button**: `§f` (White) - Line **929**
- **Timeline Button**: `§f` (White) - Line **938**
- **Achievements Button**: `§f` (White) - Line **945**
- **Debug Menu Button**: `§b` (Aqua) - Line **952**
- **Developer Tools Button**: `§c` (Red) - Line **954**
- **Settings Button**: `§e` (Yellow) - Line **959**
- **Search Button**: `§b` (Aqua) - Line **965**

### Back Buttons
- **Back Button**: `§8` (Dark Gray) - Used throughout (e.g., Line **1242**, **1307**, **1376**)

---

## Infection Section Colors

**File:** `BP/scripts/mb_codex.js` - `openInfections()` function (starts at line **991**)

### Section Header
- **Title**: `§eThe Infection` - Line **1001**

### Current Status
- **Minor Infection**: `§cCurrent Status: Minor Infection` - Line **1008**
- **Time Remaining**: `§7Time remaining: §f${days} day(s)` - Line **1011**
- **Description**: `§7You have a minor infection. Effects are mild.` - Line **1013**
- **Cure Info**: `§7You can still be cured with a Golden Apple + Golden Carrot.` - Line **1019**

- **Major Infection**: `§4Current Status: Major Infection` - Line **1022**
- **Time Remaining**: `§7Time remaining: §f${days} day(s)` - Line **1025**
- **Description**: `§7You have a major infection. Effects are severe and worsen over time.` - Line **1027**
- **Cure Info**: `§7Cure requires Weakness effect + Enchanted Golden Apple.` - Line **1033**

- **Permanently Immune**: `§aCurrent Status: Permanently Immune` - Line **1038**
- **Healthy**: `§aCurrent Status: Healthy` - Line **1044**

### Infection Types Section
- **Section Title**: `§6Infection Types:` - Line **1049**

#### Minor Infection
- **Subsection Title**: `§eMinor Infection:` - Line **1056**
- **Timer Info**: `§7• Timer: Varies by day...` or `§7• Timer: §8???` - Lines **1061-1063**
- **Effects**: `§7• Mild effects: ${list}` or `§7• Mild effects: §8???` - Lines **1075-1077**
- **Cure Info**: 
  - Known: `§7• Can be cured with: Golden Apple + Golden Carrot` - Line **1085**
  - Known: `§7• Cure grants: §aPermanent Immunity§7` - Line **1086**
  - Partial: `§7• Cure: §8??? (one component discovered)` - Line **1088**
  - Unknown: `§7• Cure: §8???` - Line **1090**
- **Progression**: `§7• Requires 2 hits from Maple Bears to progress to major` - Line **1096**
- **Progression**: `§7• OR 1 snow consumption to progress to major` - Line **1097**

#### Major Infection
- **Subsection Title**: `§cMajor Infection:` - Line **1110**
- **Timer Info**: `§7• 5-day timer` or `§7• Timer: §8???` - Lines **1114-1116**
- **Effects**: `§7• Severe effects: Multiple negative status effects` - Line **1122**
- **Effects**: `§7• Effects worsen over time` - Line **1123**
- **Cure Info**:
  - Known: `§7• Can be cured with: Weakness effect + Enchanted Golden Apple` - Line **1133**
  - Known: `§7• Cure grants: §bTemporary Immunity§7 (5 minutes)` - Line **1134**
  - Known: `§7• Also grants: §aPermanent Immunity§7` - Line **1135**
  - Partial: `§7• Cure: §8??? (one component discovered)` - Line **1137**
  - Unknown: `§7• Cure: §8???` - Line **1139**

### Progression Warning
- **Section Title**: `§6Progression:` - Line **1151**
- **Warning Text**: `§c• Warning: Minor infection is more easily treatable.` - Line **1155**
- **Warning Text**: `§c  Once it becomes major, the cure becomes much more difficult.` - Line **1156**

### Cure Information Section
- **Section Title**: `§6Cure Information:` - Line **1161**

#### Minor Infection Cure
- **Subsection Title**: `§eMinor Infection Cure:` - Line **1166**
- **Components**: `§7  Golden Apple: ${status}` - Line **1173**
- **Components**: `§7  Golden Carrot: ${status}` - Line **1174**
- **Instructions**: `§7  Both must be consumed separately (any order)` - Line **1175**
- **Effect**: `§7  Effect: §aPermanent Immunity§7 - prevents minor infection on respawn` - Line **1176**

#### Major Infection Cure
- **Subsection Title**: `§cMajor Infection Cure:` - Line **1187**
- **Components**: `§7  Weakness effect + Enchanted Golden Apple` - Line **1192**
- **Effect**: `§7  Effect: §aPermanent Immunity§7 (prevents minor infection on respawn)` - Line **1193**
- **Effect**: `§7  Also grants: §bTemporary Immunity§7 (5 minutes)` - Line **1194**
- **Requirement**: `§7  Requires: 3 hits from Maple Bears to get infected (instead of 2)` - Line **1195**

### Infection Mechanics
- **Section Title**: `§6Infection Mechanics:` - Line **1205**
- **List Items**: `§7•` (Gray) for each mechanic - Lines **1206-1211**

### Infection History
- **Section Title**: `§6Infection History:` - Line **1216**
- **Total Infections**: `§7Total Infections: §f${count}` - Line **1217**
- **Total Cures**: `§7Total Cures: §f${count}` - Line **1218**
- **Minor Cure Status**: `§7Minor Infection Cured: §aYes (Permanent Immunity)` - Line **1220**

---

## Symptoms Section Colors

**File:** `BP/scripts/mb_codex.js` - `openSymptoms()` function (starts at line **1249**)

### Main Menu
- **Title**: `§6Symptoms` - Line **1272**
- **No Content Message**: `§7No symptoms have been experienced yet.` - Line **1276**
- **No Content Message**: `§8You need to experience effects while infected to unlock symptom information.` - Line **1276**
- **Select Category**: `§7Select a category to view:` - Line **1279**

### Category Buttons
- **Infection Level Analysis**: `§e` (Yellow) - Line **1285**
- **Minor Infection Analysis**: `§e` (Yellow) - Line **1291**
- **Infection Symptoms**: `§c` (Red) - Line **1297**
- **Snow Effects**: `§b` (Aqua) - Line **1303**

### Infection Symptoms Subsection
**Function:** `openInfectionSymptoms()` (starts at line **1351**)
- **Title**: `§6Infection Symptoms` - Line **1364**
- **No Symptoms Message**: `§7No infection symptoms have been experienced yet.` - Line **1367**
- **No Symptoms Message**: `§8You need to experience negative effects while infected to unlock symptom information.` - Line **1367**
- **Symptom Buttons**: `§f${symptomName}` (White) - Line **1373**
- **Symptom Details Title**: `§6Infection Symptoms: ${name}` - Line **1408**
- **Symptom Details Body**: `§e${title}` (Yellow for title), `§7` (Gray for details), `§f` (White for values) - Line **1406**

### Snow Effects Subsection
**Function:** `openSnowEffects()` (starts at line **1419**)
- **Title**: `§6Snow Effects` - Line **1437**
- **No Effects Message**: `§7No snow effects have been experienced yet.` - Line **1440**
- **No Effects Message**: `§8You need to consume snow while infected to unlock effect information.` - Line **1440**
- **Positive Effect Buttons**: `§a§a+ ${effectName}` (Green with + prefix) - Line **1448**
- **Negative Effect Buttons**: `§c§c- ${effectName}` (Red with - prefix) - Line **1448**
- **Effect Details Title**: `§6Snow Effects: ${name}` - Line **1475**
- **Effect Type Label**: `§aBeneficial` or `§cHarmful` - Line **1471**

### Infection Level Analysis
**Function:** `openSnowTierAnalysis()` (starts at line **1486**)
- **Title**: `§6Infection Level Analysis` - Line **1492**
- **Max Level**: `§eMaximum Infection Level Achieved: §f${level}` - Line **1496**
- **Tier Labels**: `§7Tier ${number} (${range}): §f${tierName}` - Lines **1500-1538**
- **Tier Details**: `§7•` (Gray) for each detail - Lines **1501-1538**
- **Current Level**: `§eCurrent Infection Level: §f${level}` - Line **1545**
- **Current Tier**: `§7Current Tier: §f${tier} (${name})` - Line **1549**

### Minor Infection Analysis
**Function:** `openMinorInfectionAnalysis()` (starts at line **1574**)
- **Title**: `§6Minor Infection Analysis` - Line **1574**
- **Status**: `§eStatus: §cMinor Infection` or `§eStatus: §aHealthy` - Lines **1578-1580**
- **Effects**: `§7• §fSlowness§7: ...` or `§7• §fWeakness§7: ...` - Lines **1601-1607**
- **Cure Progress**: `§6Cure Information:` - Line **1619**
- **Component Status**: `§7  Golden Apple: ${status}` - Line **1626**
- **Component Status**: `§7  Golden Carrot: ${status}` - Line **1627**
- **Success Message**: `§aBoth components consumed! The cure is taking effect...` - Line **1630**

---

## Mobs Section Colors

**File:** `BP/scripts/mb_codex.js` - `openMobs()` function (starts at line **1681**)

### Main Menu
- **Title**: `§6Mobs` - Line **1694**
- **Entries Label**: `§7Entries:` - Line **1695**
- **Mob Buttons**: `§f${mobName}` (White) for known mobs, `§f???` for unknown - Line **1698**
- **Kill Count**: `§7(Kills: ${count})` - Line **1722**

### Mob Details
- **Mob Title**: `§e${mobName}` - Line **1769**
- **Description**: `§7Hostile entity involved in the outbreak.` - Line **1769**
- **Kills Header**: `§6Kills: §f${count}` - Line **1769**
- **Basic Analysis**: `§6Basic Analysis:` - Line **1773**
- **Analysis Text**: `§7This creature appears to be dangerous and unpredictable.` - Line **1773**

#### Field Notes (Specific Mobs)
- **Flying Bear**: `§6Field Notes:` - Line **1777**
  - Text: `§7Sky hunters that shower you with the white powder—ground them or risk suffocation.` - Line **1777**
- **Mining Bear**: `§6Field Notes:` - Line **1779**
  - Text: `§7Engineers that carve 1x2 tunnels so more Maple Bears can march through.` - Line **1779**
- **Torpedo Bear**: `§6Field Notes:` - Line **1781**
  - Text: `§7Airborne battering rams that streak toward sky bases and burst into powdery shrapnel.` - Line **1781**

#### Combat Analysis
- **Section Title**: `§6Combat Analysis:` - Line **1786**
- **Stats**: `§7` (Gray) for labels, `§f` (White) for values - Lines **1788-1803**

#### Variant Analysis
- **Section Title**: `§6Variant Analysis:` - Line **1808**
- **Day 4+ Variants**: `§eDay 4+ Variants:` - Line **1818**
- **Day 8+ Variants**: `§eDay 8+ Variants:` - Line **1832**
- **Day 13+ Variants**: `§eDay 13+ Variants:` - Line **1846**
- **Day 20+ Variants**: `§eDay 20+ Variants:` - Line **1870**
- **Variant Details**: `§7` (Gray) for descriptions - Lines **1821-1879**

#### Special Sections
- **Sky Doctrine** (Flying Bear): `§eSky Doctrine:` - Line **1883**
- **Tunnel Doctrine** (Mining Bear): `§eTunnel Doctrine:` - Line **1891**
- **Torpedo Profiles**: `§eTorpedo Profiles:` - Line **1899**

---

## Items Section Colors

**File:** `BP/scripts/mb_codex.js` - `openItems()` function (starts at line **1940**)

### Main Menu
- **Title**: `§6Items` - Line **1979**
- **Entries Label**: `§7Entries:` - Line **1980**
- **Item Buttons**: `§f${itemName}` (White) for known items, `§f???` for unknown - Line **2005**

### Item Details
- **Item Title**: `§e${itemName}` - Various lines (e.g., Line **2038**)
- **Description**: `§7` (Gray) for normal text - Various lines
- **Properties**: `§7Properties:` - Various lines
- **Special Sections**: `§6` (Gold) for section headers - Various lines

#### Specific Items
- **"Snow" (Powder)**: `§eSnow (Powder)` - Line **2038**
  - Description: `§7Risky substance. Leads to symptoms and doom.` - Line **2038**
- **Enchanted Golden Apple**: `§5Enchanted§f Golden Apple` (Purple "Enchanted", White "Golden Apple") - Line **1968**

---

## Biomes Section Colors

**File:** `BP/scripts/mb_codex.js` - `openBiomes()` function (search around line **2500+**)

- **Title**: `§6Biomes` - Search for `openBiomes()`
- **Biome Name**: `§fInfected Biome` or `§fCorrupted Biome` - Line **2550**
- **Description**: `§7` (Gray) for biome descriptions - Lines **2550-2554**
- **No Biomes**: `§8No biomes discovered yet.` - Line **2556**

---

## Late Lore Section Colors

**File:** `BP/scripts/mb_codex.js` - `openLateLore()` function (starts at line **2569**)

### Main Menu
- **Title**: `§6Late Lore` - Line **2606**
- **Body**: `§7Recovered observations:` or `§7No late entries recorded yet.` - Line **2607**
- **Entry Buttons**: `§f${title}\n§8${summary}` (White title, Dark Gray summary) - Line **2610**

### Lore Entry Details
- **Title**: `§6Late Lore: ${title}` - Line **2625**
- **Body**: `§e${title}` (Yellow for entry title), `§7` (Gray for body text) - Line **2626**
- **Footer**: `§8The journal records what we would rather forget.` - Line **2626**

#### Specific Lore Entries
- **Tiny Vanguard**: `§eTiny Vanguard` - Line **2586**
- **Hollow Procession**: `§eHollow Procession` - Line **2594**
- **Skybreaker**: `§eSkybreaker` - Line **2602**
- **World Memory**: `§eWorld Memory (Day 20)` - Line **2578**

---

## Timeline Section Colors

**File:** `BP/scripts/mb_codex.js` - `openTimeline()` function (starts at line **2637**)

### Main Menu
- **Title**: `§6Timeline` - Line **2642**
- **Body**: `§7Choose what to view:` - Line **2643**

### Day Progression Guide
**Function:** `openDaysMilestones()` (starts at line **2688**)
- **Section Title**: `§6Day Progression:` - Line **2756**
- **Progression Ranges** (Lines **2758-2766**):
  - Days 0-2 (Safe): `§a` (Green)
  - Days 3-5 (Caution): `§2` (Dark Green)
  - Days 6-7 (Warning): `§e` (Yellow)
  - Days 8-10 (High Danger): `§c` (Red)
  - Days 11-12 (Danger): `§6` (Gold)
  - Days 13-15 (Critical): `§c` (Red)
  - Days 16-17 (Extreme): `§4` (Dark Red)
  - Days 18-24 (Maximum): `§4` (Dark Red)
  - Day 25 (Victory): `§a` (Green)
- **Reached Ranges**: `§7${range}: ${color}${label}` - Line **2772**
- **Upcoming Ranges**: `§8${range}: §8??? §7(Approaching)` - Line **2775**
- **Hidden Ranges**: `§8${range}: §8???` - Line **2778**

---

## Day Display Colors

**File:** `BP/scripts/mb_dayTracker.js` - `getDayDisplayInfo()` function (starts at line **54**)

### Day Color Progression
- **Days 0-2 (Safe)**: `§a` (Light Green) - Line **61**
- **Days 3-5 (Early Escalation)**: `§2` (Dark Green) - Line **65**
- **Days 6-7 (Warning)**: `§e` (Light Yellow) normal, `§6` (Amber) milestone - Line **69**
- **Day 8 (Milestone - Flying Bears)**: `§c` (Light Red) - Line **72**
- **Days 9-12**: `§6` (Amber) normal, `§c` (Light Red) milestone - Line **76**
- **Days 13-15**: `§c` (Light Red) - Line **80**
- **Day 17 (Milestone - Torpedo Bears)**: `§4` (Dark Red) - Line **88**
- **Days 18-19**: `§4` (Dark Red) - Line **96**
- **Day 20 (Milestone - Major Escalation)**: `§4` (Dark Red) - Line **113**
- **Days 21-24**: `§c` (Light Red) - Line **117**
- **Day 25 (Victory)**: `§a` (Green) - Line **121**
- **Days 26-50**: Gradient from `§c` (Light Red) → `§4` (Dark Red) → `§5` (Dark Purple) - Lines **131-138**
- **Day 50 (Milestone)**: `§5` (Dark Purple) - Line **127**
- **Days 51-75**: Gradient from `§5` (Dark Purple) → darker - Lines **149-152**
- **Day 75 (Milestone)**: `§0` (Black) - Line **146**
- **Days 76-100**: Gradient from `§5` (Dark Purple) → `§0` (Black) - Lines **160-167**
- **Day 100 (Milestone)**: `§0` (Black) - Line **157**
- **Days 101+**: `§0` (Black) - Line **171**

---

## Chat Messages

### Discovery Messages
**File:** `BP/scripts/main.js` - `sendDiscoveryMessage()` function (starts at line **1131**)
- **Important Items**: `§7` (Gray) - Lines **1154-1156**
- **Dangerous Creatures**: `§7` (Gray) - Lines **1160-1165**
- **Mysterious Creatures**: `§7` (Gray) - Lines **1168-1169**
- **Threatening Creatures**: `§7` (Gray) - Lines **1172-1174**
- **Interesting Items**: `§7` (Gray) - Lines **1177-1183**

### Infection Messages
**File:** `BP/scripts/main.js`
- **Minor Infection**: `§eMinor infection.` (reinfected) or `§eYou have been infected with a minor infection.` (first time) - Lines **5011, 5020**
- **Major Infection (from minor)**: `§cMajor infection.` (reinfected) or full dramatic messages (first time) - Lines **2163, 3724**
- **Major Infection (from snow)**: `§cMajor infection.` (reinfected) or `§8You have been infected. Find a cure.` (first time) - Lines **2247, 2250**
- **Major Infection (from bear)**: `§cMajor infection.` (reinfected) or `§cYour immunity has been overcome! You are now infected with a major infection!` (first time) - Lines **3635, 3638**
- **Progression Messages**: `§4§lSOMETHING IS WRONG!` - Line **2172, 3733**
- **Progression Messages**: `§c§lYour infection has worsened dramatically!` - Line **2173, 3734**
- **Warning Messages**: `§4Your minor infection is reaching its final stages...` - Line **4008**
- **Warning Messages**: `§4You don't feel so good...` - Line **4063**

### Cure Messages
**File:** `BP/scripts/main.js`
- **Minor Cure Success**: `§a§lYou have cured your minor infection!` - Line **1911**
- **Minor Cure Success**: `§eYou are now permanently immune. You will never contract minor infection again.` - Line **1912**
- **Major Cure Success**: `§a§lYou have cured your major infection!` - Line **2025**
- **Major Cure Success**: `§eYou are now permanently immune. You will never contract minor infection again.` - Line **2026**
- **Temporary Immunity**: `§bYou also have temporary immunity for 5 minutes.` - Line **2028**

### Sharing Messages
**File:** `BP/scripts/mb_codex.js` - `shareKnowledge()` function (around line **584**)
- **Shared With Message**: `§7Shared with §f${playerName}§7: §a${summary}` - Line **584**
- **Received Share Message**: `§b${senderName}§7 shared: §a${summary}` - Line **586**
- **No Journal Message**: `§7Knowledge shared, but no journal to record it.` - Line **588**

### Settings Messages
**File:** `BP/scripts/mb_codex.js` - `openSettings()` function (starts at line **3448**)
- **Settings Saved**: `§7Settings saved!` - Line **3515**
- **Error Messages**: `§cError opening settings! Check console for details.` - Line **3531**

### Variant Unlock Messages
**File:** `BP/scripts/main.js`
- **Day 4+ Unlocked**: `§8Day 4+ variants unlocked.` - Line **580**
- **Day 8+ Unlocked**: `§8Day 8+ variants unlocked.` - Line **675**
- **Day 13+ Unlocked**: `§8Day 13+ variants unlocked.` - Line **711**
- **Day 20+ Unlocked**: `§8Day 20+ variants unlocked.` - Line **749**
- **Knowledge Expansion**: `§7You feel your knowledge expanding...` - Line **585**

---

## On-Screen Display (Title/ActionBar)

**File:** `BP/scripts/main.js`

### Infection Titles
- **Minor Infection**: `§e§lMINOR INFECTION` - Line **5014**
- **Major Infection**: `§c§lMAJOR INFECTION` - Lines **2166, 3727**

### Intro Sequence
**File:** `BP/scripts/main.js` - `showWorldIntroSequence()` function (starts at line **5446**)
- **Message 1**: `§7Welcome to a completely normal world!` - Line **5484**
- **Message 2**: `§7But... it's not...` - Line **5498**
- **Message 3**: `§cIt's infected...` - Line **5505**
- **Message 4**: `§4And so are YOU!` - Line **5513**
- **Message 5**: `§7Now, take this.` - Line **5530**
- **Message 6**: Search for around line **5580** - `§eIt should help you.`

---

## Settings Screen Colors

**File:** `BP/scripts/mb_codex.js` - `openSettings()` function (starts at line **3448**)

### Modal Form
- **Title**: `§eSettings` - Line **3471**
- Uses `ModalFormData` (not ActionFormData) - Line **3470**

---

## Search Section Colors

**File:** `BP/scripts/mb_codex.js` - `openSearch()` function (starts at line **3542**)

### Search Results
- **Title**: `§bSearch: "${term}"` - Line **3619**
- **Body**: `§7Found §f${count}§7 result(s):` - Line **3620**
- **Result Buttons**: `§f${title}\n§8${section}` (White title, Dark Gray section) - Line **3623**
- **No Results**: `§7No results found for: §f"${term}"` - Line **3612**
- **No Results**: `§8Try a different search term.` - Line **3612**

---

## Quick Color Change Guide

### To Change a Color:
1. Open the file listed in the section above
2. Find the line number mentioned (use Ctrl+F to search for the text)
3. Replace the color code (e.g., `§7` → `§e` for yellow)
4. Save the file

### Common Color Swaps:
- **Make text more visible**: Change `§7` (Gray) to `§e` (Yellow) or `§f` (White)
- **Make text less prominent**: Change bright colors to `§7` (Gray) or `§8` (Dark Gray)
- **Emphasize important info**: Use `§f` (White) or `§e` (Yellow)
- **Show danger/warning**: Use `§c` (Red) or `§6` (Amber)
- **Show positive/healthy**: Use `§a` (Green)
- **Show unknown/hidden**: Use `§8` (Dark Gray)
- **Section headers**: Use `§6` (Gold) or `§e` (Yellow)

### Color Code Formatting:
- Color codes must be placed **directly before** the text they affect
- Multiple color codes can be used in the same string
- Use `§r` to reset formatting if needed
- Colors can be combined with formatting codes (e.g., `§l§c` for bold red)
- All color codes are **case-sensitive** (use lowercase letters: `§a`, not `§A`)

---

## Notes

- **Line Numbers**: Line numbers are approximate and may shift as code is updated. Use Ctrl+F to search for specific text strings to find exact locations.
- **Progressive Content**: Many sections show different colors/text based on what the player has discovered. Check the conditional logic around each section.
- **Dynamic Colors**: Some colors (like day display) are calculated dynamically based on game state. See `mb_dayTracker.js` for day color logic.

---

**Last Verified:** January 2026  
**Files Checked:** `BP/scripts/mb_codex.js`, `BP/scripts/main.js`, `BP/scripts/mb_dayTracker.js`