# Maple Bear type catalog

Canonical list of **Maple Bear Apocalypse (M.B.A.)** hostile mob types: entity IDs, unlock timing, role, and **camera shake on player hit** (vs first-bite snow eat = 100%). All shake uses **Journal → Settings → Camera shake** unless disabled.

Entity IDs live in `BP/scripts/mb_spawnEntityIds.js`. Shake tiers in `mb_infectionCameraShake.js`.

---

## Day-tier scouts (ground)

| Display name | Entity ID | Unlocks | Role | Hit shake |
|--------------|-----------|---------|------|-----------|
| **Tiny Maple Bear** | `mb:mb_day00` | Day 0 | Weakest scout; infection vector | **24%** (shortest pulse) |
| **Day 4 bear** | `mb:mb_day04` | Day 4+ | Early upgraded scout | **36%** |
| **Day 8 bear** | `mb:mb_day08` | Day 8+ | Mid-early scout | **36%** |
| **Day 13 bear** | `mb:mb_day13` | Day 13+ | Stronger ground threat | **50%** |
| **Day 20 bear** | `mb:mb_day20` | Day 20+ | Ascended flanking striker | **50%** |

**Journal:** Tiny Maple Bear entry; day variants unlock in codex as world day advances.

---

## Infected family (converted / outbreak bears)

| Display name | Entity ID | Notes | Hit shake |
|--------------|-----------|-------|-----------|
| **Infected Maple Bear** | `mb:infected` | Standard infected bear | **62%** |
| **Infected bear (day 8)** | `mb:infected_day08` | Day 8+ variant | **66%** |
| **Infected bear (day 13)** | `mb:infected_day13` | Day 13+ variant | **70%** |
| **Infected bear (day 20)** | `mb:infected_day20` | Ascended; dust saturation | **76%** |
| **Infected pig** | `mb:infected_pig` | Spreads infection to other mobs | **62%** |
| **Infected cow** | `mb:infected_cow` | Livestock vector | **62%** |

---

## Specialist bears

| Display name | Entity ID | Unlocks | Role | Hit shake |
|--------------|-----------|---------|------|-----------|
| **Buff Maple Bear** | `mb:buff_mb` | Day 4+ (rare) | Mini-boss; heavy melee; powder burst on death | **100%** |
| **Buff bear (day 13)** | `mb:buff_mb_day13` | Day 13+ | Stronger buff variant | **100%** |
| **Buff bear (day 20)** | `mb:buff_mb_day20` | Day 20+ | Ascended buff; long leaps | **100%** |
| **Flying Maple Bear** | `mb:flying_mb` | Day 4+ | Sky hunter; swoops and dusts from above | **28%** |
| **Flying MB (day 15)** | `mb:flying_mb_day15` | Day 15+ | Higher patrol arcs | **38%** |
| **Flying MB (day 20)** | `mb:flying_mb_day20` | Day 20+ | Stratos patrol | **44%** |
| **Mining Maple Bear** | `mb:mining_mb` | Day 4+ | Digs 1×2 tunnels for the horde | **50%** |
| **Mining bear (day 20)** | `mb:mining_mb_day20` | Day 20+ | Siege engineer; wider tunnels | **70%** |
| **Torpedo Maple Bear** | `mb:torpedo_mb` | Day 4+ | Dive-bomber; chews blocks mid-flight | **54%** melee |
| **Torpedo bear (day 20)** | `mb:torpedo_mb_day20` | Day 20+ | Reinforced payload | **54%** melee |

**Flying note:** Physically smaller aerial hits — shake stays **between tiny and standard** ground bears, with day variants stepping up inside that band.

**Torpedo note:** **Powder explosion** (within ~5 blocks) is **86%** of snow eat — stronger than a body slam. Blast also forces cough dust and worsens infection (+snow, timer loss).

---

## Non-melee & ambient camera shake

| Trigger | Shake vs snow eat | Settings category |
|---------|-------------------|-------------------|
| Eating `mb:snow` | **100%** reference buzz | Snow |
| Active infection (ambient) | Gentle base; ramps last ~30s; peaks final ~2s | Infection |
| **Exposed in active storm** | **~28%** (throttled, ~flying MB) | Storm |
| Torpedo **explosion** | **86%** + cough + infection penalty | Combat |
| **Buff bear death burst** (≤6 blocks) | **86%** | Combat |
| **Normal cough** | **12%** minor / **18%** major | Cues |
| **Dust cough / breath** | **38%** minor / **55%** major | Cues |
| **Major cure** (weakness + enchanted apple) | **20%** settle pulse | Cues |
| **Milestone world day** (sunrise) | **24%** | Cues |

**Journal → Settings:** Camera shake **master** + sub-toggles (Infection, Snow, Combat, Storm, Cues).

---

## Quick reference — shake ladder

```
Tiny 24% → Flying 28–44% → Small 36% → Torpedo hit 54% → Standard 50% → Large 62–76% → Buff 100%
Snow eat / buff hit = 100% reference │ Torpedo blast = 86%
```

*(Flying intentionally sits below standard ground bears despite day 20 flying at 44%.)*

---

## Codex blurbs (player-facing)

Summaries from the Powdery Journal mob entries:

- **Tiny / day scouts** — First vectors of the outbreak; weakest but numerous.
- **Infected bear** — Core hostile; drops powder; scales with world day.
- **Infected pig / cow** — Livestock conversion; spread infection in herds.
- **Buff bear** — Tanky mini-boss; extreme powder drops; capped spawn count near players.
- **Flying bear** — *Sky hunters that shower you with white powder — ground them or risk suffocation.*
- **Mining bear** — *Engineers that carve 1×2 tunnels so more Maple Bears can march through.*
- **Torpedo bear** — *Airborne battering rams that streak toward sky bases and burst into powdery shrapnel.*

Deeper stats (HP, damage, drops) unlock in the journal with kills and bear knowledge level.

---

## Related docs

- [`ADDON_SYSTEMS_AND_FEATURES.md`](../development/ADDON_SYSTEMS_AND_FEATURES.md) — systems map
- [`SOUND_PROGRESS.md`](../development/sounds/SOUND_PROGRESS.md) — per-type audio
- [`PLAYER_CHANGELOG.md`](../PLAYER_CHANGELOG.md) — player-facing patch notes
