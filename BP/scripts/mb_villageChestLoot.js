/**
 * Abandoned settlement storage loot — vanilla village tables + script fallbacks.
 * @see https://minecraft.wiki/w/Village/Structure/loot
 *
 * Remap summary (structure → vanilla table id):
 * - Houses: biome house + variant workstation theme (loom→shepherd, smoker→butcher, …).
 * - Farmer / greenhouse: butcher + plains crops; apiary: shepherd + plains.
 * - Market stalls (plaza): butcher; hall interiors: cartographer + butcher mix.
 * - Librarian / school / town-hall office: librarian fallback (books); maps stay cartographer.
 * - Church: temple (altar); cathedral upper: librarian.
 * - Trading post: armorer + toolsmith + butcher barrels (was all cartographer).
 * - Weaponsmith / smithy: spears, saddles, horse armor (vanilla blacksmith + Mounts of Mayhem).
 * - Hunter lodge: fletcher + butcher; mill: toolsmith + plains upstairs.
 * - Infected ruleset: taiga house table; prison: sparse plains.
 */

import { EnchantmentType, ItemStack, system } from "@minecraft/server";

/** @typedef {"plains"|"desert"|"savanna"|"jungle"|"taiga"|"snowy"|"ice"|"infected"|"beach"} SettlementRuleset */

/** Loot table id (no namespace) passed to /loot commands. */
export const VILLAGE_LOOT = {
    house_plains: "chests/village/village_plains_house",
    house_desert: "chests/village/village_desert_house",
    house_savanna: "chests/village/village_savanna_house",
    house_taiga: "chests/village/village_taiga_house",
    house_snowy: "chests/village/village_snowy_house",
    house_jungle: "chests/village/village_plains_house",
    house_toolsmith: "chests/village/village_toolsmith",
    house_weaponsmith: "chests/village/village_weaponsmith",
    house_armorer: "chests/village/village_armorer",
    house_butcher: "chests/village/village_butcher",
    house_cartographer: "chests/village/village_cartographer",
    house_fletcher: "chests/village/village_fletcher",
    house_fisherman: "chests/village/village_fisherman",
    house_shepherd: "chests/village/village_shepherd",
    house_mason: "chests/village/village_mason",
    house_tannery: "chests/village/village_tannery",
    house_temple: "chests/village/village_temple",
    /** No vanilla librarian chest — script fallback only (vanilla plains house adds food). */
    house_librarian: "script/village/house_librarian",
    house_generic: "chests/village/village_plains_house",
    house_supplies: "chests/village/village_plains_house",
    /** Cold-storage cellar — script fallback (honey, preserved food, ice). */
    house_cellar: "chests/village/village_plains_house",
    /** Script-only tables (vanilla /loot skipped; rich fallback + augments). */
    house_pantry_plains: "script/village/house_pantry_plains",
    house_pantry_desert: "script/village/house_pantry_desert",
    house_pantry_savanna: "script/village/house_pantry_savanna",
    house_pantry_taiga: "script/village/house_pantry_taiga",
    house_pantry_snowy: "script/village/house_pantry_snowy",
    house_pantry_jungle: "script/village/house_pantry_jungle",
    house_lived_clutter: "script/village/house_lived_clutter",
    house_lived_treasure: "script/village/house_lived_treasure",
    /** Emergency hide bunkers dug before the settlement finishes — script fallback only. */
    hide_bunker: "script/village/hide_bunker",
    hide_bunker_ruined: "script/village/hide_bunker_ruined"
};

/** @typedef {"primary"|"secondary"|"pantry"|"upstairs"|"office"|"altar"|"records"|"stall_food"|"stall_goods"|"cellar"} LootSlot */

/** @type {Record<string, Partial<Record<LootSlot, string>>>} */
const WORK_LOOT_PROFILES = {
    weaponsmith: { primary: VILLAGE_LOOT.house_weaponsmith },
    toolsmith: { primary: VILLAGE_LOOT.house_toolsmith },
    armorer: { primary: VILLAGE_LOOT.house_armorer },
    farmer: { primary: VILLAGE_LOOT.house_butcher, secondary: VILLAGE_LOOT.house_plains },
    butcher: { primary: VILLAGE_LOOT.house_butcher, pantry: VILLAGE_LOOT.house_butcher },
    librarian: { primary: VILLAGE_LOOT.house_librarian, upstairs: VILLAGE_LOOT.house_librarian },
    cartographer: { primary: VILLAGE_LOOT.house_cartographer, pantry: VILLAGE_LOOT.house_cartographer },
    cleric: { primary: VILLAGE_LOOT.house_temple, pantry: VILLAGE_LOOT.house_temple },
    fisherman: { primary: VILLAGE_LOOT.house_fisherman, pantry: VILLAGE_LOOT.house_fisherman },
    fletcher: { primary: VILLAGE_LOOT.house_fletcher, pantry: VILLAGE_LOOT.house_fletcher },
    leatherworker: { primary: VILLAGE_LOOT.house_tannery, pantry: VILLAGE_LOOT.house_tannery },
    shepherd: { primary: VILLAGE_LOOT.house_shepherd, pantry: VILLAGE_LOOT.house_shepherd },
    mason: { primary: VILLAGE_LOOT.house_mason, pantry: VILLAGE_LOOT.house_mason },
    market: {
        primary: VILLAGE_LOOT.house_cartographer,
        stall_food: VILLAGE_LOOT.house_butcher,
        stall_goods: VILLAGE_LOOT.house_cartographer,
        upstairs: VILLAGE_LOOT.house_cartographer,
        office: VILLAGE_LOOT.house_cartographer
    },
    church: {
        primary: VILLAGE_LOOT.house_temple,
        altar: VILLAGE_LOOT.house_temple,
        records: VILLAGE_LOOT.house_librarian,
        upstairs: VILLAGE_LOOT.house_librarian
    },
    bakery: { primary: VILLAGE_LOOT.house_butcher, pantry: VILLAGE_LOOT.house_butcher },
    brewery: { primary: VILLAGE_LOOT.house_temple, cellar: VILLAGE_LOOT.house_cellar, pantry: VILLAGE_LOOT.house_temple },
    apiary_shed: { primary: VILLAGE_LOOT.house_shepherd, pantry: VILLAGE_LOOT.house_plains },
    hunter_lodge: { primary: VILLAGE_LOOT.house_fletcher, pantry: VILLAGE_LOOT.house_butcher },
    mill_ruin: { primary: VILLAGE_LOOT.house_toolsmith, upstairs: VILLAGE_LOOT.house_plains, pantry: VILLAGE_LOOT.house_toolsmith },
    schoolhouse: { primary: VILLAGE_LOOT.house_librarian },
    town_hall: {
        primary: VILLAGE_LOOT.house_cartographer,
        upstairs: VILLAGE_LOOT.house_librarian,
        office: VILLAGE_LOOT.house_cartographer
    },
    prison_cell: { primary: VILLAGE_LOOT.house_generic },
    greenhouse_ruin: { primary: VILLAGE_LOOT.house_plains, pantry: VILLAGE_LOOT.house_shepherd },
    trading_post: {
        primary: VILLAGE_LOOT.house_armorer,
        stall_food: VILLAGE_LOOT.house_butcher,
        stall_goods: VILLAGE_LOOT.house_toolsmith,
        pantry: VILLAGE_LOOT.house_cartographer
    },
    smithy: { primary: VILLAGE_LOOT.house_weaponsmith },
    farm: { primary: VILLAGE_LOOT.house_butcher, secondary: VILLAGE_LOOT.house_plains },
    hall: { primary: VILLAGE_LOOT.house_butcher, stall_goods: VILLAGE_LOOT.house_cartographer }
};

/**
 * Per-plan storage slot order (each entry = one chest/barrel in interior scan order).
 * @type {Record<string, LootSlot[]>}
 */
const PLAN_STORAGE_SLOT_ORDER = {
    weaponsmith: ["primary", "pantry"],
    smithy_workshop: ["primary", "pantry", "pantry"],
    smithy_large: ["primary", "pantry"],
    toolsmith: ["primary", "pantry"],
    toolsmith_wide: ["primary", "pantry"],
    armorer: ["primary", "pantry"],
    armorer_forge: ["primary", "pantry"],
    market_hall: ["stall_goods", "primary", "upstairs", "upstairs"],
    market_bazaar: ["stall_food", "stall_goods", "primary"],
    market_open: ["stall_goods", "primary"],
    trading_post: ["stall_food", "stall_goods", "stall_goods", "primary"],
    town_hall: ["primary", "upstairs"],
    mill_ruin: ["pantry", "upstairs"],
    brewery: ["cellar", "primary"],
    hunter_lodge: ["pantry", "primary"],
    farmer_barn: ["secondary", "primary"],
    farmer_desert_yard: ["secondary", "primary"],
    cathedral_ruin: ["altar", "records"],
    chapel_stone: ["altar", "records"],
    church_cross: ["altar"],
    church_belltower: ["altar"],
    chapel_small: ["altar"],
    desert_shrine: ["altar"],
    church: ["altar", "records"],
    librarian: ["primary", "primary"],
    librarian_study: ["primary", "primary"]
};

/**
 * Default slot sequence per work kind when plan id has no override.
 * @type {Record<string, LootSlot[]>}
 */
const DEFAULT_STORAGE_SLOTS = {
    weaponsmith: ["primary", "pantry"],
    toolsmith: ["primary", "pantry"],
    armorer: ["primary", "pantry"],
    farmer: ["primary"],
    butcher: ["pantry", "primary"],
    librarian: ["primary", "primary"],
    cartographer: ["pantry", "primary"],
    cleric: ["primary"],
    fisherman: ["pantry", "pantry", "primary"],
    fletcher: ["pantry", "primary"],
    leatherworker: ["pantry", "primary"],
    shepherd: ["pantry", "primary"],
    mason: ["pantry", "primary"],
    market: ["stall_goods", "primary"],
    church: ["altar", "records"],
    bakery: ["pantry", "primary"],
    brewery: ["cellar", "primary"],
    apiary_shed: ["pantry", "primary"],
    hunter_lodge: ["pantry", "primary"],
    mill_ruin: ["pantry", "upstairs"],
    schoolhouse: ["primary"],
    town_hall: ["primary", "upstairs"],
    prison_cell: ["primary"],
    greenhouse_ruin: ["pantry"],
    trading_post: ["stall_food", "stall_goods", "stall_goods", "primary"]
};

