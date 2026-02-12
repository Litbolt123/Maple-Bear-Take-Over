import { system, world } from "@minecraft/server";
import { ActionFormData, ModalFormData, FormCancelationReason } from "@minecraft/server-ui";
import { getPlayerProperty, setPlayerProperty, getWorldProperty, setWorldProperty, getPlayerPropertyChunked, setPlayerPropertyChunked, getWorldPropertyChunked, setWorldPropertyChunked, saveAllProperties, ADDON_DIFFICULTY_PROPERTY, getAddonDifficultyState } from "./mb_dynamicPropertyHandler.js";
import { getAllScriptToggles, setScriptEnabled, SCRIPT_IDS, isBetaInfectedAIEnabled, setBetaInfectedAIEnabled, isBetaDustStormsEnabled, setBetaDustStormsEnabled, isBetaVisibleToAll, setBetaVisibleToAll, getBetaOwnerId, setBetaOwnerId } from "./mb_scriptToggles.js";
import { recordDailyEvent, getCurrentDay, getDayDisplayInfo } from "./mb_dayTracker.js";
import { playerInfection, curedPlayers, formatTicksDuration, formatMillisDuration, HITS_TO_INFECT, bearHitCount, maxSnowLevels, MINOR_INFECTION_TYPE, MAJOR_INFECTION_TYPE, MINOR_HITS_TO_INFECT, IMMUNE_HITS_TO_INFECT, PERMANENT_IMMUNITY_PROPERTY, MINOR_CURE_GOLDEN_APPLE_PROPERTY, MINOR_CURE_GOLDEN_CARROT_PROPERTY } from "./main.js";
import { CHAT_ACHIEVEMENT, CHAT_DANGER, CHAT_SUCCESS, CHAT_WARNING, CHAT_INFO, CHAT_DEV, CHAT_HIGHLIGHT, CHAT_SPECIAL } from "./mb_chatColors.js";
import { getBuffBearCountdowns } from "./mb_buffAI.js";
import { getSpawnConfigsForDevTools, getDisabledSpawnTypes, setDisabledSpawnTypes } from "./mb_spawnController.js";
import { summonStorm, endStorm, getStormState, getStormDebugInfo, setStormOverride, resetStormOverride } from "./mb_snowStorm.js";

const SPAWN_DIFFICULTY_PROPERTY = "mb_spawnDifficulty";

function hasCheats(p) {
    return (p?.hasTag && p.hasTag("mb_cheats")) || Boolean(typeof system !== "undefined" && system?.isEnableCheats?.());
}

/** Designated owner = first player to join the world */
function isBetaOwner(p) {
    const ownerId = getBetaOwnerId();
    return ownerId != null && String(p.id) === String(ownerId);
}

/** Can edit beta settings: owner OR anyone with mb_cheats */
function canChangeBeta(p) {
    return isBetaOwner(p) || (p?.hasTag && p.hasTag("mb_cheats"));
}

/** Can see beta section: can change OR owner enabled "visible to all" */
function canSeeBeta(p) {
    return canChangeBeta(p) || isBetaVisibleToAll();
}

function getSpawnDifficultyValue() {
    let rawValue = getWorldProperty(SPAWN_DIFFICULTY_PROPERTY);
    if (typeof rawValue !== "number") {
        rawValue = 0;
    }
    return Math.max(-5, Math.min(5, rawValue));
}

export function getDefaultCodex() {
    return {
        infections: { bear: { discovered: false, firstHitAt: 0 }, snow: { discovered: false, firstUseAt: 0 }, minor: { discovered: false }, major: { discovered: false } },
        status: { immuneKnown: false, immuneUntil: 0, bearTimerSeen: false, snowTimerSeen: false },
        cures: { bearCureKnown: false, bearCureDoneAt: 0, minorCureKnown: false, minorCureDoneAt: 0 },
        history: { totalInfections: 0, totalCures: 0, firstInfectionAt: 0, lastInfectionAt: 0, lastCureAt: 0 },
        effects: {
            weaknessSeen: false,
            nauseaSeen: false,
            blindnessSeen: false,
            slownessSeen: false,
            hungerSeen: false,
            miningFatigueSeen: false
        },
        snowEffects: {
            regenerationSeen: false,
            speedSeen: false,
            jumpBoostSeen: false,
            strengthSeen: false,
            weaknessSeen: false,
            nauseaSeen: false,
            slownessSeen: false,
            blindnessSeen: false,
            hungerSeen: false,
            miningFatigueSeen: false
        },
        minorInfectionEffects: {
            slownessSeen: false,
            weaknessSeen: false
        },
        symptomsUnlocks: {
            infectionSymptomsUnlocked: false,
            snowEffectsUnlocked: false,
            snowTierAnalysisUnlocked: false,
            minorInfectionAnalysisUnlocked: false
        },
        // Aggregated metadata by effect id
        symptomsMeta: {},
        items: { snowFound: false, snowIdentified: false, snowBookCrafted: false, basicJournalSeen: false, cureItemsSeen: false, snowTier5Reached: false, snowTier10Reached: false, snowTier20Reached: false, snowTier50Reached: false, brewingStandSeen: false, bookCraftMessageShown: false, checkJournalMessageShown: false, goldenAppleSeen: false, goldenCarrotSeen: false, enchantedGoldenAppleSeen: false, goldenAppleInfectionReductionDiscovered: false, goldSeen: false, goldNuggetSeen: false },
        mobs: { 
            mapleBearSeen: false, 
            infectedBearSeen: false, 
            infectedPigSeen: false, 
            infectedCowSeen: false,
            buffBearSeen: false,
            flyingBearSeen: false,
            miningBearSeen: false,
            torpedoBearSeen: false,
            tinyBearKills: 0,
            infectedBearKills: 0,
            infectedPigKills: 0,
            infectedCowKills: 0,
            buffBearKills: 0,
            flyingBearKills: 0,
            miningBearKills: 0,
            torpedoBearKills: 0,
            tinyBearMobKills: 0,
            infectedBearMobKills: 0,
            infectedPigMobKills: 0,
            infectedCowMobKills: 0,
            buffBearMobKills: 0,
            flyingBearMobKills: 0,
            miningBearMobKills: 0,
            torpedoBearMobKills: 0,
            tinyBearHits: 0,
            infectedBearHits: 0,
            infectedPigHits: 0,
            infectedCowHits: 0,
            buffBearHits: 0,
            flyingBearHits: 0,
            miningBearHits: 0,
            torpedoBearHits: 0,
            // Day variant unlock tracking
            day4VariantsUnlocked: false,
            day8VariantsUnlocked: false,
            day13VariantsUnlocked: false,
            day20VariantsUnlocked: false,
            // Individual bear type unlock flags for Day 4+
            day4VariantsUnlockedTiny: false,
            day4VariantsUnlockedInfected: false,
            day4VariantsUnlockedBuff: false,
            day4VariantsUnlockedOther: false,
            // Message tracking flags to prevent repeated messages
            day4MessageShownTiny: false,
            day4MessageShownInfected: false,
            day4MessageShownBuff: false,
            day4MessageShownOther: false,
            // Individual bear type unlock flags for Day 8+
            day8VariantsUnlockedTiny: false,
            day8VariantsUnlockedInfected: false,
            day8VariantsUnlockedBuff: false,
            day8VariantsUnlockedOther: false,
            // Message tracking flags for Day 8+
            day8MessageShown: false,
            // Individual bear type unlock flags for Day 13+
            day13VariantsUnlockedTiny: false,
            day13VariantsUnlockedInfected: false,
            day13VariantsUnlockedBuff: false,
            day13VariantsUnlockedOther: false,
            // Message tracking flags for Day 13+
            day13MessageShown: false,
            // Individual bear type unlock flags for Day 20+
            day20VariantsUnlockedTiny: false,
            day20VariantsUnlockedInfected: false,
            day20VariantsUnlockedBuff: false,
            day20VariantsUnlockedOther: false,
            // Message tracking flags for Day 20+
            day20MessageShown: false
        },
        biomes: {
            infectedBiomeSeen: false,
            dustedDirtSeen: false,
            snowLayerSeen: false,
            dustedDirtGroundEffectSeen: false,
            snowLayerGroundEffectSeen: false,
            biomeAmbientPressureSeen: false,
            minorToMajorFromGround: false, // Minor infection converted to major from ground exposure
            majorGroundWarningSeen: false, // Major infection warning from ground exposure
            majorSnowIncreaseFromGround: false, // Snow level increased from ground exposure with major infection
            stormSeen: false,
            stormMinorSeen: false,
            stormMajorSeen: false
        },
        knowledge: {
            // Knowledge levels: 0 = no knowledge, 1 = basic awareness, 2 = understanding, 3 = expert
            infectionLevel: 0,        // Knowledge about the infection itself
            bearLevel: 0,            // Knowledge about Maple Bears
            biomeLevel: 0,           // Knowledge about biomes and infection spread
            cureLevel: 0,            // Knowledge about cures
            snowLevel: 0             // Knowledge about snow and its effects
        },
        journal: {
            day20TinyLoreUnlocked: false,
            day20InfectedLoreUnlocked: false,
            day20BuffLoreUnlocked: false,
            day20WorldLoreUnlocked: false,
            sectionLastUnlock: {},
            sectionLastViewed: {},
            subsectionLastUnlock: {},
            subsectionLastViewed: {},
            hasOpenedBefore: false
        },
        biomeData: {} // Will store biome-specific infection data as discovered
    };
}

export function getCodex(player) {
    try {
        const raw = getPlayerPropertyChunked(player, "mb_codex");
        if (!raw) return getDefaultCodex();
        const parsed = JSON.parse(raw);
        return { ...getDefaultCodex(), ...parsed };
    } catch (e) {
        return getDefaultCodex();
    }
}

export function saveCodex(player, codex) {
    try {
        setPlayerPropertyChunked(player, "mb_codex", JSON.stringify(codex));
    } catch (e) {
        console.warn('Failed to save codex:', e);
    }
}

/**
 * Get player's sound volume multiplier (0-1)
 * Checks Basic Journal settings first, then falls back to codex settings
 * @param {Player} player - The player to get sound volume for
 * @returns {number} Volume multiplier between 0-1, defaults to 1.0
 */
export function getPlayerSoundVolume(player) {
    try {
        // Check Basic Journal settings first (world dynamic property)
        const settingsKey = `mb_player_settings_${player.id}`;
        const rawSettings = getWorldPropertyChunked(settingsKey);
        
        if (rawSettings) {
            let parsedSettings = rawSettings;
            if (typeof rawSettings === 'string') {
                try {
                    parsedSettings = JSON.parse(rawSettings);
                } catch (e) {
                    // If parsing fails, continue to codex check
                }
            }
            
            if (parsedSettings && typeof parsedSettings === 'object' && typeof parsedSettings.soundVolume === 'number') {
                return Math.max(0, Math.min(1, parsedSettings.soundVolume));
            }
        }
        
        // Fall back to codex settings
        const codex = getCodex(player);
        if (codex.settings && typeof codex.settings.soundVolume === 'number') {
            return Math.max(0, Math.min(1, codex.settings.soundVolume));
        }
        
        // Default to 1.0 if not set
        return 1.0;
    } catch (error) {
        console.warn(`[SOUND VOLUME] Error getting sound volume for ${player.name}:`, error);
        return 1.0;
    }
}

/**
 * Get player settings used by main/dayTracker (infection timer, critical warnings only).
 * Infection timer is Powdery-only; critical warnings can come from Basic or codex.
 * @param {Player} player
 * @returns {{ showInfectionTimer: boolean, criticalWarningsOnly: boolean }}
 */
export function getPlayerSettings(player) {
    try {
        const codex = getCodex(player);
        const s = codex?.settings;
        // Infection timer: Powdery Journal only (not in Basic Journal)
        const showInfectionTimer = Boolean(s?.showInfectionTimer);
        const settingsKey = `mb_player_settings_${player.id}`;
        const raw = getWorldPropertyChunked(settingsKey);
        if (raw) {
            let parsed = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
            if (parsed && typeof parsed === 'object') {
                const fromParsed = {
                    showInfectionTimer: ('showInfectionTimer' in parsed) ? Boolean(parsed.showInfectionTimer) : showInfectionTimer,
                    criticalWarningsOnly: ('criticalWarningsOnly' in parsed) ? Boolean(parsed.criticalWarningsOnly) : Boolean(s?.criticalWarningsOnly),
                    stormParticles: typeof parsed.stormParticles === 'number' ? Math.max(0, Math.min(2, parsed.stormParticles)) : (s?.stormParticles ?? 0)
                };
                return fromParsed;
            }
        }
        return {
            showInfectionTimer,
            criticalWarningsOnly: Boolean(s?.criticalWarningsOnly),
            stormParticles: s?.stormParticles ?? 0
        };
    } catch (e) {
        return { showInfectionTimer: false, criticalWarningsOnly: false, stormParticles: 0 };
    }
}

/** Get storm particle density (0=Low, 1=Medium, 2=High) - uses max of all players in dimension */
export function getStormParticleDensity(dimension) {
    try {
        const players = dimension?.getPlayers?.() ?? [];
        if (players.length === 0) return 0;
        let max = 0;
        for (const p of players) {
            const s = getPlayerSettingsFull(p);
            const v = typeof s?.stormParticles === 'number' ? Math.max(0, Math.min(2, s.stormParticles)) : 0;
            if (v > max) max = v;
        }
        return max;
    } catch { return 0; }
}

function getPlayerSettingsFull(player) {
    try {
        const codex = getCodex(player);
        const s = codex?.settings;
        const settingsKey = `mb_player_settings_${player.id}`;
        const raw = getWorldPropertyChunked(settingsKey);
        let stormParticles = s?.stormParticles ?? 0;
        if (raw) {
            const parsed = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
            if (parsed && typeof parsed === 'object') {
                if ('stormParticles' in parsed) stormParticles = Math.max(0, Math.min(2, Number(parsed.stormParticles) || 0));
            }
        }
        return { ...s, stormParticles };
    } catch { return { stormParticles: 0 }; }
}

/** Map codex path prefix to main menu section id for new/updated tracking */
function getSectionForPath(path) {
    const top = path.split(".")[0];
    if (top === "infections" || top === "cures" || top === "status") return "infection";
    if (top === "effects" || top === "snowEffects" || top === "symptomsUnlocks" || top === "minorInfectionEffects") return "symptoms";
    if (top === "mobs") return "mobs";
    if (top === "items") return "items";
    if (top === "biomes") return "biomes";
    if (top === "journal") return "lateLore";
    return null;
}

export function markCodex(player, path, timestamp = false) {
    const codex = getCodex(player);
    const parts = path.split(".");
    let ref = codex;
    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        if (typeof ref[key] !== "object" || ref[key] === null) ref[key] = {};
        ref = ref[key];
    }
    const leaf = parts[parts.length - 1];
    const prevValue = ref[leaf];
    if (timestamp) {
        ref[leaf] = Date.now();
    } else {
        ref[leaf] = true;
    }
    // Only bump "new/updated" when the value actually changed (e.g. Infection shouldn't show updated every open just because timer is shown)
    const valueChanged = timestamp ? (ref[leaf] !== prevValue) : (prevValue !== true);
    if (valueChanged) {
        const section = getSectionForPath(path);
        if (section) {
            if (!codex.journal) codex.journal = {};
            if (!codex.journal.sectionLastUnlock) codex.journal.sectionLastUnlock = {};
            codex.journal.sectionLastUnlock[section] = Date.now();
        }
        if (!codex.journal) codex.journal = {};
        if (!codex.journal.subsectionLastUnlock) codex.journal.subsectionLastUnlock = {};
        codex.journal.subsectionLastUnlock[path] = Date.now();
    }
    saveCodex(player, codex);
}

/** Mark a subsection (e.g. mobs.mapleBearSeen) as viewed. */
function markSubsectionViewed(player, subsectionPath) {
    try {
        const codex = getCodex(player);
        if (!codex.journal) codex.journal = {};
        if (!codex.journal.subsectionLastViewed) codex.journal.subsectionLastViewed = {};
        codex.journal.subsectionLastViewed[subsectionPath] = Date.now();
        saveCodex(player, codex);
    } catch (e) { }
}

/** Call to mark a subsection as having new content (e.g. timeline.day.5). */
export function markSubsectionUnlock(player, subsectionPath) {
    try {
        const codex = getCodex(player);
        if (!codex.journal) codex.journal = {};
        if (!codex.journal.subsectionLastUnlock) codex.journal.subsectionLastUnlock = {};
        codex.journal.subsectionLastUnlock[subsectionPath] = Date.now();
        saveCodex(player, codex);
    } catch (e) {
        console.warn("[CODEX] markSubsectionUnlock failed:", e);
    }
}

/** Call when a section gets new content from outside markCodex (e.g. Timeline from recordDailyEvent). */
export function markSectionUnlock(player, section) {
    try {
        const codex = getCodex(player);
        if (!codex.journal) codex.journal = {};
        if (!codex.journal.sectionLastUnlock) codex.journal.sectionLastUnlock = {};
        codex.journal.sectionLastUnlock[section] = Date.now();
        saveCodex(player, codex);
    } catch (e) {
        console.warn("[CODEX] markSectionUnlock failed:", e);
    }
}

/** Mark a section as viewed (clears new/updated state for that section). */
function markSectionViewed(player, sectionId) {
    try {
        const codex = getCodex(player);
        if (!codex.journal) codex.journal = {};
        if (!codex.journal.sectionLastViewed) codex.journal.sectionLastViewed = {};
        codex.journal.sectionLastViewed[sectionId] = Date.now();
        saveCodex(player, codex);
    } catch (e) { }
}

/**
 * Sets all unlockable codex content to unlocked (for developer/testing).
 * Does not clear or modify dailyEvents/achievements; use reset for a full wipe.
 */
export function fullyUnlockCodex(player) {
    const codex = getCodex(player);
    const def = getDefaultCodex();

    // Infections & status (use same shape as getDefaultCodex so openInfections and others work)
    if (codex.infections) {
        codex.infections.bear = { discovered: true, firstHitAt: Date.now() };
        codex.infections.snow = { discovered: true, firstUseAt: Date.now() };
        codex.infections.minor = { discovered: true };
        codex.infections.major = { discovered: true };
    }
    if (codex.status) {
        codex.status.immuneKnown = true;
        codex.status.bearTimerSeen = true;
        codex.status.snowTimerSeen = true;
    }
    if (codex.cures) {
        codex.cures.bearCureKnown = true;
        codex.cures.minorCureKnown = true;
    }

    // Effects (infection symptoms + snow effects + minor infection effects)
    for (const key of Object.keys(def.effects || {})) {
        if (typeof def.effects[key] === "boolean") codex.effects[key] = true;
    }
    for (const key of Object.keys(def.snowEffects || {})) {
        if (typeof def.snowEffects[key] === "boolean") codex.snowEffects[key] = true;
    }
    for (const key of Object.keys(def.minorInfectionEffects || {})) {
        if (typeof def.minorInfectionEffects[key] === "boolean") codex.minorInfectionEffects[key] = true;
    }
    if (codex.symptomsUnlocks) {
        codex.symptomsUnlocks.infectionSymptomsUnlocked = true;
        codex.symptomsUnlocks.snowEffectsUnlocked = true;
        codex.symptomsUnlocks.snowTierAnalysisUnlocked = true;
        codex.symptomsUnlocks.minorInfectionAnalysisUnlocked = true;
    }

    // Items (all *Seen and tier flags)
    for (const key of Object.keys(def.items || {})) {
        if (typeof def.items[key] === "boolean") codex.items[key] = true;
    }

    // Mobs: all seen + variant unlocks + high kill counts so all variant text shows
    const killCount = 200;
    const mobKeys = ["mapleBearSeen", "infectedBearSeen", "infectedPigSeen", "infectedCowSeen", "buffBearSeen", "flyingBearSeen", "miningBearSeen", "torpedoBearSeen"];
    for (const k of mobKeys) {
        if (codex.mobs) codex.mobs[k] = true;
    }
    const countKeys = ["tinyBearKills", "infectedBearKills", "infectedPigKills", "infectedCowKills", "buffBearKills", "flyingBearKills", "miningBearKills", "torpedoBearKills",
        "tinyBearMobKills", "infectedBearMobKills", "infectedPigMobKills", "infectedCowMobKills", "buffBearMobKills", "flyingBearMobKills", "miningBearMobKills", "torpedoBearMobKills",
        "tinyBearHits", "infectedBearHits", "infectedPigHits", "infectedCowHits", "buffBearHits", "flyingBearHits", "miningBearHits", "torpedoBearHits"];
    for (const k of countKeys) {
        if (codex.mobs) codex.mobs[k] = killCount;
    }
    const variantFlags = ["day4VariantsUnlocked", "day8VariantsUnlocked", "day13VariantsUnlocked", "day20VariantsUnlocked",
        "day4VariantsUnlockedTiny", "day4VariantsUnlockedInfected", "day4VariantsUnlockedBuff", "day4VariantsUnlockedOther",
        "day8VariantsUnlockedTiny", "day8VariantsUnlockedInfected", "day8VariantsUnlockedBuff", "day8VariantsUnlockedOther",
        "day13VariantsUnlockedTiny", "day13VariantsUnlockedInfected", "day13VariantsUnlockedBuff", "day13VariantsUnlockedOther",
        "day20VariantsUnlockedTiny", "day20VariantsUnlockedInfected", "day20VariantsUnlockedBuff", "day20VariantsUnlockedOther",
        "day4MessageShownTiny", "day4MessageShownInfected", "day4MessageShownBuff", "day4MessageShownOther",
        "day8MessageShown", "day13MessageShown", "day20MessageShown"];
    for (const k of variantFlags) {
        if (codex.mobs) codex.mobs[k] = true;
    }

    // Biomes
    for (const key of Object.keys(def.biomes || {})) {
        if (typeof def.biomes[key] === "boolean") codex.biomes[key] = true;
    }
    if (!codex.biomeData) codex.biomeData = {};
    codex.biomeData.mb_infected_biome = { visitCount: 1, totalInfectionSeen: 5, maxInfectionLevel: 5, lastVisit: Date.now() };

    // Knowledge levels (max)
    if (codex.knowledge) {
        codex.knowledge.infectionLevel = 3;
        codex.knowledge.bearLevel = 3;
        codex.knowledge.biomeLevel = 3;
        codex.knowledge.cureLevel = 3;
        codex.knowledge.snowLevel = 3;
    }

    // Journal (Late Lore)
    if (codex.journal) {
        codex.journal.day20TinyLoreUnlocked = true;
        codex.journal.day20InfectedLoreUnlocked = true;
        codex.journal.day20BuffLoreUnlocked = true;
        codex.journal.day20WorldLoreUnlocked = true;
    }

    saveCodex(player, codex);
}

// Knowledge progression system
export function updateKnowledgeLevel(player, knowledgeType, level) {
    const codex = getCodex(player);
    if (!codex.knowledge) codex.knowledge = {};
    codex.knowledge[knowledgeType] = Math.max(codex.knowledge[knowledgeType] || 0, level);
    saveCodex(player, codex);
}

export function getKnowledgeLevel(player, knowledgeType) {
    const codex = getCodex(player);
    return codex.knowledge?.[knowledgeType] || 0;
}

// Check if player has sufficient knowledge for certain information
export function hasKnowledge(player, knowledgeType, requiredLevel) {
    return getKnowledgeLevel(player, knowledgeType) >= requiredLevel;
}

// Update knowledge based on experiences
export function checkKnowledgeProgression(player) {
    const codex = getCodex(player);
    if (!codex.knowledge) codex.knowledge = {};

    // Infection knowledge progression - grows as discoveries are made
    const hasInfectionExperience = codex.history.totalInfections > 0 || 
                                   codex.infections?.bear?.discovered || 
                                   codex.infections?.snow?.discovered ||
                                   codex.infections?.minor?.discovered ||
                                   codex.infections?.major?.discovered ||
                                   (codex.items.snowIdentified && (codex.infections?.bear?.discovered || codex.infections?.snow?.discovered));
    
    if (hasInfectionExperience) {
        updateKnowledgeLevel(player, 'infectionLevel', 1); // Basic awareness
    }
    
    // Understanding level: Multiple discoveries or experiences
    const currentInfectionKnowledge = codex.knowledge?.infectionLevel || 0;
    const hasMultipleDiscoveries = (codex.history.totalInfections >= 2) ||
                                   (codex.infections?.bear?.discovered && codex.infections?.snow?.discovered) ||
                                   (codex.items.goldenAppleSeen && codex.items.goldenCarrotSeen && currentInfectionKnowledge >= 1) ||
                                   (codex.cures.bearCureKnown || codex.cures.minorCureKnown) ||
                                   (codex.items.snowIdentified && codex.history.totalInfections >= 1) ||
                                   (codex.items.goldenAppleSeen && codex.items.goldenCarrotSeen && hasInfectionExperience) ||
                                   (codex.infections?.minor?.discovered && hasInfectionExperience) ||
                                   (codex.infections?.major?.discovered && hasInfectionExperience) ||
                                   (codex.items.goldenAppleSeen && codex.items.goldenCarrotSeen) ||
                                   (codex.items.goldSeen && (codex.items.goldenAppleSeen || codex.items.goldenCarrotSeen || codex.items.enchantedGoldenAppleSeen)) ||
                                   (codex.items.goldNuggetSeen && (codex.items.goldenAppleSeen || codex.items.goldenCarrotSeen)) ||
                                   (codex.items.weaknessPotionSeen && (codex.items.goldenAppleSeen || codex.items.enchantedGoldenAppleSeen)) ||
                                   (codex.items.goldenAppleInfectionReductionDiscovered && hasInfectionExperience);
    
    if (hasMultipleDiscoveries) {
        updateKnowledgeLevel(player, 'infectionLevel', 2); // Understanding
    }
    
    // Expert level: Deep knowledge from many experiences
    const hasExpertKnowledge = (codex.history.totalInfections >= 5) ||
                               codex.journal?.day20WorldLoreUnlocked ||
                               (codex.cures.bearCureDoneAt && codex.cures.minorCureDoneAt) ||
                               (codex.history.totalCures > 0 && codex.history.totalInfections >= 3) ||
                               (codex.infections?.bear?.discovered && codex.infections?.snow?.discovered && codex.infections?.minor?.discovered && codex.cures.bearCureKnown) ||
                               (codex.items.goldenAppleSeen && codex.items.goldenCarrotSeen && codex.items.enchantedGoldenAppleSeen && codex.cures.bearCureKnown) ||
                               (codex.cures.minorCureKnown && codex.cures.bearCureKnown) ||
                               (codex.items.goldSeen && codex.items.goldNuggetSeen && codex.items.goldenAppleSeen && codex.items.goldenCarrotSeen && codex.items.enchantedGoldenAppleSeen) ||
                               (codex.items.goldenAppleInfectionReductionDiscovered && codex.items.goldenCarrotSeen && codex.items.goldenAppleSeen && hasInfectionExperience) ||
                               (codex.cures.bearCureKnown && codex.items.weaknessPotionSeen && codex.items.enchantedGoldenAppleSeen && hasInfectionExperience);
    
    if (hasExpertKnowledge) {
        updateKnowledgeLevel(player, 'infectionLevel', 3); // Expert
    }

    // Bear knowledge progression
    const totalBearKills = (codex.mobs.tinyBearKills || 0) + (codex.mobs.infectedBearKills || 0) + (codex.mobs.buffBearKills || 0) +
        (codex.mobs.flyingBearKills || 0) + (codex.mobs.miningBearKills || 0) + (codex.mobs.torpedoBearKills || 0);
    if (totalBearKills > 0) {
        updateKnowledgeLevel(player, 'bearLevel', 1); // Basic awareness
        if (totalBearKills >= 10) {
            updateKnowledgeLevel(player, 'bearLevel', 2); // Understanding
        }
        if (totalBearKills >= 50 || codex.mobs?.day20VariantsUnlocked) {
            updateKnowledgeLevel(player, 'bearLevel', 3); // Expert
        }
    }

    // Snow knowledge progression
    if (codex.items.snowFound || codex.items.snowIdentified) {
        updateKnowledgeLevel(player, 'snowLevel', 1); // Basic awareness
    }
    if (codex.snowEffects && Object.values(codex.snowEffects).some(seen => seen)) {
        updateKnowledgeLevel(player, 'snowLevel', 2); // Understanding
    }

    // Cure knowledge progression
    if (codex.cures.bearCureKnown) {
        updateKnowledgeLevel(player, 'cureLevel', 2); // Understanding
    }
    if (codex.history.totalCures > 0) {
        updateKnowledgeLevel(player, 'cureLevel', 3); // Expert
    }

    // Biome knowledge progression
    if (codex.biomes.infectedBiomeSeen) {
        updateKnowledgeLevel(player, 'biomeLevel', 1); // Basic awareness
    }
}

// Biome infection tracking system
export function recordBiomeVisit(player, biomeId, infectionLevel = 0) {
    const codex = getCodex(player);
    if (!codex.biomeData) codex.biomeData = {};

    const biomeKey = biomeId.replace(':', '_');
    if (!codex.biomeData[biomeKey]) {
        codex.biomeData[biomeKey] = {
            name: biomeId,
            visitCount: 0,
            totalInfectionSeen: 0,
            maxInfectionLevel: 0,
            lastVisit: Date.now()
        };
    }

    codex.biomeData[biomeKey].visitCount++;
    codex.biomeData[biomeKey].totalInfectionSeen += infectionLevel;
    codex.biomeData[biomeKey].maxInfectionLevel = Math.max(codex.biomeData[biomeKey].maxInfectionLevel, infectionLevel);
    codex.biomeData[biomeKey].lastVisit = Date.now();

    saveCodex(player, codex);
}

export function getBiomeInfectionLevel(player, biomeId) {
    const codex = getCodex(player);
    if (!codex.biomeData) return null;

    const biomeKey = biomeId.replace(':', '_');
    const biomeData = codex.biomeData[biomeKey];
    if (!biomeData) return null;

    // Calculate average infection level based on visits
    return biomeData.visitCount > 0 ? Math.round(biomeData.totalInfectionSeen / biomeData.visitCount) : 0;
}

// Knowledge sharing cooldown tracking
const knowledgeShareCooldowns = new Map(); // playerId -> { lastShareTime, hasSharedBefore }

