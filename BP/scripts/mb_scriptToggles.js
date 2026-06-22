/**
 * Script toggles — world-level flags for enabling/disabling addon systems.
 * Developer Tools → Systems → Script toggles.
 *
 * Journal + day counter always run (not listed here).
 */

import { world } from "@minecraft/server";
import { getWorldProperty, setWorldProperty } from "./mb_dynamicPropertyHandler.js";

try {
    world.afterEvents.playerSpawn.subscribe((event) => {
        if (getBetaOwnerId() != null) return;
        const p = event.player;
        if (p?.id != null) setBetaOwnerId(p.id);
    });
} catch {
    /* Early execution */
}

const SCRIPT_PROP_PREFIX = "mb_script_";

export const SCRIPT_IDS = {
    mining: "mining_ai",
    infected: "infected_ai",
    flying: "flying_ai",
    torpedo: "torpedo_ai",
    buff: "buff_ai",
    biomeAmbience: "biome_ambience",
    infectionAudio: "infection_audio",
    spawnController: "spawn_controller",
    snowStorm: "snow_storm",
    dimensionAdaptation: "dimension_adaptation",
    bearCull: "bear_population_cull",
    buffOverflowCull: "buff_overflow_cull",
    miningOverflowCull: "mining_overflow_cull",
    infectionSystem: "infection_system",
    groundInfection: "ground_infection",
    mobConversion: "mob_conversion",
    infectionDirector: "infection_director",
    performanceProfile: "performance_profile",
    spawnLoadMetrics: "spawn_load_metrics",
    actionBarHud: "action_bar_hud",
    emulsifier: "emulsifier",
    villagerSuppress: "villager_suppress",
    snowTrail: "snow_trail",
    chunkEdgeWatch: "chunk_edge_watch",
    playerDiscovery: "player_discovery",
    dustedDirtCleanup: "dusted_dirt_cleanup",
    workSpread: "work_spread",
    abandonedVillageWorldgen: "abandoned_village_worldgen"
};

/** Menu order (all toggles). */
export const SCRIPT_TOGGLE_ORDER = [
    SCRIPT_IDS.mining,
    SCRIPT_IDS.infected,
    SCRIPT_IDS.flying,
    SCRIPT_IDS.torpedo,
    SCRIPT_IDS.buff,
    SCRIPT_IDS.bearCull,
    SCRIPT_IDS.buffOverflowCull,
    SCRIPT_IDS.miningOverflowCull,
    SCRIPT_IDS.spawnController,
    SCRIPT_IDS.snowStorm,
    SCRIPT_IDS.emulsifier,
    SCRIPT_IDS.infectionSystem,
    SCRIPT_IDS.groundInfection,
    SCRIPT_IDS.mobConversion,
    SCRIPT_IDS.infectionDirector,
    SCRIPT_IDS.infectionAudio,
    SCRIPT_IDS.biomeAmbience,
    SCRIPT_IDS.dimensionAdaptation,
    SCRIPT_IDS.performanceProfile,
    SCRIPT_IDS.spawnLoadMetrics,
    SCRIPT_IDS.actionBarHud,
    SCRIPT_IDS.workSpread,
    SCRIPT_IDS.villagerSuppress,
    SCRIPT_IDS.abandonedVillageWorldgen,
    SCRIPT_IDS.snowTrail,
    SCRIPT_IDS.chunkEdgeWatch,
    SCRIPT_IDS.playerDiscovery,
    SCRIPT_IDS.dustedDirtCleanup
];

