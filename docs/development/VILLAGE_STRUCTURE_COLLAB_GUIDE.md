# Village structure collaboration guide

**Audience:** **Maple Bear** (co-creator — hand-built village art) + Litbolt / Compoohter (pack wiring)  
**Goal:** **Full abandoned villages** built as connected **jigsaw** pieces (`.mcstructure`), spawned by **worldgen** — **not** by our script placing blocks structure-by-structure.  
**Scope target:** About **half** of vanilla’s house variety (~**4 house variants per biome**), plus paths, a village center, and core work buildings — abandoned zombie-village theme.

> **Important:** The addon still has a **procedural script builder** (`mb_abandonedSettlementBuilder.js`) for lamp-post villages today. **That path is on hold** while we move to **Maple Bear’s jigsaw villages**. Script may still handle **loot, zombies, and processors** — not laying out houses.

**Related internal docs (Litbolt / Compoohter):**

- [ABANDONED_VILLAGE_STRUCTURES.md](./ABANDONED_VILLAGE_STRUCTURES.md) — jigsaw JSON, processors, export path
- [ABANDONED_SETTLEMENTS.md](./ABANDONED_SETTLEMENTS.md) — legacy script villages (reference for tiers/loot only)
- [WORLD_SETUP.md](./WORLD_SETUP.md) — Bedrock **1.26+**, no extra experiments for jigsaw worldgen

