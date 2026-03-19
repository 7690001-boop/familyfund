// ============================================================
// Avatar Renderer — generates SVG avatars from config objects
// Stored as JSON on member docs, rendered as inline SVG
// ============================================================

import t from '../../i18n.js';

// Default avatar config
export const DEFAULT_AVATAR = {
    skin: '#F8D5B4',
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
};

export const SKIN_COLORS = [
    '#FDEBD3', '#F8D5B4', '#E8B98A', '#D4956B', '#A0674B', '#6B4226',
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

// ---- SVG Part Generators ----

function headShape(skin, shape) {
    switch (shape) {
        case 'oval':
            return `<ellipse cx="60" cy="62" rx="35" ry="44" fill="${skin}" />`;
        case 'square':
            return `<rect x="24" y="22" width="72" height="80" rx="22" fill="${skin}" />`;
        case 'heart':
            return `<path d="M60 104 Q24 80 24 50 Q24 24 42 22 Q52 20 60 32 Q68 20 78 22 Q96 24 96 50 Q96 80 60 104Z" fill="${skin}"/>`;
        case 'round':
        default:
            return `<ellipse cx="60" cy="62" rx="38" ry="42" fill="${skin}" />`;
    }
}

function ears(skin) {
    return `
        <ellipse cx="22" cy="62" rx="7" ry="10" fill="${skin}" />
        <ellipse cx="98" cy="62" rx="7" ry="10" fill="${skin}" />
        <ellipse cx="22" cy="62" rx="4" ry="6" fill="${skin}" opacity="0.6" />
        <ellipse cx="98" cy="62" rx="4" ry="6" fill="${skin}" opacity="0.6" />
    `;
}

function eyebrowsPart(type) {
    const left = { cx: 45, cy: 46 };
    const right = { cx: 75, cy: 46 };

    switch (type) {
        case 'normal':
            return `
                <path d="M${left.cx - 7} ${left.cy} Q${left.cx} ${left.cy - 4} ${left.cx + 7} ${left.cy}" fill="none" stroke="#2d3436" stroke-width="1.8" stroke-linecap="round" opacity="0.5"/>
                <path d="M${right.cx - 7} ${right.cy} Q${right.cx} ${right.cy - 4} ${right.cx + 7} ${right.cy}" fill="none" stroke="#2d3436" stroke-width="1.8" stroke-linecap="round" opacity="0.5"/>
            `;
        case 'raised':
            return `
                <path d="M${left.cx - 7} ${left.cy + 1} Q${left.cx} ${left.cy - 7} ${left.cx + 7} ${left.cy}" fill="none" stroke="#2d3436" stroke-width="1.8" stroke-linecap="round" opacity="0.5"/>
                <path d="M${right.cx - 7} ${right.cy} Q${right.cx} ${right.cy - 7} ${right.cx + 7} ${right.cy + 1}" fill="none" stroke="#2d3436" stroke-width="1.8" stroke-linecap="round" opacity="0.5"/>
            `;
        case 'angry':
            return `
                <path d="M${left.cx - 7} ${left.cy - 3} Q${left.cx} ${left.cy} ${left.cx + 7} ${left.cy + 2}" fill="none" stroke="#2d3436" stroke-width="2.2" stroke-linecap="round" opacity="0.6"/>
                <path d="M${right.cx - 7} ${right.cy + 2} Q${right.cx} ${right.cy} ${right.cx + 7} ${right.cy - 3}" fill="none" stroke="#2d3436" stroke-width="2.2" stroke-linecap="round" opacity="0.6"/>
            `;
        case 'thick':
            return `
                <path d="M${left.cx - 8} ${left.cy} Q${left.cx} ${left.cy - 5} ${left.cx + 8} ${left.cy}" fill="none" stroke="#2d3436" stroke-width="3" stroke-linecap="round" opacity="0.5"/>
                <path d="M${right.cx - 8} ${right.cy} Q${right.cx} ${right.cy - 5} ${right.cx + 8} ${right.cy}" fill="none" stroke="#2d3436" stroke-width="3" stroke-linecap="round" opacity="0.5"/>
            `;
        case 'worried':
            return `
                <path d="M${left.cx - 7} ${left.cy - 2} Q${left.cx} ${left.cy + 2} ${left.cx + 7} ${left.cy - 4}" fill="none" stroke="#2d3436" stroke-width="1.8" stroke-linecap="round" opacity="0.5"/>
                <path d="M${right.cx - 7} ${right.cy - 4} Q${right.cx} ${right.cy + 2} ${right.cx + 7} ${right.cy - 2}" fill="none" stroke="#2d3436" stroke-width="1.8" stroke-linecap="round" opacity="0.5"/>
            `;
        case 'none':
            return '';
        default:
            return eyebrowsPart('normal');
    }
}

function eyesPart(type, eyeColor) {
    const left = { cx: 45, cy: 56 };
    const right = { cx: 75, cy: 56 };
    const ec = eyeColor || '#5D4037';

    switch (type) {
        case 'happy':
            return `
                <path d="M${left.cx - 7} ${left.cy} Q${left.cx} ${left.cy - 8} ${left.cx + 7} ${left.cy}" fill="none" stroke="${ec}" stroke-width="2.5" stroke-linecap="round"/>
                <path d="M${right.cx - 7} ${right.cy} Q${right.cx} ${right.cy - 8} ${right.cx + 7} ${right.cy}" fill="none" stroke="${ec}" stroke-width="2.5" stroke-linecap="round"/>
            `;
        case 'round':
            return `
                <circle cx="${left.cx}" cy="${left.cy}" r="6" fill="white" stroke="#b2bec3" stroke-width="0.5"/>
                <circle cx="${left.cx + 1}" cy="${left.cy}" r="3.5" fill="${ec}"/>
                <circle cx="${left.cx + 2}" cy="${left.cy - 1.5}" r="1.5" fill="white"/>
                <circle cx="${right.cx}" cy="${right.cy}" r="6" fill="white" stroke="#b2bec3" stroke-width="0.5"/>
                <circle cx="${right.cx + 1}" cy="${right.cy}" r="3.5" fill="${ec}"/>
                <circle cx="${right.cx + 2}" cy="${right.cy - 1.5}" r="1.5" fill="white"/>
            `;
        case 'wink':
            return `
                <circle cx="${left.cx}" cy="${left.cy}" r="6" fill="white" stroke="#b2bec3" stroke-width="0.5"/>
                <circle cx="${left.cx + 1}" cy="${left.cy}" r="3.5" fill="${ec}"/>
                <circle cx="${left.cx + 2}" cy="${left.cy - 1.5}" r="1.5" fill="white"/>
                <path d="M${right.cx - 7} ${right.cy} Q${right.cx} ${right.cy - 8} ${right.cx + 7} ${right.cy}" fill="none" stroke="${ec}" stroke-width="2.5" stroke-linecap="round"/>
            `;
        case 'cool':
            return `
                <rect x="${left.cx - 11}" y="${left.cy - 6}" width="22" height="13" rx="3" fill="#2d3436"/>
                <rect x="${right.cx - 11}" y="${right.cy - 6}" width="22" height="13" rx="3" fill="#2d3436"/>
                <line x1="${left.cx + 11}" y1="${right.cy}" x2="${right.cx - 11}" y2="${right.cy}" stroke="#2d3436" stroke-width="2.2"/>
                <line x1="22" y1="${left.cy}" x2="${left.cx - 11}" y2="${left.cy}" stroke="#2d3436" stroke-width="2.2"/>
                <line x1="${right.cx + 11}" y1="${right.cy}" x2="98" y2="${right.cy}" stroke="#2d3436" stroke-width="2.2"/>
                <rect x="${left.cx - 9}" y="${left.cy - 4}" width="18" height="9" rx="2" fill="#636e72" opacity="0.5"/>
                <rect x="${right.cx - 9}" y="${right.cy - 4}" width="18" height="9" rx="2" fill="#636e72" opacity="0.5"/>
            `;
        case 'big':
            return `
                <ellipse cx="${left.cx}" cy="${left.cy}" rx="8" ry="9" fill="white" stroke="#b2bec3" stroke-width="0.8"/>
                <circle cx="${left.cx + 1}" cy="${left.cy + 1}" r="5" fill="${ec}"/>
                <circle cx="${left.cx + 2.5}" cy="${left.cy - 1}" r="2" fill="white"/>
                <ellipse cx="${right.cx}" cy="${right.cy}" rx="8" ry="9" fill="white" stroke="#b2bec3" stroke-width="0.8"/>
                <circle cx="${right.cx + 1}" cy="${right.cy + 1}" r="5" fill="${ec}"/>
                <circle cx="${right.cx + 2.5}" cy="${right.cy - 1}" r="2" fill="white"/>
            `;
        case 'sleepy':
            return `
                <path d="M${left.cx - 7} ${left.cy + 2} Q${left.cx} ${left.cy - 3} ${left.cx + 7} ${left.cy + 2}" fill="none" stroke="${ec}" stroke-width="2.5" stroke-linecap="round"/>
                <path d="M${right.cx - 7} ${right.cy + 2} Q${right.cx} ${right.cy - 3} ${right.cx + 7} ${right.cy + 2}" fill="none" stroke="${ec}" stroke-width="2.5" stroke-linecap="round"/>
            `;
        case 'heart':
            return `
                <g transform="translate(${left.cx}, ${left.cy}) scale(0.6)">
                    <path d="M0 4 Q-8 -6 -5 -8 Q-2 -10 0 -5 Q2 -10 5 -8 Q8 -6 0 4Z" fill="#e74c3c"/>
                </g>
                <g transform="translate(${right.cx}, ${right.cy}) scale(0.6)">
                    <path d="M0 4 Q-8 -6 -5 -8 Q-2 -10 0 -5 Q2 -10 5 -8 Q8 -6 0 4Z" fill="#e74c3c"/>
                </g>
            `;
        case 'stars':
            return `
                <g transform="translate(${left.cx}, ${left.cy}) scale(0.55)">
                    <polygon points="0,-10 3,-3 10,-3 4.5,2 6.5,10 0,5.5 -6.5,10 -4.5,2 -10,-3 -3,-3" fill="#f1c40f" stroke="#e67e22" stroke-width="0.5"/>
                </g>
                <g transform="translate(${right.cx}, ${right.cy}) scale(0.55)">
                    <polygon points="0,-10 3,-3 10,-3 4.5,2 6.5,10 0,5.5 -6.5,10 -4.5,2 -10,-3 -3,-3" fill="#f1c40f" stroke="#e67e22" stroke-width="0.5"/>
                </g>
            `;
        case 'lashes':
            return `
                <circle cx="${left.cx}" cy="${left.cy}" r="6" fill="white" stroke="#b2bec3" stroke-width="0.5"/>
                <circle cx="${left.cx + 1}" cy="${left.cy}" r="3.5" fill="${ec}"/>
                <circle cx="${left.cx + 2}" cy="${left.cy - 1.5}" r="1.5" fill="white"/>
                <line x1="${left.cx - 4}" y1="${left.cy - 6}" x2="${left.cx - 6}" y2="${left.cy - 10}" stroke="#2d3436" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="${left.cx}" y1="${left.cy - 7}" x2="${left.cx}" y2="${left.cy - 11}" stroke="#2d3436" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="${left.cx + 4}" y1="${left.cy - 6}" x2="${left.cx + 6}" y2="${left.cy - 10}" stroke="#2d3436" stroke-width="1.5" stroke-linecap="round"/>
                <circle cx="${right.cx}" cy="${right.cy}" r="6" fill="white" stroke="#b2bec3" stroke-width="0.5"/>
                <circle cx="${right.cx + 1}" cy="${right.cy}" r="3.5" fill="${ec}"/>
                <circle cx="${right.cx + 2}" cy="${right.cy - 1.5}" r="1.5" fill="white"/>
                <line x1="${right.cx - 4}" y1="${right.cy - 6}" x2="${right.cx - 6}" y2="${right.cy - 10}" stroke="#2d3436" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="${right.cx}" y1="${right.cy - 7}" x2="${right.cx}" y2="${right.cy - 11}" stroke="#2d3436" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="${right.cx + 4}" y1="${right.cy - 6}" x2="${right.cx + 6}" y2="${right.cy - 10}" stroke="#2d3436" stroke-width="1.5" stroke-linecap="round"/>
            `;
        case 'dizzy':
            return `
                <g transform="translate(${left.cx}, ${left.cy})">
                    <line x1="-5" y1="-5" x2="5" y2="5" stroke="${ec}" stroke-width="2.5" stroke-linecap="round"/>
                    <line x1="5" y1="-5" x2="-5" y2="5" stroke="${ec}" stroke-width="2.5" stroke-linecap="round"/>
                </g>
                <g transform="translate(${right.cx}, ${right.cy})">
                    <line x1="-5" y1="-5" x2="5" y2="5" stroke="${ec}" stroke-width="2.5" stroke-linecap="round"/>
                    <line x1="5" y1="-5" x2="-5" y2="5" stroke="${ec}" stroke-width="2.5" stroke-linecap="round"/>
                </g>
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
                <circle cx="${left.cx}" cy="${left.cy}" r="11" fill="none" stroke="#5D4E37" stroke-width="2"/>
                <circle cx="${right.cx}" cy="${right.cy}" r="11" fill="none" stroke="#5D4E37" stroke-width="2"/>
                <line x1="${left.cx + 11}" y1="${left.cy}" x2="${right.cx - 11}" y2="${right.cy}" stroke="#5D4E37" stroke-width="2"/>
                <line x1="22" y1="${left.cy - 2}" x2="${left.cx - 11}" y2="${left.cy}" stroke="#5D4E37" stroke-width="2"/>
                <line x1="${right.cx + 11}" y1="${right.cy}" x2="98" y2="${right.cy - 2}" stroke="#5D4E37" stroke-width="2"/>
            `;
        case 'square':
            return `
                <rect x="${left.cx - 11}" y="${left.cy - 8}" width="22" height="16" rx="3" fill="none" stroke="#2d3436" stroke-width="2"/>
                <rect x="${right.cx - 11}" y="${right.cy - 8}" width="22" height="16" rx="3" fill="none" stroke="#2d3436" stroke-width="2"/>
                <line x1="${left.cx + 11}" y1="${left.cy}" x2="${right.cx - 11}" y2="${right.cy}" stroke="#2d3436" stroke-width="2"/>
                <line x1="22" y1="${left.cy - 2}" x2="${left.cx - 11}" y2="${left.cy}" stroke="#2d3436" stroke-width="2"/>
                <line x1="${right.cx + 11}" y1="${right.cy}" x2="98" y2="${right.cy - 2}" stroke="#2d3436" stroke-width="2"/>
            `;
        case 'cat-eye':
            return `
                <path d="M${left.cx - 12} ${left.cy + 6} Q${left.cx - 12} ${left.cy - 8} ${left.cx} ${left.cy - 8} Q${left.cx + 12} ${left.cy - 8} ${left.cx + 12} ${left.cy + 2} Q${left.cx + 12} ${left.cy + 6} ${left.cx} ${left.cy + 6} Q${left.cx - 12} ${left.cy + 6} ${left.cx - 12} ${left.cy + 6}Z" fill="none" stroke="#e84393" stroke-width="2"/>
                <path d="M${right.cx - 12} ${right.cy + 6} Q${right.cx - 12} ${right.cy - 8} ${right.cx} ${right.cy - 8} Q${right.cx + 12} ${right.cy - 8} ${right.cx + 12} ${right.cy + 2} Q${right.cx + 12} ${right.cy + 6} ${right.cx} ${right.cy + 6} Q${right.cx - 12} ${right.cy + 6} ${right.cx - 12} ${right.cy + 6}Z" fill="none" stroke="#e84393" stroke-width="2"/>
                <line x1="${left.cx + 12}" y1="${left.cy}" x2="${right.cx - 12}" y2="${right.cy}" stroke="#e84393" stroke-width="2"/>
                <line x1="22" y1="${left.cy - 4}" x2="${left.cx - 12}" y2="${left.cy - 2}" stroke="#e84393" stroke-width="2"/>
                <line x1="${right.cx + 12}" y1="${right.cy - 2}" x2="98" y2="${right.cy - 4}" stroke="#e84393" stroke-width="2"/>
            `;
        default:
            return '';
    }
}

function mouthPart(type) {
    const cx = 60, cy = 76;
    switch (type) {
        case 'smile':
            return `<path d="M${cx - 10} ${cy - 2} Q${cx} ${cy + 10} ${cx + 10} ${cy - 2}" fill="none" stroke="#2d3436" stroke-width="2.2" stroke-linecap="round"/>`;
        case 'grin':
            return `
                <path d="M${cx - 12} ${cy - 3} Q${cx} ${cy + 14} ${cx + 12} ${cy - 3}" fill="white" stroke="#2d3436" stroke-width="2" stroke-linecap="round"/>
                <path d="M${cx - 8} ${cy + 5} Q${cx} ${cy + 9} ${cx + 8} ${cy + 5}" fill="#e74c3c" opacity="0.3"/>
            `;
        case 'tongue':
            return `
                <path d="M${cx - 10} ${cy - 2} Q${cx} ${cy + 10} ${cx + 10} ${cy - 2}" fill="none" stroke="#2d3436" stroke-width="2.2" stroke-linecap="round"/>
                <ellipse cx="${cx + 2}" cy="${cy + 6}" rx="4" ry="5" fill="#e74c3c" opacity="0.6"/>
            `;
        case 'neutral':
            return `<line x1="${cx - 8}" y1="${cy}" x2="${cx + 8}" y2="${cy}" stroke="#2d3436" stroke-width="2.2" stroke-linecap="round"/>`;
        case 'surprised':
            return `<ellipse cx="${cx}" cy="${cy}" rx="5" ry="7" fill="#2d3436" opacity="0.8"/>`;
        case 'cat':
            return `
                <path d="M${cx - 12} ${cy + 1} Q${cx - 5} ${cy - 5} ${cx} ${cy + 1}" fill="none" stroke="#2d3436" stroke-width="2" stroke-linecap="round"/>
                <path d="M${cx} ${cy + 1} Q${cx + 5} ${cy - 5} ${cx + 12} ${cy + 1}" fill="none" stroke="#2d3436" stroke-width="2" stroke-linecap="round"/>
            `;
        case 'kiss':
            return `
                <circle cx="${cx}" cy="${cy}" rx="4" ry="4" fill="#e74c3c" opacity="0.6"/>
                <path d="M${cx - 3} ${cy - 1} Q${cx} ${cy - 5} ${cx + 3} ${cy - 1}" fill="none" stroke="#e74c3c" stroke-width="1.5" stroke-linecap="round" opacity="0.8"/>
            `;
        case 'teeth':
            return `
                <path d="M${cx - 10} ${cy - 2} Q${cx} ${cy + 10} ${cx + 10} ${cy - 2}" fill="white" stroke="#2d3436" stroke-width="2" stroke-linecap="round"/>
                <line x1="${cx - 3}" y1="${cy - 2}" x2="${cx - 3}" y2="${cy + 3}" stroke="#dfe6e9" stroke-width="1"/>
                <line x1="${cx + 3}" y1="${cy - 2}" x2="${cx + 3}" y2="${cy + 3}" stroke="#dfe6e9" stroke-width="1"/>
            `;
        case 'smirk':
            return `<path d="M${cx - 6} ${cy + 1} Q${cx + 2} ${cy + 8} ${cx + 10} ${cy - 3}" fill="none" stroke="#2d3436" stroke-width="2.2" stroke-linecap="round"/>`;
        case 'fangs':
            return `
                <path d="M${cx - 10} ${cy - 2} Q${cx} ${cy + 10} ${cx + 10} ${cy - 2}" fill="white" stroke="#2d3436" stroke-width="2" stroke-linecap="round"/>
                <path d="M${cx - 6} ${cy - 1} L${cx - 5} ${cy + 4} L${cx - 4} ${cy - 1}" fill="white" stroke="#2d3436" stroke-width="0.8"/>
                <path d="M${cx + 4} ${cy - 1} L${cx + 5} ${cy + 4} L${cx + 6} ${cy - 1}" fill="white" stroke="#2d3436" stroke-width="0.8"/>
            `;
        default:
            return mouthPart('smile');
    }
}

// Hair behind head (drawn before face for styles that flow behind)
function hairBehind(type, color) {
    switch (type) {
        case 'long':
            return `
                <path d="M20 46 Q16 56 18 90 Q19 98 24 96 L25 52Z" fill="${color}" opacity="0.85"/>
                <path d="M100 46 Q104 56 102 90 Q101 98 96 96 L95 52Z" fill="${color}" opacity="0.85"/>
            `;
        case 'ponytail':
            return `
                <path d="M94 40 Q106 46 108 62 Q110 76 106 88" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" opacity="0.85"/>
                <circle cx="106" cy="90" r="10" fill="${color}" opacity="0.85"/>
                <ellipse cx="104" cy="82" rx="6" ry="5" fill="${color}" opacity="0.75"/>
            `;
        case 'lob':
            return `
                <path d="M20 46 Q15 62 17 80 Q18 88 24 84 L26 52Z" fill="${color}" opacity="0.9"/>
                <path d="M100 46 Q105 62 103 80 Q102 88 96 84 L94 52Z" fill="${color}" opacity="0.9"/>
            `;
        case 'side-braid':
            return `
                <path d="M94 44 Q106 52 108 68 Q110 80 106 92" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" opacity="0.85"/>
                <path d="M98 54 L106 58 M100 64 L108 68 M102 74 L108 78 M104 84 L108 88" fill="none" stroke="${color}" stroke-width="1.8" opacity="0.45"/>
                <circle cx="106" cy="94" r="6" fill="${color}" opacity="0.85"/>
            `;
        case 'pigtails':
            return `
                <path d="M24 40 Q12 48 10 64 Q8 76 14 88" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round" opacity="0.85"/>
                <circle cx="14" cy="90" r="8" fill="${color}" opacity="0.85"/>
                <path d="M96 40 Q108 48 110 64 Q112 76 106 88" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round" opacity="0.85"/>
                <circle cx="106" cy="90" r="8" fill="${color}" opacity="0.85"/>
            `;
        case 'wavy':
            return `
                <path d="M20 46 Q14 58 16 74 Q18 82 22 78 Q20 66 22 52Z" fill="${color}" opacity="0.8"/>
                <path d="M100 46 Q106 58 104 74 Q102 82 98 78 Q100 66 98 52Z" fill="${color}" opacity="0.8"/>
            `;
        case 'curly':
            return `
                <circle cx="18" cy="56" r="7" fill="${color}" opacity="0.7"/>
                <circle cx="16" cy="66" r="6" fill="${color}" opacity="0.65"/>
                <circle cx="102" cy="56" r="7" fill="${color}" opacity="0.7"/>
                <circle cx="104" cy="66" r="6" fill="${color}" opacity="0.65"/>
            `;
        case 'afro':
            return `<circle cx="60" cy="42" r="46" fill="${color}" opacity="0.3"/>`;
        default:
            return '';
    }
}

function hairPart(type, color) {
    switch (type) {
        case 'short':
            return `
                <path d="M25 45 Q30 18 60 14 Q90 18 95 45 Q90 30 75 24 Q60 20 45 24 Q30 30 25 45Z" fill="${color}"/>
                <path d="M24 48 Q22 52 22 56" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" opacity="0.6"/>
                <path d="M96 48 Q98 52 98 56" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" opacity="0.6"/>
            `;
        case 'spiky':
            return `
                <path d="M25 48 Q28 30 38 20 L35 10 Q45 22 50 16 L48 6 Q58 18 60 12 L62 4 Q65 16 72 12 L70 6 Q78 18 82 16 L80 10 Q88 22 92 20 Q95 30 95 48 Q88 32 75 24 Q60 18 45 24 Q32 32 25 48Z" fill="${color}"/>
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
            `;
        case 'long':
            return `
                <path d="M22 46 Q18 26 32 16 Q46 6 60 6 Q74 6 88 16 Q102 26 98 46" fill="${color}"/>
                <path d="M22 46 L20 92 Q19 98 24 96 L26 52 Q28 36 42 24 Q55 16 60 16 Q65 16 78 24 Q92 36 94 52 L96 96 Q101 98 100 92 L98 46" fill="${color}" opacity="0.9"/>
            `;
        case 'ponytail':
            return `
                <path d="M25 45 Q30 18 60 14 Q90 18 95 45 Q90 30 75 24 Q60 20 45 24 Q30 30 25 45Z" fill="${color}"/>
                <path d="M24 42 Q22 48 22 54" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
            `;
        case 'pigtails':
            return `
                <path d="M25 45 Q30 18 60 14 Q90 18 95 45 Q90 30 75 24 Q60 20 45 24 Q30 30 25 45Z" fill="${color}"/>
                <path d="M26 38 Q24 32 22 38" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
                <path d="M94 38 Q96 32 98 38" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
            `;
        case 'buzz':
            return `
                <path d="M27 50 Q29 24 60 18 Q91 24 93 50 Q89 34 76 26 Q60 22 44 26 Q31 34 27 50Z" fill="${color}" opacity="0.88"/>
                <path d="M24 52 Q22 58 22 64" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" opacity="0.5"/>
                <path d="M96 52 Q98 58 98 64" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" opacity="0.5"/>
            `;
        case 'mohawk':
            return `
                <path d="M50 48 Q50 10 60 2 Q70 10 70 48 Q66 38 60 34 Q54 38 50 48Z" fill="${color}"/>
                <path d="M52 36 Q55 14 60 6 Q65 14 68 36" fill="${color}" opacity="0.7"/>
            `;
        case 'bun':
            return `
                <path d="M25 45 Q30 18 60 14 Q90 18 95 45 Q90 30 75 24 Q60 20 45 24 Q30 30 25 45Z" fill="${color}"/>
                <circle cx="60" cy="10" r="13" fill="${color}"/>
                <ellipse cx="60" cy="10" rx="8" ry="8" fill="${color}" opacity="0.6"/>
                <path d="M24 42 Q22 48 22 54" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" opacity="0.5"/>
                <path d="M96 42 Q98 48 98 54" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" opacity="0.5"/>
            `;
        case 'afro':
            return `
                <circle cx="60" cy="38" r="44" fill="${color}"/>
            `;
        case 'sidepart':
            return `
                <path d="M22 48 Q22 24 40 16 Q55 10 60 12 Q58 18 45 24 Q30 32 28 50Z" fill="${color}"/>
                <path d="M60 12 Q80 10 92 22 Q100 32 98 48 Q94 30 78 22 Q65 16 60 12Z" fill="${color}" opacity="0.8"/>
                <path d="M22 48 Q20 56 20 64" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" opacity="0.6"/>
            `;
        case 'wavy':
            return `
                <path d="M22 46 Q18 26 36 14 Q50 6 60 8 Q70 6 84 14 Q102 26 98 46" fill="${color}"/>
                <path d="M22 46 Q18 56 20 68 Q22 60 24 50Z" fill="${color}" opacity="0.8"/>
                <path d="M98 46 Q102 56 100 68 Q98 60 96 50Z" fill="${color}" opacity="0.8"/>
                <path d="M24 42 Q20 54 22 70" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" opacity="0.7"/>
                <path d="M96 42 Q100 54 98 70" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" opacity="0.7"/>
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
            `;
        case 'curtain':
            return `
                <path d="M22 50 Q20 30 34 18 Q48 8 60 10 Q72 8 86 18 Q100 30 98 50" fill="${color}"/>
                <path d="M42 14 Q36 24 28 44 Q26 48 24 54" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" opacity="0.7"/>
                <path d="M78 14 Q84 24 92 44 Q94 48 96 54" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" opacity="0.7"/>
                <path d="M60 10 Q56 14 50 22" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" opacity="0.5"/>
                <path d="M60 10 Q64 14 70 22" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" opacity="0.5"/>
            `;
        case 'lob':
            return `
                <path d="M22 46 Q18 26 34 16 Q48 8 60 8 Q72 8 86 16 Q102 26 98 46" fill="${color}"/>
                <path d="M22 46 Q20 60 20 78 Q21 86 26 82 Q24 68 24 50Z" fill="${color}" opacity="0.9"/>
                <path d="M98 46 Q100 60 100 78 Q99 86 94 82 Q96 68 96 50Z" fill="${color}" opacity="0.9"/>
            `;
        case 'twin-buns':
            return `
                <path d="M26 46 Q30 20 60 14 Q90 20 94 46 Q88 32 74 24 Q60 20 46 24 Q32 32 26 46Z" fill="${color}"/>
                <circle cx="40" cy="11" r="13" fill="${color}"/>
                <ellipse cx="40" cy="11" rx="7" ry="7" fill="${color}" opacity="0.5"/>
                <circle cx="80" cy="11" r="13" fill="${color}"/>
                <ellipse cx="80" cy="11" rx="7" ry="7" fill="${color}" opacity="0.5"/>
            `;
        case 'pixie':
            return `
                <path d="M27 50 Q29 26 44 17 Q56 10 60 10 Q64 10 76 17 Q91 26 93 50 Q89 34 76 24 Q60 18 44 24 Q31 34 27 50Z" fill="${color}" opacity="0.9"/>
                <path d="M46 13 Q53 6 62 8 Q55 8 49 15Z" fill="${color}"/>
                <path d="M74 13 Q67 6 58 8 Q65 8 71 15Z" fill="${color}"/>
                <path d="M38 22 Q33 15 36 24Z" fill="${color}" opacity="0.7"/>
                <path d="M82 22 Q87 15 84 24Z" fill="${color}" opacity="0.7"/>
                <path d="M24 50 Q22 56 22 63" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" opacity="0.45"/>
                <path d="M96 50 Q98 56 98 63" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" opacity="0.45"/>
            `;
        case 'side-braid':
            return `
                <path d="M25 45 Q30 18 60 14 Q90 18 95 45 Q90 30 75 24 Q60 20 45 24 Q30 30 25 45Z" fill="${color}"/>
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
                <rect x="18" y="30" width="84" height="6" rx="3" fill="#c0392b"/>
                <circle cx="60" cy="4" r="4" fill="#e74c3c"/>
            `;
        case 'crown':
            return `
                <path d="M32 32 L28 8 L42 20 L52 4 L60 22 L68 4 L78 20 L92 8 L88 32 Z" fill="#F1C40F" stroke="#D4AC0D" stroke-width="1"/>
                <circle cx="52" cy="10" r="2.5" fill="#E74C3C"/>
                <circle cx="60" cy="6" r="2.5" fill="#3498DB"/>
                <circle cx="68" cy="10" r="2.5" fill="#2ECC71"/>
            `;
        case 'bow':
            return `
                <ellipse cx="82" cy="26" rx="10" ry="7" fill="#fd79a8" transform="rotate(-20 82 26)"/>
                <ellipse cx="92" cy="20" rx="10" ry="7" fill="#fd79a8" transform="rotate(20 92 20)"/>
                <circle cx="87" cy="23" r="3" fill="#e84393"/>
            `;
        case 'headband':
            return `
                <path d="M24 42 Q30 30 60 26 Q90 30 96 42" fill="none" stroke="#6c5ce7" stroke-width="4" stroke-linecap="round"/>
                <circle cx="60" cy="26" r="4" fill="#a29bfe"/>
                <circle cx="52" cy="27" r="2.5" fill="#a29bfe"/>
                <circle cx="68" cy="27" r="2.5" fill="#a29bfe"/>
            `;
        case 'flower':
            return `
                <g transform="translate(84, 28) rotate(-15)">
                    <circle cx="0" cy="-6" r="4" fill="#fd79a8" opacity="0.8"/>
                    <circle cx="5.7" cy="-1.8" r="4" fill="#fd79a8" opacity="0.8"/>
                    <circle cx="3.5" cy="4.8" r="4" fill="#fd79a8" opacity="0.8"/>
                    <circle cx="-3.5" cy="4.8" r="4" fill="#fd79a8" opacity="0.8"/>
                    <circle cx="-5.7" cy="-1.8" r="4" fill="#fd79a8" opacity="0.8"/>
                    <circle cx="0" cy="0" r="3" fill="#fdcb6e"/>
                </g>
            `;
        case 'star':
            return `
                <g transform="translate(84, 24)">
                    <polygon points="0,-8 2.5,-2.5 8,-2.5 3.5,1.5 5.5,8 0,4 -5.5,8 -3.5,1.5 -8,-2.5 -2.5,-2.5" fill="#fdcb6e" stroke="#f39c12" stroke-width="0.5"/>
                </g>
            `;
        case 'cap':
            return `
                <path d="M24 42 Q26 20 60 16 Q94 20 96 42 L24 42Z" fill="#3498DB"/>
                <rect x="20" y="40" width="80" height="5" rx="2.5" fill="#2980B9"/>
                <rect x="62" y="38" width="36" height="6" rx="3" fill="#2980B9" transform="rotate(-5 80 41)"/>
            `;
        case 'beanie':
            return `
                <path d="M24 46 Q24 16 60 10 Q96 16 96 46" fill="#e74c3c"/>
                <rect x="22" y="42" width="76" height="8" rx="4" fill="#c0392b"/>
                <circle cx="60" cy="6" r="6" fill="#e74c3c"/>
                <line x1="40" y1="20" x2="40" y2="42" stroke="#c0392b" stroke-width="1" opacity="0.3"/>
                <line x1="60" y1="14" x2="60" y2="42" stroke="#c0392b" stroke-width="1" opacity="0.3"/>
                <line x1="80" y1="20" x2="80" y2="42" stroke="#c0392b" stroke-width="1" opacity="0.3"/>
            `;
        case 'earrings':
            return `
                <circle cx="20" cy="74" r="3.5" fill="#F1C40F" stroke="#D4AC0D" stroke-width="0.5"/>
                <circle cx="100" cy="74" r="3.5" fill="#F1C40F" stroke="#D4AC0D" stroke-width="0.5"/>
            `;
        case 'bandana':
            return `
                <path d="M24 44 Q30 32 60 28 Q90 32 96 44" fill="#e67e22" />
                <path d="M24 44 Q30 36 60 32 Q90 36 96 44" fill="#d35400" />
                <circle cx="60" cy="32" r="2" fill="#f39c12"/>
            `;
        case 'tiara':
            return `
                <path d="M36 34 Q38 26 44 28 Q48 22 52 28 Q56 20 60 26 Q64 20 68 28 Q72 22 76 28 Q82 26 84 34" fill="none" stroke="#F1C40F" stroke-width="2" stroke-linecap="round"/>
                <circle cx="60" cy="22" r="3" fill="#E91E63" opacity="0.8"/>
                <circle cx="50" cy="26" r="2" fill="#F1C40F"/>
                <circle cx="70" cy="26" r="2" fill="#F1C40F"/>
            `;
        case 'butterfly':
            return `
                <g transform="translate(86, 26) rotate(-10)">
                    <ellipse cx="-5" cy="-3" rx="5" ry="7" fill="#AB47BC" opacity="0.7" transform="rotate(-20)"/>
                    <ellipse cx="5" cy="-3" rx="5" ry="7" fill="#CE93D8" opacity="0.7" transform="rotate(20)"/>
                    <ellipse cx="-3" cy="3" rx="3" ry="5" fill="#AB47BC" opacity="0.5" transform="rotate(-10)"/>
                    <ellipse cx="3" cy="3" rx="3" ry="5" fill="#CE93D8" opacity="0.5" transform="rotate(10)"/>
                    <ellipse cx="0" cy="0" rx="1" ry="4" fill="#4A148C" opacity="0.6"/>
                </g>
            `;
        case 'hearts':
            return `
                <g transform="translate(84, 26) scale(0.5)">
                    <path d="M0 6 Q-10 -8 -6 -10 Q-2 -12 0 -6 Q2 -12 6 -10 Q10 -8 0 6Z" fill="#e74c3c" opacity="0.8"/>
                </g>
                <g transform="translate(36, 28) scale(0.4)">
                    <path d="M0 6 Q-10 -8 -6 -10 Q-2 -12 0 -6 Q2 -12 6 -10 Q10 -8 0 6Z" fill="#e74c3c" opacity="0.6"/>
                </g>
            `;
        default:
            return '';
    }
}

function frecklesPart(show) {
    if (!show) return '';
    return `
        <circle cx="40" cy="68" r="1.2" fill="#C0976F" opacity="0.4"/>
        <circle cx="36" cy="65" r="1" fill="#C0976F" opacity="0.35"/>
        <circle cx="43" cy="65" r="1.1" fill="#C0976F" opacity="0.35"/>
        <circle cx="38" cy="71" r="1" fill="#C0976F" opacity="0.3"/>
        <circle cx="80" cy="68" r="1.2" fill="#C0976F" opacity="0.4"/>
        <circle cx="84" cy="65" r="1" fill="#C0976F" opacity="0.35"/>
        <circle cx="77" cy="65" r="1.1" fill="#C0976F" opacity="0.35"/>
        <circle cx="82" cy="71" r="1" fill="#C0976F" opacity="0.3"/>
    `;
}

function blush() {
    return `
        <ellipse cx="38" cy="70" rx="6" ry="3.5" fill="#fd79a8" opacity="0.2"/>
        <ellipse cx="82" cy="70" rx="6" ry="3.5" fill="#fd79a8" opacity="0.2"/>
    `;
}

function nose() {
    return `<ellipse cx="60" cy="66" rx="2.5" ry="2" fill="#00000010"/>`;
}

// Normalize legacy single-accessory configs to array
function normalizeAccessories(config) {
    if (config.accessories && Array.isArray(config.accessories)) return config.accessories;
    if (config.accessory && config.accessory !== 'none') return [config.accessory];
    return [];
}

// ---- Main Render Function ----

export function renderAvatar(config = {}, size = 48) {
    const c = { ...DEFAULT_AVATAR, ...config };
    const accs = normalizeAccessories(c);

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="${size}" height="${size}">
    <circle cx="60" cy="60" r="58" fill="${c.bgColor}"/>
    ${hairBehind(c.hair, c.hairColor)}
    ${ears(c.skin)}
    ${headShape(c.skin, c.faceShape)}
    ${eyebrowsPart(c.eyebrows)}
    ${eyesPart(c.eyes, c.eyeColor)}
    ${glassesPart(c.glasses)}
    ${nose()}
    ${mouthPart(c.mouth)}
    ${blush()}
    ${frecklesPart(c.freckles)}
    ${hairPart(c.hair, c.hairColor)}
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

// Avoid circular import — inline store access
function store_get_members() {
    try {
        const storeModule = window.__avatarStoreRef;
        return storeModule ? storeModule.get('members') || [] : [];
    } catch { return []; }
}

// Call this once from main to wire up store reference
export function initAvatarStore(storeRef) {
    window.__avatarStoreRef = storeRef;
}

// Available options for the editor
export const FACE_SHAPE_OPTIONS = ['round', 'oval', 'square', 'heart'];
export const EYES_OPTIONS = ['happy', 'round', 'wink', 'cool', 'big', 'sleepy', 'heart', 'stars', 'lashes', 'dizzy'];
export const EYEBROW_OPTIONS = ['normal', 'raised', 'angry', 'thick', 'worried', 'none'];
export const MOUTH_OPTIONS = ['smile', 'grin', 'tongue', 'neutral', 'surprised', 'cat', 'kiss', 'teeth', 'smirk', 'fangs'];
export const HAIR_OPTIONS = ['short', 'pixie', 'buzz', 'spiky', 'mohawk', 'curly', 'wavy', 'lob', 'long', 'sidepart', 'curtain', 'bun', 'twin-buns', 'ponytail', 'pigtails', 'side-braid', 'braids', 'afro', 'none'];
export const ACCESSORY_OPTIONS = ['hat', 'crown', 'bow', 'headband', 'flower', 'star', 'cap', 'beanie', 'earrings', 'bandana', 'tiara', 'butterfly', 'hearts'];
export const GLASSES_OPTIONS = ['none', 'round', 'square', 'cat-eye'];

// Labels (from i18n)
export const LABELS = t.avatar.labels;
export const FACE_SHAPE_LABELS = t.avatar.faceShapes;
export const EYES_LABELS = t.avatar.eyes;
export const EYEBROW_LABELS = t.avatar.eyebrows;
export const MOUTH_LABELS = t.avatar.mouths;
export const HAIR_LABELS = t.avatar.hair;
export const ACCESSORY_LABELS = t.avatar.accessories;
export const GLASSES_LABELS = t.avatar.glasses;
