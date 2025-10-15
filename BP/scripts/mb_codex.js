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
            day13VariantsUnlocked: false
        },
        biomes: { infectedBiomeSeen: false }
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
        
        // Add current day
        const currentDay = getCurrentDay ? getCurrentDay() : 0;
        const display = typeof getDayDisplayInfo === 'function' ? getDayDisplayInfo(currentDay) : { color: '§f', symbols: '' };
        summary.push(`${display.color}${display.symbols} Current Day: ${currentDay}`);
        
        // Health status logic
        if (hasInfection) {
            summary.push(`§eStatus: §cINFECTED`);
            const ticks = infectionState.ticksLeft || 0;
            const days = Math.ceil(ticks / 24000);
            const snowCount = infectionState.snowCount || 0;
            summary.push(`§eTime: §c${formatTicksDuration(ticks)} (§f~${days} day${days !== 1 ? 's' : ''}§c)`);
            summary.push(`§eSnow consumed: §c${snowCount}`);
            if (getCodex(player).cures.bearCureKnown) summary.push("§7Cure: §fWeakness + Enchanted Golden Apple");
        } else {
            // Check if player has ever been infected
            const hasBeenInfected = codex.history.totalInfections > 0;
            if (hasBeenInfected) {
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
        const hitCount = bearHitCount.get(player.id) || 0;
        if (hitCount > 0 && !hasInfection) summary.push(`§eBear Hits: §f${hitCount}/${HITS_TO_INFECT}`);
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
            { key: "mapleBearSeen", title: "Tiny Maple Bear", icon: "textures/items/mb", variant: "original" },
            { key: "infectedBearSeen", title: "Infected Maple Bear", icon: "textures/items/Infected_human_mb_egg", variant: "original" },
            { key: "buffBearSeen", title: "Buff Maple Bear", icon: "textures/items/buff_mb_egg", variant: "original" },
            { key: "infectedPigSeen", title: "Infected Pig", icon: "textures/items/infected_pig_spawn_egg", variant: "original" },
            { key: "infectedCowSeen", title: "Infected Cow", icon: "textures/items/infected_cow_egg", variant: "original" }
        ];
        
        // Add day 4+ variants if unlocked
        if (codex.mobs.day4VariantsUnlocked) {
            entries.push(
                { key: "mapleBearSeen", title: "Tiny Maple Bear (Day 4+)", icon: "textures/items/mb", variant: "day4" },
                { key: "infectedBearSeen", title: "Infected Maple Bear (Day 4+)", icon: "textures/items/Infected_human_mb_egg", variant: "day4" },
                { key: "infectedPigSeen", title: "Infected Pig (Day 4+)", icon: "textures/items/infected_pig_spawn_egg", variant: "day4" },
                { key: "infectedCowSeen", title: "Infected Cow (Day 4+)", icon: "textures/items/infected_cow_egg", variant: "day4" },
                { key: "buffBearSeen", title: "Buff Maple Bear (Day 4+)", icon: "textures/items/buff_mb_egg", variant: "day4" }
            );
        }
        
        // Add day 8+ variants if unlocked
        if (codex.mobs.day8VariantsUnlocked) {
            entries.push(
                { key: "mapleBearSeen", title: "Tiny Maple Bear (Day 8+)", icon: "textures/items/mb", variant: "day8" },
                { key: "infectedBearSeen", title: "Infected Maple Bear (Day 8+)", icon: "textures/items/Infected_human_mb_egg", variant: "day8" },
                { key: "infectedPigSeen", title: "Infected Pig (Day 8+)", icon: "textures/items/infected_pig_spawn_egg", variant: "day8" },
                { key: "infectedCowSeen", title: "Infected Cow (Day 8+)", icon: "textures/items/infected_cow_egg", variant: "day8" },
                { key: "buffBearSeen", title: "Buff Maple Bear (Day 8+)", icon: "textures/items/buff_mb_egg", variant: "day8" }
            );
        }
        
        // Add day 13+ variants if unlocked
        if (codex.mobs.day13VariantsUnlocked) {
            entries.push(
                { key: "mapleBearSeen", title: "Tiny Maple Bear (Day 13+)", icon: "textures/items/mb", variant: "day13" },
                { key: "infectedBearSeen", title: "Infected Maple Bear (Day 13+)", icon: "textures/items/Infected_human_mb_egg", variant: "day13" },
                { key: "infectedPigSeen", title: "Infected Pig (Day 13+)", icon: "textures/items/infected_pig_spawn_egg", variant: "day13" },
                { key: "infectedCowSeen", title: "Infected Cow (Day 13+)", icon: "textures/items/infected_cow_egg", variant: "day13" },
                { key: "buffBearSeen", title: "Buff Maple Bear (Day 13+)", icon: "textures/items/buff_mb_egg", variant: "day13" }
            );
        }
        
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
                    // Get kill count
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
                    
                    body = `§e${e.title}\n§7Hostile entity involved in the outbreak.\n\n§6Kills: §f${killCount}`;
                    
                    // Add detailed info based on kill count thresholds
                    if (e.variant === "original") {
                        if (e.key === "mapleBearSeen" && killCount >= 100) {
                            body += `\n\n§6Detailed Analysis:\n§7Drop Rate: 60% chance\n§7Loot: 1 snow item\n§7Health: 1 HP\n§7Damage: 1`;
                        } else if (e.key === "infectedBearSeen" && killCount >= 100) {
                            body += `\n\n§6Detailed Analysis:\n§7Drop Rate: 80% chance\n§7Loot: 1-5 snow items\n§7Health: 20 HP\n§7Damage: 2.5`;
                        } else if (e.key === "infectedPigSeen" && killCount >= 100) {
                            body += `\n\n§6Detailed Analysis:\n§7Drop Rate: 75% chance\n§7Loot: 1-4 snow items\n§7Health: 10 HP\n§7Damage: 2\n§7Special: Can infect other mobs`;
                        } else if (e.key === "buffBearSeen" && killCount >= 10) {
                            body += `\n\n§6Detailed Analysis:\n§7Drop Rate: 80% chance\n§7Loot: 3-15 snow items\n§7Health: 100 HP\n§7Damage: 8`;
                        }
                    } else if (e.variant === "day4") {
                        if (e.key === "mapleBearSeen" && killCount >= 100) {
                            body += `\n\n§6Detailed Analysis:\n§7Drop Rate: 65% chance\n§7Loot: 1-2 snow items\n§7Health: 1.5 HP\n§7Damage: 1.5`;
                        } else if (e.key === "infectedBearSeen" && killCount >= 100) {
                            body += `\n\n§6Detailed Analysis:\n§7Drop Rate: 80% chance\n§7Loot: 1-5 snow items\n§7Health: 20 HP\n§7Damage: 2.5`;
                        } else if (e.key === "infectedPigSeen" && killCount >= 100) {
                            body += `\n\n§6Detailed Analysis:\n§7Drop Rate: 80% chance\n§7Loot: 1-5 snow items\n§7Health: 12 HP\n§7Damage: 2.5\n§7Special: Enhanced infection spread`;
                        } else if (e.key === "infectedCowSeen" && killCount >= 100) {
                            body += `\n\n§6Detailed Analysis:\n§7Drop Rate: 85% chance\n§7Loot: 2-6 snow items\n§7Health: 15 HP\n§7Damage: 3\n§7Special: Improved conversion rate`;
                        } else if (e.key === "buffBearSeen" && killCount >= 10) {
                            body += `\n\n§6Detailed Analysis:\n§7Drop Rate: 85% chance\n§7Loot: 4-18 snow items\n§7Health: 120 HP\n§7Damage: 10\n§7Special: Enhanced combat abilities`;
                        }
                    } else if (e.variant === "day8") {
                        if (e.key === "mapleBearSeen" && killCount >= 100) {
                            body += `\n\n§6Detailed Analysis:\n§7Drop Rate: 70% chance\n§7Loot: 1-3 snow items\n§7Health: 2 HP\n§7Damage: 2`;
                        } else if (e.key === "infectedBearSeen" && killCount >= 100) {
                            body += `\n\n§6Detailed Analysis:\n§7Drop Rate: 90% chance\n§7Loot: 2-8 snow items\n§7Health: 25 HP\n§7Damage: 4`;
                        } else if (e.key === "infectedPigSeen" && killCount >= 100) {
                            body += `\n\n§6Detailed Analysis:\n§7Drop Rate: 90% chance\n§7Loot: 2-8 snow items\n§7Health: 15 HP\n§7Damage: 3.5\n§7Special: Maximum infection spread`;
                        } else if (e.key === "infectedCowSeen" && killCount >= 100) {
                            body += `\n\n§6Detailed Analysis:\n§7Drop Rate: 95% chance\n§7Loot: 3-10 snow items\n§7Health: 20 HP\n§7Damage: 4\n§7Special: Maximum conversion rate`;
                        } else if (e.key === "buffBearSeen" && killCount >= 10) {
                            body += `\n\n§6Detailed Analysis:\n§7Drop Rate: 95% chance\n§7Loot: 6-25 snow items\n§7Health: 150 HP\n§7Damage: 12\n§7Special: Ultimate combat abilities`;
                        }
                    } else if (e.variant === "day13") {
                        if (e.key === "mapleBearSeen" && killCount >= 100) {
                            body += `\n\n§6Detailed Analysis:\n§7Drop Rate: 75% chance\n§7Loot: 1-4 snow items\n§7Health: 3 HP\n§7Damage: 3\n§7Special: Enhanced speed and reach`;
                        } else if (e.key === "infectedBearSeen" && killCount >= 100) {
                            body += `\n\n§6Detailed Analysis:\n§7Drop Rate: 95% chance\n§7Loot: 3-12 snow items\n§7Health: 35 HP\n§7Damage: 6\n§7Special: Maximum threat level`;
                        } else if (e.key === "infectedPigSeen" && killCount >= 100) {
                            body += `\n\n§6Detailed Analysis:\n§7Drop Rate: 95% chance\n§7Loot: 3-12 snow items\n§7Health: 18 HP\n§7Damage: 4.5\n§7Special: Ultimate infection spread`;
                        } else if (e.key === "infectedCowSeen" && killCount >= 100) {
                            body += `\n\n§6Detailed Analysis:\n§7Drop Rate: 98% chance\n§7Loot: 4-15 snow items\n§7Health: 25 HP\n§7Damage: 5\n§7Special: Ultimate conversion rate`;
                        } else if (e.key === "buffBearSeen" && killCount >= 10) {
                            body += `\n\n§6Detailed Analysis:\n§7Drop Rate: 98% chance\n§7Loot: 8-30 snow items\n§7Health: 150 HP\n§7Damage: 12\n§7Special: Ultimate combat mastery`;
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
                        
                        if (hasBeenInfected && hasFoundSnow) {
                            body = "§eSnow (Powder)\n§7Risky substance. Leads to symptoms and doom.";
                        } else if (codex.items.snowIdentified) {
                            body = "§eSnow (Powder)\n§7Risky substance. Leads to symptoms and doom.";
                        } else {
                            body = "§eUnknown White Substance\n§7A powdery white substance. Effects unknown.";
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
        
        if (codex.biomes.infectedBiomeSeen) {
            body += "§fInfected Biome\n§7A corrupted landscape where the Maple Bear infection thrives. The ground is covered in a layer of white dust, and the very air feels heavy with an unsettling presence.";
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