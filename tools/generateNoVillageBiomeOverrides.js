/**
 * Strips minecraft:village_type from village biomes (disables vanilla village roll).
 * Required for 100% abandoned villages: only mb_abandonedVillageWorldgen.js places them.
 * Re-run after Mojang biome updates, then commit BP + BP - Dev overrides.
 *
 *   node tools/generateNoVillageBiomeOverrides.js
 *   node tools/generateNoVillageBiomeOverrides.js --dry-run
 */
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import https from "https";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIRS = [
    join(root, "BP", "biomes", "worldgen_no_village"),
    join(root, "BP - Dev", "biomes", "worldgen_no_village")
];
const MOJANG_BIOME_BASE =
    "https://raw.githubusercontent.com/Mojang/bedrock-samples/main/behavior_pack/biomes";
const BIOME_FILES = [
    "cold_taiga.biome.json",
    "cold_taiga_hills.biome.json",
    "desert.biome.json",
    "ice_plains.biome.json",
    "meadow.biome.json",
    "plains.biome.json",
    "savanna.biome.json",
    "sunflower_plains.biome.json",
    "taiga.biome.json",
    "taiga_hills.biome.json"
];

const dryRun = process.argv.includes("--dry-run");

function fetchText(url) {
    return new Promise((resolve, reject) => {
        https
            .get(url, { headers: { "User-Agent": "maple-bear-tools" } }, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    fetchText(res.headers.location).then(resolve, reject);
                    return;
                }
                if (res.statusCode !== 200) {
                    reject(new Error(`${url} → HTTP ${res.statusCode}`));
                    return;
                }
                let body = "";
                res.on("data", (c) => {
                    body += c;
                });
                res.on("end", () => resolve(body));
            })
            .on("error", reject);
    });
}

function stripVillageType(obj) {
    const biome = obj?.["minecraft:biome"];
    const components = biome?.components;
    if (!components || !("minecraft:village_type" in components)) {
        return { changed: false, obj };
    }
    const next = { ...components };
    delete next["minecraft:village_type"];
    return {
        changed: true,
        obj: {
            ...obj,
            "minecraft:biome": {
                ...biome,
                components: next
            }
        }
    };
}

async function main() {
    let written = 0;
    for (const fileName of BIOME_FILES) {
        const url = `${MOJANG_BIOME_BASE}/${fileName}`;
        const raw = await fetchText(url);
        const parsed = JSON.parse(raw);
        const { changed, obj } = stripVillageType(parsed);
        if (!changed) {
            console.warn(`No village_type in ${fileName} — skipped`);
            continue;
        }
        const outBody = `${JSON.stringify(obj, null, 2)}\n`;
        for (const dir of OUT_DIRS) {
            if (!dryRun) {
                if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
                writeFileSync(join(dir, fileName), outBody, "utf8");
            }
        }
        written++;
        console.log(dryRun ? `[dry-run] ${fileName}` : `Wrote ${fileName} → ${OUT_DIRS.map((d) => d.replace(root + "\\", "")).join(", ")}`);
    }
    console.log(
        dryRun
            ? `Would write ${written} biome override(s).`
            : `Done — ${written} biome override(s). New worlds: no vanilla villages in those biomes.`
    );
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