/** House variant → dominant storage table (matches interior workstation). */
/** @type {Record<number, string>} */
const HOUSE_VARIANT_STORAGE_TABLE = {
    1: VILLAGE_LOOT.house_shepherd,
    3: VILLAGE_LOOT.house_mason,
    4: VILLAGE_LOOT.house_weaponsmith,
    5: VILLAGE_LOOT.house_butcher,
    6: VILLAGE_LOOT.house_butcher,
    7: VILLAGE_LOOT.house_butcher,
    8: VILLAGE_LOOT.house_shepherd,
    10: VILLAGE_LOOT.house_toolsmith,
    11: VILLAGE_LOOT.house_shepherd,
    12: VILLAGE_LOOT.house_shepherd,
    13: VILLAGE_LOOT.house_weaponsmith,
    14: VILLAGE_LOOT.house_butcher,
    18: VILLAGE_LOOT.house_shepherd,
    19: VILLAGE_LOOT.house_weaponsmith,
    21: VILLAGE_LOOT.house_temple,
    44: VILLAGE_LOOT.house_butcher,
    46: VILLAGE_LOOT.house_shepherd,
    47: VILLAGE_LOOT.house_weaponsmith,
    50: VILLAGE_LOOT.house_butcher,
    52: VILLAGE_LOOT.house_temple,
    54: VILLAGE_LOOT.house_temple,
    57: VILLAGE_LOOT.house_cartographer,
    58: VILLAGE_LOOT.house_cartographer,
    59: VILLAGE_LOOT.house_shepherd,
    60: VILLAGE_LOOT.house_butcher,
    61: VILLAGE_LOOT.house_butcher,
    64: VILLAGE_LOOT.house_fisherman,
    67: VILLAGE_LOOT.house_temple
};

/** Sparse profession tables for generic houses (variant % 100 roll). */
const HOUSE_SPRINKLE_TABLES = [
    VILLAGE_LOOT.house_armorer,
    VILLAGE_LOOT.house_weaponsmith,
    VILLAGE_LOOT.house_fletcher,
    VILLAGE_LOOT.house_fisherman,
    VILLAGE_LOOT.house_mason
];

/** @type {Record<string, string>} */
const WORKSTATION_LOOT = {
    "minecraft:loom": VILLAGE_LOOT.house_shepherd,
    "minecraft:stonecutter": VILLAGE_LOOT.house_mason,
    "minecraft:smithing_table": VILLAGE_LOOT.house_toolsmith,
    "minecraft:cartography_table": VILLAGE_LOOT.house_cartographer,
    "minecraft:brewing_stand": VILLAGE_LOOT.house_temple,
    "minecraft:grindstone": VILLAGE_LOOT.house_weaponsmith,
    "minecraft:smoker": VILLAGE_LOOT.house_butcher,
    "minecraft:blast_furnace": VILLAGE_LOOT.house_armorer,
    "minecraft:composter": VILLAGE_LOOT.house_butcher,
    "minecraft:fletching_table": VILLAGE_LOOT.house_fletcher,
    "minecraft:lectern": VILLAGE_LOOT.house_librarian
};

/** @type {Record<string, string>} */
const WORK_KIND_LOOT = {
    weaponsmith: VILLAGE_LOOT.house_weaponsmith,
    toolsmith: VILLAGE_LOOT.house_toolsmith,
    armorer: VILLAGE_LOOT.house_armorer,
    farmer: VILLAGE_LOOT.house_butcher,
    butcher: VILLAGE_LOOT.house_butcher,
    librarian: VILLAGE_LOOT.house_librarian,
    cartographer: VILLAGE_LOOT.house_cartographer,
    cleric: VILLAGE_LOOT.house_temple,
    fisherman: VILLAGE_LOOT.house_fisherman,
    fletcher: VILLAGE_LOOT.house_fletcher,
    leatherworker: VILLAGE_LOOT.house_tannery,
    shepherd: VILLAGE_LOOT.house_shepherd,
    mason: VILLAGE_LOOT.house_mason,
    market: VILLAGE_LOOT.house_cartographer,
    church: VILLAGE_LOOT.house_temple,
    bakery: VILLAGE_LOOT.house_butcher,
    brewery: VILLAGE_LOOT.house_temple,
    apiary_shed: VILLAGE_LOOT.house_shepherd,
    hunter_lodge: VILLAGE_LOOT.house_fletcher,
    mill_ruin: VILLAGE_LOOT.house_toolsmith,
    schoolhouse: VILLAGE_LOOT.house_librarian,
    town_hall: VILLAGE_LOOT.house_cartographer,
    prison_cell: VILLAGE_LOOT.house_generic,
    greenhouse_ruin: VILLAGE_LOOT.house_plains,
    trading_post: VILLAGE_LOOT.house_armorer,
    smithy: VILLAGE_LOOT.house_weaponsmith,
    farm: VILLAGE_LOOT.house_butcher,
    hall: VILLAGE_LOOT.house_butcher
};

/** @typedef {{ id: string, min: number, max: number, enchant?: { type: string, level: number }[] }} LootEntry */

/** @param {string} table */
function isScriptOnlyLootTable(table) {
    return table.startsWith("script/");
}

/** ~30% of abandoned consumable rolls (cellar / snowy ice pantry keep preserved pools). */
const ABANDONED_FRESH_FOOD_WEIGHT = 3;
const ABANDONED_SPOILED_FOOD_WEIGHT = 7;

/** @type {LootEntry[]} */
const FOOD_FRESH = [
    { id: "minecraft:bread", min: 1, max: 5 },
    { id: "minecraft:apple", min: 1, max: 4 },
    { id: "minecraft:cookie", min: 1, max: 6 },
    { id: "minecraft:potato", min: 1, max: 6 },
    { id: "minecraft:baked_potato", min: 1, max: 4 },
    { id: "minecraft:carrot", min: 1, max: 6 },
    { id: "minecraft:sweet_berries", min: 1, max: 8 },
    { id: "minecraft:pumpkin_pie", min: 1, max: 2 },
    { id: "minecraft:cooked_chicken", min: 1, max: 3 },
    { id: "minecraft:cooked_beef", min: 1, max: 3 },
    { id: "minecraft:honey_bottle", min: 1, max: 1 }
];

/** Rotten / scavenged pantry filler for long-abandoned settlements. */
/** @type {LootEntry[]} */
const SPOILAGE_COMMON = [
    { id: "minecraft:rotten_flesh", min: 2, max: 12 },
    { id: "minecraft:bone", min: 1, max: 10 },
    { id: "minecraft:rotten_flesh", min: 1, max: 8 },
    { id: "minecraft:bone", min: 2, max: 8 },
    { id: "minecraft:spider_eye", min: 1, max: 4 },
    { id: "minecraft:poisonous_potato", min: 1, max: 5 },
    { id: "minecraft:rotten_flesh", min: 3, max: 6 }
];

/** Shared food + household items for lived-in houses. */
/** @type {LootEntry[]} */
const FOOD_COMMON = [
    { id: "minecraft:bread", min: 1, max: 8 },
    { id: "minecraft:apple", min: 1, max: 6 },
    { id: "minecraft:cookie", min: 2, max: 8 },
    { id: "minecraft:potato", min: 2, max: 10 },
    { id: "minecraft:baked_potato", min: 1, max: 6 },
    { id: "minecraft:carrot", min: 2, max: 10 },
    { id: "minecraft:beetroot", min: 2, max: 8 },
    { id: "minecraft:beetroot_soup", min: 1, max: 2 },
    { id: "minecraft:sweet_berries", min: 2, max: 10 },
    { id: "minecraft:pumpkin_pie", min: 1, max: 3 },
    { id: "minecraft:melon_slice", min: 2, max: 8 },
    { id: "minecraft:dried_kelp", min: 2, max: 8 },
    { id: "minecraft:honey_bottle", min: 1, max: 2 },
    { id: "minecraft:cooked_chicken", min: 1, max: 4 },
    { id: "minecraft:cooked_beef", min: 1, max: 4 },
    { id: "minecraft:cooked_porkchop", min: 1, max: 4 },
    { id: "minecraft:cooked_cod", min: 1, max: 4 },
    { id: "minecraft:cooked_salmon", min: 1, max: 3 },
    { id: "minecraft:rabbit_stew", min: 1, max: 2 },
    { id: "minecraft:mushroom_stew", min: 1, max: 2 },
    { id: "minecraft:golden_carrot", min: 1, max: 1 }
];

/** @type {Set<string>} */
const CONSUMABLE_FOOD_IDS = new Set([
    ...FOOD_COMMON.map((e) => e.id),
    ...FOOD_FRESH.map((e) => e.id),
    "minecraft:beef",
    "minecraft:porkchop",
    "minecraft:chicken",
    "minecraft:mutton",
    "minecraft:cod",
    "minecraft:salmon",
    "minecraft:rabbit",
    "minecraft:rotten_flesh"
]);

/**
 * @param {LootEntry[]} entries
 * @param {number} copies
 * @returns {LootEntry[]}
 */
function repeatLootEntries(entries, copies) {
    if (copies <= 0) return [];
    /** @type {LootEntry[]} */
    const out = [];
    for (let i = 0; i < copies; i++) out.push(...entries);
    return out;
}

/**
 * @param {string} id
 */
function isConsumableFoodId(id) {
    return CONSUMABLE_FOOD_IDS.has(id);
}

/**
 * Cellar + snowy pantry (ice blocks) keep preserved food pools.
 * @param {string} lootTableId
 */
function lootUsesPreservedFood(lootTableId) {
    return lootTableId === VILLAGE_LOOT.house_cellar || lootTableId === VILLAGE_LOOT.house_pantry_snowy;
}

/**
 * Strip stale food from a pool and replace with ~70% spoilage / ~30% fresh rolls.
 * @param {LootEntry[]} pool
 * @param {string} lootTableId
 * @param {string|undefined} [lootSlot]
 */
function mixAbandonedConsumablePool(pool, lootTableId, lootSlot) {
    if (lootUsesPreservedFood(lootTableId)) return pool;
    if (isThemedWorkLootTable(lootTableId)) return pool;
    if (lootSlot === "primary" || lootSlot === "work" || lootSlot === "gear") return pool;
    if (lootTableId === VILLAGE_LOOT.house_lived_clutter || lootTableId === VILLAGE_LOOT.house_lived_treasure) {
        return pool;
    }
    const pantryThemed =
        lootSlot === "pantry" ||
        lootTableId.includes("pantry") ||
        lootTableId === VILLAGE_LOOT.house_cellar ||
        lootTableId === VILLAGE_LOOT.house_butcher;
    if (!pantryThemed) return pool;
    const nonFood = pool.filter((e) => !isConsumableFoodId(e.id));
    return [
        ...nonFood,
        ...repeatLootEntries(SPOILAGE_COMMON, ABANDONED_SPOILED_FOOD_WEIGHT),
        ...repeatLootEntries(FOOD_FRESH, ABANDONED_FRESH_FOOD_WEIGHT)
    ];
}

