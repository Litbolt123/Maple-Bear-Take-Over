# Maple Bear Takeover – QoL Ideas & Edge Cases

Brainstormed quality-of-life features and edge cases to consider for the addon. Use this as a checklist for UX polish and robustness.

**Legend:** ✅ Implemented | ⚠️ Partial | ❌ Not implemented

---

## Quality of Life (QoL) Features

### Infection & Cure

- ⚠️ **Infection timer reminder** – Optional actionbar every N minutes. *You have a **final warning** 1 min before transformation in main.js; no periodic reminder.*
- ✅ **Cure checklist in codex** – *mb_codex: "Cure: Weakness + Enchanted Golden Apple", "Quick reference: Minor: Golden Apple + Golden Carrot. Major: Weakness + Enchanted Golden Apple".*
- ✅ **"Last cured"** – *codex.history.lastCureAt shown as "Last Cure: {date}" in Infection section (~1517–1519).*
- ✅ **Snow tier at a glance** – *Infection Level Analysis + status summary; maxSnowLevels and tier logic in codex.*
- ❌ **First-time cure hint** – One-time "You can cure major infection now" when weakness + enchanted apple. *Not implemented.*

### Codex & Journal

- ⚠️ **Simpler wording** – See `docs/Compoohter/CODEX_TEXT_SIMPLIFY_CANDIDATES.md`. *Candidates doc exists; apply as needed.*

### World & Day

- ⚠️ **Day in HUD or actionbar** – *Current day in codex; welcome on join shows day; no persistent on-screen day.*
- ✅ **Next milestone teaser** – *Days & Milestones shows "Day X: ??? (Next milestone)" when milestone is currentDay+1.*
- ✅ **"Safe until Day X"** – *Milestone list has Day 2 Tiny Bears; goal "Survive until Day 25".*
- ✅ **Biome warning** – *state.biomeWarningSent; warning after ~5 min in infected biome; majorGroundWarningSeen.*

### Settings & Accessibility

- ❌ **Preset difficulties** – *Only Easy/Normal/Hard/Custom exists.*
- ✅ **Sound categories** – *getPlayerSoundVolume, bearSoundVolume, blockBreakVolume; settings UI has volume controls.*
- ❌ **Reduce flashy effects** – *Not implemented.*
- ❌ **Bigger / clearer buttons** – *Not explicitly addressed.*

### Co-op & Multiplayer

- ✅ **Shared "world day" display** – *World day global; codex "Current Day" and Days & Milestones.*
- ❌ **"Who is infected"** – *Not implemented.*
- ❌ **Knowledge share reminder** – *Share exists; no reminder prompt.*

### Performance & Feedback

- ✅ **Loading / "addon active"** – *Returning players get welcome + title/actionbar with day.*
- ✅ **Settings confirmation** – *applySpawnDifficulty sends message; "Settings saved!" on save.*
- ⚠️ **Codex save feedback** – *Codex saves on change; no "Codex saved" on close.*

---

## Edge Cases to Handle

### Players & Sessions

- ✅ **Player disconnect mid-infection** – *Infection stored in mb_infection (dynamic props); loadInfectionData() on spawn restores state.*
- ⚠️ **Player ID reuse** – *Maps use player.id; Bedrock rarely reuses; document as low risk or add name+id if needed.*
- ✅ **First join vs. returning** – *returningPlayers, welcomedPlayers, intro seen; persistent flags.*
- ✅ **No players online** – *Spawn: allPlayers.length === 0 return; dimensionPlayers.length === 0 return (mb_spawnController).*
- ✅ **Player in undefined dimension** – *Checks in buff AI, main, spawn before using dimension.*

### Entities & Validity

- ✅ **Entity invalidated mid-tick** – *Widespread !entity?.isValid, !player?.isValid in main, buffAI, spawnController, etc.*
- ⚠️ **Stale references in Maps** – *No periodic prune of playerInfection/bearHitCount for disconnected players; validate before use.*
- ⚠️ **Dimension unload** – *Spawn uses validTiles; avoid long-lived dimension refs where possible.*

### Infection & Cure

