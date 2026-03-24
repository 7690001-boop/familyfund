// ============================================================
// Avatar Renderer — generates SVG avatars from config objects
// Stored as JSON on member docs, rendered as inline SVG
// ============================================================

import t from '../../i18n.js';

// Default avatar config
export const DEFAULT_AVATAR = {
    skin: '#F5D0A8',
    faceShape: 'round',
    hair: 'short',
    hairColor: '#4A3728',
    eyes: 'happy',
    eyeColor: '#5D4037',
    eyebrows: 'normal',
    mouth: 'smile',
    accessories: [],
    glasses: 'none',
    freckles: false,
    bgColor: '#E8DAEF',
    shoulders: 'none',
};

export const SKIN_COLORS = [
    '#FDEBD5', // porcelain
    '#F5D0A8', // ivory
    '#EFBA82', // light peach
    '#E09E60', // warm sand
    '#C98040', // golden
    '#B06828', // honey
    '#8C5220', // tan
    '#6E3E18', // caramel
    '#532E10', // brown
    '#3C2008', // deep brown
    '#281408', // dark
    '#180C06', // deepest
];

export const EYE_COLORS = [
    '#5D4037', '#2d3436', '#1565C0', '#2E7D32', '#6A1B9A',
    '#BF360C', '#00838F', '#F57F17', '#AD1457',
];

export const HAIR_COLORS = [
    '#4A3728', '#1C1107', '#C9872E', '#E2C044', '#D35400', '#922B21',
    '#6C3483', '#2E86C1', '#E74C8B', '#1ABC9C', '#ECF0F1',
];

export const BG_COLORS = [
    '#E8DAEF', '#D5F5E3', '#FADBD8', '#D6EAF8', '#FEF9E7',
    '#F9E79F', '#D2B4DE', '#A9DFBF', '#F5B7B1', '#AED6F1',
    '#F0E6FF', '#E0F7FA', '#FFF3E0', '#FCE4EC',
];

export const FACE_SHAPE_OPTIONS = ['round', 'oval', 'square', 'heart', 'diamond', 'wide', 'chubby'];
export const EYES_OPTIONS      = ['happy', 'round', 'wink', 'cool', 'big', 'sleepy', 'heart', 'stars', 'lashes', 'dizzy', 'spiral', 'teary', 'angry'];
export const EYEBROW_OPTIONS   = ['normal', 'raised', 'angry', 'thick', 'worried', 'none'];
export const MOUTH_OPTIONS     = ['smile', 'grin', 'tongue', 'neutral', 'surprised', 'cat', 'kiss', 'teeth', 'smirk', 'fangs', 'sad', 'open'];
export const HAIR_OPTIONS      = ['short', 'pixie', 'buzz', 'spiky', 'mohawk', 'curly', 'wavy', 'lob', 'long', 'sidepart', 'curtain', 'bun', 'twin-buns', 'ponytail', 'pigtails', 'side-braid', 'braids', 'afro', 'none'];
export const ACCESSORY_OPTIONS = ['hat', 'crown', 'bow', 'headband', 'flower', 'star', 'cap', 'beanie', 'earrings', 'bandana', 'tiara', 'butterfly', 'hearts', 'monocle', 'necklace', 'scarf'];
export const GLASSES_OPTIONS   = ['none', 'round', 'square', 'cat-eye', 'aviator', 'heart-glasses'];
export const SHOULDERS_OPTIONS = ['none', 'plain', 'tshirt', 'hoodie', 'collar', 'dress'];

export const LABELS            = t.avatar.labels;
export const FACE_SHAPE_LABELS = t.avatar.faceShapes;
export const EYES_LABELS       = t.avatar.eyes;
export const EYEBROW_LABELS    = t.avatar.eyebrows;
export const MOUTH_LABELS      = t.avatar.mouths;
export const HAIR_LABELS       = t.avatar.hair;
export const ACCESSORY_LABELS  = t.avatar.accessories;
export const GLASSES_LABELS    = t.avatar.glasses;
export const SHOULDERS_LABELS  = t.avatar.shoulders;

// ---- SVG Part Generators ----

let _rid = 0; // unique ID prefix per render call

function headShape(skin, shape) {
    // Subtle forehead highlight + chin shadow for depth
    const highlight = `<ellipse cx="46" cy="40" rx="20" ry="14" fill="white" opacity="0.11"/>`;
    const chinShadow = `<ellipse cx="62" cy="95" rx="26" ry="9" fill="black" opacity="0.055"/>`;
    switch (shape) {
        case 'oval':
            return `<ellipse cx="60" cy="62" rx="35" ry="44" fill="${skin}"/>${chinShadow}${highlight}`;
        case 'square':
            return `<rect x="24" y="22" width="72" height="80" rx="22" fill="${skin}"/>${chinShadow}${highlight}`;
        case 'heart':
            return `<path d="M60 104 Q24 80 24 50 Q24 24 42 22 Q52 20 60 32 Q68 20 78 22 Q96 24 96 50 Q96 80 60 104Z" fill="${skin}"/>${chinShadow}${highlight}`;
        case 'diamond':
            return `<path d="M60 20 Q90 34 94 60 Q94 82 78 98 Q68 108 60 108 Q52 108 42 98 Q26 82 26 60 Q30 34 60 20Z" fill="${skin}"/>${chinShadow}${highlight}`;
        case 'wide':
            return `<ellipse cx="60" cy="64" rx="44" ry="38" fill="${skin}"/>${chinShadow}${highlight}`;
        case 'chubby':
            return `
                <ellipse cx="60" cy="66" rx="40" ry="44" fill="${skin}"/>
                <ellipse cx="22" cy="70" rx="11" ry="9" fill="${skin}"/>
                <ellipse cx="98" cy="70" rx="11" ry="9" fill="${skin}"/>
                ${chinShadow}${highlight}
            `;
        case 'round':
        default:
            return `<ellipse cx="60" cy="62" rx="38" ry="42" fill="${skin}"/>${chinShadow}${highlight}`;
    }
}

function ears(skin, faceShape) {
    const lx = faceShape === 'wide' ? 15 : 22;
    const rx = faceShape === 'wide' ? 105 : 98;
    return `
        <ellipse cx="${lx}" cy="62" rx="7.5" ry="10.5" fill="${skin}"/>
        <ellipse cx="${lx}" cy="63" rx="4.5" ry="7" fill="black" opacity="0.08"/>
        <ellipse cx="${lx}" cy="63" rx="2.5" ry="4" fill="black" opacity="0.05"/>
        <ellipse cx="${rx}" cy="62" rx="7.5" ry="10.5" fill="${skin}"/>
        <ellipse cx="${rx}" cy="63" rx="4.5" ry="7" fill="black" opacity="0.08"/>
        <ellipse cx="${rx}" cy="63" rx="2.5" ry="4" fill="black" opacity="0.05"/>
    `;
}

function eyebrowsPart(type, hairColor) {
    const left = { cx: 45, cy: 46 };
    const right = { cx: 75, cy: 46 };
    // Use a darkened version of the hair color for eyebrows
    const bc = hairColor || '#2d3436';

    switch (type) {
        case 'normal':
            return `
                <path d="M${left.cx - 7} ${left.cy} Q${left.cx} ${left.cy - 5} ${left.cx + 7} ${left.cy}" fill="none" stroke="${bc}" stroke-width="2" stroke-linecap="round" opacity="0.65"/>
                <path d="M${right.cx - 7} ${right.cy} Q${right.cx} ${right.cy - 5} ${right.cx + 7} ${right.cy}" fill="none" stroke="${bc}" stroke-width="2" stroke-linecap="round" opacity="0.65"/>
            `;
        case 'raised':
            return `
                <path d="M${left.cx - 7} ${left.cy + 1} Q${left.cx} ${left.cy - 8} ${left.cx + 7} ${left.cy}" fill="none" stroke="${bc}" stroke-width="2" stroke-linecap="round" opacity="0.65"/>
                <path d="M${right.cx - 7} ${right.cy} Q${right.cx} ${right.cy - 8} ${right.cx + 7} ${right.cy + 1}" fill="none" stroke="${bc}" stroke-width="2" stroke-linecap="round" opacity="0.65"/>
            `;
        case 'angry':
            return `
                <path d="M${left.cx - 7} ${left.cy - 3} Q${left.cx} ${left.cy} ${left.cx + 7} ${left.cy + 2}" fill="none" stroke="${bc}" stroke-width="2.4" stroke-linecap="round" opacity="0.7"/>
                <path d="M${right.cx - 7} ${right.cy + 2} Q${right.cx} ${right.cy} ${right.cx + 7} ${right.cy - 3}" fill="none" stroke="${bc}" stroke-width="2.4" stroke-linecap="round" opacity="0.7"/>
            `;
        case 'thick':
            return `
                <path d="M${left.cx - 8} ${left.cy} Q${left.cx} ${left.cy - 6} ${left.cx + 8} ${left.cy}" fill="none" stroke="${bc}" stroke-width="3.5" stroke-linecap="round" opacity="0.65"/>
                <path d="M${right.cx - 8} ${right.cy} Q${right.cx} ${right.cy - 6} ${right.cx + 8} ${right.cy}" fill="none" stroke="${bc}" stroke-width="3.5" stroke-linecap="round" opacity="0.65"/>
            `;
        case 'worried':
            return `
                <path d="M${left.cx - 7} ${left.cy - 2} Q${left.cx} ${left.cy + 2} ${left.cx + 7} ${left.cy - 4}" fill="none" stroke="${bc}" stroke-width="2" stroke-linecap="round" opacity="0.65"/>
                <path d="M${right.cx - 7} ${right.cy - 4} Q${right.cx} ${right.cy + 2} ${right.cx + 7} ${right.cy - 2}" fill="none" stroke="${bc}" stroke-width="2" stroke-linecap="round" opacity="0.65"/>
            `;
        case 'none':
            return '';
        default:
            return eyebrowsPart('normal', hairColor);
    }
}

