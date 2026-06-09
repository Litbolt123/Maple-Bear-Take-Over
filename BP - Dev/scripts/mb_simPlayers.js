/**
 * Dev-only simulated ("ghost") players for solo performance testing.
 *
 * These are NOT real `Player` entities. They exist only as lightweight objects that
 * provide the minimal shape used by our AI/spawn/perf loops (dimension + location + id/name).
 *
 * Controls (world properties):
 * - `mb_sim_players` = 0/1 enable
 * - `mb_sim_players_count` = 0..32
 * - `mb_sim_players_dims` = "overworld" | "all"  (default overworld)
 * - `mb_sim_players_pattern` = "orbit" | "jitter" (default orbit)
 * - `mb_sim_players_radius` = number blocks (default 48)
 * - `mb_sim_players_speed` = number (default 1.0)
 * - `mb_sim_players_markers` = 0/1 optional particle markers at each ghost position (dev visibility)
 * - `mb_sim_stress_chest_minecarts` = 0/1 spawn chest minecarts at each sim position (heavy inventory stress)
 * - `mb_sim_stress_armor_stands` = 0/1 spawn armor stands at each sim position (gear stress)
 * - `mb_sim_players_full` = 0/1 (dev pack): spawn-list merge + minor infection entries for sim ids
 * - `mb_sim_players_debug` = 0/1 (dev pack): throttled Content Log lines (`[SIM PLAYERS]`)
 *
 * Per-player (journal dev HUD):
 * - `mb_dev_hud_sim_players` = 0/1 show sim summary on merged action bar
 *
 * **Helpers:** `getAllPlayersIncludingSim()` — same merge as `getCachedPlayers()` (real + ghosts when sims on).
 * `isSimulatedPlayer(p)` — branch when ghost objects must not receive real-only APIs.
 */

import { system, world, ItemStack, EquipmentSlot } from "@minecraft/server";
import { getWorldProperty, getPlayerProperty, setPlayerProperty, flushPlayerPropertyToDisk } from "./mb_dynamicPropertyHandler.js";
import { INCLUDE_FULL_DEVELOPER_TOOLS } from "./mb_buildConfig.js";
import { ACTION_BAR_SLOT, setHudActionBarSegment, clearHudActionBarSegment } from "./mb_actionBarHud.js";

const MAX_SIM_PLAYERS = 32;
const DEFAULT_RADIUS = 48;
const DEFAULT_SPEED = 1.0;

/** Per-player: show sim-players HUD segment (Developer Tools → HUD & action bar). */
export const MB_DEV_HUD_SIM_PLAYERS = "mb_dev_hud_sim_players";
/** World: spawn addon particles at each simulated ghost position (not real entities). */
export const MB_SIM_PLAYERS_MARKERS = "mb_sim_players_markers";
/** World: chest minecart per sim index (teleported each tick to ghost position). */
export const MB_SIM_STRESS_CHEST_MINECARTS = "mb_sim_stress_chest_minecarts";
/** World: armor stand per sim index (teleported each tick). */
export const MB_SIM_STRESS_ARMOR_STANDS = "mb_sim_stress_armor_stands";
/** World: merge sims into spawn player lists + run lightweight infection ticks for each sim (dev stress). */
export const MB_SIM_PLAYERS_FULL = "mb_sim_players_full";
/** World: throttled Content Log lines for sim testing. */
export const MB_SIM_PLAYERS_DEBUG = "mb_sim_players_debug";

function readPlayerHudBool(player, key) {
    try {
        if (!player?.isValid) return false;
        const v = getPlayerProperty(player, key);
        return v === 1 || v === true || v === "1";
    } catch {
        return false;
    }
}

/** @param {import("@minecraft/server").Player} player */
export function isSimPlayersHudPersonalEnabled(player) {
    return readPlayerHudBool(player, MB_DEV_HUD_SIM_PLAYERS);
}

/** @param {import("@minecraft/server").Player} player */
export function setSimPlayersHudPersonalEnabled(player, enabled) {
    try {
        if (!player?.isValid) return;
        setPlayerProperty(player, MB_DEV_HUD_SIM_PLAYERS, enabled ? 1 : 0);
        flushPlayerPropertyToDisk(player, MB_DEV_HUD_SIM_PLAYERS);
    } catch { /* ignore */ }
}

