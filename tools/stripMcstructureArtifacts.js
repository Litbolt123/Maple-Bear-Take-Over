/**
 * Remove structure_block / jigsaw blocks baked into .mcstructure exports (scatter worldgen has no processor pass).
 * Usage: node tools/stripMcstructureArtifacts.js [folder]
 * Default folder: BP - Dev/structures/mb/av_plains
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const ARTIFACT_IDS = new Set(["minecraft:structure_block", "minecraft:jigsaw", "jigsaw"]);
const AIR_ID = "minecraft:air";

const repoRoot = join(fileURLToPath(import.meta.url), "..", "..");
const defaultDir = join(repoRoot, "BP - Dev", "structures", "mb", "av_plains");
const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const dryRun = process.argv.includes("--dry-run");
const targetDir = args[0] ? join(process.cwd(), args[0]) : defaultDir;

let nbt;
try {
    nbt = require("prismarine-nbt");
} catch {
    console.error(
        "Missing prismarine-nbt. Run: npm install --save-dev prismarine-nbt\nThen re-run this script."
    );
    process.exit(1);
}

const parseNbt = (buf) =>
    new Promise((resolve, reject) => {
        nbt.parse(buf, "little", (err, root) => {
            if (err) reject(err);
            else resolve(root);
        });
    });

/** @param {unknown} root */
function writeNbt(root) {
    return nbt.writeUncompressed(root, "little");
}

/** @param {unknown} node */
function unwrap(node) {
    if (node && typeof node === "object" && "value" in node) return node.value;
    return node;
}

/** @param {unknown} blockEntry */
function paletteBlockId(blockEntry) {
    const v = unwrap(blockEntry);
    if (!v || typeof v !== "object") return "";
    const name = v.name ?? v.Name;
    if (typeof name === "string") return name;
    return typeof unwrap(name) === "string" ? unwrap(name) : "";
}

/** @returns {unknown[]|null} */
function getPaletteList(structure) {
    if (!structure || typeof structure !== "object") return null;

    const legacy = unwrap(structure.block_palette);
    if (legacy && typeof legacy === "object") {
        const legacyDefault = unwrap(legacy.default);
        const legacyList = legacyDefault ? unwrap(legacyDefault.block_palette) : null;
        if (Array.isArray(legacyList)) return legacyList;
        const nestedLegacy = legacyList?.value?.value;
        if (Array.isArray(nestedLegacy)) return nestedLegacy;
    }

    const palette = unwrap(structure.palette);
    if (!palette || typeof palette !== "object") return null;
    const paletteDefault = unwrap(palette.default);
    if (!paletteDefault || typeof paletteDefault !== "object") return null;
    const blockPalette = unwrap(paletteDefault.block_palette);
    if (Array.isArray(blockPalette)) return blockPalette;
    if (Array.isArray(blockPalette?.value)) return blockPalette.value;
    const nested = blockPalette?.value?.value;
    return Array.isArray(nested) ? nested : null;
}

/** @returns {unknown[]|null} */
function getIndexLayers(structure) {
    if (!structure || typeof structure !== "object") return null;
    const indices = unwrap(structure.block_indices);
    if (Array.isArray(indices)) return indices;
    const nested = indices?.value?.value ?? indices?.value;
    return Array.isArray(nested) ? nested : null;
}

/**
 * @param {unknown} structureNode
 * @returns {{ replaced: number, artifactIndices: number[] }}
 */
function stripStructureCompound(structureNode) {
    const structure = unwrap(structureNode);
    const paletteList = getPaletteList(structure);
    if (!paletteList) {
        return { replaced: 0, artifactIndices: [] };
    }

    /** @type {number[]} */
    const artifactIndices = [];
    let airIndex = -1;
    for (let i = 0; i < paletteList.length; i++) {
        const id = paletteBlockId(paletteList[i]);
        if (id === AIR_ID) airIndex = i;
        if (ARTIFACT_IDS.has(id)) artifactIndices.push(i);
    }
    if (airIndex < 0) airIndex = 0;
    if (artifactIndices.length === 0) {
        return { replaced: 0, artifactIndices: [] };
    }

    const layers = getIndexLayers(structure);
    if (!layers) {
        return { replaced: 0, artifactIndices };
    }

    const artifactSet = new Set(artifactIndices);
    let replaced = 0;
    for (const layer of layers) {
        const arr = unwrap(layer);
        if (!Array.isArray(arr)) continue;
        for (let i = 0; i < arr.length; i++) {
            const idx = unwrap(arr[i]);
            if (typeof idx === "number" && artifactSet.has(idx)) {
                arr[i] = { type: "int", value: airIndex };
                replaced++;
            }
        }
    }

    return { replaced, artifactIndices };
}

async function stripFile(filePath, dryRun) {
    const buf = readFileSync(filePath);
    const root = await parseNbt(buf);
    const rootValue = unwrap(root);
    if (!rootValue || typeof rootValue !== "object") {
        console.warn(`skip (empty root): ${filePath}`);
        return { replaced: 0, artifacts: 0 };
    }

    const structureNode = rootValue.structure;
    const { replaced, artifactIndices } = stripStructureCompound(structureNode);
    if (artifactIndices.length === 0) {
        console.log(`ok (clean): ${filePath}`);
        return { replaced: 0, artifacts: 0 };
    }

    if (replaced === 0) {
        console.log(`palette only (no voxels): ${filePath}`);
        return { replaced: 0, artifacts: artifactIndices.length };
    }

    if (!dryRun) {
        const out = writeNbt(root);
        writeFileSync(filePath, out);
    }
    console.log(`${dryRun ? "would strip" : "stripped"} ${replaced} block(s): ${filePath}`);
    return { replaced, artifacts: artifactIndices.length };
}

function walkMcstructures(dir) {
    /** @type {string[]} */
    const files = [];
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) files.push(...walkMcstructures(p));
        else if (extname(name) === ".mcstructure") files.push(p);
    }
    return files;
}

const files = walkMcstructures(targetDir);
if (files.length === 0) {
    console.error(`No .mcstructure files in ${targetDir}`);
    process.exit(1);
}

async function main() {
    let totalReplaced = 0;
    for (const file of files) {
        try {
            const { replaced } = await stripFile(file, dryRun);
            totalReplaced += replaced;
        } catch (err) {
            console.error(`FAIL ${file}: ${err?.message ?? err}`);
            process.exitCode = 1;
        }
    }

    console.log(
        `${dryRun ? "Dry run —" : "Done —"} ${files.length} file(s), ${totalReplaced} structure_block/jigsaw voxel(s) ${dryRun ? "would be" : ""} cleared.`
    );
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