function eyesPart(type, eyeColor) {
    const left = { cx: 45, cy: 56 };
    const right = { cx: 75, cy: 56 };
    const ec = eyeColor || '#5D4037';

    // Helper: draws a detailed eye (iris + pupil + highlights)
    function detailedEye(cx, cy, rxOuter, ryOuter) {
        const r = Math.min(rxOuter, ryOuter);
        const irisR = r * 0.62;
        const pupilR = irisR * 0.55;
        const hl1R = pupilR * 0.75;
        const hl2R = hl1R * 0.5;
        return `
            <ellipse cx="${cx}" cy="${cy + 0.5}" rx="${rxOuter + 0.5}" ry="${ryOuter + 0.5}" fill="black" opacity="0.07"/>
            <ellipse cx="${cx}" cy="${cy}" rx="${rxOuter}" ry="${ryOuter}" fill="white"/>
            <circle cx="${cx}" cy="${cy}" r="${irisR}" fill="${ec}"/>
            <circle cx="${cx}" cy="${cy}" r="${pupilR}" fill="black" opacity="0.88"/>
            <circle cx="${cx + irisR * 0.52}" cy="${cy - irisR * 0.48}" r="${hl1R}" fill="white"/>
            <circle cx="${cx - irisR * 0.3}" cy="${cy + irisR * 0.35}" r="${hl2R}" fill="white" opacity="0.55"/>
        `;
    }

    switch (type) {
        case 'happy':
            return `
                <path d="M${left.cx - 7} ${left.cy} Q${left.cx} ${left.cy - 10} ${left.cx + 7} ${left.cy}" fill="${ec}" opacity="0.14"/>
                <path d="M${left.cx - 7} ${left.cy} Q${left.cx} ${left.cy - 10} ${left.cx + 7} ${left.cy}" fill="none" stroke="${ec}" stroke-width="2.8" stroke-linecap="round"/>
                <circle cx="${left.cx + 4}" cy="${left.cy - 4}" r="1.1" fill="white" opacity="0.75"/>
                <path d="M${right.cx - 7} ${right.cy} Q${right.cx} ${right.cy - 10} ${right.cx + 7} ${right.cy}" fill="${ec}" opacity="0.14"/>
                <path d="M${right.cx - 7} ${right.cy} Q${right.cx} ${right.cy - 10} ${right.cx + 7} ${right.cy}" fill="none" stroke="${ec}" stroke-width="2.8" stroke-linecap="round"/>
                <circle cx="${right.cx + 4}" cy="${right.cy - 4}" r="1.1" fill="white" opacity="0.75"/>
            `;
        case 'round':
            return detailedEye(left.cx, left.cy, 6.5, 6.5) + detailedEye(right.cx, right.cy, 6.5, 6.5);
        case 'wink':
            return `
                ${detailedEye(left.cx, left.cy, 6.5, 6.5)}
                <path d="M${right.cx - 7} ${right.cy} Q${right.cx} ${right.cy - 10} ${right.cx + 7} ${right.cy}" fill="${ec}" opacity="0.14"/>
                <path d="M${right.cx - 7} ${right.cy} Q${right.cx} ${right.cy - 10} ${right.cx + 7} ${right.cy}" fill="none" stroke="${ec}" stroke-width="2.8" stroke-linecap="round"/>
            `;
        case 'cool':
            return `
                <rect x="${left.cx - 11}" y="${left.cy - 6}" width="22" height="13" rx="4" fill="#1e1e1e"/>
                <rect x="${right.cx - 11}" y="${right.cy - 6}" width="22" height="13" rx="4" fill="#1e1e1e"/>
                <line x1="${left.cx + 11}" y1="${right.cy}" x2="${right.cx - 11}" y2="${right.cy}" stroke="#1e1e1e" stroke-width="2.2"/>
                <line x1="22" y1="${left.cy}" x2="${left.cx - 11}" y2="${left.cy}" stroke="#1e1e1e" stroke-width="2.2"/>
                <line x1="${right.cx + 11}" y1="${right.cy}" x2="98" y2="${right.cy}" stroke="#1e1e1e" stroke-width="2.2"/>
                <rect x="${left.cx - 9}" y="${left.cy - 4}" width="18" height="9" rx="3" fill="#636e72" opacity="0.45"/>
                <rect x="${right.cx - 9}" y="${right.cy - 4}" width="18" height="9" rx="3" fill="#636e72" opacity="0.45"/>
                <rect x="${left.cx - 4}" y="${left.cy - 4}" width="6" height="5" rx="2" fill="white" opacity="0.08"/>
                <rect x="${right.cx - 4}" y="${right.cy - 4}" width="6" height="5" rx="2" fill="white" opacity="0.08"/>
            `;
        case 'big':
            return detailedEye(left.cx, left.cy, 8, 9) + detailedEye(right.cx, right.cy, 8, 9);
        case 'sleepy':
            return `
                <path d="M${left.cx - 7} ${left.cy + 2} Q${left.cx} ${left.cy - 4} ${left.cx + 7} ${left.cy + 2}" fill="${ec}" opacity="0.12"/>
                <path d="M${left.cx - 7} ${left.cy + 2} Q${left.cx} ${left.cy - 4} ${left.cx + 7} ${left.cy + 2}" fill="none" stroke="${ec}" stroke-width="2.5" stroke-linecap="round"/>
                <path d="M${right.cx - 7} ${right.cy + 2} Q${right.cx} ${right.cy - 4} ${right.cx + 7} ${right.cy + 2}" fill="${ec}" opacity="0.12"/>
                <path d="M${right.cx - 7} ${right.cy + 2} Q${right.cx} ${right.cy - 4} ${right.cx + 7} ${right.cy + 2}" fill="none" stroke="${ec}" stroke-width="2.5" stroke-linecap="round"/>
            `;
        case 'heart':
            return `
                <g transform="translate(${left.cx}, ${left.cy}) scale(0.65)">
                    <path d="M0 5 Q-8 -5 -5 -8 Q-2 -11 0 -5 Q2 -11 5 -8 Q8 -5 0 5Z" fill="#e74c3c"/>
                    <ellipse cx="-1.5" cy="-4" rx="1.5" ry="2" fill="white" opacity="0.3"/>
                </g>
                <g transform="translate(${right.cx}, ${right.cy}) scale(0.65)">
                    <path d="M0 5 Q-8 -5 -5 -8 Q-2 -11 0 -5 Q2 -11 5 -8 Q8 -5 0 5Z" fill="#e74c3c"/>
                    <ellipse cx="-1.5" cy="-4" rx="1.5" ry="2" fill="white" opacity="0.3"/>
                </g>
            `;
        case 'stars':
            return `
                <g transform="translate(${left.cx}, ${left.cy}) scale(0.58)">
                    <polygon points="0,-10 3,-3 10,-3 4.5,2 6.5,10 0,5.5 -6.5,10 -4.5,2 -10,-3 -3,-3" fill="#f1c40f" stroke="#e67e22" stroke-width="0.5"/>
                    <circle cx="0" cy="-2" r="2" fill="white" opacity="0.4"/>
                </g>
                <g transform="translate(${right.cx}, ${right.cy}) scale(0.58)">
                    <polygon points="0,-10 3,-3 10,-3 4.5,2 6.5,10 0,5.5 -6.5,10 -4.5,2 -10,-3 -3,-3" fill="#f1c40f" stroke="#e67e22" stroke-width="0.5"/>
                    <circle cx="0" cy="-2" r="2" fill="white" opacity="0.4"/>
                </g>
            `;
        case 'lashes':
            return `
                ${detailedEye(left.cx, left.cy, 6.5, 6.5)}
                <line x1="${left.cx - 4}" y1="${left.cy - 6.5}" x2="${left.cx - 6.5}" y2="${left.cy - 11}" stroke="#2d3436" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="${left.cx}" y1="${left.cy - 7}" x2="${left.cx}" y2="${left.cy - 11.5}" stroke="#2d3436" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="${left.cx + 4}" y1="${left.cy - 6.5}" x2="${left.cx + 6.5}" y2="${left.cy - 11}" stroke="#2d3436" stroke-width="1.5" stroke-linecap="round"/>
                ${detailedEye(right.cx, right.cy, 6.5, 6.5)}
                <line x1="${right.cx - 4}" y1="${right.cy - 6.5}" x2="${right.cx - 6.5}" y2="${right.cy - 11}" stroke="#2d3436" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="${right.cx}" y1="${right.cy - 7}" x2="${right.cx}" y2="${right.cy - 11.5}" stroke="#2d3436" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="${right.cx + 4}" y1="${right.cy - 6.5}" x2="${right.cx + 6.5}" y2="${right.cy - 11}" stroke="#2d3436" stroke-width="1.5" stroke-linecap="round"/>
            `;
        case 'dizzy':
            return `
                <g transform="translate(${left.cx}, ${left.cy})">
                    <line x1="-6" y1="-6" x2="6" y2="6" stroke="${ec}" stroke-width="2.8" stroke-linecap="round"/>
                    <line x1="6" y1="-6" x2="-6" y2="6" stroke="${ec}" stroke-width="2.8" stroke-linecap="round"/>
                </g>
                <g transform="translate(${right.cx}, ${right.cy})">
                    <line x1="-6" y1="-6" x2="6" y2="6" stroke="${ec}" stroke-width="2.8" stroke-linecap="round"/>
                    <line x1="6" y1="-6" x2="-6" y2="6" stroke="${ec}" stroke-width="2.8" stroke-linecap="round"/>
                </g>
            `;
        case 'spiral':
            function spiralEye(cx, cy) {
                return `
                    <circle cx="${cx}" cy="${cy}" r="7" fill="white" stroke="${ec}" stroke-width="0.5" opacity="0.3"/>
                    <circle cx="${cx}" cy="${cy}" r="6" fill="none" stroke="${ec}" stroke-width="1.8"/>
                    <circle cx="${cx + 2}" cy="${cy - 1}" r="3.5" fill="none" stroke="${ec}" stroke-width="1.5"/>
                    <circle cx="${cx + 3}" cy="${cy - 0.5}" r="1.6" fill="${ec}" opacity="0.85"/>
                    <circle cx="${cx + 3.5}" cy="${cy - 0.5}" r="0.6" fill="white" opacity="0.5"/>
                `;
            }
            return spiralEye(left.cx, left.cy) + spiralEye(right.cx, right.cy);
        case 'teary':
            return `
                ${detailedEye(left.cx, left.cy, 7, 7)}
                <path d="M${left.cx + 1} ${left.cy + 7} Q${left.cx} ${left.cy + 11} ${left.cx + 2} ${left.cy + 15}" fill="none" stroke="#74b9ff" stroke-width="2.5" stroke-linecap="round" opacity="0.85"/>
                <ellipse cx="${left.cx + 2}" cy="${left.cy + 15}" rx="2" ry="2.5" fill="#74b9ff" opacity="0.6"/>
                ${detailedEye(right.cx, right.cy, 7, 7)}
                <path d="M${right.cx + 1} ${right.cy + 7} Q${right.cx} ${right.cy + 11} ${right.cx + 2} ${right.cy + 15}" fill="none" stroke="#74b9ff" stroke-width="2.5" stroke-linecap="round" opacity="0.85"/>
                <ellipse cx="${right.cx + 2}" cy="${right.cy + 15}" rx="2" ry="2.5" fill="#74b9ff" opacity="0.6"/>
            `;
        case 'angry':
            return `
                <ellipse cx="${left.cx}" cy="${left.cy + 1}" rx="7" ry="5" fill="white"/>
                <circle cx="${left.cx}" cy="${left.cy + 1}" r="3.8" fill="${ec}"/>
                <circle cx="${left.cx}" cy="${left.cy + 1}" r="2.2" fill="black" opacity="0.88"/>
                <circle cx="${left.cx + 1.8}" cy="${left.cy - 0.8}" r="0.9" fill="white" opacity="0.6"/>
                <path d="M${left.cx - 7} ${left.cy - 2} Q${left.cx} ${left.cy - 4} ${left.cx + 7} ${left.cy + 2}" fill="${ec}" opacity="0.45"/>
                <ellipse cx="${right.cx}" cy="${right.cy + 1}" rx="7" ry="5" fill="white"/>
                <circle cx="${right.cx}" cy="${right.cy + 1}" r="3.8" fill="${ec}"/>
                <circle cx="${right.cx}" cy="${right.cy + 1}" r="2.2" fill="black" opacity="0.88"/>
                <circle cx="${right.cx + 1.8}" cy="${right.cy - 0.8}" r="0.9" fill="white" opacity="0.6"/>
                <path d="M${right.cx - 7} ${right.cy + 2} Q${right.cx} ${right.cy - 4} ${right.cx + 7} ${right.cy - 2}" fill="${ec}" opacity="0.45"/>
            `;
        default:
            return eyesPart('happy', eyeColor);
    }
}

