# Bridge export & pack versioning

## Root `config.json` is **Bridge only**

The file at the repo root — [`config.json`](../../config.json) — is **[Bridge](https://bridge-core.app/)’s project config**, not `package.json`, not Minecraft, and not read by addon scripts at runtime.

| Field | Purpose |
|-------|---------|
| `type` / `namespace` | Bridge project type (`minecraftBedrock`, `bridge`) |
| `name` | Project title inside Bridge |
| `packs.behaviorPack` / `resourcePack` | Where Bridge finds `BP/` and `RP/` |
| `compiler.plugins` | Bridge compile pipeline (`simpleRewrite.packName` affects export naming) |
| `targetVersion` | Bridge target game version for tooling |

If you open the folder in Bridge, it expects this file. Editing pack **display name** for export is done via manifests **and** this file’s `name` + `simpleRewrite.packName` — use **`npm run sync:pack-metadata`** to keep them aligned with `mb_buildConfig.js`.

For day-to-day scripting validation, use **`npm run check`** (`package.json` at repo root is separate).

---

## Display name: **The Maple Bear Apocalypse**

Minecraft shows the pack title from each manifest’s **`header.name`**. Bridge export also uses **`config.json`** (`name` + `simpleRewrite.packName`).

Canonical strings live in **`BP/scripts/mb_buildConfig.js`**:

- `PACK_DISPLAY_NAME` — release (`BP/` + `RP/`)
- `PACK_DISPLAY_NAME_DEV` — dev packs
- `ADDON_VERSION_*` + `ADDON_VERSION_PRERELEASE` — semver source of truth

## Before you export `.mcpack` from Bridge

From repo root:

```bash
npm run sync:pack-metadata
```

This updates:

- `BP/manifest.json`, `RP/manifest.json` (and Dev twins)
- `config.json` for Bridge project name / compile `packName`

Then export **behavior** and **resource** packs from Bridge as usual.

Before a **public** release (folding dev work into `BP/`): run **`npm run sync:bp-from-dev`** so all `BP/scripts/*.js` match dev except **`mb_buildConfig.js`**, then **`npm run check`**.

## Version: automatic vs manual

| Field | What it shows | How to bump |
|-------|----------------|-------------|
| **`header.description`** | Full semver, e.g. `v0.9.0-beta.3 — …` | Edit `ADDON_VERSION_*` in `mb_buildConfig.js`, run `npm run sync:pack-metadata` |
| **Dev pack description** | e.g. `v0.9.0-beta.4.2 — … (Dev)` | Edit `ADDON_VERSION_PRERELEASE` in **`BP - Dev/scripts/mb_buildConfig.js`**, then `npm run sync:pack-metadata` (dev manifests read dev config; public `BP/` stays on release config) |
| **`header.version`** `[0,9,0]` | Bedrock pack version (integers only; no `-beta.3`) | Same sync script — tracks `0.9.0` from build config |
| In-game journal / UI | `getAddonVersionDisplayString()` | Same `mb_buildConfig.js` constants |

**Prerelease** (`beta.3`) appears in **description** and scripts, not in the `[0,9,0]` array — Bedrock manifests do not support SemVer strings in `version`.

You do **not** need to hand-edit all four manifests each release if you run the sync script after bumping `mb_buildConfig.js`.

Also align **`PLAYER_CHANGELOG_VERSION`** in `mb_playerChangelog.js` and **`docs/PLAYER_CHANGELOG.md`** when shipping a new beta.

## Dev vs release export

- **Players:** export from `BP/` + `RP/` only (after sync).
- **Internal:** use `BP - Dev/` + `RP - Dev/`; manifest name ends with `(Dev)`.
- **Bridge templates:** [`config/dev/bridge.json`](../../config/dev/bridge.json) and [`config/release/bridge.json`](../../config/release/bridge.json) — copy to root with `npm run bridge:config:dev` or `bridge:config:release` (see [`config/README.md`](../../config/README.md)). `sync:pack-metadata` does **not** change pack paths.
- **Journal:** dev pack (`INCLUDE_FULL_DEVELOPER_TOOLS`) shows Developer Tools / Debug for any player; release uses Host tools with `mb_cheats` / Litbolt123 only.

## `.mcpack` filename

Bridge may name the file from `packName` (spaces allowed). If a host or uploader rejects spaces, rename the file locally, e.g. `The_Maple_Bear_Apocalypse_v0.9.0-beta.3.mcpack` — **in-game title** still comes from `header.name`.