- ⚠️ **Cure applied at exact transformation tick** – *Order not explicitly documented; worth documenting.*
- ✅ **Negative or zero infection timer** – *ticksLeft <= 1200 for warning; transform when timer expires.*
- ⚠️ **Snow count overflow / NaN** – *Tier math uses snowCount; no explicit clamp to max or NaN guard.*
- ✅ **Immunity window** – *mb_immunity_end, PERMANENT_IMMUNITY_PROPERTY; persisted and restored.*
- ✅ **Minor vs major infection transition** – *Single infection state per player; type and hit count updated together.*

### Day & Time

- ⚠️ **Day rollback** – *Behavior when day set back (e.g. dev tools) not documented.*
- ✅ **Tick counter reset / overflow** – *getCurrentDay() uses Math.max(0, Math.floor(day)); dayToRecord <= 0 return.*
- ⚠️ **Time of day / sleep** – *Day advances on sleep; duplicate milestone/welcome worth verifying.*

### Spawn & World

- ✅ **Chunk unload** – *Spawn controller: validTiles, skip inactive chunks (e.g. ~2304).*
- ✅ **No valid spawn blocks** – *filteredCandidates.length === 0 handled; fail gracefully.*
- ⚠️ **Spawn cap / density** – *Caps exist; verify per-dimension/region under load.*
- ⚠️ **Custom biome not enabled** – *Documented in TODO; no in-game warning.*

### Codex & Persistence

- ✅ **Codex too large** – *Chunked storage: getPlayerPropertyChunked/setPlayerPropertyChunked for mb_codex.*
- ✅ **Corrupt or missing codex** – *getCodex: !raw return getDefaultCodex(); catch return getDefaultCodex().*
- ✅ **Knowledge share mid-save** – *shareKnowledge merges (recipient gets unlocks only if they don't have); no overwrite.*
- ✅ **Settings per player** – *Keyed by player.id; defaults on missing/corrupt.*

### Multiplayer & Concurrency

- ✅ **Two players cure same "infection state"** – *Infection strictly per player.id.*
- ⚠️ **Same tick: bear hit and cure** – *Order not explicitly defined.*
- ✅ **Multiple players in same chunk** – *Spawn/AI use nearest player / all players where appropriate.*

### AI & Behaviors

- ✅ **Buff bear stuck in void or invalid block** – *Dimension and entity checks in buff AI before block ops.*
- ⚠️ **Torpedo / flying bear target disconnects** – *Worth verifying target cleared when invalid.*
- ⚠️ **Mining bear pathfinding to unloaded chunk** – *Abort on null block / unloaded; verify.*

### Numbers & Bounds

- ⚠️ **Division by zero** – *Guard day/tick/player count in division; audit.*
- ⚠️ **Very large coordinates** – *Clamp where critical (spawn, biome).*
- ⚠️ **Integer overflow** – *Day/tick caps (e.g. 999) not explicit.*

### Addon Lifecycle

- ✅ **World load before scripts** – *Day init, spawn loops deferred; first player join initializes.*
- ⚠️ **Script reload / hot reload** – *Single initialized flag; cancel previous run on re-init if needed.*
- ✅ **API version** – *API 2.0.0 checks and fallbacks.*

---

## Summary

- **QoL** focuses on: infection/cure clarity, codex usability, day/milestone visibility, settings feedback, co-op hints. *Many items above are already done; remaining: periodic timer reminder, first-time cure hint, presets, "who is infected", share reminder, codex-saved feedback, accessibility options.*
- **Edge cases** focus on: player disconnect, entity validity, infection/cure ordering, day/tick consistency, chunk validity, codex merge, multiplayer ordering, AI targets. *Most critical ones (persistence, validity, codex fallback, merge, no-players) are handled; consider documenting cure-vs-transform order, snow clamp/NaN, day rollback, and optional prune of stale map entries.*

Addressing the remaining items will further polish the addon. Prioritize by player impact. “X days left until transformation” (or “You are cured / immune”) so players don’t have to open the codex every time.
- **Cure checklist in codex** – Short “You need: Weakness + Enchanted Golden Apple” (or minor cure items) on the infection/cure page so new players don’t forget mid-fight.
- **“Last cured” / “Days since infection”** – In codex: “Last cured: Day 12” or “Infected for 3 days” to help plan without mental math.
- **Snow tier at a glance** – In codex or a small HUD: current snow tier (1–6) and next tier threshold so players know how close they are to tier changes.
- **First-time cure hint** – When a player gets weakness + has enchanted golden apple in inventory, one-time hint: “You can cure major infection now” (dismissible, respects knowledge gating).