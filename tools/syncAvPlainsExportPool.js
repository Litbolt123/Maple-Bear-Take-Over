/**
 * Sync random_export_building.json + jigsaw start pool from tools/mbAvPlainsExportPool.json
 * Requires worldgen restored from BP - Dev/_archived/av_plains_export_worldgen_test/
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const featuresDir = join(repoRoot, "BP - Dev/features/mb/av_plains");
const templatePoolPath = join(repoRoot, "BP - Dev/worldgen/template_pools/mb/av_plains/start.json");
if (!existsSync(featuresDir) || !existsSync(dirname(templatePoolPath))) {
    console.error(
        "Export pool sync skipped — active worldgen not present. Restore from BP - Dev/_archived/av_plains_export_worldgen_test/ first."
    );
    process.exit(1);
}
const pool = JSON.parse(readFileSync(join(repoRoot, "tools/mbAvPlainsExportPool.json"), "utf8"));

const randomFeature = {
    format_version: "1.21.0",
    "minecraft:weighted_random_feature": {
        description: {
            identifier: "mb:av_plains/random_export_building"
        },
        features: pool.active.map((e) => [`mb:av_plains/${e.place}`, e.weight])
    }
};

writeFileSync(
    join(repoRoot, "BP - Dev/features/mb/av_plains/random_export_building.json"),
    `${JSON.stringify(randomFeature, null, "\t")}\n`
);

const templatePool = {
    format_version: "1.26.10",
    "minecraft:template_pool": {
        description: {
            identifier: "mb:av_plains/start"
        },
        elements: pool.active.map((e) => ({
            element: {
                element_type: "minecraft:single_pool_element",
                location: `mb/av_plains/${e.structure}`,
                processors: "mb:av_empty",
                projection: "rigid"
            },
            weight: e.weight
        }))
    }
};

writeFileSync(
    join(repoRoot, "BP - Dev/worldgen/template_pools/mb/av_plains/start.json"),
    `${JSON.stringify(templatePool, null, "\t")}\n`
);

console.log(
    `Export pool: ${pool.active.length} active (${pool.active.map((e) => e.structure).join(", ")}).`
);
console.log(`${pool.disabled_pending_reexport.length} disabled pending re-export.`);