// Knowledge sharing system
export function shareKnowledge(fromPlayer, toPlayer) {
    const now = Date.now();
    const cooldownKey = `${fromPlayer.id}-${toPlayer.id}`;
    const lastShare = knowledgeShareCooldowns.get(cooldownKey);

    // Check if we've shared recently (within 30 seconds) - if so, silently skip
    if (lastShare && (now - lastShare.lastShareTime) < 30000) {
        return 'silent'; // Silent cooldown - no messages
    }

    const fromCodex = getCodex(fromPlayer);
    const toCodex = getCodex(toPlayer);
    const recipientHasJournal = !!(toCodex?.items?.snowBookCrafted);
    let hasNewKnowledge = false;
    let sharedItems = [];

    // Share knowledge levels (merge, keeping highest level)
    if (!toCodex.knowledge) toCodex.knowledge = {};
    if (!fromCodex.knowledge) fromCodex.knowledge = {};

    for (const [knowledgeType, level] of Object.entries(fromCodex.knowledge)) {
        const currentLevel = toCodex.knowledge[knowledgeType] || 0;
        if (level > currentLevel) {
            toCodex.knowledge[knowledgeType] = level;
            hasNewKnowledge = true;

            // Convert knowledge type to friendly name
            let friendlyName;
            switch (knowledgeType) {
                case 'infectionLevel': friendlyName = 'Infection Knowledge'; break;
                case 'bearLevel': friendlyName = 'Bear Knowledge'; break;
                case 'biomeLevel': friendlyName = 'Biome Knowledge'; break;
                case 'cureLevel': friendlyName = 'Cure Knowledge'; break;
                case 'snowLevel': friendlyName = '"Snow" Knowledge'; break;
                default: friendlyName = knowledgeType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
            }

            sharedItems.push(`${friendlyName} (level ${level})`);
        }
    }

    // Share mob discoveries
    if (!toCodex.mobs) toCodex.mobs = {};
    for (const [mobKey, discovered] of Object.entries(fromCodex.mobs)) {
        if (discovered && !toCodex.mobs[mobKey]) {
            toCodex.mobs[mobKey] = discovered;
            hasNewKnowledge = true;

            // Convert mob key to friendly name
            let friendlyName;
            switch (mobKey) {
                case 'mapleBearSeen': friendlyName = 'Tiny Maple Bear'; break;
                case 'infectedBearSeen': friendlyName = 'Infected Maple Bear'; break;
                case 'buffBearSeen': friendlyName = 'Buff Maple Bear'; break;
                case 'infectedPigSeen': friendlyName = 'Infected Pig'; break;
                    case 'infectedCowSeen': friendlyName = 'Infected Cow'; break;
                    case 'flyingBearSeen': friendlyName = 'Flying Maple Bear'; break;
                    case 'miningBearSeen': friendlyName = 'Mining Maple Bear'; break;
                    case 'torpedoBearSeen': friendlyName = 'Torpedo Maple Bear'; break;
                default: friendlyName = mobKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
            }

            sharedItems.push(`${friendlyName}`);
        }
    }

    // Share item discoveries
    if (!toCodex.items) toCodex.items = {};
    for (const [itemKey, discovered] of Object.entries(fromCodex.items)) {
        if (discovered && !toCodex.items[itemKey]) {
            toCodex.items[itemKey] = discovered;
            hasNewKnowledge = true;

            // Convert item key to friendly name
            let friendlyName;
            switch (itemKey) {
                case 'snowFound': friendlyName = '"Snow" Discovery'; break;
                case 'snowBookCrafted': friendlyName = 'Knowledge Book'; break;
                case 'snowIdentified': friendlyName = '"Snow" Identification'; break;
                default: friendlyName = itemKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
            }

            sharedItems.push(`${friendlyName}`);
        }
    }

    // Share biome discoveries
    if (!toCodex.biomes) toCodex.biomes = {};
    for (const [biomeKey, discovered] of Object.entries(fromCodex.biomes)) {
        if (discovered && !toCodex.biomes[biomeKey]) {
            toCodex.biomes[biomeKey] = discovered;
            hasNewKnowledge = true;

            // Convert biome key to friendly name
            let friendlyName;
            switch (biomeKey) {
                case 'infectedBiomeSeen': friendlyName = 'Infected Biome'; break;
                default: friendlyName = 'Unknown Biome';
            }

            sharedItems.push(`${friendlyName} Discovery`);
        }
    }

    // Share effects discoveries
    if (!toCodex.effects) toCodex.effects = {};
    for (const [effectKey, discovered] of Object.entries(fromCodex.effects)) {
        if (discovered && !toCodex.effects[effectKey]) {
            toCodex.effects[effectKey] = discovered;
            hasNewKnowledge = true;
            // Use descriptive label with effect name
            const effectName = effectKey.replace(/Seen$/, '').replace(/([A-Z])/g, ' $1').trim();
            sharedItems.push(`Infection Effect: ${effectName}`);
        }
    }

    // Share snow effects discoveries
    if (!toCodex.snowEffects) toCodex.snowEffects = {};
    for (const [effectKey, discovered] of Object.entries(fromCodex.snowEffects)) {
        if (discovered && !toCodex.snowEffects[effectKey]) {
            toCodex.snowEffects[effectKey] = discovered;
            hasNewKnowledge = true;
            // Use descriptive label with effect name
            const effectName = effectKey.replace(/Seen$/, '').replace(/([A-Z])/g, ' $1').trim();
            sharedItems.push(`Snow Effect: ${effectName}`);
        }
    }

    // Share cure knowledge
    if (!toCodex.cures) toCodex.cures = {};
    for (const [cureKey, discovered] of Object.entries(fromCodex.cures)) {
        if (discovered && !toCodex.cures[cureKey]) {
            toCodex.cures[cureKey] = discovered;
            hasNewKnowledge = true;

            // Convert cure key to friendly name
            let friendlyName;
            switch (cureKey) {
                case 'bearCureKnown': friendlyName = 'Bear Cure Method'; break;
                default: friendlyName = 'Cure Knowledge';
            }

            sharedItems.push(`${friendlyName}`);
        }
    }

    // Share variant unlocks
    if (fromCodex.mobs.day4VariantsUnlocked && !toCodex.mobs.day4VariantsUnlocked) {
        toCodex.mobs.day4VariantsUnlocked = true;
        hasNewKnowledge = true;
        sharedItems.push(`Day 4+ Variants`);
    }
    if (fromCodex.mobs.day8VariantsUnlocked && !toCodex.mobs.day8VariantsUnlocked) {
        toCodex.mobs.day8VariantsUnlocked = true;
        hasNewKnowledge = true;
        sharedItems.push(`Day 8+ Variants`);
    }
    if (fromCodex.mobs.day13VariantsUnlocked && !toCodex.mobs.day13VariantsUnlocked) {
        toCodex.mobs.day13VariantsUnlocked = true;
        hasNewKnowledge = true;
        sharedItems.push(`Day 13+ Variants`);
    }
    if (fromCodex.mobs.day20VariantsUnlocked && !toCodex.mobs.day20VariantsUnlocked) {
        toCodex.mobs.day20VariantsUnlocked = true;
        toCodex.mobs.day20VariantsUnlockedTiny = toCodex.mobs.day20VariantsUnlockedTiny || fromCodex.mobs.day20VariantsUnlockedTiny;
        toCodex.mobs.day20VariantsUnlockedInfected = toCodex.mobs.day20VariantsUnlockedInfected || fromCodex.mobs.day20VariantsUnlockedInfected;
        toCodex.mobs.day20VariantsUnlockedBuff = toCodex.mobs.day20VariantsUnlockedBuff || fromCodex.mobs.day20VariantsUnlockedBuff;
        toCodex.mobs.day20VariantsUnlockedOther = toCodex.mobs.day20VariantsUnlockedOther || fromCodex.mobs.day20VariantsUnlockedOther;
        hasNewKnowledge = true;
        sharedItems.push(`Day 20+ Variants`);
    }

    const loreShared = [];
    if (fromCodex.journal?.day20TinyLoreUnlocked && !toCodex.journal?.day20TinyLoreUnlocked) {
        if (!toCodex.journal) toCodex.journal = {};
        toCodex.journal.day20TinyLoreUnlocked = true;
        hasNewKnowledge = true;
        loreShared.push("tiny vanguard");
    }
    if (fromCodex.journal?.day20InfectedLoreUnlocked && !toCodex.journal?.day20InfectedLoreUnlocked) {
        if (!toCodex.journal) toCodex.journal = {};
        toCodex.journal.day20InfectedLoreUnlocked = true;
        hasNewKnowledge = true;
        loreShared.push("hollow procession");
    }
    if (fromCodex.journal?.day20BuffLoreUnlocked && !toCodex.journal?.day20BuffLoreUnlocked) {
        if (!toCodex.journal) toCodex.journal = {};
        toCodex.journal.day20BuffLoreUnlocked = true;
        hasNewKnowledge = true;
        loreShared.push("skybreaker notes");
    }
    if (fromCodex.journal?.day20WorldLoreUnlocked && !toCodex.journal?.day20WorldLoreUnlocked) {
        if (!toCodex.journal) toCodex.journal = {};
        toCodex.journal.day20WorldLoreUnlocked = true;
        hasNewKnowledge = true;
        loreShared.push("world memory");
    }
    if (loreShared.length > 0) {
        sharedItems.push(`Late Lore (${loreShared.join(', ')})`);
    }

    // Update cooldown tracking
    knowledgeShareCooldowns.set(cooldownKey, { lastShareTime: now, hasSharedBefore: true });

    if (hasNewKnowledge) {
        saveCodex(toPlayer, toCodex);
        checkKnowledgeProgression(toPlayer);

        // Record this knowledge sharing event in the daily log for tomorrow
        const tomorrowDay = getCurrentDay() + 1;
        const eventMessage = `${fromPlayer.name} shared knowledge: ${sharedItems.join(', ')}.`;
        recordDailyEvent(toPlayer, tomorrowDay, eventMessage, "knowledge");

        // Send special feedback to both players
        const summary = sharedItems.join(', ');
        fromPlayer.sendMessage(CHAT_INFO + "Shared with " + CHAT_HIGHLIGHT + toPlayer.name + CHAT_INFO + ": " + CHAT_SUCCESS + summary);
        if (recipientHasJournal) {
            toPlayer.sendMessage(CHAT_SPECIAL + fromPlayer.name + CHAT_INFO + " shared: " + CHAT_SUCCESS + summary);
        } else {
            toPlayer.sendMessage(CHAT_INFO + "Knowledge shared, but no journal to record it.");
        }
        const volumeMultiplier = getPlayerSoundVolume(toPlayer);
        toPlayer.playSound("random.orb", { pitch: 1.2, volume: 0.8 * volumeMultiplier });
        toPlayer.playSound("mob.experience_orb.pickup", { pitch: 1.0, volume: 0.6 * volumeMultiplier });

        return true;
    }

    return false;
}

// Track cure attempts for progression
export function trackCureAttempt(player) {
    if (!player) return;
    const codex = getCodex(player);
    codex.items.cureAttempted = true;
    saveCodex(player, codex);
}
// Update aggregated symptom metadata
export function updateSymptomMeta(player, effectId, durationTicks, amp, source, timingBucket, snowCountBucket) {
    const codex = getCodex(player);
    if (!codex.symptomsMeta) codex.symptomsMeta = {};
    const meta = codex.symptomsMeta[effectId] || {
        sources: {}, // { bear: true, snow: true }
        minDuration: null,
        maxDuration: null,
        minAmp: null,
        maxAmp: null,
        timing: { early: 0, mid: 0, late: 0 },
        snowCounts: { low: 0, mid: 0, high: 0 }
    };
    if (source) meta.sources[source] = true;
    const d = Math.max(0, durationTicks || 0);
    meta.minDuration = meta.minDuration === null ? d : Math.min(meta.minDuration, d);
    meta.maxDuration = meta.maxDuration === null ? d : Math.max(meta.maxDuration, d);
    const a = Math.max(0, amp || 0);
    meta.minAmp = meta.minAmp === null ? a : Math.min(meta.minAmp, a);
    meta.maxAmp = meta.maxAmp === null ? a : Math.max(meta.maxAmp, a);
    if (timingBucket && meta.timing.hasOwnProperty(timingBucket)) meta.timing[timingBucket]++;
    if (snowCountBucket) {
        if (snowCountBucket === 'low') meta.snowCounts.low++;
        else if (snowCountBucket === 'mid') meta.snowCounts.mid++;
        else if (snowCountBucket === 'high') meta.snowCounts.high++;
    }
    codex.symptomsMeta[effectId] = meta;
    saveCodex(player, codex);
}

