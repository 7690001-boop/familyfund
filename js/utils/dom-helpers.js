// ============================================================
// DOM helper utilities
// ============================================================

export function esc(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export function gainLossClass(amount) {
    if (amount > 0) return 'gain';
    if (amount < 0) return 'loss';
    return '';
}

export function cellGainLossClass(amount) {
    if (amount > 0) return 'cell-gain';
    if (amount < 0) return 'cell-loss';
    return '';
}
