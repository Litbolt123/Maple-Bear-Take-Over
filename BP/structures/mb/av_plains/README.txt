Plains abandoned village .mcstructure pieces (DEV — assets for Maple Bear collab).

=== HOW THEY APPEAR TODAY ===

1) LAMPS + SCRIPT VILLAGES (active)
   - Lamp markers on a biome grid (feature_rules/village_marker_*).
   - Walk up to a lamp → script builds hamlet / village / large procedurally.
   - See `mb_abandonedVillageWorldgen.js` + `mb_abandonedSettlementBuilder.js`.

2) EXPORT BUILDINGS (.mcstructure in this folder)
   - **Not linked to worldgen** while single-piece jigsaw test is archived.
   - Worldgen JSON lives in `BP - Dev/_archived/av_plains_export_worldgen_test/`.
   - Use **Starter set for export** (dev journal) to preview pads at Y=200 for re-export work.

=== RE-EXPORT CHECKLIST ===

Large buildings sink or show a dirt/stone "box" when the .mcstructure includes basement layers or an oversized Structure Block box.

Fix: re-run "Starter set for export" (Y=200), then save tight boxes only:

  1. Gold block = walkable height marker.
  2. Floor blocks are ONE BELOW the gold block (Y=199 if gold at 200).
  3. Use the Content Log suggested box — surface-only, no basement, no side padding.
  4. Structure Block default Offset is Y=-1 — click Reset or set Offset to 0,0,0 so floor blocks land at structure Y=0.
  5. Structure Block sits OUTSIDE the save box (adjacent SW corner).
  6. After Save: `npm run strip:mcstructures` from repo root.
  7. Run `npm run validate:mcstructures` — must show "ok" for every file.
  8. When worldgen returns: add file in `tools/mbAvPlainsExportPool.json` → `npm run sync:av-plains-export-pool`.
  9. Overwrite files here, reload pack.

Path formats (when jigsaw returns):
  - Jigsaw template pool "location": mb/av_plains/<name>  (slash)
  - structure_template_feature "structure_name": mb:av_plains/<name>  (colon)

**Do not save a solid filler box** (e.g. oak planks filling the whole volume). Use air or structure_void inside the export box.

**Bottom layer (Y=0):** floor blocks or structure_void — never grass_block from the ground you built on.

Full connected jigsaw villages: see `docs/development/VILLAGE_STRUCTURE_COLLAB_GUIDE.md`.

Files:
  plains_house_1.mcstructure
  plains_house_2_tall.mcstructure
  plains_house_3.mcstructure
  plains_smithy.mcstructure
  plains_bakery.mcstructure
  plains_librarian_study.mcstructure
  plains_church_cathedral_ruin.mcstructure
  plains_farmhouse.mcstructure