export function showCodexBook(player, context) {
    const { playerInfection, curedPlayers, formatTicksDuration, formatMillisDuration, HITS_TO_INFECT, bearHitCount, maxSnowLevels, getCurrentDay, getDayDisplayInfo } = context;

    // Play journal open sound
    const volumeMultiplier = getPlayerSoundVolume(player);
    player.playSound("mb.codex_open", { pitch: 1.0, volume: 1.0 * volumeMultiplier });

    // Ensure knowledge progression is up to date before presenting information
    try {
        checkKnowledgeProgression(player);
    } catch { }

        // Variant unlock checks are handled when mobs are killed, not when opening codex
    function maskTitle(title, known) {
        return known ? title : "???";
    }
        
        // Get settings with defaults
        function getSettings() {
            const codex = getCodex(player);
            if (!codex.settings) {
                codex.settings = {
                    showSearchButton: true,
                    bearSoundVolume: 2, // 0=off, 1=low, 2=high
                    blockBreakVolume: 2, // 0=off, 1=low, 2=high
                    soundVolume: 1.0,
                    showTips: true,
                    audioMessages: true,
                    showInfectionTimer: false,
                    criticalWarningsOnly: false,
                    stormParticles: 0 // 0=Less, 1=Medium, 2=More
                };
                saveCodex(player, codex);
            } else {
                // Ensure Basic Journal settings exist (for backwards compatibility)
                if (codex.settings.soundVolume === undefined) {
                    codex.settings.soundVolume = 1.0;
                }
                if (codex.settings.showTips === undefined) {
                    codex.settings.showTips = true;
                }
                if (codex.settings.audioMessages === undefined) {
                    codex.settings.audioMessages = true;
                }
                if (codex.settings.showInfectionTimer === undefined) {
                    codex.settings.showInfectionTimer = false;
                }
                if (codex.settings.criticalWarningsOnly === undefined) {
                    codex.settings.criticalWarningsOnly = false;
                }
                if (codex.settings.stormParticles === undefined) {
                    codex.settings.stormParticles = 0;
                }
            }
            
            // Sync with Basic Journal settings if they exist (for backwards compatibility)
            const basicSettingsKey = `mb_player_settings_${player.id}`;
            const rawBasicSettings = getWorldPropertyChunked(basicSettingsKey);
            if (rawBasicSettings) {
                let parsedBasicSettings = rawBasicSettings;
                if (typeof rawBasicSettings === 'string') {
                    try {
                        parsedBasicSettings = JSON.parse(rawBasicSettings);
                    } catch (e) {
                        // If parsing fails, skip sync
                    }
                }
                
                if (parsedBasicSettings && typeof parsedBasicSettings === 'object') {
                    // Merge Basic Journal settings into codex settings (Basic Journal takes precedence if set)
                    if (typeof parsedBasicSettings.soundVolume === 'number') {
                        codex.settings.soundVolume = parsedBasicSettings.soundVolume;
                    }
                    if (typeof parsedBasicSettings.showTips === 'boolean') {
                        codex.settings.showTips = parsedBasicSettings.showTips;
                    }
                    if (typeof parsedBasicSettings.audioMessages === 'boolean') {
                        codex.settings.audioMessages = parsedBasicSettings.audioMessages;
                    }
                    // showInfectionTimer is Powdery-only; do not sync from Basic
                    if (typeof parsedBasicSettings.criticalWarningsOnly === 'boolean') {
                        codex.settings.criticalWarningsOnly = parsedBasicSettings.criticalWarningsOnly;
                    }
                    if (typeof parsedBasicSettings.stormParticles === 'number') {
                        codex.settings.stormParticles = Math.max(0, Math.min(2, parsedBasicSettings.stormParticles));
                    }
                }
            }
            
            return codex.settings;
        }
    function buildSummary() {
        const codex = getCodex(player);
        const infectionState = playerInfection.get(player.id);
        const hasInfection = infectionState && !infectionState.cured && infectionState.ticksLeft > 0;
        const immune = (() => {
            const end = curedPlayers.get(player.id);
            return !!end && Date.now() < end;
        })();
        const summary = [];
        
        // Add current day
        const currentDay = getCurrentDay ? getCurrentDay() : 0;
        const display = typeof getDayDisplayInfo === 'function' ? getDayDisplayInfo(currentDay) : { color: '§f', symbols: '' };
        summary.push(`${display.color}${display.symbols} Current Day: ${currentDay}`);
        
        // Health status logic - progressive based on knowledge
        let infectionKnowledge = getKnowledgeLevel(player, 'infectionLevel');
        if ((hasInfection || codex.history.totalInfections > 0) && infectionKnowledge < 1) {
            updateKnowledgeLevel(player, 'infectionLevel', 1);
            infectionKnowledge = 1;
        }
        // Check if player has upgraded to Powdery Journal
        const hasPowderyJournal = codex.items.snowBookCrafted;
        
        if (hasInfection) {
            if (infectionKnowledge >= 1) {
                // Check infection type
                const infectionType = infectionState.infectionType || MAJOR_INFECTION_TYPE;
                const isMinor = infectionType === MINOR_INFECTION_TYPE;
                
                // Basic status - always show if infected
                if (isMinor) {
                    summary.push(`§eStatus: §cMINOR INFECTION`);
                } else {
                    summary.push(`§eStatus: §cMAJOR INFECTION`);
                }
                
                // Timer info - progressive: show more detail as player experiences infection
                // Basic: just "???" if haven't experienced much
                // Intermediate: show time if have Powdery Journal or experienced for a while
                const hasExperiencedTimer = hasPowderyJournal || infectionKnowledge >= 2 || codex.status.bearTimerSeen;
                if (hasExperiencedTimer) {
                    const ticks = infectionState.ticksLeft || 0;
                    const days = Math.ceil(ticks / 24000);
                    summary.push(`§eTime: §c${formatTicksDuration(ticks)} (§f~${days} day${days !== 1 ? 's' : ''}§c)`);
                } else {
                    summary.push(`§eTime: §8???`);
                }
                
                // Snow count - only show if have Powdery Journal AND have consumed snow (experienced it)
                if (!isMinor && hasPowderyJournal) {
                    const snowCount = infectionState.snowCount || 0;
                    const hasConsumedSnow = snowCount > 0 || codex.infections.snow.discovered;
                    if (hasConsumedSnow) {
                        summary.push(`§e"Snow" consumed: §c${snowCount}`);
                    }
                }
                
                // Cure information - progressive: only show what player has discovered
                if (hasPowderyJournal) {
                    // Show minor infection cure progress - only if cure items discovered
                    if (isMinor) {
                        const hasGoldenApple = codex.items.goldenAppleSeen;
                        const hasGoldenCarrot = codex.items.goldenCarrotSeen;
                        
                        if (hasGoldenApple && hasGoldenCarrot) {
                            const hasApple = getPlayerProperty(player, MINOR_CURE_GOLDEN_APPLE_PROPERTY) === true;
                            const hasCarrot = getPlayerProperty(player, MINOR_CURE_GOLDEN_CARROT_PROPERTY) === true;
                            summary.push(`§7Minor Cure Progress:`);
                            summary.push(`§7  Golden Apple: ${hasApple ? '§a✓' : '§eDiscovered'}`);
                            summary.push(`§7  Golden Carrot: ${hasCarrot ? '§a✓' : '§eDiscovered'}`);
                            if (hasApple && hasCarrot) {
                                summary.push(`§eBoth components consumed! Cure is taking effect...`);
                            } else {
                                summary.push(`§7Consume both to gain permanent immunity.`);
                            }
                        } else if (hasGoldenApple || hasGoldenCarrot) {
                            summary.push(`§7Cure: §8??? (one component discovered)`);
                        } else {
                            summary.push(`§7Cure: §8???`);
                        }
                    } else {
                        // Major infection cure info - only if cure items discovered
                        const hasWeaknessPotion = codex.items.weaknessPotionSeen;
                        const hasEnchantedApple = codex.items.enchantedGoldenAppleSeen;
                        
                        if (hasWeaknessPotion && hasEnchantedApple && codex.cures.bearCureKnown) {
                            summary.push("§7Cure: §fWeakness + Enchanted Golden Apple");
                        } else if (hasWeaknessPotion || hasEnchantedApple) {
                            summary.push("§7Cure: §8??? (one component discovered)");
                        } else {
                            summary.push("§7Cure: §8???");
                        }
                    }
                } else {
                    // Basic journal - minimal info
                    summary.push(`§7Cure: §8???`);
                }
            } else {
                summary.push(`§eStatus: §cSomething is wrong with you...`);
                summary.push(`§7You feel unwell but don't understand why.`);
            }
        } else {
            // Check if player has permanent immunity
            const hasPermanentImmunity = getPlayerProperty(player, PERMANENT_IMMUNITY_PROPERTY) === true;
            
            // Check if player has ever been infected
            const hasBeenInfected = codex.history.totalInfections > 0;
            if (hasPermanentImmunity) {
                const addonHits = getAddonDifficultyState();
                summary.push(`§eStatus: §aHealthy (Permanently Immune)`);
                summary.push(`§7You are permanently immune to minor infection.`);
                summary.push(`§7You require ${addonHits.hitsBase} hits from Maple Bears to get infected.`);
            } else if (hasBeenInfected && infectionKnowledge >= 1) {
                summary.push(`§eStatus: §aHealthy (Previously Infected)`);
            } else {
                summary.push(`§eStatus: §aHealthy`);
            }
        }

        // Show immunity status - progressive: only show if have experienced immunity or have Powdery Journal with knowledge
        const hasPermanentImmunity = getPlayerProperty(player, PERMANENT_IMMUNITY_PROPERTY) === true;
        const hasExperiencedImmunity = hasPermanentImmunity || (immune && codex.status.immuneKnown);
        if (hasPowderyJournal && (hasExperiencedImmunity || infectionKnowledge >= 1)) {
            if (hasPermanentImmunity) {
                summary.push("§bImmunity: §aPERMANENT");
            } else if (immune && codex.status.immuneKnown) {
                // Temporary immunity from major infection cure
                const end = curedPlayers.get(player.id);
                const remainingMs = Math.max(0, end - Date.now());
                summary.push(`§bImmunity: §fACTIVE (§b${formatMillisDuration(remainingMs)} left§f)`);
            } else if (hasPowderyJournal && infectionKnowledge >= 1) {
                summary.push("§bImmunity: §7None");
            }
        } else if (!hasPowderyJournal && hasExperiencedImmunity) {
            // Basic journal - only show if actually have immunity
            if (hasPermanentImmunity) {
                summary.push("§bImmunity: §aPERMANENT");
            } else if (immune) {
                summary.push("§bImmunity: §fACTIVE");
            }
        }

        // Bear hits - progressive: only show if player has Powdery Journal AND has been hit AND has bear knowledge
        const bearKnowledge = getKnowledgeLevel(player, 'bearLevel');
        const hitCount = bearHitCount.get(player.id) || 0;
        const hasBeenHit = hitCount > 0 || codex.infections.bear.discovered;
        if (hasPowderyJournal && hasBeenHit && bearKnowledge >= 1) {
            const addonHits = getAddonDifficultyState();
            const majorHits = addonHits.hitsBase;
            const minorToMajorHits = Math.max(1, addonHits.hitsBase - 1);
            if (hitCount > 0 && !hasInfection) {
                const hasPermanentImmunity = getPlayerProperty(player, PERMANENT_IMMUNITY_PROPERTY) === true;
                const hitsNeeded = hasPermanentImmunity ? majorHits : majorHits;
                summary.push(`§eBear Hits: §f${hitCount}/${hitsNeeded}`);
            } else if (hasInfection && infectionKnowledge >= 1) {
                const infectionType = infectionState.infectionType || MAJOR_INFECTION_TYPE;
                const isMinor = infectionType === MINOR_INFECTION_TYPE;
                if (isMinor) {
                    const currentHits = bearHitCount.get(player.id) || 0;
                    if (currentHits > 0) {
                        summary.push(`§eBear Hits: §f${currentHits}/${minorToMajorHits} (until major infection)`);
                    }
                    // Only show progression warning if player has learned about it
                    const hasProgressionKnowledge = codex.infections.major.discovered || hasPermanentImmunity;
                    if (hasProgressionKnowledge) {
                        summary.push(`§7Warning: ${minorToMajorHits} hit${minorToMajorHits !== 1 ? "s" : ""} OR 1 "snow" = Major Infection`);
                    }
                }
            }
        }

        try { if (hasInfection) markCodex(player, "status.bearTimerSeen"); if (immune) markCodex(player, "status.immuneKnown"); } catch { }
        return summary.join("\n");
    }

    function sectionHasNewOrUpdated(codex, sectionId) {
        const unlock = codex.journal?.sectionLastUnlock?.[sectionId];
        const viewed = codex.journal?.sectionLastViewed?.[sectionId];
        const neverViewed = viewed == null;
        if (neverViewed) return { new: true, updated: false };
        if (!unlock) return { new: false, updated: false };
        const updated = unlock > viewed;
        return { new: false, updated };
    }

    function subsectionHasNewOrUpdated(codex, subsectionPath) {
        const unlock = codex.journal?.subsectionLastUnlock?.[subsectionPath];
        const viewed = codex.journal?.subsectionLastViewed?.[subsectionPath];
        if (!unlock) return { new: false, updated: false };
        const neverViewed = viewed == null;
        const updated = !neverViewed && unlock > viewed;
        return { new: neverViewed, updated };
    }

    function openMain() {
        const codex = getCodex(player);
        const form = new ActionFormData().title("§6Powdery Journal");
        form.body(`${buildSummary()}\n\n§eChoose a section:`);
        
        const buttons = [];
        const buttonActions = [];
        
        function addSectionButton(baseLabel, sectionId, action) {
            const state = sectionId ? sectionHasNewOrUpdated(codex, sectionId) : { new: false, updated: false };
            let label = baseLabel;
            if (state.new || state.updated) {
                label = `§l§o${baseLabel} §8(${state.new ? "new" : "updated"})`;
            }
            buttons.push(label);
            buttonActions.push(action);
        }
        
        // Infection - always available
        addSectionButton("§fInfection", "infection", () => openInfections());
        
        const hasAnySymptoms = Object.values(codex.effects).some(seen => seen);
        const hasAnySnowEffects = Object.values(codex.snowEffects).some(seen => seen);
        const hasSnowKnowledge = codex.items.snowIdentified;
        const maxSnow = maxSnowLevels.get(player.id);
        if (hasAnySymptoms || hasAnySnowEffects || (hasSnowKnowledge && maxSnow && maxSnow.maxLevel > 0)) {
            addSectionButton("§fSymptoms", "symptoms", () => openSymptoms());
        }
        
        const hasAnyMobs = Object.values(codex.mobs).some(seen => seen === true);
        if (hasAnyMobs) {
            addSectionButton("§fMobs", "mobs", () => openMobs());
        }
        
        const hasAnyItems = Object.values(codex.items).some(seen => seen);
        if (hasAnyItems) {
            addSectionButton("§fItems", "items", () => openItems());
        }
        
        const hasAnyBiomes = codex.biomes.infectedBiomeSeen || codex.biomes.dustedDirtSeen || codex.biomes.snowLayerSeen || codex.biomes.stormSeen;
        if (hasAnyBiomes) {
            addSectionButton("§fBiomes and Blocks", "biomes", () => openBiomes());
        }
        
        const hasEndgameLore = !!(codex.journal?.day20TinyLoreUnlocked || codex.journal?.day20InfectedLoreUnlocked || codex.journal?.day20BuffLoreUnlocked || codex.journal?.day20WorldLoreUnlocked);
        if (hasEndgameLore) {
            addSectionButton("§fLate Lore", "lateLore", () => openLateLore());
        }

        const currentDay = getCurrentDay ? getCurrentDay() : 0;
        const hasDailyEvents = codex.dailyEvents && Object.keys(codex.dailyEvents).length > 0;
        const hasTimelineContent = currentDay >= 2 || hasDailyEvents;
        if (hasTimelineContent) {
            addSectionButton("§fTimeline", "timeline", () => openTimeline());
        }

        addSectionButton("§fAchievements", "achievements", () => openAchievements());

        const hasDebugOptions = (player.hasTag && player.hasTag("mb_cheats")) || Boolean(system?.isEnableCheats?.());
        if (hasDebugOptions) {
            // Pinned dev tools (quick access from main menu)
            const pinned = getPinnedDevItems(player);
            for (const itemId of pinned) {
                const item = PINNABLE_DEV_ITEMS.find(i => i.id === itemId);
                if (item) {
                    buttons.push("§f" + item.label + " §8(pinned)");
                    buttonActions.push(item.action);
                }
            }
            buttons.push("§bDebug Menu");
            buttonActions.push(() => openDebugMenu());
            buttons.push("§cDeveloper Tools");
            buttonActions.push(() => openDeveloperTools());
        }
        
        buttons.push("§eSettings");
        buttonActions.push(() => openSettings());
        
        const settings = getSettings();
        if (settings.showSearchButton) {
            buttons.push("§bSearch");
            buttonActions.push(() => openSearch());
        }
        
        for (const button of buttons) {
            form.button(button);
        }
        
        form.show(player).then((res) => {
            if (!res || res.canceled) {
                // Play journal close sound when canceling/closing
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_close", { pitch: 1.0, volume: 1.0 * volumeMultiplier });
                return;
            }
            const sel = res.selection;
            if (sel >= 0 && sel < buttonActions.length) {
                // Play page turn sound for navigation
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                buttonActions[sel]();
            }
        }).catch(() => { });
    }

    function openInfections() {
        markSectionViewed(player, "infection");
        const codex = getCodex(player);
        const lines = [];
        const infectionState = playerInfection.get(player.id);
        const hasInfection = infectionState && !infectionState.cured && infectionState.ticksLeft > 0;
        const infectionType = hasInfection ? (infectionState.infectionType || MAJOR_INFECTION_TYPE) : null;
        const isMinor = hasInfection && (infectionType === MINOR_INFECTION_TYPE);
        const hasPermanentImmunity = getPlayerProperty(player, PERMANENT_IMMUNITY_PROPERTY) === true;
        const minorInfectionCured = getPlayerProperty(player, "mb_minor_infection_cured") === true;
        const minorDiscovered = codex.infections.minor && (typeof codex.infections.minor === "object" ? codex.infections.minor.discovered : !!codex.infections.minor);
        const majorDiscovered = codex.infections.major && (typeof codex.infections.major === "object" ? codex.infections.major.discovered : !!codex.infections.major);
        
        if (codex.infections.bear.discovered || codex.infections.snow.discovered || minorDiscovered || majorDiscovered || hasInfection || hasPermanentImmunity) {
            lines.push("§eThe Infection");
            lines.push("");

            // First-aid quick reference: only if they've unlocked all cure items and cured themselves before
            const hasCuredBefore = (codex.history?.totalCures > 0) || codex.cures?.minorCureDoneAt || hasPermanentImmunity;
            const allCureItemsUnlocked = !!(codex.items?.goldenAppleSeen && codex.items?.goldenCarrotSeen && codex.items?.weaknessPotionSeen && codex.items?.enchantedGoldenAppleSeen && codex.cures?.bearCureKnown);
            if (hasCuredBefore && allCureItemsUnlocked) {
                lines.push("§6Quick reference: §7Minor: Golden Apple + Golden Carrot. §cMajor: Weakness + Enchanted Golden Apple.");
                lines.push("");
            }
            
            // Show current infection status - progressive based on experience
            if (hasInfection) {
                const isMinor = infectionType === MINOR_INFECTION_TYPE;
                if (isMinor) {
                    lines.push("§cCurrent Status: Minor Infection");
                    if (infectionState.ticksLeft > 0) {
                        const daysLeft = Math.ceil(infectionState.ticksLeft / 24000);
                        lines.push(`§7Time remaining: §f${daysLeft} day${daysLeft !== 1 ? 's' : ''}`);
                    }
                    lines.push("§7You have a minor infection. Effects are mild.");
                    
                    // Only show cure info if cure items discovered
                    const hasGoldenApple = codex.items.goldenAppleSeen;
                    const hasGoldenCarrot = codex.items.goldenCarrotSeen;
                    if (hasGoldenApple && hasGoldenCarrot) {
                        lines.push("§7You can still be cured with a Golden Apple + Golden Carrot.");
                    }
                } else {
                    lines.push("§4Current Status: Major Infection");
                    if (infectionState.ticksLeft > 0) {
                        const daysLeft = Math.ceil(infectionState.ticksLeft / 24000);
                        lines.push(`§7Time remaining: §f${daysLeft} day${daysLeft !== 1 ? 's' : ''}`);
                    }
                    lines.push("§7You have a major infection. Effects are severe and worsen over time.");
                    
                    // Only show cure info if cure items discovered
                    const hasWeaknessPotion = codex.items.weaknessPotionSeen;
                    const hasEnchantedApple = codex.items.enchantedGoldenAppleSeen;
                    if (hasWeaknessPotion && hasEnchantedApple && codex.cures.bearCureKnown) {
                        lines.push("§7Cure requires Weakness effect + Enchanted Golden Apple.");
                    }
                }
                lines.push("");
            } else if (hasPermanentImmunity) {
                const immuneHits = getAddonDifficultyState().hitsBase;
                lines.push("§aCurrent Status: Permanently Immune");
                lines.push("§7You have cured your minor infection and gained permanent immunity.");
                lines.push("§7You will never contract minor infection again.");
                lines.push(`§7You now require ${immuneHits} hits from Maple Bears to get infected.`);
                lines.push("");
            } else {
                lines.push("§aCurrent Status: Healthy");
                lines.push("");
            }
            
            // Minor vs Major Infection Section - gated behind experience
            lines.push("§6Infection Types:");
            lines.push("");
            
            // Minor Infection - only show if experienced
            const hasMinorExperience = minorDiscovered || isMinor || hasPermanentImmunity;
            const hasHadMinorInfection = minorDiscovered;
            if (hasMinorExperience) {
                lines.push("§eMinor Infection:");
                
                // Timer info - only show if experienced
                // Note: Timer is scaled based on day, but we show "10-day timer" as the base concept
                if (isMinor || hasPermanentImmunity || hasHadMinorInfection) {
                    lines.push("§7• Timer: Varies by day (scales down as world becomes more infected)");
                } else {
                    lines.push("§7• Timer: §8???");
                }
                
                // Effects - only show if experienced
                const minorEffects = codex.minorInfectionEffects || {};
                const hasSlowness = minorEffects.slownessSeen;
                const hasWeakness = minorEffects.weaknessSeen;
                
                if (hasSlowness || hasWeakness) {
                    const effectList = [];
                    if (hasSlowness) effectList.push("Slowness I");
                    if (hasWeakness) effectList.push("Weakness I");
                    lines.push(`§7• Mild effects: ${effectList.join(", ")}`);
                } else if (isMinor || hasPermanentImmunity) {
                    lines.push("§7• Mild effects: §8???");
                }
                
                // Cure info - only show if cure items discovered
                const hasGoldenApple = codex.items.goldenAppleSeen;
                const hasGoldenCarrot = codex.items.goldenCarrotSeen;
                
                if (hasGoldenApple && hasGoldenCarrot) {
                    lines.push("§7• Can be cured with: Golden Apple + Golden Carrot");
                    lines.push("§7• Cure grants: §aPermanent Immunity§7");
                } else if (hasGoldenApple || hasGoldenCarrot) {
                    lines.push("§7• Cure: §8??? (one component discovered)");
                } else {
                    lines.push("§7• Cure: §8???");
                }
                
                // Progression info - only show if learned about it
                const hasProgressionKnowledge = majorDiscovered || hasPermanentImmunity;
                if (hasProgressionKnowledge) {
                    const minorToMajor = Math.max(1, getAddonDifficultyState().hitsBase - 1);
                    lines.push(`§7• Requires ${minorToMajor} hit${minorToMajor !== 1 ? "s" : ""} from Maple Bears to progress to major`);
                    lines.push("§7• OR 1 \"snow\" consumption to progress to major");
                }
                
                lines.push("");
            } else {
                lines.push("§eMinor Infection:");
                lines.push("§7You haven't experienced this type of infection yet.");
                lines.push("");
            }
            
            // Major Infection - only show if experienced
            const hasMajorExperience = majorDiscovered || (!isMinor && hasInfection);
            if (hasMajorExperience) {
                lines.push("§cMajor Infection:");
                
                // Timer info - only show if experienced
                if (!isMinor && hasInfection) {
                    lines.push("§7• 5-day timer");
                } else {
                    lines.push("§7• Timer: §8???");
                }
                
                // Effects - only show if experienced
                const hasMajorEffects = Object.values(codex.effects).some(seen => seen);
                if (hasMajorEffects) {
                    lines.push("§7• Severe effects: Multiple negative status effects");
                    lines.push("§7• Effects worsen over time");
                } else {
                    lines.push("§7• Effects: §8???");
                }
                
                // Cure info - only show if cure items discovered
                const hasWeaknessPotion = codex.items.weaknessPotionSeen;
                const hasEnchantedApple = codex.items.enchantedGoldenAppleSeen;
                
                if (hasWeaknessPotion && hasEnchantedApple && codex.cures.bearCureKnown) {
                    lines.push("§7• Can be cured with: Weakness effect + Enchanted Golden Apple");
                    lines.push("§7• Cure grants: §bTemporary Immunity§7 (5 minutes)");
                    lines.push("§7• Also grants: §aPermanent Immunity§7 (prevents minor infection on respawn)");
                } else if (hasWeaknessPotion || hasEnchantedApple) {
                    lines.push("§7• Cure: §8??? (one component discovered)");
                } else {
                    lines.push("§7• Cure: §8???");
                }
                
                lines.push("");
            } else {
                lines.push("§cMajor Infection:");
                lines.push("§7You haven't experienced this type of infection yet.");
                lines.push("");
            }
            
            // Progression Warning - only show if both infections experienced
            if (hasMinorExperience && hasMajorExperience) {
                const minorToMajorHits = Math.max(1, getAddonDifficultyState().hitsBase - 1);
                lines.push("§6Progression:");
                lines.push("§7• Minor infection can progress to major infection:");
                lines.push(`§7  - ${minorToMajorHits} hit${minorToMajorHits !== 1 ? "s" : ""} from Maple Bears`);
                lines.push("§7  - OR 1 \"snow\" consumption");
                lines.push("§c• Warning: Minor infection is more easily treatable.");
                lines.push("§c  Once it becomes major, the cure becomes much more difficult.");
                lines.push("");
            }
            
            // Cure Information - gated behind experience and discovery
            lines.push("§6Cure Information:");
            lines.push("");
            
            // Minor Infection Cure - only show if minor infection experienced AND cure items discovered
            if (hasMinorExperience) {
                lines.push("§eMinor Infection Cure:");
                const hasGoldenApple = codex.items.goldenAppleSeen;
                const hasGoldenCarrot = codex.items.goldenCarrotSeen;
                
                if (hasGoldenApple && hasGoldenCarrot) {
                    const hasApple = getPlayerProperty(player, MINOR_CURE_GOLDEN_APPLE_PROPERTY) === true;
                    const hasCarrot = getPlayerProperty(player, MINOR_CURE_GOLDEN_CARROT_PROPERTY) === true;
                    lines.push(`§7  Golden Apple: ${hasApple ? '§a✓ Consumed' : '§eDiscovered'}`);
                    lines.push(`§7  Golden Carrot: ${hasCarrot ? '§a✓ Consumed' : '§eDiscovered'}`);
                    lines.push("§7  Both must be consumed separately (any order)");
                    lines.push("§7  Effect: §aPermanent Immunity§7 - prevents minor infection on respawn");
                } else if (hasGoldenApple || hasGoldenCarrot) {
                    lines.push("§7  Components: §8??? (one component discovered)");
                } else {
                    lines.push("§7  Components: §8???");
                }
                lines.push("");
            }
            
            // Major Infection Cure - only show if major infection experienced AND cure items discovered
            if (hasMajorExperience) {
                lines.push("§cMajor Infection Cure:");
                const hasWeaknessPotion = codex.items.weaknessPotionSeen;
                const hasEnchantedApple = codex.items.enchantedGoldenAppleSeen;
                
                if (hasWeaknessPotion && hasEnchantedApple && codex.cures.bearCureKnown) {
                    const addonCure = getAddonDifficultyState();
                    const immuneHits = addonCure.hitsBase;
                    const normalHits = Math.max(1, addonCure.hitsBase - 1);
                    lines.push("§7  Weakness effect + Enchanted Golden Apple");
                    lines.push("§7  Effect: §aPermanent Immunity§7 (prevents minor infection on respawn)");
                    lines.push("§7  Also grants: §bTemporary Immunity§7 (5 minutes)");
                    lines.push(`§7  Requires: ${immuneHits} hits from Maple Bears to get infected (instead of ${normalHits})`);
                } else if (hasWeaknessPotion || hasEnchantedApple) {
                    lines.push("§7  Components: §8??? (one component discovered)");
                } else {
                    lines.push("§8  ???");
                }
                lines.push("");
            }
            
            // Infection Mechanics
            lines.push("§6Infection Mechanics:");
            lines.push("§7• Maple Bears can infect you through attacks");
            lines.push("§7• Infection progresses through multiple stages");
            lines.push("§7• Symptoms worsen as infection advances");
            lines.push("§7• Snow consumption affects the timer (major infection only)");
            lines.push("§7• Conversion rate increases with each day");
            lines.push("§7• By Day 20, all mob kills convert to infected variants");
            
            // Add infection history if available
            if (codex.history.totalInfections > 0) {
                lines.push("");
                lines.push("§6Infection History:");
                lines.push(`§7Total Infections: §f${codex.history.totalInfections}`);
                lines.push(`§7Total Cures: §f${codex.history.totalCures}`);
                if (minorInfectionCured) {
                    lines.push(`§7Minor Infection Cured: §aYes (Permanent Immunity)`);
                }
                
                if (codex.history.firstInfectionAt > 0) {
                    const firstDate = new Date(codex.history.firstInfectionAt);
                    lines.push(`§7First Infection: §f${firstDate.toLocaleDateString()}`);
                }
                
                if (codex.history.lastInfectionAt > 0) {
                    const lastDate = new Date(codex.history.lastInfectionAt);
                    lines.push(`§7Last Infection: §f${lastDate.toLocaleDateString()}`);
                }
                
                if (codex.history.lastCureAt > 0) {
                    const lastCureDate = new Date(codex.history.lastCureAt);
                    lines.push(`§7Last Cure: §f${lastCureDate.toLocaleDateString()}`);
                }
            }
        } else {
            lines.push("§e???");
        }
        
        new ActionFormData().title("§6Infection").body(lines.join("\n")).button("§8Back").show(player).then(() => {
            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
            openMain();
        });
    }

    function openSymptoms() {
        markSectionViewed(player, "symptoms");
        const codex = getCodex(player);
        
        // Calculate infection status from context
        const infectionState = playerInfection.get(player.id);
        const hasInfection = infectionState && !infectionState.cured && infectionState.ticksLeft > 0;
        
        // Check unlock conditions
        const hasSnowKnowledge = codex.items.snowIdentified;
        const maxSnow = maxSnowLevels.get(player.id);
        const hasAnyInfection = hasInfection;
        
        // Progressive unlock conditions - only show if content is actually experienced
        const showSnowTierAnalysis = codex.symptomsUnlocks.snowTierAnalysisUnlocked || 
                                    ((hasSnowKnowledge && maxSnow && maxSnow.maxLevel > 0) || hasAnyInfection);
        const showInfectionSymptoms = Object.values(codex.effects).some(seen => seen);
        const showSnowEffects = Object.values(codex.snowEffects).some(seen => seen);
        const infectionType = hasInfection ? (infectionState.infectionType || MAJOR_INFECTION_TYPE) : null;
        const hasMinorInfection = infectionType === MINOR_INFECTION_TYPE;
        const hasHadMinorInfection = codex.infections.minor.discovered;
        const showMinorInfectionAnalysis = codex.symptomsUnlocks.minorInfectionAnalysisUnlocked || 
                                          hasMinorInfection || hasHadMinorInfection;
        
        const form = new ActionFormData().title("§6Symptoms");
        
        // Check if any content is available
        if (!showSnowTierAnalysis && !showInfectionSymptoms && !showSnowEffects && !showMinorInfectionAnalysis) {
            form.body("§7No symptoms have been experienced yet.\n§8You need to experience effects while infected to unlock symptom information.");
            form.button("§8Back");
        } else {
            form.body("§7Select a category to view:");
            
            let buttonIndex = 0;
            
            // Add snow tier analysis at the top if unlocked
            if (showSnowTierAnalysis) {
                form.button(`§eInfection Level Analysis`);
                buttonIndex++;
            }
            
            // Add minor infection analysis if unlocked
            if (showMinorInfectionAnalysis) {
                form.button("§eMinor Infection Analysis");
                buttonIndex++;
            }
            
            // Add infection symptoms if unlocked
            if (showInfectionSymptoms) {
                form.button("§cInfection Symptoms");
                buttonIndex++;
            }
            
            // Add snow effects if unlocked
            if (showSnowEffects) {
                form.button("§b\"Snow\" Effects");
                buttonIndex++;
            }
            
            form.button("§8Back");
        }
        form.show(player).then((res) => {
            if (!res || res.canceled) return;

            // Play page turn sound
            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
            
            // If no content available, just go back
            if (!showSnowTierAnalysis && !showInfectionSymptoms && !showSnowEffects && !showMinorInfectionAnalysis) {
                openMain();
                return;
            }
            
            let currentIndex = 0;
            
            if (showSnowTierAnalysis && res.selection === currentIndex) {
                openSnowTierAnalysis();
                return;
            }
            if (showSnowTierAnalysis) currentIndex++;
            
            if (showMinorInfectionAnalysis && res.selection === currentIndex) {
                openMinorInfectionAnalysis();
                return;
            }
            if (showMinorInfectionAnalysis) currentIndex++;
            
            if (showInfectionSymptoms && res.selection === currentIndex) {
                openInfectionSymptoms();
                return;
            }
            if (showInfectionSymptoms) currentIndex++;
            
            if (showSnowEffects && res.selection === currentIndex) {
                openSnowEffects();
                return;
            }
            
            openMain();
        });
    }
    
    function openInfectionSymptoms() {
        const codex = getCodex(player);
        const allEntries = [
            { key: "weaknessSeen", title: "Weakness", id: "minecraft:weakness" },
            { key: "nauseaSeen", title: "Nausea", id: "minecraft:nausea" },
            { key: "blindnessSeen", title: "Blindness", id: "minecraft:blindness" },
            { key: "slownessSeen", title: "Slowness", id: "minecraft:slowness" },
            { key: "hungerSeen", title: "Hunger", id: "minecraft:hunger" }
        ];
        
        // Only show experienced symptoms
        const entries = allEntries.filter(e => codex.effects[e.key]);
        
        const form = new ActionFormData().title("§6Infection Symptoms");
        
        if (entries.length === 0) {
            form.body("§7No infection symptoms have been experienced yet.\n§8You need to experience negative effects while infected to unlock symptom information.");
            form.button("§8Back");
        } else {
            form.body("§7Select a symptom to view details:");
            
            for (const e of entries) {
                let label = `§f${e.title}`;
                const subPath = "effects." + e.key;
                const subState = subsectionHasNewOrUpdated(codex, subPath);
                if (subState.new || subState.updated) {
                    label = `§l§o${label} §8(${subState.new ? "new" : "updated"})`;
                }
                form.button(label);
            }
            
            form.button("§8Back");
        }
        form.show(player).then((res) => {
            if (!res || res.canceled) return openSymptoms();

            // Play page turn sound
            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
            
            // If no symptoms available, just go back
            if (entries.length === 0) {
                openSymptoms();
                return;
            }
            
            if (res.selection >= 0 && res.selection < entries.length) {
                const e = entries[res.selection];
                const known = codex.effects[e.key];
                if (known) markSubsectionViewed(player, "effects." + e.key);
                let body = "§e???";
                if (known) {
                    const meta = (codex.symptomsMeta || {})[e.id] || {};
                    const srcs = Object.keys(meta.sources || {}).length ? Object.keys(meta.sources).join(", ") : "unknown";
                    const minDur = meta.minDuration != null ? Math.floor((meta.minDuration || 0) / 20) : "?";
                    const maxDur = meta.maxDuration != null ? Math.floor((meta.maxDuration || 0) / 20) : "?";
                    const minAmp = meta.minAmp != null ? meta.minAmp : "?";
                    const maxAmp = meta.maxAmp != null ? meta.maxAmp : "?";
                    const timing = meta.timing || {}; 
                    const timingStr = [timing.early ? `early(${timing.early})` : null, timing.mid ? `mid(${timing.mid})` : null, timing.late ? `late(${timing.late})` : null].filter(Boolean).join(", ") || "unknown";
                    const sc = meta.snowCounts || {};
                    const snowStr = [sc.low ? `1-5(${sc.low})` : null, sc.mid ? `6-10(${sc.mid})` : null, sc.high ? `11+(${sc.high})` : null].filter(Boolean).join(", ") || "-";
                    body = `§e${e.title}\n§7Sources: §f${srcs}\n§7Duration: §f${minDur}s - ${maxDur}s\n§7Amplifier: §f${minAmp} - ${maxAmp}\n§7Timing: §f${timingStr}\n§7"Snow" Count: §f${snowStr}`;
                }
                new ActionFormData().title(`§6Infection Symptoms: ${known ? e.title : '???'}`).body(body).button("§8Back").show(player).then(() => {
                    const volumeMultiplier = getPlayerSoundVolume(player);
                    player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                    openInfectionSymptoms();
                });
            } else {
                openSymptoms();
            }
        });
    }
    
    function openSnowEffects() {
        const codex = getCodex(player);
        const allEntries = [
            { key: "regenerationSeen", title: "Regeneration", id: "minecraft:regeneration", type: "positive" },
            { key: "speedSeen", title: "Speed", id: "minecraft:speed", type: "positive" },
            { key: "jumpBoostSeen", title: "Jump Boost", id: "minecraft:jump_boost", type: "positive" },
            { key: "strengthSeen", title: "Strength", id: "minecraft:strength", type: "positive" },
            { key: "weaknessSeen", title: "Weakness", id: "minecraft:weakness", type: "negative" },
            { key: "nauseaSeen", title: "Nausea", id: "minecraft:nausea", type: "negative" },
            { key: "slownessSeen", title: "Slowness", id: "minecraft:slowness", type: "negative" },
            { key: "blindnessSeen", title: "Blindness", id: "minecraft:blindness", type: "negative" },
            { key: "hungerSeen", title: "Hunger", id: "minecraft:hunger", type: "negative" },
            { key: "miningFatigueSeen", title: "Mining Fatigue", id: "minecraft:mining_fatigue", type: "negative" }
        ];
        
        // Only show experienced snow effects
        const entries = allEntries.filter(e => codex.snowEffects[e.key]);
        
        const form = new ActionFormData().title("§6\"Snow\" Effects");
        
        if (entries.length === 0) {
            form.body("§7No \"snow\" effects have been experienced yet.\n§8You need to consume \"snow\" while infected to unlock effect information.");
            form.button("§8Back");
        } else {
            form.body("§7Select an effect to view details:");
            
            for (const e of entries) {
                const color = e.type === "positive" ? "§a" : "§c";
                const prefix = e.type === "positive" ? "§a+" : "§c-";
                let label = `${color}${prefix} ${e.title}`;
                const subPath = "snowEffects." + e.key;
                const subState = subsectionHasNewOrUpdated(codex, subPath);
                if (subState.new || subState.updated) {
                    label = `§l§o${label} §8(${subState.new ? "new" : "updated"})`;
                }
                form.button(label);
            }
            
            form.button("§8Back");
        }
        form.show(player).then((res) => {
            if (!res || res.canceled) return openSymptoms();

            // Play page turn sound
            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
            
            // If no effects available, just go back
            if (entries.length === 0) {
                openSymptoms();
                return;
            }
            
            if (res.selection >= 0 && res.selection < entries.length) {
                const e = entries[res.selection];
                const known = codex.snowEffects[e.key];
                if (known) markSubsectionViewed(player, "snowEffects." + e.key);
                let body = "§e???";
                if (known) {
                    const effectType = e.type === "positive" ? "§aBeneficial" : "§cHarmful";
                    const description = e.type === "positive" ? "This effect provides benefits when consumed with \"snow\"." : "This effect causes negative effects when consumed with \"snow\".";
                    body = `§e${e.title}\n§7Type: ${effectType}\n§7Description: §f${description}\n\n§7This effect can be obtained by consuming \"snow\" while infected. The chance and intensity depend on your infection level.`;
                }
                new ActionFormData().title(`§6"Snow" Effects: ${known ? e.title : '???'}`).body(body).button("§8Back").show(player).then(() => {
                    const volumeMultiplier = getPlayerSoundVolume(player);
                    player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                    openSnowEffects();
                });
            } else {
                openSymptoms();
            }
        });
    }
    
    function openSnowTierAnalysis() {
        const codex = getCodex(player);
        const maxSnow = maxSnowLevels.get(player.id);
        const infectionState = playerInfection.get(player.id);
        const currentSnow = infectionState ? (infectionState.snowCount || 0) : 0;
        
        const form = new ActionFormData().title("§6Infection Level Analysis");
        
        // Check if maxSnow exists, otherwise use 0
        const maxLevel = maxSnow ? maxSnow.maxLevel : 0;
        let body = `§eMaximum Infection Level Achieved: §f${maxLevel.toFixed(1)}\n\n`;
        
        // Detailed analysis based on experience
        if (maxLevel >= 5) {
            body += `§7Tier 1 (1-5): §fThe Awakening\n`;
            body += `§7• Time effect: +5% infection time\n`;
            body += `§7• Effects: Mild random potions (weakness, nausea)\n`;
            body += `§7• Duration: 10 seconds\n`;
        }
        
        if (maxLevel >= 10) {
            body += `\n§7Tier 2 (6-10): §fThe Craving\n`;
            body += `§7• Time effect: No change\n`;
            body += `§7• Effects: Moderate random potions (weakness, nausea, slowness)\n`;
            body += `§7• Duration: 15 seconds\n`;
        }
        
        if (maxLevel >= 20) {
            body += `\n§7Tier 3 (11-20): §fThe Descent\n`;
            body += `§7• Time effect: -1% infection time\n`;
            body += `§7• Effects: Strong random potions (weakness, nausea, slowness, blindness)\n`;
            body += `§7• Duration: 20 seconds\n`;
        }
        
        if (maxLevel >= 50) {
            body += `\n§7Tier 4 (21-50): §fThe Void\n`;
            body += `§7• Time effect: -2.5% infection time\n`;
            body += `§7• Effects: Severe random potions (weakness, nausea, slowness, blindness, hunger)\n`;
            body += `§7• Duration: 25 seconds\n`;
        }
        
        if (maxLevel >= 100) {
            body += `\n§7Tier 5 (51-100): §fThe Abyss\n`;
            body += `§7• Time effect: -5% infection time\n`;
            body += `§7• Effects: Extreme random potions (all effects + mining fatigue)\n`;
            body += `§7• Duration: 30 seconds\n`;
        }
        
        if (maxLevel > 100) {
            body += `\n§7Tier 6 (100+): §fThe Black Void\n`;
            body += `§7• Time effect: -15% infection time\n`;
            body += `§7• Effects: Devastating random potions (maximum intensity)\n`;
            body += `§7• Duration: 40 seconds\n`;
        }
        
        // Show current status if infected
        const hasInfection = infectionState && !infectionState.cured && infectionState.ticksLeft > 0;
        
        if (hasInfection) {
            body += `\n§eCurrent Infection Level: §f${currentSnow.toFixed(1)}`;
            if (currentSnow > 0) {
                const tier = currentSnow <= 5 ? 1 : currentSnow <= 10 ? 2 : currentSnow <= 20 ? 3 : currentSnow <= 50 ? 4 : currentSnow <= 100 ? 5 : 6;
                const tierName = currentSnow <= 5 ? "The Awakening" : currentSnow <= 10 ? "The Craving" : currentSnow <= 20 ? "The Descent" : currentSnow <= 50 ? "The Void" : currentSnow <= 100 ? "The Abyss" : "The Black Void";
                body += `\n§7Current Tier: §f${tier} (${tierName})`;
            }
        }
        
        // Show warnings based on experience
        if (maxLevel >= 20) {
            body += `\n\n§c⚠ Warning: High infection levels are extremely dangerous!`;
        } else if (maxLevel >= 10) {
            body += `\n\n§e⚠ Caution: Infection effects become severe at higher levels.`;
        }
        
        form.body(body);
        form.button("§8Back");
        form.show(player).then(() => openSymptoms());
    }

    function openMinorInfectionAnalysis() {
        const codex = getCodex(player);
        const infectionState = playerInfection.get(player.id);
        const hasInfection = infectionState && !infectionState.cured && infectionState.ticksLeft > 0;
        const infectionType = hasInfection ? (infectionState.infectionType || MAJOR_INFECTION_TYPE) : null;
        const isMinor = infectionType === MINOR_INFECTION_TYPE;
        const hasPermanentImmunity = getPlayerProperty(player, PERMANENT_IMMUNITY_PROPERTY) === true;
        const hasHadMinorInfection = codex.infections.minor.discovered;
        
        const form = new ActionFormData().title("§6Minor Infection Analysis");
        
        let body = "";
        
        // Basic information - always show if minor infection has been experienced
        if (isMinor || hasHadMinorInfection || hasPermanentImmunity) {
            body += "§eMinor Infection\n\n";
            body += "§7You have been infected with a minor infection.\n";
            
            // Timer information - progressive revelation
            if (isMinor && infectionState) {
                const daysLeft = Math.ceil(infectionState.ticksLeft / 24000);
                body += `§7Time remaining: §f${daysLeft} day${daysLeft !== 1 ? 's' : ''}\n`;
            } else if (hasHadMinorInfection || hasPermanentImmunity) {
                body += "§7Timer: §f10-day timer\n";
            }
            
            body += "\n";
            
            // Effects discovered - only show if experienced
            const minorEffects = codex.minorInfectionEffects || {};
            const hasSlowness = minorEffects.slownessSeen;
            const hasWeakness = minorEffects.weaknessSeen;
            
            if (hasSlowness || hasWeakness) {
                body += "§6Effects Experienced:\n";
                
                if (hasSlowness) {
                    body += "§7• §fSlowness§7: Reduces movement speed. Applied periodically (every 4 minutes).\n";
                }
                
                if (hasWeakness) {
                    body += "§7• §fWeakness§7: Reduces attack damage. Applied periodically (every 4 minutes).\n";
                }
                
                body += "\n";
            } else if (isMinor) {
                body += "§7Effects: §fMild effects (slowness, weakness) are applied periodically.\n\n";
            }
            
            // Cure information - only show if cure items have been discovered
            const hasGoldenApple = codex.items.goldenAppleSeen;
            const hasGoldenCarrot = codex.items.goldenCarrotSeen;
            
            if (hasGoldenApple || hasGoldenCarrot) {
                body += "§6Cure Information:\n";
                
                if (isMinor) {
                    const hasApple = getPlayerProperty(player, MINOR_CURE_GOLDEN_APPLE_PROPERTY) === true;
                    const hasCarrot = getPlayerProperty(player, MINOR_CURE_GOLDEN_CARROT_PROPERTY) === true;
                    
                    body += "§7Cure components:\n";
                    body += `§7  Golden Apple: ${hasApple ? '§a✓ Consumed' : (hasGoldenApple ? '§eDiscovered' : '§c✗ Not discovered')}\n`;
                    body += `§7  Golden Carrot: ${hasCarrot ? '§a✓ Consumed' : (hasGoldenCarrot ? '§eDiscovered' : '§c✗ Not discovered')}\n`;
                    
                    if (hasApple && hasCarrot) {
                        body += "\n§aBoth components consumed! The cure is taking effect...\n";
                    } else if (hasApple || hasCarrot) {
                        body += "\n§7Consume both components separately (any order) to gain permanent immunity.\n";
                    } else {
                        body += "\n§7Both must be consumed separately (any order).\n";
                        body += "§7Effect: §aPermanent Immunity§7 - prevents minor infection on respawn.\n";
                    }
                } else if (hasPermanentImmunity) {
                    const addonImm = getAddonDifficultyState();
                    body += "§aYou have already cured your minor infection and gained permanent immunity.\n";
                    body += "§7You will never contract minor infection again.\n";
                    body += `§7You now require ${addonImm.hitsBase} hits from Maple Bears to get infected (instead of ${Math.max(1, addonImm.hitsBase - 1)}).\n`;
                } else {
                    body += "§7Cure: Golden Apple + Golden Carrot\n";
                    body += "§7Both must be consumed separately (any order).\n";
                    body += "§7Effect: §aPermanent Immunity§7 - prevents minor infection on respawn.\n";
                }
                
                body += "\n";
            } else if (isMinor) {
                body += "§7Cure: §8???\n";
                body += "§8You haven't discovered the cure components yet.\n\n";
            }
            
            // Progression information - only show if player has learned about it
            const hasProgressionKnowledge = hasHadMinorInfection && (codex.infections.major.discovered || hasPermanentImmunity);
            
            if (hasProgressionKnowledge) {
                const minorToMajor = Math.max(1, getAddonDifficultyState().hitsBase - 1);
                body += "§6Progression:\n";
                body += "§7Minor infection can progress to major infection:\n";
                body += `§7  • ${minorToMajor} hit${minorToMajor !== 1 ? "s" : ""} from Maple Bears\n`;
                body += "§7  • OR 1 \"snow\" consumption\n";
                body += "§cWarning: Minor infection is more easily treatable.\n";
                body += "§cOnce it becomes major, the cure becomes much more difficult.\n";
            } else if (isMinor) {
                body += "§7Progression: §8???\n";
                body += "§8You haven't learned about progression yet.\n";
            }
        } else {
            body += "§7You haven't experienced minor infection yet.\n";
            body += "§8Minor infection information will appear here once you experience it.";
        }
        
        form.body(body);
        form.button("§8Back");
        form.show(player).then(() => {
            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
            openSymptoms();
        });
    }

    function openMobs() {
        markSectionViewed(player, "mobs");
        const codex = getCodex(player);
        const entries = [
            { key: "mapleBearSeen", title: "Tiny Maple Bear", icon: "textures/items/mb" },
            { key: "infectedBearSeen", title: "Infected Maple Bear", icon: "textures/items/Infected_human_mb_egg" },
            { key: "buffBearSeen", title: "Buff Maple Bear", icon: "textures/items/buff_mb_egg" },
            { key: "infectedPigSeen", title: "Infected Pig", icon: "textures/items/infected_pig_spawn_egg" },
            { key: "infectedCowSeen", title: "Infected Cow", icon: "textures/items/infected_cow_egg" },
            { key: "flyingBearSeen", title: "Flying Maple Bear", icon: "textures/items/flying_mb_egg_texture" },
            { key: "miningBearSeen", title: "Mining Maple Bear", icon: "textures/items/infected_day13_egg" },
            { key: "torpedoBearSeen", title: "Torpedo Maple Bear", icon: "textures/items/infected_day20_egg" }
        ];
        
        const form = new ActionFormData().title("§6Mobs");
        form.body("§7Entries:");
        for (const e of entries) {
            const known = codex.mobs[e.key];
            let label = `§f${maskTitle(e.title, known)}`;
            
            // Show kill count only if mob is known and has kills
            if (known) {
                let killCount = 0;
                if (e.key === "mapleBearSeen") {
                    killCount = codex.mobs.tinyBearKills || 0;
                } else if (e.key === "infectedBearSeen") {
                    killCount = codex.mobs.infectedBearKills || 0;
                } else if (e.key === "infectedPigSeen") {
                    killCount = codex.mobs.infectedPigKills || 0;
                } else if (e.key === "infectedCowSeen") {
                    killCount = codex.mobs.infectedCowKills || 0;
                } else if (e.key === "buffBearSeen") {
                    killCount = codex.mobs.buffBearKills || 0;
                } else if (e.key === "flyingBearSeen") {
                    killCount = codex.mobs.flyingBearKills || 0;
                } else if (e.key === "miningBearSeen") {
                    killCount = codex.mobs.miningBearKills || 0;
                } else if (e.key === "torpedoBearSeen") {
                    killCount = codex.mobs.torpedoBearKills || 0;
                }
                
                if (killCount > 0) {
                    label += ` §7(Kills: ${killCount})`;
                }
                const subPath = "mobs." + e.key;
                const subState = subsectionHasNewOrUpdated(codex, subPath);
                if (subState.new || subState.updated) {
                    label = `§l§o${label} §8(${subState.new ? "new" : "updated"})`;
                }
            }
            
            if (known) form.button(label, e.icon);
            else form.button(label);
        }
        form.button("§8Back");
        form.show(player).then((res) => {
            if (!res || res.canceled) return openMain();

            // Play page turn sound
            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
            if (res.selection >= 0 && res.selection < entries.length) {
                const e = entries[res.selection];
                const known = codex.mobs[e.key];
                if (known) markSubsectionViewed(player, "mobs." + e.key);
                let body = "§e???";
                
                if (known) {
                    // Get kill count (total kills including all variants)
                    let killCount = 0;
                    if (e.key === "mapleBearSeen") {
                        killCount = codex.mobs.tinyBearKills || 0; // This already includes all variants
                    } else if (e.key === "infectedBearSeen") {
                        killCount = codex.mobs.infectedBearKills || 0; // This already includes all variants
                    } else if (e.key === "infectedPigSeen") {
                        killCount = codex.mobs.infectedPigKills || 0;
                    } else if (e.key === "infectedCowSeen") {
                        killCount = codex.mobs.infectedCowKills || 0;
                    } else if (e.key === "buffBearSeen") {
                        killCount = codex.mobs.buffBearKills || 0; // This already includes all variants
                    } else if (e.key === "flyingBearSeen") {
                        killCount = codex.mobs.flyingBearKills || 0;
                    } else if (e.key === "miningBearSeen") {
                        killCount = codex.mobs.miningBearKills || 0;
                    } else if (e.key === "torpedoBearSeen") {
                        killCount = codex.mobs.torpedoBearKills || 0;
                    }

                    const bearKnowledge = getKnowledgeLevel(player, 'bearLevel');

                    // Determine if this is a Buff Bear for threshold adjustments
                    const isBuffBear = e.key === "buffBearSeen";

                    // Progressive information based on knowledge level and kills
                    if (bearKnowledge >= 1) {
                    body = `§e${e.title}\n§7Hostile entity involved in the outbreak.\n\n§6Kills: §f${killCount}`;
                    
                        // Basic stats (available at knowledge level 1)
                        if (killCount >= 5) {
                            body += `\n\n§6Basic Analysis:\n§7This creature appears to be dangerous and unpredictable.`;
                        }

                        if (e.key === "flyingBearSeen") {
                            body += `\n\n§6Field Notes:\n§7Sky hunters that shower you with the white powder—ground them or risk suffocation.`;
                        } else if (e.key === "miningBearSeen") {
                            body += `\n\n§6Field Notes:\n§7Engineers that carve 1x2 tunnels so more Maple Bears can march through.`;
                        } else if (e.key === "torpedoBearSeen") {
                            body += `\n\n§6Field Notes:\n§7Airborne battering rams that streak toward sky bases and burst into powdery shrapnel.`;
                        }

                        // Detailed stats (available at knowledge level 2)
                        if (bearKnowledge >= 2 && killCount >= 25) {
                            body += `\n\n§6Combat Analysis:`;
                            if (e.key === "mapleBearSeen") {
                                body += `\n§7Drop Rate: 60% chance\n§7Loot: 1 "snow" item\n§7Health: 1 HP\n§7Damage: 1`;
                            } else if (e.key === "infectedBearSeen") {
                                body += `\n§7Drop Rate: 80% chance\n§7Loot: 1-5 "snow" items\n§7Health: 20 HP\n§7Damage: 2.5`;
                            } else if (e.key === "infectedPigSeen") {
                                body += `\n§7Drop Rate: 75% chance\n§7Loot: 1-4 "snow" items\n§7Health: 10 HP\n§7Damage: 2\n§7Special: Can infect other mobs`;
                            } else if (e.key === "infectedCowSeen") {
                                body += `\n§7Drop Rate: 75% chance\n§7Loot: 1-4 "snow" items\n§7Health: 10 HP\n§7Damage: 2`;
                            } else if (e.key === "buffBearSeen") {
                                body += `\n§7Drop Rate: 80% chance\n§7Loot: 3-15 "snow" items\n§7Health: 100 HP\n§7Damage: 8`;
                            } else if (e.key === "flyingBearSeen") {
                                body += `\n§7Drop Rate: 80% chance\n§7Loot: 2-6 'Snow' (Powder) shavings & aerial kit\n§7Health: 50 HP (Day 20 patrols climb higher)\n§7Damage: 10\n§7Special: 70% low swoops, 30% high patrols dusting you from above.`;
                            } else if (e.key === "miningBearSeen") {
                                body += `\n§7Drop Rate: 85% chance\n§7Loot: 1-4 'Snow' (Powder) clumps plus tools\n§7Health: 50 HP (Day 20 engineers: 70 HP)\n§7Damage: 10-14\n§7Special: Mines one block at a time to open tunnels for the horde.`;
                            } else if (e.key === "torpedoBearSeen") {
                                body += `\n§7Drop Rate: 90% chance\n§7Loot: 3-8 'Snow' (Powder) shards & sky-salvage\n§7Health: 60 HP (Ascended torpedoes strike harder)\n§7Damage: 12+\n§7Special: Dive-bombs bases and chews through non-obsidian blocks mid-flight.`;
                            }
                        }

                        // Variant information (available at knowledge level 2+ with variant unlocks)
                        if (bearKnowledge >= 2 && killCount >= 10) {
                            let variantInfo = `\n\n§6Variant Analysis:`;
                            let hasVariants = false;

                            // Adjust kill thresholds for Buff Bears (mini-boss level)
                            const day4Threshold = isBuffBear ? 1 : 25; // Buff Bears only have original and day13 variants
                            const day8Threshold = isBuffBear ? 3 : 50; // Buff Bears only have original and day13 variants
                            const day13Threshold = isBuffBear ? 5 : 100; // Max info at 5 kills for Buff Bears
                            const day20Threshold = isBuffBear ? 8 : 150;

                            if (codex.mobs.day4VariantsUnlocked && killCount >= day4Threshold && !isBuffBear) {
                                variantInfo += `\n\n§eDay 4+ Variants:`;
                                hasVariants = true;
                                if (e.key === "mapleBearSeen") {
                                    variantInfo += `\n§7Enhanced: 1 HP, 1.5 Damage, 65% drop rate, 1-2 "snow" items`;
                                } else if (e.key === "infectedBearSeen") {
                                    variantInfo += `\n§7Enhanced: 25 HP, 2.5 Damage, 80% drop rate, 1-5 "snow" items`;
                                } else if (e.key === "infectedPigSeen") {
                                    variantInfo += `\n§7Enhanced: 10 HP, 1 Damage, 80% drop rate, 1-5 "snow" items\n§7Special: Enhanced infection spread`;
                                } else if (e.key === "infectedCowSeen") {
                                    variantInfo += `\n§7Enhanced: 10 HP, 1.5 Damage, 85% drop rate, 2-6 "snow" items\n§7Special: Improved conversion rate`;
                                }
                            }

                            if (codex.mobs.day8VariantsUnlocked && killCount >= day8Threshold && !isBuffBear) {
                                variantInfo += `\n\n§eDay 8+ Variants:`;
                                hasVariants = true;
                                if (e.key === "mapleBearSeen") {
                                    variantInfo += `\n§7Advanced: 2 HP, 2 Damage, 70% drop rate, 1-3 "snow" items`;
                                } else if (e.key === "infectedBearSeen") {
                                    variantInfo += `\n§7Advanced: 25 HP, 4 Damage, 90% drop rate, 2-8 "snow" items`;
                                } else if (e.key === "infectedPigSeen") {
                                    variantInfo += `\n§7Advanced: 10 HP, 1 Damage, 90% drop rate, 2-8 "snow" items\n§7Special: Maximum infection spread`;
                                } else if (e.key === "infectedCowSeen") {
                                    variantInfo += `\n§7Advanced: 10 HP, 1.5 Damage, 95% drop rate, 3-10 "snow" items\n§7Special: Maximum conversion rate`;
                                }
                            }

                            if (codex.mobs.day13VariantsUnlocked && killCount >= day13Threshold) {
                                variantInfo += `\n\n§eDay 13+ Variants:`;
                                hasVariants = true;
                                if (e.key === "mapleBearSeen") {
                                    variantInfo += `\n§7Ultimate: 3 HP, 3 Damage, 75% drop rate, 1-4 "snow" items\n§7Special: Enhanced speed and reach`;
                                } else if (e.key === "infectedBearSeen") {
                                    variantInfo += `\n§7Ultimate: 50 HP, 6 Damage, 95% drop rate, 3-12 "snow" items\n§7Special: Maximum threat level`;
                                } else if (e.key === "infectedPigSeen") {
                                    variantInfo += `\n§7Ultimate: 10 HP, 1 Damage, 95% drop rate, 3-12 "snow" items\n§7Special: Ultimate infection spread`;
                                } else if (e.key === "infectedCowSeen") {
                                    variantInfo += `\n§7Ultimate: 10 HP, 1.5 Damage, 98% drop rate, 4-15 "snow" items\n§7Special: Ultimate conversion rate`;
                                } else if (e.key === "buffBearSeen") {
                                    variantInfo += `\n§7Ultimate: 150 HP, 10 Damage, 98% drop rate, 8-30 "snow" items\n§7Special: Ultimate combat mastery`;
                                }
                            }

                            const day20Unlocked = Boolean(
                                e.key === "mapleBearSeen" ? codex.mobs?.day20VariantsUnlockedTiny :
                                e.key === "infectedBearSeen" ? codex.mobs?.day20VariantsUnlockedInfected :
                                e.key === "buffBearSeen" ? codex.mobs?.day20VariantsUnlockedBuff :
                                (e.key === "flyingBearSeen" || e.key === "miningBearSeen" || e.key === "torpedoBearSeen") ? codex.mobs?.day20VariantsUnlockedOther :
                                false
                            );

                            if (day20Unlocked && killCount >= day20Threshold) {
                                variantInfo += `\n\n§eDay 20+ Variants:`;
                                hasVariants = true;
                                if (e.key === "mapleBearSeen") {
                                    variantInfo += `\n§7Ascended: 5 HP, 4 Damage, 80% drop rate, 3-15 "snow" items\n§7Special: Swift flanking and synchronized strikes`;
                                } else if (e.key === "infectedBearSeen") {
                                    variantInfo += `\n§7Ascended: 40 HP, 8 Damage, 95% drop rate, 3-15 "snow" items\n§7Special: Dust saturation expands infection radius`;
                                } else if (e.key === "buffBearSeen") {
                                    variantInfo += `\n§7Ascended: 200 HP, 12 Damage, 98% drop rate, 5-18 "snow" items\n§7Special: Long-range leaps and crushing roar`;
                                }
                            }

                            if (e.key === "flyingBearSeen" && killCount >= 5) {
                                hasVariants = true;
                                variantInfo += `\n\n§eSky Doctrine:\n§7• Day 11-14 Skirmishers fly low and dust targets with white powder.\n§7• Day 15+ Patrols arc higher with wider strafes and armored claws.`;
                                if (day20Unlocked && killCount >= 8) {
                                    variantInfo += `\n§7• Day 20+ Stratos Wings linger above cloud-top bases and unleash torpedo escorts.`;
                                }
                            }

                            if (e.key === "miningBearSeen" && killCount >= 5) {
                                hasVariants = true;
                                variantInfo += `\n\n§eTunnel Doctrine:\n§7• Early engineers carve 1x2 passages and keep squads supplied with 'Snow' (Powder).\n§7• Coordinators (Day 15+) reserve build queues so only one miner breaks blocks at a time.`;
                                if (day20Unlocked && killCount >= 8) {
                                    variantInfo += `\n§7• Siege engineers (Day 20+) plan 1x3 access spirals so even buff bears can march through.`;
                                }
                            }

                            if (e.key === "torpedoBearSeen" && killCount >= 3) {
                                hasVariants = true;
                                variantInfo += `\n\n§eTorpedo Profiles:\n§7• Standard payloads dive from 30-70y and chew soft blocks mid-flight.\n§7• Reinforced payloads (Day 20+) spiral before impact to confuse archers.`;
                                if (day20Unlocked && killCount >= 6) {
                                    variantInfo += `\n§7• Ascended payloads call flying escorts and refuse to touch obsidian or netherite blocks.`;
                                }
                            }

                            if (hasVariants) {
                                body += variantInfo;
                            } else {
                                body += `\n\n§6Variant Analysis:\n§7No advanced variants discovered yet.`;
                            }
                        }

                        // Expert analysis (available at knowledge level 3)
                        const expertThreshold = isBuffBear ? 5 : 100; // Max expert info at 5 kills for Buff Bears
                        if (bearKnowledge >= 3 && killCount >= expertThreshold) {
                            body += `\n\n§6Expert Analysis:\n§7Detailed behavioral patterns and combat strategies documented.`;
                            if (codex.mobs.day4VariantsUnlocked || codex.mobs.day8VariantsUnlocked || codex.mobs.day13VariantsUnlocked || codex.mobs.day20VariantsUnlocked) {
                                body += `\n§7Advanced variants show enhanced capabilities compared to earlier forms.`;
                            }
                        }
                    } else {
                        // No knowledge - very basic info
                        body = `§e${e.title}\n§7A mysterious creature you've encountered.\n\n§7You don't know much about this entity yet.`;
                        if (killCount > 0) {
                            body += `\n§7You have encountered ${killCount} of these creatures.`;
                        }
                    }
                }

                new ActionFormData().title(`§6Mobs: ${known ? e.title : '???'}`).body(body).button("§8Back").show(player).then(() => {
                    const volumeMultiplier = getPlayerSoundVolume(player);
                    player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                    openMobs();
                });
            } else {
                openMain();
            }
        });
    }

    function openItems() {
        markSectionViewed(player, "items");
        const codex = getCodex(player);
        
        // Item icon configuration
        const ITEM_ICONS = {
            'snowFound': "textures/items/mb_snow",
            'basicJournalSeen': "textures/items/basic_journal",
            'snowBookCrafted': "textures/items/snow_book",
            'cureItemsSeen': "textures/items/apple_golden",
            'potionsSeen': "textures/items/potion_bottle_saturation",
            'weaknessPotionSeen': "textures/items/potion_bottle_saturation",
            'goldenAppleSeen': "textures/items/apple_golden",
            'goldenCarrotSeen': "textures/items/carrot_golden",
            'enchantedGoldenAppleSeen': "textures/items/apple_golden",
            'goldSeen': "textures/items/gold_ingot",
            'goldNuggetSeen': "textures/items/gold_nugget",
            'brewingStandSeen': "textures/items/brewing_stand"
        };
        
        const entries = [
            { key: "snowFound", title: "'Snow' (Powder)", icon: ITEM_ICONS.snowFound },
            { key: "basicJournalSeen", title: "Basic Journal", icon: ITEM_ICONS.basicJournalSeen },
            { key: "snowBookCrafted", title: "Powdery Journal", icon: ITEM_ICONS.snowBookCrafted },
            { key: "cureItemsSeen", title: "Cure Items", icon: ITEM_ICONS.cureItemsSeen },
            { key: "potionsSeen", title: "Potions", icon: ITEM_ICONS.potionsSeen },
            { key: "goldenAppleSeen", title: "Golden Apple", icon: ITEM_ICONS.goldenAppleSeen },
            { key: "goldenCarrotSeen", title: "Golden Carrot", icon: ITEM_ICONS.goldenCarrotSeen },
            { key: "enchantedGoldenAppleSeen", title: "§5Enchanted§f Golden Apple", icon: ITEM_ICONS.enchantedGoldenAppleSeen },
            { key: "goldSeen", title: "Gold Ingot", icon: ITEM_ICONS.goldSeen },
            { key: "goldNuggetSeen", title: "Gold Nugget", icon: ITEM_ICONS.goldNuggetSeen },
            { key: "brewingStandSeen", title: "Brewing Stand", icon: ITEM_ICONS.brewingStandSeen }
        ];
        
        // Calculate infection status from context
        const infectionState = playerInfection.get(player.id);
        const hasInfection = infectionState && !infectionState.cured && infectionState.ticksLeft > 0;
        
        const form = new ActionFormData().title("§6Items");
        form.body("§7Entries:");
        for (const e of entries) {
            let title = e.title;
            let showIcon = false;
            
            if (e.key === 'snowFound') {
                // Show as "'Snow' (Powder)" if player has been infected AND has found snow
                const hasBeenInfected = hasInfection;
                const hasFoundSnow = codex.items.snowFound;
                
                if (hasBeenInfected && hasFoundSnow) {
                    title = e.title; // "'Snow' (Powder)"
                    showIcon = true;
                } else if (codex.items.snowIdentified) {
                    title = e.title; // "'Snow' (Powder)" 
                    showIcon = true;
                } else {
                    title = 'Unknown White Substance';
                }
            } else if (e.key === 'basicJournalSeen' && codex.items.basicJournalSeen) {
                showIcon = true;
            } else if (e.key === 'snowBookCrafted' && codex.items.snowBookCrafted) {
                showIcon = true;
            }
            
            let label = `§f${maskTitle(title, codex.items[e.key])}`;
            if (codex.items[e.key]) {
                const subPath = "items." + e.key;
                const subState = subsectionHasNewOrUpdated(codex, subPath);
                if (subState.new || subState.updated) {
                    label = `§l§o${label} §8(${subState.new ? "new" : "updated"})`;
                }
            }
            
            // Add icons for known items only
            if (codex.items[e.key] && ITEM_ICONS[e.key]) {
                form.button(label, ITEM_ICONS[e.key]);
            } else {
                form.button(label);
            }
        }
        form.button("§8Back");
        form.show(player).then((res) => {
            if (!res || res.canceled) {
                // Play page turn sound when going back
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                return openMain();
            }

            // Play page turn sound
            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
            if (res.selection >= 0 && res.selection < entries.length) {
                const e = entries[res.selection];
                const known = codex.items[e.key];
                if (known) markSubsectionViewed(player, "items." + e.key);
                let body = "§e???";
                if (known) {
                    if (e.key === "snowFound") {
                        const hasBeenInfected = hasInfection;
                        const hasFoundSnow = codex.items.snowFound;
                        const snowKnowledge = getKnowledgeLevel(player, 'snowLevel');
                        const infectionKnowledge = getKnowledgeLevel(player, 'infectionLevel');
                        
                        if (hasBeenInfected && hasFoundSnow && infectionKnowledge >= 1) {
                            body = "§e\"Snow\" (Powder)\n§7Risky substance. Leads to symptoms and doom.";
                        } else if (codex.items.snowIdentified && infectionKnowledge >= 1) {
                            body = "§e\"Snow\" (Powder)\n§7Risky substance. Leads to symptoms and doom.";
                        } else if (snowKnowledge >= 1) {
                            body = "§e\"Snow\" (Powder)\n§7A mysterious white powder. You sense it has properties beyond what you currently understand.";
                        } else {
                            body = "§eUnknown White Substance\n§7A powdery white substance. You have no idea what this could be.";
                        }
                    } else if (e.key === "basicJournalSeen") {
                        body = "§eBasic Journal\n§7A simple journal that helps you understand what's happening in your world.\n\n§7Features:\n§7• Explains your goals and objectives\n§7• Provides survival tips\n§7• Shows recipe for Powdery Journal upgrade\n§7• Settings menu for customization\n\n§7This journal is given to all survivors when they first join. Upgrade it to a Powdery Journal for advanced tracking capabilities.";
                    } else if (e.key === "snowBookCrafted") {
                        // Progressive journal information based on usage
                        const totalKills = (codex.mobs.tinyBearKills || 0) + (codex.mobs.infectedBearKills || 0) + (codex.mobs.infectedPigKills || 0) + (codex.mobs.infectedCowKills || 0) + (codex.mobs.buffBearKills || 0) +
                            (codex.mobs.flyingBearKills || 0) + (codex.mobs.miningBearKills || 0) + (codex.mobs.torpedoBearKills || 0);
                        const totalInfections = codex.history.totalInfections || 0;
                        
                        if (totalKills < 5 && totalInfections === 0) {
                            // Basic journal info
                            body = "§ePowdery Journal\n§7A journal that records what you find about the outbreak.\n\n§7Basic:\n§7• Tracks infection\n§7• Records mobs\n§7• Logs discoveries\n\n§7It updates itself as you find new things.";
                        } else if (totalKills < 25 || totalInfections < 2) {
                            // Intermediate journal info
                            body = "§ePowdery Journal\n§7A journal that records your experiences with the outbreak.\n\n§7More:\n§7• Tracks infection and how it grows\n§7• Records symptoms and effects\n§7• Logs mob encounters\n§7• Keeps detailed discovery logs\n§7• Analyzes substances\n\n§7It may be more than a simple book. Its true nature is unknown.";
                        } else {
                            // Expert journal info
                            body = "§ePowdery Journal\n§7An anomalous journal that appears to be a sophisticated recording and analysis device. Its behavior suggests advanced technology or supernatural properties.\n\n§6Advanced Features:\n§7• Real-time infection monitoring and analysis\n§7• Comprehensive symptom tracking and correlation\n§7• Detailed mob behavior analysis and statistics\n§7• Tier-based substance analysis and warnings\n§7• Historical tracking of outbreak progression\n§7• Predictive modeling of infection patterns\n§7• Cross-reference analysis of discoveries\n\n§6Anomalous Properties:\n§7• Updates automatically without user input\n§7• Appears to have knowledge beyond user experience\n§7• Provides warnings about future dangers\n§7• Correlates data across multiple play sessions\n§7• Suggests awareness of broader outbreak scope\n\n§7Notes: This journal may be a key to understanding the true nature of the outbreak. Its capabilities far exceed normal documentation tools.";
                        }
                    } else if (e.key === "cureItemsSeen") {
                        // Progressive cure information based on experience
                        const cureAttempts = codex.history.totalCures || 0;
                        const hasCured = cureAttempts > 0;
                        
                        if (!hasCured && !codex.cures.bearCureKnown) {
                            // Basic cure info with hints based on discoveries
                            let hintText = "";
                            if (codex.items.weaknessPotionSeen && codex.items.enchantedGoldenAppleSeen) {
                                hintText = "\n\n§7Research Equation:\n§7Weakness + Enchanted Golden Apple = ?\n§7Timing: Critical factor\n§7Result: Unknown";
                            } else if (codex.items.weaknessPotionSeen || codex.items.enchantedGoldenAppleSeen) {
                                hintText = "\n\n§7Research Notes:\n§7• One component discovered\n§7• Second component required\n§7• Timing appears crucial";
                            }
                            
                            body = "§eCure Components\n§7Rumors suggest that certain items can reverse infections when used together.\n\n§7Suspected Components:\n§7• Weakness Potion: May weaken the infection\n§7• Enchanted Golden Apple: Provides healing energy\n§7• Timing: Must be used at specific moments" + hintText + "\n\n§8Note: Cure mechanism is not fully understood. Experimentation required.";
                        } else if (codex.cures.bearCureKnown && !hasCured) {
                            // Known cure info
                            const addonCure = getAddonDifficultyState();
                            const immuneH = addonCure.hitsBase;
                            const normalH = Math.max(1, addonCure.hitsBase - 1);
                            body = "§eCure Components\n§7A combination of items that can reverse infections when used together.\n\n§6For Major Infection:\n§7• Weakness Potion: Temporarily weakens the infection\n§7• Enchanted Golden Apple: Provides healing energy\n§7• Must be consumed while under weakness effect\n§7• Effect: Grants §aPermanent Immunity§7 (prevents minor infection on respawn)\n§7• Also grants: §bTemporary Immunity§7 (5 minutes)\n§7• Requires " + immuneH + " hits from Maple Bears to get infected (instead of " + normalH + ")\n\n§6For Minor Infection:\n§7• Golden Apple: Part of the cure\n§7• Golden Carrot: Part of the cure\n§7• Both must be consumed separately (any order)\n§7• Effect: Grants §aPermanent Immunity§7\n\n§7Mechanism:\n§7• Weakness reduces infection strength\n§7• Golden apple provides healing energy\n§7• Combined effect neutralizes infection\n\n§7Notes:\n§7• Major infection can be cured with proper timing\n§7• Minor infection can be cured with golden apple + golden carrot\n§7• Both cures grant permanent immunity\n§7• Cure process is irreversible once begun\n\n§aCure knowledge is precious - use it wisely.";
                        } else {
                            // Expert cure info
                            const addonExp = getAddonDifficultyState();
                            const immuneHExp = addonExp.hitsBase;
                            const normalHExp = Math.max(1, addonExp.hitsBase - 1);
                            body = "§eCure Components\n§7A sophisticated combination of items that can reverse infections through precise biochemical manipulation.\n\n§6For Major Infection:\n§7• Weakness Potion: Creates temporary vulnerability in infection\n§7• Enchanted Golden Apple: Provides concentrated healing energy\n§7• Critical Timing: Must be consumed while under weakness effect\n§7• Effect: Grants §aPermanent Immunity§7 (prevents minor infection on respawn)\n§7• Also grants: §bTemporary Immunity§7 (5 minutes)\n§7• Requires " + immuneHExp + " hits from Maple Bears to get infected (instead of " + normalHExp + ")\n\n§6For Minor Infection:\n§7• Golden Apple: Essential component\n§7• Golden Carrot: Essential component\n§7• Both must be consumed separately (any order)\n§7• Effect: Grants §aPermanent Immunity§7\n\n§6Scientific Mechanism:\n§7• Weakness potion disrupts infection's cellular binding\n§7• Golden apple energy overwhelms infection's defenses\n§7• Combined effect creates complete neutralization\n§7• Process triggers permanent immunity response\n\n§6Advanced Notes:\n§7• Major infection: Curable with proper procedure (weakness + enchanted golden apple)\n§7• Minor infection: Curable with golden apple + golden carrot\n§7• Both cures grant permanent immunity - prevents minor infection on respawn\n§7• Temporary immunity also granted for major infection cure (5 minutes)\n§7• Cure process: Irreversible once initiated\n§7• Failure risk: High if timing is incorrect (for major infection)\n\n§6Expert Analysis:\n§7• Cure mechanism suggests infection has exploitable weaknesses\n§7• Permanent immunity indicates successful cure neutralizes infection permanently\n§7• Temporary immunity from major cure provides additional protection period\n§7• Both cure methods provide permanent immunity to minor infection\n§7• Cure knowledge represents critical survival information\n\n§aMastery of cure techniques is essential for long-term survival.";
                        }
                    } else if (e.key === "potionsSeen") {
                        // Progressive potion information
                        if (codex.items.weaknessPotionSeen) {
                            body = "§ePotions\n§7Alchemical concoctions that can alter biological processes. Some may have applications in treating infections.\n\n§7Known Types:\n§7• Weakness Potion: Creates temporary vulnerability\n§7• Various other effects available\n\n§7Weakness Potion Analysis:\n§7• Reduces physical capabilities temporarily\n§7• Creates vulnerability in biological systems\n§7• May weaken infection's cellular binding\n§7• Timing of application is critical\n§7• Shows promise in therapeutic applications\n\n§7Research Notes:\n§7• Potions can be brewed using a brewing stand\n§7• Weakness potions may have therapeutic applications\n§7• Timing of consumption appears critical\n§7• Combined with other items, may create curative effects\n\n§eFurther research into potion applications is ongoing.";
                        } else {
                            body = "§ePotions\n§7Alchemical concoctions that can alter biological processes. Some may have applications in treating infections.\n\n§7Basic Information:\n§7• Can be brewed using a brewing stand\n§7• Various effects available\n§7• May have therapeutic applications\n\n§8Note: Specific applications require further research.";
                        }
                    } else if (e.key === "goldenAppleSeen") {
                        // Golden apple information with progressive discovery-based details
                        const hasDiscoveredReduction = codex.items.goldenAppleInfectionReductionDiscovered;
                        const infectionState = playerInfection.get(player.id);
                        const hasInfection = infectionState && !infectionState.cured && infectionState.ticksLeft > 0;
                        const infectionType = hasInfection ? (infectionState.infectionType || MAJOR_INFECTION_TYPE) : null;
                        const isMinor = infectionType === MINOR_INFECTION_TYPE;
                        const hasPermanentImmunity = getPlayerProperty(player, PERMANENT_IMMUNITY_PROPERTY) === true;
                        const hasGoldenApple = getPlayerProperty(player, MINOR_CURE_GOLDEN_APPLE_PROPERTY) === true;
                        const hasGoldenCarrot = getPlayerProperty(player, MINOR_CURE_GOLDEN_CARROT_PROPERTY) === true;
                        const infectionKnowledge = getKnowledgeLevel(player, 'infectionLevel');
                        const hasSeenGold = codex.items.goldSeen;
                        const hasSeenGoldNugget = codex.items.goldNuggetSeen;
                        const hasSeenGoldenCarrot = codex.items.goldenCarrotSeen;
                        const hasSeenEnchantedApple = codex.items.enchantedGoldenAppleSeen;
                        
                        body = "§eGolden Apple\n§7A rare fruit with powerful healing properties.";
                        
                        // Progressive information based on discovery and knowledge
                        if (infectionKnowledge >= 1 || hasDiscoveredReduction || isMinor || hasPermanentImmunity) {
                            body += "\n\n§7Properties:\n§7• Provides significant healing\n§7• Contains concentrated life energy";
                            
                            if (hasSeenGold || hasSeenGoldNugget) {
                                body += "\n§7• Made from gold, which enhances its properties";
                            }
                            
                            if (infectionKnowledge >= 1 || hasDiscoveredReduction) {
                                body += "\n§7• Has applications in infection treatment";
                                
                                if (hasDiscoveredReduction) {
                                    body += "\n§7• Reduces infection severity when consumed while infected\n§7• Provides temporary relief from infection symptoms";
                                    body += "\n\n§6Infection Reduction:\n§7• Eating a golden apple while infected weakens the infection\n§7• The effect is small but real\n§7• Does not cure, only eases it\n§7• More apples can help more\n§7• Relief is temporary—the infection keeps growing";
                                }
                            }
                            
                            // Only show minor cure info if player has experienced minor infection
                            const hasHadMinorInfection = codex.infections.minor.discovered || isMinor || hasPermanentImmunity;
                            if (hasHadMinorInfection && hasSeenGoldenCarrot) {
                                const addonGA = getAddonDifficultyState();
                                body += "\n\n§6Minor Infection Cure:\n§7• Part of the minor infection cure (along with Golden Carrot)\n§7• Must be consumed separately from Golden Carrot (any order)\n§7• Effect: Grants §aPermanent Immunity§7 when both components are consumed\n§7• Permanent immunity prevents minor infection on respawn\n§7• Permanent immunity requires " + addonGA.hitsBase + " hits from Maple Bears to get infected (instead of " + Math.max(1, addonGA.hitsBase - 1) + ")";
                            }
                            
                            if (hasSeenEnchantedApple && infectionKnowledge >= 2) {
                                body += "\n\n§7Research Connection:\n§7• Can be enhanced into an Enchanted Golden Apple\n§7• Enchanted variant is used for major infection cure\n§7• The gold content plays a crucial role in both variants";
                            }
                            
                            if (hasSeenGold || hasSeenGoldNugget) {
                                body += "\n\n§6Material Analysis:\n§7• Contains gold, which concentrates life energy\n§7• Gold's properties may enhance its therapeutic effects";
                            }
                            
                            if (isMinor) {
                                body += "\n\n§6Cure Progress:";
                                body += `\n§7  Golden Apple: ${hasGoldenApple ? '§a✓ Consumed' : '§c✗ Not consumed'}`;
                                body += `\n§7  Golden Carrot: ${hasGoldenCarrot ? '§a✓ Consumed' : '§c✗ Not consumed'}`;
                                if (hasGoldenApple && hasGoldenCarrot) {
                                    body += "\n§aBoth components consumed! The cure is taking effect...";
                                } else if (hasGoldenApple && !hasGoldenCarrot) {
                                    body += "\n§7Consume a Golden Carrot to complete the cure.";
                                } else {
                                    body += "\n§7Consume both components to gain permanent immunity.";
                                }
                            } else if (hasPermanentImmunity) {
                                body += "\n\n§aYou have already cured your infection and gained permanent immunity.";
                            }
                            
                            if (infectionKnowledge >= 3 || (hasDiscoveredReduction && infectionKnowledge >= 2)) {
                                body += "\n\n§6Expert Analysis:\n§7• Golden apples are rare and valuable\n§7• Their healing properties are well-documented\n§7• Has been observed to reduce infection severity\n§7• Not a cure, but provides valuable relief\n§7• Essential component for minor infection cure\n§7• The gold content concentrates life energy\n\n§eThis fruit shows potential in medical applications.";
                            } else if (infectionKnowledge >= 2 || hasDiscoveredReduction) {
                                body += "\n\n§7Research Notes:\n§7• Golden apples are rare and valuable\n§7• Their healing properties are well-documented";
                                if (hasDiscoveredReduction) {
                                    body += "\n§7• Has been observed to reduce infection severity\n§7• Not a cure, but provides valuable relief";
                                } else {
                                    body += "\n§7• May be useful in combination with other treatments";
                                }
                            }
                        } else {
                            body += "\n\n§7Properties:\n§7• Provides significant healing\n§7• Contains concentrated life energy";
                            if (hasSeenGold || hasSeenGoldNugget) {
                                body += "\n§7• Made from gold, which may enhance its properties";
                            }
                            body += "\n\n§7Research Notes:\n§7• Golden apples are rare and valuable\n§7• Their healing properties are well-documented";
                            body += "\n\n§eThis fruit shows potential in medical applications.";
                        }
                    } else if (e.key === "goldenCarrotSeen") {
                        // Golden carrot information with progressive discovery-based details
                        const infectionState = playerInfection.get(player.id);
                        const hasInfection = infectionState && !infectionState.cured && infectionState.ticksLeft > 0;
                        const infectionType = hasInfection ? (infectionState.infectionType || MAJOR_INFECTION_TYPE) : null;
                        const isMinor = infectionType === MINOR_INFECTION_TYPE;
                        const hasPermanentImmunity = getPlayerProperty(player, PERMANENT_IMMUNITY_PROPERTY) === true;
                        const hasGoldenApple = getPlayerProperty(player, MINOR_CURE_GOLDEN_APPLE_PROPERTY) === true;
                        const hasGoldenCarrot = getPlayerProperty(player, MINOR_CURE_GOLDEN_CARROT_PROPERTY) === true;
                        const infectionKnowledge = getKnowledgeLevel(player, 'infectionLevel');
                        const hasSeenGold = codex.items.goldSeen;
                        const hasSeenGoldNugget = codex.items.goldNuggetSeen;
                        const hasSeenGoldenApple = codex.items.goldenAppleSeen;
                        
                        body = "§eGolden Carrot\n§7A rare golden variant of the common carrot.";
                        
                        // Progressive information based on discovery and knowledge
                        const hasHadMinorInfection = codex.infections.minor.discovered || isMinor || hasPermanentImmunity;
                        if (infectionKnowledge >= 1 || isMinor || hasPermanentImmunity) {
                            body += "\n\n§7Properties:\n§7• Provides nutritional value\n§7• Contains concentrated life energy";
                            
                            if (hasHadMinorInfection) {
                                body += "\n§7• Part of the minor infection cure";
                            }
                            
                            // Only show detailed cure info if player has experienced minor infection
                            if (hasHadMinorInfection && (infectionKnowledge >= 2 || (isMinor && (hasGoldenApple || hasGoldenCarrot)) || hasPermanentImmunity)) {
                                const addonGC = getAddonDifficultyState();
                                body += "\n\n§6Minor Infection Cure:\n§7• Must be consumed along with a Golden Apple to cure minor infection\n§7• Both items must be consumed separately (any order)\n§7• Effect: Grants §aPermanent Immunity§7\n§7• Permanent immunity prevents minor infection on respawn\n§7• Permanent immunity requires " + addonGC.hitsBase + " hits from Maple Bears to get infected (instead of " + Math.max(1, addonGC.hitsBase - 1) + ")";
                            } else if (infectionKnowledge >= 1 && !hasHadMinorInfection) {
                                body += "\n\n§7Research Notes:\n§7• Appears to have medical applications\n§7• May be related to infection treatment";
                            }
                            
                            if (hasSeenGold || hasSeenGoldNugget) {
                                body += "\n\n§6Material Analysis:\n§7• Contains trace amounts of gold\n§7• Golden properties may enhance its therapeutic effects";
                            }
                            
                            if (hasSeenGoldenApple && (infectionKnowledge >= 1 || isMinor)) {
                                body += "\n\n§7Research Connection:\n§7• Golden Apple + Golden Carrot = Potential Cure\n§7• Both contain concentrated life energy\n§7• Combination may provide synergistic effects";
                            }
                            
                            if (isMinor) {
                                body += "\n\n§6Cure Progress:";
                                body += `\n§7  Golden Apple: ${hasGoldenApple ? '§a✓ Consumed' : '§c✗ Not consumed'}`;
                                body += `\n§7  Golden Carrot: ${hasGoldenCarrot ? '§a✓ Consumed' : '§c✗ Not consumed'}`;
                                if (hasGoldenApple && hasGoldenCarrot) {
                                    body += "\n§aBoth components consumed! The cure is taking effect...";
                                } else {
                                    body += "\n§7Consume both components to gain permanent immunity.";
                                }
                            } else if (hasPermanentImmunity) {
                                body += "\n\n§aYou have already cured your infection and gained permanent immunity.";
                            } else if (infectionKnowledge >= 1) {
                                body += "\n\n§7This item is only effective for minor infections. Major infections require a different cure.";
                            }
                            
                            if (infectionKnowledge >= 3 || hasPermanentImmunity) {
                                body += "\n\n§6Expert Analysis:\n§7• Golden carrots are valuable and rare\n§7• They have specific applications in minor infection treatment\n§7• When combined with golden apples, they provide permanent immunity\n§7• This is the only known cure for minor infection\n§7• The gold content may play a role in its therapeutic properties\n\n§eThis item is crucial for early infection treatment.";
                            } else if (infectionKnowledge >= 2) {
                                body += "\n\n§7Research Notes:\n§7• Golden carrots are valuable and rare\n§7• They have specific applications in minor infection treatment\n§7• Further research may reveal additional properties";
                            }
                        } else {
                            body += "\n\n§7A valuable food item with enhanced nutritional properties.";
                            if (hasSeenGold || hasSeenGoldNugget) {
                                body += "\n§7Contains trace amounts of gold, which may enhance its properties.";
                            }
                        }
                    } else if (e.key === "goldSeen") {
                        // Gold ingot information with progressive discovery
                        const infectionKnowledge = getKnowledgeLevel(player, 'infectionLevel');
                        const hasSeenGoldenApple = codex.items.goldenAppleSeen;
                        const hasSeenGoldenCarrot = codex.items.goldenCarrotSeen;
                        const hasSeenEnchantedApple = codex.items.enchantedGoldenAppleSeen;
                        const hasSeenGoldNugget = codex.items.goldNuggetSeen;
                        
                        body = "§eGold Ingot\n§7A valuable metal ingot with various applications.";
                        
                        if (infectionKnowledge >= 1 || hasSeenGoldenApple || hasSeenGoldenCarrot || hasSeenEnchantedApple) {
                            body += "\n\n§7Properties:\n§7• Highly valuable material\n§7• Used in crafting valuable items";
                            
                            if ((hasSeenGoldenApple || hasSeenGoldenCarrot || hasSeenEnchantedApple) && infectionKnowledge >= 1) {
                                body += "\n\n§6Medical Applications:\n§7• Gold is used in crafting Golden Apples and Golden Carrots\n§7• These items have important medical applications\n§7• Gold may enhance the therapeutic properties of these items";
                            }
                            
                            if (infectionKnowledge >= 2 && (hasSeenGoldenApple || hasSeenGoldenCarrot)) {
                                body += "\n\n§7Research Notes:\n§7• Gold appears to concentrate life energy in certain items\n§7• Golden items show promise in infection treatment\n§7• The metal may act as a catalyst for healing processes";
                            }
                            
                            if (hasSeenGoldNugget) {
                                body += "\n\n§7Material Relationship:\n§7• Can be broken down into Gold Nuggets\n§9 Gold Nuggets can be combined into Gold Ingots";
                            }
                            
                            if (infectionKnowledge >= 3) {
                                body += "\n\n§6Expert Analysis:\n§7• Gold has unique properties that enhance healing\n§7• Used extensively in medical crafting\n§7• Essential component for cure research\n§7• The metal's conductivity may play a role in energy transfer";
                            }
                        } else {
                            body += "\n\n§7A precious metal commonly used in crafting and trading.";
                        }
                    } else if (e.key === "goldNuggetSeen") {
                        // Gold nugget information with progressive discovery
                        const infectionKnowledge = getKnowledgeLevel(player, 'infectionLevel');
                        const hasSeenGold = codex.items.goldSeen;
                        const hasSeenGoldenApple = codex.items.goldenAppleSeen;
                        const hasSeenGoldenCarrot = codex.items.goldenCarrotSeen;
                        
                        body = "§eGold Nugget\n§7A small piece of valuable gold.";
                        
                        if (infectionKnowledge >= 1 || hasSeenGoldenApple || hasSeenGoldenCarrot || hasSeenGold) {
                            body += "\n\n§7Properties:\n§7• Small quantity of valuable gold\n§7• Can be combined into Gold Ingots";
                            
                            if (hasSeenGold) {
                                body += "\n\n§7Material Relationship:\n§9 Gold Ingots can be broken down into Gold Nuggets\n§7• Gold Nuggets can be combined into Gold Ingots";
                            }
                            
                            if ((hasSeenGoldenApple || hasSeenGoldenCarrot) && infectionKnowledge >= 1) {
                                body += "\n\n§7Medical Connection:\n§7• Gold nuggets are components used in crafting medical items\n§7• Part of the material chain for cure-related items\n§7• May have applications in infection treatment research";
                            }
                            
                            if (infectionKnowledge >= 2) {
                                body += "\n\n§7Research Notes:\n§7• Gold nuggets are valuable resources for medical crafting\n§7• Essential for creating gold-based therapeutic items";
                            }
                        } else {
                            body += "\n\n§7A precious material that can be used in crafting.";
                        }
                    } else if (e.key === "enchantedGoldenAppleSeen") {
                        // Enchanted golden apple information with progressive discovery-based details
                        const infectionKnowledge = getKnowledgeLevel(player, 'infectionLevel');
                        const infectionState = playerInfection.get(player.id);
                        const hasInfection = infectionState && !infectionState.cured && infectionState.ticksLeft > 0;
                        const hasPermanentImmunity = getPlayerProperty(player, PERMANENT_IMMUNITY_PROPERTY) === true;
                        const hasSeenGold = codex.items.goldSeen;
                        const hasSeenGoldNugget = codex.items.goldNuggetSeen;
                        const hasSeenGoldenApple = codex.items.goldenAppleSeen;
                        const hasSeenGoldenCarrot = codex.items.goldenCarrotSeen;
                        const hasSeenWeaknessPotion = codex.items.weaknessPotionSeen;
                        const cureKnown = codex.cures.bearCureKnown;
                        const hasCured = codex.history.totalCures > 0;
                        
                        body = "§eEnchanted Golden Apple\n§7An extremely rare and powerful variant of the golden apple.";
                        
                        // Progressive information based on discovery and knowledge
                        if (infectionKnowledge >= 1 || cureKnown || hasCured || hasPermanentImmunity) {
                            body += "\n\n§7Enhanced Properties:\n§7• Superior healing capabilities\n§7• Magical enhancement increases potency\n§7• Contains concentrated life energy";
                            
                            if (hasSeenGold || hasSeenGoldNugget) {
                                body += "\n§7• Enhanced with gold, which amplifies its properties";
                            }
                            
                            if (infectionKnowledge >= 1 || cureKnown) {
                                body += "\n§7• Has unique therapeutic applications";
                                
                                if (cureKnown || hasCured) {
                                    const addonEGA = getAddonDifficultyState();
                                    body += "\n\n§6Major Infection Cure:\n§7• Part of the major infection cure (along with Weakness effect)\n§7• Must be consumed while under weakness effect\n§7• Effect: Grants §aPermanent Immunity§7 (prevents minor infection on respawn)\n§7• Also grants: §bTemporary Immunity§7 (5 minutes)\n§7• Permanent immunity requires " + addonEGA.hitsBase + " hits from Maple Bears to get infected (instead of " + Math.max(1, addonEGA.hitsBase - 1) + ")";
                                } else if (infectionKnowledge >= 1) {
                                    body += "\n\n§7Research Notes:\n§7• May be required for advanced medical procedures\n§7• Appears to have applications in infection treatment";
                                }
                            }
                            
                            if (hasSeenWeaknessPotion && (infectionKnowledge >= 1 || cureKnown)) {
                                body += "\n\n§7Research Connection:\n§7• Weakness + Enchanted Golden Apple = Major Infection Cure\n§7• Timing is critical - must consume while under weakness effect\n§7• Both components must be present simultaneously\n§7• The combination provides permanent immunity";
                            }
                            
                            if (hasSeenGoldenApple && infectionKnowledge >= 2) {
                                body += "\n\n§7Material Relationship:\n§7• Enhanced form of the Golden Apple\n§7• More potent than regular golden apples\n§7• The gold content plays a crucial role in both variants";
                            }
                            
                            if (hasSeenGold || hasSeenGoldNugget) {
                                body += "\n\n§6Material Analysis:\n§7• Contains concentrated gold, which amplifies life energy\n§7• Gold's properties enhance its therapeutic effects beyond normal golden apples";
                            }
                            
                            if (hasPermanentImmunity) {
                                body += "\n\n§aYou have already cured your infection and gained permanent immunity.";
                            }
                            
                            if (infectionKnowledge >= 3 || (cureKnown && hasCured)) {
                                body += "\n\n§6Expert Analysis:\n§7• Enchanted golden apples are extremely rare and valuable\n§7• Their enhanced properties are crucial for major infection treatment\n§7• Essential component for major infection cure\n§7• The magical enhancement concentrates life energy beyond normal apples\n§7• When combined with weakness, provides permanent immunity\n\n§eThis enhanced fruit is the key to advanced infection treatment.";
                            } else if (infectionKnowledge >= 2 || cureKnown) {
                                body += "\n\n§7Research Notes:\n§7• Enchanted golden apples are extremely rare\n§7• Their enhanced properties may be crucial for treatment\n§7• May be required for certain medical procedures";
                            }
                        } else {
                            body += "\n\n§7Enhanced Properties:\n§7• Superior healing capabilities\n§7• Magical enhancement increases potency\n§7• Contains concentrated life energy";
                            if (hasSeenGold || hasSeenGoldNugget) {
                                body += "\n§7• Enhanced with gold, which may amplify its properties";
                            }
                            body += "\n\n§7Research Notes:\n§7• Enchanted golden apples are extremely rare\n§7• Their enhanced properties may be crucial for treatment\n§7• May be required for certain medical procedures\n\n§eThis enhanced fruit may be the key to advanced treatments.";
                        }
                    } else if (e.key === "brewingStandSeen") {
                        // Brewing stand information
                        body = "§eBrewing Stand\n§7A specialized apparatus for creating alchemical concoctions. Essential for potion production.\n\n§7Function:\n§7• Allows creation of various potions\n§7• Can produce weakness potions\n§7• Essential for alchemical research\n\n§7Research Applications:\n§7• Weakness potions can be brewed here\n§7• Essential for cure research\n§7• Allows experimentation with different concoctions\n\n§eThis apparatus is crucial for developing treatments.";
                    }
                }
                new ActionFormData().title(`§6Items: ${known ? e.title : '???'}`).body(body).button("§8Back").show(player).then(() => {
                    const volumeMultiplier = getPlayerSoundVolume(player);
                    player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                    openItems();
                });
            } else {
                openMain();
            }
        });
    }

    function openDailyLog() {
        const codex = getCodex(player);
        const currentDay = getCurrentDay ? getCurrentDay() : 0;
        
        // Get all days with events, sorted by day number
        const daysWithEvents = Object.keys(codex.dailyEvents || {})
            .map(day => parseInt(day))
            .filter(day => day > 0 && day < currentDay)
            .sort((a, b) => b - a); // Most recent first
        
        if (daysWithEvents.length === 0) {
            const form = new ActionFormData().title("§6Daily Log");
            form.body("§7No significant events recorded yet.\n\n§8Events are recorded one day after they occur, as you reflect on the previous day's discoveries.");
            form.button("§8Back");
            form.show(player).then((res) => {
                if (!res || res.canceled) return openTimeline();

                // Play page turn sound
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });

                openTimeline();
            });
            return;
        }
        
        const form = new ActionFormData().title("§6Daily Log");
        form.body("§7Reflections on past days:\n");
        
        // Add buttons for each day with events
        for (const day of daysWithEvents) {
            const dayEvents = codex.dailyEvents[day];
            let hasEvents = false;

            // Handle both old format (array) and new format (object with categories)
            if (Array.isArray(dayEvents)) {
                hasEvents = dayEvents.length > 0;
            } else if (dayEvents && typeof dayEvents === 'object') {
                hasEvents = Object.values(dayEvents).some(category => category && category.length > 0);
            }

            if (hasEvents) {
                let label = `§fDay ${day}`;
                const subPath = "timeline.day." + day;
                const subState = subsectionHasNewOrUpdated(codex, subPath);
                if (subState.new || subState.updated) {
                    label = `§l§o${label} §8(${subState.new ? "new" : "updated"})`;
                }
                form.button(label);
            }
        }
        
        form.button("§8Back");
        form.show(player).then((res) => {
            if (!res || res.canceled) {
                // Play page turn sound when going back
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                return openTimeline();
            }

            // Play page turn sound
            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
            if (res.selection >= 0 && res.selection < daysWithEvents.length) {
                const selectedDay = daysWithEvents[res.selection];
                markSubsectionViewed(player, "timeline.day." + selectedDay);
                const dayEvents = codex.dailyEvents[selectedDay];
                
                let body = `§6Day ${selectedDay}\n\n`;
                // Daily log mood: random tone per day (hopeful, grim, dry) for variety
                const moodLines = [
                    "§7A day that held a glimmer of hope.",
                    "§8A grim day, by any measure.",
                    "§8Matter-of-fact. The world moved on."
                ];
                body += moodLines[selectedDay % moodLines.length] + "\n\n";

                // Handle both old format (array) and new format (object with categories)
                if (Array.isArray(dayEvents)) {
                    // Old format: simple array of events
                    if (dayEvents.length > 0) {
                        body += "§7Other Events\n";
                        body += dayEvents.join("\n\n");
                } else {
                    body += "§7No significant events recorded for this day.";
                }
                } else if (dayEvents && typeof dayEvents === 'object') {
                    // New format: categorized events
                    const categoryOrder = ["variants", "knowledge", "items", "effects", "mobs", "lore", "general"];
                    const categoryNames = {
                        variants: "§eVariant Discoveries",
                        knowledge: "§bKnowledge Gained",
                        items: "§aItems Discovered",
                        effects: "§cEffects Experienced",
                        mobs: "§dCreatures Encountered",
                        lore: "§5Endgame Lore",
                        general: "§7Other Events"
                    };

                    let hasEvents = false;
                    for (const category of categoryOrder) {
                        if (dayEvents[category] && dayEvents[category].length > 0) {
                            hasEvents = true;
                            body += `§l${categoryNames[category]}§r\n`;
                            body += dayEvents[category].join("\n");
                            body += "\n\n";
                        }
                    }

                    if (!hasEvents) {
                        body += "§7No significant events recorded for this day.";
                    }
                } else {
                    body += "§7No significant events recorded for this day.";
                }

                new ActionFormData().title(`§6Daily Log: Day ${selectedDay}`).body(body).button("§8Back").show(player).then(() => {
                    const volumeMultiplier = getPlayerSoundVolume(player);
                    player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                    openDailyLog();
                });
            } else {
                openMain();
            }
        });
    }
    
    function openBiomes() {
        markSectionViewed(player, "biomes");
        const codex = getCodex(player);
        const form = new ActionFormData().title("§6Biomes and Blocks");
        
        let body = "§7Biomes and blocks discovered:\n\n";
        
        const biomeKnowledge = getKnowledgeLevel(player, 'biomeLevel');
        let hasEntries = false;

        // Infected Biome Entry
        if (codex.biomes.infectedBiomeSeen) {
            hasEntries = true;
            if (biomeKnowledge >= 2) {
                // Advanced knowledge - show detailed biome data
                body += "§fInfected Biome\n§7A corrupted place where the Maple Bear infection thrives. The ground is covered in white dust. The air feels heavy and wrong.\n\n";

                // Show biome infection data if available
                if (codex.biomeData && codex.biomeData.mb_infected_biome) {
                    const biomeData = codex.biomeData.mb_infected_biome;
                    const avgInfection = biomeData.visitCount > 0 ? Math.round(biomeData.totalInfectionSeen / biomeData.visitCount) : 0;

                    body += `§6Infection Analysis:\n`;
                    body += `§7Visits: §f${biomeData.visitCount}\n`;
                    body += `§7Average Infection Level: §f${avgInfection}/10\n`;
                    body += `§7Peak Infection Observed: §f${biomeData.maxInfectionLevel}/10\n`;

                    if (biomeKnowledge >= 3) {
                        body += `\n§6Expert Notes:\n§7This biome is the heart of the infection. The white dust spreads the corruption.`;
                    }
                }
                
                // Show ambient pressure info if discovered
                if (codex.biomes.biomeAmbientPressureSeen) {
                    body += `\n§6Ambient Effects:\n§7Being in this biome slowly affects you. The air carries the infection, but slower than touching corrupted blocks.`;
                    
                    // Progressive knowledge about ground exposure
                    if (codex.biomes.minorToMajorFromGround || codex.biomes.majorGroundWarningSeen) {
                        body += `\n\n§6Ground Exposure:\n§7Standing on corrupted blocks speeds up the infection. The ground spreads it most.`;
                    }
                    
                    body += `\n`;
                }
            } else if (biomeKnowledge >= 1) {
                // Basic knowledge
                body += "§fInfected Biome\n§7A corrupted place where strange creatures live. The ground is covered in white dust. The air feels heavy and wrong.";
            } else {
                // Minimal knowledge
                body += "§fCorrupted Biome\n§7A strange area where the land feels wrong. White dust covers the ground. You feel uneasy here.";
            }
            body += "\n\n";
        }

        // Dusted Dirt Entry
        if (codex.biomes.dustedDirtSeen) {
            hasEntries = true;
            body += "§fDusted Dirt\n";
            if (codex.biomes.dustedDirtGroundEffectSeen) {
                body += "§7Corrupted soil that spreads infection when you stand on it. Standing here too long worsens your infection. The dust sticks to your feet.";
                
                // Progressive knowledge based on experience
                if (codex.biomes.minorToMajorFromGround) {
                    body += "\n\n§6Your Experience:\n§7Staying on this ground too long can turn a minor infection into something much worse.";
                }
                
                if (codex.biomes.majorGroundWarningSeen) {
                    body += "\n\n§6Advanced Knowledge:\n§7Even with a major infection, standing here still worsens your condition.";
                }
                
                if (codex.biomes.majorSnowIncreaseFromGround) {
                    body += "\n\n§6Critical Discovery:\n§7This ground feeds the infection in you. Your 'snow' level goes up while you stand here.";
                }
                
                body += "\n\n";
            } else {
                body += "§7Corrupted soil in infected biomes. The white dust on it seems wrong.\n\n";
            }
        }

        // Snow Layer Entry (infected dust/powder layers—not cold)
        if (codex.biomes.snowLayerSeen) {
            hasEntries = true;
            body += "§fInfected Dust Layer\n";
            if (codex.biomes.snowLayerGroundEffectSeen) {
                body += "§7Layers of corrupted dust that spread infection faster than dusted dirt. Walking through them speeds up the infection. The dust here is thick and strong.";
                
                // Progressive knowledge based on experience
                if (codex.biomes.minorToMajorFromGround) {
                    body += "\n\n§6Your Experience:\n§7Staying in these layers too long can turn a minor infection into something much worse. The corruption spreads twice as fast here.";
                }
                
                if (codex.biomes.majorGroundWarningSeen) {
                    body += "\n\n§6Advanced Knowledge:\n§7Even with a major infection, walking through these layers still worsens your condition. Faster than dusted dirt.";
                }
                
                if (codex.biomes.majorSnowIncreaseFromGround) {
                    body += "\n\n§6Critical Discovery:\n§7These dust layers feed the infection in you more than dusted dirt. Your 'snow' level goes up faster while exposed.";
                }
                
                body += "\n\n";
            } else {
                body += "§7Strange dust layers found in infected areas. They look like pale powder; something feels wrong about them.\n\n";
            }
        }

        // Storm Entry
        if (codex.biomes.stormSeen) {
            hasEntries = true;
            const stormKnowledge = (codex.biomes.stormMinorSeen ? 1 : 0) + (codex.biomes.stormMajorSeen ? 1 : 0);
            body += "§fInfection Storm\n";
            if (stormKnowledge >= 2) {
                body += "§7A moving wall of white dust that sweeps across the land. Bears spawn inside it. Standing in it causes blindness and speeds infection—similar to standing on corrupted blocks, but worse. You can hear it from far away.\n\n";
                body += "§6Storm Types:\n§7Minor storms are smaller and shorter. Major storms are larger, last longer, and place more dust. After day 20, only major storms occur.\n\n";
                body += "§6Expert Notes:\n§7The storm carries the infection through the air. Maple Bears thrive in it.";
            } else if (stormKnowledge >= 1) {
                body += "§7A moving wall of white dust. It blinds you and speeds infection. You can hear it from a distance before it reaches you.";
            } else {
                body += "§7A wall of white dust that moves across the land. It blinds you and spreads the infection.";
            }
            body += "\n\n";
        }

        if (!hasEntries) {
            body += "§8No biomes or blocks discovered yet.";
        }
        
        form.body(body);
        form.button("§8Back");
        form.show(player).then((res) => {
            // Play page turn sound when going back
            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
            openMain();
        });
    }

    function openLateLore() {
        markSectionViewed(player, "lateLore");
        const codex = getCodex(player);
        const entries = [];

        if (codex.journal?.day20WorldLoreUnlocked) {
            entries.push({
                id: "world",
                title: "Day 20: World Memory",
                summary: "How the land feels under the dust.",
                body: "§eWorld Memory (Day 20)\n§7The air is heavy with dust. Survivors say the dust remembers our steps—mistakes no one recalls making. The journal says the world is keeping score."
            });
        }
        if (codex.journal?.day20TinyLoreUnlocked) {
            entries.push({
                id: "tiny",
                title: "Tiny Vanguard",
                summary: "The small bears with sharp intent.",
                body: "§eTiny Vanguard\n§7The smallest Maple Bears no longer run from light. Their paws cut thin lines through the dust. Packs move in sync. Whatever guides them is patient and keeps count."
            });
        }
        if (codex.journal?.day20InfectedLoreUnlocked) {
            entries.push({
                id: "infected",
                title: "Hollow Procession",
                summary: "What the infected leave behind.",
                body: "§eHollow Procession\n§7Infected Maple Bears move like they carry something heavy. Dust rolls off their shoulders and covers the ground. They hum without voices. Animals go quiet long before they arrive."
            });
        }
        if (codex.journal?.day20BuffLoreUnlocked) {
            entries.push({
                id: "buff",
                title: "Skybreaker",
                summary: "Notes on the heaviest bears.",
                body: "§eSkybreaker\n§7Buff Maple Bears clear the treeline in one jump. When they land, dust flies off the hills and settles back."
            });
        }

        const form = new ActionFormData().title("§6Late Lore");
        form.body(entries.length > 0 ? "§7Recovered notes:" : "§7No late entries yet.");

        for (const entry of entries) {
            let label = `§f${entry.title}\n§8${entry.summary}`;
            const subPath = "lateLore." + entry.id;
            const subState = subsectionHasNewOrUpdated(codex, subPath);
            if (subState.new || subState.updated) {
                label = `§l§o${label} §8(${subState.new ? "new" : "updated"})`;
            }
            form.button(label);
        }
        form.button("§8Back");

        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === entries.length) {
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                return openMain();
            }

            const entry = entries[res.selection];
            markSubsectionViewed(player, "lateLore." + entry.id);
            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_turn_page", { pitch: 0.9, volume: 0.7 * volumeMultiplier });
            new ActionFormData()
                .title(`§6Late Lore: ${entry.title}`)
                .body(`${entry.body}\n\n§8The journal records what we'd rather forget.`)
                .button("§8Back")
                .show(player)
                .then(() => {
                    const volumeMultiplier = getPlayerSoundVolume(player);
                    player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                    openLateLore();
                });
        }).catch(() => { openMain(); });
    }

    function openTimeline() {
        markSectionViewed(player, "timeline");
        const codex = getCodex(player);
        const currentDay = getCurrentDay ? getCurrentDay() : 0;
        const hasDailyEvents = codex.dailyEvents && Object.keys(codex.dailyEvents).length > 0;
        
        const form = new ActionFormData().title("§6Timeline");
        form.body("§7Choose what to view:");
        
        const buttons = [];
        const buttonActions = [];
        
        // Days & Milestones - available from day 2+
        if (currentDay >= 2) {
            buttons.push("§fDays & Milestones");
            buttonActions.push(() => openDaysMilestones());
        }
        
        // Daily Log - available when events exist
        if (hasDailyEvents) {
            buttons.push("§fDaily Log");
            buttonActions.push(() => openDailyLog());
        }
        
        // If nothing is available yet, show a message
        if (buttons.length === 0) {
            form.body("§7Timeline content will unlock as you progress.\n\n§8• Days & Milestones unlock at Day 2\n§8• Daily Log unlocks when events are recorded");
        }
        
        for (const button of buttons) {
            form.button(button);
        }
        form.button("§8Back");
        
        form.show(player).then((res) => {
            if (!res || res.canceled) {
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                return openMain();
            }
            
            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
            const selection = res.selection;
            if (selection >= 0 && selection < buttonActions.length) {
                buttonActions[selection]();
            } else {
                openMain();
            }
        }).catch(() => { openMain(); });
    }

    function openDaysMilestones() {
        const codex = getCodex(player);
        const currentDay = getCurrentDay ? getCurrentDay() : 0;
        const display = typeof getDayDisplayInfo === 'function' ? getDayDisplayInfo(currentDay) : { color: '§f', symbols: '' };
        
        let body = `§6Days & Milestones\n\n`;
        body += `${display.color}${display.symbols} §7Current Day: §f${currentDay}\n\n`;
        
        // Victory status - always show goal, but hide details until reached
        if (currentDay > 25) {
            const daysPastVictory = currentDay - 25;
            body += `§a✓ Victory Achieved! §7(+${daysPastVictory} days past victory)\n`;
            body += `§cThe infection intensifies with each passing day.\n\n`;
        } else if (currentDay === 25) {
            body += `§a§lVICTORY! §r§7You have survived 25 days!\n`;
            body += `§7The infection continues, but you have proven yourself a true survivor.\n\n`;
        } else if (currentDay === 24) {
            body += `§e§lYou're so close... §r§7Only 1 day until victory!\n`;
            body += `§7Survive one more day to achieve your goal.\n\n`;
        } else if (currentDay >= 20) {
            const daysUntilVictory = 25 - currentDay;
            body += `§eAlmost there... §7${daysUntilVictory} days until victory.\n\n`;
        } else {
            body += `§7Your goal: §fSurvive until Day 25\n`;
            body += `§8What happens then? You'll find out when you get there...\n\n`;
        }
        
        // Milestone Days - only show what has been reached or is about to be reached
        body += `§6Milestone Days:\n`;
        
        const milestones = [
            { day: 2, name: "Tiny Maple Bears emerge", reached: currentDay >= 2 },
            { day: 4, name: "Infected variants appear", reached: currentDay >= 4 },
            { day: 8, name: "Flying Bears arrive", reached: currentDay >= 8 },
            { day: 11, name: "Threat escalation", reached: currentDay >= 11 },
            { day: 13, name: "Buff Bears arrive", reached: currentDay >= 13 },
            { day: 15, name: "Mining Bears arrive", reached: currentDay >= 15 },
            { day: 17, name: "Torpedo Bears arrive", reached: currentDay >= 17 },
            { day: 20, name: "Escalation begins", reached: currentDay >= 20, isEscalation: true },
            { day: 25, name: "Victory threshold", reached: currentDay >= 25, isVictory: true }
        ];
        
        for (const milestone of milestones) {
            if (milestone.reached) {
                // Show reached milestones
                if (milestone.isVictory) {
                    body += `§aDay ${milestone.day}: §7${milestone.name}\n`;
                } else {
                    body += `§eDay ${milestone.day}: §7${milestone.name} §a✓\n`;
                }
                
                // Show Day 20 infection rate knowledge (higher level knowledge)
                if (milestone.isEscalation && milestone.day === 20) {
                    const infectionKnowledge = getKnowledgeLevel(player, 'infectionLevel');
                    if (infectionKnowledge >= 3) {
                        body += `\n§6Day 20 Knowledge:\n`;
                        body += `§7At Day 20, the infection reaches maximum conversion rate (100%). Bear attacks and "snow" consumption become far more dangerous. The infection spreads faster and more efficiently at this stage.`;
                    } else if (infectionKnowledge >= 2) {
                        body += `\n§6Day 20 Knowledge:\n`;
                        body += `§7At Day 20, the infection reaches its peak intensity. Conversion rates are maximized.`;
                    }
                }
            } else if (milestone.day === currentDay + 1) {
                // Show next milestone as "coming soon"
                body += `§eDay ${milestone.day}: §8??? §7(Next milestone)\n`;
            } else if (milestone.day <= currentDay + 3) {
                // Show upcoming milestones within 3 days as "coming soon"
                body += `§8Day ${milestone.day}: §8??? §7(Coming soon)\n`;
            } else {
                // Hide future milestones
                body += `§8Day ${milestone.day}: §8???\n`;
            }
        }
        
        // Post-victory information - only show if victory achieved
        if (currentDay > 25) {
            body += `\n§cPost-Victory:\n`;
            body += `§7The infection continues to intensify.\n`;
            body += `§7Every 5 days brings increased danger.\n`;
            body += `§7Spawn rates and conversion rates scale higher.\n`;
        }
        
        // Day Progression Guide - show current and past ranges, hide future
        body += `\n§6Day Progression:\n`;
        const progressionRanges = [
            { range: "Days 0-2", label: "Safe", color: "§a", maxDay: 2 },
            { range: "Days 3-5", label: "Caution", color: "§2", maxDay: 5 },
            { range: "Days 6-7", label: "Warning", color: "§e", maxDay: 7 },
            { range: "Days 8-10", label: "High Danger", color: "§c", maxDay: 10 }, // Milestone day 8: Flying bears
            { range: "Days 11-12", label: "Danger", color: "§6", maxDay: 12 },
            { range: "Days 13-15", label: "Critical", color: "§c", maxDay: 15 }, // Milestone days 13, 15: Buff bears, Mining bears
            { range: "Days 16-17", label: "Extreme", color: "§4", maxDay: 17 }, // Milestone day 17: Torpedo bears
            { range: "Days 18-24", label: "Maximum", color: "§4", maxDay: 24 }, // Milestone day 20: Major escalation
            { range: "Day 25", label: "Victory", color: "§a", maxDay: 25, isVictory: true }
        ];
        
        for (const range of progressionRanges) {
            if (currentDay >= range.maxDay || (range.isVictory && currentDay >= 24)) {
                // Show reached ranges
                body += `§7${range.range}: ${range.color}${range.label}\n`;
            } else if (currentDay >= range.maxDay - 2) {
                // Show upcoming range within 2 days
                body += `§8${range.range}: §8??? §7(Approaching)\n`;
            } else {
                // Hide future ranges
                body += `§8${range.range}: §8???\n`;
            }
        }
        
        // Post-victory progression - only show if victory achieved
        if (currentDay > 25) {
            const postVictoryRanges = [
                { range: "Days 26-33", label: "Escalating", color: "§c", maxDay: 33 },
                { range: "Days 34-41", label: "Intensifying", color: "§4", maxDay: 41 },
                { range: "Days 42-49", label: "Extreme", color: "§5", maxDay: 49 },
                { range: "Day 50", label: "Milestone", color: "§5", maxDay: 50, isMilestone: true },
                { range: "Days 51-62", label: "Deepening", color: "§5", maxDay: 62 },
                { range: "Days 63-74", label: "Darkening", color: "§5", maxDay: 74 },
                { range: "Day 75", label: "Milestone", color: "§5", maxDay: 75, isMilestone: true },
                { range: "Days 76-87", label: "Void Approaching", color: "§0", maxDay: 87 },
                { range: "Days 88-99", label: "The End Nears", color: "§0", maxDay: 99 },
                { range: "Day 100", label: "Final Milestone", color: "§0", maxDay: 100, isMilestone: true },
                { range: "Days 101+", label: "Beyond", color: "§0", maxDay: Infinity }
            ];
            
            for (const range of postVictoryRanges) {
                if (currentDay >= range.maxDay) {
                    body += `§7${range.range}: ${range.color}${range.label}\n`;
                } else if (range.maxDay === Infinity || currentDay >= range.maxDay - 2) {
                    body += `§8${range.range}: §8??? §7(Approaching)\n`;
                } else {
                    body += `§8${range.range}: §8???\n`;
                }
            }
        }
        
        const form = new ActionFormData().title("§6Days & Milestones").body(body).button("§8Back");
        form.show(player).then((res) => {
            if (!res || res.canceled) {
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                return openTimeline();
            }
            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
            openTimeline();
        }).catch(() => { openTimeline(); });
    }

    function openAchievements() {
        markSectionViewed(player, "achievements");
        const codex = getCodex(player);
        let body = `§6Achievements\n\n`;
        
        const achievements = codex.achievements || {};
        
        if (achievements.day25Victory) {
            body += `§a✓ Victory Achieved\n`;
            body += `§7Survived until Day 25\n`;
            if (achievements.day25VictoryDate) {
                body += `§8Achieved on Day ${achievements.day25VictoryDate}\n`;
            }
            body += `\n`;
        } else {
            body += `§8✗ Victory Achieved\n`;
            body += `§7Survive until Day 25\n\n`;
        }
        
        if (achievements.maxDaysSurvived && achievements.maxDaysSurvived > 25) {
            const daysPastVictory = achievements.maxDaysSurvived - 25;
            body += `§6Post-Victory Milestones:\n`;
            body += `§7Maximum Days Survived: §f${achievements.maxDaysSurvived}\n`;
            body += `§7Days Past Victory: §f${daysPastVictory}\n\n`;
            
            // Show milestone achievements (not yet achieved = ??? by length)
            const milestones = [30, 35, 40, 45, 50];
            for (const milestone of milestones) {
                const milestoneKey = `day${milestone}Survived`;
                const label = `Day ${milestone} Survived`;
                if (achievements[milestoneKey]) {
                    body += `§a✓ ${label}\n`;
                } else if (achievements.maxDaysSurvived >= milestone) {
                    body += `§a✓ ${label}\n`;
                } else {
                    body += `§8✗ ${"?".repeat(label.length)}\n`;
                }
            }
        } else if (achievements.maxDaysSurvived) {
            body += `§7Maximum Days Survived: §f${achievements.maxDaysSurvived}\n`;
        }
        
        // First cures: Minor always shown; Major only if player has had major infection
        const majorDiscovered = codex.infections?.major && (typeof codex.infections.major === "object" ? codex.infections.major.discovered : !!codex.infections.major);
        body += `\n§6Cures\n`;
        body += achievements.firstMinorCure ? `§a✓ Minor Cure\n` : `§8✗ Minor Cure\n`;
        if (majorDiscovered) {
            body += achievements.firstMajorCure ? `§a✓ Major Cure\n` : `§8✗ Major Cure\n`;
        }
        
        // First bear kills: show name only when unlocked or when player has experienced that mob (seen in codex)
        const firstKillEntries = [
            { key: "firstKill_tinyBear", label: "Maple Bear", seenKey: "mapleBearSeen" },
            { key: "firstKill_infectedBear", label: "Infected Bear", seenKey: "infectedBearSeen" },
            { key: "firstKill_buffBear", label: "Buff Maple Bear", seenKey: "buffBearSeen" },
            { key: "firstKill_flyingBear", label: "Flying Maple Bear", seenKey: "flyingBearSeen" },
            { key: "firstKill_miningBear", label: "Mining Maple Bear", seenKey: "miningBearSeen" },
            { key: "firstKill_torpedoBear", label: "Torpedo Maple Bear", seenKey: "torpedoBearSeen" }
        ];
        body += `\n§6First Kills\n`;
        for (const { key, label, seenKey } of firstKillEntries) {
            const unlocked = achievements[key];
            const revealed = codex.mobs && codex.mobs[seenKey];
            const displayName = (unlocked || revealed) ? label : "?".repeat(label.length);
            body += unlocked ? `§a✓ First ${displayName} kill\n` : `§8✗ First ${displayName} kill\n`;
        }
        // Hidden easter-egg achievements (only shown when unlocked)
        const hiddenEntries = [
            { key: "hiddenDeathByAll", label: "Death by All", desc: "Died to every bear type (tiny, infected, buff, flying, mining, torpedo)." },
            { key: "hiddenDay100Survived", label: "Day 100", desc: "Survived to Day 100." },
            { key: "hidden100TorpedoKills", label: "Torpedo Hunter", desc: "Killed 100 torpedo Maple Bears." }
        ];
        for (const { key, label, desc } of hiddenEntries) {
            if (achievements[key]) {
                if (!body.endsWith("\n\n")) body += "\n";
                body += `§5Hidden\n`;
                body += `§a✓ ${label}\n§7${desc}\n`;
            }
        }
        
        const form = new ActionFormData().title("§6Achievements").body(body).button("§8Back");
        form.show(player).then((res) => {
            if (!res || res.canceled) {
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                return openMain();
            }
            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
            return openMain();
        }).catch(() => { openMain(); });
    }

    function openBearsTargetPlayerMenu() {
        const allPlayers = world.getAllPlayers();
        const form = new ActionFormData()
            .title("§cBears Target Player")
            .body("§7Make all nearby bears (with AI) target this player. §8(Clear to restore normal targeting.)");
        form.button("§aMe §8(" + player.name + ")");
        for (const p of allPlayers) {
            if (p && p.id !== player.id) form.button("§f" + p.name);
        }
        form.button("§cClear §8(normal targeting)");
        form.button("§8Back");
        const others = allPlayers.filter(p => p && p.id !== player.id);
        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === 1 + others.length + 1) {
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * getPlayerSoundVolume(player) });
                return openDeveloperTools();
            }
            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * getPlayerSoundVolume(player) });
            if (res.selection === 0) triggerDebugCommand("set_force_target_player", [player.name], () => openDeveloperTools());
            else if (res.selection <= others.length) triggerDebugCommand("set_force_target_player", [others[res.selection - 1].name], () => openDeveloperTools());
            else if (res.selection === 1 + others.length) triggerDebugCommand("set_force_target_player", [], () => openDeveloperTools());
            else openDeveloperTools();
        }).catch(() => openDeveloperTools());
    }

    function openListBearsMenu() {
        const form = new ActionFormData()
            .title("§cList Bears")
            .body("§7Choose radius and dimension. Result is sent to chat.");
        form.button("§f32 blocks §8(current dim)");
        form.button("§f64 blocks §8(current dim)");
        form.button("§f128 blocks §8(current dim)");
        form.button("§f256 blocks §8(current dim)");
        form.button("§e128 blocks §8(overworld)");
        form.button("§e128 blocks §8(nether)");
        form.button("§e128 blocks §8(end)");
        form.button("§8Back");
        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === 7) {
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * getPlayerSoundVolume(player) });
                return openDeveloperTools();
            }
            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * getPlayerSoundVolume(player) });
            const radiusDim = [
                ["32", ""],
                ["64", ""],
                ["128", ""],
                ["256", ""],
                ["128", "overworld"],
                ["128", "nether"],
                ["128", "the_end"]
            ];
            const [radius, dim] = radiusDim[res.selection] || ["128", ""];
            const args = [radius];
            if (dim) args.push(dim);
            triggerDebugCommand("list_bears", args, () => openDeveloperTools());
        }).catch(() => openDeveloperTools());
    }

    function openClearBearsMenu() {
        const form = new ActionFormData()
            .title("§cClear Bears")
            .body("§7Kill all Maple Bears (and infected mobs) within radius. §8(current dimension)");
        form.button("§f64 blocks");
        form.button("§c128 blocks");
        form.button("§8Back");
        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === 2) {
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * getPlayerSoundVolume(player) });
                return openDeveloperTools();
            }
            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * getPlayerSoundVolume(player) });
            const radius = res.selection === 0 ? "64" : "128";
            triggerDebugCommand("clear_bears", [radius], () => openDeveloperTools());
        }).catch(() => openDeveloperTools());
    }

    function openResetCodexSectionMenu() {
        openTargetPlayerMenu("Reset Codex Section", (targetName) => {
            const form = new ActionFormData()
                .title("§cReset Codex Section")
                .body("§7Reset only this part of the codex." + (targetName ? ` §8(Target: ${targetName})` : ""));
            form.button("§fMobs");
            form.button("§fItems");
            form.button("§fInfections");
            form.button("§fJournal");
            form.button("§cAll");
            form.button("§8Back");
            form.show(player).then((res) => {
                if (!res || res.canceled || res.selection === 5) {
                    player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * getPlayerSoundVolume(player) });
                    return openDeveloperTools();
                }
                player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * getPlayerSoundVolume(player) });
                const sections = ["mobs", "items", "infections", "journal", "all"];
                const section = sections[res.selection];
                if (section) {
                    const args = targetName ? [section, targetName] : [section];
                    triggerDebugCommand("reset_codex_section", args, () => openDeveloperTools());
                } else openDeveloperTools();
            }).catch(() => openDeveloperTools());
        });
    }

    function openTargetPlayerMenu(caption, onSelect) {
        const allPlayers = world.getAllPlayers();
        const others = allPlayers.filter(p => p && p.id !== player.id);
        const form = new ActionFormData()
            .title("§cTarget Player")
            .body(`§7Apply to whom? §8(${caption})`);
        form.button("§aMe §8(" + player.name + ")");
        for (const p of others) {
            form.button("§f" + p.name);
        }
        form.button("§8Back");
        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === 1 + others.length) {
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * getPlayerSoundVolume(player) });
                return openDeveloperTools();
            }
            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * getPlayerSoundVolume(player) });
            if (res.selection === 0) {
                onSelect(null);
            } else if (res.selection >= 1 && res.selection <= others.length) {
                onSelect(others[res.selection - 1].name);
            } else {
                openDeveloperTools();
            }
        }).catch(() => openDeveloperTools());
    }

    function openDumpCodexTargetMenu() {
        openTargetPlayerMenu("Dump Codex", (targetName) => {
            openDumpCodexMenu(targetName);
        });
    }

    function openDumpCodexMenu(targetName) {
        const form = new ActionFormData()
            .title("§cDump Codex")
            .body("§7Output is sent to chat and to logs. §8Summary = high-level keys/counts. Full = entire JSON in chunks.");
        form.button("§fSnippet §8(truncated)");
        form.button("§eSummary §8(keys/counts)");
        form.button("§cFull §8(JSON, chunks + logs)");
        form.button("§8Back");
        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === 3) {
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * getPlayerSoundVolume(player) });
                return openDeveloperTools();
            }
            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * getPlayerSoundVolume(player) });
            const args = targetName ? (res.selection === 0 ? [targetName] : res.selection === 1 ? ["summary", targetName] : ["full", targetName]) : (res.selection === 0 ? [] : res.selection === 1 ? ["summary"] : ["full"]);
            if (res.selection >= 0 && res.selection <= 2) triggerDebugCommand("dump_codex", args, () => openDeveloperTools());
            else openDeveloperTools();
        }).catch(() => openDeveloperTools());
    }

    const PINNABLE_DEV_ITEMS = [
        { id: "script_toggles", label: "Script Toggles", action: () => openScriptTogglesMenu() },
        { id: "summon_storm", label: "Summon Storm", action: () => openSummonStormMenu() },
        { id: "storm_state", label: "Storm State", action: () => openStormStateMenu() },
        { id: "storm_override", label: "Storm Override", action: () => openStormOverrideMenu() },
        { id: "debug_menu", label: "Debug Menu", action: () => openDebugMenu() },
        { id: "spawn_difficulty", label: "Spawn Difficulty", action: () => openSpawnDifficultyMenu() },
        { id: "force_spawn", label: "Force Spawn", action: () => openForceSpawnMenu() },
        { id: "clear_bears", label: "Clear Bears", action: () => openClearBearsMenu() }
    ];

    function getPinnedDevItems(p) {
        try {
            const raw = getPlayerProperty(p, "mb_pinned_dev_items");
            if (!raw || typeof raw !== "string") return [];
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : [];
        } catch { return []; }
    }

    function setPinnedDevItems(p, ids) {
        try {
            setPlayerProperty(p, "mb_pinned_dev_items", JSON.stringify(ids));
        } catch { }
    }

    function openPinUnpinMenu() {
        const pinned = new Set(getPinnedDevItems(player));
        const form = new ActionFormData()
            .title("§fPin/Unpin to Main Menu")
            .body("§7Pinned items appear on the journal main menu for quick access.\n§8Current pins: " + (pinned.size ? Array.from(pinned).join(", ") : "none"));
        for (const item of PINNABLE_DEV_ITEMS) {
            const isPinned = pinned.has(item.id);
            form.button((isPinned ? "§a" : "§f") + item.label + (isPinned ? " §8(pinned)" : ""));
        }
        form.button("§8Back");
        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === PINNABLE_DEV_ITEMS.length) {
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * getPlayerSoundVolume(player) });
                return openDeveloperTools();
            }
            const item = PINNABLE_DEV_ITEMS[res.selection];
            if (item) {
                if (pinned.has(item.id)) {
                    pinned.delete(item.id);
                    player.sendMessage(CHAT_DEV + "[PIN] " + CHAT_INFO + `Unpinned "${item.label}" from main menu`);
                } else {
                    pinned.add(item.id);
                    player.sendMessage(CHAT_DEV + "[PIN] " + CHAT_INFO + `Pinned "${item.label}" to main menu`);
                }
                setPinnedDevItems(player, Array.from(pinned));
            }
            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * getPlayerSoundVolume(player) });
            openPinUnpinMenu(); // Refresh
        }).catch(() => openDeveloperTools());
    }

    function openDeveloperTools() {
        const options = [
            { label: "§fPin/Unpin to Main Menu", action: () => openPinUnpinMenu() },
            { label: "§fScript Toggles", action: () => openScriptTogglesMenu() },
            { label: "§aFully Unlock Codex", action: () => { fullyUnlockCodex(player); player.sendMessage(CHAT_SUCCESS + "Codex fully unlocked."); openDeveloperTools(); } },
            { label: "§fReset My Codex", action: () => openTargetPlayerMenu("Reset Codex", (name) => { triggerDebugCommand("reset_codex", name ? [name] : []); openDeveloperTools(); }) },
            { label: "§fReset World Day to 1", action: () => triggerDebugCommand("reset_day") },
            { label: "§fSet Day...", action: () => promptSetDay() },
            { label: "§fSpawn Difficulty", action: () => openSpawnDifficultyMenu() },
            { label: "§fSpawn Type Toggles", action: () => openSpawnTypeTogglesMenu() },
            { label: "§fClear / Set Infection", action: () => openTargetPlayerMenu("Infection", (name) => openInfectionDevMenu(name)) },
            { label: "§fGrant / Remove Immunity", action: () => openTargetPlayerMenu("Immunity", (name) => openImmunityDevMenu(name)) },
            { label: "§fReset Intro", action: () => triggerDebugCommand("reset_intro", [], () => openDeveloperTools()) },
            { label: "§fBears Target Player", action: () => openBearsTargetPlayerMenu() },
            { label: "§fList Nearby Bears", action: () => openListBearsMenu() },
            { label: "§fForce Spawn", action: () => openForceSpawnMenu() },
            { label: "§fSimulate Next Day", action: () => { triggerDebugCommand("simulate_next_day", [], () => openDeveloperTools()); } },
            { label: "§fClear Bears (radius)", action: () => openClearBearsMenu() },
            { label: "§fInspect Nearest Bear", action: () => triggerDebugCommand("inspect_entity", [], () => openDeveloperTools()) },
            { label: "§fReset Codex Section", action: () => openResetCodexSectionMenu() },
            { label: "§fDump Codex State", action: () => openDumpCodexTargetMenu() },
            { label: "§fSet Kill Counts", action: () => openTargetPlayerMenu("Set Kill Counts", (name) => openSetKillCountMenu(name)) },
            { label: "§bSummon Storm", action: () => openSummonStormMenu() },
            { label: "§bStorm State", action: () => openStormStateMenu() },
            { label: "§bStorm Override", action: () => openStormOverrideMenu() }
        ];

        const form = new ActionFormData().title("§cDeveloper Tools");
        form.body("§7Debug utilities. §8Fully Unlock: unlock all codex content. Reset: clear all codex data. Script Toggles: enable/disable scripts if things break.");
        for (const opt of options) {
            form.button(opt.label);
        }
        form.button("§8Back");

        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === options.length) {
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                return openMain();
            }

            const chosen = options[res.selection];
            if (chosen) {
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * volumeMultiplier });
                chosen.action();
            } else {
                openDeveloperTools();
            }
        });
    }

    function openScriptTogglesMenu() {
        const toggles = getAllScriptToggles();
        const labels = {
            [SCRIPT_IDS.mining]: "Mining AI",
            [SCRIPT_IDS.infected]: "Infected AI",
            [SCRIPT_IDS.flying]: "Flying AI",
            [SCRIPT_IDS.torpedo]: "Torpedo AI",
            [SCRIPT_IDS.buff]: "Buff AI",
            [SCRIPT_IDS.biomeAmbience]: "Biome Ambience",
            [SCRIPT_IDS.spawnController]: "Spawn Controller"
        };
        const ids = [SCRIPT_IDS.mining, SCRIPT_IDS.infected, SCRIPT_IDS.flying, SCRIPT_IDS.torpedo, SCRIPT_IDS.buff, SCRIPT_IDS.biomeAmbience, SCRIPT_IDS.spawnController];
        const body = ids.map(id => `§7${labels[id]}: §${toggles[id] ? "aON" : "cOFF"}`).join("\n");
        const form = new ActionFormData()
            .title("§cScript Toggles")
            .body(`§7Enable/disable scripts. §8Useful if something breaks.\n\n${body}`);

        ids.forEach((id) => {
            form.button(toggles[id] ? `§a${labels[id]} §8(ON) → OFF` : `§c${labels[id]} §8(OFF) → ON`);
        });
        form.button("§8Back");

        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === ids.length) {
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                return openDeveloperTools();
            }
            if (res.selection >= 0 && res.selection < ids.length) {
                const id = ids[res.selection];
                const next = !toggles[id];
                setScriptEnabled(id, next);
                player.sendMessage(CHAT_INFO + labels[id] + ": " + (next ? CHAT_SUCCESS + "ON" : CHAT_DANGER + "OFF"));
                player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * getPlayerSoundVolume(player) });
            }
            openScriptTogglesMenu();
        }).catch(() => openDeveloperTools());
    }

    function getSpawnDifficultyLabel(value) {
        if (value === -1) return "Easy";
        if (value === 0) return "Normal";
        if (value === 1) return "Hard";
        return value > 0 ? `Custom (+${value})` : `Custom (${value})`;
    }

    function getSpawnDifficultyPreview(value) {
        if (value <= -2) return "§8Fewer spawns, longer intervals.";
        if (value === -1) return "§8Slightly fewer spawns (Easy).";
        if (value === 0) return "§8Normal spawn rate.";
        if (value === 1) return "§8Slightly more spawns (Hard).";
        if (value >= 2) return "§8More spawns, shorter intervals.";
        return "";
    }

    function openSpawnDifficultyMenu() {
        const currentRaw = Number(getWorldProperty(SPAWN_DIFFICULTY_PROPERTY) ?? 0);
        const label = getSpawnDifficultyLabel(currentRaw);
        const preview = getSpawnDifficultyPreview(currentRaw);
        const form = new ActionFormData()
            .title("§cSpawn Difficulty")
            .body(`§7Current Setting: §f${label}\n§7Value: §f${currentRaw}\n\n${preview ? preview + "\n\n" : ""}§8Adjust how aggressively Maple Bears spawn.\n§8Custom values range from §f-5 (calm)§8 to §f+5 (relentless).`);

        form.button("§aEasy (-1)");
        form.button("§fNormal (0)");
        form.button("§cHard (+1)");
        form.button("§eCustom Value");
        form.button("§8Back");

        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === 4) {
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                return openDeveloperTools();
            }

            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * volumeMultiplier });
            switch (res.selection) {
                case 0:
                    return triggerDebugCommand("set_spawn_difficulty", ["easy"], () => openSpawnDifficultyMenu());
                case 1:
                    return triggerDebugCommand("set_spawn_difficulty", ["normal"], () => openSpawnDifficultyMenu());
                case 2:
                    return triggerDebugCommand("set_spawn_difficulty", ["hard"], () => openSpawnDifficultyMenu());
                case 3:
                    return promptCustomSpawnDifficulty(currentRaw);
                default:
                    return openDeveloperTools();
            }
        }).catch(() => openDeveloperTools());
    }

    function promptCustomSpawnDifficulty(currentValue = 0) {
        const modal = new ModalFormData()
            .title("§cCustom Spawn Difficulty")
            .textField("Enter value (-5 to 5)", String(currentValue));

        modal.show(player).then((res) => {
            if (!res || res.canceled) {
                return openSpawnDifficultyMenu();
            }

            const rawInput = res.formValues?.[0] ?? "";
            const parsed = parseInt(rawInput, 10);
            if (Number.isNaN(parsed)) {
                player.sendMessage(CHAT_DEV + "[MBI] " + CHAT_INFO + "Invalid difficulty value.");
                return openSpawnDifficultyMenu();
            }

            if (parsed < -5 || parsed > 5) {
                player.sendMessage(CHAT_DEV + "[MBI] " + CHAT_INFO + "Enter a value between -5 (calm) and +5 (relentless).");
                return openSpawnDifficultyMenu();
            }

            triggerDebugCommand("set_spawn_difficulty_value", [String(parsed)], () => openSpawnDifficultyMenu());
        }).catch(() => openSpawnDifficultyMenu());
    }

    function openSpawnTypeTogglesMenu() {
        const configs = getSpawnConfigsForDevTools();
        const disabled = getDisabledSpawnTypes();
        const form = new ModalFormData().title("§cSpawn Type Toggles");
        form.toggle("§7§oUncheck a type to disable it from natural spawning.", { defaultValue: false });
        for (const { id, label } of configs) {
            const allowed = !disabled.has(id);
            form.toggle(`§f${label} §8(${id})`, { defaultValue: allowed });
        }
        form.show(player).then((res) => {
            if (!res || res.canceled) {
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                return openDeveloperTools();
            }
            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * volumeMultiplier });
            const formValues = res.formValues || [];
            const newDisabled = new Set();
            configs.forEach((cfg, idx) => {
                const toggleIdx = idx + 1;
                const allowed = formValues[toggleIdx] === true;
                if (!allowed) newDisabled.add(cfg.id);
            });
            setDisabledSpawnTypes(newDisabled);
            const count = newDisabled.size;
            player.sendMessage(CHAT_SUCCESS + (count === 0 ? "All bear types can spawn." : `Spawn disabled for ${count} type(s).`));
            openDeveloperTools();
        }).catch(() => openDeveloperTools());
    }

    function openInfectionDevMenu(targetName) {
        const form = new ActionFormData()
            .title("§cClear / Set Infection")
            .body("§7Clear infection state or set minor/major infection for testing." + (targetName ? ` §8(Target: ${targetName})` : ""));
        form.button("§cClear Infection");
        form.button("§eSet Minor Infection");
        form.button("§4Set Major Infection");
        form.button("§8Back");
        const infectArgs = (extra) => (targetName ? [...extra, targetName] : extra);
        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === 3) {
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * getPlayerSoundVolume(player) });
                return openDeveloperTools();
            }
            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * getPlayerSoundVolume(player) });
            if (res.selection === 0) triggerDebugCommand("clear_infection", infectArgs([]), () => openInfectionDevMenu(targetName));
            else if (res.selection === 1) triggerDebugCommand("set_infection", infectArgs(["minor"]), () => openInfectionDevMenu(targetName));
            else if (res.selection === 2) triggerDebugCommand("set_infection", infectArgs(["major"]), () => openInfectionDevMenu(targetName));
            else openDeveloperTools();
        }).catch(() => openDeveloperTools());
    }

    function openImmunityDevMenu(targetName) {
        const form = new ActionFormData()
            .title("§cGrant / Remove Immunity")
            .body("§7Grant permanent or temporary immunity, or remove immunity." + (targetName ? ` §8(Target: ${targetName})` : ""));
        form.button("§aGrant Permanent Immunity");
        form.button("§bGrant Temporary Immunity (5 min)");
        form.button("§cRemove Immunity");
        form.button("§8Back");
        const immunArgs = (extra) => (targetName ? [...extra, targetName] : extra);
        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === 3) {
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * getPlayerSoundVolume(player) });
                return openDeveloperTools();
            }
            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * getPlayerSoundVolume(player) });
            if (res.selection === 0) triggerDebugCommand("grant_immunity", immunArgs(["permanent"]), () => openImmunityDevMenu(targetName));
            else if (res.selection === 1) triggerDebugCommand("grant_immunity", immunArgs(["temporary"]), () => openImmunityDevMenu(targetName));
            else if (res.selection === 2) triggerDebugCommand("remove_immunity", immunArgs([]), () => openImmunityDevMenu(targetName));
            else openDeveloperTools();
        }).catch(() => openDeveloperTools());
    }

    const FORCE_SPAWN_OPTIONS = [
        { id: "mb:mb_day00", label: "Tiny (day 0)" },
        { id: "mb:mb_day04", label: "Tiny (day 4)" },
        { id: "mb:mb_day08", label: "Tiny (day 8)" },
        { id: "mb:mb_day13", label: "Tiny (day 13)" },
        { id: "mb:mb_day20", label: "Tiny (day 20)" },
        { id: "mb:infected", label: "Infected" },
        { id: "mb:infected_day08", label: "Infected (day 8)" },
        { id: "mb:infected_day13", label: "Infected (day 13)" },
        { id: "mb:infected_day20", label: "Infected (day 20)" },
        { id: "mb:buff_mb", label: "Buff" },
        { id: "mb:buff_mb_day13", label: "Buff (day 13)" },
        { id: "mb:buff_mb_day20", label: "Buff (day 20)" },
        { id: "mb:flying_mb", label: "Flying" },
        { id: "mb:flying_mb_day15", label: "Flying (day 15)" },
        { id: "mb:flying_mb_day20", label: "Flying (day 20)" },
        { id: "mb:mining_mb", label: "Mining" },
        { id: "mb:mining_mb_day20", label: "Mining (day 20)" },
        { id: "mb:torpedo_mb", label: "Torpedo" },
        { id: "mb:torpedo_mb_day20", label: "Torpedo (day 20)" }
    ];

    function openForceSpawnMenu() {
        const form = new ActionFormData()
            .title("§cForce Spawn")
            .body("§7Spawn a bear type near you or another player.");
        for (const opt of FORCE_SPAWN_OPTIONS) {
            form.button(`§f${opt.label} §8(${opt.id})`);
        }
        form.button("§8Back");
        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === FORCE_SPAWN_OPTIONS.length) {
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * getPlayerSoundVolume(player) });
                return openDeveloperTools();
            }
            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * getPlayerSoundVolume(player) });
            const opt = FORCE_SPAWN_OPTIONS[res.selection];
            if (opt) openForceSpawnTargetMenu(opt);
            else openDeveloperTools();
        }).catch(() => openDeveloperTools());
    }

    const FORCE_SPAWN_DISTANCES = [
        { value: "2", label: "Near (2 blocks)" },
        { value: "5", label: "5 blocks" },
        { value: "10", label: "10 blocks" },
        { value: "15", label: "15 blocks" },
        { value: "20", label: "20 blocks" },
        { value: "random", label: "Random (within 20 blocks)" }
    ];

    function openForceSpawnTargetMenu(opt) {
        const allPlayers = world.getAllPlayers();
        const otherPlayers = allPlayers.filter(p => p && p.id !== player.id);
        const form = new ActionFormData()
            .title("§cForce Spawn — Target")
            .body(`§7Spawn §f${opt.label}§7 near whom?`);
        form.button("§aNear me");
        for (const p of otherPlayers) {
            form.button(`§f${p.name}`);
        }
        form.button("§8Back");
        const totalOptions = 1 + otherPlayers.length;
        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === totalOptions) {
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * getPlayerSoundVolume(player) });
                return openForceSpawnMenu();
            }
            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * getPlayerSoundVolume(player) });
            const targetName = res.selection === 0 ? undefined : (otherPlayers[res.selection - 1]?.name);
            if (res.selection === 0 || targetName) openForceSpawnDistanceMenu(opt, targetName);
            else openForceSpawnMenu();
        }).catch(() => openForceSpawnMenu());
    }

    const FORCE_SPAWN_QUANTITIES = [
        { value: 1, label: "1" },
        { value: 5, label: "5" },
        { value: 10, label: "10" }
    ];

    function openForceSpawnDistanceMenu(opt, targetName) {
        const form = new ActionFormData()
            .title("§cForce Spawn — Distance")
            .body(`§7How far from the target? §8(Target: ${targetName ? targetName : "you"})`);
        for (const d of FORCE_SPAWN_DISTANCES) {
            form.button(`§f${d.label}`);
        }
        form.button("§8Back");
        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === FORCE_SPAWN_DISTANCES.length) {
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * getPlayerSoundVolume(player) });
                return openForceSpawnTargetMenu(opt);
            }
            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * getPlayerSoundVolume(player) });
            const distOpt = FORCE_SPAWN_DISTANCES[res.selection];
            if (distOpt) openForceSpawnQuantityMenu(opt, targetName, distOpt.value);
            else openForceSpawnTargetMenu(opt);
        }).catch(() => openForceSpawnTargetMenu(opt));
    }

    function openForceSpawnQuantityMenu(opt, targetName, distanceValue) {
        const form = new ActionFormData()
            .title("§cForce Spawn — Quantity")
            .body(`§7How many to spawn? §8(Distance: ${distanceValue} blocks)`);
        for (const q of FORCE_SPAWN_QUANTITIES) {
            form.button(`§f${q.label}`);
        }
        form.button("§8Back");
        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === FORCE_SPAWN_QUANTITIES.length) {
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * getPlayerSoundVolume(player) });
                return openForceSpawnMenu();
            }
            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * getPlayerSoundVolume(player) });
            const qOpt = FORCE_SPAWN_QUANTITIES[res.selection];
            if (qOpt) {
                const args = [opt.id];
                if (targetName) args.push(targetName);
                args.push(distanceValue, String(qOpt.value));
                triggerDebugCommand("force_spawn", args, () => openForceSpawnMenu());
            } else openForceSpawnMenu();
        }).catch(() => openForceSpawnMenu());
    }

    const KILL_COUNT_KEYS = [
        { key: "tinyBearKills", label: "Tiny Bear" },
        { key: "infectedBearKills", label: "Infected Bear" },
        { key: "infectedPigKills", label: "Infected Pig" },
        { key: "infectedCowKills", label: "Infected Cow" },
        { key: "buffBearKills", label: "Buff Bear" },
        { key: "flyingBearKills", label: "Flying Bear" },
        { key: "miningBearKills", label: "Mining Bear" },
        { key: "torpedoBearKills", label: "Torpedo Bear" }
    ];

    function openSetKillCountMenu(targetName) {
        const targetPlayer = targetName ? world.getAllPlayers().find(p => p.name === targetName) : player;
        const form = new ActionFormData()
            .title("§cSet Kill Counts")
            .body("§7Set codex kill count for a mob type (for testing achievements/entries)." + (targetName ? ` §8(Target: ${targetName})` : ""));
        for (const opt of KILL_COUNT_KEYS) {
            const codex = targetPlayer ? getCodex(targetPlayer) : getCodex(player);
            const current = codex.mobs?.[opt.key] ?? 0;
            form.button(`§f${opt.label} §8(current: ${current})`);
        }
        form.button("§8Back");
        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === KILL_COUNT_KEYS.length) {
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * getPlayerSoundVolume(player) });
                return openDeveloperTools();
            }
            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * getPlayerSoundVolume(player) });
            const opt = KILL_COUNT_KEYS[res.selection];
            if (!opt) return openDeveloperTools();
            const codex = targetPlayer ? getCodex(targetPlayer) : getCodex(player);
            const current = codex.mobs?.[opt.key] ?? 0;
            const modal = new ModalFormData()
                .title("§cSet Kill Count")
                .slider("Value (0–500)", 0, 500, { valueStep: 1, defaultValue: Math.min(500, Math.max(0, current)) });
            modal.show(player).then((modalRes) => {
                if (!modalRes || modalRes.canceled) return openSetKillCountMenu(targetName);
                const value = typeof modalRes.formValues?.[0] === "number" ? Math.round(modalRes.formValues[0]) : current;
                const setArgs = targetName ? [opt.key, String(value), targetName] : [opt.key, String(value)];
                triggerDebugCommand("set_kill_count", setArgs, () => openSetKillCountMenu(targetName));
            }).catch(() => openSetKillCountMenu(targetName));
        }).catch(() => openDeveloperTools());
    }

    function openSummonStormMenu() {
        const state = getStormState();
        const form = new ActionFormData()
            .title("§cSummon Storm")
            .body("§7Summon or end a snow storm for testing.");
        form.button("§bMinor Storm");
        form.button("§cMajor Storm");
        form.button(state.active ? "§4End Storm" : "§8End Storm §7(no storm active)");
        form.button("§8Back");
        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === 3) {
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * getPlayerSoundVolume(player) });
                return openDeveloperTools();
            }
            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * getPlayerSoundVolume(player) });
            if (res.selection === 2) {
                if (state.active) {
                    endStorm(true);
                    player.sendMessage(CHAT_INFO + "Storm ended.");
                }
                return openSummonStormMenu();
            }
            const type = res.selection === 0 ? "minor" : "major";
            openSummonStormTargetMenu(type);
        }).catch(() => openDeveloperTools());
    }

    function openSummonStormTargetMenu(type) {
        const allPlayers = world.getAllPlayers();
        const otherPlayers = allPlayers.filter(p => p && p.id !== player.id);
        const form = new ActionFormData()
            .title("§cSummon Storm — Target")
            .body(`§7Summon §f${type}§7 storm near whom?`);
        form.button("§aNear me");
        for (const p of otherPlayers) {
            form.button(`§f${p.name}`);
        }
        form.button("§8Back");
        const totalOptions = 1 + otherPlayers.length;
        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === totalOptions) {
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * getPlayerSoundVolume(player) });
                return openSummonStormMenu();
            }
            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * getPlayerSoundVolume(player) });
            const targetName = res.selection === 0 ? undefined : (otherPlayers[res.selection - 1]?.name);
            if (res.selection === 0 || targetName) {
                openSummonStormDistanceMenu(type, targetName);
            } else {
                openSummonStormMenu();
            }
        }).catch(() => openSummonStormMenu());
    }

    const STORM_DISTANCES = [
        { value: 0, label: "At player" },
        { value: 10, label: "10 blocks away" },
        { value: 20, label: "20 blocks away" },
        { value: 50, label: "50 blocks away" },
        { value: 100, label: "100 blocks away" }
    ];

    function openSummonStormDistanceMenu(type, targetName) {
        const form = new ActionFormData()
            .title("§cSummon Storm — Distance")
            .body(`§7How far from target? §8(Target: ${targetName ? targetName : "you"})`);
        for (const d of STORM_DISTANCES) {
            form.button(`§f${d.label}`);
        }
        form.button("§8Back");
        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === STORM_DISTANCES.length) {
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * getPlayerSoundVolume(player) });
                return openSummonStormTargetMenu(type);
            }
            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * getPlayerSoundVolume(player) });
            const distOpt = STORM_DISTANCES[res.selection];
            if (distOpt) {
                // Always pass [type, targetName, distance] so distance is never mistaken for player name
                const args = [type, targetName ?? "", String(distOpt.value)];
                triggerDebugCommand("summon_storm", args, () => openSummonStormMenu());
            } else {
                openSummonStormTargetMenu(type);
            }
        }).catch(() => openSummonStormTargetMenu(type));
    }

    function openStormStateMenu() {
        try {
            const state = getStormState();
            const currentTick = system.currentTick;
            const activeStatus = state.active ? `§aYes §7(Type: §f${state.type}§7)` : "§cNo";
            const endTime = state.active && state.endTick > currentTick 
                ? `§f${Math.floor((state.endTick - currentTick) / 20)}s`
                : "§7N/A";
            const cooldownTime = state.cooldownEndTick > currentTick
                ? `§f${Math.floor((state.cooldownEndTick - currentTick) / 20)}s`
                : "§aReady";
            const overrideStatus = state.override ? "§cEnabled" : "§aDisabled";
            
            const form = new ActionFormData()
                .title("§cStorm State")
                .body(`§7Current storm status:\n\n§7Active: ${activeStatus}\n§7Ends in: ${endTime}\n§7Cooldown: ${cooldownTime}\n§7Players in storm: §f${state.playersInStorm}\n§7Override: ${overrideStatus}`);
            form.button("§8Back");
            form.show(player).then((res) => {
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * getPlayerSoundVolume(player) });
                openDeveloperTools();
            }).catch(() => openDeveloperTools());
        } catch (err) {
            console.warn("[CODEX] Error getting storm state:", err);
            player.sendMessage(CHAT_DEV + "[MBI] " + CHAT_INFO + "Error getting storm state: " + (err?.message || err));
            openDeveloperTools();
        }
    }

    function openStormOverrideMenu() {
        const form = new ActionFormData()
            .title("§cStorm Override")
            .body("§7Manually override storm settings or reset to day-based.");
        form.button("§cReset Override");
        form.button("§eSet Override (Advanced)");
        form.button("§8Back");
        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === 2) {
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * getPlayerSoundVolume(player) });
                return openDeveloperTools();
            }
            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * getPlayerSoundVolume(player) });
            if (res.selection === 0) {
                triggerDebugCommand("storm_override", ["reset"], () => openDeveloperTools());
            } else {
                openStormOverrideSetMenu();
            }
        }).catch(() => openDeveloperTools());
    }

    function openStormOverrideSetMenu() {
        const modal = new ModalFormData()
            .title("§cStorm Override Settings")
            .textField("Minor Duration Min (seconds)", "60")
            .textField("Minor Duration Max (seconds)", "240")
            .textField("Major Duration Min (seconds)", "180")
            .textField("Major Duration Max (seconds)", "600")
            .textField("Cooldown Min (seconds)", "300")
            .textField("Cooldown Max (seconds)", "1200")
            .textField("Start Chance (0.0-1.0)", "0.001")
            .textField("Major Chance (0.0-1.0)", "0.05");
        
        modal.show(player).then((res) => {
            if (!res || res.canceled) {
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * getPlayerSoundVolume(player) });
                return openStormOverrideMenu();
            }
            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * getPlayerSoundVolume(player) });
            const values = res.formValues || [];
            const args = ["set"];
            for (let i = 0; i < 8; i++) {
                args.push(values[i] || "");
            }
            triggerDebugCommand("storm_override", args, () => openStormOverrideMenu());
        }).catch(() => openStormOverrideMenu());
    }

    function triggerDebugCommand(subcommand, args = [], onComplete = () => openDeveloperTools()) {
        try {
            const payload = JSON.stringify({ command: subcommand, args });
            let handled = false;

            try {
                const directHandler = globalThis?.mbExecuteDebugCommand;
                if (typeof directHandler === "function") {
                    directHandler(player, subcommand, args);
                    handled = true;
                }
            } catch (err) {
                console.warn(`[MBI] Direct debug command dispatch failed (${subcommand}):`, err);
            }

            if (!handled) {
                try {
                    const sendScriptEvent = world?.sendScriptEvent;
                    if (typeof sendScriptEvent === "function") {
                        sendScriptEvent.call(world, "mb:cmd", payload);
                        handled = true;
                    }
                } catch (err) {
                    console.warn(`[MBI] Script event dispatch failed (${subcommand}):`, err);
                }
            }

            if (!handled) {
                try {
                    const dim = player?.dimension ?? world.getDimension("overworld");
                    if (dim?.runCommandAsync) {
                        const escaped = payload.replace(/"/g, '\\"');
                        dim.runCommandAsync(`scriptevent mb:cmd ${escaped}`);
                        handled = true;
                    }
                } catch (err) {
                    console.warn(`[MBI] Command dispatch failed (${subcommand}):`, err);
                }
            }

            if (!handled) {
                console.warn(`[MBI] Failed to trigger debug command ${subcommand}.`);
                player?.sendMessage?.(CHAT_DEV + "[MBI] " + CHAT_INFO + "Failed to send debug command. See log.");
            }
        } catch (err) {
            console.warn("[MBI] Failed to prepare debug command payload:", err);
            player?.sendMessage?.(CHAT_DEV + "[MBI] " + CHAT_INFO + "Failed to send debug command.");
        } finally {
            system.run(onComplete);
        }
    }

    function promptSetDay() {
        const modal = new ModalFormData().title("§cSet Day")
            .textField("Enter new day number", "Set day");

        modal.show(player).then((res) => {
            if (!res || res.canceled) {
                return openDeveloperTools();
            }

            const dayString = res.formValues?.[0] ?? "";
            const dayNumber = parseInt(dayString, 10);
            if (Number.isNaN(dayNumber) || dayNumber < 1) {
                player.sendMessage(CHAT_DEV + "[MBI] " + CHAT_INFO + "Invalid day number.");
                return openDeveloperTools();
            }

            triggerDebugCommand("set_day", [String(dayNumber)]);
        });
    }

    // Debug Settings Management
    // Use exported functions (defined at module level)
    function saveDebugSettingsInternal(settings) {
        saveDebugSettings(player, settings);
    }

    function toggleDebugFlag(category, flag) {
        const settings = getDebugSettings(player);
        // Ensure category exists
        if (!settings[category]) {
            settings[category] = {};
        }
        // Initialize flag if it doesn't exist (default to false)
        if (settings[category][flag] === undefined) {
            settings[category][flag] = false;
        }
        
        settings[category][flag] = !settings[category][flag];
        
        // If "all" is toggled, update all flags in that category
        if (flag === "all") {
            // Get all possible flags for this category (from defaults to ensure we get new ones)
            const defaultSettings = getDefaultDebugSettings();
            const allFlags = defaultSettings[category] ? Object.keys(defaultSettings[category]).filter(k => k !== "all") : Object.keys(settings[category] || {}).filter(k => k !== "all");
            
            // Ensure all flags exist and set them
            for (const key of allFlags) {
                if (settings[category][key] === undefined) {
                    settings[category][key] = false;
                }
                settings[category][key] = settings[category].all;
            }
        } else {
            // If any individual flag is toggled, check if all are on/off
            const allFlags = Object.keys(settings[category]).filter(k => k !== "all");
            settings[category].all = allFlags.length > 0 && allFlags.every(k => settings[category][k] === true);
        }
        saveDebugSettingsInternal(settings);
        // Notify AI scripts to update their debug flags
        updateDebugFlags();
        return settings[category][flag];
    }

    function updateDebugFlags() {
        // This will be called by AI scripts to get updated debug flags
        // We'll use a global event or direct function calls
        try {
            if (typeof globalThis?.mbUpdateDebugFlags === "function") {
                globalThis.mbUpdateDebugFlags(player, getDebugSettings(player));
            }
        } catch (error) {
            console.warn("[DEBUG MENU] Error updating debug flags:", error);
        }
    }

    function openDebugMenu() {
        const settings = getDebugSettings(player);
        
        const form = new ActionFormData().title("§bDebug Menu");
        form.body("§7Toggle debug logging for different AI systems:\n\n§8Select a category to configure:");
        
        form.button("§fMining AI");
        form.button("§fInfected AI");
        form.button("§fTorpedo AI");
        form.button("§fFlying AI");
        form.button("§fBuff AI");
        form.button("§fSpawn Controller");
        form.button("§fMain Script");
        form.button("§fBiome Ambience");
        form.button("§fDynamic Properties");
        form.button("§fCodex/Knowledge");
        form.button("§fGround Infection Timer");
        form.button("§fSnow Storm");
        form.button("§8Back");

        form.show(player).then((res) => {
            if (!res || res.canceled) {
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                return openMain();
            }

            if (res.selection === 12) {
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                return openMain();
            }

            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * volumeMultiplier });
            switch (res.selection) {
                case 0: return openMiningDebugMenu(settings);
                case 1: return openInfectedDebugMenu(settings);
                case 2: return openTorpedoDebugMenu(settings);
                case 3: return openFlyingDebugMenu(settings);
                case 4: return openBuffDebugMenu(settings);
                case 5: return openSpawnDebugMenu(settings);
                case 6: return openMainDebugMenu(settings);
                case 7: return openBiomeAmbienceDebugMenu(settings);
                case 8: return openDynamicPropertyDebugMenu(settings);
                case 9: return openCodexDebugMenu(settings);
                case 10: return openGroundInfectionDebugMenu(settings);
                case 11: return openSnowStormDebugMenu(settings);
                default: return openDebugMenu();
            }
        }).catch(() => openMain());
    }

    function openMiningDebugMenu(settings) {
        const mining = settings.mining || {};
        const form = new ActionFormData().title("§bMining AI Debug");
        form.body(`§7Toggle debug logging for Mining Bears:\n\n§8Current settings:\n§7• Pitfall: ${mining.pitfall ? "§aON" : "§cOFF"}\n§7• General: ${mining.general ? "§aON" : "§cOFF"}\n§7• Target: ${mining.target ? "§aON" : "§cOFF"}\n§7• Pathfinding: ${mining.pathfinding ? "§aON" : "§cOFF"}\n§7• Vertical: ${mining.vertical ? "§aON" : "§cOFF"}\n§7• Mining: ${mining.mining ? "§aON" : "§cOFF"}\n§7• Movement: ${mining.movement ? "§aON" : "§cOFF"}\n§7• Stair Creation: ${mining.stairCreation ? "§aON" : "§cOFF"}`);
        
        form.button(`§${mining.pitfall ? "a" : "c"}Pitfall Debug`);
        form.button(`§${mining.general ? "a" : "c"}General Logging`);
        form.button(`§${mining.target ? "a" : "c"}Target Detection`);
        form.button(`§${mining.pathfinding ? "a" : "c"}Pathfinding`);
        form.button(`§${mining.vertical ? "a" : "c"}Vertical Mining`);
        form.button(`§${mining.mining ? "a" : "c"}Block Mining`);
        form.button(`§${mining.movement ? "a" : "c"}Movement`);
        form.button(`§${mining.stairCreation ? "a" : "c"}Stair Creation`);
        form.button(`§${mining.all ? "a" : "c"}Toggle All`);
        form.button("§8Back");

        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === 9) {
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                return openDebugMenu();
            }

            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * volumeMultiplier });
            const flags = ["pitfall", "general", "target", "pathfinding", "vertical", "mining", "movement", "stairCreation", "all"];
            if (res.selection < flags.length) {
                const newState = toggleDebugFlag("mining", flags[res.selection]);
                const stateText = newState ? "§aON" : "§cOFF";
                player.sendMessage(CHAT_DEV + "[DEBUG] " + CHAT_INFO + `Mining AI ${flags[res.selection]} debug: ${stateText}`);
                // Log to console for confirmation
                console.warn(`[DEBUG MENU] Mining AI ${flags[res.selection]} debug ${newState ? "ENABLED" : "DISABLED"} by ${player.name}`);
            }
                return openMiningDebugMenu(getDebugSettings(player));
        }).catch(() => openDebugMenu());
    }

    function openInfectedDebugMenu(settings) {
        const infected = settings.infected || {};
        const form = new ActionFormData().title("§bInfected AI Debug");
        form.body(`§7Toggle debug logging for Infected AI (bears/pig/cow):\n\n§8Current settings:\n§7• General: ${infected.general ? "§aON" : "§cOFF"}\n§7• Pathfinding: ${infected.pathfinding ? "§aON" : "§cOFF"}\n§7• Gap Jump: ${infected.gapJump ? "§aON" : "§cOFF"}`);

        form.button(`§${infected.general ? "a" : "c"}General Logging`);
        form.button(`§${infected.pathfinding ? "a" : "c"}Pathfinding`);
        form.button(`§${infected.gapJump ? "a" : "c"}Gap Jump`);
        form.button(`§${infected.all ? "a" : "c"}Toggle All`);
        form.button("§8Back");

        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === 4) {
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                return openDebugMenu();
            }

            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * volumeMultiplier });
            const flags = ["general", "pathfinding", "gapJump", "all"];
            if (res.selection < flags.length) {
                const newState = toggleDebugFlag("infected", flags[res.selection]);
                const stateText = newState ? "§aON" : "§cOFF";
                player.sendMessage(CHAT_DEV + "[DEBUG] " + CHAT_INFO + `Infected AI ${flags[res.selection]} debug: ${stateText}`);
                console.warn(`[DEBUG MENU] Infected AI ${flags[res.selection]} debug ${newState ? "ENABLED" : "DISABLED"} by ${player.name}`);
                invalidateDebugCache();
            }
            return openInfectedDebugMenu(getDebugSettings(player));
        }).catch(() => openDebugMenu());
    }

    function openTorpedoDebugMenu(settings) {
        const torpedo = settings.torpedo || {};
        const form = new ActionFormData().title("§bTorpedo AI Debug");
        form.body(`§7Toggle debug logging for Torpedo Bears:\n\n§8Current settings:\n§7• General: ${torpedo.general ? "§aON" : "§cOFF"}\n§7• Targeting: ${torpedo.targeting ? "§aON" : "§cOFF"}\n§7• Diving: ${torpedo.diving ? "§aON" : "§cOFF"}\n§7• Block Breaking: ${torpedo.blockBreaking ? "§aON" : "§cOFF"}\n§7• Block Placement: ${torpedo.blockPlacement ? "§aON" : "§cOFF"}`);
        
        form.button(`§${torpedo.general ? "a" : "c"}General Logging`);
        form.button(`§${torpedo.targeting ? "a" : "c"}Targeting`);
        form.button(`§${torpedo.diving ? "a" : "c"}Diving Mechanics`);
        form.button(`§${torpedo.blockBreaking ? "a" : "c"}Block Breaking`);
        form.button(`§${torpedo.blockPlacement ? "a" : "c"}Block Placement`);
        form.button(`§${torpedo.all ? "a" : "c"}Toggle All`);
        form.button("§8Back");

        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === 6) {
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                return openDebugMenu();
            }

            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * volumeMultiplier });
            const flags = ["general", "targeting", "diving", "blockBreaking", "blockPlacement", "all"];
            if (res.selection < flags.length) {
                const newState = toggleDebugFlag("torpedo", flags[res.selection]);
                const stateText = newState ? "§aON" : "§cOFF";
                player.sendMessage(CHAT_DEV + "[DEBUG] " + CHAT_INFO + `Torpedo AI ${flags[res.selection]} debug: ${stateText}`);
                // Log to console for confirmation
                console.warn(`[DEBUG MENU] Torpedo AI ${flags[res.selection]} debug ${newState ? "ENABLED" : "DISABLED"} by ${player.name}`);
                invalidateDebugCache();
            }
                return openTorpedoDebugMenu(getDebugSettings(player));
        }).catch(() => openDebugMenu());
    }

    function openFlyingDebugMenu(settings) {
        const flying = settings.flying || {};
        const form = new ActionFormData().title("§bFlying AI Debug");
        form.body(`§7Toggle debug logging for Flying Bears:\n\n§8Current settings:\n§7• General: ${flying.general ? "§aON" : "§cOFF"}\n§7• Targeting: ${flying.targeting ? "§aON" : "§cOFF"}\n§7• Pathfinding: ${flying.pathfinding ? "§aON" : "§cOFF"}`);
        
        form.button(`§${flying.general ? "a" : "c"}General Logging`);
        form.button(`§${flying.targeting ? "a" : "c"}Targeting`);
        form.button(`§${flying.pathfinding ? "a" : "c"}Pathfinding`);
        form.button(`§${flying.all ? "a" : "c"}Toggle All`);
        form.button("§8Back");

        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === 4) {
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                return openDebugMenu();
            }

            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * volumeMultiplier });
            const flags = ["general", "targeting", "pathfinding", "all"];
            if (res.selection < flags.length) {
                const newState = toggleDebugFlag("flying", flags[res.selection]);
                const stateText = newState ? "§aON" : "§cOFF";
                player.sendMessage(CHAT_DEV + "[DEBUG] " + CHAT_INFO + `Flying AI ${flags[res.selection]} debug: ${stateText}`);
                // Log to console for confirmation
                console.warn(`[DEBUG MENU] Flying AI ${flags[res.selection]} debug ${newState ? "ENABLED" : "DISABLED"} by ${player.name}`);
            }
                return openFlyingDebugMenu(getDebugSettings(player));
        }).catch(() => openDebugMenu());
    }

    function openBuffDebugMenu(settings) {
        const buff = settings.buff || {};
        
        // Get countdown info for nearby buff bears
        let countdownText = "";
        try {
            const countdowns = getBuffBearCountdowns(player);
            if (countdowns.length > 0) {
                countdownText = "\n\n§8=== Explosion Countdown ===\n";
                for (const info of countdowns) {
                    const loc = info.location;
                    countdownText += `§7Bear ${info.entityId}:\n`;
                    countdownText += `§7  Location: (${Math.floor(loc.x)}, ${Math.floor(loc.y)}, ${Math.floor(loc.z)})\n`;
                    countdownText += `§7  Alive: ${info.aliveSeconds}s\n`;
                    
                    if (info.canExplode) {
                        if (info.stuckInfo.isStuck) {
                            countdownText += `§c  STUCK: ${info.stuckInfo.secondsStuck}s\n`;
                            countdownText += `§c  Explosion in: ${info.stuckInfo.secondsUntilExplosion}s\n`;
                        } else {
                            countdownText += `§7  Not stuck (needs 15s stuck to explode)\n`;
                            countdownText += `§7  Will explode in: ${info.stuckInfo.secondsUntilExplosion}s if stuck\n`;
                        }
                    } else {
                        countdownText += `§7  Can explode in: ${info.secondsUntilCanExplode}s\n`;
                        countdownText += `§7  Then needs 15s stuck to explode\n`;
                    }
                    countdownText += "\n";
                }
            } else {
                countdownText = "\n\n§8No buff bears nearby (within 64 blocks)";
            }
        } catch (error) {
            countdownText = "\n\n§cError getting countdown info";
            if (buff.general) {
                console.warn(`[BUFF DEBUG] Error:`, error);
            }
        }
        
        const form = new ActionFormData().title("§bBuff AI Debug");
        form.body(`§7Toggle debug logging for Buff Bears:\n\n§8Current settings:\n§7• General: ${buff.general ? "§aON" : "§cOFF"}\n§7• Block Breaking: ${buff.blockBreaking ? "§aON" : "§cOFF"}${countdownText}`);
        
        form.button(`§${buff.general ? "a" : "c"}General Logging`);
        form.button(`§${buff.blockBreaking ? "a" : "c"}Block Breaking`);
        form.button(`§${buff.all ? "a" : "c"}Toggle All`);
        form.button("§eShow Countdown");
        form.button("§8Back");

        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === 4) {
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                return openDebugMenu();
            }

            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * volumeMultiplier });
            
            if (res.selection === 3) {
                // Show countdown button - just refresh the menu to update countdown
                return openBuffDebugMenu(getDebugSettings(player));
            }
            
            const flags = ["general", "blockBreaking", "all"];
            if (res.selection < flags.length) {
                const newState = toggleDebugFlag("buff", flags[res.selection]);
                const stateText = newState ? "§aON" : "§cOFF";
                player.sendMessage(CHAT_DEV + "[DEBUG] " + CHAT_INFO + `Buff AI ${flags[res.selection]} debug: ${stateText}`);
                // Log to console for confirmation
                console.warn(`[DEBUG MENU] Buff AI ${flags[res.selection]} debug ${newState ? "ENABLED" : "DISABLED"} by ${player.name}`);
                invalidateDebugCache();
                return openBuffDebugMenu(getDebugSettings(player));
            }
            
            return openBuffDebugMenu(getDebugSettings(player));
        }).catch(() => openDebugMenu());
    }

    function openSpawnDebugMenu(settings) {
        const spawn = settings.spawn || {};
        const form = new ActionFormData().title("§bSpawn Controller Debug");
        form.body(`§7Toggle debug logging for Spawn Controller:\n\n§8Current settings:\n§7• General: ${spawn.general ? "§aON" : "§cOFF"}\n§7• Discovery: ${spawn.discovery ? "§aON" : "§cOFF"}\n§7• Tile Scanning: ${spawn.tileScanning ? "§aON" : "§cOFF"}\n§7• Cache: ${spawn.cache ? "§aON" : "§cOFF"}\n§7• Validation: ${spawn.validation ? "§aON" : "§cOFF"}\n§7• Distance: ${spawn.distance ? "§aON" : "§cOFF"}\n§7• Spacing: ${spawn.spacing ? "§aON" : "§cOFF"}\n§7• Isolated: ${spawn.isolated ? "§aON" : "§cOFF"}`);
        
        form.button(`§${spawn.general ? "a" : "c"}General Logging`);
        form.button(`§${spawn.discovery ? "a" : "c"}Discovery Phase`);
        form.button(`§${spawn.tileScanning ? "a" : "c"}Tile Scanning`);
        form.button(`§${spawn.cache ? "a" : "c"}Cache`);
        form.button(`§${spawn.validation ? "a" : "c"}Validation`);
        form.button(`§${spawn.distance ? "a" : "c"}Distance`);
        form.button(`§${spawn.spacing ? "a" : "c"}Spacing`);
        form.button(`§${spawn.isolated ? "a" : "c"}Isolated Players`);
        form.button(`§${spawn.all ? "a" : "c"}Toggle All`);
        form.button("§8Back");

        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === 9) {
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                return openDebugMenu();
            }

            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * volumeMultiplier });
            const flags = ["general", "discovery", "tileScanning", "cache", "validation", "distance", "spacing", "isolated", "all"];
            if (res.selection < flags.length) {
                const flagName = flags[res.selection];
                const newState = toggleDebugFlag("spawn", flagName);
                const stateText = newState ? "§aON" : "§cOFF";
                player.sendMessage(CHAT_DEV + "[DEBUG] " + CHAT_INFO + `Spawn Controller ${flagName} debug: ${stateText}`);
                // Log to console for confirmation
                console.warn(`[DEBUG MENU] Spawn Controller ${flagName} debug ${newState ? "ENABLED" : "DISABLED"} by ${player.name}`);
                // Invalidate cache to ensure changes take effect immediately
                invalidateDebugCache();
            }
                return openSpawnDebugMenu(getDebugSettings(player));
        }).catch(() => openDebugMenu());
    }

    function openMainDebugMenu(settings) {
        const main = settings.main || {};
        const form = new ActionFormData().title("§bMain Script Debug");
        form.body(`§7Toggle debug logging for Main Script:\n\n§8Current settings:\n§7• Death Events: ${main.death ? "§aON" : "§cOFF"}\n§7• Snow Placement: ${main.snow_placement ? "§aON" : "§cOFF"}\n§7• Mob Conversion: ${main.conversion ? "§aON" : "§cOFF"}\n§7• Infection: ${main.infection ? "§aON" : "§cOFF"}\n§7• Minor Infection: ${main.minorInfection ? "§aON" : "§cOFF"}`);
        
        form.button(`§${main.death ? "a" : "c"}Death Events`);
        form.button(`§${main.snow_placement ? "a" : "c"}Snow Placement`);
        form.button(`§${main.conversion ? "a" : "c"}Mob Conversion`);
        form.button(`§${main.infection ? "a" : "c"}Infection`);
        form.button(`§${main.minorInfection ? "a" : "c"}Minor Infection`);
        form.button(`§${main.all ? "a" : "c"}Toggle All`);
        form.button("§8Back");

        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === 6) {
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                return openDebugMenu();
            }

            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * volumeMultiplier });
            const flags = ["death", "snow_placement", "conversion", "infection", "minorInfection", "all"];
            if (res.selection < flags.length) {
                const newState = toggleDebugFlag("main", flags[res.selection]);
                const stateText = newState ? "§aON" : "§cOFF";
                player.sendMessage(CHAT_DEV + "[DEBUG] " + CHAT_INFO + `Main Script ${flags[res.selection]} debug: ${stateText}`);
                // Log to console for confirmation
                console.warn(`[DEBUG MENU] Main Script ${flags[res.selection]} debug ${newState ? "ENABLED" : "DISABLED"} by ${player.name}`);
                invalidateDebugCache();
            }
                return openMainDebugMenu(getDebugSettings(player));
        }).catch(() => openDebugMenu());
    }

    function openBiomeAmbienceDebugMenu(settings) {
        const biome = settings.biome_ambience || {};
        const form = new ActionFormData().title("§bBiome Ambience Debug");
        form.body(`§7Toggle debug logging for Biome Ambience:\n\n§8Current settings:\n§7• Biome Check: ${biome.biome_check ? "§aON" : "§cOFF"}\n§7• Player Check: ${biome.player_check ? "§aON" : "§cOFF"}\n§7• Sound Playback: ${biome.sound_playback ? "§aON" : "§cOFF"}\n§7• Loop Status: ${biome.loop_status ? "§aON" : "§cOFF"}\n§7• Initialization: ${biome.initialization ? "§aON" : "§cOFF"}\n§7• Cleanup: ${biome.cleanup ? "§aON" : "§cOFF"}\n§7• Errors: ${biome.errors ? "§aON" : "§cOFF"}`);
        
        form.button(`§${biome.biome_check ? "a" : "c"}Biome Check`);
        form.button(`§${biome.player_check ? "a" : "c"}Player Check`);
        form.button(`§${biome.sound_playback ? "a" : "c"}Sound Playback`);
        form.button(`§${biome.loop_status ? "a" : "c"}Loop Status`);
        form.button(`§${biome.initialization ? "a" : "c"}Initialization`);
        form.button(`§${biome.cleanup ? "a" : "c"}Cleanup`);
        form.button(`§${biome.errors ? "a" : "c"}Errors`);
        form.button(`§${biome.all ? "a" : "c"}Toggle All`);
        form.button("§8Back");

        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === 8) {
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                return openDebugMenu();
            }

            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * volumeMultiplier });
            const flags = ["biome_check", "player_check", "sound_playback", "loop_status", "initialization", "cleanup", "errors", "all"];
            if (res.selection < flags.length) {
                const flagName = flags[res.selection];
                const newState = toggleDebugFlag("biome_ambience", flagName);
                const stateText = newState ? "§aON" : "§cOFF";
                player.sendMessage(CHAT_DEV + "[DEBUG] " + CHAT_INFO + `Biome Ambience ${flagName} debug: ${stateText}`);
                // Log to console for confirmation
                console.warn(`[DEBUG MENU] Biome Ambience ${flagName} debug ${newState ? "ENABLED" : "DISABLED"} by ${player.name}`);
                // Invalidate cache to ensure changes take effect immediately
                invalidateDebugCache();
            }
                return openBiomeAmbienceDebugMenu(getDebugSettings(player));
        }).catch(() => openDebugMenu());
    }

    function openDynamicPropertyDebugMenu(settings) {
        const dp = settings.dynamic_properties || {};
        const form = new ActionFormData().title("§bDynamic Properties Debug");
        form.body(`§7Toggle debug logging for Dynamic Property Handler:\n\n§8Current settings:\n§7• Chunking: ${dp.chunking ? "§aON" : "§cOFF"}\n§7• Caching: ${dp.caching ? "§aON" : "§cOFF"}\n§7• Reads: ${dp.reads ? "§aON" : "§cOFF"}\n§7• Writes: ${dp.writes ? "§aON" : "§cOFF"}\n§7• Errors: ${dp.errors ? "§aON" : "§cOFF"}`);
        
        form.button(`§${dp.chunking ? "a" : "c"}Chunking`);
        form.button(`§${dp.caching ? "a" : "c"}Caching`);
        form.button(`§${dp.reads ? "a" : "c"}Reads`);
        form.button(`§${dp.writes ? "a" : "c"}Writes`);
        form.button(`§${dp.errors ? "a" : "c"}Errors`);
        form.button(`§${dp.all ? "a" : "c"}Toggle All`);
        form.button("§8Back");

        form.show(player).then((res) => {
            if (!res || res.canceled) {
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                return openDebugMenu();
            }

            // Back button is at index 6 (after 5 flag buttons + 1 Toggle All button)
            if (res.selection === 6) {
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                return openDebugMenu();
            }

            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * volumeMultiplier });
            const flags = ["chunking", "caching", "reads", "writes", "errors", "all"];
            if (res.selection < flags.length) {
                const flagName = flags[res.selection];
                const newState = toggleDebugFlag("dynamic_properties", flagName);
                const stateText = newState ? "§aON" : "§cOFF";
                player.sendMessage(CHAT_DEV + "[DEBUG] " + CHAT_INFO + `Dynamic Properties ${flagName} debug: ${stateText}`);
                console.warn(`[DEBUG MENU] Dynamic Properties ${flagName} debug ${newState ? "ENABLED" : "DISABLED"} by ${player.name}`);
                invalidateDebugCache();
            }
            return openDynamicPropertyDebugMenu(getDebugSettings(player));
        }).catch(() => openDebugMenu());
    }

    function openCodexDebugMenu(settings) {
        const codex = settings.codex || {};
        const form = new ActionFormData().title("§bCodex/Knowledge Debug");
        form.body(`§7Toggle debug logging for Codex/Knowledge System:\n\n§8Current settings:\n§7• Progressive: ${codex.progressive ? "§aON" : "§cOFF"}\n§7• Experience: ${codex.experience ? "§aON" : "§cOFF"}\n§7• Flags: ${codex.flags ? "§aON" : "§cOFF"}\n§7• Chunking: ${codex.chunking ? "§aON" : "§cOFF"}\n§7• Saving: ${codex.saving ? "§aON" : "§cOFF"}`);
        
        form.button(`§${codex.progressive ? "a" : "c"}Progressive`);
        form.button(`§${codex.experience ? "a" : "c"}Experience`);
        form.button(`§${codex.flags ? "a" : "c"}Flags`);
        form.button(`§${codex.chunking ? "a" : "c"}Chunking`);
        form.button(`§${codex.saving ? "a" : "c"}Saving`);
        form.button(`§${codex.all ? "a" : "c"}Toggle All`);
        form.button("§8Back");

        form.show(player).then((res) => {
            if (!res || res.canceled) {
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                return openDebugMenu();
            }

            // Back button is at index 6 (after 5 flag buttons + 1 Toggle All button)
            if (res.selection === 6) {
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                return openDebugMenu();
            }

            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * volumeMultiplier });
            const flags = ["progressive", "experience", "flags", "chunking", "saving", "all"];
            if (res.selection < flags.length) {
                const flagName = flags[res.selection];
                const newState = toggleDebugFlag("codex", flagName);
                const stateText = newState ? "§aON" : "§cOFF";
                player.sendMessage(CHAT_DEV + "[DEBUG] " + CHAT_INFO + `Codex/Knowledge ${flagName} debug: ${stateText}`);
                console.warn(`[DEBUG MENU] Codex/Knowledge ${flagName} debug ${newState ? "ENABLED" : "DISABLED"} by ${player.name}`);
                invalidateDebugCache();
            }
            return openCodexDebugMenu(getDebugSettings(player));
        }).catch(() => openDebugMenu());
    }

    function openGroundInfectionDebugMenu(settings) {
        const ground = settings.ground_infection || {};
        const form = new ActionFormData().title("§bGround Infection Timer Debug");
        form.body(`§7Toggle debug logging for Ground Infection Timer:\n\n§8Current settings:\n§7• Timer: ${ground.timer ? "§aON" : "§cOFF"}\n§7• Ground Check: ${ground.groundCheck ? "§aON" : "§cOFF"}\n§7• Ambient Pressure: ${ground.ambient ? "§aON" : "§cOFF"}\n§7• Biome Pressure: ${ground.biome ? "§aON" : "§cOFF"}\n§7• Decay: ${ground.decay ? "§aON" : "§cOFF"}\n§7• Warnings: ${ground.warnings ? "§aON" : "§cOFF"}`);
        
        form.button(`§${ground.timer ? "a" : "c"}Timer Updates`);
        form.button(`§${ground.groundCheck ? "a" : "c"}Ground Detection`);
        form.button(`§${ground.ambient ? "a" : "c"}Ambient Pressure`);
        form.button(`§${ground.biome ? "a" : "c"}Biome Pressure`);
        form.button(`§${ground.decay ? "a" : "c"}Decay Logic`);
        form.button(`§${ground.warnings ? "a" : "c"}Warning Messages`);
        form.button(`§${ground.all ? "a" : "c"}Toggle All`);
        form.button("§8Back");

        form.show(player).then((res) => {
            if (!res || res.canceled) {
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                return openDebugMenu();
            }

            // Back button is at index 7 (after 6 flag buttons + 1 Toggle All button)
            if (res.selection === 7) {
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                return openDebugMenu();
            }

            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * volumeMultiplier });
            const flags = ["timer", "groundCheck", "ambient", "biome", "decay", "warnings", "all"];
            if (res.selection < flags.length) {
                const flagName = flags[res.selection];
                const newState = toggleDebugFlag("ground_infection", flagName);
                const stateText = newState ? "§aON" : "§cOFF";
                player.sendMessage(CHAT_DEV + "[DEBUG] " + CHAT_INFO + `Ground Infection Timer ${flagName} debug: ${stateText}`);
                console.warn(`[DEBUG MENU] Ground Infection Timer ${flagName} debug ${newState ? "ENABLED" : "DISABLED"} by ${player.name}`);
                invalidateDebugCache();
            }
            return openGroundInfectionDebugMenu(getDebugSettings(player));
        }).catch(() => openDebugMenu());
    }

    function openSnowStormDebugMenu(settings) {
        try {
            const stormSettings = settings.snow_storm || {};
            const info = getStormDebugInfo();
            const body = `§7Snow Storm system status and parameters:

§8=== Current State ===
§7Active: ${info.active}
§7Center: §f${info.stormCenter ?? "N/A"} §7(rolls randomly)
§7Radius: §f${info.currentRadius ?? 0} blocks §7(size: small→big→small)
§7Progress: §f${info.sizeProgress ?? 0}%
§7Ends in: §f${info.endsIn}
§7Cooldown: §f${info.cooldown}
§7Players in storm: §f${info.playersInStorm}
§7Last particle pass: §f${info.lastParticlesSpawned ?? 0} spawned, ${info.lastParticlesSkipped ?? 0} skipped
§7Manual override: ${info.override}

§8=== Day-Based Parameters ===
§7Current day: §f${info.currentDay}
§7Storm start day (by difficulty): §f${info.startDay}
§7Minor duration: §f${info.minorDurationMin}s–${info.minorDurationMax}s
§7Major duration: §f${info.majorDurationMin}s–${info.majorDurationMax}s
§7Cooldown range: §f${info.cooldownMin}s–${info.cooldownMax}s
§7Start chance per check: §f${info.startChance}
§7Major chance (when storm starts): §f${info.majorChance}

§8=== Behavior ===
§7Before day 20: minor and major storms possible; major chance scales up.
§7After day 20: only major storms occur.

§8=== Debug Logging ===
§7General: ${stormSettings.general ? "§aON" : "§cOFF"}
§7Movement: ${stormSettings.movement ? "§aON" : "§cOFF"}
§7Placement: ${stormSettings.placement ? "§aON" : "§cOFF"}
§7Particles: ${stormSettings.particles ? "§aON" : "§cOFF"}`;
            
            const form = new ActionFormData().title("§bSnow Storm Debug");
            form.body(body);
            form.button(`§${stormSettings.general ? "a" : "c"}General Logging`);
            form.button(`§${stormSettings.movement ? "a" : "c"}Movement`);
            form.button(`§${stormSettings.placement ? "a" : "c"}Placement`);
            form.button(`§${stormSettings.particles ? "a" : "c"}Particles`);
            form.button(`§${stormSettings.all ? "a" : "c"}Toggle All`);
            form.button("§eRefresh");
            form.button("§8Back");

            form.show(player).then((res) => {
                if (!res || res.canceled || res.selection === 6) {
                    const volumeMultiplier = getPlayerSoundVolume(player);
                    player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                    return openDebugMenu();
                }
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * volumeMultiplier });
                if (res.selection < 5) {
                    const flags = ["general", "movement", "placement", "particles", "all"];
                    const flagName = flags[res.selection];
                    const newState = toggleDebugFlag("snow_storm", flagName);
                    const stateText = newState ? "§aON" : "§cOFF";
                    player.sendMessage(CHAT_DEV + "[DEBUG] " + CHAT_INFO + `Snow Storm ${flagName} debug: ${stateText}`);
                    console.warn(`[DEBUG MENU] Snow Storm ${flagName} debug ${newState ? "ENABLED" : "DISABLED"} by ${player.name}`);
                    invalidateDebugCache();
                }
                return openSnowStormDebugMenu(getDebugSettings(player));
            }).catch(() => openDebugMenu());
        } catch (err) {
            console.warn("[CODEX] Error in Snow Storm debug:", err);
            player.sendMessage(CHAT_DEV + "[MBI] " + CHAT_INFO + "Error: " + (err?.message || err));
            openDebugMenu();
        }
    }

    function openSettings() {
        // Show settings chooser: General vs Beta Features
        const canSee = canSeeBeta(player);
        const form = new ActionFormData().title("§eSettings");
        form.body("§7Choose a section:");
        form.button("§fGeneral §8(Sound, Tips, Search)");
        if (canSee) {
            form.button("§dBeta Features §8(experimental)");
        }
        form.button("§8Back");

        form.show(player).then((res) => {
            if (!res || res.canceled) {
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                return openMain();
            }
            if (res.selection === 0) {
                return openGeneralSettings();
            }
            if (canSee && res.selection === 1) {
                return openBetaSettingsMenu();
            }
            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
            openMain();
        }).catch(() => openMain());
    }

    function openBetaSettingsMenu() {
        const canEdit = canChangeBeta(player);
        const infectedOn = isBetaInfectedAIEnabled();
        const dustStormsOn = isBetaDustStormsEnabled();
        const visibleToAll = isBetaVisibleToAll();
        const form = new ActionFormData()
            .title("§dBeta Features")
            .body(`§7Experimental features. §8(First joiner + mb_cheats can change)\n\n§7Infected AI (beta): §${infectedOn ? "aON" : "cOFF"}\n§7Dust storms (beta): §${dustStormsOn ? "aON" : "cOFF"}\n§7Visible to others in book: §${visibleToAll ? "aON" : "cOFF"}\n${!canEdit ? "\n§8You are viewing read-only." : ""}`);

        if (canEdit) {
            form.button(infectedOn ? "§aInfected AI §8(ON) → OFF" : "§cInfected AI §8(OFF) → ON");
            form.button(dustStormsOn ? "§aDust Storms §8(ON) → OFF" : "§cDust Storms §8(OFF) → ON");
            form.button(visibleToAll ? "§aVisible to others §8(ON) → OFF" : "§cVisible to others §8(OFF) → ON");
        }
        form.button("§8Back");

        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === (canEdit ? 3 : 0)) {
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                return openSettings();
            }
            if (canEdit && res.selection === 0) {
                setBetaInfectedAIEnabled(!infectedOn);
                player.sendMessage(CHAT_INFO + "Infected AI (beta): " + (infectedOn ? CHAT_DANGER + "OFF" : CHAT_SUCCESS + "ON"));
            } else if (canEdit && res.selection === 1) {
                setBetaDustStormsEnabled(!dustStormsOn);
                player.sendMessage(CHAT_INFO + "Dust storms (beta): " + (dustStormsOn ? CHAT_DANGER + "OFF" : CHAT_SUCCESS + "ON"));
            } else if (canEdit && res.selection === 2) {
                setBetaVisibleToAll(!visibleToAll);
                player.sendMessage(CHAT_INFO + "Visible to others: " + (visibleToAll ? CHAT_DANGER + "OFF" : CHAT_SUCCESS + "ON"));
            }
            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * getPlayerSoundVolume(player) });
            openBetaSettingsMenu();
        }).catch(() => openSettings());
    }

    function openGeneralSettings() {
        const settings = getSettings();
        const codex = getCodex(player);
        
        // Addon difficulty (world): -1 Easy, 0 Normal, 1 Hard
        const addonDifficultyValue = getAddonDifficultyState().value;
        const addonDifficultyIndex = Math.max(0, Math.min(2, addonDifficultyValue + 1)); // Easy=0, Normal=1, Hard=2
        const canEditDifficulty = canChangeBeta(player);
        
        // Spawn difficulty (display; dev tool can override)
        const spawnValue = getSpawnDifficultyValue();
        let spawnBoostText = "Normal (0)";
        if (spawnValue === -1) spawnBoostText = "Easy (-1)";
        else if (spawnValue === 0) spawnBoostText = "Normal (0)";
        else if (spawnValue === 1) spawnBoostText = "Hard (+1)";
        else if (spawnValue > 0) spawnBoostText = `Custom (+${spawnValue})`;
        else spawnBoostText = `Custom (${spawnValue})`;
        
        // Convert soundVolume (0-1) to slider value (0-10)
        const volumeSliderValue = Math.round((settings.soundVolume || 1.0) * 10);
        
        // Create dropdown options for bear/block volumes and addon difficulty
        const volumeOptions = ["Off", "Low", "High"];
        const difficultyOptions = ["Easy", "Normal", "Hard"];
        const bearVolIndex = Math.max(0, Math.min(2, settings.bearSoundVolume || 2));
        const breakVolIndex = Math.max(0, Math.min(2, settings.blockBreakVolume || 2));
        
        const showInfectionTimer = settings.showInfectionTimer === true;
        const criticalWarningsOnly = settings.criticalWarningsOnly === true;
        const stormParticlesIndex = Math.max(0, Math.min(2, settings.stormParticles ?? 0));
        const particleOptions = ["Less", "Medium", "More"];
        try {
            const form = new ModalFormData()
                .title("§eSettings")
                .slider("Sound Volume (0-10)", 0, 10, { valueStep: 1, defaultValue: volumeSliderValue })
                .toggle("Show Tips", { defaultValue: settings.showTips !== false })
                .toggle("Audio Messages", { defaultValue: settings.audioMessages !== false })
                .dropdown("Bear Sound Volume", volumeOptions, { defaultValueIndex: bearVolIndex })
                .dropdown("Block Break Volume", volumeOptions, { defaultValueIndex: breakVolIndex })
                .dropdown("Storm Particles §8(Less = better performance)", particleOptions, { defaultValueIndex: stormParticlesIndex })
                .toggle("Show Search Button", { defaultValue: settings.showSearchButton !== false })
                .toggle("Infection timer on screen (top, small)", { defaultValue: showInfectionTimer })
                .toggle("Only critical infection/day warnings", { defaultValue: criticalWarningsOnly })
                .dropdown((hasCheats(player) ? "Addon Difficulty — Spawn: E 0.7× N 1× H 1.3×. Major hits (from nothing): E 4 N 3 H 2. Major hits (from minor): E 3 N 2 H 1. Infection decay: E 0.8× N 1× H 1.2×. Mining interval: E 1.2× N 1× H 0.5×. Torpedo max blocks: E 0.85× N 1× H 2×." : "Addon Difficulty") + (canEditDifficulty ? "" : " §8(read-only)"), difficultyOptions, { defaultValueIndex: addonDifficultyIndex });
            
            form.show(player).then((res) => {
                const volumeMultiplier = getPlayerSoundVolume(player);
                
                if (res && res.formValues && Array.isArray(res.formValues) && res.formValues.length >= 10) {
                    const sliderValue = typeof res.formValues[0] === 'number' 
                        ? Math.max(0, Math.min(10, Math.round(Number(res.formValues[0]))))
                        : volumeSliderValue;
                    const normalizedVolume = Math.round((sliderValue / 10) * 100) / 100;
                    
                    settings.soundVolume = normalizedVolume;
                    settings.showTips = Boolean(res.formValues[1]);
                    settings.audioMessages = Boolean(res.formValues[2]);
                    settings.bearSoundVolume = typeof res.formValues[3] === 'number' ? Math.max(0, Math.min(2, res.formValues[3])) : bearVolIndex;
                    settings.blockBreakVolume = typeof res.formValues[4] === 'number' ? Math.max(0, Math.min(2, res.formValues[4])) : breakVolIndex;
                    settings.stormParticles = typeof res.formValues[5] === 'number' ? Math.max(0, Math.min(2, Math.floor(res.formValues[5]))) : stormParticlesIndex;
                    settings.showSearchButton = Boolean(res.formValues[6]);
                    settings.showInfectionTimer = Boolean(res.formValues[7]);
                    settings.criticalWarningsOnly = Boolean(res.formValues[8]);
                    
                    if (canEditDifficulty && typeof res.formValues[9] === 'number') {
                        const selectedIndex = Math.max(0, Math.min(2, Math.floor(res.formValues[9])));
                        const newAddonValue = selectedIndex === 0 ? -1 : selectedIndex === 1 ? 0 : 1;
                        setWorldProperty(ADDON_DIFFICULTY_PROPERTY, newAddonValue);
                        setWorldProperty(SPAWN_DIFFICULTY_PROPERTY, newAddonValue);
                    }
                    
                    saveCodex(player, codex);
                    
                    const basicSettingsKey = `mb_player_settings_${player.id}`;
                    const basicSettings = {
                        soundVolume: normalizedVolume,
                        showTips: settings.showTips,
                        audioMessages: settings.audioMessages,
                        showInfectionTimer: settings.showInfectionTimer,
                        criticalWarningsOnly: settings.criticalWarningsOnly,
                        stormParticles: settings.stormParticles ?? 0
                    };
                    try {
                        setWorldPropertyChunked(basicSettingsKey, JSON.stringify(basicSettings));
                        saveAllProperties();
                    } catch (error) {
                        console.warn(`[SETTINGS] Error saving Basic Journal settings:`, error);
                    }
                    
                    // Send confirmation message (consistent with Basic Journal)
                    player.sendMessage(CHAT_INFO + "Settings saved!");
                    player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * volumeMultiplier });
                } else if (res && res.canceled) {
                    player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                } else {
                    player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                }
                openSettings();
            }).catch((error) => {
                console.warn(`[SETTINGS] Error showing settings form:`, error);
                console.warn(`[SETTINGS] Error stack:`, error?.stack);
                player.sendMessage(CHAT_DANGER + "Error opening settings! Check console for details.");
                openMain();
            });
        } catch (error) {
            console.warn(`[SETTINGS] Error creating settings form:`, error);
            console.warn(`[SETTINGS] Error stack:`, error?.stack);
            player.sendMessage(CHAT_DANGER + "Error creating settings form! Check console for details.");
            openMain();
        }
    }

    function openSearch() {
        const codex = getCodex(player);
        const modal = new ModalFormData()
            .title("§bSearch")
            .textField("Enter search term", "");
        
        modal.show(player).then((res) => {
            if (!res || res.canceled || !res.formValues?.[0]) {
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                return openMain();
            }
            
            const searchTerm = (res.formValues[0] || "").toLowerCase().trim();
            if (!searchTerm) {
                return openMain();
            }
            
            const results = [];
            
            // Search mobs
            const mobEntries = [
                { key: "mapleBearSeen", title: "Tiny Maple Bear", section: "Mobs" },
                { key: "infectedBearSeen", title: "Infected Maple Bear", section: "Mobs" },
                { key: "buffBearSeen", title: "Buff Maple Bear", section: "Mobs" },
                { key: "infectedPigSeen", title: "Infected Pig", section: "Mobs" },
                { key: "infectedCowSeen", title: "Infected Cow", section: "Mobs" },
                { key: "flyingBearSeen", title: "Flying Maple Bear", section: "Mobs" },
                { key: "miningBearSeen", title: "Mining Maple Bear", section: "Mobs" },
                { key: "torpedoBearSeen", title: "Torpedo Maple Bear", section: "Mobs" }
            ];
            for (const entry of mobEntries) {
                if (entry.title.toLowerCase().includes(searchTerm) && codex.mobs[entry.key]) {
                    results.push({ ...entry, action: () => openMobs() });
                }
            }
            
            // Search items
            const itemEntries = [
                { key: "snowFound", title: "\"Snow\"", section: "Items" },
                { key: "snowIdentified", title: "\"Snow\" Identified", section: "Items" },
                { key: "snowBookCrafted", title: "Powdery Journal", section: "Items" },
                { key: "cureItemsSeen", title: "Cure Items", section: "Items" },
                { key: "brewingStandSeen", title: "Brewing Stand", section: "Items" }
            ];
            for (const entry of itemEntries) {
                if (entry.title.toLowerCase().includes(searchTerm) && codex.items[entry.key]) {
                    results.push({ ...entry, action: () => openItems() });
                }
            }
            
            // Search symptoms
            const symptomEntries = [
                { key: "weaknessSeen", title: "Weakness", section: "Symptoms" },
                { key: "nauseaSeen", title: "Nausea", section: "Symptoms" },
                { key: "blindnessSeen", title: "Blindness", section: "Symptoms" },
                { key: "slownessSeen", title: "Slowness", section: "Symptoms" },
                { key: "hungerSeen", title: "Hunger", section: "Symptoms" },
                { key: "miningFatigueSeen", title: "Mining Fatigue", section: "Symptoms" }
            ];
            for (const entry of symptomEntries) {
                if (entry.title.toLowerCase().includes(searchTerm) && codex.effects[entry.key]) {
                    results.push({ ...entry, action: () => openSymptoms() });
                }
            }
            
            if (results.length === 0) {
                const form = new ActionFormData()
                    .title("§bSearch Results")
                    .body(`§7No results found for: §f"${searchTerm}"\n\n§8Try a different search term.`);
                form.button("§8Back");
                form.show(player).then(() => openSearch());
                return;
            }
            
            const form = new ActionFormData()
                .title(`§bSearch: "${searchTerm}"`)
                .body(`§7Found §f${results.length}§7 result${results.length !== 1 ? 's' : ''}:`);
            
            for (const result of results) {
                form.button(`§f${result.title}\n§8${result.section}`);
            }
            form.button("§8Back");
            
            form.show(player).then((res) => {
                if (!res || res.canceled || res.selection === results.length) {
                    const volumeMultiplier = getPlayerSoundVolume(player);
                    player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
                    return openSearch();
                }
                
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * volumeMultiplier });
                const selected = results[res.selection];
                if (selected && selected.action) {
                    selected.action();
                } else {
                    openSearch();
                }
            }).catch(() => openMain());
        }).catch(() => openMain());
    }

    function showFirstTimeIntro() {
        const codex = getCodex(player);
        const form = new ActionFormData()
            .title("§6Powdery Journal")
            .body("§7This journal records what you learn about the outbreak.\n\n§7It updates as you discover creatures, items, and places. Use it to track infection, cures, and dangers.\n\n§7Things are logged as you experience them.")
            .button("§aContinue");
        form.show(player).then((res) => {
            if (!codex.journal) codex.journal = {};
            codex.journal.hasOpenedBefore = true;
            saveCodex(player, codex);
            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
            openMain();
        }).catch(() => {
            if (!codex.journal) codex.journal = {};
            codex.journal.hasOpenedBefore = true;
            saveCodex(player, codex);
            openMain();
        });
    }

    const codexForEntry = getCodex(player);
    if (!codexForEntry.journal?.hasOpenedBefore) {
        try { showFirstTimeIntro(); } catch { openMain(); }
    } else {
        try { openMain(); } catch { }
    }
}

