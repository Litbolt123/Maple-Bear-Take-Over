/**
 * Copy BP - Dev / RP - Dev from the repo into Minecraft "development_*_packs" folders
 * that share the same pack UUID (e.g. legacy "MapleBear TakeOver BP" + renamed folder).
 *
 * Bridge / git edits do NOT update the game until this runs or you re-export .mcpack.
 *
 *   npm run sync:dev-to-minecraft
 *   node tools/syncDevPackToMinecraft.js --dry-run
 */
import { cpSync, existsSync, readdirSync, readFileSync, statSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");

function getMojangDir() {
    if (process.platform === "win32") {
        const appData = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
        return join(appData, "Minecraft Bedrock", "Users", "Shared", "games", "com.mojang");
    }
    if (process.platform === "darwin") {
        return join(
            homedir(),
            "Library",
            "Application Support",
            "mcpatched",
            "Minecraft Bedrock",
            "games",
            "com.mojang"
        );
    }
  return join(homedir(), ".local", "share", "minecraft-bedrock", "games", "com.mojang");
}

function readHeaderUuid(manifestPath) {
    const raw = JSON.parse(readFileSync(manifestPath, "utf8"));
    const uuid = raw?.header?.uuid;
    if (!uuid || typeof uuid !== "string") {
        throw new Error(`No header.uuid in ${manifestPath}`);
    }
    return uuid.toLowerCase();
}

function findPackDirsByUuid(parentDir, targetUuid) {
    const hits = [];
    if (!existsSync(parentDir)) return hits;
    for (const name of readdirSync(parentDir)) {
        const dir = join(parentDir, name);
        try {
            if (!statSync(dir).isDirectory()) continue;
            const manifest = join(dir, "manifest.json");
            if (!existsSync(manifest)) continue;
            if (readHeaderUuid(manifest) === targetUuid) hits.push(dir);
        } catch {
            /* skip unreadable entries */
        }
    }
    return hits;
}

function copyPackContents(srcRoot, destRoot) {
    for (const name of readdirSync(srcRoot)) {
        const src = join(srcRoot, name);
        const dest = join(destRoot, name);
        if (!dryRun) {
            cpSync(src, dest, { recursive: true, force: true });
        }
    }
}

function syncPair({ label, srcRoot, packsSubdir, manifestPath }) {
    if (!existsSync(srcRoot)) {
        console.error(`Missing source: ${srcRoot}`);
        process.exit(1);
    }
    const uuid = readHeaderUuid(manifestPath);
    const mojang = getMojangDir();
    const packsDir = join(mojang, packsSubdir);
    const targets = findPackDirsByUuid(packsDir, uuid);

    console.log(`\n${label} (uuid ${uuid})`);
    console.log(`  Source: ${srcRoot}`);
    console.log(`  Scan:   ${packsDir}`);

    if (!targets.length) {
        console.warn(`  No development pack folders found — export from Bridge once, then re-run.`);
        return 0;
    }

    for (const dest of targets) {
        console.log(dryRun ? `  [dry-run] Would sync → ${dest}` : `  Syncing → ${dest}`);
        copyPackContents(srcRoot, dest);
    }
    return targets.length;
}

const bpSrc = join(root, "BP - Dev");
const rpSrc = join(root, "RP - Dev");
const bpCount = syncPair({
    label: "Behavior pack",
    srcRoot: bpSrc,
    packsSubdir: "development_behavior_packs",
    manifestPath: join(bpSrc, "manifest.json")
});
const rpCount = syncPair({
    label: "Resource pack",
    srcRoot: rpSrc,
    packsSubdir: "development_resource_packs",
    manifestPath: join(rpSrc, "manifest.json")
});

if (bpCount + rpCount === 0) {
    process.exit(1);
}

console.log(
    dryRun
        ? `\n[dry-run] Would update ${bpCount} behavior + ${rpCount} resource folder(s).`
        : `\nDone. Updated ${bpCount} behavior + ${rpCount} resource folder(s). Rejoin the world (fully exit to menu first).`
);
