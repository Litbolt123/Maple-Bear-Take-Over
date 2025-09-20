import { system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

export function getDefaultCodex() {
    return {
        infections: { bear: { discovered: false, firstHitAt: 0 }, snow: { discovered: false, firstUseAt: 0 } },
        status: { immuneKnown: false, immuneUntil: 0, bearTimerSeen: false, snowTimerSeen: false },
        cures: { bearCureKnown: false, bearCureDoneAt: 0 },
        history: { totalInfections: 0, totalCures: 0, firstInfectionAt: 0, lastInfectionAt: 0, lastCureAt: 0 },
        symptoms: { weaknessSeen: false, nauseaSeen: false, blindnessSeen: false, slownessSeen: false, hungerSeen: false },
        // Aggregated metadata by effect id
        symptomsMeta: {},
        items: { snowFound: false, snowIdentified: false, snowBookCrafted: false, cureItemsSeen: false, snowTier5Reached: false, snowTier10Reached: false, snowTier20Reached: false, snowTier50Reached: false },
        mobs: { 
            mapleBearSeen: false, 
            infectedBearSeen: false, 
            infectedPigSeen: false, 
            buffBearSeen: false,
            tinyBearKills: 0,
            infectedBearKills: 0,
            infectedPigKills: 0,
            buffBearKills: 0
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
        const entries = [
            { key: "weaknessSeen", title: "Weakness", id: "minecraft:weakness" },
            { key: "nauseaSeen", title: "Nausea", id: "minecraft:nausea" },
            { key: "blindnessSeen", title: "Blindness", id: "minecraft:blindness" },
            { key: "slownessSeen", title: "Slowness", id: "minecraft:slowness" },
            { key: "hungerSeen", title: "Hunger", id: "minecraft:hunger" }
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
        
        for (const e of entries) form.button(`§f${maskTitle(e.title, codex.symptoms[e.key])}`);
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
                    const known = codex.symptoms[e.key];
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
        
        let body = `§eMaximum Snow Level Achieved: §f${maxSnow.maxLevel.toFixed(1)}\n\n`;
        
        // Detailed analysis based on experience
        if (maxSnow.maxLevel >= 5) {
            body += `§7Tier 1 (1-5): §fMild effects\n`;
            body += `§7• Time reduction: 1 min per snow\n`;
            body += `§7• Effects: Mild random potions\n`;
        }
        
        if (maxSnow.maxLevel >= 10) {
            body += `\n§7Tier 2 (6-10): §fModerate effects\n`;
            body += `§7• Time reduction: 5 min per snow\n`;
            body += `§7• Effects: Stronger random potions\n`;
        }
        
        if (maxSnow.maxLevel >= 20) {
            body += `\n§7Tier 3 (11-20): §fSevere effects\n`;
            body += `§7• Time reduction: 10 min per snow\n`;
            body += `§7• Effects: Very strong random potions\n`;
        }
        
        if (maxSnow.maxLevel >= 50) {
            body += `\n§7Tier 4 (20+): §fExtreme effects\n`;
            body += `§7• Time reduction: 15 min per snow\n`;
            body += `§7• Effects: Maximum intensity potions\n`;
        }
        
        // Show current status if infected
        const hasInfection = infectionState && !infectionState.cured && infectionState.ticksLeft > 0;
        
        if (hasInfection) {
            body += `\n§eCurrent Snow Level: §f${currentSnow.toFixed(1)}`;
            if (currentSnow > 0) {
                const tier = currentSnow <= 5 ? 1 : currentSnow <= 10 ? 2 : currentSnow <= 20 ? 3 : 4;
                body += `\n§7Current Tier: §f${tier}`;
            }
        }
        
        // Show warnings based on experience
        if (maxSnow.maxLevel >= 20) {
            body += `\n\n§c⚠ Warning: High snow levels are extremely dangerous!`;
        } else if (maxSnow.maxLevel >= 10) {
            body += `\n\n§e⚠ Caution: Snow effects become severe at higher levels.`;
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
            { key: "infectedPigSeen", title: "Infected Pig", icon: "textures/items/infected_pig_egg", variant: "original" },
            { key: "buffBearSeen", title: "Buff Maple Bear", icon: "textures/items/buff_mb_egg", variant: "original" }
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
                if (e.key === "mapleBearSeen") {
                    killCount = codex.mobs.tinyBearKills || 0;
                } else if (e.key === "infectedBearSeen") {
                    killCount = codex.mobs.infectedBearKills || 0;
                } else if (e.key === "infectedPigSeen") {
                    killCount = codex.mobs.infectedPigKills || 0;
                } else if (e.key === "buffBearSeen") {
                    killCount = codex.mobs.buffBearKills || 0;
                }
                
                if (killCount > 0) {
                    label += ` §7(${killCount})`;
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
                        }
                    } else if (e.variant === "day8") {
                        if (e.key === "mapleBearSeen" && killCount >= 100) {
                            body += `\n\n§6Detailed Analysis:\n§7Drop Rate: 70% chance\n§7Loot: 1-3 snow items\n§7Health: 2 HP\n§7Damage: 2`;
                        } else if (e.key === "infectedBearSeen" && killCount >= 100) {
                            body += `\n\n§6Detailed Analysis:\n§7Drop Rate: 90% chance\n§7Loot: 2-8 snow items\n§7Health: 25 HP\n§7Damage: 4`;
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
        const entries = [
            { key: "snowFound", title: "'Snow' (Powder)" },
            { key: "snowBookCrafted", title: "Powdery Book" },
            { key: "cureItemsSeen", title: "Cure Items" }
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
            if (e.key === 'snowFound' && showIcon) {
                form.button(label, "textures/items/mb_snow");
            } else if (e.key === 'snowBookCrafted' && showIcon) {
                form.button(label, "textures/items/snow_book");
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
                    } else if (e.key === "snowBookCrafted") body = "§ePowdery Book\n§7Keeps track of your discoveries.";
                    else if (e.key === "cureItemsSeen") body = "§eCure Items\n§7Weakness + Enchanted Golden Apple (for Bear).";
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