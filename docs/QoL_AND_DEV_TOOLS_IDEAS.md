# Quality of Life & Developer Tools Ideas

Ideas for **player-facing QoL** and **additional dev tools** for the Maple Bear Takeover addon. Drawn from existing features (codex, settings, day tracking, infection, dev menu) and gaps in the current toolset.

---

## Quality of Life Ideas

### Mapel Bears

- **Flying Maple Bears sometimes get distracted.** - Make flying Maple Bears 10% of the time not have the ai targeting just players, but closest mobs or other nearby targets instead.

### Infection & Survival

- **Optional infection timer on screen** – Toggle in Settings: small actionbar or subtitle line (e.g. “~2 days left”) so players don’t have to open the book for a rough timer. Keep it optional and subtle.
- **“Cure reminder” hint** – If infected and the player has weakness + enchanted golden apple in inventory, one-time (or rare) tip in actionbar: “You have the cure components.”
- **First-aid summary in book** – On the Infections page, a one-line “Quick reference” that always shows: “Minor: Golden Apple + Golden Carrot. Major: Weakness + Enchanted Golden Apple.” for quick lookup. Only if they have unlocked all cure items and cured themselves before.
- **Post-cure summary** – After curing, a short message or book line summarizing what happened (e.g. “Cured on Day X” or “Permanent immunity granted”) for satisfaction and clarity.

### Discovery & Progression

- **“Next milestone” hint** – The day before the next milestone, there should be a subtle hint in the day message about the next day.

### Settings & Accessibility

- **Separate sliders for bear vs journal sounds** – You already have `bearSoundVolume` and `blockBreakVolume` in codex settings; expose these in the Settings UI (e.g. “Bear sounds” and “Block break sounds”) so players can turn down bears but keep journal sounds.
- **Reduce notification frequency** – Option in settings to “Only show critical infection/day warnings” (e.g. last amount of time before transformation, major day milestones) to cut down actionbar spam for experienced players.

### Fun / Flavor

- **Easter-egg entries** – Hidden codex lines or a “?” entry that unlocks after very specific conditions (e.g. die to every bear type, survive to Day 100, kill 100 torpedo bears) for collectors. These can be hidden acheivements that aren't shown at all until unlocked.
- **Daily log “mood”** – The daily event log could occasionally use a random tone (e.g. hopeful, grim, dry) so it doesn’t always feel the same.

---

## More Developer Tools

### Already Present (for reference)

- Script Toggles (Mining, Infected, Flying, Torpedo, Biome Ambience)
- Fully Unlock Codex, Reset Codex, Reset World Day, Set Day
- Spawn Difficulty (Easy/Normal/Hard/Custom -5 to +5)
- Clear/Set Infection (minor/major), Grant/Remove Immunity
- Reset Intro, List Nearby Bears, Force Spawn, Dump Codex State, Set Kill Counts
- Debug Menu (per-script and per-category debug flags)

### New Dev Tool Ideas

- **Script Toggles from Dev menu** – Already there; consider adding Spawn Controller as a toggle if it’s ever useful to disable spawns without changing difficulty.

- **Dump Codex: full vs snippet** – `dump_codex` currently sends a truncated string to chat. Add an option (e.g. “Dump Codex (full)” or “Dump to file”) that either sends multiple chat messages in chunks or writes to a world-stored string that can be copied (if feasible). Alternatively, “Dump Codex (summary)” that prints only high-level keys (mobs, items, journal, settings) and counts. Also, the dump should be dumped into the logs as well, not just the chat.

- **Target player for dev commands** – For “Reset Codex”, “Set Day” (world day is global, but unlock content is per-player), “Set Infection”, “Grant Immunity”, “Set Kill Counts”, “Dump Codex”, add “Apply to: [Me] [Player list]” so admins can target another player without using command args.

- **Maple Bear AI Targeting specific players** - Have a dev tool that makes all nearby bears target a specific player. The ones with ai to do so (eg. mining, torpedo, flying.)

- **List bears: radius and dimension** – “List Nearby Bears” uses 128 blocks. Add a small menu: “Radius: 32 / 64 / 128 / 256” and “Dimension: current / overworld / nether / end” (or just current for now) to scope the count.

- **Force spawn: quantity** – In the Force Spawn flow, add “How many? 1 / 5 / 10” to spawn multiple of the same type at once for stress tests or arenas.

- **Simulate next day** – “Advance day by 1” (or “Advance to next milestone”) that increments world day, runs milestone logic, and optionally unlocks content for the operator. Complements “Set Day” for testing progression without jumping to a fixed day.

- **Clear all bears (radius)** – “Kill all Maple Bears within 64 (or 128) blocks” to reset an area for testing spawns or cleaning up after a test. This includes infected mobs.

- **Inspect entity** – “Inspect nearest bear” (or “Inspect entity you’re looking at”): print typeId, variant/day if applicable, target, health, dimension, position, NBT data. Useful to verify which variant actually spawned.

- **Reset single codex section** – Instead of “Reset My Codex” only, add “Reset section: Mobs / Items / Infections / Journal / All” so testers can re-unlock only one part.

- **Spawn difficulty preview** – In the Spawn Difficulty menu, show a one-line reminder of what the current value does (e.g. “-2: fewer spawns, longer intervals”) using the same logic as the spawn controller.

---

## Summary

- **QoL**: Focus on codex usability (resume, bookmarks, “new” badges), optional infection timer and cure hints, discovery feedback (toasts/sounds, next-milestone hint, kill progress), and more granular sound/notification settings. A few flavor ideas (easter eggs, achievement pop) can make progression feel more rewarding.
- **Dev tools**: Improve existing tools (full/summary codex dump, target player, list bears radius/dimension, force spawn quantity), add simulation and cleanup (simulate next day, clear bears in radius, inspect entity), and add optional export/import and section-only codex reset for faster testing.

If you tell me which QoL or dev tool you want first, I can outline concrete implementation steps in the codebase (e.g. where to add a “Continue reading” button or how to add “Dump Codex (summary)” in `main.js` and the codex UI).
