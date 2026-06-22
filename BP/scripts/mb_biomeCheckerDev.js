/**
 * Dev-only UI: check biome at feet vs infected replace_biomes targets.
 * Journal → Developer Tools → Systems → Biome checker.
 */

import { world, system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { INCLUDE_FULL_DEVELOPER_TOOLS } from "./mb_buildConfig.js";
import { CHAT_INFO, CHAT_SUCCESS, CHAT_WARNING } from "./mb_chatColors.js";
import { DEV_BTN_BACK, devBtnParen } from "./mb_devFormUi.js";
import { getPlayerProperty, setPlayerProperty, saveAllProperties, flushPlayerPropertyToDisk } from "./mb_dynamicPropertyHandler.js";
import {
    ACTION_BAR_SLOT,
    setHudActionBarSegment,
    clearHudActionBarSegment,
    getHudActiveSegmentCount
} from "./mb_actionBarHud.js";
import {
    REPLACEMENT_GROUPS,
    getBiomeCheckAtLocation,
    formatBiomeCheckLines,
    formatBiomeCheckHudSegment,
    getMissingVanillaOverworldBiomes,
    getAllReplaceTargets,
    getCatalogGapsOverworld,
    isIntentionalSafeOverworld,
} from "./mb_biomeReplaceRegistry.js";

const MB_DEV_HUD_BIOME_CHECKER_PLAYER = "mb_dev_hud_biome_checker";

const SAMPLE_OFFSETS = [
    { label: "Here", dx: 0, dz: 0 },
    { label: "N+32", dx: 0, dz: 32 },
    { label: "S-32", dx: 0, dz: -32 },
    { label: "E+32", dx: 32, dz: 0 },
    { label: "W-32", dx: -32, dz: 0 }
];

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
export function isBiomeCheckerHudPersonalEnabled(player) {
    return readPlayerHudBool(player, MB_DEV_HUD_BIOME_CHECKER_PLAYER);
}

/** @param {import("@minecraft/server").Player} player */
export function isBiomeCheckerHudEnabledForPlayer(player) {
    if (!INCLUDE_FULL_DEVELOPER_TOOLS || !player?.isValid) return false;
    return isBiomeCheckerHudPersonalEnabled(player);
}

/**
 * @param {boolean} enabled
 * @param {import("@minecraft/server").Player} togglingPlayer
 */
export function setBiomeCheckerHudPersonalEnabled(enabled, togglingPlayer) {
    if (!togglingPlayer?.isValid) return;
    try {
        setPlayerProperty(togglingPlayer, MB_DEV_HUD_BIOME_CHECKER_PLAYER, enabled ? 1 : 0);
        flushPlayerPropertyToDisk(togglingPlayer, MB_DEV_HUD_BIOME_CHECKER_PLAYER);
    } catch { /* ignore */ }
    if (!enabled) {
        try {
            clearHudActionBarSegment(togglingPlayer, ACTION_BAR_SLOT.BIOME_CHECKER);
        } catch { /* ignore */ }
    }
}

export function refreshBiomeCheckerHudOverlay() {
    try {
        const allPlayers = world.getAllPlayers();
        if (!allPlayers?.length) return;
        if (!INCLUDE_FULL_DEVELOPER_TOOLS) {
            for (const pl of allPlayers) {
                if (pl?.isValid) clearHudActionBarSegment(pl, ACTION_BAR_SLOT.BIOME_CHECKER);
            }
            return;
        }
        let anyOn = false;
        for (const pl of allPlayers) {
            if (pl?.isValid && isBiomeCheckerHudEnabledForPlayer(pl)) {
                anyOn = true;
                break;
            }
        }
        if (!anyOn) {
            for (const pl of allPlayers) {
                if (pl?.isValid) clearHudActionBarSegment(pl, ACTION_BAR_SLOT.BIOME_CHECKER);
            }
            return;
        }
        for (const pl of allPlayers) {
            if (!pl?.isValid) continue;
            if (!isBiomeCheckerHudEnabledForPlayer(pl)) {
                clearHudActionBarSegment(pl, ACTION_BAR_SLOT.BIOME_CHECKER);
                continue;
            }
            try {
                const check = getBiomeCheckAtLocation(pl.dimension, pl.location);
                const compact = getHudActiveSegmentCount(pl) >= 4;
                setHudActionBarSegment(
                    pl,
                    ACTION_BAR_SLOT.BIOME_CHECKER,
                    formatBiomeCheckHudSegment(check, compact)
                );
            } catch {
                clearHudActionBarSegment(pl, ACTION_BAR_SLOT.BIOME_CHECKER);
            }
        }
    } catch { /* ignore */ }
}

let biomeCheckerHudWatchStarted = false;

export function initializeBiomeCheckerHudWatch() {
    if (biomeCheckerHudWatchStarted) return;
    biomeCheckerHudWatchStarted = true;
    system.runInterval(() => {
        try {
            refreshBiomeCheckerHudOverlay();
        } catch { /* ignore */ }
    }, 10);
}

function logLines(player, title, lines) {
    console.warn(`[BIOME CHECKER] ${title}`);
    for (const line of lines) {
        console.warn(`[BIOME CHECKER] ${line.replace(/§./g, "")}`);
    }
    try {
        player.sendMessage(`${CHAT_INFO}[Biome checker] ${title} — see Content Log`);
    } catch { /* ignore */ }
}

function formatIdList(ids, max = 12) {
    const preview = ids
        .slice(0, max)
        .map((id) => `§7• §f${id.replace("minecraft:", "")}`)
        .join("\n");
    const more = ids.length > max ? `\n§8…and ${ids.length - max} more` : "";
    return (preview || "§8(none)") + more;
}

function biomeHudToggleLabel(on) {
    return on
        ? `§cTurn off §2§lmy§r §fbiome HUD${devBtnParen("action bar")}`
        : `§aTurn on §2§lmy§r §fbiome HUD${devBtnParen("action bar")}`;
}

/**
 * @param {import("@minecraft/server").Player} player
 * @param {() => void} onBack
 */
export function openBiomeCheckerHub(player, onBack) {
    if (!INCLUDE_FULL_DEVELOPER_TOOLS) {
        try {
            player.sendMessage(CHAT_WARNING + "Biome checker is only in the dev behavior pack.");
        } catch { /* ignore */ }
        if (typeof onBack === "function") onBack();
        return;
    }
    if (!player?.isValid) return;

    const check = getBiomeCheckAtLocation(player.dimension, player.location);
    const gaps = getCatalogGapsOverworld();
    const listed = getAllReplaceTargets("minecraft:overworld");
    const biomeHudOn = isBiomeCheckerHudPersonalEnabled(player);

    const form = new ActionFormData()
        .title("§2Biome checker")
        .body(
            "§7Compare §fgetBiome §7at your feet with §fminecraft:replace_biomes §7targets in infected biome JSON.\n\n" +
                formatBiomeCheckLines(check) +
                `\n\n§8Replace list: §7${listed.length} overworld ids` +
                `\n§bSafe by design: §7${gaps.intentionalSafe.length}` +
                ` §8· §eReview gaps: §7${gaps.unlisted.length}` +
                ` §8· §cNether/End not in JSON: §f${gaps.otherDimensionInCatalog.length}` +
                `\n§8Biome HUD: §7${biomeHudOn ? "§aON §8(merged action bar)" : "§7OFF"}` +
                "\n§8Regenerate: §7node tools/syncBiomeReplaceRegistry.cjs"
        );

    form.button(`§aRefresh${devBtnParen("at feet")}`);
    form.button(biomeHudToggleLabel(biomeHudOn));
    form.button(`§bSafe by design${devBtnParen(String(gaps.intentionalSafe.length))}`);
    form.button(`§eReview gaps${devBtnParen(String(gaps.unlisted.length))}`);
    form.button(`§cNether/End${devBtnParen(String(gaps.otherDimensionInCatalog.length))}`);
    form.button("§fBrowse replace groups");
    form.button(`§bSample 5 spots${devBtnParen("NSEW")}`);
    form.button(`§dLog all targets${devBtnParen("Content Log")}`);
    form.button(DEV_BTN_BACK);

    form.show(player).then((res) => {
        if (!res || res.canceled || res.selection === 8) {
            if (typeof onBack === "function") onBack();
            return;
        }
        switch (res.selection) {
            case 0:
                return openBiomeCheckerHub(player, onBack);
            case 1:
                setBiomeCheckerHudPersonalEnabled(!biomeHudOn, player);
                try { saveAllProperties(); } catch { /* ignore */ }
                try {
                    player.sendMessage(
                        CHAT_SUCCESS + (biomeHudOn ? "Biome checker HUD off." : "Biome checker HUD on — watch the action bar.")
                    );
                } catch { /* ignore */ }
                return openBiomeCheckerHub(player, onBack);
            case 2:
                return openBiomeIdListMenu(player, onBack, {
                    title: "§bSafe by design",
                    intro:
                        "§7These overworld biomes are §ointentionally§7 excluded from §freplace_biomes§7 (see docs/design/SAFE_BIOMES.md).\n\n",
                    ids: gaps.intentionalSafe,
                    logTitle: "Intentional safe overworld"
                });
            case 3:
                return openBiomeIdListMenu(player, onBack, {
                    title: "§eReview gaps",
                    intro:
                        "§7In the reference catalog but §not§7 on the replace list and §not§7 marked safe-by-design — add to JSON or the safe list in sync script.\n\n",
                    ids: gaps.unlisted,
                    logTitle: "Unexpected overworld catalog gaps"
                });
            case 4:
                return openBiomeIdListMenu(player, onBack, {
                    title: "§cNether / End",
                    intro:
                        "§7Ids in the dev reference catalog but §not§7 in §fmb_infected_biome_*.json§7 yet. Other dimensions are fine gameplay-wise; add §freplace_biomes§7 groups when you want infection there.\n\n",
                    ids: gaps.otherDimensionInCatalog,
                    logTitle: "Other dimension catalog (not in pack JSON)"
                });
            case 5:
                return openBiomeReplaceGroupsMenu(player, onBack);
            case 6:
                return runBiomeSampleGrid(player, onBack);
            case 7:
                logLines(player, "All replace targets", listed.map((id) => id.replace("minecraft:", "")));
                return openBiomeCheckerHub(player, onBack);
            default:
                if (typeof onBack === "function") onBack();
        }
    }).catch(() => {
        if (typeof onBack === "function") onBack();
    });
}

/**
 * @param {import("@minecraft/server").Player} player
 * @param {() => void} onBack
 * @param {{ title: string, intro: string, ids: string[], logTitle: string }} opts
 */
function openBiomeIdListMenu(player, onBack, opts) {
    const form = new ActionFormData()
        .title(opts.title)
        .body(opts.intro + formatIdList(opts.ids));
    form.button("§dLog full list");
    form.button(DEV_BTN_BACK);
    form.show(player).then((res) => {
        if (!res || res.canceled || res.selection === 1) return openBiomeCheckerHub(player, onBack);
        logLines(player, opts.logTitle, opts.ids);
        openBiomeIdListMenu(player, onBack, opts);
    }).catch(() => openBiomeCheckerHub(player, onBack));
}

/**
 * @param {import("@minecraft/server").Player} player
 * @param {() => void} onBack
 */
function openBiomeReplaceGroupsMenu(player, onBack) {
    const form = new ActionFormData()
        .title("§fReplace groups")
        .body("§7Pick a group to list target biome ids (content log + chat hint).");
    for (const g of REPLACEMENT_GROUPS) {
        form.button(`§f${g.label}`);
    }
    form.button(DEV_BTN_BACK);
    form.show(player).then((res) => {
        if (!res || res.canceled || res.selection === REPLACEMENT_GROUPS.length) {
            return openBiomeCheckerHub(player, onBack);
        }
        const g = REPLACEMENT_GROUPS[res.selection];
        if (g) {
            logLines(
                player,
                g.label,
                g.targets.map((id) => `${id.replace("minecraft:", "")} (${(g.amount * 100).toFixed(0)}%)`)
            );
        }
        openBiomeReplaceGroupsMenu(player, onBack);
    }).catch(() => openBiomeCheckerHub(player, onBack));
}

/**
 * @param {import("@minecraft/server").Player} player
 * @param {() => void} onBack
 */
function runBiomeSampleGrid(player, onBack) {
    const dim = player.dimension;
    const loc = player.location;
    const lines = [];
    for (const s of SAMPLE_OFFSETS) {
        const at = { x: loc.x + s.dx, y: loc.y, z: loc.z + s.dz };
        const c = getBiomeCheckAtLocation(dim, at);
        const short = c.biomeId?.replace("minecraft:", "") ?? "?";
        let tag = "§e?";
        if (c.infected) tag = "§dINF";
        else if (c.inReplaceList) tag = "§aLIST";
        else if (isIntentionalSafeOverworld(c.biomeId)) tag = "§bSAFE";
        else tag = "§7OTHER";
        lines.push(`${s.label}: ${tag} §f${short}`);
    }
    try {
        player.sendMessage(`${CHAT_SUCCESS}[Biome checker] Sample grid:\n${lines.join("\n")}`);
    } catch { /* ignore */ }
    logLines(player, "Sample grid", lines);
    openBiomeCheckerHub(player, onBack);
}

export { getMissingVanillaOverworldBiomes };
