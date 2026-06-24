# Beta smoke checklist

Run before tagging a beta. Record **addon version** (see `BP/scripts/mb_buildConfig.js` → `getAddonVersionDisplayString`) and **date** for each run.

| Beta version | Date (YYYY-MM-DD) | Tester | Pass / fail | Notes |
|--------------|-------------------|--------|-------------|-------|
| v0.9.0-beta.4.2 (dev) | | | | Dev Patreon: snow buzz, day-0 perf, villages opt-in |
| v0.9.0-beta.4 | 2026-05-19 | | Pass | User playtest: lag, buff cap, death explosions |
| v0.9.0-beta.3 | | | | |
| v0.9.0-beta.2 | | | | |
| v0.9.0-beta.1 | | | | |

## Quick smoke (≈15 min)

- [ ] New world loads; no script errors in content log (dev build).
- [ ] Basic journal received; open Powdery Journal main menu.
- [ ] **What's new** opens from journal.
- [ ] Spawn controller runs (bears appear by design by day 2+).
- [ ] Infection: take a hit from a bear; HUD/feedback behaves as before.
- [ ] Save & quit; reload world; codex / dynamic properties persist.

## Optional (dev)

- [ ] **Settings** shows `v0.9.0-beta.4.2 (dev build)` (dev pack).
- [ ] Eat snow → camera buzz; toggle **Settings → Camera shake** off → no buzz.
- [ ] Day 0 fresh world, script villages **OFF** — no periodic hitches walking in plains.
- [ ] Spawn debug → **Bear telemetry** ON → content log shows `[BEAR TELEMETRY]` lines (dev pack only).
- [ ] `npm run check` passes.

## Full regression

See `docs/development/testing/TESTING_CHECKLIST.md` for deeper coverage.
