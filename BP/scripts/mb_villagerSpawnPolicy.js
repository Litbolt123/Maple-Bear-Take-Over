/**
 * Maple Bear worlds: no employed villagers (abandoned / custom settlements only).
 * - Spawn rules: empty / impossible conditions (natural rules only; not structure villages).
 * - Vanilla village_type disabled (worldgen_no_village); mb_abandonedVillageWorldgen.js places 100% abandoned villages.
 * - Living villagers removed; zombie villagers from abandoned villages are kept.
 * - Scripts: block spawn eggs (use + use-on-block); remove on entitySpawn; periodic purge.
 * Wandering traders are allowed.
 *
 * World property mb_suppress_villagers: default ON; set 0 to allow (testing).
 */

import { system, world } from "@minecraft/server";
import { getWorldProperty, setWorldProperty } from "./mb_dynamicPropertyHandler.js";
import { isScriptEnabled, SCRIPT_IDS } from "./mb_scriptToggles.js";

export const SUPPRESS_VILLAGERS_PROP = "mb_suppress_villagers";

/** Living villagers only — zombie villagers stay in abandoned / zombie villages. */
export const SUPPRESSED_VILLAGER_ENTITY_TYPES = new Set([
    "minecraft:villager",
    "minecraft:villager_v2"
]);

export const BLOCKED_VILLAGER_SPAWN_EGG_TYPES = new Set([
    "minecraft:villager_spawn_egg",
    "minecraft:zombie_villager_spawn_egg"
]);

const PURGE_TYPE_LIST = [...SUPPRESSED_VILLAGER_ENTITY_TYPES];
const PURGE_DIMENSIONS = ["overworld", "nether", "the_end"];
const PURGE_INTERVAL_TICKS = 20;

/** Sliding window for egg spam warnings (per player). */
const EGG_WARN_WINDOW_TICKS = 40;
/** @type {Map<string, { count: number, windowStart: number, level: number }>} */
const eggWarnByPlayerId = new Map();
let eggBlocksThisTick = 0;
let eggBlocksTickId = -1;

let policyHooksStarted = false;
let purgeRotate = 0;

/** @returns {boolean} Default true when property unset. */
export function isVillagerSuppressionEnabled() {
    if (!isScriptEnabled(SCRIPT_IDS.villagerSuppress)) return false;
    const v = getWorldProperty(SUPPRESS_VILLAGERS_PROP);
    if (v === undefined || v === null) return true;
    return v === true || v === 1 || v === "1";
}

export function ensureVillagerSuppressionDefault() {
    try {
        const v = getWorldProperty(SUPPRESS_VILLAGERS_PROP);
        if (v === undefined || v === null) {
            setWorldProperty(SUPPRESS_VILLAGERS_PROP, 1);
        }
    } catch {
        /* ignore */
    }
}

/**
 * Dev / testing: allow or block script villager removal (eggs, entitySpawn, purge).
 * @param {boolean} enabled
 */
export function setVillagerSuppressionEnabled(enabled) {
    try {
        setWorldProperty(SUPPRESS_VILLAGERS_PROP, enabled ? 1 : 0);
    } catch {
        /* ignore */
    }
}

/** @returns {boolean} New state after toggle. */
export function toggleVillagerSuppressionEnabled() {
    const next = !isVillagerSuppressionEnabled();
    setVillagerSuppressionEnabled(next);
    return next;
}

/**
 * @param {string} [typeId]
 * @returns {boolean}
 */
export function isSuppressedVillagerType(typeId) {
    return !!typeId && SUPPRESSED_VILLAGER_ENTITY_TYPES.has(typeId);
}

/**
 * @param {import("@minecraft/server").Entity} [entity]
 * @returns {boolean}
 */
function isBabyVillagerEntity(entity) {
    if (!entity) return false;
    try {
        if (entity.isBaby === true) return true;
    } catch {
        /* ignore */
    }
    try {
        const ageable = entity.getComponent("minecraft:ageable");
        if (ageable?.isBaby === true) return true;
    } catch {
        /* ignore */
    }
    return false;
}

/**
 * @param {import("@minecraft/server").Entity} entity
 */
function removeSuppressedVillager(entity) {
    if (!entity) return;
    try {
        entity.remove();
        return;
    } catch {
        /* ignore */
    }
    try {
        entity.kill?.();
    } catch {
        /* ignore */
    }
}

