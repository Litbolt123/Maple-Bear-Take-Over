/**
 * Script toggles and beta settings - world-level flags for enabling/disabling
 * scripts and beta features. Used by Developer Tools and Settings.
 * Owner = first player to join the world. mb_cheats also grants edit access.
 */

import { world } from "@minecraft/server";
import { getWorldProperty, setWorldProperty } from "./mb_dynamicPropertyHandler.js";

// Set first player to join as beta settings owner (no owner yet)
try {
    world.afterEvents.playerSpawn.subscribe((event) => {
        if (getBetaOwnerId() != null) return;
        const p = event.player;
        if (p?.id != null) setBetaOwnerId(p.id);
    });
} catch (e) {
    // Early execution - subscription may fail
}

// --- Script Toggles (Developer Tools) ---
const SCRIPT_PROP_PREFIX = "mb_script_";
export const SCRIPT_IDS = {
    mining: "mining_ai",
    infected: "infected_ai",
    flying: "flying_ai",
    torpedo: "torpedo_ai",
    buff: "buff_ai",
    biomeAmbience: "biome_ambience",
    spawnController: "spawn_controller"
};

/** Default: all scripts enabled. Only explicit false disables. */
export function isScriptEnabled(scriptId) {
    const key = SCRIPT_PROP_PREFIX + scriptId;
    const val = getWorldProperty(key);
    if (val === false || val === 0 || val === "0") return false;
    return true;
}

export function setScriptEnabled(scriptId, enabled) {
    const key = SCRIPT_PROP_PREFIX + scriptId;
    setWorldProperty(key, enabled ? 1 : 0);
}

export function getAllScriptToggles() {
    return {
        [SCRIPT_IDS.mining]: isScriptEnabled(SCRIPT_IDS.mining),
        [SCRIPT_IDS.infected]: isScriptEnabled(SCRIPT_IDS.infected),
        [SCRIPT_IDS.flying]: isScriptEnabled(SCRIPT_IDS.flying),
        [SCRIPT_IDS.torpedo]: isScriptEnabled(SCRIPT_IDS.torpedo),
        [SCRIPT_IDS.buff]: isScriptEnabled(SCRIPT_IDS.buff),
        [SCRIPT_IDS.biomeAmbience]: isScriptEnabled(SCRIPT_IDS.biomeAmbience),
        [SCRIPT_IDS.spawnController]: isScriptEnabled(SCRIPT_IDS.spawnController)
    };
}

// --- Beta Settings (Settings menu, owner-only) ---
const BETA_INFECTED_AI = "mb_beta_infected_ai";
const BETA_VISIBLE_TO_ALL = "mb_beta_visible_to_all";
const BETA_OWNER_ID = "mb_beta_settings_owner_id";

/** Beta: Infected AI enabled. Default OFF on world load - must be turned on in book. */
export function isBetaInfectedAIEnabled() {
    const val = getWorldProperty(BETA_INFECTED_AI);
    if (val === true || val === 1 || val === "1") return true;
    return false;
}

export function setBetaInfectedAIEnabled(enabled) {
    setWorldProperty(BETA_INFECTED_AI, enabled ? 1 : 0);
}

/** Beta section visible to non-owners in their book */
export function isBetaVisibleToAll() {
    const val = getWorldProperty(BETA_VISIBLE_TO_ALL);
    return val === true || val === 1 || val === "1";
}

export function setBetaVisibleToAll(visible) {
    setWorldProperty(BETA_VISIBLE_TO_ALL, visible ? 1 : 0);
}

/** Owner ID (first player to join the world) */
export function getBetaOwnerId() {
    return getWorldProperty(BETA_OWNER_ID) ?? null;
}

export function setBetaOwnerId(playerId) {
    setWorldProperty(BETA_OWNER_ID, String(playerId));
}