function glassesPart(type) {
    const left = { cx: 45, cy: 56 };
    const right = { cx: 75, cy: 56 };

    switch (type) {
        case 'none':
            return '';
        case 'round':
            return `
                <circle cx="${left.cx}" cy="${left.cy}" r="11.5" fill="none" stroke="#5D4E37" stroke-width="2.2"/>
                <circle cx="${right.cx}" cy="${right.cy}" r="11.5" fill="none" stroke="#5D4E37" stroke-width="2.2"/>
                <line x1="${left.cx + 11.5}" y1="${left.cy}" x2="${right.cx - 11.5}" y2="${right.cy}" stroke="#5D4E37" stroke-width="2"/>
                <line x1="22" y1="${left.cy - 2}" x2="${left.cx - 11.5}" y2="${left.cy}" stroke="#5D4E37" stroke-width="2"/>
                <line x1="${right.cx + 11.5}" y1="${right.cy}" x2="98" y2="${right.cy - 2}" stroke="#5D4E37" stroke-width="2"/>
                <circle cx="${left.cx}" cy="${left.cy}" r="11.5" fill="black" opacity="0.04"/>
                <circle cx="${right.cx}" cy="${right.cy}" r="11.5" fill="black" opacity="0.04"/>
            `;
        case 'square':
            return `
                <rect x="${left.cx - 12}" y="${left.cy - 9}" width="24" height="17" rx="3.5" fill="none" stroke="#2d3436" stroke-width="2.2"/>
                <rect x="${right.cx - 12}" y="${right.cy - 9}" width="24" height="17" rx="3.5" fill="none" stroke="#2d3436" stroke-width="2.2"/>
                <line x1="${left.cx + 12}" y1="${left.cy}" x2="${right.cx - 12}" y2="${right.cy}" stroke="#2d3436" stroke-width="2"/>
                <line x1="22" y1="${left.cy - 2}" x2="${left.cx - 12}" y2="${left.cy}" stroke="#2d3436" stroke-width="2"/>
                <line x1="${right.cx + 12}" y1="${right.cy}" x2="98" y2="${right.cy - 2}" stroke="#2d3436" stroke-width="2"/>
                <rect x="${left.cx - 12}" y="${left.cy - 9}" width="24" height="17" rx="3.5" fill="black" opacity="0.04"/>
                <rect x="${right.cx - 12}" y="${right.cy - 9}" width="24" height="17" rx="3.5" fill="black" opacity="0.04"/>
            `;
        case 'cat-eye':
            return `
                <path d="M${left.cx - 12} ${left.cy + 6} Q${left.cx - 12} ${left.cy - 8} ${left.cx} ${left.cy - 8} Q${left.cx + 12} ${left.cy - 8} ${left.cx + 12} ${left.cy + 2} Q${left.cx + 12} ${left.cy + 6} ${left.cx} ${left.cy + 6} Q${left.cx - 12} ${left.cy + 6} ${left.cx - 12} ${left.cy + 6}Z" fill="black" opacity="0.05"/>
                <path d="M${left.cx - 12} ${left.cy + 6} Q${left.cx - 12} ${left.cy - 8} ${left.cx} ${left.cy - 8} Q${left.cx + 12} ${left.cy - 8} ${left.cx + 12} ${left.cy + 2} Q${left.cx + 12} ${left.cy + 6} ${left.cx} ${left.cy + 6} Q${left.cx - 12} ${left.cy + 6} ${left.cx - 12} ${left.cy + 6}Z" fill="none" stroke="#e84393" stroke-width="2.2"/>
                <path d="M${right.cx - 12} ${right.cy + 6} Q${right.cx - 12} ${right.cy - 8} ${right.cx} ${right.cy - 8} Q${right.cx + 12} ${right.cy - 8} ${right.cx + 12} ${right.cy + 2} Q${right.cx + 12} ${right.cy + 6} ${right.cx} ${right.cy + 6} Q${right.cx - 12} ${right.cy + 6} ${right.cx - 12} ${right.cy + 6}Z" fill="black" opacity="0.05"/>
                <path d="M${right.cx - 12} ${right.cy + 6} Q${right.cx - 12} ${right.cy - 8} ${right.cx} ${right.cy - 8} Q${right.cx + 12} ${right.cy - 8} ${right.cx + 12} ${right.cy + 2} Q${right.cx + 12} ${right.cy + 6} ${right.cx} ${right.cy + 6} Q${right.cx - 12} ${right.cy + 6} ${right.cx - 12} ${right.cy + 6}Z" fill="none" stroke="#e84393" stroke-width="2.2"/>
                <line x1="${left.cx + 12}" y1="${left.cy}" x2="${right.cx - 12}" y2="${right.cy}" stroke="#e84393" stroke-width="2"/>
                <line x1="22" y1="${left.cy - 4}" x2="${left.cx - 12}" y2="${left.cy - 2}" stroke="#e84393" stroke-width="2"/>
                <line x1="${right.cx + 12}" y1="${right.cy - 2}" x2="98" y2="${right.cy - 4}" stroke="#e84393" stroke-width="2"/>
            `;
        case 'aviator':
            return `
                <path d="M${left.cx - 11} ${left.cy - 7} Q${left.cx - 13} ${left.cy + 2} ${left.cx} ${left.cy + 8} Q${left.cx + 13} ${left.cy + 2} ${left.cx + 11} ${left.cy - 7} Q${left.cx} ${left.cy - 10} ${left.cx - 11} ${left.cy - 7}Z" fill="black" opacity="0.12"/>
                <path d="M${left.cx - 11} ${left.cy - 7} Q${left.cx - 13} ${left.cy + 2} ${left.cx} ${left.cy + 8} Q${left.cx + 13} ${left.cy + 2} ${left.cx + 11} ${left.cy - 7} Q${left.cx} ${left.cy - 10} ${left.cx - 11} ${left.cy - 7}Z" fill="none" stroke="#8B6914" stroke-width="2.2"/>
                <path d="M${right.cx - 11} ${right.cy - 7} Q${right.cx - 13} ${right.cy + 2} ${right.cx} ${right.cy + 8} Q${right.cx + 13} ${right.cy + 2} ${right.cx + 11} ${right.cy - 7} Q${right.cx} ${right.cy - 10} ${right.cx - 11} ${right.cy - 7}Z" fill="black" opacity="0.12"/>
                <path d="M${right.cx - 11} ${right.cy - 7} Q${right.cx - 13} ${right.cy + 2} ${right.cx} ${right.cy + 8} Q${right.cx + 13} ${right.cy + 2} ${right.cx + 11} ${right.cy - 7} Q${right.cx} ${right.cy - 10} ${right.cx - 11} ${right.cy - 7}Z" fill="none" stroke="#8B6914" stroke-width="2.2"/>
                <line x1="${left.cx + 11}" y1="${left.cy - 3}" x2="${right.cx - 11}" y2="${right.cy - 3}" stroke="#8B6914" stroke-width="2"/>
                <line x1="22" y1="${left.cy - 5}" x2="${left.cx - 11}" y2="${left.cy - 6}" stroke="#8B6914" stroke-width="2"/>
                <line x1="${right.cx + 11}" y1="${right.cy - 6}" x2="98" y2="${right.cy - 5}" stroke="#8B6914" stroke-width="2"/>
            `;
        case 'heart-glasses':
            return `
                <path d="M${left.cx} ${left.cy + 5} Q${left.cx - 13} ${left.cy - 4} ${left.cx - 8} ${left.cy - 8} Q${left.cx - 4} ${left.cy - 12} ${left.cx} ${left.cy - 6} Q${left.cx + 4} ${left.cy - 12} ${left.cx + 8} ${left.cy - 8} Q${left.cx + 13} ${left.cy - 4} ${left.cx} ${left.cy + 5}Z" fill="#ff6b8a" opacity="0.25"/>
                <path d="M${left.cx} ${left.cy + 5} Q${left.cx - 13} ${left.cy - 4} ${left.cx - 8} ${left.cy - 8} Q${left.cx - 4} ${left.cy - 12} ${left.cx} ${left.cy - 6} Q${left.cx + 4} ${left.cy - 12} ${left.cx + 8} ${left.cy - 8} Q${left.cx + 13} ${left.cy - 4} ${left.cx} ${left.cy + 5}Z" fill="none" stroke="#e84393" stroke-width="2"/>
                <path d="M${right.cx} ${right.cy + 5} Q${right.cx - 13} ${right.cy - 4} ${right.cx - 8} ${right.cy - 8} Q${right.cx - 4} ${right.cy - 12} ${right.cx} ${right.cy - 6} Q${right.cx + 4} ${right.cy - 12} ${right.cx + 8} ${right.cy - 8} Q${right.cx + 13} ${right.cy - 4} ${right.cx} ${right.cy + 5}Z" fill="#ff6b8a" opacity="0.25"/>
                <path d="M${right.cx} ${right.cy + 5} Q${right.cx - 13} ${right.cy - 4} ${right.cx - 8} ${right.cy - 8} Q${right.cx - 4} ${right.cy - 12} ${right.cx} ${right.cy - 6} Q${right.cx + 4} ${right.cy - 12} ${right.cx + 8} ${right.cy - 8} Q${right.cx + 13} ${right.cy - 4} ${right.cx} ${right.cy + 5}Z" fill="none" stroke="#e84393" stroke-width="2"/>
                <line x1="${left.cx + 8}" y1="${left.cy - 2}" x2="${right.cx - 8}" y2="${right.cy - 2}" stroke="#e84393" stroke-width="1.8"/>
                <line x1="22" y1="${left.cy - 4}" x2="${left.cx - 8}" y2="${left.cy - 4}" stroke="#e84393" stroke-width="1.8"/>
                <line x1="${right.cx + 8}" y1="${right.cy - 4}" x2="98" y2="${right.cy - 4}" stroke="#e84393" stroke-width="1.8"/>
            `;
        default:
            return '';
    }
}

