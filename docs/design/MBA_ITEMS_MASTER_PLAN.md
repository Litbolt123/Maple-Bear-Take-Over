# MBA items & mob loot — master plan (v0.3)

**Status:** Planning only — **not implemented.**  
**Last updated:** 2026-05-25  
**Purpose:** Single design reference for custom MBA gear, dense snow chain, loot tables, journal/codex, and purification. Use when scheduling implementation.

**Related code (today):**

- Torpedo duds: `mb_torpedoAI.js` — `TORPEDO_DUD_CHANCE = 0.05`, property `mb_torpedo_dud`
- Mining unbreakable set: `mb_miningBlockList.js` — `UNBREAKABLE_BLOCKS`
- Mob IDs: `mb_spawnEntityIds.js`
- Current loot: mostly `mb:snow` via `BP/loot_tables/mb_loot_tables/*`

---

## Design pillars

1. **Mob fantasy** — drops match the bear (buff = arm, mining = claw, torpedo = spine, flying = membrane).
2. **Rare fights, rare gear** — signature weapons from buff / mining / torpedo; tiny bears unchanged for now.
3. **Corruption vs purification** — gear can spread or carry powder; golden apple + purified dense snow cleans it.
4. **Journal discovery** — codex Items entries; purification knowledge unlocks extra lore on base entries.
5. **Anti–Maple Bear** — combat bonus vs all `mb:*` addon mobs (same set as spawn telemetry / `ALL_MB_MOB_TYPES`).

---

## Global systems

### Anti–Maple Bear (melee)

| Rule | Detail |
|------|--------|
| Targets | Entities whose `typeId` is in the addon mob set (bears, infected animals, etc.) |
| Bonus | **+35% damage** (tune 25–50% in playtest) |
| Implementation | `entityHurt` — player attacker, mainhand item ID, victim in MB set |

Applies to: **Buff Bear Arm**, **Mining Maple Bear Claw**, and optionally **extra** multiplier for MB inside **cured** spine blast (base blast still hurts all mobs).

### Purification / curing (player knowledge)

| Field | Value |
|-------|--------|
| **Codex key** | `mapleBearGearPurificationKnown` |
| **Unlock** | First craft of any purified/cured MBA gear **or** first craft of `mb:purified_dense_snow` |
| **Journal entry** | **Purifying Maple Bear Gear** (Items section) |

**Journal rule:** Each base item entry describes the item as found. After purification is known, append a **§6Purification§7** paragraph (see per-item sections below).

**Purifying Maple Bear Gear (journal body draft):**

> §ePurifying Maple Bear Gear  
> §7Golden apples purge corruption from MBA loot.  
> §7• **Torpedo Spine** → Cured Torpedo Spine: blast without powder dust.  
> §7• **Buff Bear Arm** → Purified Buff Bear Arm: stops spreading "snow" when you strike.  
> §7• **Mining Maple Bear Claw** → Purified Mining Maple Bear Claw: stops leaving powder when you mine.  
> §7Repair purified gear with **Purified Dense "Snow"** in an anvil.

### Repair (all gear)

- **Anvil** + **crafting table** (shapeless repair recipes mirror anvil).
- **Unpurified** gear → `mb:dense_snow` (+ optional vanilla mat per item).
- **Purified** gear → `mb:purified_dense_snow` only.
- **Future:** special crafting block (not in v0.2 scope).

### Materials (no maple fuzz)

| ID | Form | Role |
|----|------|------|
| `mb:snow` | Item (exists) | Base powder |
| `mb:snow_block` | Block (new) | 9× `mb:snow` |
| `mb:dense_snow` | Item (new) | 9× `mb:snow_block`; repair unpurified gear; rare drops |
| `mb:purified_dense_snow` | Item (new) | `mb:dense_snow` + golden apple; repair purified gear |
| `mb:dense_snow_block` | Block (new) | 9× `mb:dense_snow` — **gameplay TBD** |

### Crafting chain