function readBool(key) {
    const v = getWorldProperty(key);
    return v === 1 || v === true || v === "1";
}

export function areSimPlayerMarkersEnabled() {
    return readBool(MB_SIM_PLAYERS_MARKERS);
}

export function areSimStressChestMinecartsEnabled() {
    return readBool(MB_SIM_STRESS_CHEST_MINECARTS);
}

export function areSimStressArmorStandsEnabled() {
    return readBool(MB_SIM_STRESS_ARMOR_STANDS);
}

/** Throttled Content Log for sim player merge / counts (dev pack + `mb_sim_players_debug`). */
export function areSimPlayersDebugEnabled() {
    return INCLUDE_FULL_DEVELOPER_TOOLS && readBool(MB_SIM_PLAYERS_DEBUG);
}

/** Full behavior: spawn lists + infection map entries for ghost sims (dev pack only). */
export function isSimFullBehaviorEnabled() {
    return INCLUDE_FULL_DEVELOPER_TOOLS && readBool(MB_SIM_PLAYERS_FULL);
}

function readNumber(key, fallback) {
    const n = Number(getWorldProperty(key));
    return Number.isFinite(n) ? n : fallback;
}

function readString(key, fallback) {
    const v = getWorldProperty(key);
    return typeof v === "string" && v ? v : fallback;
}

function normalizeDimChoice(raw) {
    const v = (raw || "").toLowerCase();
    return v === "all" ? "all" : "overworld";
}

function normalizePattern(raw) {
    const v = (raw || "").toLowerCase();
    return v === "jitter" ? "jitter" : "orbit";
}

function safeGetAnchorPlayer() {
    try {
        const players = world.getAllPlayers();
        return players && players.length ? players[0] : null;
    } catch {
        return null;
    }
}

/** @typedef {{ id: string, name: string, isValid: true, dimension: import("@minecraft/server").Dimension, location: {x:number,y:number,z:number}, getGameMode: () => string, playSound: () => void, sendMessage: () => void, __isSimulatedPlayer: true }} SimPlayer */

/** True for ghost sim objects from `getSimPlayers()` / `getAllPlayersIncludingSim()` (not real `Player` entities). */
export function isSimulatedPlayer(p) {
    return !!(p && p.__isSimulatedPlayer === true);
}

let lastTick = -999999;
/** @type {SimPlayer[]} */
let cached = [];

function updateSimPlayers(anchor) {
    const enabled = readBool("mb_sim_players");
    if (!enabled) {
        cached = [];
        return cached;
    }

    const count = Math.max(0, Math.min(MAX_SIM_PLAYERS, Math.floor(readNumber("mb_sim_players_count", 0))));
    if (count <= 0) {
        cached = [];
        return cached;
    }

    const dimMode = normalizeDimChoice(readString("mb_sim_players_dims", "overworld"));
    const pattern = normalizePattern(readString("mb_sim_players_pattern", "orbit"));
    const radius = Math.max(6, Math.min(256, readNumber("mb_sim_players_radius", DEFAULT_RADIUS)));
    const speed = Math.max(0.05, Math.min(10, readNumber("mb_sim_players_speed", DEFAULT_SPEED)));

    const tick = system.currentTick;
    const t = (tick / 20) * speed; // seconds-ish

    const baseDimId = anchor?.dimension?.id || "minecraft:overworld";
    const baseLoc = anchor?.location || { x: 0, y: 80, z: 0 };

    /** @type {import("@minecraft/server").Dimension[]} */
    const dims = [];
    if (dimMode === "all") {
        for (const id of ["overworld", "nether", "the_end"]) {
            try { dims.push(world.getDimension(id)); } catch { /* ignore */ }
        }
    } else {
        try {
            const id = baseDimId.startsWith("minecraft:") ? baseDimId.substring(10) : baseDimId;
            dims.push(world.getDimension(id));
        } catch {
            try { dims.push(world.getDimension("overworld")); } catch { /* ignore */ }
        }
    }
    if (!dims.length) {
        cached = [];
        return cached;
    }

    const out = [];
    for (let i = 0; i < count; i++) {
        const dim = dims[i % dims.length];
        const angle = t + (i / count) * Math.PI * 2;
        const jitter = pattern === "jitter" ? (Math.sin(t * 3 + i * 1.7) * 0.4 + Math.cos(t * 2 + i * 0.9) * 0.6) : 0;
        const r = radius * (1 + jitter * 0.15);

        // Spread them around the anchor so we exercise spatial queries + per-player loops.
        const x = baseLoc.x + Math.cos(angle) * r;
        const z = baseLoc.z + Math.sin(angle) * r;
        const y = baseLoc.y;

        /** @type {SimPlayer} */
        const sim = {
            id: `sim:${i}`,
            name: `SimPlayer${i + 1}`,
            isValid: true,
            dimension: dim,
            location: { x, y, z },
            getGameMode: () => "survival",
            playSound: () => { /* no-op */ },
            sendMessage: () => { /* no-op */ },
            __isSimulatedPlayer: true
        };
        out.push(sim);
    }
    cached = out;
    return cached;
}