function mouthPart(type) {
    const cx = 60, cy = 76;
    switch (type) {
        case 'smile':
            return `
                <path d="M${cx - 10} ${cy - 2} Q${cx} ${cy + 11} ${cx + 10} ${cy - 2}" fill="none" stroke="#2d3436" stroke-width="2.2" stroke-linecap="round"/>
                <path d="M${cx - 7} ${cy + 4} Q${cx} ${cy + 8} ${cx + 7} ${cy + 4}" fill="none" stroke="#c0392b" stroke-width="0.8" stroke-linecap="round" opacity="0.25"/>
            `;
        case 'grin':
            return `
                <path d="M${cx - 12} ${cy - 3} Q${cx} ${cy + 14} ${cx + 12} ${cy - 3}" fill="white" stroke="#2d3436" stroke-width="2" stroke-linecap="round"/>
                <path d="M${cx - 8} ${cy + 5} Q${cx} ${cy + 9} ${cx + 8} ${cy + 5}" fill="#e74c3c" opacity="0.28"/>
                <line x1="${cx - 4}" y1="${cy - 2}" x2="${cx - 4}" y2="${cy + 4}" stroke="#dfe6e9" stroke-width="0.8" opacity="0.6"/>
                <line x1="${cx}" y1="${cy - 3}" x2="${cx}" y2="${cy + 4}" stroke="#dfe6e9" stroke-width="0.8" opacity="0.6"/>
                <line x1="${cx + 4}" y1="${cy - 2}" x2="${cx + 4}" y2="${cy + 4}" stroke="#dfe6e9" stroke-width="0.8" opacity="0.6"/>
            `;
        case 'tongue':
            return `
                <path d="M${cx - 10} ${cy - 2} Q${cx} ${cy + 11} ${cx + 10} ${cy - 2}" fill="none" stroke="#2d3436" stroke-width="2.2" stroke-linecap="round"/>
                <ellipse cx="${cx + 1}" cy="${cy + 8}" rx="4.5" ry="5.5" fill="#e74c3c" opacity="0.7"/>
                <ellipse cx="${cx}" cy="${cy + 7}" rx="2" ry="2" fill="#c0392b" opacity="0.3"/>
            `;
        case 'neutral':
            return `<line x1="${cx - 9}" y1="${cy}" x2="${cx + 9}" y2="${cy}" stroke="#2d3436" stroke-width="2.2" stroke-linecap="round"/>`;
        case 'surprised':
            return `
                <ellipse cx="${cx}" cy="${cy + 1}" rx="5" ry="7" fill="#2d3436" opacity="0.85"/>
                <ellipse cx="${cx - 1}" cy="${cy - 1}" rx="2" ry="2.5" fill="white" opacity="0.15"/>
            `;
        case 'cat':
            return `
                <path d="M${cx - 12} ${cy + 1} Q${cx - 5} ${cy - 5} ${cx} ${cy + 1}" fill="none" stroke="#2d3436" stroke-width="2.2" stroke-linecap="round"/>
                <path d="M${cx} ${cy + 1} Q${cx + 5} ${cy - 5} ${cx + 12} ${cy + 1}" fill="none" stroke="#2d3436" stroke-width="2.2" stroke-linecap="round"/>
                <line x1="${cx}" y1="${cy + 1}" x2="${cx}" y2="${cy + 5}" stroke="#2d3436" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
            `;
        case 'kiss':
            return `
                <ellipse cx="${cx}" cy="${cy + 1}" rx="4.5" ry="4" fill="#e74c3c" opacity="0.65"/>
                <path d="M${cx - 3} ${cy - 2} Q${cx} ${cy - 6} ${cx + 3} ${cy - 2}" fill="none" stroke="#e74c3c" stroke-width="1.5" stroke-linecap="round" opacity="0.8"/>
                <ellipse cx="${cx - 1}" cy="${cy}" rx="1.5" ry="1" fill="white" opacity="0.2"/>
            `;
        case 'teeth':
            return `
                <path d="M${cx - 10} ${cy - 2} Q${cx} ${cy + 11} ${cx + 10} ${cy - 2}" fill="white" stroke="#2d3436" stroke-width="2" stroke-linecap="round"/>
                <path d="M${cx - 8} ${cy + 5} Q${cx} ${cy + 9} ${cx + 8} ${cy + 5}" fill="#e74c3c" opacity="0.22"/>
                <line x1="${cx - 3}" y1="${cy - 2}" x2="${cx - 3}" y2="${cy + 4}" stroke="#dfe6e9" stroke-width="1"/>
                <line x1="${cx + 3}" y1="${cy - 2}" x2="${cx + 3}" y2="${cy + 4}" stroke="#dfe6e9" stroke-width="1"/>
            `;
        case 'smirk':
            return `
                <path d="M${cx - 6} ${cy + 2} Q${cx + 2} ${cy + 9} ${cx + 10} ${cy - 3}" fill="none" stroke="#2d3436" stroke-width="2.2" stroke-linecap="round"/>
                <path d="M${cx + 2} ${cy + 7} Q${cx + 8} ${cy + 4} ${cx + 10} ${cy - 1}" fill="none" stroke="#c0392b" stroke-width="0.7" stroke-linecap="round" opacity="0.2"/>
            `;
        case 'fangs':
            return `
                <path d="M${cx - 10} ${cy - 2} Q${cx} ${cy + 11} ${cx + 10} ${cy - 2}" fill="white" stroke="#2d3436" stroke-width="2" stroke-linecap="round"/>
                <path d="M${cx - 6.5} ${cy - 1} L${cx - 5.5} ${cy + 5} L${cx - 4.5} ${cy - 1}" fill="white" stroke="#2d3436" stroke-width="0.9"/>
                <path d="M${cx + 4.5} ${cy - 1} L${cx + 5.5} ${cy + 5} L${cx + 6.5} ${cy - 1}" fill="white" stroke="#2d3436" stroke-width="0.9"/>
            `;
        case 'sad':
            return `
                <path d="M${cx - 10} ${cy + 6} Q${cx} ${cy - 5} ${cx + 10} ${cy + 6}" fill="none" stroke="#2d3436" stroke-width="2.2" stroke-linecap="round"/>
                <path d="M${cx - 7} ${cy + 1} Q${cx} ${cy - 2} ${cx + 7} ${cy + 1}" fill="none" stroke="#c0392b" stroke-width="0.8" stroke-linecap="round" opacity="0.25"/>
            `;
        case 'open':
            return `
                <path d="M${cx - 10} ${cy - 3} Q${cx} ${cy + 14} ${cx + 10} ${cy - 3}" fill="#2d3436" stroke="#2d3436" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M${cx - 9} ${cy - 2} Q${cx} ${cy + 8} ${cx + 9} ${cy - 2}" fill="white"/>
                <path d="M${cx - 7} ${cy + 6} Q${cx} ${cy + 10} ${cx + 7} ${cy + 6}" fill="#e74c3c" opacity="0.55"/>
                <line x1="${cx - 3}" y1="${cy - 2}" x2="${cx - 3}" y2="${cy + 5}" stroke="#dfe6e9" stroke-width="1" opacity="0.7"/>
                <line x1="${cx + 3}" y1="${cy - 2}" x2="${cx + 3}" y2="${cy + 5}" stroke="#dfe6e9" stroke-width="1" opacity="0.7"/>
            `;
        default:
            return mouthPart('smile');
    }
}

