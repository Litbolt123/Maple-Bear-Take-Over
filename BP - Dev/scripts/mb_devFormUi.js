/** ActionForm back control — avoid §7/§8 on buttons (low contrast on Bedrock button chrome). */
export const DEV_BTN_BACK = "§f← Back";

/** @param {string} label Short parent menu name, e.g. "script toggles" */
export function devBtnBackTo(label) {
    return `§f← ${label}`;
}

/** Secondary line on a button — white, readable on button background. */
export function devBtnSub(text) {
    return `§f${text}`;
}

/** Parenthetical hint on a button, e.g. devBtnParen("action bar") → " §f(action bar)" */
export function devBtnParen(text) {
    return ` §f(${text})`;
}

/** Mid-dot separator between title and hint on a button. */
export const DEV_BTN_DOT = " §f· ";
