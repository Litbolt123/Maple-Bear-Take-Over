/**
 * Categorized catalog of custom sound event IDs from RP/sounds/sound_definitions.json
 * for Developer Tools → Play sound. Update when new definitions are added.
 */

/** @typedef {{ soundId: string, label: string }} DevSoundEntry */
/** @typedef {{ id: string, title: string, sounds: DevSoundEntry[] }} DevSoundCategory */

/** @type {DevSoundCategory[]} */
export const DEV_SOUND_CATEGORIES = [
    {
        id: "journal",
        title: "Journal / UI",
        sounds: [
            { soundId: "mb.codex_open", label: "Codex open" },
            { soundId: "mb.codex_close", label: "Codex close" },
            { soundId: "mb.codex_turn_page", label: "Codex turn page" }
        ]
    },
    {
        id: "tiny_mb",
        title: "Tiny Maple Bear",
        sounds: [
            { soundId: "tiny_mb_step", label: "Step" },
            { soundId: "tiny_mb.ambient", label: "Ambient" },
            { soundId: "tiny_mb.attack", label: "Attack" },
            { soundId: "tiny_mb.hurt", label: "Hurt" },
            { soundId: "tiny_mb.death", label: "Death" }
        ]
    },
    {
        id: "buff_mb",
        title: "Buff Maple Bear",
        sounds: [
            { soundId: "buff_mb_step", label: "Step" },
            { soundId: "buff_mb_ambient", label: "Ambient" },
            { soundId: "buff_mb.nearby_1", label: "Nearby 1" },
            { soundId: "buff_mb.nearby_2", label: "Nearby 2" },
            { soundId: "buff_mb.roar", label: "Roar" },
            { soundId: "buff_mb_hurt", label: "Hurt" }
        ]
    },
    {
        id: "infected_mb",
        title: "Infected Maple Bear",
        sounds: [
            { soundId: "infected_mb.ambient", label: "Ambient" },
            { soundId: "infected_mb.attack", label: "Attack" },
            { soundId: "infected_mb.hurt", label: "Hurt" },
            { soundId: "generic_bear_hurt", label: "Generic bear hurt" },
            { soundId: "infected_mb.death", label: "Death" }
        ]
    },
    {
        id: "infected_livestock",
        title: "Infected pig & cow",
        sounds: [
            { soundId: "mob.infected_pig.boost", label: "Pig boost" },
            { soundId: "mob.infected_pig.death", label: "Pig death" },
            { soundId: "mob.infected_pig.say", label: "Pig say" },
            { soundId: "mob.infected_pig.step", label: "Pig step" },
            { soundId: "mob.infected_cow.hurt", label: "Cow hurt" },
            { soundId: "mob.infected_cow.milk", label: "Cow milk" },
            { soundId: "mob.infected_cow.say", label: "Cow say" },
            { soundId: "mob.infected_cow.step", label: "Cow step" }
        ]
    },
    {
        id: "flying_mining_torpedo",
        title: "Flying / Mining / Torpedo",
        sounds: [
            { soundId: "flying_mb.flight", label: "Flying flight" },
            { soundId: "flying_mb.dive", label: "Flying dive" },
            { soundId: "mining_mb.dig", label: "Mining dig" },
            { soundId: "torpedo_mb.flight", label: "Torpedo flight" },
            { soundId: "torpedo_mb.explode", label: "Torpedo explode" },
            { soundId: "torpedo_mb.death", label: "Torpedo death" }
        ]
    },
    {
        id: "snow_blocks",
        title: "Snow / powder blocks",
        sounds: [
            { soundId: "mb.snow_powder_place", label: "Powder place" },
            { soundId: "mb.snow_layer_hit", label: "Layer hit" },
            { soundId: "mb.snow_layer_step", label: "Layer step" },
            { soundId: "mb.snow_layer_jump", label: "Layer jump" },
            { soundId: "mb.snow_layer_fall", label: "Layer fall" },
            { soundId: "mb.snow_layer_land", label: "Layer land" },
            { soundId: "mb.snow_layer_break", label: "Layer break" }
        ]
    },
    {
        id: "emulsifier",
        title: "Emulsifier",
        sounds: [
            { soundId: "mb.emulsifier_run", label: "Machine running (ambient loop)" }
        ]
    },
    {
        id: "biome",
        title: "Infected biome ambient",
        sounds: [
            { soundId: "biome.infected_ambient_1", label: "Ambient 1" },
            { soundId: "biome.infected_ambient_2", label: "Ambient 2" },
            { soundId: "biome.infected_ambient_3", label: "Ambient 3" },
            { soundId: "biome.infected_ambient_4", label: "Ambient 4" }
        ]
    },
    {
        id: "player_infection",
        title: "Player infection / cure",
        sounds: [
            { soundId: "mb.infection_cough_minor", label: "Cough (minor)" },
            { soundId: "mb.infection_cough_major", label: "Cough (major)" },
            { soundId: "mb.dust_eat_hiccup", label: "Powder hiccup" },
            { soundId: "mb.cure_sigh_relief_minor", label: "Cure sigh (minor)" },
            { soundId: "mb.cure_sigh_relief_major", label: "Cure sigh (major)" }
        ]
    }
];
