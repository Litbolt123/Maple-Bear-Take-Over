# Codex: How and When Everything Unlocks

This document describes **every unlockable** in the Powdery Journal (codex): what it is, **how** it unlocks, and **when** (trigger/condition). Codex data is stored per-player (chunked dynamic property `mb_codex`).

---

## 1. Infections & status

| What | How / When |
|------|------------|
| **infections.bear.discovered** | First time the player is **hit by a Maple Bear** (any variant). Also set when player gets minor/major infection from bear hits. |
| **infections.bear.firstHitAt** | Set at same time as bear.discovered (timestamp). |
| **infections.snow.discovered** | First time the player **consumes "snow"** (the powder item). |
| **infections.snow.firstUseAt** | Set when snow is first consumed (timestamp). |
| **infections.minor.discovered** | When the player gets **minor infection** (intro sequence or bear hits before major). |
| **infections.major.discovered** | When the player gets **major infection** (2 bear hits, or 1 snow consumption, or ground conversion from minor). |
| **status.immuneKnown** | When the player has **temporary or permanent immunity** (e.g. after cure, or when immunity is applied). |
| **status.bearTimerSeen** | When the player has an **infection with a timer** (bear-hit infection) and opens the codex/summary. |
| **status.snowTimerSeen** | When the player has **snow-related infection** and the timer is shown. |

---

## 2. Cures

| What | How / When |
|------|------------|
| **cures.bearCureKnown** | When the player **successfully uses** the major cure (Weakness + Enchanted Golden Apple while under weakness). |
| **cures.bearCureDoneAt** | Timestamp when major cure is completed. |
| **cures.minorCureKnown** | When the player **discovers** both Golden Apple and Golden Carrot (or completes minor cure). |
| **cures.minorCureDoneAt** | Timestamp when minor cure is completed. |

---

## 3. Effects (infection symptoms)

| What | How / When |
|------|------------|
| **effects.*** (weaknessSeen, nauseaSeen, etc.) | When the player **experiences** that effect while infected (e.g. random potion effects from major infection). |
| **snowEffects.*** (regenerationSeen, speedSeen, etc.) | When the player **consumes "snow" while infected** and gets that effect. |
| **minorInfectionEffects.*** (slownessSeen, weaknessSeen) | When the player has **minor infection** and gets slowness/weakness applied periodically. |
| **symptomsUnlocks.infectionSymptomsUnlocked** | When the player gets **any negative effect** while infected (main.js applies via safeMarkCodex). |
| **symptomsUnlocks.snowEffectsUnlocked** | When the player gets **any snow effect** (positive or negative) from consuming "snow" while infected. |
| **symptomsUnlocks.snowTierAnalysisUnlocked** | When the player has **Powdery Journal**, has consumed "snow" or has infection, and max "snow" level > 0 (or has any infection). Unlocked in main.js when snow tier increases. |
| **symptomsUnlocks.minorInfectionAnalysisUnlocked** | When the player has **minor infection** (or had it / has permanent immunity) and has **Powdery Journal**. Set when opening Basic Journal with minor infection. |

---

## 4. Items

| What | How / When |
|------|------------|
| **items.snowFound** | When the player **picks up or has** the "snow" (powder) item in inventory (scan). |
| **items.snowIdentified** | When the player **identifies** it (e.g. discovery message / codex path). |
| **items.snowBookCrafted** | When the player **crafts** the Powdery Journal (Basic Journal + "snow" pattern). |
| **items.basicJournalSeen** | Given in **intro sequence** or when opening Basic Journal. |
| **items.cureItemsSeen** | When the player **discovers** cure-related items (e.g. Weakness Potion + Enchanted Golden Apple). |
| **items.snowTier5Reached** | When **snow count** (consumed) reaches ≥ 5 (main.js infection tick). |
| **items.snowTier10Reached** | Snow count ≥ 10. |
| **items.snowTier20Reached** | Snow count ≥ 20. |
| **items.snowTier50Reached** | Snow count ≥ 50. |
| **items.brewingStandSeen** | When the player **has or uses** a brewing stand (inventory scan). |
| **items.bookCraftMessageShown** | When the book-craft message has been shown. |
| **items.checkJournalMessageShown** | When the "Check your journal" discovery message has been shown once. |
| **items.goldenAppleSeen** | When the player **has or uses** a Golden Apple (inventory / use). |
| **items.goldenCarrotSeen** | When the player **has or uses** a Golden Carrot. |
| **items.enchantedGoldenAppleSeen** | When the player **has or uses** an Enchanted Golden Apple. |
| **items.goldenAppleInfectionReductionDiscovered** | When the player **consumes** a Golden Apple while infected and the reduction is observed. |
| **items.goldSeen** | When the player **has** gold ingot (inventory scan). |
| **items.goldNuggetSeen** | When the player **has** gold nugget (inventory scan). |
| **items.potionsSeen** | When the player **has** potions (inventory scan). |
| **items.weaknessPotionSeen** | When the player **has or uses** a Weakness potion. |

