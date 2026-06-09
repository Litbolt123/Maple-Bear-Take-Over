import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const surfaceConfig = JSON.parse(
    readFileSync(join(repoRoot, "tools/mbAvPlainsSurfaceBlocks.json"), "utf8")
);
const allowlist = surfaceConfig.surface_blocks;
const snapBlocks = surfaceConfig.snap_surface_blocks;
const adjustmentRadius = surfaceConfig.placement?.adjustment_radius ?? 0;
const snapVerticalRange = surfaceConfig.placement?.snap_vertical_search_range ?? 24;

const dir = join(repoRoot, "BP - Dev/features/mb/av_plains");
const structures = {
    place_house_1: "plains_house_1",
    place_house_2_tall: "plains_house_2_tall",
    place_house_3: "plains_house_3",
    place_smithy: "plains_smithy",
    place_bakery: "plains_bakery",
    place_librarian_study: "plains_librarian_study",
    place_church_cathedral_ruin: "plains_church_cathedral_ruin",
    place_farmhouse: "plains_farmhouse"
};

for (const [placeId, struct] of Object.entries(structures)) {
    const feature = {
        format_version: "1.21.0",
        "minecraft:structure_template_feature": {
            description: {
                identifier: `mb:av_plains/${placeId}`
            },
            structure_name: `mb:av_plains/${struct}`,
            adjustment_radius: adjustmentRadius,
            facing_direction: "random",
            constraints: {
                block_intersection: {
                    block_allowlist: allowlist
                }
            }
        }
    };
    writeFileSync(join(dir, `${placeId}.json`), `${JSON.stringify(feature, null, "\t")}\n`);
}

const snapFeature = {
    format_version: "1.21.0",
    "minecraft:snap_to_surface_feature": {
        description: {
            identifier: "mb:av_plains/snap_export_building"
        },
        feature_to_snap: "mb:av_plains/random_export_building",
        vertical_search_range: snapVerticalRange,
        surface: "floor",
        allow_air_placement: true,
        allow_underwater_placement: false,
        allowed_surface_blocks: snapBlocks
    }
};
writeFileSync(join(dir, "snap_export_building.json"), `${JSON.stringify(snapFeature, null, "\t")}\n`);

console.log(
    `Wrote ${Object.keys(structures).length} place_*.json + snap_export_building.json (${allowlist.length} intersection blocks).`
);
