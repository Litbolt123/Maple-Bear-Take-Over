/**
 * Fix U+009D→§ collateral: stray § where bullets/arrows/ellipsis/parens were lost.
 * Run: node tools/fixCodexStraySectionSigns.js
 */
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const paths = [
    join(root, "BP - Dev/scripts/mb_codex.js"),
    join(root, "BP/scripts/mb_codex.js")
];

function fixCodexGlyphs(s) {
    let n = 0;
    const rep = (pattern, replacement) => {
        const next = s.replace(pattern, replacement);
        if (next !== s) {
            const matches = s.match(pattern);
            n += matches ? matches.length : 0;
            s = next;
        }
    };

    // List bullets: §7§ / §8§ → bullet
    rep(/§([78])§ /g, "§$1• ");

    // §f§ / §e§ mid-label (was arrow or separator)
    rep(/§([fe])§ /g, "§$1");

    // devBtnParen("...§")
    rep(/devBtnParen\("([^"]*)§"\)/g, 'devBtnParen("$1")');

    // Button / label strings ending with stray § before closing quote
    rep(/(button\("[^"]*)§"\)/g, '$1")');
    rep(/(label: `[^`]*)§`/g, "$1`");
    rep(/(label: "[^"]*)§"/g, '$1"');

    // Truncation ellipsis
    rep(/\+ "§8§"/g, '+ "§8…"');
    rep(/\+ "§"/g, '+ "…"');
    rep(/: "§"/g, ': "…"');

    // Spawn menu typos
    rep(/§fSpawn § World/g, "§fSpawn & World");
    rep(/}§\)/g, "})");
    rep(/§\)/g, ")");

    // Settings sub-toggle leading ? (was →)
    rep(/§8\? /g, "§8  ");

    // Journal body arrows
    rep(/ § §e/g, " → §e");
    rep(/ § §8/g, " → §8");
    rep(/you§ adjust/g, "you — adjust");
    rep(/temporary§the/g, "temporary — the");

    // Time summary placeholder
    rep(/§eTime: §c§`/g, "§eTime: §c???`");

    // Pin label
    rep(/Set day§/g, "Set day…");

    // Median ms placeholder
    rep(/: "§";/g, ': "…";');

    // Stray § before template interpolations (was formatting separator)
    rep(/§f§\$\{/g, "§f${");
    rep(/§\$\{/g, "${");

    // Manual preset labels
    rep(/}§ manual/g, "} manual");
    rep(/§ manual/g, " manual");

    // Breadcrumb arrows (corrupted → became ?)
    rep(/Spawn \? World tuning \?/g, "Spawn → World tuning →");
    rep(/Spawn Controller \? Auto/g, "Spawn Controller → Auto");
    rep(/Storm & mining \? §f/g, "Storm & mining → §f");
    rep(/storm & mining \? Auto/g, "storm & mining → Auto");
    rep(/§7\? camera/g, "§7→ camera");
    rep(/§7\? interval/g, "§7→ interval");

    // Status / achievement checkmarks
    rep(/§a\?/g, "§a✓");
    rep(/§c\?/g, "§c✗");
    rep(/§e\? Caution/g, "§e⚠ Caution");

    // Range / multiplier suffixes
    rep(/\(0§4\)/g, "(0–4)");
    rep(/\}§\./g, "}x.");
    rep(/(\d)§,/g, "$1x,");
    rep(/scan §\$\{/g, "scan ${");
    rep(/§ \|/g, " |");

    return { text: s, count: n };
}

for (const p of paths) {
    const raw = readFileSync(p, "utf8");
    const { text, count } = fixCodexGlyphs(raw);
    writeFileSync(p, text, "utf8");
    console.log(p, "replacements", count);
}
