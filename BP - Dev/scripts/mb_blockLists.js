// Shared block lists for snow replacement.
// NOTE: Distinction for future work:
// - STORM never replaces: SNOW_NEVER_REPLACE_BLOCKS (storm places snow only in air above these).
// - Death/torpedo/buff snow placement: SNOW_REPLACEABLE_BLOCKS (these blocks can be replaced with snow).
// Used by main.js, mb_torpedoAI.js, mb_buffAI.js, mb_snowStorm.js.

/** Full ground blocks that must NEVER be replaced by snow (storm only places in air above these). */
export const SNOW_NEVER_REPLACE_BLOCKS = new Set([
    "minecraft:dirt", "minecraft:grass_block", "minecraft:coarse_dirt", "minecraft:podzol",
    "minecraft:mycelium", "minecraft:dirt_with_roots", "minecraft:moss_block", "minecraft:mud"
]);

/** Blocks that death/torpedo/buff snow placement can replace (grass, flowers, foliage). Excludes grass_block - full ground blocks stay. */
export const SNOW_REPLACEABLE_BLOCKS = new Set([
    "minecraft:grass", "minecraft:short_grass", "minecraft:tall_grass", "minecraft:double_tall_grass", "minecraft:fern", "minecraft:large_fern",
    "minecraft:dandelion", "minecraft:poppy", "minecraft:blue_orchid", "minecraft:allium", "minecraft:azure_bluet", "minecraft:red_tulip",
    "minecraft:orange_tulip", "minecraft:white_tulip", "minecraft:pink_tulip", "minecraft:oxeye_daisy", "minecraft:cornflower", "minecraft:lily_of_the_valley",
    "minecraft:sunflower", "minecraft:lilac", "minecraft:rose_bush", "minecraft:peony", "minecraft:dead_bush", "minecraft:cactus",
    "minecraft:sweet_berry_bush", "minecraft:nether_sprouts", "minecraft:warped_roots", "minecraft:crimson_roots", "minecraft:small_dripleaf",
    "minecraft:big_dripleaf", "minecraft:big_dripleaf_stem", "minecraft:spore_blossom", "minecraft:glow_lichen", "minecraft:moss_carpet",
    "minecraft:vine", "minecraft:weeping_vines", "minecraft:twisting_vines", "minecraft:cave_vines", "minecraft:sea_pickle", "minecraft:kelp",
    "minecraft:seagrass", "minecraft:tall_seagrass", "minecraft:waterlily", "minecraft:lily_pad",
    "minecraft:torchflower", "minecraft:pitcher_plant", "minecraft:pitcher_crop",
    "minecraft:leaf_litter"
]);

/** Blocks that storm particles pass through to find ground (leaves, foliage - don't treat as surface). */
export const STORM_PARTICLE_PASS_THROUGH = new Set([
    "minecraft:leaves", "minecraft:leaves2", "minecraft:azalea_leaves", "minecraft:azalea_leaves_flowered",
    "minecraft:oak_leaves", "minecraft:spruce_leaves", "minecraft:birch_leaves", "minecraft:jungle_leaves",
    "minecraft:acacia_leaves", "minecraft:dark_oak_leaves", "minecraft:mangrove_leaves",
    "minecraft:cherry_leaves", "minecraft:flowering_azalea_leaves",
    "minecraft:grass", "minecraft:short_grass", "minecraft:tall_grass", "minecraft:double_tall_grass",
    "minecraft:fern", "minecraft:large_fern", "minecraft:dandelion", "minecraft:poppy",
    "minecraft:blue_orchid", "minecraft:allium", "minecraft:azure_bluet", "minecraft:red_tulip",
    "minecraft:orange_tulip", "minecraft:white_tulip", "minecraft:pink_tulip", "minecraft:oxeye_daisy",
    "minecraft:cornflower", "minecraft:lily_of_the_valley", "minecraft:sunflower", "minecraft:lilac",
    "minecraft:rose_bush", "minecraft:peony", "minecraft:dead_bush", "minecraft:vine",
    "minecraft:weeping_vines", "minecraft:twisting_vines", "minecraft:cave_vines",
    "minecraft:glow_lichen", "minecraft:moss_carpet", "minecraft:spore_blossom",
    "minecraft:torchflower", "minecraft:pitcher_plant", "minecraft:pitcher_crop",
    "minecraft:small_dripleaf", "minecraft:big_dripleaf", "minecraft:big_dripleaf_stem",
    "minecraft:leaf_litter"
]);