// Cache for combined debug state across all players
// This avoids iterating through all players on every isDebugEnabled() call
let debugStateCache = null;

function invalidateDebugCache() {
    debugStateCache = null;
}

// Helper function to get default debug settings (used for toggle all)
function getDefaultDebugSettings() {
    return {
        mining: {
            pitfall: false,
            general: false,
            target: false,
            pathfinding: false,
            vertical: false,
            mining: false,
            movement: false,
            stairCreation: false,
            all: false
        },
        infected: {
            general: false,
            pathfinding: false,
            gapJump: false,
            all: false
        },
        torpedo: {
            general: false,
            targeting: false,
            diving: false,
            blockBreaking: false,
            all: false
        },
        flying: {
            general: false,
            targeting: false,
            pathfinding: false,
            all: false
        },
        buff: {
            general: false,
            blockBreaking: false,
            all: false
        },
        spawn: {
            general: false,
            discovery: false,
            tileScanning: false,
            cache: false,
            validation: false,
            distance: false,
            spacing: false,
            isolated: false,
            all: false
        },
        main: {
            death: false,
            conversion: false,
            infection: false,
            minorInfection: false,
            all: false
        },
        biome_ambience: {
            biome_check: false,
            player_check: false,
            sound_playback: false,
            loop_status: false,
            initialization: false,
            cleanup: false,
            errors: false,
            all: false
        },
        dynamic_properties: {
            chunking: false,
            caching: false,
            reads: false,
            writes: false,
            errors: false,
            all: false
        },
        codex: {
            progressive: false,
            experience: false,
            flags: false,
            chunking: false,
            saving: false,
            all: false
        },
        ground_infection: {
            timer: false,
            groundCheck: false,
            ambient: false,
            biome: false,
            decay: false,
            warnings: false,
            all: false
        },
        snow_storm: {
            general: false,
            movement: false,
            placement: false,
            particles: false,
            all: false
        }
    };
}