---

## 5. Mobs

| What | How / When |
|------|------------|
| **mobs.mapleBearSeen** | When the player **kills or sees** a Tiny Maple Bear (or day variant), or when **day ≥ 2** and milestone unlocks it. |
| **mobs.infectedBearSeen** | When the player **kills or sees** an Infected Maple Bear (or variant), or **day ≥ 4** milestone. |
| **mobs.infectedPigSeen** | When the player **kills or sees** an Infected Pig (or variant). |
| **mobs.infectedCowSeen** | When the player **kills or sees** an Infected Cow (or variant). |
| **mobs.buffBearSeen** | When the player **kills or sees** a Buff Maple Bear (or variant), or **day ≥ 13** milestone. |
| **mobs.flyingBearSeen** | When the player **kills or sees** a Flying Maple Bear (or variant), or **day ≥ 8** milestone. |
| **mobs.miningBearSeen** | When the player **kills or sees** a Mining Maple Bear (or variant). |
| **mobs.torpedoBearSeen** | When the player **kills or sees** a Torpedo Maple Bear (or variant). |
| **mobs.tinyBearKills** (etc.) | **Kill counts** per type; incremented when the player (or nearby) gets a kill. Used for discovery thresholds (e.g. 3 kills → discovery message) and for showing Combat Analysis (e.g. killCount ≥ 25). |
| **mobs.day4VariantsUnlocked** | When **current day ≥ 4** and the player has seen Tiny or Infected Maple Bear. Unlocked by **checkVariantUnlock** in main.js. |
| **mobs.day8VariantsUnlocked** | Day ≥ 8 and (mapleBearSeen or infectedBearSeen or flyingBearSeen). |
| **mobs.day13VariantsUnlocked** | Day ≥ 13 and (mapleBearSeen or infectedBearSeen or buffBearSeen or flyingBearSeen). |
| **mobs.day20VariantsUnlocked** | Day ≥ 20 and (mapleBearSeen or infectedBearSeen or buffBearSeen). |
| **mobs.day20*LoreUnlocked** | When the player **kills** (or witnesses kill of) the **Day 20 variant** of that bear type (Tiny Day 20, Infected Day 20, Buff Day 20). |
| **mobs.day20WorldLoreUnlocked** | When **day ≥ 20** and the Day 20 world lore is granted (main.js or mb_dayTracker milestone). |

---

## 6. Biomes

| What | How / When |
|------|------------|
| **biomes.infectedBiomeSeen** | When the player **enters** an infected biome (dimension + biome check). |
| **biomes.dustedDirtSeen** | When the player **stands on or breaks** dusted dirt. |
| **biomes.snowLayerSeen** | When the player **stands on or sees** infected dust layer. |
| **biomes.dustedDirtGroundEffectSeen** | When the player **stands on** dusted dirt and gets ground effect (e.g. infection increase). |
| **biomes.snowLayerGroundEffectSeen** | When the player **stands on** infected dust layer and gets ground effect. |
| **biomes.biomeAmbientPressureSeen** | When ambient infection pressure in the biome is observed. |
| **biomes.minorToMajorFromGround** | When **minor infection** converts to **major** from standing on corrupted ground. |
| **biomes.majorGroundWarningSeen** | When the player has **major infection** and stands on corrupted ground (warning applied). |
| **biomes.majorSnowIncreaseFromGround** | When **"snow" level** increases from standing on corrupted ground (major infection). |
| **biomeData.*** | Filled when the player **visits** a biome and **recordBiomeVisit** is called (visit count, infection level stats). |

---

## 7. Knowledge levels

| What | How / When |
|------|------------|
| **knowledge.infectionLevel** | Raised by **checkKnowledgeProgression** (mb_codex) when the player has infection-related discoveries (bear/snow infection, minor/major, cures). |
| **knowledge.bearLevel** | Raised when the player has bear hits, kills, or mob discoveries. |
| **knowledge.biomeLevel** | Raised when the player has biome discoveries (e.g. infected biome, dusted dirt). |
| **knowledge.cureLevel** | Raised when the player discovers cures or completes a cure. |
| **knowledge.snowLevel** | Raised when the player finds/identifies "snow" or has snow effects. |