/** Blocks major storms can destroy when big (leaves, grass, flowers, bamboo). */
export const STORM_DESTRUCT_BLOCKS = new Set([
    "minecraft:oak_leaves", "minecraft:spruce_leaves", "minecraft:birch_leaves", "minecraft:jungle_leaves",
    "minecraft:acacia_leaves", "minecraft:dark_oak_leaves", "minecraft:mangrove_leaves", "minecraft:cherry_leaves",
    "minecraft:azalea_leaves", "minecraft:flowering_azalea_leaves", "minecraft:leaves", "minecraft:leaves2",
    "minecraft:grass", "minecraft:short_grass", "minecraft:tall_grass", "minecraft:double_tall_grass",
    "minecraft:fern", "minecraft:large_fern", "minecraft:dandelion", "minecraft:poppy", "minecraft:blue_orchid",
    "minecraft:allium", "minecraft:azure_bluet", "minecraft:red_tulip", "minecraft:orange_tulip",
    "minecraft:white_tulip", "minecraft:pink_tulip", "minecraft:oxeye_daisy", "minecraft:cornflower",
    "minecraft:lily_of_the_valley", "minecraft:sunflower", "minecraft:lilac", "minecraft:rose_bush",
    "minecraft:peony", "minecraft:dead_bush", "minecraft:vine", "minecraft:torchflower", "minecraft:pitcher_plant",
    "minecraft:pitcher_crop", "minecraft:small_dripleaf", "minecraft:big_dripleaf", "minecraft:big_dripleaf_stem",
    "minecraft:glow_lichen", "minecraft:moss_carpet", "minecraft:spore_blossom",
    "minecraft:leaf_litter",
    "minecraft:bamboo", "minecraft:bamboo_sapling"
]);

/** Glass blocks storm cannot break (tinted glass blocks light, hardened - Education). */
export const STORM_DESTRUCT_GLASS_EXCLUDE = new Set([
    "minecraft:tinted_glass",
    "minecraft:hard_glass", "minecraft:hardened_glass",
    "minecraft:hardened_glass_pane", "minecraft:hard_glass_pane"
]);

/** Glass blocks - lower chance to break in storm. */
export const STORM_DESTRUCT_GLASS = new Set([
    "minecraft:glass", "minecraft:white_stained_glass", "minecraft:orange_stained_glass", "minecraft:magenta_stained_glass",
    "minecraft:light_blue_stained_glass", "minecraft:yellow_stained_glass", "minecraft:lime_stained_glass",
    "minecraft:pink_stained_glass", "minecraft:gray_stained_glass", "minecraft:light_gray_stained_glass",
    "minecraft:cyan_stained_glass", "minecraft:purple_stained_glass", "minecraft:blue_stained_glass",
    "minecraft:brown_stained_glass", "minecraft:green_stained_glass", "minecraft:red_stained_glass",
    "minecraft:black_stained_glass", "minecraft:glass_pane", "minecraft:white_stained_glass_pane",
    "minecraft:orange_stained_glass_pane", "minecraft:magenta_stained_glass_pane", "minecraft:light_blue_stained_glass_pane",
    "minecraft:yellow_stained_glass_pane", "minecraft:lime_stained_glass_pane", "minecraft:pink_stained_glass_pane",
    "minecraft:gray_stained_glass_pane", "minecraft:light_gray_stained_glass_pane", "minecraft:cyan_stained_glass_pane",
    "minecraft:purple_stained_glass_pane", "minecraft:blue_stained_glass_pane", "minecraft:brown_stained_glass_pane",
    "minecraft:green_stained_glass_pane", "minecraft:red_stained_glass_pane", "minecraft:black_stained_glass_pane"
]);

/** 2-block-tall plants: replace bottom with snow, top with air. */
export const SNOW_TWO_BLOCK_PLANTS = new Set([
    "minecraft:sunflower", "minecraft:lilac", "minecraft:rose_bush", "minecraft:peony", "minecraft:large_fern",
    "minecraft:double_tall_grass", "minecraft:tall_grass",
    "minecraft:pitcher_plant", "minecraft:pitcher_crop",
    "minecraft:big_dripleaf", "minecraft:big_dripleaf_stem"
]);
