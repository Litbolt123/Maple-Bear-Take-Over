import { system, world } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { recordDailyEvent, getCurrentDay } from "./mb_dayTracker.js";
import { ModalFormData } from "@minecraft/server-ui";

const SPAWN_DIFFICULTY_PROPERTY = "mb_spawnDifficulty";

function getSpawnDifficultyValue() {
    let rawValue = world.getDynamicProperty(SPAWN_DIFFICULTY_PROPERTY);
    if (typeof rawValue !== "number") {
        rawValue = 0;
    }
    return Math.max(-5, Math.min(5, rawValue));
}

export function getDefaultCodex() {
    return {
        infections: { bear: { discovered: false, firstHitAt: 0 }, snow: { discovered: false, firstUseAt: 0 } },
        status: { immuneKnown: false, immuneUntil: 0, bearTimerSeen: false, snowTimerSeen: false },
        cures: { bearCureKnown: false, bearCureDoneAt: 0 },
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
        symptomsUnlocks: {
            infectionSymptomsUnlocked: false,
            snowEffectsUnlocked: false,
            snowTierAnalysisUnlocked: false
        },
        // Aggregated metadata by effect id
        symptomsMeta: {},
        items: { snowFound: false, snowIdentified: false, snowBookCrafted: false, cureItemsSeen: false, snowTier5Reached: false, snowTier10Reached: false, snowTier20Reached: false, snowTier50Reached: false, brewingStandSeen: false, dustedDirtSeen: false, bookCraftMessageShown: false, goldenAppleSeen: false, enchantedGoldenAppleSeen: false, goldenAppleInfectionReductionDiscovered: false },
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
        biomes: { infectedBiomeSeen: false },
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
            day20WorldLoreUnlocked: false
        },
        biomeData: {} // Will store biome-specific infection data as discovered
    };
}

export function getCodex(player) {
    try {
        const raw = player.getDynamicProperty("mb_codex");
        if (!raw) return getDefaultCodex();
        const parsed = JSON.parse(raw);
        return { ...getDefaultCodex(), ...parsed };
    } catch (e) {
        return getDefaultCodex();
    }
}