/** @type {LootEntry[]} */
const LIVED_IN_CLUTTER = [
    { id: "minecraft:torch", min: 2, max: 8 },
    { id: "minecraft:candle", min: 1, max: 4 },
    { id: "minecraft:book", min: 1, max: 4 },
    { id: "minecraft:paper", min: 2, max: 12 },
    { id: "minecraft:string", min: 1, max: 6 },
    { id: "minecraft:leather", min: 1, max: 4 },
    { id: "minecraft:feather", min: 1, max: 4 },
    { id: "minecraft:flint", min: 1, max: 4 },
    { id: "minecraft:stick", min: 2, max: 8 },
    { id: "minecraft:bowl", min: 1, max: 4 },
    { id: "minecraft:bucket", min: 1, max: 1 },
    { id: "minecraft:shears", min: 1, max: 1 },
    { id: "minecraft:flower_pot", min: 1, max: 1 },
    { id: "minecraft:painting", min: 1, max: 1 },
    { id: "minecraft:compass", min: 1, max: 1 },
    { id: "minecraft:clock", min: 1, max: 1 },
    { id: "minecraft:lead", min: 1, max: 2 },
    { id: "minecraft:name_tag", min: 1, max: 1 }
];

/** @type {LootEntry[]} */
const LIVED_IN_VALUABLES = [
    { id: "minecraft:emerald", min: 1, max: 4 },
    { id: "minecraft:gold_ingot", min: 1, max: 3 },
    { id: "minecraft:gold_nugget", min: 3, max: 12 },
    { id: "minecraft:iron_ingot", min: 2, max: 6 },
    { id: "minecraft:lapis_lazuli", min: 2, max: 8 },
    { id: "minecraft:amethyst_shard", min: 1, max: 4 },
    { id: "minecraft:experience_bottle", min: 1, max: 3 }
];

/** @type {LootEntry[]} */
const FALLBACK_GENERIC = [
    ...FOOD_COMMON,
    ...LIVED_IN_CLUTTER.slice(0, 10),
    ...LIVED_IN_VALUABLES.slice(0, 4)
];

/** @type {LootEntry[]} */
const FALLBACK_SHEPHERD = [
    { id: "minecraft:white_wool", min: 3, max: 12 },
    { id: "minecraft:black_wool", min: 1, max: 6 },
    { id: "minecraft:shears", min: 1, max: 1 },
    { id: "minecraft:wheat", min: 2, max: 8 },
    { id: "minecraft:wheat_seeds", min: 2, max: 8 },
    { id: "minecraft:lead", min: 1, max: 2 },
    { id: "minecraft:emerald", min: 1, max: 3 },
    { id: "minecraft:bread", min: 1, max: 4 }
];

/** @type {LootEntry[]} */
const FALLBACK_LIBRARIAN = [
    { id: "minecraft:book", min: 3, max: 14 },
    { id: "minecraft:paper", min: 6, max: 20 },
    { id: "minecraft:ink_sac", min: 2, max: 6 },
    { id: "minecraft:feather", min: 2, max: 6 },
    { id: "minecraft:writable_book", min: 1, max: 2 },
    { id: "minecraft:bookshelf", min: 1, max: 1 },
    { id: "minecraft:lantern", min: 1, max: 2 },
    { id: "minecraft:emerald", min: 1, max: 4 },
    { id: "minecraft:experience_bottle", min: 1, max: 2 }
];

/** @type {LootEntry[]} */
const FALLBACK_TEMPLE = [
    { id: "minecraft:redstone", min: 2, max: 8 },
    { id: "minecraft:lapis_lazuli", min: 3, max: 12 },
    { id: "minecraft:glowstone_dust", min: 2, max: 8 },
    { id: "minecraft:glass_bottle", min: 2, max: 6 },
    { id: "minecraft:candle", min: 2, max: 6 },
    { id: "minecraft:gold_nugget", min: 2, max: 8 },
    { id: "minecraft:rotten_flesh", min: 1, max: 4 },
    { id: "minecraft:bone", min: 2, max: 6 },
    { id: "minecraft:book", min: 1, max: 3 }
];

/** Mixed into snowy-ruleset chests/barrels (vanilla loot + script fallback). */
/** @type {{ id: string, min: number, max: number }[]} */
const FALLBACK_SNOWY_SUPPLIES = [
    { id: "minecraft:snowball", min: 4, max: 16 },
    { id: "minecraft:snow_block", min: 1, max: 4 },
    { id: "minecraft:ice", min: 2, max: 8 },
    { id: "minecraft:powder_snow_bucket", min: 1, max: 1 },
    { id: "minecraft:leather_boots", min: 1, max: 1 }
];

/** @type {LootEntry[]} */
const FALLBACK_PANTRY_PLAINS = [
    ...repeatLootEntries(SPOILAGE_COMMON, ABANDONED_SPOILED_FOOD_WEIGHT),
    ...repeatLootEntries(FOOD_FRESH, ABANDONED_FRESH_FOOD_WEIGHT),
    ...LIVED_IN_CLUTTER.slice(0, 6)
];

/** @type {LootEntry[]} */
const FALLBACK_PANTRY_DESERT = [
    ...repeatLootEntries(SPOILAGE_COMMON, ABANDONED_SPOILED_FOOD_WEIGHT),
    ...repeatLootEntries(FOOD_FRESH, ABANDONED_FRESH_FOOD_WEIGHT),
    { id: "minecraft:cactus", min: 1, max: 4 },
    { id: "minecraft:dried_kelp", min: 2, max: 8 }
];

/** @type {LootEntry[]} */
const FALLBACK_PANTRY_SAVANNA = [
    ...repeatLootEntries(SPOILAGE_COMMON, ABANDONED_SPOILED_FOOD_WEIGHT),
    ...repeatLootEntries(FOOD_FRESH, ABANDONED_FRESH_FOOD_WEIGHT),
    { id: "minecraft:cocoa_beans", min: 2, max: 8 },
    { id: "minecraft:melon_slice", min: 3, max: 10 }
];

/** @type {LootEntry[]} */
const FALLBACK_PANTRY_TAIGA = [
    ...repeatLootEntries(SPOILAGE_COMMON, ABANDONED_SPOILED_FOOD_WEIGHT),
    ...repeatLootEntries(FOOD_FRESH, ABANDONED_FRESH_FOOD_WEIGHT),
    { id: "minecraft:spruce_log", min: 2, max: 6 }
];

/** @type {LootEntry[]} */
const FALLBACK_PANTRY_SNOWY = [
    { id: "minecraft:potato", min: 2, max: 10 },
    { id: "minecraft:beetroot", min: 2, max: 10 },
    { id: "minecraft:bread", min: 1, max: 6 },
    { id: "minecraft:cooked_beef", min: 1, max: 4 },
    { id: "minecraft:cookie", min: 2, max: 8 },
    { id: "minecraft:honey_bottle", min: 1, max: 3 },
    ...FALLBACK_SNOWY_SUPPLIES
];

/** @type {LootEntry[]} */
const FALLBACK_PANTRY_JUNGLE = [
    ...repeatLootEntries(SPOILAGE_COMMON, ABANDONED_SPOILED_FOOD_WEIGHT),
    ...repeatLootEntries(FOOD_FRESH, ABANDONED_FRESH_FOOD_WEIGHT),
    { id: "minecraft:cocoa_beans", min: 3, max: 10 },
    { id: "minecraft:bamboo", min: 4, max: 12 }
];

/** @type {LootEntry[]} */
const FALLBACK_LIVED_TREASURE = [
    ...LIVED_IN_VALUABLES,
    { id: "minecraft:diamond", min: 1, max: 2 },
    { id: "minecraft:golden_apple", min: 1, max: 1 },
    { id: "minecraft:enchanted_golden_apple", min: 1, max: 1 }
];

/** @type {LootEntry[]} */
const FALLBACK_CELLAR = [
    { id: "minecraft:honey_bottle", min: 1, max: 4 },
    { id: "minecraft:beef", min: 1, max: 4 },
    { id: "minecraft:porkchop", min: 1, max: 4 },
    { id: "minecraft:cod", min: 1, max: 3 },
    { id: "minecraft:salmon", min: 1, max: 3 },
    { id: "minecraft:potato", min: 2, max: 8 },
    { id: "minecraft:carrot", min: 2, max: 8 },
    { id: "minecraft:beetroot", min: 2, max: 6 },
    { id: "minecraft:sweet_berries", min: 2, max: 8 },
    { id: "minecraft:pumpkin_pie", min: 1, max: 2 },
    { id: "minecraft:ice", min: 2, max: 8 },
    { id: "minecraft:glass_bottle", min: 1, max: 4 },
    { id: "minecraft:bread", min: 1, max: 4 },
    { id: "minecraft:apple", min: 1, max: 3 }
];

/** Scant supplies villagers stashed before hiding — always script-filled. */
/** @type {LootEntry[]} */
const FALLBACK_HIDE_BUNKER = [
    { id: "minecraft:stone_sword", min: 1, max: 1 },
    { id: "minecraft:rotten_flesh", min: 2, max: 6 },
    { id: "minecraft:bread", min: 1, max: 2 },
    { id: "minecraft:potato", min: 1, max: 3 },
    { id: "minecraft:leather_helmet", min: 1, max: 1 },
    { id: "minecraft:leather_chestplate", min: 1, max: 1 },
    { id: "minecraft:leather_boots", min: 1, max: 1 },
    { id: "minecraft:torch", min: 1, max: 3 },
    { id: "minecraft:lantern", min: 1, max: 1 },
    { id: "minecraft:stick", min: 1, max: 4 }
];

/** Collapsed / looted hide hole — sparse scraps only. */
/** @type {LootEntry[]} */
const FALLBACK_HIDE_BUNKER_RUINED = [
    { id: "minecraft:rotten_flesh", min: 1, max: 4 },
    { id: "minecraft:stick", min: 1, max: 3 },
    { id: "minecraft:torch", min: 0, max: 1 },
    { id: "minecraft:lantern", min: 0, max: 1 },
    { id: "minecraft:bone", min: 0, max: 2 }
];

const SMITH_LOOT_TABLES = new Set([
    VILLAGE_LOOT.house_weaponsmith,
    VILLAGE_LOOT.house_toolsmith,
    VILLAGE_LOOT.house_armorer
]);

const SMITH_IRON_TOOL_IDS = [
    "minecraft:iron_pickaxe",
    "minecraft:iron_axe",
    "minecraft:iron_shovel",
    "minecraft:iron_sword",
    "minecraft:iron_hoe"
];

const SMITH_DIAMOND_TOOL_IDS = [
    "minecraft:diamond_pickaxe",
    "minecraft:diamond_axe",
    "minecraft:diamond_shovel",
    "minecraft:diamond_sword",
    "minecraft:diamond_hoe"
];

/** Common spear tiers for weaponsmith chests (1.21.130+) — one per chest via lootSlotCategory. */

const HORSE_ARMOR_LOOT_IDS = [
    "minecraft:leather_horse_armor",
    "minecraft:iron_horse_armor",
    "minecraft:golden_horse_armor",
    "minecraft:diamond_horse_armor"
];

/** Chests already received augment pass — avoids duplicate bonus items on fill retries. */
const STORAGE_AUGMENTED = new Set();

