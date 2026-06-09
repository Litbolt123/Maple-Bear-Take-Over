/**
 * Dev-only: village / entity-query perf diagnostics (zero-bear standdown, villager defer).
 * Journal → Debug → Entity query / village perf.
 */

import { world, system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { INCLUDE_FULL_DEVELOPER_TOOLS } from "./mb_buildConfig.js";
import { CHAT_INFO, CHAT_SUCCESS, CHAT_WARNING } from "./mb_chatColors.js";
import { DEV_BTN_BACK, devBtnBackTo, devBtnParen } from "./mb_devFormUi.js";
import { getPlayerProperty, setPlayerProperty, saveAllProperties, flushPlayerPropertyToDisk } from "./mb_dynamicPropertyHandler.js";
import { getCurrentDay } from "./mb_dayTracker.js";
import {
    buildDayZeroBisectStatusLines,
    getDayZeroBisectDebugOneLiner,
    DAY0_BISECT_MENU_ORDER,
    DAY0_BISECT_SHORT,
    isDayZeroBisectCategoryEnabled,
    isDayZeroBisectEligible,
    isDayZeroBisectModeActive,
    setAllDayZeroBisectCategories,
    setDayZeroBisectCategoryEnabled,
    setDayZeroBisectModeActive,
    shouldSleepDayZeroWorldWork
} from "./mb_dayZeroPerfBisect.js";
import { getEntityQueryGateDebugSnapshot } from "./mb_entityQueryGate.js";
import {
    isVillagerSuppressionEnabled,
    toggleVillagerSuppressionEnabled
} from "./mb_villagerSpawnPolicy.js";
import { resetAbandonedVillageNotifyFlagsForPlayer } from "./mb_abandonedVillageNotify.js";
import { AV_DEBUG_LOG_ALL, AV_DEBUG_LOG_CAT } from "./mb_avDebugLog.js";
import {
    clearAbandonedVillageChunkCache,
    devPlaceAbandonedVillageAtPlayer,
    resetAbandonedVillageSiteAtWorld,
    FORCE_PLACE_RULESET_TIERS,
    FORCE_SINGLE_BUILDING_MENU,
    forcePlaceAbandonedVillageAtPlayer,
    forcePlaceAbandonedVillageCompareAtPlayer,
    forcePlaceHousePlanAtPlayer,
    placeStarterSetForExportAtPlayer,
    forcePlaceStructureCatalogAtPlayer,
    formatAbandonedVillageLogCategoriesReport,
    getAbandonedVillageDebugReport,
    isAbandonedVillageDebugChatEnabled,
    isAbandonedVillageDebugLogEnabled,
    isAbandonedVillageLogCategoryEnabled,
    logAbandonedVillageDiagnosticsToContentLog,
    setAbandonedVillageDebugChatEnabled,
    setAbandonedVillageDebugLogEnabled,
    setAbandonedVillageDebugLogMask,
    setAbandonedVillageLogCategoryEnabled
} from "./mb_abandonedVillageWorldgen.js";
import { HOUSE_VARIANT_COUNT, listHouseShellSummaries } from "./mb_settlementStructures.js";
import { getBearSnapshotDebug } from "./mb_bearSnapshot.js";
import {
    ACTION_BAR_SLOT,
    setHudActionBarSegment,
    clearHudActionBarSegment
} from "./mb_actionBarHud.js";
import {
    getVillagerBurstDeferTicksRemaining,
    getVillagerPressureTicksRemaining,
    getVillagerSpawnSpreadTicksRemaining,
    getRecentVillagerSpawnCount,
    getVillagerSpawnsThisTick,
    isAnyChunkEdgeDeferActive,
    isEntityQuerySpreadActive,
    isSpreadThrottleActive,
    isVillagerBurstDeferActive,
    isVillageEntitySpreadActive,
    shouldDeferVillageBurst
} from "./mb_workSpread.js";
import { getPlayerThriftTier } from "./mb_performanceProfile.js";
import {
    registerEntityQueryTraceLogChecker,
    buildEntityQueryTraceReportLines,
    flushEntityQueryTraceToLog,
    resetEntityQueryTraceStats
} from "./mb_entityQueryTraceDev.js";

registerEntityQueryTraceLogChecker(() => isAnyEntityQueryLogEnabled());

const MB_DEV_HUD_ENTITY_QUERY_PLAYER = "mb_dev_hud_entity_query";
const MB_DEV_LOG_ENTITY_QUERY_PLAYER = "mb_dev_log_entity_query";

const LOG_INTERVAL_TICKS = 40;
/** Still log during villager defer, but less often (defer would otherwise silence all lines). */
const LOG_INTERVAL_TICKS_DURING_DEFER = 80;

/** @type {Map<string, number>} */
const lastLogTickByPlayer = new Map();

/** @returns {boolean} Any player has entity-query Content Log enabled. */
export function isAnyEntityQueryLogEnabled() {
    try {
        for (const pl of world.getAllPlayers()) {
            if (pl?.isValid && isEntityQueryLogPersonalEnabled(pl)) return true;
        }
    } catch {
        /* ignore */
    }
    return false;
}

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
export function isEntityQueryHudPersonalEnabled(player) {
    return readPlayerHudBool(player, MB_DEV_HUD_ENTITY_QUERY_PLAYER);
}

/** @param {import("@minecraft/server").Player} player */
export function isEntityQueryLogPersonalEnabled(player) {
    return readPlayerHudBool(player, MB_DEV_LOG_ENTITY_QUERY_PLAYER);
}

/** @param {import("@minecraft/server").Player} player */
export function isEntityQueryHudEnabledForPlayer(player) {
    if (!INCLUDE_FULL_DEVELOPER_TOOLS || !player?.isValid) return false;
    return isEntityQueryHudPersonalEnabled(player);
}

/**
 * @param {boolean} enabled
 * @param {import("@minecraft/server").Player} togglingPlayer
 */
export function setEntityQueryHudPersonalEnabled(enabled, togglingPlayer) {
    if (!togglingPlayer?.isValid) return;
    try {
        setPlayerProperty(togglingPlayer, MB_DEV_HUD_ENTITY_QUERY_PLAYER, enabled ? 1 : 0);
        flushPlayerPropertyToDisk(togglingPlayer, MB_DEV_HUD_ENTITY_QUERY_PLAYER);
    } catch { /* ignore */ }
    if (!enabled) {
        try {
            clearHudActionBarSegment(togglingPlayer, ACTION_BAR_SLOT.ENTITY_QUERY);
        } catch { /* ignore */ }
    }
}

/**
 * @param {boolean} enabled
 * @param {import("@minecraft/server").Player} togglingPlayer
 */
export function setEntityQueryLogPersonalEnabled(enabled, togglingPlayer) {
    if (!togglingPlayer?.isValid) return;
    try {
        setPlayerProperty(togglingPlayer, MB_DEV_LOG_ENTITY_QUERY_PLAYER, enabled ? 1 : 0);
    } catch { /* ignore */ }
    if (enabled) {
        lastLogTickByPlayer.set(togglingPlayer.id, -999999);
        emitEntityQueryLog(togglingPlayer.name, ["periodic log enabled — Content Log only"]);
        resetEntityQueryTraceStats();
        try {
            togglingPlayer.sendMessage(
                CHAT_INFO +
                    "Entity-query log on. Content Log: [ENTITY QUERY] ~2s, [ENTITY TRACE] per query (budgeted), [VILLAGER SPAWN] on eggs."
            );
        } catch { /* ignore */ }
    }
}

/** Ultra-short action bar line (fits narrow screens). */
export function formatEntityQueryHudSegment(gate) {
    let s = `§8Q§r§f${gate.bears}`;
    if (gate.standdown) s += ` §aS${gate.standdownTicks}`;
    const vil = getVillagerBurstDeferTicksRemaining();
    if (vil > 0) s += ` §eV${vil}`;
    const burst = getVillagerSpawnsThisTick();
    if (burst > 0) s += ` §c+${burst}`;
    if (gate.dormant) s += " §bd";
    if (isAnyChunkEdgeDeferActive()) s += " §8C";
    return s;
}

/** @returns {string[]} */
export function buildEntityQueryDebugReportLines() {
    const gate = getEntityQueryGateDebugSnapshot();
    const snaps = getBearSnapshotDebug();
    let day = "?";
    try {
        day = String(getCurrentDay());
    } catch { /* ignore */ }

    const spread = [];
    if (isSpreadThrottleActive()) spread.push("d0-1");
    if (isVillageEntitySpreadActive()) spread.push("vilSpr");
    if (isEntityQuerySpreadActive()) spread.push("grid");
    if (!spread.length) spread.push("norm");

    const lines = [
        getDayZeroBisectDebugOneLiner(),
        `d${day} thr${getPlayerThriftTier()} [${spread.join(",")}]`,
        `b${gate.bears} SD=${gate.standdown ? gate.standdownTicks + "t" : "off"} mobSkip=${gate.mobCacheSkip} early=${gate.earlyZeroBear ? 1 : 0} dorm=${gate.dormant} sk=${gate.snapshotSkips}/${gate.mobSkips}/${gate.querySkips ?? 0}/${gate.dormantSkips}`,
        `vil=${getVillagerBurstDeferTicksRemaining()}t entityQuiet=${gate.villagerMuteTicks}t M=${gate.miningBears} P=${getVillagerPressureTicksRemaining()}t S=${getVillagerSpawnSpreadTicksRemaining()}t r${getRecentVillagerSpawnCount()} ` +
            `chunk=${isAnyChunkEdgeDeferActive()} defer=${shouldDeferVillageBurst("r")} batch=${getVillagerSpawnsThisTick()}`
    ];
    for (const row of snaps) {
        lines.push(`snap ${row.dim}: ${row.total} bears age ${system.currentTick - row.tick}t`);
    }
    if (!snaps.length) lines.push("snap: none");
    for (const tline of buildEntityQueryTraceReportLines()) {
        lines.push(`tr ${tline}`);
    }
    return lines;
}

function emitEntityQueryLog(playerLabel, lines) {
    const who = playerLabel ? `${playerLabel}: ` : "";
    for (const line of lines) {
        console.warn(`[ENTITY QUERY] ${who}${line}`);
    }
}

function tickEntityQueryLogs() {
    const now = system.currentTick;
    const interval = shouldDeferVillageBurst("entityQueryLog")
        ? LOG_INTERVAL_TICKS_DURING_DEFER
        : LOG_INTERVAL_TICKS;
    for (const pl of world.getAllPlayers()) {
        if (!pl?.isValid || !isEntityQueryLogPersonalEnabled(pl)) continue;
        const last = lastLogTickByPlayer.get(pl.id) ?? -999999;
        if (now - last < interval) continue;
        lastLogTickByPlayer.set(pl.id, now);
        emitEntityQueryLog(pl.name, buildEntityQueryDebugReportLines());
    }
}

export function refreshEntityQueryHudOverlay() {
    try {
        if (shouldSleepDayZeroWorldWork("entity_query_hud")) return;
        const allPlayers = world.getAllPlayers();
        if (!allPlayers?.length) return;
        if (!INCLUDE_FULL_DEVELOPER_TOOLS) {
            for (const pl of allPlayers) {
                if (pl?.isValid) clearHudActionBarSegment(pl, ACTION_BAR_SLOT.ENTITY_QUERY);
            }
            return;
        }
        const gate = getEntityQueryGateDebugSnapshot();
        let anyHud = false;
        for (const pl of allPlayers) {
            if (!pl?.isValid) continue;
            if (isEntityQueryHudEnabledForPlayer(pl)) anyHud = true;
        }
        if (!anyHud) {
            for (const pl of allPlayers) {
                if (pl?.isValid) clearHudActionBarSegment(pl, ACTION_BAR_SLOT.ENTITY_QUERY);
            }
        } else {
            const line = formatEntityQueryHudSegment(gate);
            for (const pl of allPlayers) {
                if (!pl?.isValid) continue;
                if (!isEntityQueryHudEnabledForPlayer(pl)) {
                    clearHudActionBarSegment(pl, ACTION_BAR_SLOT.ENTITY_QUERY);
                    continue;
                }
                try {
                    setHudActionBarSegment(pl, ACTION_BAR_SLOT.ENTITY_QUERY, line);
                } catch {
                    clearHudActionBarSegment(pl, ACTION_BAR_SLOT.ENTITY_QUERY);
                }
            }
        }
        tickEntityQueryLogs();
    } catch { /* ignore */ }
}

let entityQueryHudWatchStarted = false;

export function initializeEntityQueryDebugHudWatch() {
    if (entityQueryHudWatchStarted) return;
    entityQueryHudWatchStarted = true;
    system.runInterval(() => {
        try {
            refreshEntityQueryHudOverlay();
        } catch { /* ignore */ }
    }, 10);
}

function hudToggleLabel(on) {
    return on
        ? `§cTurn off §2§lmy§r §fentity-query HUD${devBtnParen("action bar")}`
        : `§aTurn on §2§lmy§r §fentity-query HUD${devBtnParen("action bar")}`;
}

function logToggleLabel(on) {
    return on
        ? `§cTurn off §2§lmy§r §fContent log${devBtnParen("~2s")}`
        : `§aTurn on §2§lmy§r §fContent log${devBtnParen("~2s")}`;
}

/**
 * @param {import("@minecraft/server").Player} player
 * @param {() => void} onBack
 */
export function openDayZeroBisectMenu(player, onBack) {
    if (!INCLUDE_FULL_DEVELOPER_TOOLS || !player?.isValid) {
        if (typeof onBack === "function") onBack();
        return;
    }

    const eligible = isDayZeroBisectEligible();
    const modeOn = isDayZeroBisectModeActive();
    const status = buildDayZeroBisectStatusLines().join("\n");

    const form = new ActionFormData()
        .title("§6Day 0 perf bisect")
        .body(
            "§7Find spawn lag: §e[E]§7 = entity hooks. Tap one row to enable §fonly§7 that row.\n\n" +
                status +
                "\n\n§8Reload not required. Test dispensers after each change."
        );

    form.button(modeOn ? "§cBisect mode OFF (normal addon)" : "§aBisect mode ON");
    form.button("§aAll OFF (entity-blind)");
    form.button("§cAll systems ON (full addon)");
    if (eligible && modeOn) {
        for (const id of DAY0_BISECT_MENU_ORDER) {
            const on = isDayZeroBisectCategoryEnabled(id);
            const short = DAY0_BISECT_SHORT[id] ?? id;
            form.button(`${on ? "§aONLY" : "§coff"} §f${short}`);
        }
    }
    form.button(DEV_BTN_BACK);

    const categoryList = eligible && modeOn ? DAY0_BISECT_MENU_ORDER : [];
    const backIndex = 3 + categoryList.length;

    form.show(player).then((res) => {
        if (!res || res.canceled || res.selection === backIndex) {
            if (typeof onBack === "function") onBack();
            return;
        }
        if (res.selection === 0) {
            setDayZeroBisectModeActive(!modeOn);
            try {
                saveAllProperties();
            } catch {
                /* ignore */
            }
            try {
                player.sendMessage(
                    CHAT_SUCCESS + (modeOn ? "Day 0 bisect off — normal addon on day 0." : "Day 0 bisect on.")
                );
            } catch {
                /* ignore */
            }
            return openDayZeroBisectMenu(player, onBack);
        }
        if (res.selection === 1) {
            setDayZeroBisectModeActive(true);
            setAllDayZeroBisectCategories(false);
            try {
                saveAllProperties();
            } catch {
                /* ignore */
            }
            try {
                player.sendMessage(
                    CHAT_SUCCESS +
                        "Entity-blind + all loops off. Tap one [E] or world row to test only that piece."
                );
            } catch {
                /* ignore */
            }
            return openDayZeroBisectMenu(player, onBack);
        }
        if (res.selection === 2) {
            setDayZeroBisectModeActive(true);
            setAllDayZeroBisectCategories(true);
            try {
                saveAllProperties();
            } catch {
                /* ignore */
            }
            try {
                player.sendMessage(CHAT_WARNING + "All day-0 systems ON. Should match full-addon lag.");
            } catch {
                /* ignore */
            }
            return openDayZeroBisectMenu(player, onBack);
        }
        const catIndex = res.selection - 3;
        const catId = categoryList[catIndex];
        if (catId) {
            const wasOn = isDayZeroBisectCategoryEnabled(catId);
            if (!wasOn) {
                for (const id of DAY0_BISECT_MENU_ORDER) {
                    setDayZeroBisectCategoryEnabled(id, id === catId);
                }
                try {
                    player.sendMessage(
                        CHAT_INFO + `Only §f${DAY0_BISECT_SHORT[catId] ?? catId}§7 ON — test spawn, then try the next row.`
                    );
                } catch {
                    /* ignore */
                }
            } else {
                setDayZeroBisectCategoryEnabled(catId, false);
            }
            try {
                saveAllProperties();
            } catch {
                /* ignore */
            }
        }
        return openDayZeroBisectMenu(player, onBack);
    }).catch(() => {
        if (typeof onBack === "function") onBack();
    });
}

const HOUSE_PLAN_MENU_PAGE_SIZE = 12;

/** @type {Map<string, boolean>} */
const avForcePlaceCompareByPlayer = new Map();

/** @param {import("@minecraft/server").Player} player */
function isAvForcePlaceCompare(player) {
    return avForcePlaceCompareByPlayer.get(player.id) === true;
}

/** @param {import("@minecraft/server").Player} player */
function toggleAvForcePlaceCompare(player) {
    const next = !isAvForcePlaceCompare(player);
    avForcePlaceCompareByPlayer.set(player.id, next);
    return next;
}

/** @param {string} label */
function stripFormLabel(label) {
    return label.replace(/§./g, "");
}

/**
 * @param {import("@minecraft/server").Player} player
 * @param {{ mode: string, label: string }} pick
 * @param {import("./mb_abandonedSettlementBuilder.js").SettlementRuleset} [forceRuleset]
 * @param {boolean} compare
 */
function runAvForcePlacePreset(player, pick, forceRuleset, compare) {
    const opts = forceRuleset ? { mode: pick.mode, forceRuleset } : pick.mode;
    if (compare) return forcePlaceAbandonedVillageCompareAtPlayer(player, opts);
    return forcePlaceAbandonedVillageAtPlayer(player, opts);
}

/**
 * @param {import("@minecraft/server").Player} player
 * @param {() => void} onBack
 * @param {import("./mb_abandonedSettlementBuilder.js").SettlementRuleset} [forceRuleset]
 */
function openAbandonedVillageBuildingMenu(player, onBack, forceRuleset) {
    if (!player?.isValid) return;
    const kinds = FORCE_SINGLE_BUILDING_MENU;
    const compare = isAvForcePlaceCompare(player);
    const rulesetHint = forceRuleset
        ? `\n§7Materials: §f${forceRuleset}§7 (biome underfoot ignored).`
        : "";
    const form = new ActionFormData()
        .title("§6Place building")
        .body(
            `§7Force one structure at your feet.${rulesetHint}\n§7Compare mode: west = pick, east = random house (5-block gap).`
        )
        .button(compare ? "§a+ Random neighbor: ON" : "§c+ Random neighbor: OFF")
        .button("§fHouse plan index…");
    for (const k of kinds) form.button(k.label);
    form.button(DEV_BTN_BACK);

    const presetOffset = 2;
    const backIdx = presetOffset + kinds.length;

    form.show(player).then((res) => {
        if (!res || res.canceled || res.selection === backIdx) {
            return openAbandonedVillageDebugMenu(player, onBack);
        }
        if (res.selection === 0) {
            const on = toggleAvForcePlaceCompare(player);
            try {
                player.sendMessage(
                    CHAT_INFO + (on ? "Compare mode ON — next place adds a random house east." : "Compare mode OFF.")
                );
            } catch {
                /* ignore */
            }
            return openAbandonedVillageBuildingMenu(player, onBack, forceRuleset);
        }
        if (res.selection === 1) {
            return openAbandonedVillageHousePlanMenu(player, onBack, 0, forceRuleset);
        }
        const pick = kinds[res.selection - presetOffset];
        if (!pick) return openAbandonedVillageBuildingMenu(player, onBack, forceRuleset);
        const ok = runAvForcePlacePreset(player, pick, forceRuleset, compare);
        if (!ok) logAbandonedVillageDiagnosticsToContentLog(player);
        try {
            const name = stripFormLabel(pick.label);
            player.sendMessage(
                CHAT_SUCCESS +
                    (ok
                        ? compare
                            ? `Compare row: ${name} + random house queued.`
                            : `${name} queued at your feet.`
                        : "Place failed — see Content Log [ABANDONED VILLAGE].")
            );
        } catch {
            /* ignore */
        }
        return openAbandonedVillageBuildingMenu(player, onBack, forceRuleset);
    }).catch(() => openAbandonedVillageDebugMenu(player, onBack));
}

/**
 * @param {import("@minecraft/server").Player} player
 * @param {() => void} onBack
 * @param {number} page
 * @param {import("./mb_abandonedSettlementBuilder.js").SettlementRuleset} [forceRuleset]
 */
function openAbandonedVillageHousePlanMenu(player, onBack, page, forceRuleset) {
    if (!player?.isValid) return;
    const compare = isAvForcePlaceCompare(player);
    const shells = listHouseShellSummaries();
    const pageCount = Math.max(1, Math.ceil(shells.length / HOUSE_PLAN_MENU_PAGE_SIZE));
    const safePage = Math.max(0, Math.min(page, pageCount - 1));
    const start = safePage * HOUSE_PLAN_MENU_PAGE_SIZE;
    const slice = shells.slice(start, start + HOUSE_PLAN_MENU_PAGE_SIZE);
    const rulesetHint = forceRuleset ? `\n§7Materials: §f${forceRuleset}§7.` : "";
    const form = new ActionFormData()
        .title(`§6House plans §f(${safePage + 1}/${pageCount})`)
        .body(
            `§7Plans §f0–${HOUSE_VARIANT_COUNT - 1}§7.${rulesetHint}\n§7Compare: §f${compare ? "ON" : "OFF"}§7 — toggle on the previous menu.`
        )
        .button(compare ? "§a+ Random neighbor: ON" : "§c+ Random neighbor: OFF");
    for (const s of slice) {
        form.button(`§f#${s.index} ${s.id} §f(${s.w}×${s.d})`);
    }
    if (safePage > 0) form.button("§f← Prev page");
    if (safePage < pageCount - 1) form.button("§fNext page →");
    form.button(DEV_BTN_BACK);

    /** @type {Array<{ action: "toggle"|"plan", shell?: typeof slice[0] }|{ action: "prev"|"next"|"back" }>} */
    const actions = [{ action: "toggle" }];
    for (const shell of slice) actions.push({ action: "plan", shell });
    if (safePage > 0) actions.push({ action: "prev" });
    if (safePage < pageCount - 1) actions.push({ action: "next" });
    actions.push({ action: "back" });

    form.show(player).then((res) => {
        if (!res || res.canceled) {
            return openAbandonedVillageBuildingMenu(player, onBack, forceRuleset);
        }
        const pick = actions[res.selection];
        if (!pick || pick.action === "back") {
            return openAbandonedVillageBuildingMenu(player, onBack, forceRuleset);
        }
        if (pick.action === "toggle") {
            toggleAvForcePlaceCompare(player);
            return openAbandonedVillageHousePlanMenu(player, onBack, safePage, forceRuleset);
        }
        if (pick.action === "prev") {
            return openAbandonedVillageHousePlanMenu(player, onBack, safePage - 1, forceRuleset);
        }
        if (pick.action === "next") {
            return openAbandonedVillageHousePlanMenu(player, onBack, safePage + 1, forceRuleset);
        }
        const shell = pick.shell;
        if (!shell) {
            return openAbandonedVillageHousePlanMenu(player, onBack, safePage, forceRuleset);
        }
        const useCompare = isAvForcePlaceCompare(player);
        const ok = forcePlaceHousePlanAtPlayer(player, shell.index, forceRuleset, useCompare);
        if (!ok) logAbandonedVillageDiagnosticsToContentLog(player);
        try {
            player.sendMessage(
                CHAT_SUCCESS +
                    (ok
                        ? useCompare
                            ? `Compare row: plan #${shell.index} (${shell.id}) + random house queued.`
                            : `Plan #${shell.index} (${shell.id}) queued at your feet.`
                        : "Place failed — see Content Log [ABANDONED VILLAGE].")
            );
        } catch {
            /* ignore */
        }
        return openAbandonedVillageHousePlanMenu(player, onBack, safePage, forceRuleset);
    }).catch(() => openAbandonedVillageBuildingMenu(player, onBack, forceRuleset));
}

/**
 * Pick hamlet / village / large for a chosen ruleset (ignores biome underfoot).
 * @param {import("@minecraft/server").Player} player
 * @param {() => void} onBack
 * @param {import("./mb_abandonedSettlementBuilder.js").SettlementRuleset} ruleset
 * @param {string} rulesetLabel
 */
function openAbandonedVillageRulesetTierMenu(player, onBack, ruleset, rulesetLabel) {
    if (!player?.isValid) return;
    const form = new ActionFormData()
        .title(`§6${rulesetLabel} village`)
        .body(`§7Force-spawn tier at your feet.\n§7Ruleset: §f${ruleset}§7 · overwrites this site cell.`)
        .button("§aHamlet")
        .button("§eVillage")
        .button("§cLarge")
        .button("§fPlace building…")
        .button(DEV_BTN_BACK);

    form.show(player).then((res) => {
        if (!res || res.canceled || res.selection === 4) {
            return openAbandonedVillageRulesetForceMenu(player, onBack);
        }
        if (res.selection === 3) {
            return openAbandonedVillageBuildingMenu(player, onBack, ruleset);
        }
        const tier =
            res.selection === 2 ? "large" : res.selection === 1 ? "village" : "hamlet";
        const ok = forcePlaceAbandonedVillageAtPlayer(player, { forceRuleset: ruleset, tier });
        if (!ok) logAbandonedVillageDiagnosticsToContentLog(player);
        try {
            player.sendMessage(
                CHAT_SUCCESS +
                    (ok
                        ? `${rulesetLabel} ${tier} queued at your feet.`
                        : "Force place failed — see Content Log [ABANDONED VILLAGE].")
            );
        } catch {
            /* ignore */
        }
        return openAbandonedVillageRulesetTierMenu(player, onBack, ruleset, rulesetLabel);
    }).catch(() => openAbandonedVillageDebugMenu(player, onBack));
}

/**
 * @param {import("@minecraft/server").Player} player
 * @param {() => void} onBack
 */
function openAbandonedVillageRulesetForceMenu(player, onBack) {
    if (!player?.isValid) return;
    const tiers = FORCE_PLACE_RULESET_TIERS;
    const form = new ActionFormData()
        .title("§6Force by biome style")
        .body("§7Pick a ruleset, then hamlet / village / large.\n§7Works on any overworld block; materials match the style.")
        .button(DEV_BTN_BACK);
    for (const t of tiers) form.button(`${t.color}${t.label}`);

    form.show(player).then((res) => {
        if (!res || res.canceled || res.selection === 0) {
            return openAbandonedVillageDebugMenu(player, onBack);
        }
        const pick = tiers[res.selection - 1];
        if (!pick) return openAbandonedVillageDebugMenu(player, onBack);
        return openAbandonedVillageRulesetTierMenu(player, onBack, pick.ruleset, pick.label);
    }).catch(() => openAbandonedVillageDebugMenu(player, onBack));
}

/**
 * Per-category Content Log toggles for abandoned villages.
 * @param {import("@minecraft/server").Player} player
 * @param {() => void} onBack
 */
function openAbandonedVillageLogCategoriesMenu(player, onBack) {
    if (!player?.isValid) return;

    const rows = [
        { key: "Scans", cat: AV_DEBUG_LOG_CAT.SCANS },
        { key: "Activation", cat: AV_DEBUG_LOG_CAT.ACTIVATION },
        { key: "Build", cat: AV_DEBUG_LOG_CAT.BUILD },
        { key: "Success", cat: AV_DEBUG_LOG_CAT.SUCCESS },
        { key: "Failures", cat: AV_DEBUG_LOG_CAT.FAILURES },
        { key: "Lamp cleanup", cat: AV_DEBUG_LOG_CAT.LAMP }
    ];

    const form = new ActionFormData()
        .title("§6Content Log categories")
        .body(
            `${formatAbandonedVillageLogCategoriesReport()}\n\n§7Master switch on the previous menu. With master OFF, only §cFailures§7 still write to the log.\n§8New worlds: §7Scans default §7off§8 — turn on here for horizon Scan #N lines.`
        );

    for (const row of rows) {
        const on = isAbandonedVillageLogCategoryEnabled(row.cat);
        form.button(on ? `§c${row.key} OFF` : `§a${row.key} ON`);
    }
    form.button("§aAll categories ON");
    form.button("§7All categories OFF");
    form.button(DEV_BTN_BACK);

    const backIndex = rows.length + 2;

    form.show(player).then((res) => {
        if (!res || res.canceled || res.selection === backIndex) {
            return openAbandonedVillageDebugMenu(player, onBack);
        }
        if (res.selection === rows.length) {
            setAbandonedVillageDebugLogMask(AV_DEBUG_LOG_ALL);
        } else if (res.selection === rows.length + 1) {
            setAbandonedVillageDebugLogMask(0);
        } else if (res.selection >= 0 && res.selection < rows.length) {
            const row = rows[res.selection];
            setAbandonedVillageLogCategoryEnabled(row.cat, !isAbandonedVillageLogCategoryEnabled(row.cat));
        }
        try {
            saveAllProperties();
        } catch {
            /* ignore */
        }
        try {
            player.sendMessage(CHAT_INFO + "Abandoned village log categories updated.");
        } catch {
            /* ignore */
        }
        return openAbandonedVillageLogCategoriesMenu(player, onBack);
    }).catch(() => openAbandonedVillageDebugMenu(player, onBack));
}

/**
 * Abandoned village placement debug (journal).
 * @param {import("@minecraft/server").Player} player
 * @param {() => void} onBack
 */
export function openAbandonedVillageDebugMenu(player, onBack) {
    if (!INCLUDE_FULL_DEVELOPER_TOOLS) {
        try {
            player.sendMessage(CHAT_WARNING + "Abandoned village debug is only in the dev behavior pack.");
        } catch {
            /* ignore */
        }
        if (typeof onBack === "function") onBack();
        return;
    }
    if (!player?.isValid) return;

    const chatOn = isAbandonedVillageDebugChatEnabled();
    const logOn = isAbandonedVillageDebugLogEnabled();
    const form = new ActionFormData()
        .title("§6Abandoned villages")
        .body(getAbandonedVillageDebugReport(player))
        .button(`§aHamlet test${devBtnParen("at feet")}`)
        .button(`§eVillage test${devBtnParen("at feet")}`)
        .button(`§cLarge village${devBtnParen("at feet")}`)
        .button(`§bStarter set for export${devBtnParen("Y200 · plains")}`)
        .button("§fForce by biome style…")
        .button("§fPlace building…")
        .button("§fDump to Content Log")
        .button(logOn ? "§cContent Log OFF" : "§aContent Log ON")
        .button("§fContent Log categories…")
        .button(chatOn ? "§cChat mirror OFF" : "§aChat mirror ON")
        .button("§eClear chunk cache")
        .button("§eReset site grid underfoot")
        .button("§fReset my village title flags")
        .button("§bRefresh")
        .button(DEV_BTN_BACK);

    form.show(player).then((res) => {
        if (!res || res.canceled || res.selection === 14) {
            if (typeof onBack === "function") onBack();
            return;
        }
        if (res.selection === 0) {
            const ok = forcePlaceAbandonedVillageAtPlayer(player, "hamlet");
            if (!ok) {
                logAbandonedVillageDiagnosticsToContentLog(player);
            }
            try {
                player.sendMessage(
                    CHAT_SUCCESS +
                        (ok
                            ? "Hamlet test queued at your feet — builds over a few seconds."
                            : "Test place failed — see Content Log [ABANDONED VILLAGE].")
                );
            } catch {
                /* ignore */
            }
            return openAbandonedVillageDebugMenu(player, onBack);
        }
        if (res.selection === 1) {
            const ok = forcePlaceAbandonedVillageAtPlayer(player, "village");
            if (!ok) {
                logAbandonedVillageDiagnosticsToContentLog(player);
            }
            try {
                player.sendMessage(
                    CHAT_SUCCESS +
                        (ok
                            ? "Village test queued at your feet — phased build."
                            : "Test place failed — see Content Log [ABANDONED VILLAGE].")
                );
            } catch {
                /* ignore */
            }
            return openAbandonedVillageDebugMenu(player, onBack);
        }
        if (res.selection === 2) {
            const ok = forcePlaceAbandonedVillageAtPlayer(player, "large");
            if (!ok) {
                logAbandonedVillageDiagnosticsToContentLog(player);
            }
            try {
                player.sendMessage(
                    CHAT_SUCCESS +
                        (ok
                            ? "Large village queued at your feet — 13 buildings, phased build."
                            : "Test place failed — see Content Log [ABANDONED VILLAGE].")
                );
            } catch {
                /* ignore */
            }
            return openAbandonedVillageDebugMenu(player, onBack);
        }
        if (res.selection === 3) {
            const ok = placeStarterSetForExportAtPlayer(player);
            if (!ok) logAbandonedVillageDiagnosticsToContentLog(player);
            try {
                player.sendMessage(
                    CHAT_SUCCESS +
                        (ok
                            ? "Starter set for export queued — Y=200, one pad per building. Content Log has biome+variant filenames."
                            : "Starter set failed — see Content Log [ABANDONED VILLAGE].")
                );
            } catch {
                /* ignore */
            }
            return openAbandonedVillageDebugMenu(player, onBack);
        }
        if (res.selection === 4) {
            return openAbandonedVillageRulesetForceMenu(player, onBack);
        }
        if (res.selection === 5) {
            return openAbandonedVillageBuildingMenu(player, onBack);
        }
        if (res.selection === 6) {
            logAbandonedVillageDiagnosticsToContentLog(player);
            try {
                player.sendMessage(CHAT_INFO + "Abandoned village snapshot written to Content Log.");
            } catch {
                /* ignore */
            }
            return openAbandonedVillageDebugMenu(player, onBack);
        }
        if (res.selection === 7) {
            setAbandonedVillageDebugLogEnabled(!logOn);
            try {
                saveAllProperties();
            } catch {
                /* ignore */
            }
            try {
                player.sendMessage(
                    CHAT_INFO +
                        (logOn
                            ? "Abandoned village Content Log OFF (Failures category still logs)."
                            : "Abandoned village Content Log ON — use Log categories for scans vs build, etc.")
                );
            } catch {
                /* ignore */
            }
            return openAbandonedVillageDebugMenu(player, onBack);
        }
        if (res.selection === 8) {
            return openAbandonedVillageLogCategoriesMenu(player, onBack);
        }
        if (res.selection === 9) {
            setAbandonedVillageDebugChatEnabled(!chatOn);
            try {
                saveAllProperties();
            } catch {
                /* ignore */
            }
            try {
                player.sendMessage(
                    CHAT_INFO + (chatOn ? "Abandoned village chat mirror OFF." : "Abandoned village chat mirror ON.")
                );
            } catch {
                /* ignore */
            }
            return openAbandonedVillageDebugMenu(player, onBack);
        }
        if (res.selection === 10) {
            clearAbandonedVillageChunkCache();
            try {
                player.sendMessage(
                    CHAT_INFO +
                        "Abandoned village cache cleared — site registry + stuck build queue flushed."
                );
            } catch {
                /* ignore */
            }
            return openAbandonedVillageDebugMenu(player, onBack);
        }
        if (res.selection === 11) {
            const loc = player.location;
            const { gx, gz } = resetAbandonedVillageSiteAtWorld(loc.x, loc.z);
            try {
                player.sendMessage(
                    CHAT_INFO +
                        `Site grid §f${gx}, ${gz}§7 reset — walk to the lamp again to trigger a fresh build.`
                );
            } catch {
                /* ignore */
            }
            return openAbandonedVillageDebugMenu(player, onBack);
        }
        if (res.selection === 12) {
            resetAbandonedVillageNotifyFlagsForPlayer(player);
            try {
                player.sendMessage(
                    CHAT_INFO +
                        "Your village title flags reset — next build shows Constructing… and first-complete flavor again."
                );
            } catch {
                /* ignore */
            }
            return openAbandonedVillageDebugMenu(player, onBack);
        }
        if (res.selection === 13) {
            return openAbandonedVillageDebugMenu(player, onBack);
        }
        if (typeof onBack === "function") onBack();
    }).catch(() => {
        if (typeof onBack === "function") onBack();
    });
}

/**
 * Script villager suppression (eggs, despawn, purge) — dev/debug journal entry.
 * @param {import("@minecraft/server").Player} player
 * @param {() => void} onBack
 */
export function openVillagerSuppressionDevMenu(player, onBack) {
    if (!player?.isValid) return;

    const suppressOn = isVillagerSuppressionEnabled();
    const form = new ActionFormData()
        .title("§eVillager suppress")
        .body(
            "§7Controls §fmb_villagerSpawnPolicy§7 on this world.\n\n" +
                `§8Script despawn: §7${suppressOn ? "§aON" : "§cOFF"}\n` +
                "§8• §7ON: block villager eggs, remove adults on spawn, periodic purge\n" +
                "§8• §7OFF: villagers can exist for lag testing\n\n" +
                "§8Does not change: §7spawn rules, wandering traders.\n" +
                "§8Abandoned villages: §7script-only placement, always zombie style (no vanilla 2% roll).\n" +
                "§8With despawn OFF: §7entity-query / villager work-spread hooks run again."
        );

    form.button(
        suppressOn
            ? "§cTurn OFF §fscript despawn"
            : "§aTurn ON §fscript despawn"
    );
    if (INCLUDE_FULL_DEVELOPER_TOOLS) {
        form.button("§6Abandoned village debug");
        form.button(`§6Place zombie village${devBtnParen("here")}`);
        form.button(`§bEntity query / village${devBtnParen("perf HUD")}`);
    }
    form.button(DEV_BTN_BACK);

    const backIdx = INCLUDE_FULL_DEVELOPER_TOOLS ? 4 : 1;

    form.show(player).then((res) => {
        if (!res || res.canceled || res.selection === backIdx) {
            if (typeof onBack === "function") onBack();
            return;
        }
        if (res.selection === 0) {
            const on = toggleVillagerSuppressionEnabled();
            try {
                saveAllProperties();
            } catch {
                /* ignore */
            }
            try {
                player.sendMessage(
                    CHAT_SUCCESS +
                        (on
                            ? "Villager script despawn ON — eggs blocked, adults removed on spawn + purge."
                            : "Villager script despawn OFF — villagers can exist (spawn rules still apply).")
                );
            } catch {
                /* ignore */
            }
            return openVillagerSuppressionDevMenu(player, onBack);
        }
        if (INCLUDE_FULL_DEVELOPER_TOOLS && res.selection === 1) {
            return openAbandonedVillageDebugMenu(player, () => openVillagerSuppressionDevMenu(player, onBack));
        }
        if (INCLUDE_FULL_DEVELOPER_TOOLS && res.selection === 2) {
            devPlaceAbandonedVillageAtPlayer(player);
            return openVillagerSuppressionDevMenu(player, onBack);
        }
        if (INCLUDE_FULL_DEVELOPER_TOOLS && res.selection === 3) {
            return openEntityQueryDebugHub(player, () => openVillagerSuppressionDevMenu(player, onBack));
        }
        if (typeof onBack === "function") onBack();
    }).catch(() => {
        if (typeof onBack === "function") onBack();
    });
}

/**
 * @param {import("@minecraft/server").Player} player
 * @param {() => void} onBack
 */
export function openEntityQueryDebugHub(player, onBack) {
    if (!INCLUDE_FULL_DEVELOPER_TOOLS) {
        try {
            player.sendMessage(CHAT_WARNING + "Entity-query debug is only in the dev behavior pack.");
        } catch { /* ignore */ }
        if (typeof onBack === "function") onBack();
        return;
    }
    if (!player?.isValid) return;

    const gate = getEntityQueryGateDebugSnapshot();
    const hudOn = isEntityQueryHudPersonalEnabled(player);
    const logOn = isEntityQueryLogPersonalEnabled(player);
    const villagerSuppressOn = isVillagerSuppressionEnabled();
    const report = buildEntityQueryDebugReportLines().join("\n§8");

    const form = new ActionFormData()
        .title("§bEntity query / village")
        .body(
            "§7HUD: §f" +
                formatEntityQueryHudSegment(gate) +
                " §8(B=bears S=standdown V=villager defer d=dormant C=chunk)\n\n" +
                `§8${report}\n\n` +
                `§8HUD: §7${hudOn ? "§aON" : "OFF"} §8Log: §7${logOn ? "§aON" : "OFF"} §8· trace+query+villager in Content Log` +
                `\n§8Villager despawn: §7${villagerSuppressOn ? "§aON §8(eggs blocked, purge active)" : "§cOFF §8(vanilla villagers allowed)"}` +
                (isDayZeroBisectModeActive() ? "\n§6Day 0 bisect: §aON" : "")
        );

    form.button("§aRefresh");
    form.button(hudToggleLabel(hudOn));
    form.button(logToggleLabel(logOn));
    form.button(`§eVillager suppress${devBtnParen("script despawn")}`);
    form.button("§dLog snapshot now");
    form.button("§eLog entity trace");
    form.button("§cClear trace stats");
    form.button(`§6Day 0 bisect${devBtnParen("find lag")}`);
    form.button(DEV_BTN_BACK);

    form.show(player).then((res) => {
        if (!res || res.canceled || res.selection === 8) {
            if (typeof onBack === "function") onBack();
            return;
        }
        switch (res.selection) {
            case 0:
                return openEntityQueryDebugHub(player, onBack);
            case 1:
                setEntityQueryHudPersonalEnabled(!hudOn, player);
                try { saveAllProperties(); } catch { /* ignore */ }
                try {
                    player.sendMessage(
                        CHAT_SUCCESS +
                            (hudOn ? "Entity-query HUD off." : "Entity-query HUD on — short line on action bar.")
                    );
                } catch { /* ignore */ }
                return openEntityQueryDebugHub(player, onBack);
            case 2:
                setEntityQueryLogPersonalEnabled(!logOn, player);
                try { saveAllProperties(); } catch { /* ignore */ }
                try {
                    player.sendMessage(
                        CHAT_SUCCESS +
                            (logOn
                                ? "Entity-query log off."
                                : "Entity-query log on — [ENTITY QUERY], [ENTITY TRACE], [VILLAGER SPAWN] in Content Log.")
                    );
                } catch { /* ignore */ }
                return openEntityQueryDebugHub(player, onBack);
            case 3:
                return openVillagerSuppressionDevMenu(player, () => openEntityQueryDebugHub(player, onBack));
            case 4: {
                emitEntityQueryLog(player.name, buildEntityQueryDebugReportLines());
                try {
                    player.sendMessage(CHAT_INFO + "[Entity query] Snapshot sent to Content Log.");
                } catch { /* ignore */ }
                return openEntityQueryDebugHub(player, onBack);
            }
            case 5: {
                flushEntityQueryTraceToLog(player.name);
                try {
                    player.sendMessage(CHAT_INFO + "[Entity trace] RUN/SKIP stats sent to Content Log.");
                } catch { /* ignore */ }
                return openEntityQueryDebugHub(player, onBack);
            }
            case 6:
                resetEntityQueryTraceStats();
                try {
                    player.sendMessage(CHAT_INFO + "Entity trace counters cleared.");
                } catch { /* ignore */ }
                return openEntityQueryDebugHub(player, onBack);
            case 7:
                return openDayZeroBisectMenu(player, () => openEntityQueryDebugHub(player, onBack));
            default:
                return openEntityQueryDebugHub(player, onBack);
        }
    }).catch(() => {
        if (typeof onBack === "function") onBack();
    });
}