// Export debug settings functions for AI scripts
// NOTE: Debug settings ARE persisted across sessions via dynamic properties
export function getDebugSettings(player) {
    try {
        const settingsStr = getPlayerPropertyChunked(player, "mb_debug_settings");
        if (settingsStr) {
            const parsed = JSON.parse(settingsStr);
            // Merge with defaults to ensure new flags exist
            const defaults = getDefaultDebugSettings();
            for (const category in defaults) {
                if (!parsed[category]) parsed[category] = {};
                for (const flag in defaults[category]) {
                    if (parsed[category][flag] === undefined) {
                        parsed[category][flag] = defaults[category][flag];
                    }
                }
            }
            return parsed;
        }
    } catch (error) {
        console.warn(`[DEBUG] Error loading debug settings for ${player.name}:`, error);
    }
    // Default debug settings (all disabled) - only used if no saved settings exist
    const defaultSettings = getDefaultDebugSettings();
    // Save defaults so they persist
    saveDebugSettings(player, defaultSettings);
    return defaultSettings;
}

export function saveDebugSettings(player, settings) {
    try {
        setPlayerPropertyChunked(player, "mb_debug_settings", JSON.stringify(settings));
        // Invalidate cache when settings change
        invalidateDebugCache();
    } catch (error) {
        console.warn(`[DEBUG] Error saving debug settings for ${player.name}:`, error);
    }
}

