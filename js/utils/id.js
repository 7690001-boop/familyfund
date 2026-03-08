// ============================================================
// ID and ticker utilities
// ============================================================

export function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function normalizeTicker(t) {
    if (!t) return '';
    const parts = t.split(':');
    return parts[parts.length - 1].trim().toUpperCase();
}