// Hair behind head (drawn before face for styles that flow behind)
// withShoulders: if true, extend flowing hair down into the shoulder zone (y=102-118)
function hairBehind(type, color, withShoulders = false) {
    const longEnd = withShoulders ? 118 : 102;
    const lobEnd  = withShoulders ?  98 :  90;
    const wavyEnd = withShoulders ?  98 :  84;
    switch (type) {
        case 'long':
            return `
                <path d="M20 48 Q12 60 13 88 Q13 ${longEnd} 28 ${longEnd} Q24 78 25 52Z" fill="${color}" opacity="0.9"/>
                <path d="M100 48 Q108 60 107 88 Q107 ${longEnd} 92 ${longEnd} Q96 78 95 52Z" fill="${color}" opacity="0.9"/>
            `;
        case 'ponytail':
            return `
                <path d="M92 42 Q108 50 112 68 Q114 82 110 96" fill="none" stroke="${color}" stroke-width="14" stroke-linecap="round" opacity="0.9"/>
                <circle cx="110" cy="98" r="13" fill="${color}" opacity="0.9"/>
                <ellipse cx="108" cy="88" rx="8" ry="7" fill="${color}" opacity="0.8"/>
            `;
        case 'lob':
            return `
                <path d="M18 48 Q10 64 12 80 Q13 ${lobEnd + 4} 28 ${lobEnd} Q22 70 24 52Z" fill="${color}" opacity="0.92"/>
                <path d="M102 48 Q110 64 108 80 Q107 ${lobEnd + 4} 92 ${lobEnd} Q98 70 96 52Z" fill="${color}" opacity="0.92"/>
            `;
        case 'side-braid':
            return `
                <path d="M92 44 Q108 54 112 70 Q114 84 110 96" fill="none" stroke="${color}" stroke-width="11" stroke-linecap="round" opacity="0.88"/>
                <path d="M98 58 L108 64 M100 72 L110 76 M102 82 L110 88" fill="none" stroke="${color}" stroke-width="2.2" opacity="0.45"/>
                <circle cx="110" cy="98" r="8" fill="${color}" opacity="0.88"/>
            `;
        case 'pigtails':
            return `
                <path d="M24 42 Q10 52 8 68 Q6 82 12 96" fill="none" stroke="${color}" stroke-width="13" stroke-linecap="round" opacity="0.9"/>
                <circle cx="12" cy="98" r="12" fill="${color}" opacity="0.9"/>
                <path d="M96 42 Q110 52 112 68 Q114 82 108 96" fill="none" stroke="${color}" stroke-width="13" stroke-linecap="round" opacity="0.9"/>
                <circle cx="108" cy="98" r="12" fill="${color}" opacity="0.9"/>
            `;
        case 'wavy':
            return `
                <path d="M18 48 Q8 62 10 76 Q12 ${wavyEnd + 4} 28 ${wavyEnd} Q20 66 22 52Z" fill="${color}" opacity="0.84"/>
                <path d="M102 48 Q112 62 110 76 Q108 ${wavyEnd + 4} 92 ${wavyEnd} Q100 66 98 52Z" fill="${color}" opacity="0.84"/>
            `;
        case 'curly':
            return `
                <circle cx="14" cy="56" r="11" fill="${color}" opacity="0.76"/>
                <circle cx="11" cy="68" r="10" fill="${color}" opacity="0.70"/>
                ${withShoulders ? `<circle cx="12" cy="80" r="9" fill="${color}" opacity="0.62"/>` : ''}
                <circle cx="106" cy="56" r="11" fill="${color}" opacity="0.76"/>
                <circle cx="109" cy="68" r="10" fill="${color}" opacity="0.70"/>
                ${withShoulders ? `<circle cx="108" cy="80" r="9" fill="${color}" opacity="0.62"/>` : ''}
            `;
        case 'afro':
            return `<circle cx="60" cy="42" r="46" fill="${color}" opacity="0.3"/>`;
        case 'braids':
            return withShoulders ? `
                <path d="M26 40 Q18 42 16 52 Q14 62 16 72 Q18 80 22 84 Q18 90 16 100 Q15 110 20 116" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round"/>
                <circle cx="20" cy="118" r="4" fill="${color}"/>
                <path d="M94 40 Q102 42 104 52 Q106 62 104 72 Q102 80 98 84 Q102 90 104 100 Q105 110 100 116" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round"/>
                <circle cx="100" cy="118" r="4" fill="${color}"/>
            ` : '';
        default:
            return '';
    }
}

