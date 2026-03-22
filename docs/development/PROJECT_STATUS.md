# Project status & next steps

Snapshot of **where the addon stands** and **what to tackle next**. For task-level checkboxes see root [`TODO.md`](../../TODO.md). For code-level history see [`tracking/CHANGELOG.md`](tracking/CHANGELOG.md).

**Last updated:** 2026-03-20

---

## Recently solidified (high level)

- **Spawn controller**: Hub UI, presets, per-scan tunables, spawn speed multiplier, multiplayer lag optimizations (spread vs tight-group modes).
- **Storms**: Multi-storm support, overlap intensity, per-storm enable/disable, storm dev hub, shelter checks, persistence fixes, tuning modals.
- **Emulsifier**: Zones with fuel queue, burn order, ring-based dome purification scan, netherite rules, break-drop behavior, spawn suppression near machines.
- **Codex / journal**: Search, settings, achievements gated on journal ownership or persisted unlock, knowledge sharing, extensive Developer Tools.
- **Dimensions**: Nether/End **spawning on native blocks**; Nether **fire resistance** by day tier; End **flying/torpedo spawn emphasis** scaling with day.
- **Overworld**: Custom infected biome (experiment) + client visuals; dusted ground infection pipeline.
- **Infrastructure**: Dynamic property handler caching, shared entity/player caches, item registry pattern.

---

## In good shape

- Core infection/cure loops and symptom scaling.
- Day tracker and milestone messaging.
- Mining / torpedo / flying AI with performance-oriented cadence and shared caching.
- Manual testing workflow documented (`docs/development/testing/`).

---

## Gaps & risks (known)

- **Automated tests**: None in-world; validation is `npm run check` + manual Minecraft play.
- **Mining block list tool**: `tools/updateMiningBlocks.js` expects `minecraft:break_blocks` on mining entities — verify entity JSON if regenerating lists.
- **ESLint**: Many pre-existing `no-unused-vars` warnings; not a signal of runtime bugs.
- **Custom biomes**: Experimental; mixed old/new chunks can show seams — document for players.

---

## Suggested next steps (priority-ordered)

1. **Playtest pass**: Spawn presets + multi-storm + emulsifier in multiplayer; note lag and edge cases.
2. **Design backlog picks**: Choose one vertical from [`TODO.md`](../../TODO.md) — e.g. direct player-to-player infection spread, HUD/timer UI, or Nether/End **content** (unique variants) vs **systems** (already partially there).
3. **Documentation**: Developer onboarding + troubleshooting guides ([`TODO.md`](../../TODO.md) doc section).
4. **Content**: Structures, raptor flying variant, or endgame day-50/75/100 beats — align with [`DESIGN_VISION.md`](../design/DESIGN_VISION.md).

---

## How to validate changes locally

From repo root:

```bash
npm run check
```

See [`AGENTS.md`](../../AGENTS.md) for script API constraints (scripts do not run under Node).
