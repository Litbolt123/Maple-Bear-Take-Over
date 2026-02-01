// Shared block lists for snow replacement (death/torpedo snow placement).
// Used by main.js and mb_torpedoAI.js.

/** Blocks that should be replaced by snow (grass, flowers, foliage). */
export const SNOW_REPLACEABLE_BLOCKS = new Set([
    "minecraft:grass_block", "minecraft:grass", "minecraft:short_grass", "minecraft:tall_grass", "minecraft:double_tall_grass", "minecraft:fern", "minecraft:large_fern",
    "minecraft:dandelion", "minecraft:poppy", "minecraft:blue_orchid", "minecraft:allium", "minecraft:azure_bluet", "minecraft:red_tulip",
    "minecraft:orange_tulip", "minecraft:white_tulip", "minecraft:pink_tulip", "minecraft:oxeye_daisy", "minecraft:cornflower", "minecraft:lily_of_the_valley",
    "minecraft:sunflower", "minecraft:lilac", "minecraft:rose_bush", "minecraft:peony", "minecraft:dead_bush", "minecraft:cactus",
    "minecraft:sweet_berry_bush", "minecraft:nether_sprouts", "minecraft:warped_roots", "minecraft:crimson_roots", "minecraft:small_dripleaf",
    "minecraft:big_dripleaf", "minecraft:big_dripleaf_stem", "minecraft:spore_blossom", "minecraft:glow_lichen", "minecraft:moss_carpet",
    "minecraft:vine", "minecraft:weeping_vines", "minecraft:twisting_vines", "minecraft:cave_vines", "minecraft:sea_pickle", "minecraft:kelp",
    "minecraft:seagrass", "minecraft:tall_seagrass", "minecraft:waterlily", "minecraft:lily_pad",
    "minecraft:torchflower", "minecraft:pitcher_plant", "minecraft:pitcher_crop"
]);

/** 2-block-tall plants: replace bottom with snow, top with air. */
export const SNOW_TWO_BLOCK_PLANTS = new Set([
    "minecraft:sunflower", "minecraft:lilac", "minecraft:rose_bush", "minecraft:peony", "minecraft:large_fern",
    "minecraft:double_tall_grass", "minecraft:tall_grass",
    "minecraft:pitcher_plant", "minecraft:pitcher_crop",
    "minecraft:big_dripleaf", "minecraft:big_dripleaf_stem"
]);
