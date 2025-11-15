#!/usr/bin/env node

/**
 * Regenerate the Mining Maple Bear block lists (entity JSON + helper script)
 * from the canonical Bedrock block list generated in data/bedrock_blocks.json.
 */

import fs from "fs";
import path from "path";

const ROOT = path.resolve(".");
const DATA_FILE = path.join(ROOT, "data", "bedrock_blocks.json");
const ENTITY_FILES = [
    path.join(ROOT, "BP", "entities", "mining_mb.json"),
    path.join(ROOT, "BP", "entities", "mining_mb_day20.json")
];
const SCRIPT_OUTPUT = path.join(ROOT, "BP", "scripts", "mb_miningBlockList.js");

const EXCLUDED_BLOCKS = new Set([
    "minecraft:air",
    "minecraft:void_air",
    "minecraft:cave_air",
    "minecraft:barrier",
    "minecraft:light_block",
    "minecraft:allow",
    "minecraft:deny"
]);

const WANTED_BLOCKS = [
    "minecraft:stone",
    "minecraft:cobblestone",
    "minecraft:mossy_cobblestone",
    "minecraft:stone_bricks",
    "minecraft:mossy_stone_bricks",
    "minecraft:cracked_stone_bricks",
    "minecraft:chiseled_stone_bricks",
    "minecraft:granite",
    "minecraft:diorite",
    "minecraft:andesite",
    "minecraft:sand",
    "minecraft:red_sand",
    "minecraft:gravel",
    "minecraft:clay",
    "minecraft:dirt",
    "minecraft:coarse_dirt",
    "minecraft:grass",
    "minecraft:podzol",
    "minecraft:mycelium",
    "minecraft:snow",
    "minecraft:ice",
    "minecraft:packed_ice",
    "minecraft:soul_sand",
    "minecraft:soul_soil",
    "minecraft:netherrack",
    "minecraft:end_stone",
    "minecraft:obsidian",
    "minecraft:oak_log",
    "minecraft:spruce_log",
    "minecraft:birch_log",
    "minecraft:jungle_log",
    "minecraft:acacia_log",
    "minecraft:dark_oak_log",
    "minecraft:oak_planks",
    "minecraft:spruce_planks",
    "minecraft:birch_planks",
    "minecraft:jungle_planks",
    "minecraft:acacia_planks",
    "minecraft:dark_oak_planks",
    "minecraft:oak_leaves",
    "minecraft:spruce_leaves",
    "minecraft:birch_leaves",
    "minecraft:jungle_leaves",
    "minecraft:acacia_leaves",
    "minecraft:dark_oak_leaves",
    "minecraft:glass",
    "minecraft:white_stained_glass",
    "minecraft:orange_stained_glass",
    "minecraft:magenta_stained_glass",
    "minecraft:light_blue_stained_glass",
    "minecraft:yellow_stained_glass",
    "minecraft:lime_stained_glass",
    "minecraft:pink_stained_glass",
    "minecraft:gray_stained_glass",
    "minecraft:light_gray_stained_glass",
    "minecraft:cyan_stained_glass",
    "minecraft:purple_stained_glass",
    "minecraft:blue_stained_glass",
    "minecraft:brown_stained_glass",
    "minecraft:green_stained_glass",
    "minecraft:red_stained_glass",
    "minecraft:black_stained_glass",
    "minecraft:brick_block",
    "minecraft:nether_brick",
    "minecraft:red_nether_brick",
    "minecraft:purpur_block",
    "minecraft:quartz_block",
    "minecraft:sandstone",
    "minecraft:red_sandstone",
    "minecraft:smooth_sandstone",
    "minecraft:smooth_red_sandstone",
    "minecraft:bookshelf",
    "minecraft:hay_block",
    "minecraft:bone_block",
    "minecraft:grass_path",
    "minecraft:farmland",
    "minecraft:scaffolding"
];

function loadBlockTable() {
    if (!fs.existsSync(DATA_FILE)) {
        throw new Error(`Missing ${DATA_FILE}. Run the block-table generator first.`);
    }
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    if (!raw?.blocks || !Array.isArray(raw.blocks)) {
        throw new Error("Invalid bedrock_blocks.json structure.");
    }
    return raw.blocks;
}

function filterBlocks(blocks) {
    const blockSet = new Set(blocks);
    const resolved = [];
    const missing = [];
    for (const id of WANTED_BLOCKS) {
        if (blockSet.has(id)) {
            resolved.push(id);
        } else {
            missing.push(id);
        }
    }

    if (missing.length > 0) {
        console.warn("[updateMiningBlocks] Missing block IDs (check for typos or outdated base list):");
        missing.forEach(id => console.warn(" - " + id));
    }

    return resolved.filter(id => !EXCLUDED_BLOCKS.has(id));
}

function writeScriptFile(blocks) {
    const header = `// AUTO-GENERATED FILE. Run tools/updateMiningBlocks.js to refresh.\n`;
    const exportArray = `export const MINING_BREAKABLE_BLOCKS = ${JSON.stringify(blocks, null, 4)};\n`;
    const exportSet = `export const MINING_BREAKABLE_BLOCK_SET = new Set(MINING_BREAKABLE_BLOCKS);\n`;
    fs.writeFileSync(SCRIPT_OUTPUT, header + exportArray + exportSet, "utf8");
}

function updateEntityFile(filePath, blocks) {
    const entity = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const components = entity?.["minecraft:entity"]?.components;
    if (!components?.["minecraft:break_blocks"]) {
        throw new Error(`Missing minecraft:break_blocks in ${filePath}`);
    }
    components["minecraft:break_blocks"].breakable_blocks = blocks;
    fs.writeFileSync(filePath, JSON.stringify(entity, null, "\t"), "utf8");
}

function main() {
    const allBlocks = loadBlockTable();
    const filtered = filterBlocks(allBlocks);

    writeScriptFile(filtered);
    for (const file of ENTITY_FILES) {
        updateEntityFile(file, filtered);
    }

    console.log(`Updated mining block lists with ${filtered.length} Bedrock block IDs.`);
}

try {
    main();
} catch (error) {
    console.error("[updateMiningBlocks] Failed:", error);
    process.exit(1);
}

