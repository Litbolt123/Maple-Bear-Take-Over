/**
 * Report .mcstructure export health (empty, solid filler box, structure_block artifacts).
 * Usage: node tools/validateMcstructures.js [folder]
 */

import { readFileSync, readdirSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const nbt = require("prismarine-nbt");

const repoRoot = join(fileURLToPath(import.meta.url), "..", "..");
const defaultDir = join(repoRoot, "BP - Dev", "structures", "mb", "av_plains");
const targetDir = process.argv[2] ? join(process.cwd(), process.argv[2]) : defaultDir;

const parseNbt = (buf) =>
    new Promise((resolve, reject) => {
        nbt.parse(buf, "little", (err, root) => (err ? reject(err) : resolve(root)));
    });

const unwrap = (node) => (node && typeof node === "object" && "value" in node ? node.value : node);

function paletteBlockId(blockEntry) {
    const v = unwrap(blockEntry);
    if (!v || typeof v !== "object") return "";
    const name = v.name ?? v.Name;
    return typeof name === "string" ? name : typeof unwrap(name) === "string" ? unwrap(name) : "";
}

async function analyzeFile(filePath) {
    const root = unwrap(await parseNbt(readFileSync(filePath)));
    const [sx, sy, sz] = unwrap(unwrap(root.size).value);
    const structure = unwrap(root.structure);
    const pal = unwrap(unwrap(unwrap(structure.palette).default).block_palette).value;
    const layers = unwrap(unwrap(structure.block_indices).value);
    const layer = unwrap(layers[0]);
    const counts = new Map();
    let air = 0;
    for (let i = 0; i < layer.length; i++) {
        const idx = unwrap(layer[i]);
        if (idx < 0) continue;
        const name = paletteBlockId(pal[idx]);
        if (name === "minecraft:air") air++;
        else counts.set(name, (counts.get(name) || 0) + 1);
    }
    const total = sx * sy * sz;
    const solids = total - air;
    const oak = counts.get("minecraft:oak_planks") || 0;
    const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    /** @type {string[]} */
    const issues = [];
    if (solids === 0) issues.push("EMPTY (all air — will place nothing)");
    if (air === 0) issues.push("SOLID BOX (no air — fills entire export volume)");
    if (oak / total > 0.85) issues.push(`OAK FILL (${oak}/${total} oak_planks — huge plank box)`);
    if (dominant && dominant[1] / solids > 0.9 && solids > 100)
        issues.push(`FILLER (${dominant[0]} is ${Math.round((100 * dominant[1]) / solids)}% of solids)`);
    return { sx, sy, sz, total, solids, air, oak, issues, ok: issues.length === 0 };
}

async function main() {
    let bad = 0;
    for (const name of readdirSync(targetDir).filter((f) => extname(f) === ".mcstructure")) {
        const p = join(targetDir, name);
        const r = await analyzeFile(p);
        const flag = r.ok ? "ok" : "BAD";
        console.log(`${flag}  ${name}  ${r.sx}x${r.sy}x${r.sz}  solids=${r.solids}  air=${r.air}`);
        if (!r.ok) {
            bad++;
            for (const issue of r.issues) console.log(`      → ${issue}`);
        }
    }
    if (bad > 0) {
        console.log(`\n${bad} file(s) need re-export (Journal → Starter set for export, tight box, Offset 0,0,0).`);
        process.exitCode = 1;
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