function hairPart(type, color) {
    // Hair shine helper — adds a subtle lighter stroke to suggest volume
    function shine(path, opacity = 0.18) {
        return `<path d="${path}" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" opacity="${opacity}"/>`;
    }

    switch (type) {
        case 'short':
            return `
                <path d="M22 52 Q24 16 60 11 Q96 16 98 52 Q92 28 78 20 Q60 14 42 20 Q28 28 22 52Z" fill="${color}"/>
                <!-- temple coverage -->
                <ellipse cx="21" cy="56" rx="5.5" ry="7" fill="${color}" opacity="0.82"/>
                <ellipse cx="99" cy="56" rx="5.5" ry="7" fill="${color}" opacity="0.82"/>
                ${shine('M30 28 Q44 16 58 12')}
            `;
        case 'spiky':
            return `
                <path d="M25 48 Q28 30 38 20 L35 10 Q45 22 50 16 L48 6 Q58 18 60 12 L62 4 Q65 16 72 12 L70 6 Q78 18 82 16 L80 10 Q88 22 92 20 Q95 30 95 48 Q88 32 75 24 Q60 18 45 24 Q32 32 25 48Z" fill="${color}"/>
                ${shine('M38 20 L35 10')}
                ${shine('M60 12 L62 4')}
                ${shine('M82 16 L80 10')}
            `;
        case 'curly':
            return `
                <path d="M22 52 Q18 35 28 22 Q38 12 60 10 Q82 12 92 22 Q102 35 98 52" fill="${color}"/>
                <circle cx="26" cy="38" r="7" fill="${color}"/>
                <circle cx="94" cy="38" r="7" fill="${color}"/>
                <circle cx="34" cy="24" r="6" fill="${color}"/>
                <circle cx="86" cy="24" r="6" fill="${color}"/>
                <circle cx="48" cy="16" r="6" fill="${color}"/>
                <circle cx="72" cy="16" r="6" fill="${color}"/>
                <circle cx="60" cy="13" r="6" fill="${color}"/>
                <circle cx="20" cy="50" r="7" fill="${color}"/>
                <circle cx="100" cy="50" r="7" fill="${color}"/>
                <circle cx="18" cy="60" r="5" fill="${color}" opacity="0.8"/>
                <circle cx="102" cy="60" r="5" fill="${color}" opacity="0.8"/>
                ${shine('M34 24 Q44 16 55 14')}
            `;
        case 'long':
            return `
                <path d="M20 48 Q16 24 30 12 Q44 4 60 4 Q76 4 90 12 Q104 24 100 48" fill="${color}"/>
                <path d="M20 48 L16 94 Q15 102 28 102 Q24 78 25 52 Q26 34 42 22 Q56 14 60 14 Q64 14 78 22 Q94 34 95 52 L92 102 Q105 102 104 94 L100 48" fill="${color}" opacity="0.9"/>
                ${shine('M32 12 Q46 6 60 6')}
            `;
        case 'ponytail':
            return `
                <path d="M25 45 Q30 18 60 14 Q90 18 95 45 Q90 30 75 24 Q60 20 45 24 Q30 30 25 45Z" fill="${color}"/>
                ${shine('M32 28 Q42 18 55 16')}
                <path d="M24 42 Q22 48 22 54" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
            `;
        case 'pigtails':
            return `
                <path d="M25 45 Q30 18 60 14 Q90 18 95 45 Q90 30 75 24 Q60 20 45 24 Q30 30 25 45Z" fill="${color}"/>
                ${shine('M32 28 Q42 18 55 16')}
                <path d="M26 38 Q24 32 22 38" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
                <path d="M94 38 Q96 32 98 38" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
            `;
        case 'buzz':
            return `
                <path d="M27 50 Q29 24 60 18 Q91 24 93 50 Q89 34 76 26 Q60 22 44 26 Q31 34 27 50Z" fill="${color}" opacity="0.88"/>
                ${shine('M32 36 Q44 24 58 20', 0.14)}
                <path d="M24 52 Q22 58 22 64" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" opacity="0.5"/>
                <path d="M96 52 Q98 58 98 64" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" opacity="0.5"/>
            `;
        case 'mohawk':
            return `
                <path d="M50 48 Q50 10 60 2 Q70 10 70 48 Q66 38 60 34 Q54 38 50 48Z" fill="${color}"/>
                <path d="M52 36 Q55 14 60 6 Q65 14 68 36" fill="${color}" opacity="0.7"/>
                ${shine('M54 38 Q57 16 60 8', 0.22)}
            `;
        case 'bun':
            return `
                <path d="M25 45 Q30 18 60 14 Q90 18 95 45 Q90 30 75 24 Q60 20 45 24 Q30 30 25 45Z" fill="${color}"/>
                <circle cx="60" cy="10" r="13" fill="${color}"/>
                <ellipse cx="60" cy="10" rx="8" ry="8" fill="${color}" opacity="0.6"/>
                <ellipse cx="55" cy="6" rx="4" ry="3" fill="white" opacity="0.15"/>
                ${shine('M32 28 Q42 18 55 16')}
                <path d="M24 42 Q22 48 22 54" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" opacity="0.5"/>
                <path d="M96 42 Q98 48 98 54" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" opacity="0.5"/>
            `;
        case 'afro':
            return `
                <circle cx="60" cy="38" r="44" fill="${color}"/>
                <ellipse cx="44" cy="22" rx="16" ry="12" fill="white" opacity="0.1"/>
            `;
        case 'sidepart':
            return `
                <path d="M22 48 Q22 24 40 16 Q55 10 60 12 Q58 18 45 24 Q30 32 28 50Z" fill="${color}"/>
                <path d="M60 12 Q80 10 92 22 Q100 32 98 48 Q94 30 78 22 Q65 16 60 12Z" fill="${color}" opacity="0.8"/>
                ${shine('M28 34 Q36 22 46 18')}
                <path d="M22 48 Q20 56 20 64" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" opacity="0.6"/>
            `;
        case 'wavy':
            return `
                <path d="M22 46 Q18 26 36 14 Q50 6 60 8 Q70 6 84 14 Q102 26 98 46" fill="${color}"/>
                <path d="M22 46 Q18 56 20 68 Q22 60 24 50Z" fill="${color}" opacity="0.8"/>
                <path d="M98 46 Q102 56 100 68 Q98 60 96 50Z" fill="${color}" opacity="0.8"/>
                <path d="M24 42 Q20 54 22 70" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" opacity="0.7"/>
                <path d="M96 42 Q100 54 98 70" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" opacity="0.7"/>
                ${shine('M36 14 Q50 8 62 8')}
            `;
        case 'braids':
            return `
                <path d="M25 45 Q30 18 60 14 Q90 18 95 45 Q90 30 75 24 Q60 20 45 24 Q30 30 25 45Z" fill="${color}"/>
                <path d="M26 40 Q18 42 16 52 Q14 62 16 72 Q18 80 22 84" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round"/>
                <circle cx="22" cy="86" r="4" fill="${color}"/>
                <path d="M16 52 L20 56 M14 62 L18 66 M16 72 L20 76" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.4"/>
                <path d="M94 40 Q102 42 104 52 Q106 62 104 72 Q102 80 98 84" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round"/>
                <circle cx="98" cy="86" r="4" fill="${color}"/>
                <path d="M104 52 L100 56 M106 62 L102 66 M104 72 L100 76" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.4"/>
                ${shine('M32 28 Q42 18 55 16')}
            `;
        case 'curtain':
            return `
                <path d="M22 50 Q20 30 34 18 Q48 8 60 10 Q72 8 86 18 Q100 30 98 50" fill="${color}"/>
                <path d="M42 14 Q36 24 28 44 Q26 48 24 54" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" opacity="0.7"/>
                <path d="M78 14 Q84 24 92 44 Q94 48 96 54" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" opacity="0.7"/>
                <path d="M60 10 Q56 14 50 22" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" opacity="0.5"/>
                <path d="M60 10 Q64 14 70 22" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" opacity="0.5"/>
                ${shine('M36 18 Q46 10 58 10')}
            `;
        case 'lob':
            return `
                <path d="M22 46 Q18 26 34 16 Q48 8 60 8 Q72 8 86 16 Q102 26 98 46" fill="${color}"/>
                <path d="M22 46 Q20 60 20 78 Q21 86 26 82 Q24 68 24 50Z" fill="${color}" opacity="0.9"/>
                <path d="M98 46 Q100 60 100 78 Q99 86 94 82 Q96 68 96 50Z" fill="${color}" opacity="0.9"/>
                ${shine('M34 16 Q46 8 58 8')}
            `;
        case 'twin-buns':
            return `
                <path d="M26 46 Q30 20 60 14 Q90 20 94 46 Q88 32 74 24 Q60 20 46 24 Q32 32 26 46Z" fill="${color}"/>
                <circle cx="40" cy="11" r="13" fill="${color}"/>
                <ellipse cx="40" cy="11" rx="7" ry="7" fill="${color}" opacity="0.5"/>
                <ellipse cx="36" cy="7" rx="4" ry="3" fill="white" opacity="0.15"/>
                <circle cx="80" cy="11" r="13" fill="${color}"/>
                <ellipse cx="80" cy="11" rx="7" ry="7" fill="${color}" opacity="0.5"/>
                <ellipse cx="76" cy="7" rx="4" ry="3" fill="white" opacity="0.15"/>
            `;
        case 'pixie':
            return `
                <path d="M27 50 Q29 26 44 17 Q56 10 60 10 Q64 10 76 17 Q91 26 93 50 Q89 34 76 24 Q60 18 44 24 Q31 34 27 50Z" fill="${color}" opacity="0.9"/>
                <path d="M46 13 Q53 6 62 8 Q55 8 49 15Z" fill="${color}"/>
                <path d="M74 13 Q67 6 58 8 Q65 8 71 15Z" fill="${color}"/>
                <path d="M38 22 Q33 15 36 24Z" fill="${color}" opacity="0.7"/>
                <path d="M82 22 Q87 15 84 24Z" fill="${color}" opacity="0.7"/>
                ${shine('M38 26 Q46 18 56 14', 0.16)}
                <path d="M24 50 Q22 56 22 63" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" opacity="0.45"/>
                <path d="M96 50 Q98 56 98 63" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" opacity="0.45"/>
            `;
        case 'side-braid':
            return `
                <path d="M25 45 Q30 18 60 14 Q90 18 95 45 Q90 30 75 24 Q60 20 45 24 Q30 30 25 45Z" fill="${color}"/>
                ${shine('M32 28 Q42 18 55 16')}
                <path d="M92 38 Q96 32 98 42" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" opacity="0.7"/>
            `;
        case 'none':
            return '';
        default:
            return hairPart('short', color);
    }
}