```
9× mb:snow           → 1× mb:snow_block
9× mb:snow_block     → 1× mb:dense_snow (item)
mb:dense_snow + golden apple → 1× mb:purified_dense_snow
9× mb:dense_snow     → 1× mb:dense_snow_block (TBD)
```

---

## Drop policy summary

| Mob | New drops |
|-----|-----------|
| **Tiny / day-tier bears** | **None** (keep current `mb:snow` only) |
| **Infected bears** | **Low** `mb:dense_snow` only (~5–8%, 1×, player kill) — no signature gear |
| **Buff** | Dense snow + **Buff Bear Arm** |
| **Mining** | Dense snow + **Mining Maple Bear Claw** |
| **Flying** | **Wing membrane** |
| **Torpedo** | Low dense snow + **Torpedo Spine** (duds much higher) |

---

## 1. Buff Bear Arm

### Base: `mb:buff_bear_arm`

| Stat | Value |
|------|--------|
| Display name | **Buff Bear Arm** |
| Type | Sword (`minecraft:weapon`) |
| Damage | **7** (diamond-tier) |
| Attack speed | **~0.8×** normal sword (slightly slower) |
| Durability | **1200** |
| Knockback | **Slightly increased** vs mobs on hit |
| Anti-MB | +35% damage vs Maple Bear creatures |
| Corruption quirk | **~8–12%** chance on melee hit to place/replace nearby surface with `mb:snow_layer` |

**Repair (unpurified):** anvil — arm + `mb:dense_snow` (± iron ingot — TBD in implementation).

### Purified: `mb:buff_bear_arm_purified`

| Stat | Value |
|------|--------|
| Craft | Shapeless: `mb:buff_bear_arm` + `minecraft:golden_apple` → purified arm (**full 1200** durability recommended) |
| Behavior | Same damage, speed, knockback, anti-MB; **no random snow** on attack |
| Repair | `mb:purified_dense_snow` only |

### Loot (`buff_bear_*` tables)

| Pool | Content |
|------|---------|
| 1 | `mb:snow` (keep existing min/max per tier) |
| 2 | `mb:dense_snow` ×1–2 (uncommon) |
| 3 | `mb:buff_bear_arm` — **3%** base / **5%** day 13 / **8%** day 20 |

**Conditions:** `killed_by_player`; Looting **+1% per level** on pool 3 (cap ~15%).

### Journal

**`buffBearArmSeen` — base:**

> §eBuff Bear Arm  
> §7Heavy limb loot from a Buff Maple Bear. Slower than a normal sword, hits like diamond, knocks targets back a little harder.  
> §7Extra damage against Maple Bear creatures.  
> §7Sometimes leaves powder behind when you strike — corruption clings to it.  
> §7Repair: Dense "Snow" in an anvil. Durability 1200.

**Append after `mapleBearGearPurificationKnown`:**

> §6Purification:§7 Golden apple removes the powder-on-hit curse. Repair the purified arm with Purified Dense "Snow".

**`buffBearArmPurifiedSeen`:** separate entry for purified arm (short duplicate OK or link to purification entry).

---

## 2. Torpedo Spine

### Raw: `mb:torpedo_spine`

| Stat | Value |
|------|--------|
| Display | **Torpedo Spine** |
| Type | Throwable consumable (script; 5 uses) |
| Visual | Bone + white powder + dusted TNT aesthetic |
| Explosion radius | **~3** blocks (live torpedo death burst uses **~5** + snow ring) |
| Block break | Fewer than bear (~8–12 cap); honor `UNBREAKABLE_BLOCKS` |
| Entity damage | **All mobs** in radius — damage scales with distance (e.g. center ~8–10, edge ~4; playtest) |
| Anti-MB | Optional **×1.35** (or similar) **on top of** normal blast damage for MB only |
| Dust | Yes — light `mb:snow_layer` in **~2** block spread |
| Self-damage | Player can be hurt if too close |

### Cured: `mb:torpedo_spine_cured`