/**
 * @param {string} id
 */
function isSpearItemId(id) {
    return id.endsWith("_spear");
}

/**
 * @param {string} id
 */
function isHorseArmorItemId(id) {
    return id.endsWith("_horse_armor");
}

/**
 * Loot buckets — at most one pick per chest per category.
 * @param {string} id
 */
function lootSlotCategory(id) {
    if (isSpearItemId(id)) return "spear";
    if (id === "minecraft:saddle") return "saddle";
    if (isHorseArmorItemId(id)) return "horse_armor";
    if (id.includes("_sword")) return "melee_sword";
    if (id.includes("_axe")) return "melee_axe";
    if (id.includes("_helmet")) return "armor_helmet";
    if (id.includes("_chestplate")) return "armor_chest";
    if (id.includes("_leggings")) return "armor_legs";
    if (id.includes("_boots")) return "armor_boots";
    return id;
}

/**
 * @param {import("@minecraft/server").Container} container
 * @param {(id: string) => boolean} predicate
 */
function containerHasItemMatching(container, predicate) {
    for (let i = 0; i < container.size; i++) {
        const stack = container.getItem(i);
        if (stack && predicate(stack.typeId)) return true;
    }
    return false;
}

/**
 * Weighted spear tier for weaponsmith chests (one per chest max).
 * @param {number} [seedish]
 */
function pickWeaponsmithSpearId(seedish) {
    const r = typeof seedish === "number" ? seededChance(seedish, 1000) : Math.random();
    if (r < 0.52) return "minecraft:copper_spear";
    if (r < 0.82) return "minecraft:stone_spear";
    if (r < 0.96) return "minecraft:iron_spear";
    if (r < 0.992) return "minecraft:golden_spear";
    return "minecraft:diamond_spear";
}

/** @type {{ id: string, min: number, max: number }[]} */
const FALLBACK_INFECTED = [
    { id: "minecraft:beetroot_soup", min: 1, max: 2 },
    { id: "minecraft:bread", min: 1, max: 3 },
    { id: "minecraft:coal", min: 2, max: 6 },
    { id: "minecraft:torch", min: 2, max: 6 },
    { id: "mb:snow", min: 2, max: 12 }
];

/** @type {Record<string, LootEntry[]>} */
const FALLBACK_BY_TABLE = {
    [VILLAGE_LOOT.house_plains]: FALLBACK_GENERIC,
    [VILLAGE_LOOT.house_desert]: [
        ...FALLBACK_PANTRY_DESERT,
        { id: "minecraft:wheat", min: 2, max: 8 },
        { id: "minecraft:emerald", min: 1, max: 3 },
        { id: "minecraft:dead_bush", min: 1, max: 2 }
    ],
    [VILLAGE_LOOT.house_savanna]: [
        ...FALLBACK_PANTRY_SAVANNA,
        { id: "minecraft:acacia_log", min: 2, max: 6 },
        { id: "minecraft:emerald", min: 1, max: 3 }
    ],
    [VILLAGE_LOOT.house_taiga]: [
        ...FALLBACK_PANTRY_TAIGA,
        { id: "minecraft:emerald", min: 1, max: 3 },
        { id: "minecraft:coal", min: 2, max: 8 }
    ],
    [VILLAGE_LOOT.house_snowy]: [...FALLBACK_PANTRY_SNOWY, { id: "minecraft:coal", min: 2, max: 10 }],
    [VILLAGE_LOOT.house_jungle]: [
        ...FALLBACK_PANTRY_JUNGLE,
        { id: "minecraft:emerald", min: 1, max: 3 },
        { id: "minecraft:jungle_log", min: 2, max: 6 }
    ],
    [VILLAGE_LOOT.house_pantry_plains]: FALLBACK_PANTRY_PLAINS,
    [VILLAGE_LOOT.house_pantry_desert]: FALLBACK_PANTRY_DESERT,
    [VILLAGE_LOOT.house_pantry_savanna]: FALLBACK_PANTRY_SAVANNA,
    [VILLAGE_LOOT.house_pantry_taiga]: FALLBACK_PANTRY_TAIGA,
    [VILLAGE_LOOT.house_pantry_snowy]: FALLBACK_PANTRY_SNOWY,
    [VILLAGE_LOOT.house_pantry_jungle]: FALLBACK_PANTRY_JUNGLE,
    [VILLAGE_LOOT.house_lived_clutter]: [
        ...LIVED_IN_CLUTTER,
        ...repeatLootEntries(SPOILAGE_COMMON, ABANDONED_SPOILED_FOOD_WEIGHT),
        ...repeatLootEntries(FOOD_FRESH, ABANDONED_FRESH_FOOD_WEIGHT)
    ],
    [VILLAGE_LOOT.house_lived_treasure]: FALLBACK_LIVED_TREASURE,
    [VILLAGE_LOOT.house_shepherd]: FALLBACK_SHEPHERD,
    [VILLAGE_LOOT.house_butcher]: [
        ...repeatLootEntries(SPOILAGE_COMMON, ABANDONED_SPOILED_FOOD_WEIGHT),
        ...repeatLootEntries(FOOD_FRESH, ABANDONED_FRESH_FOOD_WEIGHT),
        { id: "minecraft:coal", min: 3, max: 12 },
        { id: "minecraft:wheat", min: 2, max: 8 }
    ],
    [VILLAGE_LOOT.house_cellar]: FALLBACK_CELLAR,
    [VILLAGE_LOOT.hide_bunker]: FALLBACK_HIDE_BUNKER,
    [VILLAGE_LOOT.hide_bunker_ruined]: FALLBACK_HIDE_BUNKER_RUINED,
    [VILLAGE_LOOT.house_toolsmith]: [
        { id: "minecraft:iron_ingot", min: 3, max: 10 },
        { id: "minecraft:coal", min: 4, max: 16 },
        { id: "minecraft:copper_ingot", min: 2, max: 8 },
        { id: "minecraft:iron_pickaxe", min: 1, max: 1 },
        { id: "minecraft:iron_axe", min: 1, max: 1 },
        { id: "minecraft:iron_shovel", min: 1, max: 1 },
        { id: "minecraft:flint_and_steel", min: 1, max: 1 },
        { id: "minecraft:emerald", min: 1, max: 3 }
    ],
    [VILLAGE_LOOT.house_weaponsmith]: [
        { id: "minecraft:iron_ingot", min: 3, max: 12 },
        { id: "minecraft:iron_sword", min: 1, max: 1 },
        { id: "minecraft:iron_axe", min: 1, max: 1 },
        { id: "minecraft:coal", min: 4, max: 16 },
        { id: "minecraft:flint_and_steel", min: 1, max: 1 },
        { id: "minecraft:arrow", min: 4, max: 16 },
        { id: "minecraft:emerald", min: 1, max: 3 },
        { id: "minecraft:obsidian", min: 1, max: 3 },
        { id: "minecraft:diamond", min: 1, max: 1 },
        { id: "minecraft:bread", min: 1, max: 4 },
        { id: "minecraft:apple", min: 1, max: 3 },
        { id: "minecraft:chainmail_helmet", min: 1, max: 1 },
        { id: "minecraft:chainmail_chestplate", min: 1, max: 1 },
        { id: "minecraft:iron_helmet", min: 1, max: 1 },
        { id: "minecraft:iron_chestplate", min: 1, max: 1 },
        { id: "minecraft:bucket", min: 1, max: 1 }
    ],
    [VILLAGE_LOOT.house_armorer]: [
        { id: "minecraft:iron_ingot", min: 4, max: 12 },
        { id: "minecraft:iron_helmet", min: 1, max: 1 },
        { id: "minecraft:iron_chestplate", min: 1, max: 1 },
        { id: "minecraft:iron_leggings", min: 1, max: 1 },
        { id: "minecraft:iron_boots", min: 1, max: 1 },
        { id: "minecraft:coal", min: 4, max: 16 },
        { id: "minecraft:emerald", min: 1, max: 3 }
    ],
    [VILLAGE_LOOT.house_fletcher]: [
        { id: "minecraft:arrow", min: 8, max: 32 },
        { id: "minecraft:flint", min: 3, max: 10 },
        { id: "minecraft:stick", min: 4, max: 16 },
        { id: "minecraft:string", min: 2, max: 8 },
        { id: "minecraft:feather", min: 2, max: 8 },
        { id: "minecraft:bow", min: 1, max: 1 },
        { id: "minecraft:crossbow", min: 1, max: 1 },
        { id: "minecraft:emerald", min: 1, max: 3 }
    ],
    [VILLAGE_LOOT.house_fisherman]: [
        ...repeatLootEntries(SPOILAGE_COMMON, ABANDONED_SPOILED_FOOD_WEIGHT),
        { id: "minecraft:rotten_flesh", min: 2, max: 8 },
        { id: "minecraft:bone", min: 2, max: 6 },
        { id: "minecraft:cod", min: 1, max: 3 },
        { id: "minecraft:salmon", min: 1, max: 2 },
        { id: "minecraft:fishing_rod", min: 1, max: 1 },
        { id: "minecraft:bucket", min: 1, max: 1 },
        { id: "minecraft:emerald", min: 1, max: 3 }
    ],
    [VILLAGE_LOOT.house_mason]: [
        { id: "minecraft:clay_ball", min: 6, max: 20 },
        { id: "minecraft:stone", min: 6, max: 24 },
        { id: "minecraft:brick", min: 4, max: 16 },
        { id: "minecraft:andesite", min: 4, max: 16 },
        { id: "minecraft:emerald", min: 1, max: 4 },
        { id: "minecraft:iron_pickaxe", min: 1, max: 1 }
    ],
    [VILLAGE_LOOT.house_tannery]: [
        { id: "minecraft:leather", min: 3, max: 12 },
        { id: "minecraft:rabbit_hide", min: 2, max: 8 },
        { id: "minecraft:leather_helmet", min: 1, max: 1 },
        { id: "minecraft:leather_chestplate", min: 1, max: 1 },
        { id: "minecraft:emerald", min: 1, max: 3 },
        { id: "minecraft:string", min: 2, max: 6 }
    ],
    [VILLAGE_LOOT.house_cartographer]: [
        { id: "minecraft:paper", min: 4, max: 16 },
        { id: "minecraft:map", min: 1, max: 2 },
        { id: "minecraft:compass", min: 1, max: 2 },
        { id: "minecraft:book", min: 1, max: 4 },
        { id: "minecraft:bread", min: 1, max: 6 },
        { id: "minecraft:emerald", min: 1, max: 4 },
        { id: "minecraft:glass_pane", min: 2, max: 8 }
    ],
    [VILLAGE_LOOT.house_temple]: FALLBACK_TEMPLE,
    [VILLAGE_LOOT.house_librarian]: FALLBACK_LIBRARIAN,
    [VILLAGE_LOOT.house_generic]: [
        ...FOOD_COMMON.slice(0, 10),
        { id: "minecraft:rotten_flesh", min: 1, max: 4 },
        { id: "minecraft:chain", min: 1, max: 3 },
        { id: "minecraft:bone", min: 1, max: 4 },
        { id: "minecraft:emerald", min: 1, max: 2 }
    ]
};