function accessoryPart(type) {
    switch (type) {
        case 'hat':
            return `
                <path d="M28 32 Q30 8 60 4 Q90 8 92 32 Z" fill="#e74c3c" stroke="#c0392b" stroke-width="1"/>
                <path d="M38 22 Q52 12 70 16" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" opacity="0.2"/>
                <rect x="18" y="30" width="84" height="6" rx="3" fill="#c0392b"/>
                <circle cx="60" cy="4" r="4" fill="#e74c3c"/>
            `;
        case 'crown':
            return `
                <path d="M32 32 L28 8 L42 20 L52 4 L60 22 L68 4 L78 20 L92 8 L88 32 Z" fill="#F1C40F" stroke="#D4AC0D" stroke-width="1"/>
                <path d="M36 26 Q52 16 72 20" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" opacity="0.25"/>
                <circle cx="52" cy="10" r="2.5" fill="#E74C3C"/>
                <circle cx="60" cy="6" r="2.5" fill="#3498DB"/>
                <circle cx="68" cy="10" r="2.5" fill="#2ECC71"/>
            `;
        case 'bow':
            return `
                <ellipse cx="82" cy="26" rx="10" ry="7" fill="#fd79a8" transform="rotate(-20 82 26)"/>
                <ellipse cx="92" cy="20" rx="10" ry="7" fill="#fd79a8" transform="rotate(20 92 20)"/>
                <ellipse cx="80" cy="27" rx="4" ry="3" fill="white" opacity="0.2" transform="rotate(-20 80 27)"/>
                <circle cx="87" cy="23" r="3" fill="#e84393"/>
            `;
        case 'headband':
            return `
                <path d="M24 42 Q30 30 60 26 Q90 30 96 42" fill="none" stroke="#6c5ce7" stroke-width="4.5" stroke-linecap="round"/>
                <path d="M28 39 Q44 30 60 27" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" opacity="0.25"/>
                <circle cx="60" cy="26" r="4.5" fill="#a29bfe"/>
                <circle cx="52" cy="27" r="2.5" fill="#a29bfe"/>
                <circle cx="68" cy="27" r="2.5" fill="#a29bfe"/>
            `;
        case 'flower':
            return `
                <g transform="translate(84, 28) rotate(-15)">
                    <circle cx="0" cy="-6.5" r="4.5" fill="#fd79a8" opacity="0.85"/>
                    <circle cx="6.2" cy="-2" r="4.5" fill="#ff9ff3" opacity="0.85"/>
                    <circle cx="3.8" cy="5.2" r="4.5" fill="#fd79a8" opacity="0.85"/>
                    <circle cx="-3.8" cy="5.2" r="4.5" fill="#ff9ff3" opacity="0.85"/>
                    <circle cx="-6.2" cy="-2" r="4.5" fill="#fd79a8" opacity="0.85"/>
                    <circle cx="0" cy="0" r="3.5" fill="#fdcb6e"/>
                    <circle cx="-1" cy="-1" r="1.2" fill="white" opacity="0.35"/>
                </g>
            `;
        case 'star':
            return `
                <g transform="translate(84, 24)">
                    <polygon points="0,-9 2.5,-3 9,-3 4,1.5 6,9 0,4.5 -6,9 -4,1.5 -9,-3 -2.5,-3" fill="#fdcb6e" stroke="#f39c12" stroke-width="0.5"/>
                    <circle cx="-1" cy="-2" r="1.5" fill="white" opacity="0.35"/>
                </g>
            `;
        case 'cap':
            return `
                <path d="M24 42 Q26 20 60 16 Q94 20 96 42 L24 42Z" fill="#3498DB"/>
                <path d="M30 32 Q44 20 62 18" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" opacity="0.2"/>
                <rect x="20" y="40" width="80" height="5" rx="2.5" fill="#2980B9"/>
                <rect x="62" y="38" width="36" height="6" rx="3" fill="#2980B9" transform="rotate(-5 80 41)"/>
            `;
        case 'beanie':
            return `
                <path d="M24 46 Q24 16 60 10 Q96 16 96 46" fill="#e74c3c"/>
                <path d="M30 32 Q44 18 62 14" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" opacity="0.2"/>
                <rect x="22" y="42" width="76" height="8" rx="4" fill="#c0392b"/>
                <circle cx="60" cy="6" r="6.5" fill="#e74c3c"/>
                <circle cx="58" cy="4" r="2.5" fill="white" opacity="0.2"/>
                <line x1="40" y1="20" x2="40" y2="42" stroke="#c0392b" stroke-width="1" opacity="0.3"/>
                <line x1="60" y1="14" x2="60" y2="42" stroke="#c0392b" stroke-width="1" opacity="0.3"/>
                <line x1="80" y1="20" x2="80" y2="42" stroke="#c0392b" stroke-width="1" opacity="0.3"/>
            `;
        case 'earrings':
            return `
                <circle cx="20" cy="74" r="4" fill="#F1C40F" stroke="#D4AC0D" stroke-width="0.8"/>
                <circle cx="19" cy="73" r="1.5" fill="white" opacity="0.35"/>
                <circle cx="100" cy="74" r="4" fill="#F1C40F" stroke="#D4AC0D" stroke-width="0.8"/>
                <circle cx="99" cy="73" r="1.5" fill="white" opacity="0.35"/>
            `;
        case 'bandana':
            return `
                <path d="M24 44 Q30 32 60 28 Q90 32 96 44" fill="#e67e22"/>
                <path d="M24 44 Q30 36 60 32 Q90 36 96 44" fill="#d35400"/>
                <path d="M28 40 Q44 32 62 30" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" opacity="0.18"/>
                <circle cx="60" cy="32" r="2" fill="#f39c12"/>
            `;
        case 'tiara':
            return `
                <path d="M36 34 Q38 26 44 28 Q48 22 52 28 Q56 20 60 26 Q64 20 68 28 Q72 22 76 28 Q82 26 84 34" fill="none" stroke="#F1C40F" stroke-width="2.5" stroke-linecap="round"/>
                <circle cx="60" cy="22" r="3.5" fill="#E91E63" opacity="0.9"/>
                <circle cx="50" cy="26" r="2.2" fill="#F1C40F"/>
                <circle cx="70" cy="26" r="2.2" fill="#F1C40F"/>
                <circle cx="60" cy="22" r="1.2" fill="white" opacity="0.4"/>
            `;
        case 'butterfly':
            return `
                <g transform="translate(86, 26) rotate(-10)">
                    <ellipse cx="-5.5" cy="-3" rx="6" ry="8" fill="#AB47BC" opacity="0.75" transform="rotate(-20)"/>
                    <ellipse cx="5.5" cy="-3" rx="6" ry="8" fill="#CE93D8" opacity="0.75" transform="rotate(20)"/>
                    <ellipse cx="-3" cy="3.5" rx="3.5" ry="5.5" fill="#AB47BC" opacity="0.55" transform="rotate(-10)"/>
                    <ellipse cx="3" cy="3.5" rx="3.5" ry="5.5" fill="#CE93D8" opacity="0.55" transform="rotate(10)"/>
                    <ellipse cx="-3" cy="-5" rx="2" ry="2.5" fill="white" opacity="0.2" transform="rotate(-20)"/>
                    <ellipse cx="0" cy="0" rx="1.2" ry="4.5" fill="#4A148C" opacity="0.65"/>
                </g>
            `;
        case 'hearts':
            return `
                <g transform="translate(84, 26) scale(0.55)">
                    <path d="M0 6 Q-10 -8 -6 -10 Q-2 -12 0 -6 Q2 -12 6 -10 Q10 -8 0 6Z" fill="#e74c3c" opacity="0.85"/>
                    <ellipse cx="-2" cy="-5" rx="2" ry="2.5" fill="white" opacity="0.25"/>
                </g>
                <g transform="translate(36, 28) scale(0.44)">
                    <path d="M0 6 Q-10 -8 -6 -10 Q-2 -12 0 -6 Q2 -12 6 -10 Q10 -8 0 6Z" fill="#e74c3c" opacity="0.65"/>
                </g>
            `;
        case 'monocle':
            return `
                <circle cx="75" cy="58" r="12" fill="black" opacity="0.07"/>
                <circle cx="75" cy="58" r="12" fill="none" stroke="#8B6914" stroke-width="2.4"/>
                <circle cx="75" cy="58" r="12" fill="black" opacity="0.04"/>
                <line x1="75" y1="70" x2="78" y2="82" stroke="#8B6914" stroke-width="1.5" stroke-linecap="round"/>
                <circle cx="78" cy="84" r="2" fill="#8B6914" opacity="0.7"/>
                <circle cx="81" cy="51" r="1.5" fill="white" opacity="0.3"/>
            `;
        case 'necklace':
            return `
                <path d="M38 96 Q60 108 82 96" fill="none" stroke="#F1C40F" stroke-width="2.2" stroke-linecap="round"/>
                <circle cx="60" cy="107" r="4" fill="#F1C40F" stroke="#D4AC0D" stroke-width="0.8"/>
                <circle cx="60" cy="107" r="2" fill="#E74C3C" opacity="0.8"/>
                <circle cx="59" cy="106" r="0.9" fill="white" opacity="0.4"/>
                <circle cx="44" cy="100" r="1.5" fill="#F1C40F"/>
                <circle cx="76" cy="100" r="1.5" fill="#F1C40F"/>
            `;
        case 'scarf':
            return `
                <path d="M24 88 Q36 82 50 86 Q60 89 70 86 Q84 82 96 88" fill="none" stroke="#E74C3C" stroke-width="7" stroke-linecap="round" opacity="0.85"/>
                <path d="M24 88 Q36 82 50 86 Q60 89 70 86 Q84 82 96 88" fill="none" stroke="#C0392B" stroke-width="3" stroke-linecap="round" opacity="0.3"/>
                <path d="M55 88 Q54 96 52 104 Q51 110 55 112" fill="none" stroke="#E74C3C" stroke-width="8" stroke-linecap="round" opacity="0.82"/>
                <path d="M65 88 Q64 90 63 86" fill="none" stroke="#C0392B" stroke-width="2.5" stroke-linecap="round" opacity="0.4"/>
            `;
        default:
            return '';
    }
}

