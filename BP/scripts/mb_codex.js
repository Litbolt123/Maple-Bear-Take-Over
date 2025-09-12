import { system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

export function getDefaultCodex() {
    return {
        infections: { bear: { discovered: false, firstHitAt: 0 }, snow: { discovered: false, firstUseAt: 0 } },
        status: { immuneKnown: false, immuneUntil: 0, bearTimerSeen: false, snowTimerSeen: false },
        cures: { bearCureKnown: false, bearCureDoneAt: 0 },
        symptoms: { weaknessSeen: false, nauseaSeen: false, blindnessSeen: false, slownessSeen: false, hungerSeen: false },
        // Aggregated metadata by effect id
        symptomsMeta: {},
        items: { snowFound: false, snowIdentified: false, snowBookCrafted: false, cureItemsSeen: false },
        mobs: { mapleBearSeen: false, infectedBearSeen: false, buffBearSeen: false }
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
    const { bearInfection, snowInfection, curedPlayers, formatTicksDuration, formatMillisDuration, HITS_TO_INFECT, bearHitCount } = context;
    function maskTitle(title, known) {
        return known ? title : "?".repeat(title.length);
    }
    function buildSummary() {
        const codex = getCodex(player);
        const hasBear = bearInfection.has(player.id) && !bearInfection.get(player.id).cured;
        const hasSnow = snowInfection.has(player.id) && (snowInfection.get(player.id).ticksLeft || 0) > 0;
        const immune = (() => {
            const end = curedPlayers.get(player.id);
            return !!end && Date.now() < end;
        })();
        const summary = [];
        const bearLabel = "Bear";
        const snowLabel = "Snow";
        const typeText = hasBear ? bearLabel : hasSnow ? snowLabel : "None";
        summary.push(`§eType: §f${typeText}`);
        if (hasBear) {
            const bearTicks = bearInfection.get(player.id).ticksLeft || 0;
            const bearDays = Math.ceil(bearTicks / 24000);
            summary.push(`§e${bearLabel}: §c${formatTicksDuration(bearTicks)} (§f~${bearDays} day${bearDays !== 1 ? 's' : ''}§c)`);
            if (getCodex(player).cures.bearCureKnown) summary.push("§7Cure: §fWeakness + Enchanted Golden Apple");
        }
        if (hasSnow) {
            const snowTicks = snowInfection.get(player.id).ticksLeft || 0;
            const snowCount = snowInfection.get(player.id).snowCount || 0;
            summary.push(`§e${snowLabel}: §c${formatTicksDuration(snowTicks)}`);
            if (codex.items.snowIdentified && snowCount > 0) {
                summary.push(`§7Snow Tier: §f${snowCount.toFixed(1)}`);
            }
        }
        
        // Show snow tier for bear infection too (since snow affects bear infection)
        if (hasBear) {
            const snowCount = snowInfection.has(player.id) ? (snowInfection.get(player.id).snowCount || 0) : 0;
            if (codex.items.snowIdentified) {
                summary.push(`§7Snow Tier: §f${snowCount.toFixed(1)}`);
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
        if (hitCount > 0 && !hasBear) summary.push(`§eBear Hits: §f${hitCount}/${HITS_TO_INFECT}`);
        try { if (hasBear) markCodex(player, "status.bearTimerSeen"); if (hasSnow) markCodex(player, "status.snowTimerSeen"); if (immune) markCodex(player, "status.immuneKnown"); } catch {}
        return summary.join("\n");
    }

    function openMain() {
        const form = new ActionFormData().title("§6Powdery Journal");
        form.body(`${buildSummary()}\n\n§eChoose a section:`);
        // Removed My Status button; summary always on main
        form.button("§fInfections");
        form.button("§fSymptoms");
        form.button("§fMobs");
        form.button("§fItems");
        form.show(player).then((res) => {
            if (!res || res.canceled) return;
            const sel = res.selection;
            if (sel === 0) openInfections();
            if (sel === 1) openSymptoms();
            if (sel === 2) openMobs();
            if (sel === 3) openItems();
        }).catch(() => {});
    }

    function openInfections() {
        const codex = getCodex(player);
        const page = new ActionFormData().title("§6Infections");
        const bearName = maskTitle("Bear Infection", codex.infections.bear.discovered);
        const snowName = maskTitle("Snow Infection", codex.infections.snow.discovered);
        page.body("§7Entries:");
        page.button(`§f${bearName}`);
        page.button(`§f${snowName}`);
        page.button("§8Back");
        page.show(player).then((res) => {
            if (!res || res.canceled) return openMain();
            if (res.selection === 0) {
                const lines = [];
                if (codex.infections.bear.discovered) {
                    lines.push("§eBear Infection");
                    lines.push(getCodex(player).cures.bearCureKnown ? "§7Cure: Weakness + Enchanted Golden Apple" : "§8Cure: ???");
                    lines.push("§7Notes: §8Infection advances over time.");
                } else {
                    lines.push("§e???");
                }
                new ActionFormData().title("§6Infections: Bear").body(lines.join("\n")).button("§8Back").show(player).then(() => openInfections());
            } else if (res.selection === 1) {
                const lines = [];
                if (codex.infections.snow.discovered) {
                    lines.push("§eSnow Infection");
                    lines.push("§7Cure: §8None");
                    lines.push("§7Notes: §8Effects vary and time reduces with more use.");
                } else {
                    lines.push("§e???");
                }
                new ActionFormData().title("§6Infections: Snow").body(lines.join("\n")).button("§8Back").show(player).then(() => openInfections());
            } else {
                openMain();
            }
        });
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
        const form = new ActionFormData().title("§6Symptoms");
        form.body("§7Entries:");
        for (const e of entries) form.button(`§f${maskTitle(e.title, codex.symptoms[e.key])}`);
        form.button("§8Back");
        form.show(player).then((res) => {
            if (!res || res.canceled) return openMain();
            if (res.selection >= 0 && res.selection < entries.length) {
                const e = entries[res.selection];
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
        });
    }

    function openMobs() {
        const codex = getCodex(player);
        const entries = [
            { key: "mapleBearSeen", title: "Tiny Maple Bear", icon: "textures/items/mb" },
            { key: "infectedBearSeen", title: "Infected Maple Bear", icon: "textures/items/Infected_human_mb_egg" },
            { key: "buffBearSeen", title: "Buff Maple Bear", icon: "textures/items/buff_mb_egg" }
        ];
        const form = new ActionFormData().title("§6Mobs");
        form.body("§7Entries:");
        for (const e of entries) {
            const label = `§f${maskTitle(e.title, codex.mobs[e.key])}`;
            if (codex.mobs[e.key]) form.button(label, e.icon);
            else form.button(label);
        }
        form.button("§8Back");
        form.show(player).then((res) => {
            if (!res || res.canceled) return openMain();
            if (res.selection >= 0 && res.selection < entries.length) {
                const e = entries[res.selection];
                const known = codex.mobs[e.key];
                const body = known ? `§e${e.title}\n§7Hostile entity involved in the outbreak.` : "§e???";
                new ActionFormData().title(`§6Mobs: ${known ? e.title : '???'}`).body(body).button("§8Back").show(player).then(() => openMobs());
            } else {
                openMain();
            }
        });
    }

    function openItems() {
        const codex = getCodex(player);
        const entries = [
            { key: "snowFound", title: "Snow (Powder)" },
            { key: "snowBookCrafted", title: "Powdery Book" },
            { key: "cureItemsSeen", title: "Cure Items" }
        ];
        const form = new ActionFormData().title("§6Items");
        form.body("§7Entries:");
        for (const e of entries) {
            const title = e.key === 'snowFound' ? (codex.items.snowIdentified ? e.title : 'Unknown White Substance') : e.title;
            const label = `§f${maskTitle(title, codex.items[e.key])}`;
            // Add icons for known items only
            if (e.key === 'snowFound' && codex.items.snowIdentified) {
                form.button(label, "textures/items/mb_snow");
            } else if (e.key === 'snowBookCrafted' && codex.items.snowBookCrafted) {
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
                    if (e.key === "snowFound") body = codex.items.snowIdentified ? "§eSnow (Powder)\n§7Risky substance. Leads to symptoms and doom." : "§eUnknown White Substance\n§7A powdery white substance. Effects unknown.";
                    else if (e.key === "snowBookCrafted") body = "§ePowdery Book\n§7Keeps track of your discoveries.";
                    else if (e.key === "cureItemsSeen") body = "§eCure Items\n§7Weakness + Enchanted Golden Apple (for Bear).";
                }
                new ActionFormData().title(`§6Items: ${known ? e.title : '???'}`).body(body).button("§8Back").show(player).then(() => openItems());
            } else {
                openMain();
            }
        });
    }

    try { openMain(); } catch {}
}