| Stat | Value |
|------|--------|
| Craft | `mb:torpedo_spine` + `minecraft:golden_apple` → cured, **5 uses** reset |
| Dust | **None** |
| Entity damage | Same as raw — hurts **everything** in blast; MB bonus optional |
| Repair | Uses-only for v0.2; if repair added later → `mb:purified_dense_snow` |

### Loot

| Source | Spine drop chance |
|--------|-------------------|
| Torpedo **dud** (`mb_torpedo_dud`) | **12%** |
| Normal torpedo | **2%** |
| Day 20 torpedo | **4%** |
| Day 20 dud | **18%** |

**Implementation note:** Dud rolls may need **`entityDie` script** drop (dynamic property may not be visible to vanilla loot JSON). Keep existing snow pool on torpedo tables.

**Sound (planned, asset TBD):**

| Event | Sound ID |
|-------|----------|
| Dud death / quiet exhaust | **`mb.torpedo_dud.fizzle`** (maintainer to supply) |
| Spine detonation | Quieter variant of `torpedo_mb.explode` |

Today duds use `torpedo_mb.death` only — fizzle is additive when RP is ready.

### Journal

**`torpedoSpineSeen` — base:**

> §eTorpedo Spine  
> §7Bone, white powder, and weak charge — a handheld dud. Five throws.  
> §7Blast hurts **everything** nearby, smaller than a live Torpedo Maple Bear, and spreads corruption dust.  
> §7Torpedo **duds** drop this far more often.

**Append after purification known:**

> §6Purification:§7 Golden apple → Cured Torpedo Spine: same blast, **no dust**, still hurts all mobs; strongest vs Maple Bears.

**`torpedoSpineCuredSeen`:**

> §eCured Torpedo Spine  
> §7Purged spine. Explosion without powder. Damages all creatures in the blast; bears take the worst of it.

---

## 3. Mining Maple Bear Claw

### Base: `mb:mining_maple_bear_claw`

| Stat | Value |
|------|--------|
| Display | **Mining Maple Bear Claw** |
| Mining | Diamond-tier speed on blocks **not** in `UNBREAKABLE_BLOCKS` |
| Cannot break | obsidian, bedrock, ancient debris, netherite block, end portal frame, command blocks, etc. (see `mb_miningBlockList.js`) |
| Combat | **6** damage (iron sword), normal attack speed |
| Anti-MB | +35% |
| Durability | **1200** |
| Corruption quirk | On **block break** while mining, **small chance** (~8–12%) to place `mb:snow_layer` on a valid adjacent/replaced surface (mining-bear corruption — **not** on every break) |
| Repair | Claw + 3× `mb:dense_snow` + 1× diamond (anvil) — tune in implementation |

**Implementation note:** Script break (`playerBreakBlock` + held item) likely required; apply snow-layer roll only when break succeeds and block was not in `UNBREAKABLE_BLOCKS`.

### Purified: `mb:mining_maple_bear_claw_purified`

| Stat | Value |
|------|--------|
| Craft | Shapeless: `mb:mining_maple_bear_claw` + `minecraft:golden_apple` → purified claw (**full 1200** durability recommended) |
| Behavior | Same mining/combat/anti-MB; **does not place `mb:snow_layer` when mining** |
| Repair | `mb:purified_dense_snow` (+ diamond optional — TBD; at minimum purified dense) |

### Loot

| Drop | Chance |
|------|--------|
| Claw | **4%** mining / **~6%** day 20 mining |
| `mb:dense_snow` | **~10%** |

### Journal — `miningMapleBearClawSeen` (base)

> §eMining Maple Bear Claw  
> §7All-in-one claw from a Mining Maple Bear. Mines like diamond on anything they can chew (not obsidian or bedrock). Fights like iron, cuts bears deeper.  
> §7Sometimes leaves powder on blocks you break — corruption from the claw.  
> §7Repair with Dense "Snow" and diamond. Durability 1200.

**Append after `mapleBearGearPurificationKnown`:**

> §6Purification:§7 Golden apple stops the claw from placing "snow" when you mine. Repair the purified claw with Purified Dense "Snow".