**Future (not Maple Bear’s village task):** [Random lore bunkers](#future-ideas-litbolt--compoohter--not-maple-bears-village-work) — scattered hideouts with journal/lore props.

---

## 1. What you are building

**M.B.A (Maple Bear Apocalypse)** replaces normal Minecraft villages with **100% abandoned** settlements:

- Mossy stone/cobble, cobwebs, cracked walls, **no working doors**, no lit torches/campfires  
- Biome-appropriate wood/stone (oak plains, acacia savanna, sandstone desert, spruce taiga/snowy, etc.)  
- **Zombie villagers** after placement — **we** spawn them in code; **you do not**  
- Optional **infected** biome variant later (spruce + `mb:dusted_dirt`) — ask us for palette samples  

### Full village = many pieces + jigsaw blocks

Like vanilla villages or the [Creator Camp campsite](https://learn.microsoft.com/en-us/minecraft/creator/documents/structures/introductiontojigsawstructures): a **start piece** (well / plaza), **path segments**, and **building pieces** that connect through **Jigsaw blocks**. Worldgen places **one jigsaw structure** → the game assembles the hamlet/village from your template pools.

| Village size (target) | Approx. building slots | What Maple Bear supplies |
|----------------------|------------------------|---------------------------|
| **Hamlet** | ~5–6 buildings | Center + paths + 3–4 houses + 1 work (smithy or market) |
| **Village** | ~8–10 buildings | Above + church, farm, extra house pool rolls |
| **Large** (later) | ~12+ | Extra profession buildings + longer path runs |

**Tier frequency** (70% hamlet / 25% village / 5% large) is configured in our **structure set JSON**, not in your builds.

### What we are **not** doing (this project phase)

| On hold | Why |
|---------|-----|
| Script **phased block builder** for village houses | Replaced by your jigsaw exports |
| Single random buildings scattered without a village layout | POC only; not the end goal |
| Lamp-post → script-build hamlet (player discovery) | May stay for infected biomes later; **plains/normal biomes → jigsaw villages** |

---

## 2. Jigsaw pieces to build (checklist)

### Every biome — core set

Build these as separate `.mcstructure` files with **jigsaw connectors** on the street-facing edge(s).

| Piece type | Count (min.) | Notes |
|------------|--------------|--------|
| **Village center / well** | 1 | Start pool piece; jigsaws face outward to **paths** (4 or 6 directions OK) |
| **Path — straight** | 2 variants | Mossy cobble / gravel; 3×1 or 5×1 between buildings |
| **Path — corner** | 1 | 90° turn |
| **Path — T or cross** (optional v1) | 1 | For larger layouts |
| **House** | **4 variants** | Small / medium / wide / 2-story — different footprints |
| **Weaponsmith** | 1 | Anvil, optional outdoor forge pad |
| **Farm** | 1 | Small field or pen attached |
| **Church or chapel** | 1 | Stone + steeple or small chapel |
| **Market / stalls** | 1 | Barrels, open stalls |
| **Animal pen** (optional) | 1 | Fence + gate; can wait until hamlet works |

**~12–15 `.mcstructure` files per biome** for a credible full village (not 50).

### Jigsaw block rules (on each piece)

- **Target pool** — which list the next piece comes from (`paths`, `houses`, `work`, etc.)  
- **Name** — label on this connector (others can attach here)  
- **Target name** — which connector on the next piece to snap to  
- **One-way connectors:** leave **Name** blank if nothing should attach *into* this face, only *out*  
- Align connectors at the **same Y** (path surface = building doorstep)  

We maintain pool JSON; you match **connector names** we publish in a layout sheet (Litbolt will send a `plains` connector cheat sheet when you start paths).

### Optional: single-building exports (learning only)

Exporting **one house with no jigsaw** (like early `plains_house_2_tall` tests) is fine for learning Structure Blocks — but **production goal is connected villages**, not lone ruins in a field.

---

## 3. Biomes (priority)

| Priority | Ruleset | Minecraft biomes | Palette |
|----------|---------|------------------|---------|
| **1** | `plains` | plains, meadow, sunflower_plains | Oak, cobble, mossy cobble |
| **2** | `savanna` | savanna | Acacia, cobble |
| **3** | `desert` | desert | Sandstone |
| **4** | `taiga` | taiga, cold/mega taiga | Spruce, cobble |
| **5** | `snowy` | snowy plains/taiga | Spruce, cobble, snow on roofs OK |
| **6** | `jungle` | jungle, bamboo jungle | Jungle wood |
| **7** | `infected` | Maple Bear infected biomes | Spruce + dusty dirt (later) |

**Start with plains** until one hamlet generates correctly in worldgen.

---

## 4. What Maple Bear handles vs Litbolt / Compoohter

### Maple Bear (build & export)

| Task | Details |
|------|---------|
| Creative **abandoned** builds | See §5 art rules |
| **Jigsaw blocks** on paths + buildings | Correct pools / names / targets |
| **Structure Block export** | Snug box, Y=0 floor, void (§6) |
| **Biome block palettes** | Oak vs acacia vs sandstone, etc. |
| **Empty chests / barrels** | Storage props only — **no loot** |
| **Job-site props** (optional) | Anvil, loom, lectern inside footprints |
| **File naming** | `{biome}_{type}_{variant}.mcstructure` |
| **Delivery** | GitHub PR, USB, or shared world (§9) |

### Litbolt / Compoohter (pack & code — no block-by-block villages)

| Task | Details |
|------|----------------|
| **Jigsaw JSON** | `worldgen/structures/`, `structure_sets/`, `template_pools/`, `processors/` |
| **Loot tables & chest fill** | `mb_villageChestLoot.js` + processors (`/loot`, vanilla `chests/village/*`) |
| **Processors** | Mossy cobble randomization, ignore `structure_void` / grass pads |
| **Spawn spacing** | Structure sets (chunks spacing/separation) |
| **Zombie villagers** | After village generates (script or structure entity — TBD) |
| **Disable script village structures** | While jigsaw villages are primary |
| **Testing** | `validate:mcstructures`, dev journal tools |
| **Connector spec sheet** | Names/targets for your jigsaw blocks |

**Loot:** You place **empty** chests; **we** assign random loot like vanilla villages / trail ruins. No loot JSON needed on your side.

**Reference footprints (optional):** Dev pack **Journal → Starter set for export** (Y=200) shows procedural sizes — inspiration only; your jigsaw layouts can differ.

---

## 5. Abandoned village art rules

- **No wooden doors** (gap OK; iron door sparingly)  
- **No lit** torches / lanterns / campfires  
- **Cobwebs**, mossy stone/cobble, broken glass  
- **Partial roofs** and missing walls OK  
- **No Maple Bear mob blocks** in structures  
- **Basements:** avoid deep pits in export box (terrain carving) unless we agree on a design  

---

## 6. Structure Block export checklist

- [Introduction to Structure Blocks](https://learn.microsoft.com/en-us/minecraft/creator/documents/structures/introductiontostructureblocks)  
- [Structure command tutorial](https://learn.microsoft.com/en-us/minecraft/creator/documents/structures/structureblockscommandtutorial)  
- [Introduction to Jigsaw Structures](https://learn.microsoft.com/en-us/minecraft/creator/documents/structures/introductiontojigsawstructures)  
- [Jigsaw tutorial](https://learn.microsoft.com/en-us/minecraft/creator/documents/structures/jigsawtutorial)  
- [Terrain FAQ — structure_void](https://learn.microsoft.com/en-us/minecraft/creator/documents/structures/terrainmatchingtips)  

1. **Tight box** — no filler cubes, no huge air margins  
2. **Structure Block outside** the save volume  
3. **Offset `0, 0, 0`** — floor at structure **Y=0**  
4. **Y=0** = floor blocks or **`structure_void`** — **never `grass_block`** from the ground you built on  
5. **Rooms** = air; **courtyards / preserve terrain** = `structure_void`  
6. **Empty** chests/barrels where loot should go  

After save (Litbolt can run):

```bash
npm run strip:mcstructures
npm run validate:mcstructures
```

Path: `BP - Dev/structures/mb/av_{biome}/`

---

## 7. Videos & Creator Camp

Watch jigsaw + structure block sections on the Learn pages above. **Creator Camp worldgen day** — focus **~8:00–25:00** (campsite, void, jigsaw fields, four JSON folders). Features/trees section (**~40:00+**) is optional.

**Remember:** `separation` must be **less than half of `spacing`** (both in **chunks**).

---

## 8. How to deliver

| Option | Summary |
|--------|---------|
| **GitHub** | Branch `structures/av-plains-maplebear` → PR with files under `BP - Dev/structures/mb/av_{biome}/` only |
| **USB / drive** | Folders per biome + `manifest.txt` (name, W×H×D, connector notes) |
| **Shared world** | Creative world with pieces + Structure Blocks; Litbolt exports |

Bedrock **1.26.10+** recommended; dev pack **M.B.A (Dev)** for joint testing.

---

## 9. Milestone plan (full village track)

| # | Deliverable | Biome |
|---|-------------|--------|
| **M0** | Read docs; export **one** abandoned house (learn Structure Block) | plains |
| **M1** | **Well/center** + **2 path straights** + **1 corner** (jigsaw wired) | plains |
| **M2** | **4 houses** + **smithy** in template pools | plains |
| **M3** | **First hamlet** generates in worldgen (5–6 pieces connect) | plains |
| **M4** | + church, farm, market; village-sized pool | plains |
| **M5** | Repeat M1–M4 | savanna |
| **M6** | desert + taiga | desert, taiga |

Litbolt wires pools after each milestone passes `validate:mcstructures`.

---

## 10. File naming

```
{biome}_{category}_{descriptor}.mcstructure
```

Examples: `plains_well_center.mcstructure`, `plains_path_straight_a.mcstructure`, `plains_house_2_tall.mcstructure`, `plains_smithy.mcstructure`

Categories: `well`, `path`, `house`, `smithy`, `farm`, `church`, `market`, `pen`, `bakery`, …

---

## Future ideas (Litbolt / Compoohter — not Maple Bear’s village work)

Tracked in [`TODO.md`](../../TODO.md) and [`IDEA_BRAINSTORM.md`](./planning/IDEA_BRAINSTORM.md).

### Random lore bunkers (worldgen)

**Idea:** Small **hide bunkers** / survival caches scattered by **structure set** or feature scatter — **separate** from village jigsaws. Possible content:

- `.mcstructure` pit or buried room (trapdoor entrance)  
- **Loot:** sparse survival + lore props (not village-tier loot)  
- **Lore:** written books, signs, maps, journal fragments tying into Maple Bear apocalypse backstory  
- **Frequency:** rare (e.g. spacing 48+ chunks), any overworld biome or subset  

**Note:** Script villages already place **hide bunkers** under paths (`hide_bunker` loot) — that stays on the legacy builder until jigsaw villages replace it. **Worldgen bunkers** would be a **new** system for exploration between villages.

---

## 11. Questions?

**Litbolt** — pack, GitHub, world invite, connector spec  
**Compoohter** — art direction, lore text for bunkers later  
**Maple Bear** — builds, jigsaw layout, exports  

Export issues (float, grass rim): screenshot + coords + filename.

---

*Last updated: 2026-06-05 — Full jigsaw village track; script structure spawning on hold.*