export function areSimPlayersEnabled() {
    return readBool("mb_sim_players");
}

/** @returns {SimPlayer[]} */
export function getSimPlayers() {
    const tick = system.currentTick;
    if (tick === lastTick) return cached;
    lastTick = tick;
    const anchor = safeGetAnchorPlayer();
    return updateSimPlayers(anchor);
}

/**
 * Online players plus ghost sims when `mb_sim_players` is enabled (same merge as `getCachedPlayers()` in mb_sharedCache.js).
 * Use `world.getAllPlayers()` when you must exclude sims (commands, UI targeting real clients only).
 * @returns {(import("@minecraft/server").Player | SimPlayer)[]}
 */
export function getAllPlayersIncludingSim() {
    try {
        const real = world.getAllPlayers();
        if (!areSimPlayersEnabled()) return real;
        const sims = getSimPlayers();
        return sims.length ? [...real, ...sims] : real;
    } catch {
        return [];
    }
}

function refreshSimPlayersHudForAllPlayers() {
    try {
        if (!INCLUDE_FULL_DEVELOPER_TOOLS) {
            const pl = world.getAllPlayers();
            for (const p of pl) {
                if (p?.isValid) clearHudActionBarSegment(p, ACTION_BAR_SLOT.SIM_PLAYERS);
            }
            return;
        }
        const pl = world.getAllPlayers();
        const sims = getSimPlayers();
        const markersOn = readBool(MB_SIM_PLAYERS_MARKERS);
        const dimMode = normalizeDimChoice(readString("mb_sim_players_dims", "overworld"));
        const pattern = normalizePattern(readString("mb_sim_players_pattern", "orbit"));
        const radius = Math.max(6, Math.min(256, readNumber("mb_sim_players_radius", DEFAULT_RADIUS)));
        const speed = Math.max(0.05, Math.min(10, readNumber("mb_sim_players_speed", DEFAULT_SPEED)));
        const speed10 = Math.max(1, Math.min(100, Math.round(speed * 10)));
        const patternTok = pattern === "jitter" ? "jit" : "orb";
        const dimTok = dimMode === "all" ? "all" : "ow";
        const enabledSys = areSimPlayersEnabled();
        const configuredCount = Math.max(0, Math.min(MAX_SIM_PLAYERS, Math.floor(readNumber("mb_sim_players_count", 0))));

        for (const p of pl) {
            if (!p?.isValid) continue;
            if (!isSimPlayersHudPersonalEnabled(p)) {
                clearHudActionBarSegment(p, ACTION_BAR_SLOT.SIM_PLAYERS);
                continue;
            }
            const mk = markersOn ? "§a+" : "§8-";
            if (!enabledSys || configuredCount <= 0) {
                const idle = !enabledSys ? "§7off" : "§e0";
                setHudActionBarSegment(
                    p,
                    ACTION_BAR_SLOT.SIM_PLAYERS,
                    `§bSim§r ${idle} §8·§r ${dimTok} §8·§r ${patternTok} §8·§r r${radius} §8·§r v${speed10} §8·§r mk${mk}`
                );
                continue;
            }
            let nearest = -1;
            try {
                const vid = p.dimension?.id;
                const lx = p.location?.x ?? 0;
                const lz = p.location?.z ?? 0;
                for (const s of sims) {
                    if (!s?.dimension?.id || s.dimension.id !== vid) continue;
                    const dx = (s.location?.x ?? 0) - lx;
                    const dz = (s.location?.z ?? 0) - lz;
                    const d = Math.sqrt(dx * dx + dz * dz);
                    if (nearest < 0 || d < nearest) nearest = d;
                }
            } catch { /* ignore */ }
            const nearTok = nearest >= 0 ? `§7~§f${Math.floor(nearest)}` : "§7—";
            const n = sims.length;
            setHudActionBarSegment(
                p,
                ACTION_BAR_SLOT.SIM_PLAYERS,
                `§bSim§r §f${n} §8·§r ${dimTok} §8·§r ${patternTok} §8·§r r${radius} §8·§r v${speed10} §8·§r ${nearTok} §8·§r mk${mk}`
            );
        }
    } catch { /* ignore */ }
}

