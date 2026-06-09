/**
 * Apply mb:av_plains export spawn density (test vs release) to scatter features, feature rules, jigsaw structure set + structure JSON.
 * Usage: node tools/syncAvPlainsSpawnDensity.js
 * Config: tools/mbAvPlainsSpawnDensity.json — set "active" to "off", "test", "release", etc.
 * When "off" or jigsaw.enabled false: removes active scatter + jigsaw JSON from BP - Dev (restore from _archived/av_plains_export_worldgen_test).
 */

import { readFileSync, writeFileSync, unlinkSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = join(repoRoot, "tools/mbAvPlainsSpawnDensity.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));
const profileName = config.active;
const profile = config.profiles[profileName];
if (!profile) {
    console.error(`Unknown active profile "${profileName}"`);
    process.exit(1);
}

const scatterEnabled = profile.scatter?.enabled === true;
const jigsawEnabled = profile.jigsaw?.enabled !== false && profileName !== "off";

const featuresDir = join(repoRoot, "BP - Dev/features/mb/av_plains");
const rulesDir = join(repoRoot, "BP - Dev/feature_rules");

const structureSetPath = join(repoRoot, "BP - Dev/worldgen/structure_sets/mb/abandoned_village_plains.json");
const structurePath = join(repoRoot, "BP - Dev/worldgen/structures/mb/abandoned_village_plains.json");
const processorPath = join(repoRoot, "BP - Dev/worldgen/processors/mb/av_empty.json");
const templatePoolPath = join(repoRoot, "BP - Dev/worldgen/template_pools/mb/av_plains/start.json");

function removeScatterWorldgen() {
    for (let i = 0; i < 8; i++) {
        const scatterSuffix = i === 0 ? "" : `_slot${i}`;
        const scatterPath = join(featuresDir, `scatter_export_building_grid${scatterSuffix}.json`);
        const rulePath = join(rulesDir, `av_plains_export_building_slot${i}.json`);
        if (existsSync(scatterPath)) unlinkSync(scatterPath);
        if (existsSync(rulePath)) unlinkSync(rulePath);
    }
}

function removeJigsawWorldgen() {
    for (const p of [structureSetPath, structurePath, processorPath, templatePoolPath]) {
        if (existsSync(p)) unlinkSync(p);
    }
}

if (!jigsawEnabled) {
    removeJigsawWorldgen();
    removeScatterWorldgen();
    console.log(
        `Applied spawn profile "${profileName}": export worldgen OFF — lamps + script villages only. Restore from BP - Dev/_archived/av_plains_export_worldgen_test when testing.`
    );
    process.exit(0);
}

const { grid, window, anchors } = profile.scatter;
const { spacing, separation } = profile.jigsaw;
if (separation >= spacing / 2) {
    console.error(
        `Invalid jigsaw spacing/separation: separation (${separation}) must be less than spacing/2 (${spacing / 2}) for structure set mb:abandoned_village_plains.`
    );
    process.exit(1);
}
const dryLandGate =
    "q.heightmap(v.worldx, v.worldz, 'motion_blocking_no_leaves') + 1 >= q.heightmap(v.worldx, v.worldz)";

function gridIterations(anchor) {
    return (
        `math.floor(v.originx / ${grid}) * ${grid} + ${anchor} >= v.originx && ` +
        `math.floor(v.originx / ${grid}) * ${grid} + ${anchor} < v.originx + ${window} && ` +
        `math.floor(v.originz / ${grid}) * ${grid} + ${anchor} >= v.originz && ` +
        `math.floor(v.originz / ${grid}) * ${grid} + ${anchor} < v.originz + ${window} && ` +
        `${dryLandGate} ? 1 : 0`
    );
}

function gridOffset(anchor) {
    return `(math.floor(v.originx / ${grid}) * ${grid} + ${anchor}) - v.originx`;
}

function gridOffsetZ(anchor) {
    return `(math.floor(v.originz / ${grid}) * ${grid} + ${anchor}) - v.originz`;
}

/** @param {number} slotIndex @param {number} anchor */
function writeScatterFeature(slotIndex, anchor) {
    const suffix = slotIndex === 0 ? "" : `_slot${slotIndex}`;
    const feature = {
        format_version: "1.21.0",
        "minecraft:scatter_feature": {
            description: {
                identifier: `mb:av_plains/scatter_export_building_grid${suffix}`
            },
            iterations: gridIterations(anchor),
            coordinate_eval_order: "xzy",
            x: gridOffset(anchor),
            z: gridOffsetZ(anchor),
            y: "q.heightmap(v.worldx, v.worldz, 'motion_blocking_no_leaves')",
            places_feature: "mb:av_plains/snap_export_building"
        }
    };
    const fileName = `scatter_export_building_grid${suffix}.json`;
    writeFileSync(join(featuresDir, fileName), `${JSON.stringify(feature, null, "\t")}\n`);
    return fileName;
}

/** @param {number} slotIndex */
function writeFeatureRule(slotIndex) {
    const slotSuffix = slotIndex === 0 ? "" : `_slot${slotIndex}`;
    const rule = {
        format_version: "1.21.0",
        "minecraft:feature_rules": {
            description: {
                identifier: `mb:av_plains_export_building_slot${slotIndex}`,
                places_feature: `mb:av_plains/scatter_export_building_grid${slotSuffix}`
            },
            conditions: {
                placement_pass: "surface_pass",
                "minecraft:biome_filter": {
                    any_of: [
                        { test: "has_biome_tag", operator: "==", value: "plains" },
                        { test: "has_biome_tag", operator: "==", value: "meadow" },
                        { test: "has_biome_tag", operator: "==", value: "sunflower_plains" }
                    ]
                }
            },
            distribution: {
                iterations: 1,
                x: 0,
                y: 0,
                z: 0
            }
        }
    };
    writeFileSync(
        join(rulesDir, `av_plains_export_building_slot${slotIndex}.json`),
        `${JSON.stringify(rule, null, "\t")}\n`
    );
}

if (scatterEnabled) {
    for (let i = anchors.length; i < 8; i++) {
        const scatterExtra = join(featuresDir, `scatter_export_building_grid_slot${i}.json`);
        const ruleExtra = join(rulesDir, `av_plains_export_building_slot${i}.json`);
        if (existsSync(scatterExtra)) unlinkSync(scatterExtra);
        if (existsSync(ruleExtra)) unlinkSync(ruleExtra);
    }
    for (let i = 0; i < anchors.length; i++) {
        writeScatterFeature(i, anchors[i]);
        writeFeatureRule(i);
    }
} else {
    removeScatterWorldgen();
}

if (!existsSync(structureSetPath) || !existsSync(structurePath)) {
    console.error(
        "Jigsaw worldgen JSON missing under BP - Dev/worldgen/. Copy from BP - Dev/_archived/av_plains_export_worldgen_test first."
    );
    process.exit(1);
}

const structureSet = JSON.parse(readFileSync(structureSetPath, "utf8"));
structureSet["minecraft:structure_set"].placement.spacing = spacing;
structureSet["minecraft:structure_set"].placement.separation = separation;
writeFileSync(structureSetPath, `${JSON.stringify(structureSet, null, "\t")}\n`);

const structureDef = JSON.parse(readFileSync(structurePath, "utf8"));
const terrainAdaptation = profile.jigsaw.terrain_adaptation ?? "none";
structureDef["minecraft:jigsaw"].terrain_adaptation = terrainAdaptation;
writeFileSync(structurePath, `${JSON.stringify(structureDef, null, "\t")}\n`);

const scatterNote = scatterEnabled
    ? `scatter grid=${grid} window=${window} anchors=[${anchors.join(", ")}] (${anchors.length} slot(s))`
    : "scatter OFF (jigsaw-only)";

console.log(
    `Applied spawn profile "${profileName}": ${scatterNote}, jigsaw spacing=${spacing} separation=${separation} terrain_adaptation=${terrainAdaptation}.`
);
console.log("Reload dev pack + explore NEW chunks.");