function tryRemoveSpawnedVillager(entity) {
    if (!entity || isBabyVillagerEntity(entity)) return;
    removeSuppressedVillager(entity);
    system.run(() => {
        try {
            if (entity?.isValid) removeSuppressedVillager(entity);
        } catch {
            /* ignore */
        }
    });
}

/**
 * @param {number} count
 * @returns {string}
 */
function actionBarForEggCount(count) {
    if (count <= 1) {
        return "§7Villagers do not exist here — egg blocked.";
    }
    if (count <= 3) {
        return "§eVillager eggs are blocked §7(and each try can still hitch the world).";
    }
    if (count <= 6) {
        return "§c§lStop spamming villager eggs§r §7— vanilla still tries to spawn before we remove them.";
    }
    return "§4§lHeavy lag risk§r §7— dispensers / many eggs = tick stalls. Use wandering traders.";
}

/**
 * @param {import("@minecraft/server").Player} player
 * @param {number} count
 */
function playEggWarnSound(player, count) {
    if (!player?.isValid) return;
    try {
        const pitch = count >= 8 ? 0.4 : count >= 4 ? 0.55 : 0.7;
        player.playSound("note.bass", { volume: 0.9, pitch });
    } catch {
        /* ignore */
    }
}

/**
 * @param {import("@minecraft/server").Player} player
 * @param {number} count
 */
function showEggWarnTitle(player, count) {
    if (!player?.isValid || count < 5) return;
    try {
        const osd = player.onScreenDisplay;
        if (!osd?.setTitle) return;
        if (count >= 10) {
            osd.setTitle("§4§lWORLD LAG", {
                subtitle: "§7Each villager egg still runs vanilla spawn work — please stop.",
                fadeInDuration: 2,
                stayDuration: 50,
                fadeOutDuration: 8
            });
        } else {
            osd.setTitle("§c§lNo villagers", {
                subtitle: "§7Eggs are cancelled, but spamming them can still freeze ticks.",
                fadeInDuration: 2,
                stayDuration: 35,
                fadeOutDuration: 6
            });
        }
    } catch {
        /* ignore */
    }
}

/**
 * @param {import("@minecraft/server").Player} player
 * @param {number} count
 * @param {number} prevLevel
 * @returns {number}
 */
function sendEggWarnChat(player, count, prevLevel) {
    if (!player?.isValid) return prevLevel;
    let level = prevLevel;
    const send = (msg, nextLevel) => {
        if (level >= nextLevel) return;
        try {
            player.sendMessage(msg);
        } catch {
            /* ignore */
        }
        level = nextLevel;
    };

    if (count === 1) {
        send("§7Villagers do not exist in this world — wandering traders still work.", 1);
    } else if (count === 2) {
        send("§eReminder: §7the game still spends work on each egg before we delete the mob.", 2);
    } else if (count >= 4 && level < 4) {
        send("§6Warning: §7rapid villager eggs (or dispensers) caused day-0 lag in testing — please slow down.", 4);
    } else if (count >= 8 && level < 8) {
        send("§c§lLag spike risk: §7each egg is a full vanilla spawn attempt. Try one wandering trader instead.", 8);
    } else if (count >= 15 && level < 15) {
        send("§4§lSeriously — stop. §7Even with Maple Bear scripts idle, villager spawn cost is vanilla-side.", 15);
    }
    return level;
}

/**
 * @param {import("@minecraft/server").Player} player
 */
function recordBlockedEggUse(player) {
    if (!player?.isValid) return;
    const tick = system.currentTick;
    const id = player.id;
    let state = eggWarnByPlayerId.get(id);
    if (!state || tick - state.windowStart > EGG_WARN_WINDOW_TICKS) {
        state = { count: 0, windowStart: tick, level: 0 };
    }
    state.count += 1;
    eggWarnByPlayerId.set(id, state);

    try {
        const osd = player.onScreenDisplay;
        osd?.setActionBar?.(actionBarForEggCount(state.count));
    } catch {
        /* ignore */
    }

    playEggWarnSound(player, state.count);
    showEggWarnTitle(player, state.count);
    state.level = sendEggWarnChat(player, state.count, state.level);
    eggWarnByPlayerId.set(id, state);
}