/** Short burst particle — `mb:white_dust_particle` uses a 6s emitter and reads as a solid ring around sims. */
const SIM_MARKER_PARTICLE_ID = "mb:white_dust_particle_short";

/** @type {(import("@minecraft/server").Entity | undefined)[]} */
let stressMinecarts = [];
/** @type {(import("@minecraft/server").Entity | undefined)[]} */
let stressArmorStands = [];
const filledStressMinecartIds = new Set();
const filledStressArmorIds = new Set();

function trimStressEntityArray(arr, newLen) {
    while (arr.length > newLen) {
        const e = arr.pop();
        try {
            if (e?.isValid) e.remove();
        } catch { /* ignore */ }
    }
}

function cleanupStressMinecartsOnly() {
    trimStressEntityArray(stressMinecarts, 0);
    filledStressMinecartIds.clear();
}

function cleanupStressArmorOnly() {
    trimStressEntityArray(stressArmorStands, 0);
    filledStressArmorIds.clear();
}

function cleanupAllStressEntities() {
    cleanupStressMinecartsOnly();
    cleanupStressArmorOnly();
}

function fillChestMinecartStress(entity) {
    try {
        const id = entity.id;
        if (filledStressMinecartIds.has(id)) return;
        const container = entity.getComponent("inventory")?.container;
        if (!container) return;
        filledStressMinecartIds.add(id);
        const size = container.size;
        let slot = 0;
        const put = (/** @type {ItemStack} */ stack) => {
            if (slot >= size) return;
            try {
                container.setItem(slot++, stack);
            } catch { /* ignore */ }
        };
        put(new ItemStack("minecraft:cobblestone", 64));
        put(new ItemStack("minecraft:dirt", 64));
        put(new ItemStack("minecraft:netherrack", 64));
        put(new ItemStack("minecraft:end_stone", 64));
        put(new ItemStack("minecraft:oak_log", 64));
        put(new ItemStack("minecraft:blackstone", 64));
        put(new ItemStack("minecraft:sand", 64));
        put(new ItemStack("minecraft:gravel", 64));
        put(new ItemStack("minecraft:iron_ingot", 64));
        put(new ItemStack("minecraft:gold_ingot", 64));
        put(new ItemStack("minecraft:diamond", 64));
        put(new ItemStack("minecraft:emerald", 64));
        put(new ItemStack("minecraft:redstone", 64));
        put(new ItemStack("minecraft:coal", 64));
        put(new ItemStack("minecraft:lapis_lazuli", 64));
        put(new ItemStack("minecraft:quartz", 64));
        put(new ItemStack("minecraft:glowstone_dust", 64));
        put(new ItemStack("minecraft:netherite_ingot", 16));
        put(new ItemStack("minecraft:netherite_pickaxe", 1));
        put(new ItemStack("minecraft:netherite_sword", 1));
        put(new ItemStack("minecraft:netherite_shovel", 1));
        put(new ItemStack("minecraft:bow", 1));
        put(new ItemStack("minecraft:arrow", 64));
        const bundle = new ItemStack("minecraft:bundle", 1);
        try {
            const bc = bundle.getComponent("minecraft:bundle_contents");
            if (bc && typeof bc.addItem === "function") {
                bc.addItem(new ItemStack("minecraft:oak_log", 64));
                bc.addItem(new ItemStack("minecraft:cobblestone", 64));
            }
        } catch { /* ignore */ }
        put(bundle);
        const bundle2 = new ItemStack("minecraft:bundle", 1);
        try {
            const bc2 = bundle2.getComponent("minecraft:bundle_contents");
            if (bc2 && typeof bc2.addItem === "function") {
                bc2.addItem(new ItemStack("minecraft:diamond", 64));
                bc2.addItem(new ItemStack("minecraft:iron_ingot", 64));
            }
        } catch { /* ignore */ }
        put(bundle2);
        while (slot < size) {
            put(new ItemStack("minecraft:stone", 64));
        }
    } catch { /* ignore */ }
}