// Helper function to check if any player has a specific debug flag enabled
// Performance: Uses caching to avoid iterating all players on every call
// Wrapped in try-catch: can be called during module load before debugStateCache is initialized
export function isDebugEnabled(category, flag) {
    try {
        // Initialize cache if needed (may throw if called before codex finished loading - TDZ)
        if (typeof debugStateCache === 'undefined') {
            debugStateCache = null;
        }
        
        // Return cached result if available
        if (debugStateCache && debugStateCache[category]?.[flag]) {
            return true;
        }
        
        // Check if world is available
        if (typeof world === 'undefined' || !world || typeof world.getAllPlayers !== 'function') {
            return false; // World not ready yet
        }
        
        const allPlayers = world.getAllPlayers();
        if (!debugStateCache) {
            debugStateCache = {};
        }
        
        for (const player of allPlayers) {
            const settings = getDebugSettings(player);
            if (settings[category] && settings[category][flag]) {
                if (!debugStateCache[category]) debugStateCache[category] = {};
                debugStateCache[category][flag] = true;
                return true;
            }
            // Check "all" flag
            if (settings[category] && settings[category].all) {
                if (!debugStateCache[category]) debugStateCache[category] = {};
                debugStateCache[category][flag] = true;
                return true;
            }
        }
    } catch (error) {
        // Silent fail: debugStateCache not initialized yet, or world not ready
        return false;
    }
    return false;
}

