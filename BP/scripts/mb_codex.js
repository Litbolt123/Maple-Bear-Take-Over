import { system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

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
        items: { snowFound: false, snowIdentified: false, snowBookCrafted: false, cureItemsSeen: false, snowTier5Reached: false, snowTier10Reached: false, snowTier20Reached: false, snowTier50Reached: false, brewingStandSeen: false, dustedDirtSeen: false },
        mobs: { 
            mapleBearSeen: false, 
            infectedBearSeen: false, 
            infectedPigSeen: false, 
            infectedCowSeen: false,
            buffBearSeen: false,
            tinyBearKills: 0,
            infectedBearKills: 0,
            infectedPigKills: 0,
            infectedCowKills: 0,
            buffBearKills: 0,
            tinyBearMobKills: 0,
            infectedBearMobKills: 0,
            infectedPigMobKills: 0,
            infectedCowMobKills: 0,
            buffBearMobKills: 0,
            tinyBearHits: 0,
            infectedBearHits: 0,
            infectedPigHits: 0,
            infectedCowHits: 0,
            buffBearHits: 0,
            // Day variant unlock tracking
            day4VariantsUnlocked: false,
            day8VariantsUnlocked: false,
            day13VariantsUnlocked: false,
            // Individual bear type unlock flags for Day 4+
            day4VariantsUnlockedTiny: false,
            day4VariantsUnlockedInfected: false,
            day4VariantsUnlockedBuff: false,
            day4VariantsUnlockedOther: false,
            // Individual bear type unlock flags for Day 8+
            day8VariantsUnlockedTiny: false,
            day8VariantsUnlockedInfected: false,
            day8VariantsUnlockedBuff: false,
            day8VariantsUnlockedOther: false,
            // Individual bear type unlock flags for Day 13+
            day13VariantsUnlockedTiny: false,
            day13VariantsUnlockedInfected: false,
            day13VariantsUnlockedBuff: false,
            day13VariantsUnlockedOther: false
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
        if (codex.history.totalInfections >= 5) {
            updateKnowledgeLevel(player, 'infectionLevel', 3); // Expert
        }
    }
    
    // Bear knowledge progression
    const totalBearKills = (codex.mobs.tinyBearKills || 0) + (codex.mobs.infectedBearKills || 0) + (codex.mobs.buffBearKills || 0);
    if (totalBearKills > 0) {
        updateKnowledgeLevel(player, 'bearLevel', 1); // Basic awareness
        if (totalBearKills >= 10) {
            updateKnowledgeLevel(player, 'bearLevel', 2); // Understanding
        }
        if (totalBearKills >= 50) {
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
                default: friendlyName = mobKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
            }
            
            sharedItems.push(`${friendlyName} Discovery`);
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
            sharedItems.push(`Effect Discovery`);
        }
    }
    
    // Share snow effects discoveries
    if (!toCodex.snowEffects) toCodex.snowEffects = {};
    for (const [effectKey, discovered] of Object.entries(fromCodex.snowEffects)) {
        if (discovered && !toCodex.snowEffects[effectKey]) {
            toCodex.snowEffects[effectKey] = discovered;
            hasNewKnowledge = true;
            sharedItems.push(`Snow Effect Discovery`);
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
    
    // Update cooldown tracking
    knowledgeShareCooldowns.set(cooldownKey, { lastShareTime: now, hasSharedBefore: true });
    
    if (hasNewKnowledge) {
        saveCodex(toPlayer, toCodex);
        checkKnowledgeProgression(toPlayer);
        
        // Send special feedback to both players
        fromPlayer.sendMessage(`§7You shared knowledge with §f${toPlayer.name}§7: §a${sharedItems.join(', ')}`);
        toPlayer.sendMessage(`§b${fromPlayer.name} §7shared their knowledge with you: §a${sharedItems.join(', ')}`);
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
    const { playerInfection, curedPlayers, formatTicksDuration, formatMillisDuration, HITS_TO_INFECT, bearHitCount, maxSnowLevels, checkVariantUnlock, getCurrentDay, getDayDisplayInfo } = context;
    
    // Check for variant unlocks when opening the codex
    if (checkVariantUnlock) {
        checkVariantUnlock(player);
    }
    function maskTitle(title, known) {
        return known ? title : "?".repeat(title.length);
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
        
        // Check knowledge progression first
        checkKnowledgeProgression(player);
        
        // Add current day
        const currentDay = getCurrentDay ? getCurrentDay() : 0;
        const display = typeof getDayDisplayInfo === 'function' ? getDayDisplayInfo(currentDay) : { color: '§f', symbols: '' };
        summary.push(`${display.color}${display.symbols} Current Day: ${currentDay}`);
        
        // Health status logic - progressive based on knowledge
        const infectionKnowledge = getKnowledgeLevel(player, 'infectionLevel');
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
        
        try { if (hasInfection) markCodex(player, "status.bearTimerSeen"); if (immune) markCodex(player, "status.immuneKnown"); } catch {}
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
        
        // Biomes section - only if infected biome discovered
        const hasAnyBiomes = codex.biomes.infectedBiomeSeen;
        if (hasAnyBiomes) {
            buttons.push("§fBiomes");
            buttonActions.push(() => openBiomes());
        }
        
        // Daily Log section - always available
        buttons.push("§fDaily Log");
        buttonActions.push(() => openDailyLog());
        
        // Add buttons to form
        for (const button of buttons) {
            form.button(button);
        }
        
        form.show(player).then((res) => {
            if (!res || res.canceled) return;
            const sel = res.selection;
            if (sel >= 0 && sel < buttonActions.length) {
                buttonActions[sel]();
            }
        }).catch(() => {});
    }

    function openInfections() {
        const codex = getCodex(player);
        const lines = [];
        
        if (codex.infections.bear.discovered || codex.infections.snow.discovered) {
            lines.push("§eThe Infection");
            
            // Infection details (status is shown on main page)
            
            lines.push(getCodex(player).cures.bearCureKnown ? "§7Cure: Weakness + Enchanted Golden Apple" : "§8Cure: ???");
            lines.push("§7Notes: §8Infection advances over time. Snow consumption affects the timer.");
            
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
        
        new ActionFormData().title("§6Infection").body(lines.join("\n")).button("§8Back").show(player).then(() => openMain());
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
                    const minDur = meta.minDuration != null ? Math.floor((meta.minDuration||0)/20) : "?";
                    const maxDur = meta.maxDuration != null ? Math.floor((meta.maxDuration||0)/20) : "?";
                    const minAmp = meta.minAmp != null ? meta.minAmp : "?";
                    const maxAmp = meta.maxAmp != null ? meta.maxAmp : "?";
                    const timing = meta.timing || {}; 
                    const timingStr = [ timing.early?`early(${timing.early})`:null, timing.mid?`mid(${timing.mid})`:null, timing.late?`late(${timing.late})`:null ].filter(Boolean).join(", ") || "unknown";
                    const sc = meta.snowCounts || {};
                    const snowStr = [ sc.low?`1-5(${sc.low})`:null, sc.mid?`6-10(${sc.mid})`:null, sc.high?`11+(${sc.high})`:null ].filter(Boolean).join(", ") || "-";
                    body = `§e${e.title}\n§7Sources: §f${srcs}\n§7Duration: §f${minDur}s - ${maxDur}s\n§7Amplifier: §f${minAmp} - ${maxAmp}\n§7Timing: §f${timingStr}\n§7Snow Count: §f${snowStr}`;
                }
                new ActionFormData().title(`§6Infection Symptoms: ${known ? e.title : '???'}`).body(body).button("§8Back").show(player).then(() => openInfectionSymptoms());
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
                new ActionFormData().title(`§6Snow Effects: ${known ? e.title : '???'}`).body(body).button("§8Back").show(player).then(() => openSnowEffects());
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
            { key: "infectedCowSeen", title: "Infected Cow", icon: "textures/items/infected_cow_egg" }
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
                            
                            if (codex.mobs.day4VariantsUnlocked && killCount >= day4Threshold && !isBuffBear) {
                                variantInfo += `\n\n§eDay 4+ Variants:`;
                                hasVariants = true;
                                if (e.key === "mapleBearSeen") {
                                    variantInfo += `\n§7Enhanced: 1.5 HP, 1.5 Damage, 65% drop rate, 1-2 snow items`;
                                } else if (e.key === "infectedBearSeen") {
                                    variantInfo += `\n§7Enhanced: 20 HP, 2.5 Damage, 80% drop rate, 1-5 snow items`;
                                } else if (e.key === "infectedPigSeen") {
                                    variantInfo += `\n§7Enhanced: 12 HP, 2.5 Damage, 80% drop rate, 1-5 snow items\n§7Special: Enhanced infection spread`;
                                } else if (e.key === "infectedCowSeen") {
                                    variantInfo += `\n§7Enhanced: 15 HP, 3 Damage, 85% drop rate, 2-6 snow items\n§7Special: Improved conversion rate`;
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
                                    variantInfo += `\n§7Advanced: 15 HP, 3.5 Damage, 90% drop rate, 2-8 snow items\n§7Special: Maximum infection spread`;
                                } else if (e.key === "infectedCowSeen") {
                                    variantInfo += `\n§7Advanced: 20 HP, 4 Damage, 95% drop rate, 3-10 snow items\n§7Special: Maximum conversion rate`;
                                }
                            }
                            
                            if (codex.mobs.day13VariantsUnlocked && killCount >= day13Threshold) {
                                variantInfo += `\n\n§eDay 13+ Variants:`;
                                hasVariants = true;
                                if (e.key === "mapleBearSeen") {
                                    variantInfo += `\n§7Ultimate: 3 HP, 3 Damage, 75% drop rate, 1-4 snow items\n§7Special: Enhanced speed and reach`;
                                } else if (e.key === "infectedBearSeen") {
                                    variantInfo += `\n§7Ultimate: 35 HP, 6 Damage, 95% drop rate, 3-12 snow items\n§7Special: Maximum threat level`;
                                } else if (e.key === "infectedPigSeen") {
                                    variantInfo += `\n§7Ultimate: 18 HP, 4.5 Damage, 95% drop rate, 3-12 snow items\n§7Special: Ultimate infection spread`;
                                } else if (e.key === "infectedCowSeen") {
                                    variantInfo += `\n§7Ultimate: 25 HP, 5 Damage, 98% drop rate, 4-15 snow items\n§7Special: Ultimate conversion rate`;
                                } else if (e.key === "buffBearSeen") {
                                    variantInfo += `\n§7Ultimate: 150 HP, 12 Damage, 98% drop rate, 8-30 snow items\n§7Special: Ultimate combat mastery`;
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
                            if (codex.mobs.day4VariantsUnlocked || codex.mobs.day8VariantsUnlocked || codex.mobs.day13VariantsUnlocked) {
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
                
                new ActionFormData().title(`§6Mobs: ${known ? e.title : '???'}`).body(body).button("§8Back").show(player).then(() => openMobs());
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
                        const totalKills = (codex.mobs.tinyBearKills || 0) + (codex.mobs.infectedBearKills || 0) + (codex.mobs.infectedPigKills || 0) + (codex.mobs.infectedCowKills || 0) + (codex.mobs.buffBearKills || 0);
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
                        // Golden apple information
                        body = "§eGolden Apple\n§7A rare fruit with powerful healing properties. Its golden nature suggests it contains concentrated life energy.\n\n§7Properties:\n§7• Provides significant healing\n§7• Contains concentrated life energy\n§7• May have applications in infection treatment\n\n§7Research Notes:\n§7• Golden apples are rare and valuable\n§7• Their healing properties are well-documented\n§7• May be useful in combination with other treatments\n\n§eThis fruit shows potential in medical applications.";
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
                        // Dusted dirt information
                        body = "§eDusted Dirt\n§7A mysterious substance that appears to be contaminated with unknown particles.\n\n§7Properties:\n§7• Contains foreign particulate matter\n§7• Appears to be contaminated soil\n§7• May be related to the infection\n\n§7Research Notes:\n§7• Origin unknown\n§7• May be a byproduct of infection\n§7• Requires further investigation\n\n§eThis contaminated material may hold clues about the infection's nature.";
                    }
                }
                new ActionFormData().title(`§6Items: ${known ? e.title : '???'}`).body(body).button("§8Back").show(player).then(() => openItems());
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
                if (!res || res.canceled) return openMain();
                openMain();
            });
            return;
        }
        
        const form = new ActionFormData().title("§6Daily Log");
        form.body("§7Reflections on past days:\n");
        
        // Add buttons for each day with events
        for (const day of daysWithEvents) {
            const events = codex.dailyEvents[day];
            if (events && events.length > 0) {
                form.button(`§fDay ${day}`);
            }
        }
        
        form.button("§8Back");
        form.show(player).then((res) => {
            if (!res || res.canceled) return openMain();
            if (res.selection >= 0 && res.selection < daysWithEvents.length) {
                const selectedDay = daysWithEvents[res.selection];
                const events = codex.dailyEvents[selectedDay];
                
                let body = `§6Day ${selectedDay}\n\n`;
                if (events && events.length > 0) {
                    body += events.join("\n\n");
                } else {
                    body += "§7No significant events recorded for this day.";
                }
                
                new ActionFormData().title(`§6Daily Log: Day ${selectedDay}`).body(body).button("§8Back").show(player).then(() => openDailyLog());
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

    try { openMain(); } catch {}
}