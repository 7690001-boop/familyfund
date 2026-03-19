// ============================================================
// Jar — savings container SVG renderer
// Kids can pick their savings "jar" type via the jar modal.
// ============================================================

import t from '../../i18n.js';

export const JAR_TYPES = ['glass', 'piggy', 'bag', 'chest', 'safe'];

export const JAR_LABELS = {
    glass: t.jar.glass,
    piggy: t.jar.piggy,
    bag:   t.jar.bag,
    chest: t.jar.chest,
    safe:  t.jar.safe,
};

const JARS = {
    glass: (w, h) => `<svg viewBox="0 0 56 66" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
        <rect x="20" y="5" width="16" height="7" rx="3.5" fill="#d63031"/>
        <rect x="13" y="10" width="30" height="10" rx="5" fill="#e17055"/>
        <rect x="10" y="18" width="36" height="43" rx="11" fill="#dfe6e9" stroke="#b2bec3" stroke-width="1.5"/>
        <ellipse cx="28" cy="51" rx="13" ry="5" fill="#fdcb6e" opacity="0.65"/>
        <ellipse cx="28" cy="45" rx="13" ry="5" fill="#fdcb6e"/>
        <ellipse cx="28" cy="39" rx="13" ry="5" fill="#f0d060" opacity="0.85"/>
        <path d="M16 23 Q20 20 23 24" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round" opacity="0.45"/>
        <rect x="25" y="11" width="6" height="4" rx="2" fill="#2d3436" opacity="0.2"/>
    </svg>`,

    piggy: (w, h) => `<svg viewBox="0 0 66 62" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="31" cy="38" rx="23" ry="18" fill="#ffb8d4" stroke="#ff6fab" stroke-width="1.5"/>
        <circle cx="51" cy="27" rx="13" ry="12" fill="#ffb8d4" stroke="#ff6fab" stroke-width="1.5"/>
        <ellipse cx="56" cy="31" rx="6" ry="4.5" fill="#ffdce8" stroke="#ff6fab" stroke-width="1"/>
        <circle cx="54.5" cy="32" r="1.3" fill="#cc3366" opacity="0.5"/>
        <circle cx="57.5" cy="32" r="1.3" fill="#cc3366" opacity="0.5"/>
        <circle cx="49" cy="22" r="2.8" fill="white" stroke="#ff6fab" stroke-width="0.5"/>
        <circle cx="49.5" cy="22" r="1.3" fill="#333"/>
        <ellipse cx="44" cy="15" rx="4.5" ry="5.5" fill="#ff6fab"/>
        <ellipse cx="44" cy="16.5" rx="2.8" ry="3.5" fill="#ffdce8"/>
        <rect x="24" y="21" width="10" height="3.5" rx="1.75" fill="#cc3366" opacity="0.3"/>
        <rect x="10" y="50" width="9" height="10" rx="4.5" fill="#ffb8d4" stroke="#ff6fab" stroke-width="1"/>
        <rect x="22" y="50" width="9" height="10" rx="4.5" fill="#ffb8d4" stroke="#ff6fab" stroke-width="1"/>
        <rect x="35" y="50" width="9" height="10" rx="4.5" fill="#ffb8d4" stroke="#ff6fab" stroke-width="1"/>
        <path d="M8 38 Q4 34 7 30 Q10 26 8 22" stroke="#ff6fab" stroke-width="2" fill="none" stroke-linecap="round"/>
    </svg>`,

    bag: (w, h) => `<svg viewBox="0 0 56 66" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
        <path d="M24 18 Q28 8 32 18" stroke="#a07800" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M13 32 Q10 52 14 60 Q20 66 28 66 Q36 66 42 60 Q46 52 43 32 Q39 22 28 22 Q17 22 13 32Z"
              fill="#fdcb6e" stroke="#e0a000" stroke-width="1.5"/>
        <path d="M17 34 Q19 29 23 32" stroke="white" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.5"/>
        <text x="28" y="53" text-anchor="middle" font-size="18" font-weight="bold" fill="#c08000" opacity="0.85" font-family="sans-serif">₪</text>
    </svg>`,

    chest: (w, h) => `<svg viewBox="0 0 64 58" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
        <rect x="6" y="30" width="52" height="24" rx="5" fill="#8B5E3C" stroke="#6B4423" stroke-width="1.5"/>
        <path d="M6 30 Q6 12 32 12 Q58 12 58 30 Z" fill="#A0714F" stroke="#6B4423" stroke-width="1.5"/>
        <rect x="6" y="28" width="52" height="5" fill="#DAA520" opacity="0.7"/>
        <rect x="6" y="38" width="52" height="5" fill="#8B8000" opacity="0.45"/>
        <rect x="26" y="30" width="12" height="11" rx="3" fill="#DAA520" stroke="#B8860B" stroke-width="1"/>
        <circle cx="32" cy="33" r="3.5" fill="#B8860B" stroke="#8B6914" stroke-width="1"/>
        <ellipse cx="18" cy="30" rx="5" ry="2" fill="#fdcb6e" opacity="0.85"/>
        <ellipse cx="46" cy="30" rx="5" ry="2" fill="#fdcb6e" opacity="0.85"/>
        <path d="M14 18 Q16 14 20 16" stroke="white" stroke-width="1.5" fill="none" stroke-linecap="round" opacity="0.4"/>
    </svg>`,

    safe: (w, h) => `<svg viewBox="0 0 60 64" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
        <rect x="6" y="6" width="48" height="52" rx="7" fill="#636e72" stroke="#2d3436" stroke-width="1.5"/>
        <rect x="10" y="10" width="40" height="44" rx="5" fill="#74b9ff" stroke="#0984e3" stroke-width="1.5"/>
        <path d="M14 14 Q16 12 19 14" stroke="white" stroke-width="1.5" fill="none" stroke-linecap="round" opacity="0.4"/>
        <circle cx="30" cy="32" r="11" fill="#b2bec3" stroke="#636e72" stroke-width="2"/>
        <circle cx="30" cy="32" r="7" fill="#dfe6e9" stroke="#636e72" stroke-width="1.5"/>
        <line x1="30" y1="22" x2="30" y2="26" stroke="#2d3436" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="30" y1="38" x2="30" y2="42" stroke="#2d3436" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="20" y1="32" x2="24" y2="32" stroke="#2d3436" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="36" y1="32" x2="40" y2="32" stroke="#2d3436" stroke-width="1.5" stroke-linecap="round"/>
        <circle cx="30" cy="32" r="2.5" fill="#2d3436"/>
        <rect x="10" y="16" width="4" height="9" rx="2" fill="#636e72"/>
        <rect x="10" y="39" width="4" height="9" rx="2" fill="#636e72"/>
    </svg>`,
};

export function renderJar(type = 'glass', size = 64) {
    const fn = JARS[type] || JARS.glass;
    const h = Math.round(size * 1.1);
    return fn(size, h);
}