// --- Basic Journal UI Functions ---
async function forceShow(form, player, maximumRetries = 300) {
    let response;
    let retries = 0;
    do {
        response = await form.show(player);
        retries++;
        if (retries >= maximumRetries) {
            console.warn("[BASIC JOURNAL] forceShow max retries reached.");
        }
        // Add delay before retry if UserBusy to avoid tight loop
        if (
            response?.canceled &&
            response.cancelationReason === FormCancelationReason.UserBusy &&
            retries < maximumRetries
        ) {
            await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
        }
    } while (
        response?.canceled &&
        response.cancelationReason === FormCancelationReason.UserBusy &&
        retries < maximumRetries
    );
    return response;
}

export function showBasicJournalUI(player) {
    // Play journal open sound
    const volumeMultiplier = getPlayerSoundVolume(player);
    player.playSound("mb.codex_open", { pitch: 1.0, volume: 1.0 * volumeMultiplier });
    
    const form = new ActionFormData().title("§6Basic Journal");
    
    // Get current day for context
    const currentDay = getCurrentDay ? getCurrentDay() : 0;
    const display = typeof getDayDisplayInfo === 'function' ? getDayDisplayInfo(currentDay) : { color: '§f', symbols: '' };
    
    form.body(`§7Welcome to your world...\n\n${display.color}${display.symbols} Current Day: ${currentDay}\n\n§7This journal will help you understand what's happening.`);
    
    const buttons = [];
    const buttonActions = [];
    const buttonIcons = [];
    
    buttons.push("§0Your Goal");
    buttonIcons.push("textures/items/mb_snow");
    buttonActions.push(() => showGoalScreen(player));
    
    buttons.push("§bSettings");
    buttonIcons.push("textures/ui/settings_glyph_color_2x");
    buttonActions.push(() => showSettingsChooserBasic(player));
    
    buttons.push("§aRecipe: Powdery Journal");
    buttonIcons.push("textures/items/snow_book");
    buttonActions.push(() => showRecipeScreen(player));
    
    buttons.push("§eTips");
    buttonIcons.push("textures/items/book_writable");
    buttonActions.push(() => showTipsScreen(player));
    
    // Add debug/dev tools if player has cheats
    const hasDebugOptions = (player.hasTag && player.hasTag("mb_cheats")) || Boolean(system?.isEnableCheats?.());
    if (hasDebugOptions) {
        buttons.push("§bDebug Menu");
        buttonIcons.push(undefined); // No icon for debug menu
        buttonActions.push(() => {
            // Create context object for showCodexBook
            const context = {
                playerInfection,
                curedPlayers,
                formatTicksDuration,
                formatMillisDuration,
                HITS_TO_INFECT,
                bearHitCount,
                maxSnowLevels,
                getCurrentDay,
                getDayDisplayInfo
            };
            showCodexBook(player, context);
        });
        buttons.push("§cDeveloper Tools");
        buttonIcons.push(undefined); // No icon for developer tools
        buttonActions.push(() => {
            // Create context object for showCodexBook
            const context = {
                playerInfection,
                curedPlayers,
                formatTicksDuration,
                formatMillisDuration,
                HITS_TO_INFECT,
                bearHitCount,
                maxSnowLevels,
                getCurrentDay,
                getDayDisplayInfo
            };
            showCodexBook(player, context);
        });
    }
    
    // Add buttons to form
    for (let i = 0; i < buttons.length; i++) {
        if (buttonIcons[i]) {
            form.button(buttons[i], buttonIcons[i]);
        } else {
            form.button(buttons[i]);
        }
    }
    
    forceShow(form, player).then((response) => {
        if (response.canceled) {
            // Play close sound when canceled
            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_close", { pitch: 1.0, volume: 1.0 * volumeMultiplier });
            return;
        }
        
        // Play page turn sound when navigating
        const volumeMultiplier = getPlayerSoundVolume(player);
        player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
        
        if (response.selection >= 0 && response.selection < buttonActions.length) {
            buttonActions[response.selection]();
        }
    });
}

