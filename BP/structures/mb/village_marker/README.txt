Abandoned village lamp markers (worldgen)
=========================================

Structures (3x3 footprint, 23 blocks tall):
  oak_lamp_post.mcstructure   — oak (plains / default)
  warm_lamp_post.mcstructure  — acacia (savanna / warm)
  rain_lamp_post.mcstructure  — jungle (rainforest)
  cold_lamp_post.mcstructure  — spruce (infected / cold)

Active worldgen (BP/feature_rules/village_marker_infected_*.json):
  — Large infected: 3 cold lamps per 384-block site cell (slots 0/1/2).
  — Medium infected: 1 cold lamp per cell (~50% scatter_chance).

Lamps snap to grid offset (64, 64) + slot×128 on X. Script villages jitter
within ~40 blocks of that point (see lampMarkerWorldPosition in mb_abandonedVillageSites.js).

Oak / warm / rain features exist for future rulesets; infected uses cold only.

Original exports (dev): BP - Dev/structures/mb/mb_village_*_lamp_post_mark.mcstructure