**`miningMapleBearClawPurifiedSeen`:** pick up or craft purified claw (short entry or link to purification page).

---

## 4. Wing membrane

### `mb:wing_membrane`

| Stat | Value |
|------|--------|
| Drop | Flying bear **15%** / day15 **20%** / day20 **25%** ×1 |
| Use | Brewing: **Slow Falling** (e.g. 3 membranes + awkward potion — standard or custom) |

### Journal — `wingMembraneSeen`

> §eWing Membrane  
> §7Papery scrap from a Flying Maple Bear.  
> §7Brew into slow falling — the sky isn't safe anymore, but you can visit it.

---

## 5. Dense & purified dense snow (journal)

**`denseSnowSeen`:**

> §eDense "Snow"  
> §7Powder packed tight — nine "snow" make a block, nine blocks make dense snow.  
> §7Repairs MBA gear and crafts stronger snow blocks.  
> §7What the dense **block** does is still unknown.

**`purifiedDenseSnowSeen`:**

> §ePurified Dense "Snow"  
> §7Dense snow cleansed with a golden apple. Used to repair **purified** Maple Bear gear.

**`snowBlockSeen` (optional):** entry for compressed snow block.

---

## Master loot layout (template)

```
POOL A — mb:snow (existing curves per mob JSON)
POOL B — mb:dense_snow (low on infected+; higher on elite mobs)
POOL C — signature item (player kill, rare %)
```

| Mob | Pool B | Pool C |
|-----|--------|--------|
| Tiny / day | — | — |
| Infected | dense low | — |
| Buff | dense | Buff Bear Arm |
| Mining | dense | Mining Maple Bear Claw |
| Flying | — | Wing membrane |
| Torpedo | dense low | Torpedo Spine (dud ↑) |

---

## Codex keys checklist

| Key | Trigger |
|-----|---------|
| `mapleBearGearPurificationKnown` | First purify/cure craft or purified dense snow |
| `buffBearArmSeen` | Pick up arm |
| `buffBearArmPurifiedSeen` | Pick up / craft purified arm |
| `torpedoSpineSeen` | Pick up spine |
| `torpedoSpineCuredSeen` | Craft / pick up cured spine |
| `miningMapleBearClawSeen` | Pick up claw |
| `miningMapleBearClawPurifiedSeen` | Pick up / craft purified claw |
| `denseSnowSeen` | Pick up dense snow |
| `purifiedDenseSnowSeen` | Pick up purified dense snow |
| `snowBlockSeen` | Pick up / craft snow block (optional) |
| `wingMembraneSeen` | Pick up membrane |

**Items menu order (suggested):** snow chain → MBA weapons → Purifying Maple Bear Gear (gated) → wing membrane.

**Mob codex pages:** Update buff / torpedo / mining drop lines when loot ships.

---

## Implementation phases (when approved)

| Phase | Work |
|-------|------|
| P1 | Items, icons, snow/dense blocks, recipes |
| P2 | Loot tables + torpedo dud script drops for spine |
| P3 | Item use: spine throws + use counter |
| P4 | Shared `entityHurt` anti-MB + arm snow-on-hit + knockback |
| P5 | Mining claw break rules + unpurified snow-on-mine roll |
| P6 | Purification crafts + codex + journal bodies |
| P7 | RP textures; sounds (`mb.torpedo_dud.fizzle`, spine explode) |

---

## Open decisions (pre-implementation)

1. **Purified buff arm craft:** golden apple only, or apple + 1× `mb:dense_snow`?
2. **Unpurified arm repair:** dense snow only, or dense + iron?
3. **Spine blast:** keep MB bonus multiplier on top of “hurts everything,” or equal blast + cured as bear-hunter only?
4. **Dense snow block:** gameplay effect (fuel, emulsifier, zone marker, etc.).

---

## Removed from scope (v0.2)

- `mb:maple_fuzz` and related drops  
- New drops from tiny bears  
- Signature loot from infected bears (dense only)  
- Special crafting block for repair  
