/**
 * Sync pack display name + semver from BP/scripts/mb_buildConfig.js into:
 *   - BP/RP (+ Dev) manifest.json
 *   - Bridge project config.json (repo root — Bridge only, not Minecraft runtime)
 * Parses mb_buildConfig (does not import) so release console silencing is not triggered.
 *
 * Run before Bridge export: npm run sync:pack-metadata
 */
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildConfigPath = join(root, "BP/scripts/mb_buildConfig.js");
const devBuildConfigPath = join(root, "BP - Dev/scripts/mb_buildConfig.js");
const src = readFileSync(buildConfigPath, "utf8");
const devSrc = readFileSync(devBuildConfigPath, "utf8");

function readPrereleaseFromSource(text, fallback = "") {
    const m = text.match(/export const ADDON_VERSION_PRERELEASE = ["']([^"']*)["']/);
    return m ? m[1] : fallback;
}

function readConst(name, fallback = "") {
    const m = src.match(new RegExp(`export const ${name} = ["']([^"']+)["']`));
    return m ? m[1] : fallback;
}

function readNum(name) {
    const m = src.match(new RegExp(`export const ${name} = (\\d+)`));
    return m ? Number(m[1]) : 0;
}

const PACK_DISPLAY_NAME = readConst("PACK_DISPLAY_NAME", "The Maple Bear Apocalypse");
const PACK_DISPLAY_NAME_DEV = readConst("PACK_DISPLAY_NAME_DEV", `${PACK_DISPLAY_NAME} (Dev)`);
const ADDON_VERSION_MAJOR = readNum("ADDON_VERSION_MAJOR");
const ADDON_VERSION_MINOR = readNum("ADDON_VERSION_MINOR");
const ADDON_VERSION_PATCH = readNum("ADDON_VERSION_PATCH");
const prereleaseMatch = src.match(/export const ADDON_VERSION_PRERELEASE = ["']([^"']*)["']/);
const ADDON_VERSION_PRERELEASE = prereleaseMatch ? prereleaseMatch[1] : "";
const DEV_ADDON_VERSION_PRERELEASE = readPrereleaseFromSource(devSrc, ADDON_VERSION_PRERELEASE);

const core = `${ADDON_VERSION_MAJOR}.${ADDON_VERSION_MINOR}.${ADDON_VERSION_PATCH}`;
const semver = ADDON_VERSION_PRERELEASE ? `${core}-${ADDON_VERSION_PRERELEASE}` : core;
const devSemver = DEV_ADDON_VERSION_PRERELEASE ? `${core}-${DEV_ADDON_VERSION_PRERELEASE}` : semver;
const versionTriple = [ADDON_VERSION_MAJOR, ADDON_VERSION_MINOR, ADDON_VERSION_PATCH];

function releaseDescription(kind) {
    if (kind === "behavior") {
        return `v${semver} — ${PACK_DISPLAY_NAME} (release). Host tools on cheats; no full dev menus.`;
    }
    return `v${semver} — ${PACK_DISPLAY_NAME} (resource pack, release).`;
}

function devDescription(kind) {
    if (kind === "behavior") {
        return `v${devSemver} — ${PACK_DISPLAY_NAME_DEV}. Full developer tools.`;
    }
    return `v${devSemver} — ${PACK_DISPLAY_NAME_DEV} (resource pack).`;
}

function patchManifest(path, { name, description }) {
    const data = JSON.parse(readFileSync(path, "utf8"));
    data.header.name = name;
    data.header.description = description;
    data.header.version = [...versionTriple];
    for (const mod of data.modules ?? []) {
        if (Array.isArray(mod.version)) {
            mod.version = [...versionTriple];
        }
    }
    if (Array.isArray(data.dependencies)) {
        for (const dep of data.dependencies) {
            if (Array.isArray(dep.version) && dep.module_name == null) {
                dep.version = [...versionTriple];
            }
        }
    }
    writeFileSync(path, JSON.stringify(data, null, "\t") + "\n", "utf8");
    console.log(`Updated ${path}`);
}

patchManifest(join(root, "BP/manifest.json"), {
    name: PACK_DISPLAY_NAME,
    description: releaseDescription("behavior")
});
patchManifest(join(root, "RP/manifest.json"), {
    name: PACK_DISPLAY_NAME,
    description: releaseDescription("resource")
});
patchManifest(join(root, "BP - Dev/manifest.json"), {
    name: PACK_DISPLAY_NAME_DEV,
    description: devDescription("behavior")
});
patchManifest(join(root, "RP - Dev/manifest.json"), {
    name: PACK_DISPLAY_NAME_DEV,
    description: devDescription("resource")
});

const configPath = join(root, "config.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));
config.name = PACK_DISPLAY_NAME;
config.description = `${PACK_DISPLAY_NAME} — v${semver}. Don't do drugs kids...`;
for (const entry of config.compiler?.plugins ?? []) {
    if (Array.isArray(entry) && entry[0] === "simpleRewrite" && entry[1]) {
        entry[1].packName = PACK_DISPLAY_NAME;
    }
}
writeFileSync(configPath, JSON.stringify(config, null, "\t") + "\n", "utf8");
console.log(`Updated ${configPath}`);

console.log(
    `\nDone. Release: v${semver}. Dev packs: v${devSemver}. Manifest version: [${versionTriple.join(", ")}].`
);