function fillArmorStandStress(entity) {
    try {
        const id = entity.id;
        if (filledStressArmorIds.has(id)) return;
        filledStressArmorIds.add(id);
        const eq = entity.getComponent("equippable");
        if (!eq?.setEquipment) return;
        // Use EquipmentSlot enum — string slot names often fail silently on armor stands.
        try { eq.setEquipment(EquipmentSlot.Head, new ItemStack("minecraft:netherite_helmet", 1)); } catch { /* ignore */ }
        try { eq.setEquipment(EquipmentSlot.Chest, new ItemStack("minecraft:netherite_chestplate", 1)); } catch { /* ignore */ }
        try { eq.setEquipment(EquipmentSlot.Legs, new ItemStack("minecraft:netherite_leggings", 1)); } catch { /* ignore */ }
        try { eq.setEquipment(EquipmentSlot.Feet, new ItemStack("minecraft:netherite_boots", 1)); } catch { /* ignore */ }
        try { eq.setEquipment(EquipmentSlot.Mainhand, new ItemStack("minecraft:netherite_sword", 1)); } catch { /* ignore */ }
        try { eq.setEquipment(EquipmentSlot.Offhand, new ItemStack("minecraft:shield", 1)); } catch { /* ignore */ }
    } catch { /* ignore */ }
}

function tickSimStressEntities() {
    try {
        if (!INCLUDE_FULL_DEVELOPER_TOOLS) {
            cleanupAllStressEntities();
            return;
        }
        if (!areSimPlayersEnabled()) {
            cleanupAllStressEntities();
            return;
        }
        const wantMc = readBool(MB_SIM_STRESS_CHEST_MINECARTS);
        const wantArm = readBool(MB_SIM_STRESS_ARMOR_STANDS);
        if (!wantMc) cleanupStressMinecartsOnly();
        if (!wantArm) cleanupStressArmorOnly();
        if (!wantMc && !wantArm) return;

        const sims = getSimPlayers();
        const n = sims.length;

        if (wantMc) {
            trimStressEntityArray(stressMinecarts, n);
            while (stressMinecarts.length < n) stressMinecarts.push(undefined);
            for (let i = 0; i < n; i++) {
                const sim = sims[i];
                const dim = sim.dimension;
                const loc = sim.location;
                if (!dim?.spawnEntity || loc == null) continue;
                let e = stressMinecarts[i];
                if (e?.isValid && e.dimension?.id !== dim.id) {
                    try {
                        e.remove();
                    } catch { /* ignore */ }
                    e = undefined;
                    stressMinecarts[i] = undefined;
                }
                if (!e || !e.isValid) {
                    try {
                        if (e?.isValid) e.remove();
                    } catch { /* ignore */ }
                    try {
                        e = dim.spawnEntity("minecraft:chest_minecart", {
                            x: loc.x,
                            y: loc.y + 0.5,
                            z: loc.z
                        });
                        stressMinecarts[i] = e;
                        fillChestMinecartStress(e);
                    } catch {
                        stressMinecarts[i] = undefined;
                    }
                } else {
                    try {
                        e.teleport({ x: loc.x, y: loc.y + 0.5, z: loc.z }, { dimension: dim });
                    } catch {
                        try {
                            if (e.isValid) e.remove();
                        } catch { /* ignore */ }
                        stressMinecarts[i] = undefined;
                    }
                }
            }
        }

        if (wantArm) {
            trimStressEntityArray(stressArmorStands, n);
            while (stressArmorStands.length < n) stressArmorStands.push(undefined);
            for (let i = 0; i < n; i++) {
                const sim = sims[i];
                const dim = sim.dimension;
                const loc = sim.location;
                if (!dim?.spawnEntity || loc == null) continue;
                let e = stressArmorStands[i];
                if (e?.isValid && e.dimension?.id !== dim.id) {
                    try {
                        e.remove();
                    } catch { /* ignore */ }
                    e = undefined;
                    stressArmorStands[i] = undefined;
                }
                if (!e || !e.isValid) {
                    try {
                        if (e?.isValid) e.remove();
                    } catch { /* ignore */ }
                    try {
                        e = dim.spawnEntity("minecraft:armor_stand", {
                            x: loc.x,
                            y: loc.y,
                            z: loc.z
                        });
                        stressArmorStands[i] = e;
                        fillArmorStandStress(e);
                    } catch {
                        stressArmorStands[i] = undefined;
                    }
                } else {
                    try {
                        e.teleport({ x: loc.x, y: loc.y, z: loc.z }, { dimension: dim });
                    } catch {
                        try {
                            if (e.isValid) e.remove();
                        } catch { /* ignore */ }
                        stressArmorStands[i] = undefined;
                    }
                }
            }
        }
    } catch { /* ignore */ }
}

