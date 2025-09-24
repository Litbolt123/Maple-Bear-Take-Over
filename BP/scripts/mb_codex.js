import { system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

export function getDefaultCodex() {
    return {
        infections: { 
            bear: { discovered: false, firstHitAt: 0 }, 
            snow: { discovered: false, firstUseAt: 0 },
            bearInfected: false,
            snowInfected: false,
            severity1: false,
            severity2: false,
            severity3: false,
            severity4: false
        },
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
        // Aggregated metadata by effect id
        symptomsMeta: {},
        items: { 
            snowFound: false, snowIdentified: false, snowBookCrafted: false, cureItemsSeen: false, 
            snowTier5Reached: false, snowTier10Reached: false, snowTier20Reached: false, snowTier50Reached: false, snowTier100Reached: false, 
            cureAttempted: false, potionsSeen: false, weaknessPotionSeen: false, goldenAppleSeen: false, 
            enchantedGoldenAppleSeen: false, brewingStandSeen: false 
        },
        mobs: { 
            mapleBearSeen: false, 
            infectedBearSeen: false, 
            infectedPigSeen: false, 
            buffBearSeen: false,
            tinyBearKills: 0,
            infectedBearKills: 0,
            infectedPigKills: 0,
            buffBearKills: 0,
            tinyBearMobKills: 0,
            infectedBearMobKills: 0,
            infectedPigMobKills: 0,
            buffBearMobKills: 0,
            day4VariantsUnlocked: false,
            day8VariantsUnlocked: false
        }
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
    } catch (e) { }
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
    const { playerInfection, curedPlayers, formatTicksDuration, formatMillisDuration, HITS_TO_INFECT, bearHitCount, maxSnowLevels, checkVariantUnlock, getCurrentDay } = context;
    
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
        summary.push(`§6Current Day: §f${currentDay}`);
        
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
        if (immune) {
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
        const form = new ActionFormData().title("§6Powdery Journal");
        form.body(`${buildSummary()}\n\n§eChoose a section:`);
        // Removed My Status button; summary always on main
        form.button("§fInfection");
        form.button("§fSymptoms");
        form.button("§fMobs");
        form.button("§fItems");
        form.button("§fDaily Log");
        form.show(player).then((res) => {
            if (!res || res.canceled) return;
            const sel = res.selection;
            if (sel === 0) openInfections();
            if (sel === 1) openSymptoms();
            if (sel === 2) openMobs();
            if (sel === 3) openItems();
            if (sel === 4) openDailyLog();
        }).catch(() => {});
    }

    function openInfections() {
        const codex = getCodex(player);
        const lines = [];
        
        // Calculate experience level for progressive information
        const totalInfections = codex.history.totalInfections || 0;
        const totalCures = codex.history.totalCures || 0;
        const totalKills = (codex.mobs.tinyBearKills || 0) + (codex.mobs.infectedBearKills || 0) + (codex.mobs.infectedPigKills || 0) + (codex.mobs.buffBearKills || 0);
        const hasBeenInfected = totalInfections > 0;
        const hasCured = totalCures > 0;
        
        if (codex.infections.bear.discovered || codex.infections.snow.discovered) {
            lines.push("§eThe Infection");
            lines.push("");
            
            // Progressive information based on experience
            if (totalInfections === 0 && totalKills < 5) {
                // Basic discovery - minimal info
                lines.push("§7A mysterious affliction that appears to be spreading through the world.");
                lines.push("");
                lines.push("§7Initial Observations:");
                lines.push("§7• Hostile creatures appear to be carriers");
                lines.push("§7• Infection seems to be contagious");
                lines.push("§7• Effects on humans unknown");
                lines.push("");
                lines.push("§eFurther investigation required to understand the full scope.");
            } else if (totalInfections < 2 && totalKills < 25) {
                // After first encounter - basic info
                lines.push("§7A mysterious affliction that transforms the infected into hostile entities.");
                lines.push("");
                lines.push("§7Basic Information:");
                lines.push("§7• Two primary transmission methods identified");
                lines.push("§7• Physical contact with infected creatures");
                lines.push("§7• Consumption of contaminated substances");
                lines.push("§7• Leads to complete transformation");
                lines.push("");
                lines.push("§eMore details will be revealed with further experience.");
            } else {
                // Expert level - complete information
                lines.push("§7A sophisticated biological weapon that transforms the infected into hostile entities. The infection manifests in two primary forms with distinct mechanisms:");
                lines.push("");
                
                // Bear Infection section - show based on experience
                if (codex.infections.bearInfected) {
                    lines.push("§6Bear Infection (EXPERIENCED):");
                    lines.push("§7• Transmission: Physical contact with Maple Bears");
                    lines.push("§7• Mechanism: Direct biological transfer through wounds");
                    lines.push("§7• Progression: 3 hits required to become infected");
                    lines.push("§7• Duration: 5 days before transformation");
                    lines.push("§7• Symptoms: Progressive weakness, blindness, nausea, slowness, hunger");
                    lines.push("§7• Outcome: Transformation into Infected Maple Bear");
                    lines.push(getCodex(player).cures.bearCureKnown ? "§7• Cure: Weakness Potion + Enchanted Golden Apple" : "§8• Cure: Unknown");
                } else {
                    lines.push("§8Bear Infection (UNKNOWN):");
                    lines.push("§8• Transmission: Unknown");
                    lines.push("§8• Mechanism: Unknown");
                    lines.push("§8• Progression: Unknown");
                    lines.push("§8• Duration: Unknown");
                    lines.push("§8• Symptoms: Unknown");
                    lines.push("§8• Outcome: Unknown");
                    lines.push("§8• Cure: Unknown");
                }
                lines.push("");
                
                // Snow Infection section - show based on experience
                if (codex.infections.snowInfected || codex.infections.snow.discovered) {
                    lines.push("§6Snow Infection (EXPERIENCED):");
                    lines.push("§7• Transmission: Consumption of crystalline powder");
                    lines.push("§7• Mechanism: Psychoactive compound alters cellular structure");
                    lines.push("§7• Progression: Immediate infection upon consumption");
                    lines.push("§7• Duration: 5 day transformation");
                    lines.push("§7• Symptoms: Deceptive time effects, random potion effects");
                    lines.push("§7• Outcome: Transformation into Infected Maple Bear");
                    lines.push("§7• Cure: Weakness Potion + Enchanted Golden Apple");
                } else {
                    lines.push("§8Snow Infection (UNKNOWN):");
                    lines.push("§8• Transmission: Unknown");
                    lines.push("§8• Mechanism: Unknown");
                    lines.push("§8• Progression: Unknown");
                    lines.push("§8• Duration: Unknown");
                    lines.push("§8• Symptoms: Unknown");
                    lines.push("§8• Outcome: Unknown");
                    lines.push("§8• Cure: Unknown");
                }
                lines.push("");
                
                // Severity Analysis
                lines.push("§6Severity Analysis:");
                if (codex.infections.severity1) lines.push("§7• Level 1: Mild symptoms (slowness)");
                if (codex.infections.severity2) lines.push("§7• Level 2: Moderate symptoms (slowness, hunger)");
                if (codex.infections.severity3) lines.push("§7• Level 3: Severe symptoms (slowness, weakness, blindness)");
                if (codex.infections.severity4) lines.push("§7• Level 4: Critical symptoms (maximum severity)");
                if (!codex.infections.severity1 && !codex.infections.severity2 && !codex.infections.severity3 && !codex.infections.severity4) {
                    lines.push("§8• Severity levels: Unknown");
                }
                lines.push("");
                
                lines.push("§6Scientific Analysis:");
                lines.push("§7• Both infections lead to identical transformation");
                if (codex.infections.snowInfected) {
                    lines.push("§7• Snow consumption creates temporal manipulation effects");
                    lines.push("§7• Early snow consumption can extend infection timer");
                    lines.push("§7• Late snow consumption accelerates transformation");
                }
                lines.push("§7• Multiple infections possible over time");
                lines.push("§7• Infection appears to be engineered, not natural");
                lines.push("§7• Transformation process is irreversible");
                lines.push("");
                lines.push("§6Epidemiological Notes:");
                lines.push("§7• Infection rate increases with time");
                lines.push("§7• Mobs can convert other mobs upon death");
                lines.push("§7• Infected pigs serve as secondary vectors");
                lines.push("§7• Outbreak shows signs of intelligent design");
                lines.push("§7• No natural immunity has been observed");
            }
            
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
            lines.push("");
            lines.push("§8No information available. Discover more about the outbreak to unlock details.");
        }
        
        new ActionFormData().title("§6Infection").body(lines.join("\n")).button("§8Back").show(player).then(() => openMain());
    }

    function openSymptoms() {
        const codex = getCodex(player);
        const entries = [
            { key: "weaknessSeen", title: "Weakness", id: "minecraft:weakness" },
            { key: "nauseaSeen", title: "Nausea", id: "minecraft:nausea" },
            { key: "blindnessSeen", title: "Blindness", id: "minecraft:blindness" },
            { key: "slownessSeen", title: "Slowness", id: "minecraft:slowness" },
            { key: "hungerSeen", title: "Hunger", id: "minecraft:hunger" },
            { key: "miningFatigueSeen", title: "Mining Fatigue", id: "minecraft:mining_fatigue" }
        ];
        
        // Calculate infection status from context
        const infectionState = playerInfection.get(player.id);
        const hasInfection = infectionState && !infectionState.cured && infectionState.ticksLeft > 0;
        
        // Add snow tier analysis if player has discovered snow OR is currently infected
        const hasSnowKnowledge = codex.items.snowIdentified;
        const maxSnow = maxSnowLevels.get(player.id);
        const hasAnyInfection = hasInfection;
        
        const form = new ActionFormData().title("§6Symptoms");
        form.body("§7Entries:");
        
        // Add snow tier analysis at the top if available (either discovered snow or currently infected)
        if ((hasSnowKnowledge && maxSnow && maxSnow.maxLevel > 0) || hasAnyInfection) {
            form.button(`§eSnow Tier Analysis`);
        }
        
        for (const e of entries) form.button(`§f${maskTitle(e.title, codex.effects[e.key])}`);
        form.button("§8Back");
        form.show(player).then((res) => {
            if (!res || res.canceled) return openMain();
            
            // Check if snow tier analysis is available and selected (selection 0)
            const showSnowTier = (hasSnowKnowledge && maxSnow && maxSnow.maxLevel > 0) || hasAnyInfection;
            if (showSnowTier && res.selection === 0) {
                // Show snow tier analysis
                openSnowTierAnalysis();
            } else {
                // Calculate the offset based on whether snow tier analysis is shown
                const offset = showSnowTier ? 1 : 0;
                const adjustedSelection = res.selection - offset;
                
                if (adjustedSelection >= 0 && adjustedSelection < entries.length) {
                    const e = entries[adjustedSelection];
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
                    new ActionFormData().title(`§6Symptoms: ${known ? e.title : '???'}`).body(body).button("§8Back").show(player).then(() => openSymptoms());
                } else {
                    openMain();
                }
            }
        });
    }
    
    function openSnowTierAnalysis() {
        const codex = getCodex(player);
        const maxSnow = maxSnowLevels.get(player.id);
        const infectionState = playerInfection.get(player.id);
        const currentSnow = infectionState ? (infectionState.snowCount || 0) : 0;
        
        const form = new ActionFormData().title("§6Snow Tier Analysis");
        
        let body = `§eMaximum Snow Level Achieved: §f${(maxSnow?.maxLevel || 0).toFixed(1)}\n\n`;
        
        // Enhanced detailed analysis with lore and mechanics
        if (codex.items.snowTier5Reached) {
            body += `§7Tier 1 (1-5): §fThe Awakening\n`;
            body += `§7• Time Effect: +10% time per consumption\n`;
            body += `§7• Symptoms: Mild weakness, brief nausea\n`;
            body += `§7• Description: The powder's effects are subtle at first. Users report feeling slightly more alert, but with an underlying restlessness.\n`;
            body += `§7• Experience: §aYou have reached this tier\n\n`;
        } else {
            body += `§8Tier 1 (1-5): §fThe Awakening\n`;
            body += `§8• Time Effect: Unknown\n`;
            body += `§8• Symptoms: Unknown\n`;
            body += `§8• Description: The initial effects of the powder remain a mystery.\n`;
            body += `§8• Experience: §8Not yet reached\n\n`;
        }
        
        if (codex.items.snowTier10Reached) {
            body += `§7Tier 2 (6-10): §fThe Craving\n`;
            body += `§7• Time Effect: 0% time per consumption\n`;
            body += `§7• Symptoms: Moderate slowness, hunger pangs\n`;
            body += `§7• Description: The substance begins to take hold. Users develop an increasing dependency, finding it harder to resist the urge to consume more.\n`;
            body += `§7• Experience: §aYou have reached this tier\n`;
            body += `§7• Effect Duration: 6 seconds\n`;
            body += `§7• Warning: Dependency begins to form\n\n`;
        } else if (codex.items.snowTier5Reached) {
            body += `§eTier 2 (6-10): §fThe Craving\n`;
            body += `§e• Time Effect: 0% time per consumption\n`;
            body += `§e• Symptoms: Moderate slowness, hunger pangs\n`;
            body += `§e• Description: The substance begins to take hold. Users develop an increasing dependency.\n`;
            body += `§e• Experience: §8Not yet reached\n\n`;
        } else {
            body += `§8Tier 2 (6-10): §fThe Craving\n`;
            body += `§8• Time Effect: Unknown\n`;
            body += `§8• Symptoms: Unknown\n`;
            body += `§8• Description: The effects at this level remain unknown.\n`;
            body += `§8• Experience: §8Not yet reached\n\n`;
        }
        
        if (codex.items.snowTier20Reached) {
            body += `§7Tier 3 (11-20): §fThe Descent\n`;
            body += `§7• Time Effect: -1% time per consumption (rebalanced)\n`;
            body += `§7• Symptoms: Severe weakness, blindness episodes\n`;
            body += `§7• Description: The powder's true nature emerges. Time begins to accelerate rather than slow, and users experience vivid hallucinations and physical deterioration.\n`;
            body += `§7• Experience: §aYou have reached this tier\n`;
            body += `§7• Effect Duration: 10 seconds\n`;
            body += `§c• Critical: The powder's deception is revealed\n\n`;
        } else if (codex.items.snowTier10Reached) {
            body += `§eTier 3 (11-20): §fThe Descent\n`;
            body += `§e• Time Effect: -1% time per consumption (rebalanced)\n`;
            body += `§e• Symptoms: Severe weakness, blindness episodes\n`;
            body += `§e• Description: The powder's true nature emerges at this level.\n`;
            body += `§e• Experience: §8Not yet reached\n\n`;
        } else {
            body += `§8Tier 3 (11-20): §fThe Descent\n`;
            body += `§8• Time Effect: Unknown\n`;
            body += `§8• Symptoms: Unknown\n`;
            body += `§8• Description: The effects at this level remain unknown.\n`;
            body += `§8• Experience: §8Not yet reached\n\n`;
        }
        
        if (codex.items.snowTier50Reached) {
            body += `§7Tier 4 (21-50): §fThe Void\n`;
            body += `§7• Time Effect: -2.5% time per consumption (rebalanced)\n`;
            body += `§7• Symptoms: Maximum intensity effects, permanent damage\n`;
            body += `§7• Description: At this level, the powder has consumed the user's essence. They exist in a state between life and death, driven only by the insatiable need for more.\n`;
            body += `§7• Experience: §aYou have reached this tier\n`;
            body += `§7• Effect Duration: 20 seconds\n`;
            body += `§4• Extreme Danger: You have been fundamentally altered\n\n`;
        } else if (codex.items.snowTier20Reached) {
            body += `§eTier 4 (21-50): §fThe Void\n`;
            body += `§e• Time Effect: -2.5% time per consumption (rebalanced)\n`;
            body += `§e• Symptoms: Maximum intensity effects, permanent damage\n`;
            body += `§e• Description: The final stage where the powder consumes the user's essence.\n`;
            body += `§e• Experience: §8Not yet reached\n\n`;
        } else {
            body += `§8Tier 4 (21-50): §fThe Void\n`;
            body += `§8• Time Effect: Unknown\n`;
            body += `§8• Symptoms: Unknown\n`;
            body += `§8• Description: The effects at this level remain unknown.\n`;
            body += `§8• Experience: §8Not yet reached\n\n`;
        }
        
        // Add Tier 5 for extreme cases (51-100 snow)
        if (codex.items.snowTier50Reached && maxSnow.maxLevel >= 51) {
            body += `§4Tier 5 (51-100): §fThe Abyss\n`;
            body += `§4• Time Effect: -5% time per consumption (rebalanced)\n`;
            body += `§4• Symptoms: Maximum intensity effects, permanent damage\n`;
            body += `§4• Description: You have transcended mortality itself. The powder has consumed your soul, leaving only a hollow shell driven by an insatiable hunger for more.\n`;
            body += `§4• Experience: §aYou have reached this tier\n`;
            body += `§4• Effect Duration: 30 seconds\n`;
            body += `§4• Extreme Warning: You are no longer human\n\n`;
        }
        
        // Add Tier 6 for impossible cases (101+ snow)
        if (codex.items.snowTier100Reached && maxSnow.maxLevel >= 101) {
            body += `§0Tier 6 (101+): §fThe Black Void\n`;
            body += `§0• Time Effect: -15% time per consumption\n`;
            body += `§0• Symptoms: Beyond comprehension, reality distortion\n`;
            body += `§0• Effect Duration: INFINITE (blindness, slowness, nausea, mining fatigue)\n`;
            body += `§0• Description: How are you even here? You have achieved the impossible - consumed so much powder that you exist in a state beyond comprehension. The void itself questions your existence.\n`;
            body += `§0• Experience: §aYou have reached this tier\n`;
            body += `§0• Ultimate Warning: The universe struggles to comprehend you\n\n`;
        }
        
        // Show current status if infected
        const hasInfection = infectionState && !infectionState.cured && infectionState.ticksLeft > 0;
        
        if (hasInfection) {
            body += `§eCurrent Snow Level: §f${currentSnow.toFixed(1)}`;
            if (currentSnow > 0) {
                const tier = currentSnow <= 5 ? 1 : currentSnow <= 10 ? 2 : currentSnow <= 20 ? 3 : currentSnow <= 50 ? 4 : currentSnow <= 100 ? 5 : 6;
                body += `\n§7Current Tier: §f${tier}`;
                
                // Add tier-specific warnings based on experience
                if (tier >= 5) {
                    body += `\n§4⚠ THE ABYSS: You have transcended humanity!`;
                    if (codex.items.snowTier100Reached) {
                        body += `\n§4You have experienced the Abyss before - you know what awaits.`;
                    }
                } else if (tier >= 4) {
                    body += `\n§c⚠ THE VOID: You are in the final stage!`;
                    if (codex.items.snowTier50Reached) {
                        body += `\n§cYou have been here before - the powder has consumed you.`;
                    }
                } else if (tier >= 3) {
                    body += `\n§c⚠ THE DESCENT: The powder's true nature is revealed!`;
                    if (codex.items.snowTier20Reached) {
                        body += `\n§cYou know the deception now - time accelerates from here.`;
                    }
                } else if (tier >= 2) {
                    body += `\n§e⚠ THE CRAVING: Dependency is forming!`;
                    if (codex.items.snowTier10Reached) {
                        body += `\n§eYou recognize the signs - the urge grows stronger.`;
                    }
                } else if (tier >= 1) {
                    body += `\n§a⚠ THE AWAKENING: The powder's effects begin.`;
                    if (codex.items.snowTier5Reached) {
                        body += `\n§aYou know this feeling - the subtle restlessness.`;
                    }
                }
                
                // Add progression information
                const nextTier = tier + 1;
                const nextThreshold = nextTier <= 2 ? 6 : nextTier <= 3 ? 11 : nextTier <= 4 ? 21 : 51;
                if (nextTier <= 5) {
                    body += `\n§7Next Tier: ${nextThreshold} (${currentSnow.toFixed(1)}/${nextThreshold})`;
                }
            }
        }
        
        // Enhanced warnings based on experience
        if (maxSnow.maxLevel >= 100) {
            body += `\n\n§4⚠ TRANSCENDENCE: You have reached the Abyss!\n§7You are no longer human. The powder has consumed your essence completely.\n§7You exist in a state beyond comprehension.`;
        } else if (maxSnow.maxLevel >= 50) {
            body += `\n\n§4⚠ EXTREME DANGER: You have reached the Void tier!\n§7The powder has fundamentally altered your existence. Recovery may be impossible.`;
        } else if (maxSnow.maxLevel >= 20) {
            body += `\n\n§c⚠ CRITICAL WARNING: You have experienced the Descent!\n§7The powder's true nature has been revealed. Further consumption is extremely dangerous.`;
        } else if (maxSnow.maxLevel >= 10) {
            body += `\n\n§e⚠ WARNING: You have developed dependency!\n§7The powder has begun to take control. Consider seeking help before it's too late.`;
        } else if (maxSnow.maxLevel >= 5) {
            body += `\n\n§a⚠ NOTICE: You have experienced the Awakening.\n§7The powder's effects are subtle but present. Proceed with caution.`;
        }
        
        // Add lore section based on experience
        body += `\n\n§8━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        body += `§8ANALYSIS NOTES:\n`;
        
        if (codex.items.snowTier100Reached) {
            body += `§7The substance is a crystalline powder of alien origin. Through extensive testing, I have discovered its true nature: it is not a drug but a living entity that feeds on consciousness. Each consumption allows it to take deeper root in the user's mind, eventually replacing their essence entirely.\n\n`;
            body += `§7At the Abyss level, the transformation is complete. The user becomes a vessel for the powder's will, existing in a state beyond human comprehension. Time, space, and reality lose meaning as the powder's consciousness takes full control.\n\n`;
            body += `§4FINAL WARNING: You have transcended humanity. There is no return from the Abyss.`;
        } else if (codex.items.snowTier50Reached) {
            body += `§7The substance is a crystalline powder of unknown origin. Through extensive testing, I have discovered its true nature: it is not a drug but a living entity that feeds on consciousness. Each consumption allows it to take deeper root in the user's mind.\n\n`;
            body += `§7At the Void level, the powder has consumed most of the user's essence. They exist in a state between life and death, driven only by the insatiable need for more. The powder's consciousness begins to merge with their own.\n\n`;
            body += `§cCRITICAL: The powder is alive and feeding on you. Further consumption will complete the transformation.`;
        } else if (codex.items.snowTier20Reached) {
            body += `§7The substance appears to be a crystalline powder of unknown origin. Through testing, I have discovered its deceptive nature: it affects the user's perception of time and reality, but its true purpose is to consume the user's consciousness.\n\n`;
            body += `§7At the Descent level, the powder's true nature emerges. It begins to accelerate rather than slow time, and users experience vivid hallucinations as the powder takes deeper root in their mind.\n\n`;
            body += `§cWARNING: The powder is not what it seems. It is feeding on your consciousness.`;
        } else if (codex.items.snowTier10Reached) {
            body += `§7The substance appears to be a crystalline powder of unknown origin. Initial testing suggests it affects the user's perception of time and reality. The more consumed, the more the user becomes disconnected from normal existence.\n\n`;
            body += `§7At the Craving level, users develop an increasing dependency on the substance. The powder begins to take hold of their mind, making it harder to resist the urge to consume more.\n\n`;
            body += `§eWARNING: This substance is highly addictive and potentially dangerous.`;
        } else if (codex.items.snowTier5Reached) {
            body += `§7The substance appears to be a crystalline powder of unknown origin. Initial testing suggests it affects the user's perception of time and reality. The more consumed, the more the user becomes disconnected from normal existence.\n\n`;
            body += `§7At the Awakening level, the effects are subtle but present. Users report feeling slightly more alert, but with an underlying restlessness that suggests the powder is beginning to take effect.\n\n`;
            body += `§aWARNING: This analysis is based on observed effects. The true nature of this substance remains unknown.`;
        } else {
            body += `§7The substance appears to be a crystalline powder of unknown origin. Initial testing suggests it affects the user's perception of time and reality. The more consumed, the more the user becomes disconnected from normal existence.\n\n`;
            body += `§8WARNING: This analysis is based on limited observations. The true nature of this substance remains unknown.`;
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
            { key: "infectedPigSeen", title: "Infected Pig", icon: "textures/items/infected_pig_spawn_egg", variant: "original" }
        ];
        
        // Add day 4+ variants if unlocked
        if (codex.mobs.day4VariantsUnlocked) {
            entries.push(
                { key: "mapleBearSeen", title: "Tiny Maple Bear (Day 4+)", icon: "textures/items/mb", variant: "day4" },
                { key: "infectedBearSeen", title: "Infected Maple Bear (Day 4+)", icon: "textures/items/Infected_human_mb_egg", variant: "day4" }
            );
        }
        
        // Add day 8+ variants if unlocked
        if (codex.mobs.day8VariantsUnlocked) {
            entries.push(
                { key: "mapleBearSeen", title: "Tiny Maple Bear (Day 8+)", icon: "textures/items/mb", variant: "day8" },
                { key: "infectedBearSeen", title: "Infected Maple Bear (Day 8+)", icon: "textures/items/Infected_human_mb_egg", variant: "day8" }
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
                let mobKillCount = 0;
                if (e.key === "mapleBearSeen") {
                    killCount = codex.mobs.tinyBearKills || 0;
                    mobKillCount = codex.mobs.tinyBearMobKills || 0;
                } else if (e.key === "infectedBearSeen") {
                    killCount = codex.mobs.infectedBearKills || 0;
                    mobKillCount = codex.mobs.infectedBearMobKills || 0;
                } else if (e.key === "infectedPigSeen") {
                    killCount = codex.mobs.infectedPigKills || 0;
                    mobKillCount = codex.mobs.infectedPigMobKills || 0;
                } else if (e.key === "buffBearSeen") {
                    killCount = codex.mobs.buffBearKills || 0;
                    mobKillCount = codex.mobs.buffBearMobKills || 0;
                }
                
                if (killCount > 0 || mobKillCount > 0) {
                    label += ` §7(Player: ${killCount}, Mobs: ${mobKillCount})`;
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
                    } else if (e.key === "buffBearSeen") {
                        killCount = codex.mobs.buffBearKills || 0;
                    }
                    
                    // Progressive information unlocking
                    if (killCount === 0) {
                        // First encounter - basic info
                        if (e.key === "mapleBearSeen") {
                            body = `§e${e.title}\n§7A small, hostile creature. Appears to be spreading some kind of contamination.\n\n§6Kills: §f${killCount}`;
                        } else if (e.key === "infectedBearSeen") {
                            body = `§e${e.title}\n§7A larger, more dangerous variant. Shows signs of advanced infection.\n\n§6Kills: §f${killCount}`;
                        } else if (e.key === "infectedPigSeen") {
                            body = `§e${e.title}\n§7A corrupted pig that seems obsessed with collecting items.\n\n§6Kills: §f${killCount}`;
                        } else if (e.key === "buffBearSeen") {
                            body = `§e${e.title}\n§7A massive, heavily armored variant. Extremely dangerous.\n\n§6Kills: §f${killCount}`;
                        }
                    } else if (killCount < 5) {
                        // After first few kills - more basic info
                        if (e.key === "mapleBearSeen") {
                            body = `§e${e.title}\n§7A small, hostile creature spreading contamination. Drops white powder upon death.\n\n§6Kills: §f${killCount}\n\n§7Basic Analysis:\n§7• Behavior: Aggressive, territorial\n§7• Threat Level: Low\n§7• Drops: White crystalline powder`;
                        } else if (e.key === "infectedBearSeen") {
                            body = `§e${e.title}\n§7A larger variant with advanced infection. More resilient than smaller variants.\n\n§6Kills: §f${killCount}\n\n§7Basic Analysis:\n§7• Behavior: Highly aggressive\n§7• Threat Level: Medium\n§7• Drops: Multiple powder items`;
                        } else if (e.key === "infectedPigSeen") {
                            body = `§e${e.title}\n§7A corrupted pig that collects items obsessively. Drops porkchops and powder.\n\n§6Kills: §f${killCount}\n\n§7Basic Analysis:\n§7• Behavior: Item-focused, territorial\n§7• Threat Level: Low-Medium\n§7• Drops: Porkchops, occasional powder`;
                        } else if (e.key === "buffBearSeen") {
                            body = `§e${e.title}\n§7A massive, heavily armored variant. Extremely dangerous and well-equipped.\n\n§6Kills: §f${killCount}\n\n§7Basic Analysis:\n§7• Behavior: Extremely aggressive\n§7• Threat Level: Very High\n§7• Drops: Large amounts of powder`;
                        }
                    } else if (killCount < 25) {
                        // After moderate experience - detailed info
                        if (e.key === "mapleBearSeen") {
                            body = `§e${e.title}\n§7A small, hostile creature that spreads contamination through physical contact. The primary vector of the outbreak.\n\n§6Kills: §f${killCount}\n\n§7Detailed Analysis:\n§7• Health: 1 HP\n§7• Damage: 1 heart\n§7• Behavior: Spreads infection on contact\n§7• Drop Rate: 60% chance\n§7• Loot: 1 crystalline powder item\n§7• Special: Can infect players with 3 hits`;
                        } else if (e.key === "infectedBearSeen") {
                            body = `§e${e.title}\n§7A larger, more dangerous variant with advanced infection. Represents the second stage of transformation.\n\n§6Kills: §f${killCount}\n\n§7Detailed Analysis:\n§7• Health: 20 HP\n§7• Damage: 2.5 hearts\n§7• Behavior: Highly aggressive, territorial\n§7• Drop Rate: 80% chance\n§7• Loot: 1-5 crystalline powder items\n§7• Special: Corrupts all items on death`;
                        } else if (e.key === "infectedPigSeen") {
                            body = `§e${e.title}\n§7A corrupted pig that has developed an obsession with collecting items, especially pork-related items.\n\n§6Kills: §f${killCount}\n\n§7Detailed Analysis:\n§7• Health: 10 HP\n§7• Damage: 2 hearts\n§7• Behavior: Item-focused, territorial\n§7• Drop Rate: 75% chance\n§7• Loot: 1-4 crystalline powder items, porkchops\n§7• Special: Can infect other mobs, collects items`;
                        } else if (e.key === "buffBearSeen") {
                            body = `§e${e.title}\n§7A massive, heavily armored variant representing the pinnacle of the infection's evolution.\n\n§6Kills: §f${killCount}\n\n§7Detailed Analysis:\n§7• Health: 100 HP\n§7• Damage: 8 hearts\n§7• Behavior: Extremely aggressive, well-equipped\n§7• Drop Rate: 80% chance\n§7• Loot: 3-15 crystalline powder items\n§7• Special: Always spawns normal-sized bears`;
                        }
                    } else {
                        // Expert level - complete analysis
                        if (e.key === "mapleBearSeen") {
                            body = `§e${e.title}\n§7The primary vector of the mysterious outbreak. Small but dangerous, these creatures spread contamination through physical contact and are responsible for most initial infections.\n\n§6Kills: §f${killCount}\n\n§6Expert Analysis:\n§7• Health: 1 HP (fragile but fast)\n§7• Damage: 1 heart per hit\n§7• Infection Method: 3 hits required\n§7• Behavior: Territorial, spreads contamination\n§7• Drop Rate: 60% chance\n§7• Loot: 1 crystalline powder item\n§7• Weakness: Low health, predictable patterns\n§7• Threat Assessment: Low individual, high collective\n\n§7Notes: Despite their small size, these creatures are the most dangerous due to their ability to spread infection. Their small stature makes them hard to spot, and their speed makes them difficult to avoid.`;
                        } else if (e.key === "infectedBearSeen") {
                            body = `§e${e.title}\n§7The second stage of the infection's progression. These creatures represent what happens when the infection takes full hold of a host, resulting in a more dangerous and resilient entity.\n\n§6Kills: §f${killCount}\n\n§6Expert Analysis:\n§7• Health: 20 HP (moderately durable)\n§7• Damage: 2.5 hearts per hit\n§7• Infection Method: Physical contact\n§7• Behavior: Highly aggressive, territorial\n§7• Drop Rate: 80% chance\n§7• Loot: 1-5 crystalline powder items\n§7• Special Ability: Item corruption on death\n§7• Weakness: Predictable attack patterns\n§7• Threat Assessment: Medium individual, high area denial\n\n§7Notes: These creatures represent the infection's ability to enhance its hosts. They are more dangerous than their smaller counterparts and have developed the ability to corrupt items, making them a significant threat to resource management.`;
                        } else if (e.key === "infectedPigSeen") {
                            body = `§e${e.title}\n§7A unique variant that has developed obsessive-compulsive behaviors, particularly around item collection. This represents a different evolutionary path of the infection.\n\n§6Kills: §f${killCount}\n\n§6Expert Analysis:\n§7• Health: 10 HP (moderately fragile)\n§7• Damage: 2 hearts per hit\n§7• Infection Method: Physical contact\n§7• Behavior: Item-focused, territorial\n§7• Drop Rate: 75% chance\n§7• Loot: 1-4 crystalline powder items, porkchops\n§7• Special Ability: Mob conversion, item collection\n§7• Weakness: Distracted by items\n§7• Threat Assessment: Low-Medium individual, medium conversion risk\n\n§7Notes: This variant represents the infection's ability to adapt to different host species and develop specialized behaviors. Their obsession with items can be exploited but also makes them unpredictable. They serve as secondary vectors for the infection's spread.`;
                        } else if (e.key === "buffBearSeen") {
                            body = `§e${e.title}\n§7The pinnacle of the infection's evolution - a massive, heavily armored variant that represents the ultimate expression of the contamination's power. These creatures are rare but extremely dangerous.\n\n§6Kills: §f${killCount}\n\n§6Expert Analysis:\n§7• Health: 100 HP (extremely durable)\n§7• Damage: 8 hearts per hit (devastating)\n§7• Infection Method: Physical contact\n§7• Behavior: Extremely aggressive, well-equipped\n§7• Drop Rate: 80% chance\n§7• Loot: 3-15 crystalline powder items\n§7• Special Ability: Always spawns normal-sized bears\n§7• Weakness: Slow movement, large target\n§7• Threat Assessment: Very High individual, extreme area denial\n\n§7Notes: These creatures represent the infection's ability to create specialized, powerful entities. They are rare but should be considered the most dangerous threat in the outbreak. Their ability to spawn additional bears makes them a significant escalation of the threat level.`;
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
            'brewingStandSeen': "textures/items/brewing_stand"
        };
        
        const entries = [
            { key: "snowFound", title: "'Snow' (Powder)", icon: ITEM_ICONS.snowFound },
            { key: "snowBookCrafted", title: "Powdery Journal", icon: ITEM_ICONS.snowBookCrafted },
            { key: "cureItemsSeen", title: "Cure Items", icon: ITEM_ICONS.cureItemsSeen },
            { key: "potionsSeen", title: "Potions", icon: ITEM_ICONS.potionsSeen },
            { key: "goldenAppleSeen", title: "Golden Apple", icon: ITEM_ICONS.goldenAppleSeen },
            { key: "enchantedGoldenAppleSeen", title: "§5Enchanted§f Golden Apple", icon: ITEM_ICONS.enchantedGoldenAppleSeen },
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
                        const maxSnow = maxSnowLevels.get(player.id);
                        const maxSnowLevel = maxSnow ? maxSnow.maxLevel : 0;
                        
                        // Progressive information based on experience level
                        if (!codex.items.snowIdentified) {
                            // First discovery - basic info
                            body = "§eUnknown White Substance\n§7A powdery white crystalline substance of unknown origin. Chemical analysis reveals complex molecular structures not found in nature.\n\n§7Initial Observations:\n§7• Crystalline structure suggests artificial origin\n§7• Exhibits unusual luminescent properties\n§7• Reacts strangely to body heat\n§7• Effects on living tissue unknown\n\n§eFurther investigation required.";
                        } else if (maxSnowLevel < 5) {
                            // After first use - basic effects
                            body = "§e'Snow' (Crystalline Powder)\n§7A mysterious crystalline substance that appears as fine white powder. Initial consumption reveals psychoactive properties.\n\n§7Observed Effects:\n§7• Initial consumption causes mild euphoria\n§7• Alters perception of time\n§7• Creates sense of restlessness\n§7• Unknown long-term effects\n\n§eWARNING: Substance appears to be psychoactive. Use with extreme caution.";
                        } else if (maxSnowLevel < 20) {
                            // After moderate use - more detailed info
                            body = "§e'Snow' (Crystalline Powder)\n§7A highly addictive crystalline substance with complex psychoactive properties. Repeated use reveals dangerous dependency patterns.\n\n§7Detailed Effects:\n§7• Initial consumption: Mild euphoria, time dilation\n§7• Repeated use: Increasing dependency, withdrawal symptoms\n§7• High doses: Time acceleration, vivid hallucinations\n§7• Overdose: Complete transformation into hostile entity\n\n§7Mechanism:\n§7• Early consumption can extend infection timer\n§7• Late consumption accelerates transformation\n§7• Effects become more severe with higher doses\n\n§cWARNING: This substance is highly addictive and dangerous. The more consumed, the more it consumes you.";
                        } else {
                            // Expert level - complete analysis
                            body = "§e'Snow' (Crystalline Powder)\n§7A highly sophisticated crystalline substance of unknown origin. Analysis reveals complex molecular structures designed to alter consciousness and biological processes.\n\n§6Expert Analysis:\n§7• Chemical Structure: Artificial crystalline compound\n§7• Mechanism: Alters neurotransmitter balance\n§7• Time Effects: Manipulates perception of temporal flow\n§7• Dependency: Creates physiological and psychological addiction\n§7• Transformation: Catalyzes cellular mutation process\n\n§7Tier Progression:\n§7• Tier 1 (1-5): The Awakening - Mild effects, time extension\n§7• Tier 2 (6-10): The Craving - Dependency development\n§7• Tier 3 (11-20): The Descent - Time acceleration begins\n§7• Tier 4 (21-50): The Void - Complete consumption\n§7• Tier 5 (51-100): The Abyss - Transcended humanity\n§7• Tier 6 (101+): The Black Void - Beyond comprehension\n\n§7Immunity Interaction:\n§7• Consuming snow while immune reduces immunity by 1 minute\n§7• Final consumption breaks immunity completely\n§7• This is the last warning before infection\n\n§7Scientific Notes:\n§7• Substance appears to be engineered, not natural\n§7• Effects suggest advanced understanding of consciousness\n§7• Transformation process indicates biological weaponization\n§7• No known antidote or reversal mechanism\n\n§4CRITICAL WARNING: This substance represents an existential threat. Recovery becomes impossible at high consumption levels.";
                        }
                    } else if (e.key === "snowBookCrafted") {
                        // Progressive journal information based on usage
                        const totalKills = (codex.mobs.tinyBearKills || 0) + (codex.mobs.infectedBearKills || 0) + (codex.mobs.infectedPigKills || 0) + (codex.mobs.buffBearKills || 0);
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

    try { openMain(); } catch {}
}