export function saveCodex(player, codex) {
    try {
        player.setDynamicProperty("mb_codex", JSON.stringify(codex));
    } catch (e) {
        console.warn('Failed to save codex:', e);
    }
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
    if (timestamp) {
        ref[leaf] = Date.now();
    } else {
        ref[leaf] = true;
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

    // Infection knowledge progression
    if (codex.history.totalInfections > 0) {
        updateKnowledgeLevel(player, 'infectionLevel', 1); // Basic awareness
        if (codex.history.totalInfections >= 2) {
            updateKnowledgeLevel(player, 'infectionLevel', 2); // Understanding
        }
        if (codex.history.totalInfections >= 5 || codex.journal?.day20WorldLoreUnlocked) {
            updateKnowledgeLevel(player, 'infectionLevel', 3); // Expert
        }
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
                case 'snowLevel': friendlyName = 'Snow Knowledge'; break;
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
                case 'snowFound': friendlyName = 'Snow Discovery'; break;
                case 'snowBookCrafted': friendlyName = 'Knowledge Book'; break;
                case 'snowIdentified': friendlyName = 'Snow Identification'; break;
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
        fromPlayer.sendMessage(`§7Shared with §f${toPlayer.name}§7: §a${summary}`);
        if (recipientHasJournal) {
            toPlayer.sendMessage(`§b${fromPlayer.name}§7 shared: §a${summary}`);
        } else {
            toPlayer.sendMessage(`§7Knowledge shared, but no journal to record it.`);
        }
        toPlayer.playSound("random.orb", { pitch: 1.2, volume: 0.8 });
        toPlayer.playSound("mob.experience_orb.pickup", { pitch: 1.0, volume: 0.6 });

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
    player.playSound("mb.codex_open", { pitch: 1.0, volume: 1.0 });

    // Ensure knowledge progression is up to date before presenting information
    try {
        checkKnowledgeProgression(player);
    } catch { }

        // Variant unlock checks are handled when mobs are killed, not when opening codex
    function maskTitle(title, known) {
        return known ? title : "?".repeat(title.length);
    }
        
        // Get settings with defaults
        function getSettings() {
            const codex = getCodex(player);
            if (!codex.settings) {
                codex.settings = {
                    showSearchButton: true,
                    bearSoundVolume: 2, // 0=off, 1=low, 2=high
                    blockBreakVolume: 2 // 0=off, 1=low, 2=high
                };
                saveCodex(player, codex);
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
        if (hasInfection) {
            if (infectionKnowledge >= 1) {
            summary.push(`§eStatus: §cINFECTED`);
            const ticks = infectionState.ticksLeft || 0;
            const days = Math.ceil(ticks / 24000);
            const snowCount = infectionState.snowCount || 0;
            summary.push(`§eTime: §c${formatTicksDuration(ticks)} (§f~${days} day${days !== 1 ? 's' : ''}§c)`);
            summary.push(`§eSnow consumed: §c${snowCount}`);
                if (codex.cures.bearCureKnown) summary.push("§7Cure: §fWeakness + Enchanted Golden Apple");
            } else {
                summary.push(`§eStatus: §cSomething is wrong with you...`);
                summary.push(`§7You feel unwell but don't understand why.`);
            }
        } else {
            // Check if player has ever been infected
            const hasBeenInfected = codex.history.totalInfections > 0;
            if (hasBeenInfected && infectionKnowledge >= 1) {
                summary.push(`§eStatus: §aHealthy (Previously Infected)`);
            } else {
                summary.push(`§eStatus: §aHealthy`);
            }
        }

        // Only show immunity if player has been cured and knows about it
        if (immune && codex.status.immuneKnown) {
            const end = curedPlayers.get(player.id);
            const remainingMs = Math.max(0, end - Date.now());
            summary.push(`§bImmunity: §fACTIVE (§b${formatMillisDuration(remainingMs)} left§f)`);
        } else {
            summary.push("§bImmunity: §7None");
        }

        // Bear hits - only show if player has bear knowledge
        const bearKnowledge = getKnowledgeLevel(player, 'bearLevel');
        const hitCount = bearHitCount.get(player.id) || 0;
        if (hitCount > 0 && !hasInfection && bearKnowledge >= 1) {
            summary.push(`§eBear Hits: §f${hitCount}/${HITS_TO_INFECT}`);
        }

        try { if (hasInfection) markCodex(player, "status.bearTimerSeen"); if (immune) markCodex(player, "status.immuneKnown"); } catch { }
        return summary.join("\n");
    }

    function openMain() {
        const codex = getCodex(player);
        const form = new ActionFormData().title("§6Powdery Journal");
        form.body(`${buildSummary()}\n\n§eChoose a section:`);
        
        // Only show buttons for unlocked sections
        const buttons = [];
        const buttonActions = [];
        
        // Infection section - always available
        buttons.push("§fInfection");
        buttonActions.push(() => openInfections());
        
        // Symptoms section - show if any symptoms/snow effects discovered
        const hasAnySymptoms = Object.values(codex.effects).some(seen => seen);
        const hasAnySnowEffects = Object.values(codex.snowEffects).some(seen => seen);
        const hasSnowKnowledge = codex.items.snowIdentified;
        const maxSnow = maxSnowLevels.get(player.id);
        
        // Show symptoms tab if any symptoms/snow effects have been recorded
        if (hasAnySymptoms || hasAnySnowEffects || (hasSnowKnowledge && maxSnow && maxSnow.maxLevel > 0)) {
            buttons.push("§fSymptoms");
            buttonActions.push(() => openSymptoms());
        }
        
        // Mobs section - only if any mobs discovered
        const hasAnyMobs = Object.values(codex.mobs).some(seen => seen === true);
        if (hasAnyMobs) {
            buttons.push("§fMobs");
            buttonActions.push(() => openMobs());
        }
        
        // Items section - only if any items discovered
        const hasAnyItems = Object.values(codex.items).some(seen => seen);
        if (hasAnyItems) {
            buttons.push("§fItems");
            buttonActions.push(() => openItems());
        }
        
        const hasAnyBiomes = codex.biomes.infectedBiomeSeen;
        if (hasAnyBiomes) {
            buttons.push("§fBiomes");
            buttonActions.push(() => openBiomes());
        }
        
        const hasEndgameLore = !!(codex.journal?.day20TinyLoreUnlocked || codex.journal?.day20InfectedLoreUnlocked || codex.journal?.day20BuffLoreUnlocked || codex.journal?.day20WorldLoreUnlocked);
        if (hasEndgameLore) {
            buttons.push("§fLate Lore");
            buttonActions.push(() => openLateLore());
        }

        // Timeline section - only show if there's content available
        const currentDay = getCurrentDay ? getCurrentDay() : 0;
        const hasDailyEvents = codex.dailyEvents && Object.keys(codex.dailyEvents).length > 0;
        const hasTimelineContent = currentDay >= 2 || hasDailyEvents;
        if (hasTimelineContent) {
            buttons.push("§fTimeline");
            buttonActions.push(() => openTimeline());
        }

        // Achievements section - show if any achievements exist
        const hasAchievements = codex.achievements && (codex.achievements.day25Victory || codex.achievements.maxDaysSurvived);
        if (hasAchievements) {
            buttons.push("§fAchievements");
            buttonActions.push(() => openAchievements());
        }

        const hasDebugOptions = (player.hasTag && player.hasTag("mb_cheats")) || Boolean(system?.isEnableCheats?.());

        if (hasDebugOptions) {
            buttons.push("§bDebug Menu");
            buttonActions.push(() => openDebugMenu());
            buttons.push("§cDeveloper Tools");
            buttonActions.push(() => openDeveloperTools());
        }
        
        // Settings button - always available
        buttons.push("§eSettings");
        buttonActions.push(() => openSettings());
        
        // Search button - only if enabled in settings
        const settings = getSettings();
        if (settings.showSearchButton) {
            buttons.push("§bSearch");
            buttonActions.push(() => openSearch());
        }
        
        // Add buttons to form
        for (const button of buttons) {
            form.button(button);
        }
        
        form.show(player).then((res) => {
            if (!res || res.canceled) {
                // Play journal close sound when canceling/closing
                player.playSound("mb.codex_close", { pitch: 1.0, volume: 1.0 });
                return;
            }
            const sel = res.selection;
            if (sel >= 0 && sel < buttonActions.length) {
                // Play page turn sound for navigation
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 });
                buttonActions[sel]();
            }
        }).catch(() => { });
    }

    function openInfections() {
        const codex = getCodex(player);
        const lines = [];
        
        if (codex.infections.bear.discovered || codex.infections.snow.discovered) {
            lines.push("§eThe Infection");
            
            // Infection details (status is shown on main page)
            
            lines.push(getCodex(player).cures.bearCureKnown ? "§7Cure: Weakness + Enchanted Golden Apple" : "§8Cure: ???");
            lines.push("§7Notes: §8Infection advances over time. Snow consumption affects the timer.");
            
            lines.push("\n§6Infection Mechanics:");
            lines.push("§7• Maple Bears can infect you through attacks");
            lines.push("§7• Infection progresses through multiple stages");
            lines.push("§7• Symptoms worsen as infection advances");
            lines.push("§7• Snow can slow or accelerate infection");
            lines.push("§7• Conversion rate increases with each day");
            lines.push("§7• By Day 20, all mob kills convert to infected variants");
            
            // Add infection history if available
            if (codex.history.totalInfections > 0) {
                lines.push("");
                lines.push("§6Infection History:");
                lines.push(`§7Total Infections: §f${codex.history.totalInfections}`);
                lines.push(`§7Total Cures: §f${codex.history.totalCures}`);
                
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
            player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 });
            openMain();
        });
    }

    function openSymptoms() {
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
        
        const form = new ActionFormData().title("§6Symptoms");
        
        // Check if any content is available
        if (!showSnowTierAnalysis && !showInfectionSymptoms && !showSnowEffects) {
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
            
            // Add infection symptoms if unlocked
            if (showInfectionSymptoms) {
                form.button("§cInfection Symptoms");
                buttonIndex++;
            }
            
            // Add snow effects if unlocked
            if (showSnowEffects) {
                form.button("§bSnow Effects");
                buttonIndex++;
            }
            
            form.button("§8Back");
        }
        form.show(player).then((res) => {
            if (!res || res.canceled) return;

            // Play page turn sound
            player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 });
            
            // If no content available, just go back
            if (!showSnowTierAnalysis && !showInfectionSymptoms && !showSnowEffects) {
                openMain();
                return;
            }
            
            let currentIndex = 0;
            
            if (showSnowTierAnalysis && res.selection === currentIndex) {
                openSnowTierAnalysis();
                return;
            }
            if (showSnowTierAnalysis) currentIndex++;
            
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
                form.button(`§f${e.title}`);
            }
            
            form.button("§8Back");
        }
        form.show(player).then((res) => {
            if (!res || res.canceled) return openSymptoms();

            // Play page turn sound
            player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 });
            
            // If no symptoms available, just go back
            if (entries.length === 0) {
                openSymptoms();
                return;
            }
            
            if (res.selection >= 0 && res.selection < entries.length) {
                const e = entries[res.selection];
                const known = codex.effects[e.key];
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
                    body = `§e${e.title}\n§7Sources: §f${srcs}\n§7Duration: §f${minDur}s - ${maxDur}s\n§7Amplifier: §f${minAmp} - ${maxAmp}\n§7Timing: §f${timingStr}\n§7Snow Count: §f${snowStr}`;
                }
                new ActionFormData().title(`§6Infection Symptoms: ${known ? e.title : '???'}`).body(body).button("§8Back").show(player).then(() => {
                    player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 });
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
        
        const form = new ActionFormData().title("§6Snow Effects");
        
        if (entries.length === 0) {
            form.body("§7No snow effects have been experienced yet.\n§8You need to consume snow while infected to unlock effect information.");
            form.button("§8Back");
        } else {
            form.body("§7Select an effect to view details:");
            
            for (const e of entries) {
                const color = e.type === "positive" ? "§a" : "§c";
                const prefix = e.type === "positive" ? "§a+" : "§c-";
                form.button(`${color}${prefix} ${e.title}`);
            }
            
            form.button("§8Back");
        }
        form.show(player).then((res) => {
            if (!res || res.canceled) return openSymptoms();

            // Play page turn sound
            player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 });
            
            // If no effects available, just go back
            if (entries.length === 0) {
                openSymptoms();
                return;
            }
            
            if (res.selection >= 0 && res.selection < entries.length) {
                const e = entries[res.selection];
                const known = codex.snowEffects[e.key];
                let body = "§e???";
                if (known) {
                    const effectType = e.type === "positive" ? "§aBeneficial" : "§cHarmful";
                    const description = e.type === "positive" ? "This effect provides benefits when consumed with snow." : "This effect causes negative effects when consumed with snow.";
                    body = `§e${e.title}\n§7Type: ${effectType}\n§7Description: §f${description}\n\n§7This effect can be obtained by consuming snow while infected. The chance and intensity depend on your infection level.`;
                }
                new ActionFormData().title(`§6Snow Effects: ${known ? e.title : '???'}`).body(body).button("§8Back").show(player).then(() => {
                    player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 });
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

    function openMobs() {
        const codex = getCodex(player);
        const entries = [
            { key: "mapleBearSeen", title: "Tiny Maple Bear", icon: "textures/items/mb" },
            { key: "infectedBearSeen", title: "Infected Maple Bear", icon: "textures/items/Infected_human_mb_egg" },
            { key: "buffBearSeen", title: "Buff Maple Bear", icon: "textures/items/buff_mb_egg" },
            { key: "infectedPigSeen", title: "Infected Pig", icon: "textures/items/infected_pig_spawn_egg" },
            { key: "infectedCowSeen", title: "Infected Cow", icon: "textures/items/infected_cow_egg" },
            { key: "flyingBearSeen", title: "Flying Maple Bear", icon: "textures/items/flying_mb_egg" },
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
            }
            
            if (known) form.button(label, e.icon);
            else form.button(label);
        }
        form.button("§8Back");
        form.show(player).then((res) => {
            if (!res || res.canceled) return openMain();

            // Play page turn sound
            player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 });
            if (res.selection >= 0 && res.selection < entries.length) {
                const e = entries[res.selection];
                const known = codex.mobs[e.key];
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
                                body += `\n§7Drop Rate: 60% chance\n§7Loot: 1 snow item\n§7Health: 1 HP\n§7Damage: 1`;
                            } else if (e.key === "infectedBearSeen") {
                                body += `\n§7Drop Rate: 80% chance\n§7Loot: 1-5 snow items\n§7Health: 20 HP\n§7Damage: 2.5`;
                            } else if (e.key === "infectedPigSeen") {
                                body += `\n§7Drop Rate: 75% chance\n§7Loot: 1-4 snow items\n§7Health: 10 HP\n§7Damage: 2\n§7Special: Can infect other mobs`;
                            } else if (e.key === "infectedCowSeen") {
                                body += `\n§7Drop Rate: 75% chance\n§7Loot: 1-4 snow items\n§7Health: 10 HP\n§7Damage: 2`;
                            } else if (e.key === "buffBearSeen") {
                                body += `\n§7Drop Rate: 80% chance\n§7Loot: 3-15 snow items\n§7Health: 100 HP\n§7Damage: 8`;
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
                                    variantInfo += `\n§7Enhanced: 1 HP, 1.5 Damage, 65% drop rate, 1-2 snow items`;
                                } else if (e.key === "infectedBearSeen") {
                                    variantInfo += `\n§7Enhanced: 25 HP, 2.5 Damage, 80% drop rate, 1-5 snow items`;
                                } else if (e.key === "infectedPigSeen") {
                                    variantInfo += `\n§7Enhanced: 10 HP, 1 Damage, 80% drop rate, 1-5 snow items\n§7Special: Enhanced infection spread`;
                                } else if (e.key === "infectedCowSeen") {
                                    variantInfo += `\n§7Enhanced: 10 HP, 1.5 Damage, 85% drop rate, 2-6 snow items\n§7Special: Improved conversion rate`;
                                }
                            }

                            if (codex.mobs.day8VariantsUnlocked && killCount >= day8Threshold && !isBuffBear) {
                                variantInfo += `\n\n§eDay 8+ Variants:`;
                                hasVariants = true;
                                if (e.key === "mapleBearSeen") {
                                    variantInfo += `\n§7Advanced: 2 HP, 2 Damage, 70% drop rate, 1-3 snow items`;
                                } else if (e.key === "infectedBearSeen") {
                                    variantInfo += `\n§7Advanced: 25 HP, 4 Damage, 90% drop rate, 2-8 snow items`;
                                } else if (e.key === "infectedPigSeen") {
                                    variantInfo += `\n§7Advanced: 10 HP, 1 Damage, 90% drop rate, 2-8 snow items\n§7Special: Maximum infection spread`;
                                } else if (e.key === "infectedCowSeen") {
                                    variantInfo += `\n§7Advanced: 10 HP, 1.5 Damage, 95% drop rate, 3-10 snow items\n§7Special: Maximum conversion rate`;
                                }
                            }

                            if (codex.mobs.day13VariantsUnlocked && killCount >= day13Threshold) {
                                variantInfo += `\n\n§eDay 13+ Variants:`;
                                hasVariants = true;
                                if (e.key === "mapleBearSeen") {
                                    variantInfo += `\n§7Ultimate: 3 HP, 3 Damage, 75% drop rate, 1-4 snow items\n§7Special: Enhanced speed and reach`;
                                } else if (e.key === "infectedBearSeen") {
                                    variantInfo += `\n§7Ultimate: 50 HP, 6 Damage, 95% drop rate, 3-12 snow items\n§7Special: Maximum threat level`;
                                } else if (e.key === "infectedPigSeen") {
                                    variantInfo += `\n§7Ultimate: 10 HP, 1 Damage, 95% drop rate, 3-12 snow items\n§7Special: Ultimate infection spread`;
                                } else if (e.key === "infectedCowSeen") {
                                    variantInfo += `\n§7Ultimate: 10 HP, 1.5 Damage, 98% drop rate, 4-15 snow items\n§7Special: Ultimate conversion rate`;
                                } else if (e.key === "buffBearSeen") {
                                    variantInfo += `\n§7Ultimate: 150 HP, 10 Damage, 98% drop rate, 8-30 snow items\n§7Special: Ultimate combat mastery`;
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
                                    variantInfo += `\n§7Ascended: 5 HP, 4 Damage, 80% drop rate, 3-15 snow items\n§7Special: Swift flanking and synchronized strikes`;
                                } else if (e.key === "infectedBearSeen") {
                                    variantInfo += `\n§7Ascended: 40 HP, 8 Damage, 95% drop rate, 3-15 snow items\n§7Special: Dust saturation expands infection radius`;
                                } else if (e.key === "buffBearSeen") {
                                    variantInfo += `\n§7Ascended: 200 HP, 12 Damage, 98% drop rate, 5-18 snow items\n§7Special: Long-range leaps and crushing roar`;
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
                    player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 });
                    openMobs();
                });
            } else {
                openMain();
            }
        });
    }

    function openItems() {
        const codex = getCodex(player);
        
        // Item icon configuration
        const ITEM_ICONS = {
            'snowFound': "textures/items/mb_snow",
            'snowBookCrafted': "textures/items/snow_book",
            'cureItemsSeen': "textures/items/apple_golden",
            'potionsSeen': "textures/items/potion_bottle_saturation",
            'weaknessPotionSeen': "textures/items/potion_bottle_saturation",
            'goldenAppleSeen': "textures/items/apple_golden",
            'enchantedGoldenAppleSeen': "textures/items/apple_golden",
            'brewingStandSeen': "textures/items/brewing_stand",
            'dustedDirtSeen': "textures/blocks/dusted_dirt"
        };
        
        const entries = [
            { key: "snowFound", title: "'Snow' (Powder)", icon: ITEM_ICONS.snowFound },
            { key: "snowBookCrafted", title: "Powdery Journal", icon: ITEM_ICONS.snowBookCrafted },
            { key: "cureItemsSeen", title: "Cure Items", icon: ITEM_ICONS.cureItemsSeen },
            { key: "potionsSeen", title: "Potions", icon: ITEM_ICONS.potionsSeen },
            { key: "goldenAppleSeen", title: "Golden Apple", icon: ITEM_ICONS.goldenAppleSeen },
            { key: "enchantedGoldenAppleSeen", title: "§5Enchanted§f Golden Apple", icon: ITEM_ICONS.enchantedGoldenAppleSeen },
            { key: "brewingStandSeen", title: "Brewing Stand", icon: ITEM_ICONS.brewingStandSeen },
            { key: "dustedDirtSeen", title: "Dusted Dirt", icon: ITEM_ICONS.dustedDirtSeen }
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
            } else if (e.key === 'snowBookCrafted' && codex.items.snowBookCrafted) {
                showIcon = true;
            }
            
            const label = `§f${maskTitle(title, codex.items[e.key])}`;
            
            // Add icons for known items only
            if (codex.items[e.key] && ITEM_ICONS[e.key]) {
                form.button(label, ITEM_ICONS[e.key]);
            } else {
                form.button(label);
            }
        }
        form.button("§8Back");
        form.show(player).then((res) => {
            if (!res || res.canceled) return openMain();

            // Play page turn sound
            player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 });
            if (res.selection >= 0 && res.selection < entries.length) {
                const e = entries[res.selection];
                const known = codex.items[e.key];
                let body = "§e???";
                if (known) {
                    if (e.key === "snowFound") {
                        const hasBeenInfected = hasInfection;
                        const hasFoundSnow = codex.items.snowFound;
                        const snowKnowledge = getKnowledgeLevel(player, 'snowLevel');
                        const infectionKnowledge = getKnowledgeLevel(player, 'infectionLevel');
                        
                        if (hasBeenInfected && hasFoundSnow && infectionKnowledge >= 1) {
                            body = "§eSnow (Powder)\n§7Risky substance. Leads to symptoms and doom.";
                        } else if (codex.items.snowIdentified && infectionKnowledge >= 1) {
                            body = "§eSnow (Powder)\n§7Risky substance. Leads to symptoms and doom.";
                        } else if (snowKnowledge >= 1) {
                            body = "§eSnow (Powder)\n§7A mysterious white powder. You sense it has properties beyond what you currently understand.";
                        } else {
                            body = "§eUnknown White Substance\n§7A powdery white substance. You have no idea what this could be.";
                        }
                    } else if (e.key === "snowBookCrafted") {
                        // Progressive journal information based on usage
                        const totalKills = (codex.mobs.tinyBearKills || 0) + (codex.mobs.infectedBearKills || 0) + (codex.mobs.infectedPigKills || 0) + (codex.mobs.infectedCowKills || 0) + (codex.mobs.buffBearKills || 0) +
                            (codex.mobs.flyingBearKills || 0) + (codex.mobs.miningBearKills || 0) + (codex.mobs.torpedoBearKills || 0);
                        const totalInfections = codex.history.totalInfections || 0;
                        
                        if (totalKills < 5 && totalInfections === 0) {
                            // Basic journal info
                            body = "§ePowdery Journal\n§7A leather-bound journal that documents your discoveries about the mysterious outbreak.\n\n§7Basic Features:\n§7• Tracks infection status\n§7• Records basic mob information\n§7• Simple discovery logging\n\n§7This journal appears to update itself with new information as you make discoveries.";
                        } else if (totalKills < 25 || totalInfections < 2) {
                            // Intermediate journal info
                            body = "§ePowdery Journal\n§7A sophisticated journal that automatically documents your experiences with the mysterious outbreak.\n\n§7Enhanced Features:\n§7• Tracks infection status and progression\n§7• Records symptoms and effects observed\n§7• Documents mob encounters and analysis\n§7• Maintains detailed logs of discoveries\n§7• Provides basic analysis of substances\n\n§7The journal's behavior suggests it may be more than a simple book. Its true nature remains mysterious.";
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
                            body = "§eCure Components\n§7A combination of items that can reverse bear infections when used together.\n\n§7For Bear Infection:\n§7• Weakness Potion: Temporarily weakens the infection\n§7• Enchanted Golden Apple: Provides healing energy\n§7• Must be consumed while under weakness effect\n\n§7Mechanism:\n§7• Weakness reduces infection strength\n§7• Golden apple provides healing energy\n§7• Combined effect neutralizes infection\n\n§7Notes:\n§7• Bear infection can be cured with proper timing\n§7• Snow infection has no known cure\n§7• Immunity is granted after successful cure\n§7• Cure process is irreversible once begun\n\n§aCure knowledge is precious - use it wisely.";
                        } else {
                            // Expert cure info
                            body = "§eCure Components\n§7A sophisticated combination of items that can reverse bear infections through precise biochemical manipulation.\n\n§6For Bear Infection:\n§7• Weakness Potion: Creates temporary vulnerability in infection\n§7• Enchanted Golden Apple: Provides concentrated healing energy\n§7• Critical Timing: Must be consumed while under weakness effect\n\n§6Scientific Mechanism:\n§7• Weakness potion disrupts infection's cellular binding\n§7• Golden apple energy overwhelms infection's defenses\n§7• Combined effect creates complete neutralization\n§7• Process triggers temporary immunity response\n\n§6Advanced Notes:\n§7• Bear infection: Curable with proper procedure\n§7• Snow infection: No known cure mechanism\n§7• Immunity duration: 5 minutes after successful cure\n§7• Cure process: Irreversible once initiated\n§7• Failure risk: High if timing is incorrect\n\n§6Expert Analysis:\n§7• Cure mechanism suggests infection has exploitable weaknesses\n§7• Immunity period indicates temporary resistance\n§7• Snow infection's incurability suggests different mechanism\n§7• Cure knowledge represents critical survival information\n\n§aMastery of cure techniques is essential for long-term survival.";
                        }
                    } else if (e.key === "potionsSeen") {
                        // Progressive potion information
                        if (codex.items.weaknessPotionSeen) {
                            body = "§ePotions\n§7Alchemical concoctions that can alter biological processes. Some may have applications in treating infections.\n\n§7Known Types:\n§7• Weakness Potion: Creates temporary vulnerability\n§7• Various other effects available\n\n§7Weakness Potion Analysis:\n§7• Reduces physical capabilities temporarily\n§7• Creates vulnerability in biological systems\n§7• May weaken infection's cellular binding\n§7• Timing of application is critical\n§7• Shows promise in therapeutic applications\n\n§7Research Notes:\n§7• Potions can be brewed using a brewing stand\n§7• Weakness potions may have therapeutic applications\n§7• Timing of consumption appears critical\n§7• Combined with other items, may create curative effects\n\n§eFurther research into potion applications is ongoing.";
                        } else {
                            body = "§ePotions\n§7Alchemical concoctions that can alter biological processes. Some may have applications in treating infections.\n\n§7Basic Information:\n§7• Can be brewed using a brewing stand\n§7• Various effects available\n§7• May have therapeutic applications\n\n§8Note: Specific applications require further research.";
                        }
                    } else if (e.key === "goldenAppleSeen") {
                        // Golden apple information with unlockable infection reduction info
                        const hasDiscoveredReduction = codex.items.goldenAppleInfectionReductionDiscovered;
                        
                        body = "§eGolden Apple\n§7A rare fruit with powerful healing properties. Its golden nature suggests it contains concentrated life energy.\n\n§7Properties:\n§7• Provides significant healing\n§7• Contains concentrated life energy";
                        
                        if (hasDiscoveredReduction) {
                            body += "\n§7• Reduces infection severity when consumed while infected\n§7• Provides temporary relief from infection symptoms";
                            body += "\n\n§6Infection Reduction:\n§7• Consuming a golden apple while infected reduces the infection's hold\n§7• The effect is subtle but noticeable\n§7• Does not cure the infection, only reduces its severity\n§7• Multiple apples can provide cumulative relief\n§7• The relief is temporary - the infection continues to progress";
                        } else {
                            body += "\n§7• May have applications in infection treatment";
                        }
                        
                        body += "\n\n§7Research Notes:\n§7• Golden apples are rare and valuable\n§7• Their healing properties are well-documented";
                        
                        if (hasDiscoveredReduction) {
                            body += "\n§7• Has been observed to reduce infection severity\n§7• Not a cure, but provides valuable relief";
                        } else {
                            body += "\n§7• May be useful in combination with other treatments";
                        }
                        
                        body += "\n\n§eThis fruit shows potential in medical applications.";
                    } else if (e.key === "enchantedGoldenAppleSeen") {
                        // Enchanted golden apple information with subtle hints
                        let hintText = "";
                        if (codex.items.weaknessPotionSeen) {
                            hintText = "\n\n§7Research Connection:\n§7• Weakness + Enchanted Golden Apple = Potential Cure\n§7• Timing appears to be critical\n§7• Both components must be present simultaneously";
                        }
                        
                        body = "§eEnchanted Golden Apple\n§7An extremely rare and powerful variant of the golden apple, enhanced with magical properties.\n\n§7Enhanced Properties:\n§7• Superior healing capabilities\n§7• Magical enhancement increases potency\n§7• Contains concentrated life energy\n§7• May have unique therapeutic applications\n\n§7Research Notes:\n§7• Enchanted golden apples are extremely rare\n§7• Their enhanced properties may be crucial for treatment\n§7• May be required for certain medical procedures" + hintText + "\n\n§eThis enhanced fruit may be the key to advanced treatments.";
                    } else if (e.key === "brewingStandSeen") {
                        // Brewing stand information
                        body = "§eBrewing Stand\n§7A specialized apparatus for creating alchemical concoctions. Essential for potion production.\n\n§7Function:\n§7• Allows creation of various potions\n§7• Can produce weakness potions\n§7• Essential for alchemical research\n\n§7Research Applications:\n§7• Weakness potions can be brewed here\n§7• Essential for cure research\n§7• Allows experimentation with different concoctions\n\n§eThis apparatus is crucial for developing treatments.";
                    } else if (e.key === "dustedDirtSeen") {
                        // Enhanced dusted dirt information
                        const currentDay = getCurrentDay ? getCurrentDay() : 0;
                        body = "§eDusted Dirt\n§7A mysterious block covered in white powder. This appears to be the primary spawning ground for Maple Bears.\n\n";
                        
                        body += "§6Properties:\n";
                        body += "§7• Covered in white particulate matter\n";
                        body += "§7• Maple Bears spawn exclusively on this block\n";
                        body += "§7• Spreads when Maple Bears kill mobs\n";
                        body += "§7• Mining toughness similar to regular dirt\n";
                        body += "§7• Can be broken and collected\n\n";
                        
                        body += "§6Spreading Mechanism:\n";
                        body += "§7• When Maple Bears kill mobs, dusted dirt spreads nearby\n";
                        body += "§7• Spread radius increases with day progression\n";
                        body += "§7• Conversion rate increases over time\n";
                        if (currentDay >= 20) {
                            body += "§7• By Day 20+, spread is significantly enhanced\n";
                        }
                        if (currentDay >= 25) {
                            body += "§7• Post-victory: Spread intensifies dramatically\n";
                        }
                        
                        body += "\n§6Research Notes:\n";
                        body += "§7• Origin: Created when Maple Bears kill creatures\n";
                        body += "§7• Also created by placing snow layers on dirt\n";
                        body += "§7• The dust appears to be the same substance as 'Snow'\n";
                        body += "§7• Blocks must have air above them for spawning\n";
                        body += "§7• Spawning occurs within 15-48 blocks of players\n\n";
                        
                        body += "§cWarning: This block is dangerous. Avoid areas with heavy dusted dirt coverage.";
                    }
                }
                new ActionFormData().title(`§6Items: ${known ? e.title : '???'}`).body(body).button("§8Back").show(player).then(() => {
                    player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 });
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
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 });

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
                form.button(`§fDay ${day}`);
            }
        }
        
        form.button("§8Back");
        form.show(player).then((res) => {
            if (!res || res.canceled) return openTimeline();

            // Play page turn sound
            player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 });
            if (res.selection >= 0 && res.selection < daysWithEvents.length) {
                const selectedDay = daysWithEvents[res.selection];
                const dayEvents = codex.dailyEvents[selectedDay];
                
                let body = `§6Day ${selectedDay}\n\n`;

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
                    player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 });
                    openDailyLog();
                });
            } else {
                openMain();
            }
        });
    }
    
    function openBiomes() {
        const codex = getCodex(player);
        const form = new ActionFormData().title("§6Biomes");
        
        let body = "§7Biomes discovered:\n\n";
        
        const biomeKnowledge = getKnowledgeLevel(player, 'biomeLevel');

        if (codex.biomes.infectedBiomeSeen) {
            if (biomeKnowledge >= 2) {
                // Advanced knowledge - show detailed biome data
                body += "§fInfected Biome\n§7A corrupted landscape where the Maple Bear infection thrives. The ground is covered in a layer of white dust, and the very air feels heavy with an unsettling presence.\n\n";

                // Show biome infection data if available
                if (codex.biomeData && codex.biomeData.mb_infected_biome) {
                    const biomeData = codex.biomeData.mb_infected_biome;
                    const avgInfection = biomeData.visitCount > 0 ? Math.round(biomeData.totalInfectionSeen / biomeData.visitCount) : 0;

                    body += `§6Infection Analysis:\n`;
                    body += `§7Visits: §f${biomeData.visitCount}\n`;
                    body += `§7Average Infection Level: §f${avgInfection}/10\n`;
                    body += `§7Peak Infection Observed: §f${biomeData.maxInfectionLevel}/10\n`;

                    if (biomeKnowledge >= 3) {
                        body += `\n§6Expert Notes:\n§7This biome appears to be the epicenter of the infection. The white dust seems to be both a symptom and a vector of the corruption.`;
                    }
                }
            } else if (biomeKnowledge >= 1) {
                // Basic knowledge
                body += "§fInfected Biome\n§7A corrupted landscape where strange creatures thrive. The ground is covered in a layer of white dust, and the very air feels heavy with an unsettling presence.";
            } else {
                // Minimal knowledge
                body += "§fCorrupted Biome\n§7You've discovered a strange area where the land itself seems wrong. White dust covers the ground, and you feel uneasy here.";
            }
        } else {
            body += "§8No biomes discovered yet.";
        }
        
        form.body(body);
        form.button("§8Back");
        form.show(player).then((res) => {
            openMain();
        });
    }

    function openLateLore() {
        const codex = getCodex(player);
        const entries = [];

        if (codex.journal?.day20WorldLoreUnlocked) {
            entries.push({
                id: "world",
                title: "Day 20: World Memory",
                summary: "How the land feels beneath the dust.",
                body: "§eWorld Memory (Day 20)\n§7The air clings with powdered frost, and every echo feels rehearsed. Survivors whisper that the dust remembers our footsteps, retracing mistakes no one recalls making. The journal insists the world is keeping score."
            });
        }
        if (codex.journal?.day20TinyLoreUnlocked) {
            entries.push({
                id: "tiny",
                title: "Tiny Vanguard",
                summary: "The small bears with sharpened intent.",
                body: "§eTiny Vanguard\n§7The smallest Maple Bears no longer scatter at lanternlight. Their paws carve thin white lines through the snow, and packs of them move with a choreographed urgency. Whatever guides them now is patient, and it keeps count."
            });
        }
        if (codex.journal?.day20InfectedLoreUnlocked) {
            entries.push({
                id: "infected",
                title: "Hollow Procession",
                summary: "What the infected leave behind.",
                body: "§eHollow Procession\n§7Infected Maple Bears move like pallbearers. Dust rolls off their shoulders in slow curtains, blanketing ground that never thaws. They hum without voices, and livestock fall silent long before they arrive."
            });
        }
        if (codex.journal?.day20BuffLoreUnlocked) {
            entries.push({
                id: "buff",
                title: "Skybreaker",
                summary: "Notes on the heaviest footsteps.",
                body: "§eSkybreaker\n§7Buff Maple Bears clear the treeline in a single bound now. When they land, snow shivers off nearby hills, and the dust swarms back into place as if the wind itself obeys them. Standing your ground only teaches them where to land next."
            });
        }

        const form = new ActionFormData().title("§6Late Lore");
        form.body(entries.length > 0 ? "§7Recovered observations:" : "§7No late entries recorded yet.");

        for (const entry of entries) {
            form.button(`§f${entry.title}\n§8${entry.summary}`);
        }
        form.button("§8Back");

        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === entries.length) {
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 });
                return openMain();
            }

            const entry = entries[res.selection];
            player.playSound("mb.codex_turn_page", { pitch: 0.9, volume: 0.7 });
            new ActionFormData()
                .title(`§6Late Lore: ${entry.title}`)
                .body(`${entry.body}\n\n§8The journal records what we would rather forget.`)
                .button("§8Back")
                .show(player)
                .then(() => {
                    player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 });
                    openLateLore();
                });
        }).catch(() => { openMain(); });
    }

    function openTimeline() {
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
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 });
                return openMain();
            }
            
            player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 });
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
            { day: 13, name: "Buff Bears arrive", reached: currentDay >= 13 },
            { day: 20, name: "Escalation begins", reached: currentDay >= 20 },
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
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 });
                return openTimeline();
            }
            player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 });
            openTimeline();
        }).catch(() => { openTimeline(); });
    }

    function openAchievements() {
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
            
            // Show milestone achievements
            const milestones = [30, 35, 40, 45, 50];
            for (const milestone of milestones) {
                const milestoneKey = `day${milestone}Survived`;
                if (achievements[milestoneKey]) {
                    body += `§a✓ Day ${milestone} Survived\n`;
                } else if (achievements.maxDaysSurvived >= milestone) {
                    body += `§a✓ Day ${milestone} Survived\n`;
                } else {
                    body += `§8✗ Day ${milestone} Survived\n`;
                }
            }
        } else if (achievements.maxDaysSurvived) {
            body += `§7Maximum Days Survived: §f${achievements.maxDaysSurvived}\n`;
        }
        
        const form = new ActionFormData().title("§6Achievements").body(body).button("§8Back");
        form.show(player).then((res) => {
            if (!res || res.canceled) {
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 });
                return openMain();
            }
            player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 });
            return openMain();
        }).catch(() => { openMain(); });
    }

    function openDeveloperTools() {
        const options = [
            { label: "§fReset My Codex", action: () => triggerDebugCommand("reset_codex") },
            { label: "§fReset World Day to 1", action: () => triggerDebugCommand("reset_day") },
            { label: "§fSet Day...", action: () => promptSetDay() },
            { label: "§fSpawn Difficulty", action: () => openSpawnDifficultyMenu() }
        ];

        const form = new ActionFormData().title("§cDeveloper Tools");
        form.body("§7Debug utilities:");
        for (const opt of options) {
            form.button(opt.label);
        }
        form.button("§8Back");

        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === options.length) {
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 });
                return openMain();
            }

            const chosen = options[res.selection];
            if (chosen) {
                player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 });
                chosen.action();
            } else {
                openDeveloperTools();
            }
        });
    }

    function getSpawnDifficultyLabel(value) {
        if (value === -1) return "Easy";
        if (value === 0) return "Normal";
        if (value === 1) return "Hard";
        return value > 0 ? `Custom (+${value})` : `Custom (${value})`;
    }

    function openSpawnDifficultyMenu() {
        const currentRaw = Number(world.getDynamicProperty(SPAWN_DIFFICULTY_PROPERTY) ?? 0);
        const label = getSpawnDifficultyLabel(currentRaw);
        const form = new ActionFormData()
            .title("§cSpawn Difficulty")
            .body(`§7Current Setting: §f${label}\n§7Value: §f${currentRaw}\n\n§8Adjust how aggressively Maple Bears spawn.\n§8Custom values range from §f-5 (calm)§8 to §f+5 (relentless).`);

        form.button("§aEasy (-1)");
        form.button("§fNormal (0)");
        form.button("§cHard (+1)");
        form.button("§eCustom Value");
        form.button("§8Back");

        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === 4) {
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 });
                return openDeveloperTools();
            }

            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 });
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
                player.sendMessage("§7[MBI] Invalid difficulty value.");
                return openSpawnDifficultyMenu();
            }

            if (parsed < -5 || parsed > 5) {
                player.sendMessage("§7[MBI] Enter a value between -5 (calm) and +5 (relentless).");
                return openSpawnDifficultyMenu();
            }

            triggerDebugCommand("set_spawn_difficulty_value", [String(parsed)], () => openSpawnDifficultyMenu());
        }).catch(() => openSpawnDifficultyMenu());
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
                player?.sendMessage?.("§7[MBI] Failed to send debug command. See log.");
            }
        } catch (err) {
            console.warn("[MBI] Failed to prepare debug command payload:", err);
            player?.sendMessage?.("§7[MBI] Failed to send debug command.");
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
                player.sendMessage("§7[MBI] Invalid day number.");
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
        form.button("§fTorpedo AI");
        form.button("§fFlying AI");
        form.button("§fSpawn Controller");
        form.button("§fMain Script");
        form.button("§8Back");

        form.show(player).then((res) => {
            if (!res || res.canceled) {
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 });
                return openMain();
            }

            if (res.selection === 5) {
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 });
                return openMain();
            }

            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 });
            switch (res.selection) {
                case 0: return openMiningDebugMenu(settings);
                case 1: return openTorpedoDebugMenu(settings);
                case 2: return openFlyingDebugMenu(settings);
                case 3: return openSpawnDebugMenu(settings);
                case 4: return openMainDebugMenu(settings);
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
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 });
                return openDebugMenu();
            }

            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 });
            const flags = ["pitfall", "general", "target", "pathfinding", "vertical", "mining", "movement", "stairCreation", "all"];
            if (res.selection < flags.length) {
                const newState = toggleDebugFlag("mining", flags[res.selection]);
                const stateText = newState ? "§aON" : "§cOFF";
                player.sendMessage(`§7[DEBUG] Mining AI ${flags[res.selection]} debug: ${stateText}`);
                // Log to console for confirmation
                console.warn(`[DEBUG MENU] Mining AI ${flags[res.selection]} debug ${newState ? "ENABLED" : "DISABLED"} by ${player.name}`);
            }
                return openMiningDebugMenu(getDebugSettings(player));
        }).catch(() => openDebugMenu());
    }

    function openTorpedoDebugMenu(settings) {
        const torpedo = settings.torpedo || {};
        const form = new ActionFormData().title("§bTorpedo AI Debug");
        form.body(`§7Toggle debug logging for Torpedo Bears:\n\n§8Current settings:\n§7• General: ${torpedo.general ? "§aON" : "§cOFF"}\n§7• Targeting: ${torpedo.targeting ? "§aON" : "§cOFF"}\n§7• Diving: ${torpedo.diving ? "§aON" : "§cOFF"}\n§7• Block Breaking: ${torpedo.blockBreaking ? "§aON" : "§cOFF"}`);
        
        form.button(`§${torpedo.general ? "a" : "c"}General Logging`);
        form.button(`§${torpedo.targeting ? "a" : "c"}Targeting`);
        form.button(`§${torpedo.diving ? "a" : "c"}Diving Mechanics`);
        form.button(`§${torpedo.blockBreaking ? "a" : "c"}Block Breaking`);
        form.button(`§${torpedo.all ? "a" : "c"}Toggle All`);
        form.button("§8Back");

        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === 5) {
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 });
                return openDebugMenu();
            }

            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 });
            const flags = ["general", "targeting", "diving", "blockBreaking", "all"];
            if (res.selection < flags.length) {
                const newState = toggleDebugFlag("torpedo", flags[res.selection]);
                const stateText = newState ? "§aON" : "§cOFF";
                player.sendMessage(`§7[DEBUG] Torpedo AI ${flags[res.selection]} debug: ${stateText}`);
                // Log to console for confirmation
                console.warn(`[DEBUG MENU] Torpedo AI ${flags[res.selection]} debug ${newState ? "ENABLED" : "DISABLED"} by ${player.name}`);
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
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 });
                return openDebugMenu();
            }

            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 });
            const flags = ["general", "targeting", "pathfinding", "all"];
            if (res.selection < flags.length) {
                const newState = toggleDebugFlag("flying", flags[res.selection]);
                const stateText = newState ? "§aON" : "§cOFF";
                player.sendMessage(`§7[DEBUG] Flying AI ${flags[res.selection]} debug: ${stateText}`);
                // Log to console for confirmation
                console.warn(`[DEBUG MENU] Flying AI ${flags[res.selection]} debug ${newState ? "ENABLED" : "DISABLED"} by ${player.name}`);
            }
                return openFlyingDebugMenu(getDebugSettings(player));
        }).catch(() => openMain());
    }

    function openSpawnDebugMenu(settings) {
        const spawn = settings.spawn || {};
        const form = new ActionFormData().title("§bSpawn Controller Debug");
        form.body(`§7Toggle debug logging for Spawn Controller:\n\n§8Current settings:\n§7• General: ${spawn.general ? "§aON" : "§cOFF"}\n§7• Tile Scanning: ${spawn.tileScanning ? "§aON" : "§cOFF"}\n§7• Cache: ${spawn.cache ? "§aON" : "§cOFF"}\n§7• Validation: ${spawn.validation ? "§aON" : "§cOFF"}\n§7• Distance: ${spawn.distance ? "§aON" : "§cOFF"}\n§7• Spacing: ${spawn.spacing ? "§aON" : "§cOFF"}`);
        
        form.button(`§${spawn.general ? "a" : "c"}General Logging`);
        form.button(`§${spawn.tileScanning ? "a" : "c"}Tile Scanning`);
        form.button(`§${spawn.cache ? "a" : "c"}Cache`);
        form.button(`§${spawn.validation ? "a" : "c"}Validation`);
        form.button(`§${spawn.distance ? "a" : "c"}Distance`);
        form.button(`§${spawn.spacing ? "a" : "c"}Spacing`);
        form.button(`§${spawn.all ? "a" : "c"}Toggle All`);
        form.button("§8Back");

        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === 7) {
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 });
                return openDebugMenu();
            }

            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 });
            const flags = ["general", "tileScanning", "cache", "validation", "distance", "spacing", "all"];
            if (res.selection < flags.length) {
                const flagName = flags[res.selection];
                const newState = toggleDebugFlag("spawn", flagName);
                const stateText = newState ? "§aON" : "§cOFF";
                player.sendMessage(`§7[DEBUG] Spawn Controller ${flagName} debug: ${stateText}`);
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
        form.body(`§7Toggle debug logging for Main Script:\n\n§8Current settings:\n§7• Death Events: ${main.death ? "§aON" : "§cOFF"}\n§7• Mob Conversion: ${main.conversion ? "§aON" : "§cOFF"}\n§7• Infection: ${main.infection ? "§aON" : "§cOFF"}`);
        
        form.button(`§${main.death ? "a" : "c"}Death Events`);
        form.button(`§${main.conversion ? "a" : "c"}Mob Conversion`);
        form.button(`§${main.infection ? "a" : "c"}Infection`);
        form.button(`§${main.all ? "a" : "c"}Toggle All`);
        form.button("§8Back");

        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === 4) {
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 });
                return openDebugMenu();
            }

            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 });
            const flags = ["death", "conversion", "infection", "all"];
            if (res.selection < flags.length) {
                const newState = toggleDebugFlag("main", flags[res.selection]);
                const stateText = newState ? "§aON" : "§cOFF";
                player.sendMessage(`§7[DEBUG] Main Script ${flags[res.selection]} debug: ${stateText}`);
                // Log to console for confirmation
                console.warn(`[DEBUG MENU] Main Script ${flags[res.selection]} debug ${newState ? "ENABLED" : "DISABLED"} by ${player.name}`);
            }
                return openMainDebugMenu(getDebugSettings(player));
        }).catch(() => openDebugMenu());
    }

    function openSettings() {
        const settings = getSettings();
        const codex = getCodex(player);
        
        // Get spawn difficulty state
        const spawnValue = getSpawnDifficultyValue();
        let spawnBoostText = "Normal (0)";
        if (spawnValue === -1) spawnBoostText = "Easy (-1)";
        else if (spawnValue === 0) spawnBoostText = "Normal (0)";
        else if (spawnValue === 1) spawnBoostText = "Hard (+1)";
        else if (spawnValue > 0) spawnBoostText = `Custom (+${spawnValue})`;
        else spawnBoostText = `Custom (${spawnValue})`;
        
        const volumeLabels = ["Off", "Low", "High"];
        const bearVolLabel = volumeLabels[settings.bearSoundVolume] || "High";
        const breakVolLabel = volumeLabels[settings.blockBreakVolume] || "High";
        
        let body = `§6Settings\n\n`;
        body += `§7Spawn Boost/Decrease: §f${spawnBoostText}\n`;
        body += `§7Bear Sound Volume: §f${bearVolLabel} (${settings.bearSoundVolume}/2)\n`;
        body += `§7Block Break Volume: §f${breakVolLabel} (${settings.blockBreakVolume}/2)\n`;
        body += `§7Show Search Button: §f${settings.showSearchButton ? "Yes" : "No"}\n\n`;
        body += `§8Adjust these settings to customize your journal experience.`;
        
        const form = new ActionFormData().title("§eSettings").body(body);
        form.button(`§fBear Sounds: ${bearVolLabel}`);
        form.button(`§fBlock Breaking: ${breakVolLabel}`);
        form.button(`§fSearch Button: ${settings.showSearchButton ? "§aShow" : "§cHide"}`);
        form.button("§8Back");
        
        form.show(player).then((res) => {
            if (!res || res.canceled || res.selection === 3) {
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 });
                return openMain();
            }
            
            player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 });
            const codex = getCodex(player);
            const settings = getSettings();
            
            switch (res.selection) {
                case 0: // Bear sound volume
                    settings.bearSoundVolume = (settings.bearSoundVolume + 1) % 3;
                    saveCodex(player, codex);
                    openSettings();
                    break;
                case 1: // Block break volume
                    settings.blockBreakVolume = (settings.blockBreakVolume + 1) % 3;
                    saveCodex(player, codex);
                    openSettings();
                    break;
                case 2: // Search button toggle
                    settings.showSearchButton = !settings.showSearchButton;
                    saveCodex(player, codex);
                    openSettings();
                    break;
                default:
                    openMain();
            }
        }).catch(() => openMain());
    }

    function openSearch() {
        const codex = getCodex(player);
        const modal = new ModalFormData()
            .title("§bSearch")
            .textField("Enter search term", "");
        
        modal.show(player).then((res) => {
            if (!res || res.canceled || !res.formValues?.[0]) {
                player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 });
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
                { key: "snowFound", title: "Snow", section: "Items" },
                { key: "snowIdentified", title: "Snow Identified", section: "Items" },
                { key: "snowBookCrafted", title: "Powdery Journal", section: "Items" },
                { key: "cureItemsSeen", title: "Cure Items", section: "Items" },
                { key: "brewingStandSeen", title: "Brewing Stand", section: "Items" },
                { key: "dustedDirtSeen", title: "Dusted Dirt", section: "Items" }
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
                    player.playSound("mb.codex_turn_page", { pitch: 1.0, volume: 0.8 });
                    return openSearch();
                }
                
                player.playSound("mb.codex_turn_page", { pitch: 1.1, volume: 0.7 });
                const selected = results[res.selection];
                if (selected && selected.action) {
                    selected.action();
                } else {
                    openSearch();
                }
            }).catch(() => openMain());
        }).catch(() => openMain());
    }

    try { openMain(); } catch { }
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
            mining: false,
            movement: false,
            stairCreation: false,
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
        spawn: {
            general: false,
            tileScanning: false,
            cache: false,
            validation: false,
            distance: false,
            spacing: false,
            all: false
        },
        main: {
            death: false,
            conversion: false,
            infection: false,
            all: false
        }
    };
}

// Export debug settings functions for AI scripts
// NOTE: Debug settings ARE persisted across sessions via dynamic properties
export function getDebugSettings(player) {
    try {
        const settingsStr = player.getDynamicProperty("mb_debug_settings");
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
        player.setDynamicProperty("mb_debug_settings", JSON.stringify(settings));
        // Invalidate cache when settings change
        invalidateDebugCache();
    } catch (error) {
        console.warn(`[DEBUG] Error saving debug settings for ${player.name}:`, error);
    }
}

// Helper function to check if any player has a specific debug flag enabled
// Performance: Uses caching to avoid iterating all players on every call
export function isDebugEnabled(category, flag) {
    // Return cached result if available
    if (debugStateCache && debugStateCache[category]?.[flag]) {
        return true;
    }
    
    try {
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
        // Silent fail - debug is optional
    }
    return false;
}