/** @type {Record<string, string>} */
export const SCRIPT_TOGGLE_LABELS = {
    [SCRIPT_IDS.mining]: "Mining bear AI",
    [SCRIPT_IDS.infected]: "Infected bear AI",
    [SCRIPT_IDS.flying]: "Flying bear AI",
    [SCRIPT_IDS.torpedo]: "Torpedo bear AI",
    [SCRIPT_IDS.buff]: "Buff bear AI",
    [SCRIPT_IDS.biomeAmbience]: "Biome ambience",
    [SCRIPT_IDS.infectionAudio]: "Infection audio (cough/breath)",
    [SCRIPT_IDS.spawnController]: "Spawn controller + scans",
    [SCRIPT_IDS.snowStorm]: "Snow / infection storms",
    [SCRIPT_IDS.dimensionAdaptation]: "Dimension adaptation",
    [SCRIPT_IDS.bearCull]: "Bear population cull",
    [SCRIPT_IDS.buffOverflowCull]: "Buff overflow cull",
    [SCRIPT_IDS.miningOverflowCull]: "Mining overflow cull",
    [SCRIPT_IDS.infectionSystem]: "Player infection timers",
    [SCRIPT_IDS.groundInfection]: "Ground / biome exposure",
    [SCRIPT_IDS.mobConversion]: "Mob conversion (hurt/die)",
    [SCRIPT_IDS.infectionDirector]: "Infection director toasts",
    [SCRIPT_IDS.performanceProfile]: "Adaptive perf sampler",
    [SCRIPT_IDS.spawnLoadMetrics]: "Spawn load metrics",
    [SCRIPT_IDS.actionBarHud]: "Action bar HUD merge",
    [SCRIPT_IDS.emulsifier]: "Emulsifier machine loops",
    [SCRIPT_IDS.villagerSuppress]: "Villager script despawn",
    [SCRIPT_IDS.abandonedVillageWorldgen]: "Script village placement (WIP; Settings → Dev world)",
    [SCRIPT_IDS.snowTrail]: "Snow trail placement",
    [SCRIPT_IDS.chunkEdgeWatch]: "Chunk-edge defer watch",
    [SCRIPT_IDS.playerDiscovery]: "Biome + inventory discovery",
    [SCRIPT_IDS.dustedDirtCleanup]: "Dusted dirt age cleanup",
    [SCRIPT_IDS.workSpread]: "Work spread (day 0–1 throttle)"
};

/** Hub categories for Developer Tools menu. */
export const SCRIPT_TOGGLE_GROUPS = {
    bears: {
        title: "§6Bear AI & cull",
        ids: [
            SCRIPT_IDS.mining,
            SCRIPT_IDS.infected,
            SCRIPT_IDS.flying,
            SCRIPT_IDS.torpedo,
            SCRIPT_IDS.buff,
            SCRIPT_IDS.bearCull,
            SCRIPT_IDS.buffOverflowCull,
            SCRIPT_IDS.miningOverflowCull
        ]
    },
    spawn: {
        title: "§aSpawn & storms",
        ids: [
            SCRIPT_IDS.spawnController,
            SCRIPT_IDS.snowStorm,
            SCRIPT_IDS.emulsifier,
            SCRIPT_IDS.spawnLoadMetrics
        ]
    },
    infection: {
        title: "§cInfection & world",
        ids: [
            SCRIPT_IDS.infectionSystem,
            SCRIPT_IDS.groundInfection,
            SCRIPT_IDS.mobConversion,
            SCRIPT_IDS.infectionDirector,
            SCRIPT_IDS.infectionAudio,
            SCRIPT_IDS.biomeAmbience,
            SCRIPT_IDS.dimensionAdaptation,
            SCRIPT_IDS.villagerSuppress,
            SCRIPT_IDS.snowTrail,
            SCRIPT_IDS.dustedDirtCleanup
        ]
    },
    perf: {
        title: "§bPerf & HUD",
        ids: [
            SCRIPT_IDS.performanceProfile,
            SCRIPT_IDS.actionBarHud,
            SCRIPT_IDS.workSpread,
            SCRIPT_IDS.chunkEdgeWatch,
            SCRIPT_IDS.playerDiscovery
        ]
    }
};

/**
 * Maps day-0 bisect category keys → script toggle (when script is OFF, work sleeps).
 * @type {Record<string, string>}
 */
export const SCRIPT_BISECT_CATEGORY_MAP = {
    infection: SCRIPT_IDS.infectionSystem,
    ground: SCRIPT_IDS.groundInfection,
    entity_hurt: SCRIPT_IDS.mobConversion,
    entity_die: SCRIPT_IDS.mobConversion,
    bear_entity_spawn: SCRIPT_IDS.mobConversion,
    perf_sampler: SCRIPT_IDS.performanceProfile,
    spawn_metrics: SCRIPT_IDS.spawnLoadMetrics,
    entity_query_hud: SCRIPT_IDS.actionBarHud,
    infection_director: SCRIPT_IDS.infectionDirector,
    biome_ambience: SCRIPT_IDS.biomeAmbience,
    spawn_emulsifier: SCRIPT_IDS.emulsifier,
    snow_trail: SCRIPT_IDS.snowTrail,
    chunk_edge: SCRIPT_IDS.chunkEdgeWatch,
    discovery: SCRIPT_IDS.playerDiscovery,
    villager_listen: SCRIPT_IDS.villagerSuppress,
    villager_quiet: SCRIPT_IDS.villagerSuppress,
    villager_spawn: SCRIPT_IDS.villagerSuppress,
    entity_queries: SCRIPT_IDS.workSpread
};