/** Many egg cancels same tick (dispenser) — warn nearby players once. */
function noteGlobalEggBlockTick() {
    const tick = system.currentTick;
    if (tick !== eggBlocksTickId) {
        eggBlocksTickId = tick;
        eggBlocksThisTick = 0;
    }
    eggBlocksThisTick += 1;
    if (eggBlocksThisTick !== 4) return;

    try {
        for (const player of world.getAllPlayers()) {
            if (!player?.isValid) continue;
            try {
                player.sendMessage(
                    "§6Dispenser / bulk villager eggs: §7each one still costs vanilla spawn work — expect hitches."
                );
                player.onScreenDisplay?.setActionBar?.(
                    "§c§lBulk villager eggs detected§r §7— lag likely even though mobs are removed."
                );
                player.playSound("random.break", { volume: 0.6, pitch: 0.5 });
            } catch {
                /* ignore */
            }
        }
    } catch {
        /* ignore */
    }
}

function handleBlockedEggUse(event) {
    if (!isVillagerSuppressionEnabled()) return false;
    const itemId = event?.itemStack?.typeId;
    if (!itemId || !BLOCKED_VILLAGER_SPAWN_EGG_TYPES.has(itemId)) return false;
    try {
        event.cancel = true;
    } catch {
        /* ignore */
    }
    const source = event?.source;
    noteGlobalEggBlockTick();
    system.run(() => {
        try {
            if (source?.isValid) recordBlockedEggUse(source);
        } catch {
            /* ignore */
        }
    });
    return true;
}

function onEntitySpawned(event) {
    if (!isVillagerSuppressionEnabled()) return;
    const entity = event?.entity;
    const typeId = entity?.typeId;
    if (!isSuppressedVillagerType(typeId)) return;
    tryRemoveSpawnedVillager(entity);
}

/** Structure villages bypass spawn rules — sweep loaded dimensions by type. */
function purgeSuppressedVillagersTick() {
    if (!isVillagerSuppressionEnabled()) return;
    const typeId = PURGE_TYPE_LIST[purgeRotate % PURGE_TYPE_LIST.length];
    purgeRotate++;

    for (const dimId of PURGE_DIMENSIONS) {
        let dim;
        try {
            dim = world.getDimension(dimId);
        } catch {
            continue;
        }
        if (!dim) continue;

        let entities;
        try {
            entities = dim.getEntities({ type: typeId });
        } catch {
            continue;
        }

        for (const entity of entities) {
            if (!entity?.isValid) continue;
            if (isBabyVillagerEntity(entity)) continue;
            try {
                removeSuppressedVillager(entity);
            } catch {
                /* ignore */
            }
        }
    }
}

function startPolicyHooks() {
    if (policyHooksStarted) return;
    policyHooksStarted = true;
    ensureVillagerSuppressionDefault();

    try {
        if (world.beforeEvents?.itemUse) {
            world.beforeEvents.itemUse.subscribe((event) => {
                try {
                    handleBlockedEggUse(event);
                } catch {
                    /* ignore */
                }
            });
        }
    } catch {
        /* ignore */
    }

    try {
        if (world.beforeEvents?.itemUseOn) {
            world.beforeEvents.itemUseOn.subscribe((event) => {
                try {
                    handleBlockedEggUse(event);
                } catch {
                    /* ignore */
                }
            });
        }
    } catch {
        /* ignore */
    }

    try {
        if (world.afterEvents?.entitySpawn) {
            world.afterEvents.entitySpawn.subscribe((event) => {
                try {
                    onEntitySpawned(event);
                } catch {
                    /* ignore */
                }
            });
        }
    } catch {
        /* ignore */
    }

    try {
        system.runInterval(() => {
            try {
                purgeSuppressedVillagersTick();
            } catch {
                /* ignore */
            }
        }, PURGE_INTERVAL_TICKS);
    } catch {
        /* ignore */
    }
}

/** Idempotent — also starts hooks at module load below. */
export function initializeVillagerSpawnPolicy() {
    startPolicyHooks();
}

try {
    if (typeof world !== "undefined") {
        system.run(() => {
            try {
                startPolicyHooks();
            } catch {
                /* ignore */
            }
        });
    }
} catch {
    /* import before world ready */
}