// ARCHIVED: First-time welcome screen - disabled but preserved for potential future use
// This function is no longer called but kept in case we want to add an audio intro later
export function showFirstTimeWelcomeScreen(player) {
    // Play journal open sound
    const volumeMultiplier = getPlayerSoundVolume(player);
    player.playSound("mb.codex_open", { pitch: 1.0, volume: 1.0 * volumeMultiplier });
    
    const form = new ActionFormData().title("§6Welcome to Your Journal");
    form.body(`§eWelcome, Survivor!\n\n§7This journal will help you understand what's happening in your world.\n\n§7Would you like to hear an audio introduction?\n\n§7(You can change this setting later)`);
    form.button("§aYes, Play Audio", "textures/items/gold_ingot");
    form.button("§7Skip for Now", "textures/ui/cancel");
    
    forceShow(form, player).then((response) => {
        try {
            if (response.canceled) {
                // If canceled, mark as opened and show normal menu
                const firstTimeKey = `mb_basic_journal_first_open_${player.id}`;
                setWorldProperty(firstTimeKey, true);
                const volumeMultiplier = getPlayerSoundVolume(player);
                player.playSound("mb.codex_close", { pitch: 1.0, volume: 1.0 * volumeMultiplier });
                showBasicJournalUI(player);
                return;
            }
            
            const firstTimeKey = `mb_basic_journal_first_open_${player.id}`;
            setWorldProperty(firstTimeKey, true);
            
            // Play page turn sound
            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
            
            // Always show the menu first
            showBasicJournalUI(player);
            
            if (response.selection === 0) {
                // Play audio intro in the background after showing menu
                playJournalIntroAudio(player);
            }
        } catch (error) {
            console.warn(`[BASIC JOURNAL] Error handling first-time welcome screen response:`, error);
            // Fallback: show the menu anyway
            try {
                showBasicJournalUI(player);
            } catch (e) {
                console.warn(`[BASIC JOURNAL] Error showing basic journal UI:`, e);
            }
        }
    }).catch((error) => {
        console.warn(`[BASIC JOURNAL] Error in first-time welcome screen form:`, error);
        // Fallback: show the menu anyway
        try {
            showBasicJournalUI(player);
        } catch (e) {
            console.warn(`[BASIC JOURNAL] Error showing basic journal UI:`, e);
        }
    });
}

function playJournalIntroAudio(player) {
    // Check if audio messages are enabled
    const settingsKey = `mb_player_settings_${player.id}`;
    let rawSettings = getWorldPropertyChunked(settingsKey);
    
    // Parse settings if it's a JSON string
    let settings = null;
    if (rawSettings) {
        if (typeof rawSettings === 'string') {
            try {
                settings = JSON.parse(rawSettings);
            } catch (e) {
                settings = null;
            }
        } else if (typeof rawSettings === 'object') {
            settings = rawSettings;
        }
    }
    
    if (settings && settings.audioMessages === false) {
        // Audio disabled, menu already shown
        return;
    }
    
    // Get sound volume setting (default to 1.0 if not set)
    const soundVolume = (settings && typeof settings.soundVolume === 'number') 
        ? settings.soundVolume 
        : 1.0;
    
    // Play intro audio
    // TODO: Replace "mb.journal_intro" with your custom sound identifier
    // Add your audio file to RP/sounds/ and register it in RP/sounds/sound_definitions.json
    try {
        // Try custom sound first, fallback to placeholder
        try {
            player.playSound("mb.journal_intro", { pitch: 1.0, volume: soundVolume });
        } catch {
            // Fallback to placeholder sounds if custom sound not found
            player.playSound("mob.enderman.portal", { pitch: 0.8, volume: soundVolume });
            player.playSound("random.orb", { pitch: 1.2, volume: soundVolume * 0.8 });
        }
        
        // Show message while audio plays
        player.sendMessage(CHAT_INFO + "Playing introduction...");
    } catch (error) {
        console.warn(`[BASIC JOURNAL] Error playing intro audio:`, error);
    }
}

function showGoalScreen(player) {
    const form = new ActionFormData().title("§6Your Goal");
    form.body(`§eThe Infection\n\n§7Your world has been infected by a mysterious white powder. Strange creatures called "Maple Bears" are spreading this infection.\n\n§eYour Objectives:\n§7• Survive the infection.\n§7• Discover how to cure yourself.\n§7• Learn about the bears and their behavior.\n§7• Upgrade this journal to track your progress and find the cure.\n§7• Find a way to cure your infection before you degrade and it worsens.\n\n§cIMPORTANT: §7Upgrading your journal is essential for discovering cures and tracking your infection status. Without the upgraded journal, you won't be able to learn crucial information about infections, cures, and treatments.\n\n§7The infection gets worse over time. Stay alert!`);
    form.button("§8Back");
    form.show(player).then((res) => {
        if (res.canceled) {
            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_close", { pitch: 1.0, volume: 1.0 * volumeMultiplier });
            return;
        }
        
        // Play page turn sound when going back
        const volumeMultiplier = getPlayerSoundVolume(player);
        player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
        showBasicJournalUI(player);
    });
}

function showBetaSettingsScreen(player, onBack) {
    const canEdit = canChangeBeta(player);
    const infectedOn = isBetaInfectedAIEnabled();
    const dustStormsOn = isBetaDustStormsEnabled();
    const visibleToAll = isBetaVisibleToAll();
    const form = new ActionFormData()
        .title("§dBeta Features")
        .body(`§7Experimental features. §8(First joiner + mb_cheats can change)\n\n§7Infected AI (beta): §${infectedOn ? "aON" : "cOFF"}\n§7Dust storms (beta): §${dustStormsOn ? "aON" : "cOFF"}\n§7Visible to others in book: §${visibleToAll ? "aON" : "cOFF"}\n${!canEdit ? "\n§8You are viewing read-only." : ""}`);

    if (canEdit) {
        form.button(infectedOn ? "§aInfected AI §8(ON) → OFF" : "§cInfected AI §8(OFF) → ON");
        form.button(dustStormsOn ? "§aDust Storms §8(ON) → OFF" : "§cDust Storms §8(OFF) → ON");
        form.button(visibleToAll ? "§aVisible to others §8(ON) → OFF" : "§cVisible to others §8(OFF) → ON");
    }
    form.button("§8Back");

    form.show(player).then((res) => {
        if (!res || res.canceled || res.selection === (canEdit ? 3 : 0)) {
            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
            return onBack();
        }
        if (canEdit && res.selection === 0) {
            setBetaInfectedAIEnabled(!infectedOn);
            player.sendMessage(CHAT_INFO + "Infected AI (beta): " + (infectedOn ? CHAT_DANGER + "OFF" : CHAT_SUCCESS + "ON"));
        } else if (canEdit && res.selection === 1) {
            setBetaDustStormsEnabled(!dustStormsOn);
            player.sendMessage(CHAT_INFO + "Dust storms (beta): " + (dustStormsOn ? CHAT_DANGER + "OFF" : CHAT_SUCCESS + "ON"));
        } else if (canEdit && res.selection === 2) {
            setBetaVisibleToAll(!visibleToAll);
            player.sendMessage(CHAT_INFO + "Visible to others: " + (visibleToAll ? CHAT_DANGER + "OFF" : CHAT_SUCCESS + "ON"));
        }
        player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * getPlayerSoundVolume(player) });
        showBetaSettingsScreen(player, onBack);
    }).catch(() => onBack());
}

function showSettingsChooserBasic(player) {
    const canSee = canSeeBeta(player);
    const form = new ActionFormData().title("§bSettings");
    form.body("§7Choose a section:");
    form.button("§fGeneral §8(Sound, Tips, Messages)");
    if (canSee) {
        form.button("§dBeta Features §8(experimental)");
    }
    form.button("§8Back");

    form.show(player).then((res) => {
        if (!res || res.canceled) {
            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
            return showBasicJournalUI(player);
        }
        if (res.selection === 0) {
            return showGeneralSettingsBasic(player);
        }
        if (canSee && res.selection === 1) {
            return showBetaSettingsScreen(player, () => showSettingsChooserBasic(player));
        }
        const volumeMultiplier = getPlayerSoundVolume(player);
        player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
        showBasicJournalUI(player);
    }).catch(() => showBasicJournalUI(player));
}

function showGeneralSettingsBasic(player) {
    // Get or create settings
    const settingsKey = `mb_player_settings_${player.id}`;
    let rawSettings = getWorldPropertyChunked(settingsKey);
    
    // Ensure we have a valid settings object
    let settings = {};
    if (rawSettings) {
        // Try to parse if it's a JSON string, otherwise use as-is (for backwards compatibility)
        let parsedSettings = rawSettings;
        if (typeof rawSettings === 'string') {
            try {
                parsedSettings = JSON.parse(rawSettings);
            } catch (e) {
                // If parsing fails, use defaults
                parsedSettings = null;
            }
        }
        
        if (parsedSettings && typeof parsedSettings === 'object') {
            settings = {
                soundVolume: typeof parsedSettings.soundVolume === 'number' ? parsedSettings.soundVolume : 1.0,
                showTips: parsedSettings.showTips !== false,
                audioMessages: parsedSettings.audioMessages !== false,
                showInfectionTimer: parsedSettings.showInfectionTimer === true,
                criticalWarningsOnly: parsedSettings.criticalWarningsOnly === true,
                stormParticles: typeof parsedSettings.stormParticles === 'number' ? Math.max(0, Math.min(2, parsedSettings.stormParticles)) : 0
            };
        } else {
            settings = {
                soundVolume: 1.0,
                showTips: true,
                audioMessages: true,
                showInfectionTimer: false,
                criticalWarningsOnly: false,
                stormParticles: 0
            };
        }
    } else {
        settings = {
            soundVolume: 1.0,
            showTips: true,
            audioMessages: true,
            showInfectionTimer: false,
            criticalWarningsOnly: false,
            stormParticles: 0
        };
    }
    
    if (settings.audioMessages === undefined) settings.audioMessages = true;
    if (settings.showInfectionTimer === undefined) settings.showInfectionTimer = false;
    if (settings.criticalWarningsOnly === undefined) settings.criticalWarningsOnly = false;
    if (settings.stormParticles === undefined) settings.stormParticles = 0;
    if (settings.soundVolume === undefined || typeof settings.soundVolume !== 'number') {
        settings.soundVolume = 1.0;
    }
    if (settings.showTips === undefined) {
        settings.showTips = true;
    }
    
    // Extract values for form (ensure they're the right types)
    const soundVolume = Number(settings.soundVolume);
    const showTips = Boolean(settings.showTips);
    const audioMessages = Boolean(settings.audioMessages);
    
    // Convert volume to integer scale (0-10) for slider (sliders only accept integers)
    const volumeSliderValue = Math.round(soundVolume * 10);
    
    const stormParticlesIndex = Math.max(0, Math.min(2, settings.stormParticles ?? 0));
    const particleOptions = ["Less", "Medium", "More"];
    const form = new ModalFormData()
        .title("§bSettings")
        .slider("Sound Volume (0-10)", 0, 10, { valueStep: 1, defaultValue: volumeSliderValue })
        .toggle("Show Tips", { defaultValue: showTips })
        .toggle("Audio Messages", { defaultValue: audioMessages })
        .dropdown("Storm Particles §8(Less = better performance)", particleOptions, { defaultValueIndex: stormParticlesIndex })
        .toggle("Only critical infection/day warnings", { defaultValue: Boolean(settings.criticalWarningsOnly) });
    
    form.show(player).then((response) => {
        if (response.canceled) {
            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
            showSettingsChooserBasic(player);
            return;
        }
        
        const volumeMultiplier = getPlayerSoundVolume(player);
        player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 * volumeMultiplier });
        
        if (response.formValues && response.formValues.length >= 5) {
            const sliderValue = typeof response.formValues[0] === 'number' 
                ? Math.max(0, Math.min(10, Math.round(Number(response.formValues[0]))))
                : volumeSliderValue;
            const normalizedVolume = Math.round((sliderValue / 10) * 100) / 100;
            const showTipsValue = Boolean(response.formValues[1]);
            const audioMessagesValue = Boolean(response.formValues[2]);
            const stormParticlesValue = typeof response.formValues[3] === 'number' ? Math.max(0, Math.min(2, Math.floor(response.formValues[3]))) : 0;
            const criticalWarningsOnlyValue = Boolean(response.formValues[4]);
            
            const newSettings = {
                soundVolume: Number(normalizedVolume),
                showTips: Boolean(showTipsValue),
                audioMessages: Boolean(audioMessagesValue),
                stormParticles: stormParticlesValue,
                criticalWarningsOnly: criticalWarningsOnlyValue
            };
            
            try {
                // Stringify the object for storage (like other dynamic properties in the codebase)
                setWorldPropertyChunked(settingsKey, JSON.stringify(newSettings));
                saveAllProperties();
                player.sendMessage(CHAT_INFO + "Settings saved!");
            } catch (error) {
                console.warn(`[BASIC JOURNAL] Error saving settings:`, error);
                player.sendMessage(CHAT_DANGER + "Error saving settings!");
            }
        }
        showSettingsChooserBasic(player);
    });
}

function showRecipeScreen(player) {
    const form = new ActionFormData().title("§aRecipe: Powdery Journal");
    form.body(`§ePowdery Journal Recipe\n\n§7Upgrade your Basic Journal to a Powdery Journal:\n\n§7Crafting Pattern:\n§7  S S S\n§7  S J S\n§7  S S S\n\n§7S = "snow"\n§7J = Basic Journal\n\n§7The Powdery Journal will automatically track your infection status, discoveries, and bear encounters.`);
    form.button("§8Back");
    form.show(player).then((res) => {
        if (res.canceled) {
            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_close", { pitch: 1.0, volume: 1.0 * volumeMultiplier });
            return;
        }
        
        // Play page turn sound when going back
        const volumeMultiplier = getPlayerSoundVolume(player);
        player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
        showBasicJournalUI(player);
    });
}

function showTipsScreen(player) {
    const form = new ActionFormData().title("§7Tips");
    form.body(`§eSurvival Tips\n\n§7• Break "dusted dirt" blocks to collect "snow"\n§7• Eating "snow" gives temporary effects but increases infection\n§7• Maple Bears spread infection when they hit you\n§7• Explore infected biomes to learn more\n§7• Upgrade to Powdery Journal for detailed tracking\n\n§7Good luck, survivor!`);
    form.button("§8Back");
    form.show(player).then((res) => {
        if (res.canceled) {
            const volumeMultiplier = getPlayerSoundVolume(player);
            player.playSound("mb.codex_close", { pitch: 1.0, volume: 1.0 * volumeMultiplier });
            return;
        }
        
        // Play page turn sound when going back
        const volumeMultiplier = getPlayerSoundVolume(player);
        player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 * volumeMultiplier });
        showBasicJournalUI(player);
    });
}