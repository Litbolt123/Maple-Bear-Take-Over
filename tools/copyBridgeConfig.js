/**
 * Copy a Bridge config template to repo-root config.json.
 * Usage: node tools/copyBridgeConfig.js dev|release [--sync-names]
 *
 * --sync-names: patch name, description, simpleRewrite.packName from BP/scripts/mb_buildConfig.js
 */
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const flavor = process.argv[2];
const syncNames = process.argv.includes("--sync-names");

if (flavor !== "dev" && flavor !== "release") {
    console.error("Usage: node tools/copyBridgeConfig.js <dev|release> [--sync-names]");
    process.exit(1);
}

const templatePath = join(root, "config", flavor, "bridge.json");
const destPath = join(root, "config.json");
const config = JSON.parse(readFileSync(templatePath, "utf8"));

if (syncNames) {
    const buildConfigPath = join(
        root,
        flavor === "dev" ? "BP - Dev/scripts/mb_buildConfig.js" : "BP/scripts/mb_buildConfig.js"
    );
    const src = readFileSync(buildConfigPath, "utf8");
    const readConst = (name, fallback = "") => {
        const m = src.match(new RegExp(`export const ${name} = ["']([^"']+)["']`));
        return m ? m[1] : fallback;
    };
    const readPrerelease = () => {
        const m = src.match(/export const ADDON_VERSION_PRERELEASE = ["']([^"']*)["']/);
        return m ? m[1] : "";
    };
    const major = Number((src.match(/export const ADDON_VERSION_MAJOR = (\d+)/) || [])[1] || 0);
    const minor = Number((src.match(/export const ADDON_VERSION_MINOR = (\d+)/) || [])[1] || 0);
    const patch = Number((src.match(/export const ADDON_VERSION_PATCH = (\d+)/) || [])[1] || 0);
    const pre = readPrerelease();
    const core = `${major}.${minor}.${patch}`;
    const semver = pre ? `${core}-${pre}` : core;
    const display = flavor === "dev"
        ? readConst("PACK_DISPLAY_NAME_DEV", "The Maple Bear Apocalypse (Dev)")
        : readConst("PACK_DISPLAY_NAME", "The Maple Bear Apocalypse");
    const packName = readConst("PACK_DISPLAY_NAME", "The Maple Bear Apocalypse");

    config.name = flavor === "dev" ? "M.B.A (Dev)" : "M.B.A";
    config.description = `${display} — v${semver}. Don't do drugs kids...`;
    for (const entry of config.compiler?.plugins ?? []) {
        if (Array.isArray(entry) && entry[0] === "simpleRewrite" && entry[1]) {
            entry[1].packName = packName;
        }
    }
}

writeFileSync(destPath, JSON.stringify(config, null, "\t") + "\n", "utf8");
console.log(`Copied ${templatePath} -> ${destPath}${syncNames ? " (names synced from mb_buildConfig.js)" : ""}`);