---

## 8. Journal (Late Lore)

| What | How / When |
|------|------------|
| **journal.day20WorldLoreUnlocked** | When **day ≥ 20** and the world lore entry is granted (main.js unlockAllContentForDay or Day 20 milestone). |
| **journal.day20TinyLoreUnlocked** | When the player **kills** (or witnesses kill of) a **Tiny Maple Bear Day 20** variant. |
| **journal.day20InfectedLoreUnlocked** | When the player **kills** (or witnesses) an **Infected Maple Bear Day 20** variant. |
| **journal.day20BuffLoreUnlocked** | When the player **kills** (or witnesses) a **Buff Maple Bear Day 20** variant. |

---

## 9. Timeline / Daily log & achievements

| What | How / When |
|------|------------|
| **dailyEvents** | **recordDailyEvent** (mb_dayTracker) writes events **one day after** they occur (reflection day). Filled by milestone messages, lore entries, and general day messages. |
| **achievements.day25Victory** | When the player **reaches day 25** (milestone). |
| **achievements.day25VictoryDate** | Day number when day 25 was reached. |
| **achievements.maxDaysSurvived** | Updated when the player survives past day 25 (e.g. max days survived). |

---

## 10. Reset and full unlock (developer)

- **Reset codex** (Developer Tools → Reset My Codex, or `/scriptevent mb:cmd` with `reset_codex`): Calls **clearPlayerCodexState** in main.js. This **saves the default codex** via **saveCodex(player, getDefaultCodex())**, so all unlockable state (infections, cures, effects, items, mobs, biomes, knowledge, journal, biomeData) is reset. It also clears related dynamic properties (e.g. mb_infection, mb_bear_hit_count, mb_max_snow_level) and in-memory maps (playerInfection, curedPlayers, bearHitCount, maxSnowLevels). **dailyEvents** and **achievements** are not in the default codex, so they are **wiped** when the whole codex blob is replaced. So reset **does** clear everything in the codex.

- **Fully unlock codex** (Developer Tools → Fully Unlock Codex): Calls **fullyUnlockCodex(player)** in mb_codex.js. It sets all unlockable flags to true, sets mob kill counts to 200, sets knowledge levels to 3, and adds a minimal **biomeData** entry so Infection Analysis can show. It does **not** add dailyEvents or achievements; it only unlocks all viewable content (sections, entries, variant text, lore).

---

## 11. Addon difficulty

**Addon difficulty** (Easy / Normal / Hard) is a **per-world** setting that affects:

- **Spawn rate** – Easy reduces bear spawn chance, Hard increases it (on top of any other spawn modifiers).
- **Hits to infect** – Easy: more hits needed (e.g. 4 base, 3 when minor infected); Normal: 3 base, 2 when minor; Hard: 2 base, 1 when minor.
- **Infection speed** – Easy slows the infection timer decay, Hard speeds it up.
- **Mining bear mine speed** – Easy: slower (longer interval between breaks); Hard: significantly faster (shorter interval).
- **Torpedo max blocks per dive** – Easy: slightly lower limit; Hard: significantly higher limit (e.g. double base).
- **Mining bear mine speed** – Easy: slower (higher ticks between breaks); Hard: significantly faster (lower interval).
- **Torpedo max block limit** – Easy: lower max blocks per dive (~85% of base); Hard: significantly higher (~150% of base).

**Where to set it:** Journal (Basic or Powdery) → **Settings** → **General** → **Addon Difficulty**. Only the first player to join the world or players with **mb_cheats** can change it; others can see the current value. Changing addon difficulty also sets **Spawn Difficulty** to the same level (Easy/Normal/Hard), but Spawn Difficulty can be overridden later in **Developer Tools** (Codex → Developer Tools → Spawn Difficulty), which allows a custom value from -5 to +5 for fine-tuning spawn rate only.

- **World property:** `mb_addonDifficulty` (-1 = Easy, 0 = Normal, 1 = Hard). Default is 0 (Normal).

---

## File references

- **Codex state and UI:** `BP/scripts/mb_codex.js` (getDefaultCodex, getCodex, saveCodex, markCodex, fullyUnlockCodex, openDeveloperTools, openLateLore, etc.)
- **Reset and commands:** `BP/scripts/main.js` (clearPlayerCodexState, executeMbCommand, reset_codex)
- **Unlock triggers:** main.js (bear kill tracking, infection, item use, ground exposure, checkVariantUnlock), mb_dayTracker.js (recordDailyEvent, day milestones)
