# Commit description — 2026-02-01 session

**Suggested commit title (first line):**
```
Addon difficulty UI & hit messages, Developer Tools (Infection fix, Clear/Set Infection, Force Spawn, etc.)
```

Use the following as the commit message body (or adapt as needed).

---

## Summary

Addon difficulty UI refinements, optional Developer Tools, Infection button fix, Force Spawn target/distance, and difficulty-based hit messages across the codex.

---

## Changes

### Addon difficulty (Settings)

- **Label**: Normal players see only "Addon Difficulty" (no list of what it changes). Players with **mb_cheats** see a full description including numeric multipliers (spawn, major hits from nothing, major hits from minor, infection decay, mining interval, torpedo max blocks) with E/N/H values.
- **Dev description**: Explicit "Major hits (from nothing)" and "Major hits (from minor)" with values (e.g. E 4 N 3 H 2 and E 3 N 2 H 1).

### Difficulty: mining & torpedo

- **Hard mode** (mb_dynamicPropertyHandler.js): `miningIntervalMultiplier` 0.6 → **0.5**, `torpedoMaxBlocksMultiplier` 1.5 → **2.0** so Hard is more impactful.
- **Docs**: CODEX_UNLOCKS.md §11 updated to mention mining bear mine speed and torpedo max blocks per dive.

### Codex script

- Restored **ADDON_DIFFICULTY_PROPERTY** and **getAddonDifficultyState** in the mb_dynamicPropertyHandler import at the top of mb_codex.js (fixes missing reference after manual edit).

### Infection button (dusted journal)

- **Bug**: Clicking "Infection" on the main codex UI after Fully Unlock Codex closed the book.
- **Cause 1**: `isMinor` was only defined inside `if (hasInfection)` but used later when the player had no infection → ReferenceError.
- **Cause 2**: `fullyUnlockCodex` set `codex.infections.minor = true` and `codex.infections.major = true` (booleans), while the rest of the code expects `codex.infections.minor.discovered` / `codex.infections.major.discovered` (objects).
- **Fixes**: Define `isMinor` at the start of `openInfections()`; set `codex.infections.minor = { discovered: true }` and `codex.infections.major = { discovered: true }` in `fullyUnlockCodex`; use `minorDiscovered` / `majorDiscovered` helpers that support both object and boolean shapes for existing saves.

### Optional Developer Tools (after existing tools)

New options in **Developer Tools** (Codex → Developer Tools), in order after Spawn Difficulty:

1. **Clear / Set Infection** — Menu: Clear infection | Set minor | Set major (debug commands: clear_infection, set_infection [minor|major]).
2. **Grant / Remove Immunity** — Menu: Grant permanent | Grant temporary (5 min) | Remove immunity (grant_immunity, remove_immunity).
3. **Reset Intro** — Clears mb_intro_seen so the player sees the intro again (reset_intro).
4. **List Nearby Bears** — Lists bear counts within 128 blocks in chat (list_bears).
5. **Force Spawn** — Flow: choose bear type → choose target (Near me | other players) → choose distance (Near 2 blocks | 5 | 10 | 15 | 20 | Random within 20). Spawns bear at a random angle at that distance from the target (force_spawn [entityId] [playerName?] [distance|random]).
6. **Dump Codex State** — Sends truncated codex JSON to chat (dump_codex).
7. **Set Kill Counts** — Menu of mob types (Tiny Bear, Infected Bear, etc.), then 0–500 slider to set that mob’s kill count (set_kill_count [mobKey] [value]).

**main.js**: New `executeMbCommand` cases for clear_infection, set_infection, grant_immunity, remove_immunity, reset_intro, list_bears, force_spawn, dump_codex, set_kill_count. Force spawn supports 2 args (entityId, distance) or 3 (entityId, playerName, distance); distance can be numeric or "random" (1–20 blocks).

### Difficulty hit messages (codex)

- All player-facing hit counts now use **getAddonDifficultyState()** instead of hardcoded 2/3.
- **Summary**: "You require X hits", Bear Hits X/Y, "Warning: X hit(s) OR 1 snow" use hitsBase and minorToMajorHits.
- **Infection screen**: Permanent immune "You now require X hits", progression "Requires X hit(s) to progress to major", cure "Requires: X hits (instead of Y)" use addon difficulty.
- **Items / cure text**: Golden Apple, Golden Carrot, Enchanted Golden Apple, Cure Components, and progression blurbs all use addon difficulty for major hits (from nothing) and major hits (from minor).

---

## Files touched

- BP/scripts/mb_dynamicPropertyHandler.js (Hard multipliers; addon difficulty already present)
- BP/scripts/mb_codex.js (import, Settings label, Infection fix, fullyUnlockCodex shape, dev tools menus, all difficulty hit messages)
- BP/scripts/main.js (force_spawn distance/target, new debug commands)
- docs/CODEX_UNLOCKS.md (mining & torpedo in §11)
- docs/context summary.md (this session appended)