function spawnSimPlayerMarkers() {
    try {
        if (!INCLUDE_FULL_DEVELOPER_TOOLS) return;
        if (!readBool(MB_SIM_PLAYERS_MARKERS)) return;
        if (!areSimPlayersEnabled()) return;
        const sims = getSimPlayers();
        if (!sims.length) return;
        for (const s of sims) {
            try {
                const dim = s.dimension;
                const loc = s.location;
                if (!dim?.spawnParticle || !loc) continue;
                dim.spawnParticle(SIM_MARKER_PARTICLE_ID, { x: loc.x, y: (loc.y ?? 64) + 0.25, z: loc.z });
            } catch { /* ignore */ }
        }
    } catch { /* ignore */ }
}

try {
    system.runInterval(() => {
        refreshSimPlayersHudForAllPlayers();
        spawnSimPlayerMarkers();
    }, 10);
} catch { /* ignore */ }

try {
    system.runInterval(() => tickSimStressEntities(), 1);
} catch { /* ignore */ }

const SIM_PLAYERS_DEBUG_INTERVAL_TICKS = 100;
try {
    system.runInterval(() => {
        try {
            if (!areSimPlayersDebugEnabled() || !areSimPlayersEnabled()) return;
            const real = world.getAllPlayers();
            const sims = getSimPlayers();
            // No ghosts yet (count 0 / disabled anchor): skip heartbeat — avoids Content Log spam when sims stay armed but idle.
            if (!sims.length) return;
            const merged = getAllPlayersIncludingSim();
            const full = isSimFullBehaviorEnabled();
            const rad = Math.max(6, Math.min(256, Math.floor(readNumber("mb_sim_players_radius", DEFAULT_RADIUS))));
            let sim0Dist = "";
            try {
                const a = real[0];
                const s0 = sims[0];
                if (a?.location && s0?.location && a.dimension?.id && s0.dimension?.id === a.dimension.id) {
                    const dx = s0.location.x - a.location.x;
                    const dz = s0.location.z - a.location.z;
                    sim0Dist = ` sim0Dist≈${Math.sqrt(dx * dx + dz * dz).toFixed(0)}b`;
                }
            } catch { /* ignore */ }
            console.warn(
                `[SIM PLAYERS] t=${system.currentTick} real=${real.length} sim=${sims.length} merged=${merged.length} fullStress=${full} r=${rad}${sim0Dist} · spawn controller skips ghosts whose anchor chunk is unloaded`
            );
        } catch { /* ignore */ }
    }, SIM_PLAYERS_DEBUG_INTERVAL_TICKS);
} catch { /* ignore */ }

