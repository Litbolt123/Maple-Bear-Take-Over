/**
 * Shift every block in .mcstructure files down by N layers (default 1).
 * Fixes exports saved with Structure Block default Offset Y=-1 (floor at Y=1, air at Y=0).
 * Usage: node tools/shiftMcstructureDown.js [--dry-run] [--steps=1] [folder]
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const AIR_ID = "minecraft:air";

const repoRoot = join(fileURLToPath(import.meta.url), "..", "..");
const defaultDir = join(repoRoot, "BP - Dev", "structures", "mb", "av_plains");
const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const dryRun = process.argv.includes("--dry-run");
const stepsArg = process.argv.find((a) => a.startsWith("--steps="));
const steps = stepsArg ? Math.max(1, parseInt(stepsArg.split("=")[1], 10) || 1) : 1;
const targetDir = args[0] ? join(process.cwd(), args[0]) : defaultDir;

let nbt;
try {
    nbt = require("prismarine-nbt");
} catch {
    console.error("Missing prismarine-nbt. Run: npm install --save-dev prismarine-nbt");
    process.exit(1);
}

const parseNbt = (buf) =>
    new Promise((resolve, reject) => {
        nbt.parse(buf, "little", (err, root) => (err ? reject(err) : resolve(root)));
    });

function writeNbt(root) {
    return nbt.writeUncompressed(root, "little");
}

function unwrap(node) {
    if (node && typeof node === "object" && "value" in node) return node.value;
    return node;
}

function paletteBlockId(blockEntry) {
    const v = unwrap(blockEntry);
    if (!v || typeof v !== "object") return "";
    const name = v.name ?? v.Name;
    if (typeof name === "string") return name;
    return typeof unwrap(name) === "string" ? unwrap(name) : "";
}

function getPaletteList(structure) {
    if (!structure || typeof structure !== "object") return null;
    const palette = unwrap(structure.palette);
    const paletteDefault = unwrap(palette?.default);
    const blockPalette = unwrap(paletteDefault?.block_palette);
    if (Array.isArray(blockPalette)) return blockPalette;
    if (Array.isArray(blockPalette?.value)) return blockPalette.value;
    return Array.isArray(blockPalette?.value?.value) ? blockPalette.value.value : null;
}

function getIndexLayers(structure) {
    if (!structure || typeof structure !== "object") return null;
    const indices = unwrap(structure.block_indices);
    if (Array.isArray(indices)) return indices;
    const nested = indices?.value?.value ?? indices?.value;
    return Array.isArray(nested) ? nested : null;
}

function getSize(rootValue) {
    const sizeNode = unwrap(rootValue.size);
    const list = unwrap(sizeNode?.value ?? sizeNode);
    if (!Array.isArray(list) || list.length < 3) return null;
    return [unwrap(list[0]), unwrap(list[1]), unwrap(list[2])];
}

function solidCountAtY(layer, sx, sz, y, pal) {
    const arr = unwrap(layer);
    if (!Array.isArray(arr)) return 0;
    let count = 0;
    for (let i = 0; i < sx * sz; i++) {
        const idx = unwrap(arr[y * sx * sz + i]);
        if (idx < 0) continue;
        const id = paletteBlockId(pal[idx]);
        if (id && id !== AIR_ID) count++;
    }
    return count;
}

function shouldShiftDown(layer, sx, sy, sz, pal) {
    const footprint = sx * sz;
    const c0 = solidCountAtY(layer, sx, sz, 0, pal);
    const c1 = sy > 1 ? solidCountAtY(layer, sx, sz, 1, pal) : 0;
    if (c1 === 0) return { ok: false, reason: "no solids at Y=1" };
    // Only shift thin Y=0 padding (stairs/slabs), not real floor plates.
    if (c0 === 0) return { ok: true, reason: "Y=0 empty" };
    if (c0 > 10) return { ok: false, reason: `Y=0 floor plate (${c0} blocks)` };
    if (c0 / footprint > 0.12) return { ok: false, reason: `Y=0 covers ${Math.round((100 * c0) / footprint)}% footprint` };
    if (c1 >= c0 * 3) return { ok: true, reason: `Y=1 mass (${c1}) >> Y=0 trim (${c0})` };
    return { ok: false, reason: `Y=0 trim (${c0}) vs Y=1 (${c1})` };
}

async function shiftFileSafe(filePath, dryRunFlag, shiftSteps) {
    const buf = readFileSync(filePath);
    const root = await parseNbt(buf);
    const rootValue = unwrap(root);
    const structure = unwrap(rootValue.structure);
    const size = getSize(rootValue);
    if (!size) {
        console.warn(`skip (no size): ${filePath}`);
        return { shifted: false };
    }
    const [sx, sy, sz] = size;

    const pal = getPaletteList(structure);
    const layers = getIndexLayers(structure);
    if (!pal || !layers?.length) {
        console.warn(`skip (no palette): ${filePath}`);
        return { shifted: false };
    }

    let airIndex = 0;
    for (let i = 0; i < pal.length; i++) {
        if (paletteBlockId(pal[i]) === AIR_ID) {
            airIndex = i;
            break;
        }
    }

    const layer0 = unwrap(layers[0]);
    const arr = unwrap(layer0);
    if (!Array.isArray(arr) || arr.length !== sx * sy * sz) {
        console.warn(`skip (layer mismatch): ${filePath}`);
        return { shifted: false };
    }

    const beforeC0 = solidCountAtY(layer0, sx, sz, 0, pal);
    const beforeC1 = solidCountAtY(layer0, sx, sz, 1, pal);
    const shiftCheck = shouldShiftDown(layer0, sx, sy, sz, pal);
    if (!shiftCheck.ok) {
        console.log(`skip (${shiftCheck.reason}): ${filePath}`);
        return { shifted: false, beforeC0, beforeC1 };
    }

    const newIndices = new Array(arr.length);
    for (let y = 0; y < sy; y++) {
        for (let z = 0; z < sz; z++) {
            for (let x = 0; x < sx; x++) {
                const dst = x + z * sx + y * sx * sz;
                if (y + shiftSteps >= sy) {
                    newIndices[dst] = airIndex;
                    continue;
                }
                const src = x + z * sx + (y + shiftSteps) * sx * sz;
                newIndices[dst] = unwrap(arr[src]);
            }
        }
    }
    for (let i = 0; i < arr.length; i++) {
        arr[i] = { type: "int", value: newIndices[i] };
    }

    const afterC0 = solidCountAtY(layer0, sx, sz, 0, pal);
    const total = arr.length;
    let afterAir = 0;
    for (let i = 0; i < arr.length; i++) {
        const idx = unwrap(arr[i]);
        if (idx < 0) continue;
        if (paletteBlockId(pal[idx]) === AIR_ID) afterAir++;
    }
    const afterSolids = total - afterAir;
    if (afterSolids < 8 || afterSolids / total < 0.02) {
        console.warn(`skip (would leave ${afterSolids}/${total} solids): ${filePath}`);
        return { shifted: false };
    }

    const afterC1 = solidCountAtY(layer0, sx, sz, 1, pal);
    if (!dryRunFlag) {
        writeFileSync(filePath, writeNbt(root));
    }
    console.log(
        `${dryRunFlag ? "would shift" : "shifted"} -${shiftSteps} Y (Y0 ${beforeC0}→${afterC0}, Y1 ${beforeC1}→${afterC1}) ${sx}x${sy}x${sz}: ${filePath}`
    );
    return { shifted: true, beforeC0, afterC0 };
}

function walkMcstructures(dir) {
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
    let count = 0;
    for (const file of files) {
        try {
            const r = await shiftFileSafe(file, dryRun, steps);
            if (r.shifted) count++;
        } catch (err) {
            console.error(`FAIL ${file}: ${err?.message ?? err}`);
            process.exitCode = 1;
        }
    }
    console.log(
        `${dryRun ? "Dry run —" : "Done —"} ${count}/${files.length} file(s) ${dryRun ? "would be" : ""} shifted down ${steps} layer(s).`
    );
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