/**
 * @param {string} id
 */
function isStorageBlockId(id) {
    return id === "minecraft:chest" || id === "minecraft:barrel";
}

/**
 * @param {LootSlot} slot
 * @param {string} workKind
 * @param {SettlementRuleset} ruleset
 * @returns {string}
 */
function lootTableForSlot(slot, workKind, ruleset) {
    if (slot === "cellar") return VILLAGE_LOOT.house_cellar;
    const profile = WORK_LOOT_PROFILES[workKind] ?? WORK_LOOT_PROFILES.farmer;
    const table = profile[slot] ?? profile.primary ?? WORK_KIND_LOOT[workKind];
    if (table) return table;
    if (ruleset === "infected") return VILLAGE_LOOT.house_taiga;
    return houseLootKeyForRuleset(ruleset);
}

/**
 * @param {string} workKind
 * @param {string} planId
 * @param {LootSlot} slot
 * @param {SettlementRuleset} ruleset
 */
export function lootTableForStructureSlot(workKind, planId, slot, ruleset = "plains") {
    const planKey = planId.includes("_") ? planId.split("_").slice(-2).join("_") : planId;
    const planSlots = PLAN_STORAGE_SLOT_ORDER[planId] ?? PLAN_STORAGE_SLOT_ORDER[planKey];
    if (planSlots) {
        const idx = planSlots.indexOf(slot);
        if (idx >= 0) {
            const resolved = lootTableForSlot(planSlots[idx], workKind, ruleset);
            if (resolved) return resolved;
        }
    }
    return lootTableForSlot(slot, workKind, ruleset);
}

/**
 * Stamp chest/barrel loot on a procedural plan from work-kind profiles.
 * @template {{ id: string, interior: { id: string, loot?: string, lootSlot?: LootSlot }[] }} T
 * @param {T} plan
 * @param {string} workKind
 * @param {SettlementRuleset} [ruleset]
 * @returns {T}
 */
export function applyStructureLootToPlan(plan, workKind, ruleset = "plains") {
    const planBaseId = plan.id.includes("_") ? plan.id.slice(plan.id.lastIndexOf("_") + 1) : plan.id;
    const slotOrder =
        PLAN_STORAGE_SLOT_ORDER[plan.id] ??
        PLAN_STORAGE_SLOT_ORDER[planBaseId] ??
        DEFAULT_STORAGE_SLOTS[workKind] ??
        DEFAULT_STORAGE_SLOTS.farmer;
    let storageIdx = 0;
    const interior = plan.interior.map((spec) => {
        if (!isStorageBlockId(spec.id)) return spec;
        const slot =
            spec.lootSlot ??
            slotOrder[Math.min(storageIdx, slotOrder.length - 1)] ??
            "primary";
        storageIdx++;
        const loot = lootTableForStructureSlot(workKind, plan.id, slot, ruleset);
        return { ...spec, loot };
    });
    return { ...plan, interior };
}

/**
 * @param {SettlementRuleset} ruleset
 * @returns {string}
 */
export function houseLootKeyForRuleset(ruleset) {
    switch (ruleset) {
        case "desert":
            return VILLAGE_LOOT.house_desert;
        case "savanna":
            return VILLAGE_LOOT.house_savanna;
        case "jungle":
            return VILLAGE_LOOT.house_jungle;
        case "taiga":
            return VILLAGE_LOOT.house_taiga;
        case "snowy":
        case "ice":
            return VILLAGE_LOOT.house_snowy;
        case "infected":
            return VILLAGE_LOOT.house_taiga;
        case "plains":
        default:
            return VILLAGE_LOOT.house_plains;
    }
}

/**
 * Pantry / barrel loot — food-heavy lived-in tables (script fallback).
 * @param {SettlementRuleset} ruleset
 */
export function housePantryLootKeyForRuleset(ruleset) {
    switch (ruleset) {
        case "desert":
            return VILLAGE_LOOT.house_pantry_desert;
        case "savanna":
            return VILLAGE_LOOT.house_pantry_savanna;
        case "jungle":
            return VILLAGE_LOOT.house_pantry_jungle;
        case "taiga":
        case "infected":
            return VILLAGE_LOOT.house_pantry_taiga;
        case "snowy":
        case "ice":
            return VILLAGE_LOOT.house_pantry_snowy;
        case "plains":
        default:
            return VILLAGE_LOOT.house_pantry_plains;
    }
}

/**
 * @param {string} workKind
 * @returns {string|undefined}
 */
export function lootTableForWorkKind(workKind) {
    return WORK_KIND_LOOT[workKind];
}

/**
 * Meeting plaza market stall barrels.
 * @param {SettlementRuleset} [ruleset]
 */
export function lootForMarketStallBarrel(ruleset = "plains") {
    void ruleset;
    return WORK_LOOT_PROFILES.market.stall_food ?? VILLAGE_LOOT.house_butcher;
}

/**
 * @param {number} houseVariant
 * @param {string} biomeHouseLoot
 * @param {SettlementRuleset} [ruleset]
 * @returns {string}
 */
export function houseStorageLootForVariant(houseVariant, biomeHouseLoot, ruleset = "plains") {
    const v = ((houseVariant % 70) + 70) % 70;
    const themed = HOUSE_VARIANT_STORAGE_TABLE[v];
    if (themed) return themed;

    if (ruleset === "infected") {
        const roll = (v * 17 + 3) % 100;
        if (roll < 35) return VILLAGE_LOOT.house_taiga;
        if (roll < 55) return VILLAGE_LOOT.house_butcher;
        return biomeHouseLoot;
    }

    const sprinkleRoll = (v * 31 + 7) % 100;
    if (sprinkleRoll < 22) {
        return HOUSE_SPRINKLE_TABLES[sprinkleRoll % HOUSE_SPRINKLE_TABLES.length];
    }
    if (sprinkleRoll < 28) {
        return VILLAGE_LOOT.house_lived_clutter;
    }
    if (sprinkleRoll < 31) {
        return VILLAGE_LOOT.house_lived_treasure;
    }

    return biomeHouseLoot;
}

/**
 * Deterministic cellar furnishing roll from plan footprint + id.
 * @param {{ w: number, d: number, id?: string }} plan
 */
