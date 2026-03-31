#!/usr/bin/env node

/**
 * Syncs `minecraft:break_blocks` on mining Maple Bear entities from the **canonical**
 * list in `BP/scripts/mb_miningBlockList.js` (`MINING_BREAKABLE_BLOCKS`).
 *
 * The script list is what `mb_miningAI.js` uses at runtime. Entity JSON must match
 * so vanilla break-block AI and scripts agree.
 *
 * Usage (from repo root): `node tools/updateMiningBlocks.js`
 */

import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT_MODULE = path.join(ROOT, "BP", "scripts", "mb_miningBlockList.js");
const ENTITY_FILES = [
    path.join(ROOT, "BP", "entities", "mining_mb.json"),
    path.join(ROOT, "BP", "entities", "mining_mb_day20.json")
];

async function loadMiningBlockList() {
    const url = pathToFileURL(SCRIPT_MODULE).href;
    const mod = await import(`${url}?update=${Date.now()}`);
    const blocks = mod.MINING_BREAKABLE_BLOCKS;
    if (!Array.isArray(blocks) || blocks.length === 0) {
        throw new Error("mb_miningBlockList.js must export a non-empty MINING_BREAKABLE_BLOCKS array.");
    }
    return blocks;
}

function updateEntityFile(filePath, blocks) {
    const raw = fs.readFileSync(filePath, "utf8");
    const entity = JSON.parse(raw);
    const components = entity?.["minecraft:entity"]?.components;
    if (!components) {
        throw new Error(`No minecraft:entity.components in ${filePath}`);
    }
    if (!components["minecraft:break_blocks"]) {
        components["minecraft:break_blocks"] = { breakable_blocks: [] };
    }
    components["minecraft:break_blocks"].breakable_blocks = blocks;
    fs.writeFileSync(filePath, JSON.stringify(entity, null, "\t"), "utf8");
}

async function main() {
    const blocks = await loadMiningBlockList();
    for (const file of ENTITY_FILES) {
        if (!fs.existsSync(file)) {
            throw new Error(`Missing entity file: ${file}`);
        }
        updateEntityFile(file, blocks);
    }
    console.log(`[updateMiningBlocks] Synced ${blocks.length} breakable block IDs to mining entities.`);
}

main().catch((error) => {
    console.error("[updateMiningBlocks] Failed:", error);
    process.exit(1);
});