/**
 * Opt-in dev systems — default OFF until explicitly enabled (Journal → Settings → Dev world).
 * @type {Set<string>}
 */
const SCRIPT_DEFAULT_OFF = new Set([SCRIPT_IDS.abandonedVillageWorldgen]);

/** Default: all scripts enabled except {@link SCRIPT_DEFAULT_OFF}. Explicit 0/false disables. */
export function isScriptEnabled(scriptId) {
    const key = SCRIPT_PROP_PREFIX + scriptId;
    const val = getWorldProperty(key);
    if (val === false || val === 0 || val === "0") return false;
    if (val === true || val === 1 || val === "1") return true;
    if (SCRIPT_DEFAULT_OFF.has(scriptId)) return false;
    return true;
}

/** Abandoned village horizon / lamp / script settlements (dev opt-in). */
export function isAbandonedVillageWorldgenEnabled() {
    return isScriptEnabled(SCRIPT_IDS.abandonedVillageWorldgen);
}

export function setScriptEnabled(scriptId, enabled) {
    const key = SCRIPT_PROP_PREFIX + scriptId;
    setWorldProperty(key, enabled ? 1 : 0);
}

export function getAllScriptToggles() {
    /** @type {Record<string, boolean>} */
    const out = {};
    for (const id of SCRIPT_TOGGLE_ORDER) {
        out[id] = isScriptEnabled(id);
    }
    return out;
}

/** @param {boolean} enabled */
export function setAllScriptToggles(enabled) {
    for (const id of SCRIPT_TOGGLE_ORDER) {
        setScriptEnabled(id, enabled);
    }
}

/** True when every toggleable system is off (journal + day counter still run). */
export function areAllScriptTogglesOff() {
    return SCRIPT_TOGGLE_ORDER.every((id) => !isScriptEnabled(id));
}

/**
 * @param {string} [bisectCategory] {@link SCRIPT_BISECT_CATEGORY_MAP} key
 * @returns {boolean} True → skip this work (script off or day-0 bisect).
 */
export function shouldSleepScriptCategoryWork(bisectCategory) {
    if (!bisectCategory) return false;
    const scriptId = SCRIPT_BISECT_CATEGORY_MAP[bisectCategory];
    if (scriptId && !isScriptEnabled(scriptId)) return true;
    return false;
}

// --- Beta Settings (unchanged) ---
const BETA_INFECTED_AI = "mb_beta_infected_ai";
const DUST_STORMS_ENABLED = "mb_dust_storms_enabled";
const BETA_VISIBLE_TO_ALL = "mb_beta_visible_to_all";
const BETA_OWNER_ID = "mb_beta_settings_owner_id";

export function isBetaInfectedAIEnabled() {
    const val = getWorldProperty(BETA_INFECTED_AI);
    if (val === true || val === 1 || val === "1") return true;
    return false;
}

export function setBetaInfectedAIEnabled(enabled) {
    setWorldProperty(BETA_INFECTED_AI, enabled ? 1 : 0);
}

export function isDustStormsEnabled() {
    const val = getWorldProperty(DUST_STORMS_ENABLED);
    if (val === false || val === 0 || val === "0") return false;
    return true;
}

export function setDustStormsEnabled(enabled) {
    setWorldProperty(DUST_STORMS_ENABLED, enabled ? 1 : 0);
}

export function isBetaVisibleToAll() {
    const val = getWorldProperty(BETA_VISIBLE_TO_ALL);
    return val === true || val === 1 || val === "1";
}

export function setBetaVisibleToAll(visible) {
    setWorldProperty(BETA_VISIBLE_TO_ALL, visible ? 1 : 0);
}

export function getBetaOwnerId() {
    return getWorldProperty(BETA_OWNER_ID) ?? null;
}

export function setBetaOwnerId(playerId) {
    setWorldProperty(BETA_OWNER_ID, String(playerId));
}