function cellarFurnishRoll(plan) {
    const id = plan.id ?? "cellar";
    let h = plan.w * 997 + plan.d * 991;
    for (let i = 0; i < id.length; i++) {
        h = Math.imul(31, h) + id.charCodeAt(i);
    }
    return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Add optional cellar storage — bare, sparse barrels, or furnished mix (empty + loot barrels).
 * @template {{ w: number, d: number, interior: { id: string, lx: number, lz: number, loot?: string, lootSlot?: LootSlot, zone?: string }[], basementDepth?: number, basementHatch?: { lx: number, lz: number }, id?: string }} T
 * @param {T} plan
 * @returns {T}
 */
export function appendBasementCellarStorage(plan) {
    const depth = plan.basementDepth;
    if (!depth) return plan;
    const w = plan.w;
    const d = plan.d;
    const hx = plan.basementHatch?.lx ?? Math.floor(w / 2);
    const hz = plan.basementHatch?.lz ?? Math.floor(d / 2);
    const cellarLoot = VILLAGE_LOOT.house_cellar;
    const roll = cellarFurnishRoll(plan);
    const tier = roll % 100;

    /** Interior slots away from ladder hatch. */
    /** @type {{ lx: number, lz: number }[]} */
    const slots = [];
    for (let lz = 1; lz <= d - 2; lz++) {
        for (let lx = 1; lx <= w - 2; lx++) {
            if (lx === hx && lz === hz) continue;
            if (Math.abs(lx - hx) + Math.abs(lz - hz) < 2) continue;
            slots.push({ lx, lz });
        }
    }
    if (slots.length === 0) return plan;

    /** @type {typeof plan.interior} */
    const extras = [];
    const used = new Set();

    const takeSlot = (offset) => {
        for (let i = 0; i < slots.length; i++) {
            const slot = slots[(roll + offset + i * 5) % slots.length];
            const key = `${slot.lx},${slot.lz}`;
            if (used.has(key)) continue;
            used.add(key);
            return slot;
        }
        return undefined;
    };

    if (tier < 22) {
        return plan;
    }

    const barrelCount = tier < 50 ? 1 + ((roll >> 3) % 2) : 2 + ((roll >> 5) % 2);
    for (let i = 0; i < barrelCount; i++) {
        const slot = takeSlot(i * 11);
        if (!slot) break;
        const filled = (roll + i * 17) % 3 !== 0;
        /** @type {typeof plan.interior[0]} */
        const spec = {
            lx: slot.lx,
            lz: slot.lz,
            id: "minecraft:barrel",
            zone: "basement"
        };
        if (filled) {
            spec.loot = cellarLoot;
            spec.lootSlot = "cellar";
        }
        extras.push(spec);
    }

    if (tier >= 55 && w >= 6 && d >= 6) {
        const chestSlot = takeSlot(37);
        if (chestSlot) {
            extras.push({
                lx: chestSlot.lx,
                lz: chestSlot.lz,
                id: "minecraft:chest",
                loot: cellarLoot,
                lootSlot: "cellar",
                zone: "basement"
            });
        }
    }

    if (tier >= 72) {
        const decorSlot = takeSlot(53);
        if (decorSlot) {
            extras.push({
                lx: decorSlot.lx,
                lz: decorSlot.lz,
                id: (roll >> 7) % 2 === 0 ? "minecraft:lantern" : "minecraft:soul_lantern",
                zone: "basement"
            });
        }
        if (depth >= 4 && w >= 7) {
            const shelfSlot = takeSlot(61);
            if (shelfSlot) {
                extras.push({
                    lx: shelfSlot.lx,
                    lz: shelfSlot.lz,
                    id: "minecraft:bookshelf",
                    zone: "basement"
                });
            }
        }
    }

    if (extras.length === 0) return plan;
    return { ...plan, interior: [...plan.interior, ...extras] };
}

/**
 * One-block pit pantry: trapdoor in the floor with a food chest directly below.
 * Skips houses that already have a full cellar (`basementDepth`).
 * @template {{ w: number, d: number, interior: { id: string, lx: number, lz: number, loot?: string, lootSlot?: LootSlot, zone?: string }[], basementDepth?: number, basementHatch?: { lx: number, lz: number }, floorPantry?: { lx: number, lz: number }, id?: string }} T
 * @param {T} plan
 * @param {SettlementRuleset} ruleset
 * @returns {T}
 */
export function appendFloorPantryToPlan(plan, ruleset = "plains") {
    void ruleset;
    if (plan.basementDepth || plan.floorPantry) return plan;
    if (plan.w < 5 || plan.d < 5) return plan;

    const roll = cellarFurnishRoll(plan);
    const chance = plan.w >= 6 && plan.d >= 6 ? 78 : 62;
    if (roll % 100 >= chance) return plan;

    /** @type {Set<string>} */
    const blocked = new Set();
    for (const spec of plan.interior) {
        blocked.add(`${spec.lx},${spec.lz}`);
    }
    if (plan.basementHatch) {
        blocked.add(`${plan.basementHatch.lx},${plan.basementHatch.lz}`);
    }

    /** @type {{ lx: number, lz: number }[]} */
    const candidates = [];
    for (let lz = 1; lz <= plan.d - 2; lz++) {
        for (let lx = 1; lx <= plan.w - 2; lx++) {
            if (blocked.has(`${lx},${lz}`)) continue;
            candidates.push({ lx, lz });
        }
    }
    if (candidates.length === 0) return plan;

    const pick = candidates[(roll >> 5) % candidates.length];
    const interior = stripInteriorPantryStorage(plan.interior);

    return { ...plan, interior, floorPantry: pick };
}

/**
 * Room chests/barrels are gear/supplies — food belongs in floor pantries or full cellars.
 * @param {typeof plan.interior} interior
 */
function stripInteriorPantryStorage(interior) {
    return interior.filter((spec) => {
        if (!isStorageBlockId(spec.id)) return true;
        if (spec.lootSlot === "pantry") return false;
        if (spec.id === "minecraft:barrel" && !spec.loot && !spec.lootSlot) return false;
        return true;
    });
}

/**
 * @template {{ interior: { id: string, lx: number, lz: number, loot?: string, lootSlot?: LootSlot }[] }} T
 * @param {T} plan
 * @returns {T}
 */
export function stripHousePantryStorageFromPlan(plan) {
    return { ...plan, interior: stripInteriorPantryStorage(plan.interior) };
}

/**
 * @param {{ id: string, loot?: string, lootSlot?: LootSlot }} spec
 * @param {{ structureKind?: string, houseLootTable?: string, workLootTable?: string, ruleset?: SettlementRuleset, planId?: string }} [ctx]
 */
export function resolveInteriorLootTable(spec, ctx = {}) {
    if (spec.loot) return spec.loot;
    const isStorage = isStorageBlockId(spec.id);
    const ruleset = ctx.ruleset ?? "plains";
    const workKind = ctx.structureKind ?? "house";

    if (isStorage && (spec.lootSlot === "cellar" || spec.zone === "basement")) {
        return VILLAGE_LOOT.house_cellar;
    }

    if (isStorage && spec.lootSlot === "pantry") {
        if (workKind === "house" || ctx.structureKind === "house") {
            return housePantryLootKeyForRuleset(ruleset);
        }
        return lootTableForStructureSlot(workKind, ctx.planId ?? workKind, "primary", ruleset);
    }

    if (isStorage && spec.lootSlot) {
        return lootTableForStructureSlot(workKind, ctx.planId ?? workKind, spec.lootSlot, ruleset);
    }

    if (isStorage && ctx.workLootTable) return ctx.workLootTable;
    if (isStorage && ctx.houseLootTable) return ctx.houseLootTable;

    const ws = WORKSTATION_LOOT[spec.id];
    if (ws && isStorage) return ws;

    if (workKind !== "house" && isStorage) {
        const kindTable = lootTableForWorkKind(workKind);
        if (kindTable) return kindTable;
    }

    return VILLAGE_LOOT.house_generic;
}

/**
 * @param {import("@minecraft/server").Block} block
 */
function getContainerInventory(block) {
    try {
        const inv = block.getComponent("inventory");
        if (inv?.container) return inv.container;
    } catch {
        /* ignore */
    }
    try {
        const inv = block.getComponent("minecraft:inventory");
        if (inv?.container) return inv.container;
    } catch {
        /* ignore */
    }
    return undefined;
}

/**
 * Evenly spaced container slots so loot does not clump in one row.
 * @param {number} size
 * @param {number} count
 */
function pickSpreadSlots(size, count) {
    if (count <= 0) return [];
    if (count >= size) {
        const all = Array.from({ length: size }, (_, i) => i);
        for (let i = all.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = all[i];
            all[i] = all[j];
            all[j] = t;
        }
        return all;
    }

    const stride = Math.max(2, Math.floor(size / count));
    /** @type {number[]} */
    const chosen = [];
    const used = new Set();
    for (let i = 0; i < count; i++) {
        let slot = Math.floor(((i + 0.5) * size) / count) + (Math.floor(Math.random() * 3) - 1);
        slot = Math.max(0, Math.min(size - 1, slot));
        let tries = 0;
        while (used.has(slot) && tries < size) {
            slot = (slot + stride) % size;
            tries++;
        }
        if (!used.has(slot)) {
            used.add(slot);
            chosen.push(slot);
        }
    }
    for (let s = 0; chosen.length < count && s < size; s++) {
        if (!used.has(s)) {
            used.add(s);
            chosen.push(s);
        }
    }
    return chosen;
}

/**
 * @param {import("@minecraft/server").ItemStack[]} stacks
 * @param {number} maxPieces
 */
function expandStacksForSpread(stacks, maxPieces = 14) {
    /** @type {import("@minecraft/server").ItemStack[]} */
    const out = [];
    for (const stack of stacks) {
        let left = stack.amount;
        const id = stack.typeId;
        while (left > 0 && out.length < maxPieces) {
            if (left > 3 && out.length < maxPieces - 1) {
                const piece = Math.max(1, Math.min(left - 1, Math.floor(left * (0.3 + Math.random() * 0.35))));
                out.push(new ItemStack(id, piece));
                left -= piece;
            } else {
                out.push(new ItemStack(id, left));
                left = 0;
            }
        }
    }
    return out;
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
export function scatterStorageInventory(dimension, x, y, z) {
    let block;
    try {
        block = dimension.getBlock({ x, y, z });
    } catch {
        return;
    }
    if (!block) return;
    const container = getContainerInventory(block);
    if (!container) return;

    const size = container.size;
    /** @type {import("@minecraft/server").ItemStack[]} */
    const stacks = [];
    for (let i = 0; i < size; i++) {
        const stack = container.getItem(i);
        if (stack) stacks.push(stack);
    }
    if (stacks.length === 0) return;

    const spreadStacks = expandStacksForSpread(stacks);
    const targetSlots = pickSpreadSlots(size, spreadStacks.length);

    for (let i = 0; i < size; i++) {
        container.setItem(i, undefined);
    }
    for (let i = 0; i < spreadStacks.length && i < targetSlots.length; i++) {
        container.setItem(targetSlots[i], spreadStacks[i]);
    }
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
function storageHasItems(dimension, x, y, z) {
    let block;
    try {
        block = dimension.getBlock({ x, y, z });
    } catch {
        return false;
    }
    const container = block ? getContainerInventory(block) : undefined;
    if (!container) return false;
    for (let i = 0; i < container.size; i++) {
        if (container.getItem(i)) return true;
    }
    return false;
}

/**
 * @param {number} min
 * @param {number} max
 */
function rollCount(min, max) {
    if (max <= min) return min;
    return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} [salt]
 */
function chestNoiseSeed(x, y, z, salt = 0) {
    return (
        (Math.imul(Math.floor(x), 374761393) ^
            Math.imul(Math.floor(z), 668265263) ^
            Math.imul(Math.floor(y), 1274126177) ^
            salt) >>>
        0
    );
}

/**
 * @param {number} seed
 * @param {number} max
 */
function seededChance(seed, max = 100) {
    return (seed % max) / max;
}

/**
 * @param {LootEntry} entry
 */
function createLootItemStack(entry) {
    const stack = new ItemStack(entry.id, rollCount(entry.min, entry.max));
    if (!entry.enchant?.length) return stack;
    try {
        const enchComp = stack.getComponent("minecraft:enchantable");
        if (!enchComp) return stack;
        for (const e of entry.enchant) {
            const type = new EnchantmentType(e.type);
            const spec = { type, level: e.level };
            if (enchComp.canAddEnchantment?.(spec)) {
                enchComp.addEnchantment(spec);
            }
        }
    } catch {
        /* incompatible enchant — return unenchanted */
    }
    return stack;
}

/**
 * @param {import("@minecraft/server").Container} container
 * @param {LootEntry[]} pool
 * @param {number} pickCount
 */
function applyLootPoolToContainer(container, pool, pickCount) {
    if (!pool.length || pickCount <= 0) return;
    const size = container.size;
    const spreadSlots = pickSpreadSlots(size, pickCount);
    /** @type {number[]} */
    const poolIdx = [];
    for (let i = 0; i < pool.length; i++) poolIdx.push(i);
    for (let i = poolIdx.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = poolIdx[i];
        poolIdx[i] = poolIdx[j];
        poolIdx[j] = t;
    }
    const usedCategories = new Set();
    let slotN = 0;
    for (const pi of poolIdx) {
        if (slotN >= spreadSlots.length) break;
        const entry = pool[pi];
        if (!entry) continue;
        const cat = lootSlotCategory(entry.id);
        if (usedCategories.has(cat)) continue;
        usedCategories.add(cat);
        try {
            container.setItem(spreadSlots[slotN], createLootItemStack(entry));
            slotN++;
        } catch {
            /* ignore */
        }
    }
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {import("@minecraft/server").Container|undefined}
 */
function getStorageContainer(dimension, x, y, z) {
    try {
        const block = dimension.getBlock({ x, y, z });
        return block ? getContainerInventory(block) : undefined;
    } catch {
        return undefined;
    }
}

/**
 * @param {import("@minecraft/server").Container} container
 * @param {import("@minecraft/server").ItemStack} stack
 */
function placeInFirstEmptySlot(container, stack) {
    for (let i = 0; i < container.size; i++) {
        if (!container.getItem(i)) {
            try {
                container.setItem(i, stack);
                return true;
            } catch {
                return false;
            }
        }
    }
    return false;
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {import("@minecraft/server").ItemStack} stack
 */
function tryPlaceBonusItem(dimension, x, y, z, stack) {
    const container = getStorageContainer(dimension, x, y, z);
    if (!container) return;
    placeInFirstEmptySlot(container, stack);
}

/**
 * @param {string} lootTableId
 */
function isSmithLootTable(lootTableId) {
    return SMITH_LOOT_TABLES.has(lootTableId);
}

/** Work-building / station tables — no pantry food mix or house clutter augment. */
function isThemedWorkLootTable(lootTableId) {
    if (isSmithLootTable(lootTableId)) return true;
    return (
        Object.values(WORK_KIND_LOOT).includes(lootTableId) ||
        lootTableId === VILLAGE_LOOT.house_cartographer ||
        lootTableId === VILLAGE_LOOT.house_temple ||
        lootTableId === VILLAGE_LOOT.hide_bunker ||
        lootTableId === VILLAGE_LOOT.hide_bunker_ruined
    );
}

/**
 * @param {string} lootTableId
 * @param {string|undefined} [lootSlot]
 */
function isPantryThemedLoot(lootTableId, lootSlot) {
    return (
        lootSlot === "pantry" ||
        lootTableId.includes("pantry") ||
        lootTableId === VILLAGE_LOOT.house_cellar
    );
}

/**
 * @param {string} lootTableId
 * @returns {LootEntry[]}
 */
function buildSmithFallbackPool(lootTableId) {
    /** @type {LootEntry[]} */
    const base = [...(FALLBACK_BY_TABLE[lootTableId] ?? [])];
    const existingIds = new Set(base.map((e) => e.id));
    if (Math.random() < 0.8) {
        const tool = SMITH_IRON_TOOL_IDS[Math.floor(Math.random() * SMITH_IRON_TOOL_IDS.length)];
        if (!existingIds.has(tool)) {
            base.push({ id: tool, min: 1, max: 1 });
            existingIds.add(tool);
        }
    }
    if (lootTableId === VILLAGE_LOOT.house_weaponsmith) {
        if (Math.random() < 0.48) {
            base.push({ id: pickWeaponsmithSpearId(), min: 1, max: 1 });
        }
        const mount = Math.random();
        if (mount < 0.1) {
            base.push({ id: "minecraft:saddle", min: 1, max: 1 });
        } else if (mount < 0.22) {
            const armor =
                HORSE_ARMOR_LOOT_IDS[Math.floor(Math.random() * HORSE_ARMOR_LOOT_IDS.length)];
            base.push({ id: armor, min: 1, max: 1 });
        }
    }
    if (Math.random() < 0.18) {
        base.push({ id: "minecraft:obsidian", min: 1, max: 4 });
    }
    if (Math.random() < 0.06) {
        const tool = SMITH_DIAMOND_TOOL_IDS[Math.floor(Math.random() * SMITH_DIAMOND_TOOL_IDS.length)];
        if (!existingIds.has(tool)) base.push({ id: tool, min: 1, max: 1 });
    }
    return base;
}

/**
 * Rare diamond tools / obsidian on top of vanilla smith loot.
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {string} lootTableId
 */
/**
 * Extra snow items in snowy-ruleset storage (after vanilla/script loot).
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {SettlementRuleset} ruleset
 */
function maybeAugmentSnowyStorage(dimension, x, y, z, ruleset) {
    if (ruleset !== "snowy") return;
    let block;
    try {
        block = dimension.getBlock({ x, y, z });
    } catch {
        return;
    }
    const container = block ? getContainerInventory(block) : undefined;
    if (!container) return;

    /** @type {number[]} */
    const empty = [];
    for (let i = 0; i < container.size; i++) {
        if (!container.getItem(i)) empty.push(i);
    }
    if (empty.length === 0) return;

    const pickCount = Math.min(empty.length, 1 + Math.floor(Math.random() * 2));
    for (let n = 0; n < pickCount; n++) {
        const entry = FALLBACK_SNOWY_SUPPLIES[Math.floor(Math.random() * FALLBACK_SNOWY_SUPPLIES.length)];
        if (!entry) continue;
        try {
            container.setItem(empty[n], new ItemStack(entry.id, rollCount(entry.min, entry.max)));
        } catch {
            /* ignore */
        }
    }
}

function maybeAugmentSmithStorage(dimension, x, y, z, lootTableId) {
    if (!isSmithLootTable(lootTableId)) return;
    const container = getStorageContainer(dimension, x, y, z);
    const seed = chestNoiseSeed(x, y, z, 41);
    if (seededChance(seed, 100) < 0.14) {
        if (container && containerHasItemMatching(container, (id) => id.includes("_sword"))) return;
        tryPlaceBonusItem(
            dimension,
            x,
            y,
            z,
            createLootItemStack({
                id: "minecraft:iron_sword",
                min: 1,
                max: 1,
                enchant: [
                    { type: "sharpness", level: 1 },
                    { type: "unbreaking", level: 2 }
                ]
            })
        );
    }
    if (seededChance(seed + 3, 100) < 0.1) {
        tryPlaceBonusItem(
            dimension,
            x,
            y,
            z,
            createLootItemStack({
                id: "minecraft:iron_pickaxe",
                min: 1,
                max: 1,
                enchant: [{ type: "efficiency", level: 2 }]
            })
        );
    }
    if (seededChance(seed + 7, 100) < 0.08) {
        tryPlaceBonusItem(
            dimension,
            x,
            y,
            z,
            createLootItemStack({ id: "minecraft:enchanted_book", min: 1, max: 1 })
        );
    }
    if (seededChance(seed + 11, 100) < 0.05) {
        const tool = SMITH_DIAMOND_TOOL_IDS[seed % SMITH_DIAMOND_TOOL_IDS.length];
        tryPlaceBonusItem(dimension, x, y, z, new ItemStack(tool, 1));
    }
}

/**
 * Blacksmith extras — spears, mounts gear (vanilla weaponsmith + apocalypse scavenging).
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {string} lootTableId
 */
function maybeAugmentWeaponsmithStorage(dimension, x, y, z, lootTableId) {
    if (lootTableId !== VILLAGE_LOOT.house_weaponsmith) return;
    const container = getStorageContainer(dimension, x, y, z);
    if (!container) return;
    const seed = chestNoiseSeed(x, y, z, 79);
    const roll = seededChance(seed, 100);
    const hasSpear = containerHasItemMatching(container, isSpearItemId);
    const hasSaddle = containerHasItemMatching(container, (id) => id === "minecraft:saddle");
    const hasHorseArmor = containerHasItemMatching(container, isHorseArmorItemId);

    if (!hasSpear && roll < 0.14) {
        tryPlaceBonusItem(dimension, x, y, z, new ItemStack(pickWeaponsmithSpearId(seed), 1));
        return;
    }
    if (!hasSaddle && roll >= 0.14 && roll < 0.22) {
        tryPlaceBonusItem(dimension, x, y, z, new ItemStack("minecraft:saddle", 1));
        return;
    }
    if (!hasHorseArmor && roll >= 0.22 && roll < 0.3) {
        const armor = HORSE_ARMOR_LOOT_IDS[seed % HORSE_ARMOR_LOOT_IDS.length];
        tryPlaceBonusItem(dimension, x, y, z, new ItemStack(armor, 1));
        return;
    }
    if (!hasSpear && roll >= 0.3 && roll < 0.34) {
        tryPlaceBonusItem(
            dimension,
            x,
            y,
            z,
            createLootItemStack({
                id: "minecraft:iron_spear",
                min: 1,
                max: 1,
                enchant: [
                    { type: "sharpness", level: 1 },
                    { type: "unbreaking", level: 2 }
                ]
            })
        );
    }
}

function maybeAugmentArmorerStorage(dimension, x, y, z, lootTableId) {
    if (lootTableId !== VILLAGE_LOOT.house_armorer) return;
    const seed = chestNoiseSeed(x, y, z, 53);
    const pieces = [
        "minecraft:iron_helmet",
        "minecraft:iron_chestplate",
        "minecraft:iron_leggings",
        "minecraft:iron_boots"
    ];
    if (seededChance(seed, 100) < 0.12) {
        const id = pieces[seed % pieces.length];
        tryPlaceBonusItem(
            dimension,
            x,
            y,
            z,
            createLootItemStack({
                id,
                min: 1,
                max: 1,
                enchant: [
                    { type: "protection", level: 1 },
                    { type: "unbreaking", level: 2 }
                ]
            })
        );
    }
}

function maybeAugmentFletcherStorage(dimension, x, y, z, lootTableId) {
    if (lootTableId !== VILLAGE_LOOT.house_fletcher) return;
    const seed = chestNoiseSeed(x, y, z, 67);
    if (seededChance(seed, 100) < 0.1) {
        tryPlaceBonusItem(dimension, x, y, z, new ItemStack("minecraft:bow", 1));
    }
    if (seededChance(seed + 2, 100) < 0.045) {
        tryPlaceBonusItem(
            dimension,
            x,
            y,
            z,
            createLootItemStack({
                id: "minecraft:bow",
                min: 1,
                max: 1,
                enchant: [
                    { type: "power", level: seededChance(seed + 5, 3) < 0.5 ? 1 : 2 },
                    { type: "unbreaking", level: 2 }
                ]
            })
        );
    }
    if (seededChance(seed + 9, 100) < 0.025) {
        tryPlaceBonusItem(
            dimension,
            x,
            y,
            z,
            createLootItemStack({
                id: "minecraft:crossbow",
                min: 1,
                max: 1,
                enchant: [{ type: "quick_charge", level: 1 }]
            })
        );
    }
    if (seededChance(seed + 13, 100) < 0.35) {
        tryPlaceBonusItem(dimension, x, y, z, new ItemStack("minecraft:arrow", rollCount(8, 24)));
    }
}

function maybeAugmentLibrarianStorage(dimension, x, y, z, lootTableId) {
    if (lootTableId !== VILLAGE_LOOT.house_librarian) return;
    const seed = chestNoiseSeed(x, y, z, 79);
    if (seededChance(seed, 100) < 0.22) {
        tryPlaceBonusItem(
            dimension,
            x,
            y,
            z,
            createLootItemStack({ id: "minecraft:enchanted_book", min: 1, max: 1 })
        );
    }
    if (seededChance(seed + 4, 100) < 0.15) {
        tryPlaceBonusItem(dimension, x, y, z, new ItemStack("minecraft:book", rollCount(2, 6)));
    }
}

function maybeAugmentFishermanStorage(dimension, x, y, z, lootTableId) {
    if (lootTableId !== VILLAGE_LOOT.house_fisherman) return;
    const seed = chestNoiseSeed(x, y, z, 91);
    if (seededChance(seed, 100) < 0.12) {
        tryPlaceBonusItem(
            dimension,
            x,
            y,
            z,
            createLootItemStack({
                id: "minecraft:fishing_rod",
                min: 1,
                max: 1,
                enchant: [
                    { type: "luck_of_the_sea", level: 1 },
                    { type: "lure", level: 1 }
                ]
            })
        );
    }
}

/**
 * Extra lived-in items on biome house chests (not script pantry-only).
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {string} lootTableId
 * @param {SettlementRuleset} ruleset
 * @param {string|undefined} [lootSlot]
 */
function maybeAugmentHouseStorage(dimension, x, y, z, lootTableId, ruleset, lootSlot) {
    if (isThemedWorkLootTable(lootTableId)) return;
    if (lootSlot === "primary" || lootSlot === "work" || lootSlot === "gear") return;

    const houseTables = new Set([
        VILLAGE_LOOT.house_plains,
        VILLAGE_LOOT.house_desert,
        VILLAGE_LOOT.house_savanna,
        VILLAGE_LOOT.house_taiga,
        VILLAGE_LOOT.house_snowy,
        VILLAGE_LOOT.house_jungle,
        VILLAGE_LOOT.house_pantry_plains,
        VILLAGE_LOOT.house_pantry_desert,
        VILLAGE_LOOT.house_pantry_savanna,
        VILLAGE_LOOT.house_pantry_taiga,
        VILLAGE_LOOT.house_pantry_snowy,
        VILLAGE_LOOT.house_pantry_jungle,
        VILLAGE_LOOT.house_lived_clutter,
        VILLAGE_LOOT.house_generic
    ]);
    if (!houseTables.has(lootTableId)) return;
    if (lootTableId === VILLAGE_LOOT.house_lived_clutter || lootTableId === VILLAGE_LOOT.house_lived_treasure) {
        return;
    }

    const seed = chestNoiseSeed(x, y, z, 103);
    const container = getStorageContainer(dimension, x, y, z);
    if (!container) return;

    /** @type {number[]} */
    const empty = [];
    for (let i = 0; i < container.size; i++) {
        if (!container.getItem(i)) empty.push(i);
    }
    if (empty.length === 0) return;

    /** @type {LootEntry[]} */
    const bonusPool = [];
    if (isPantryThemedLoot(lootTableId, lootSlot) || lootTableId === VILLAGE_LOOT.house_butcher) {
        bonusPool.push(
            ...repeatLootEntries(SPOILAGE_COMMON, 4),
            ...repeatLootEntries(FOOD_FRESH, 2)
        );
        if (ruleset === "infected" && seededChance(seed + 17, 100) < 0.25) {
            bonusPool.push({ id: "mb:snow", min: 2, max: 8 });
        }
        const extraPicks = Math.min(empty.length, 1 + (seed % 3));
        applyLootPoolToContainer(container, bonusPool, extraPicks);
        return;
    }

    if (lootTableId === VILLAGE_LOOT.house_fisherman) {
        bonusPool.push(
            { id: "minecraft:rotten_flesh", min: 1, max: 4 },
            { id: "minecraft:bone", min: 1, max: 3 }
        );
        const extraPicks = Math.min(empty.length, 1 + (seed % 2));
        applyLootPoolToContainer(container, bonusPool, extraPicks);
        return;
    }

    const profile = seed % 3;
    if (profile === 0) {
        bonusPool.push(
            { id: "minecraft:emerald", min: 1, max: 2 },
            { id: "minecraft:gold_nugget", min: 2, max: 8 }
        );
    } else if (profile === 1) {
        bonusPool.push(
            { id: "minecraft:iron_ingot", min: 1, max: 3 },
            { id: "minecraft:coal", min: 2, max: 8 }
        );
    } else {
        bonusPool.push(
            { id: "minecraft:book", min: 1, max: 2 },
            { id: "minecraft:candle", min: 1, max: 3 },
            { id: "minecraft:torch", min: 2, max: 6 }
        );
    }

    if (ruleset === "infected" && seededChance(seed + 17, 100) < 0.25) {
        bonusPool.push({ id: "mb:snow", min: 2, max: 8 });
    }

    const extraPicks = Math.min(empty.length, 1 + (seed % 2));
    applyLootPoolToContainer(container, bonusPool, extraPicks);
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {string} lootTableId
 * @param {SettlementRuleset} ruleset
 * @param {string|undefined} [lootSlot]
 */
function augmentVillageStorage(dimension, x, y, z, lootTableId, ruleset, lootSlot) {
    if (isSmithLootTable(lootTableId)) {
        maybeAugmentSmithStorage(dimension, x, y, z, lootTableId);
    }
    if (lootTableId === VILLAGE_LOOT.house_weaponsmith) {
        maybeAugmentWeaponsmithStorage(dimension, x, y, z, lootTableId);
    }
    if (lootTableId === VILLAGE_LOOT.house_armorer) {
        maybeAugmentArmorerStorage(dimension, x, y, z, lootTableId);
    }
    if (lootTableId === VILLAGE_LOOT.house_fletcher) {
        maybeAugmentFletcherStorage(dimension, x, y, z, lootTableId);
    }
    if (lootTableId === VILLAGE_LOOT.house_librarian) {
        maybeAugmentLibrarianStorage(dimension, x, y, z, lootTableId);
    }
    if (lootTableId === VILLAGE_LOOT.house_fisherman) {
        maybeAugmentFishermanStorage(dimension, x, y, z, lootTableId);
    }
    maybeAugmentHouseStorage(dimension, x, y, z, lootTableId, ruleset, lootSlot);
    if (ruleset === "snowy") {
        maybeAugmentSnowyStorage(dimension, x, y, z, ruleset);
    }
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {string} lootTableId
 * @param {SettlementRuleset} [ruleset]
 * @param {string|undefined} [lootSlot]
 */
function applyFallbackVillageLoot(dimension, x, y, z, lootTableId, ruleset = "plains", lootSlot) {
    const container = getStorageContainer(dimension, x, y, z);
    if (!container) return;

    let pool = FALLBACK_BY_TABLE[lootTableId] ?? FALLBACK_GENERIC;
    if (lootTableId === VILLAGE_LOOT.house_cellar) {
        pool = FALLBACK_CELLAR;
    } else if (isSmithLootTable(lootTableId)) {
        pool = buildSmithFallbackPool(lootTableId);
    } else if (ruleset === "infected" && lootTableId === VILLAGE_LOOT.house_taiga) {
        pool = [...FALLBACK_BY_TABLE[VILLAGE_LOOT.house_taiga], ...FALLBACK_INFECTED];
    } else if (ruleset === "snowy" && !lootTableId.includes("pantry")) {
        pool = [...pool, ...FALLBACK_SNOWY_SUPPLIES];
    }

    if (
        (lootSlot === "primary" || lootSlot === "work" || lootSlot === "gear") &&
        !isPantryThemedLoot(lootTableId, lootSlot)
    ) {
        pool = pool.filter((e) => !isConsumableFoodId(e.id));
    }

    pool = mixAbandonedConsumablePool(pool, lootTableId, lootSlot);

    const isPantry = isPantryThemedLoot(lootTableId, lootSlot);
    const isLived = lootTableId.startsWith("script/village/house_lived");
    const pickCount = Math.min(
        container.size,
        lootTableId === VILLAGE_LOOT.hide_bunker
            ? 3 + Math.floor(Math.random() * 2)
            : lootTableId === VILLAGE_LOOT.hide_bunker_ruined
              ? 1 + Math.floor(Math.random() * 2)
            : lootTableId === VILLAGE_LOOT.house_cellar
            ? 4 + Math.floor(Math.random() * 3)
            : isPantry
              ? 4 + Math.floor(Math.random() * 4)
              : isLived
                ? 3 + Math.floor(Math.random() * 3)
                : 3 + Math.floor(Math.random() * 4)
    );
    applyLootPoolToContainer(container, pool, pickCount);
}

/**
 * @param {string} table
 * @returns {string[]}
 */
function lootCommandTablePaths(table) {
    const base = table.replace(/^loot_tables\//, "").replace(/\.json$/, "");
    return [
        base,
        `loot_tables/${base}`,
        `minecraft:${base}`
    ];
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} bx
 * @param {number} by
 * @param {number} bz
 * @param {string} table
 * @returns {boolean}
 */
function runLootFillCommand(dimension, bx, by, bz, table) {
    for (const path of lootCommandTablePaths(table)) {
        const cmds = [
            `loot replace block ${bx} ${by} ${bz} loot "${path}"`,
            `loot insert block ${bx} ${by} ${bz} loot "${path}"`,
            `loot replace block ${bx} ${by} ${bz} container loot "${path}"`,
            `loot replace block ${bx} ${by} ${bz} slot.container loot "${path}"`
        ];
        for (const cmd of cmds) {
            try {
                dimension.runCommand(cmd);
                return true;
            } catch {
                /* try next */
            }
        }
    }
    return false;
}

/**
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {string} lootTableId
 * @param {string} blockId
 * @param {SettlementRuleset} [ruleset]
 * @param {string|undefined} [lootSlot]
 */
function fillVillageStorageNow(dimension, x, y, z, lootTableId, blockId, ruleset = "plains", lootSlot) {
    const table = lootTableId.includes("/") ? lootTableId : VILLAGE_LOOT.house_generic;
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);

    const cellarOnly = table === VILLAGE_LOOT.house_cellar;
    const scriptOnly = isScriptOnlyLootTable(table);
    if (!cellarOnly && !scriptOnly) {
        runLootFillCommand(dimension, bx, by, bz, table);
    }

    if (cellarOnly || scriptOnly || !storageHasItems(dimension, bx, by, bz)) {
        applyFallbackVillageLoot(dimension, bx, by, bz, table, ruleset, lootSlot);
    }

    scatterStorageInventory(dimension, bx, by, bz);

    const augmentKey = `${dimension.id}:${bx}:${by}:${bz}`;
    if (
        !cellarOnly &&
        table !== VILLAGE_LOOT.hide_bunker &&
        table !== VILLAGE_LOOT.hide_bunker_ruined &&
        !STORAGE_AUGMENTED.has(augmentKey) &&
        storageHasItems(dimension, bx, by, bz)
    ) {
        augmentVillageStorage(dimension, bx, by, bz, table, ruleset, lootSlot);
        STORAGE_AUGMENTED.add(augmentKey);
    }
}

/**
 * Fill chest/barrel — deferred so block entities exist; vanilla /loot with script fallback.
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {string} lootTableId
 * @param {string} [blockId] minecraft:chest | minecraft:barrel
 * @param {SettlementRuleset} [ruleset]
 * @param {string|undefined} [lootSlot] pantry | primary | work | gear from interior spec
 */
export function fillVillageStorageAt(
    dimension,
    x,
    y,
    z,
    lootTableId,
    blockId = "minecraft:chest",
    ruleset = "plains",
    lootSlot
) {
    if (blockId !== "minecraft:chest" && blockId !== "minecraft:barrel") return;
    const fill = () => {
        try {
            fillVillageStorageNow(dimension, x, y, z, lootTableId, blockId, ruleset, lootSlot);
        } catch {
            /* unloaded */
        }
    };
    try {
        system.run(fill);
    } catch {
        /* ignore */
    }
    system.runTimeout(fill, 2);
    system.runTimeout(fill, 8);
    system.runTimeout(fill, 20);
    system.runTimeout(fill, 45);
}

/** @deprecated use fillVillageStorageAt */
export function fillVillageChestAt(dimension, x, y, z, lootTableId) {
    fillVillageStorageAt(dimension, x, y, z, lootTableId, "minecraft:chest");
}

/**
 * @param {string} id
 */
function isWorldgenArtifactBlockId(id) {
    return id.includes("structure_block") || id === "minecraft:jigsaw" || id === "jigsaw";
}

export { isWorldgenArtifactBlockId };
