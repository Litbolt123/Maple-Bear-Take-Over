Abandoned village lamp markers (worldgen)
=========================================

Structures (3x3 footprint, 23 blocks tall):
  oak_lamp_post.mcstructure   — oak / plains (+ meadow, sunflower plains)
  warm_lamp_post.mcstructure  — acacia / savanna
  rain_lamp_post.mcstructure  — jungle (jungle + bamboo_jungle villages)
  cold_lamp_post.mcstructure  — spruce / infected snow + taiga-style cold

Worldgen (BP/feature_rules/):
  village_marker_plains_slot0.json   → oak_lamp
  village_marker_savanna_slot0.json  → warm_lamp
  village_marker_jungle_slot0.json   → rain_lamp
  village_marker_cold_overworld_slot0.json → cold_lamp (ice_plains, cold_taiga+)
  village_marker_infected_large_slot{0,1,2}.json → cold_lamp (3 per cell)
  village_marker_infected_medium_slot0.json      → cold_lamp (~50%)

Script rulesets (mb_abandonedVillageWorldgen.js rulesetForBiome):
  plains / savanna / jungle / desert / taiga / snowy / ice / infected

Lamps snap to grid offset (64, 64) + slot×128 on X (large infected only).
Script villages jitter within ~40 blocks (lampMarkerWorldPosition).

Original exports: BP - Dev/structures/mb/mb_village_*_lamp_post_mark.mcstructure