function shouldersPart(type, skin) {
    const neck = `<ellipse cx="60" cy="108" rx="10" ry="7" fill="${skin}"/>`;
    switch (type) {
        case 'none': return '';
        case 'plain':
            return `
                ${neck}
                <path d="M0 120 Q26 104 50 110 Q60 114 70 110 Q94 104 120 120Z" fill="${skin}" opacity="0.88"/>
            `;
        case 'tshirt':
            return `
                ${neck}
                <path d="M0 120 Q26 104 50 110 Q60 114 70 110 Q94 104 120 120Z" fill="#5DADE2"/>
                <path d="M50 110 Q60 117 70 110" fill="none" stroke="#2E86C1" stroke-width="1.8" stroke-linecap="round"/>
            `;
        case 'hoodie':
            return `
                ${neck}
                <path d="M0 120 Q20 102 50 110 Q60 114 70 110 Q100 102 120 120Z" fill="#7F8C8D"/>
                <path d="M46 110 Q60 120 74 110" fill="none" stroke="#5D6D7E" stroke-width="2.2" stroke-linecap="round"/>
                <path d="M28 108 Q38 100 50 106" fill="none" stroke="#5D6D7E" stroke-width="3" stroke-linecap="round" opacity="0.45"/>
                <path d="M92 108 Q82 100 70 106" fill="none" stroke="#5D6D7E" stroke-width="3" stroke-linecap="round" opacity="0.45"/>
            `;
        case 'collar':
            return `
                ${neck}
                <path d="M0 120 Q26 104 50 110 Q60 114 70 110 Q94 104 120 120Z" fill="#F8F9FA"/>
                <path d="M48 110 Q52 115 60 116" fill="${skin}" stroke="#CED4DA" stroke-width="1.2"/>
                <path d="M72 110 Q68 115 60 116" fill="${skin}" stroke="#CED4DA" stroke-width="1.2"/>
                <circle cx="60" cy="117" r="1.5" fill="#ADB5BD"/>
                <circle cx="60" cy="113" r="1" fill="#ADB5BD" opacity="0.5"/>
            `;
        case 'dress':
            return `
                ${neck}
                <path d="M0 120 Q22 102 46 110 Q60 116 74 110 Q98 102 120 120Z" fill="#D98FDB"/>
                <path d="M46 110 Q60 120 74 110" fill="none" stroke="#B86DBE" stroke-width="1.5" stroke-linecap="round"/>
                <ellipse cx="60" cy="115" rx="3" ry="2" fill="#B86DBE" opacity="0.5"/>
                <path d="M30 108 Q40 104 50 108" fill="none" stroke="#B86DBE" stroke-width="2" stroke-linecap="round" opacity="0.35"/>
                <path d="M90 108 Q80 104 70 108" fill="none" stroke="#B86DBE" stroke-width="2" stroke-linecap="round" opacity="0.35"/>
            `;
        default:
            return '';
    }
}

function frecklesPart(show) {
    if (!show) return '';
    return `
        <circle cx="40" cy="68" r="1.4" fill="#B5835A" opacity="0.45"/>
        <circle cx="36" cy="65" r="1.1" fill="#B5835A" opacity="0.38"/>
        <circle cx="43" cy="65" r="1.2" fill="#B5835A" opacity="0.38"/>
        <circle cx="38" cy="71" r="1.1" fill="#B5835A" opacity="0.32"/>
        <circle cx="42" cy="72" r="0.9" fill="#B5835A" opacity="0.28"/>
        <circle cx="80" cy="68" r="1.4" fill="#B5835A" opacity="0.45"/>
        <circle cx="84" cy="65" r="1.1" fill="#B5835A" opacity="0.38"/>
        <circle cx="77" cy="65" r="1.2" fill="#B5835A" opacity="0.38"/>
        <circle cx="82" cy="71" r="1.1" fill="#B5835A" opacity="0.32"/>
        <circle cx="78" cy="72" r="0.9" fill="#B5835A" opacity="0.28"/>
    `;
}

function blush() {
    return `
        <ellipse cx="35" cy="70" rx="9.5" ry="5.5" fill="#ff6b9d" opacity="0.22"/>
        <ellipse cx="85" cy="70" rx="9.5" ry="5.5" fill="#ff6b9d" opacity="0.22"/>
    `;
}

function nose() {
    return `
        <path d="M57.5 68.5 Q60 72.5 62.5 68.5" fill="none" stroke="black" stroke-width="1.4" stroke-linecap="round" opacity="0.22"/>
    `;
}

// Normalize legacy single-accessory configs to array
function normalizeAccessories(config) {
    if (config.accessories && Array.isArray(config.accessories)) return config.accessories;
    if (config.accessory && config.accessory !== 'none') return [config.accessory];
    return [];
}

// ---- Main Render Function ----

// Y-level of the brim for head-covering accessories (hair above this gets clipped)
const HEAD_COVER_BRIM = { hat: 30, beanie: 42, cap: 40 };

export function renderAvatar(config = {}, size = 48) {
    const id = `av${++_rid}`;
    const c = { ...DEFAULT_AVATAR, ...config };
    const accs = normalizeAccessories(c);

    // If a covering accessory is worn, clip hair to below the brim
    const coverAcc = accs.find(a => a in HEAD_COVER_BRIM);
    const brimY = coverAcc ? HEAD_COVER_BRIM[coverAcc] : null;
    const hairClipDef = brimY
        ? `<clipPath id="${id}-hc"><rect x="0" y="${brimY}" width="120" height="${120 - brimY}"/></clipPath>`
        : '';
    const wh = (html) => brimY ? `<g clip-path="url(#${id}-hc)">${html}</g>` : html;

    const withShoulders = c.shoulders && c.shoulders !== 'none';

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="${size}" height="${size}">
    <defs>
        <radialGradient id="${id}-bg" cx="38%" cy="32%" r="65%" gradientUnits="objectBoundingBox">
            <stop offset="0%" stop-color="white" stop-opacity="0.42"/>
            <stop offset="55%" stop-color="white" stop-opacity="0"/>
            <stop offset="100%" stop-color="black" stop-opacity="0.16"/>
        </radialGradient>
        ${hairClipDef}
    </defs>
    <circle cx="60" cy="60" r="58" fill="${c.bgColor}"/>
    <circle cx="60" cy="60" r="58" fill="url(#${id}-bg)"/>
    ${shouldersPart(c.shoulders, c.skin)}
    ${wh(hairBehind(c.hair, c.hairColor, withShoulders))}
    ${ears(c.skin, c.faceShape)}
    ${headShape(c.skin, c.faceShape)}
    ${eyebrowsPart(c.eyebrows, c.hairColor)}
    ${eyesPart(c.eyes, c.eyeColor)}
    ${glassesPart(c.glasses)}
    ${nose()}
    ${mouthPart(c.mouth)}
    ${blush()}
    ${frecklesPart(c.freckles)}
    ${wh(hairPart(c.hair, c.hairColor))}
    ${accs.map(a => accessoryPart(a)).join('\n    ')}
</svg>`.trim();
    return svg;
}

// Render to a container element
export function renderAvatarEl(config = {}, size = 48) {
    const wrapper = document.createElement('div');
    wrapper.className = 'avatar-wrapper';
    wrapper.style.width = size + 'px';
    wrapper.style.height = size + 'px';
    wrapper.innerHTML = renderAvatar(config, size);
    return wrapper;
}

// Get avatar config for a kid from members store
export function getAvatarForKid(kidName) {
    const members = store_get_members();
    const member = members.find(m => m.name === kidName);
    return member?.avatar || DEFAULT_AVATAR;
}

export function initAvatarStore(storeModule) {
    window.__avatarStoreRef = storeModule;
}

// Avoid circular import — inline store access
function store_get_members() {
    try {
        const storeModule = window.__avatarStoreRef;
        return storeModule ? storeModule.get('members') || [] : [];
    } catch {
        return [];
    }
}
