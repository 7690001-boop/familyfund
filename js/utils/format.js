// ============================================================
// Formatting utilities — pure functions, no side effects
// ============================================================

const CURRENCY_SYMBOLS = {
    ILS: '₪', USD: '$', EUR: '€', GBP: '£',
    JPY: '¥', CHF: 'Fr', CAD: 'C$', AUD: 'A$',
};

export function currencySymbol(code) {
    return CURRENCY_SYMBOLS[code] || code || '₪';
}

export function formatCurrency(amount, symbol = '₪', decimals = 0) {
    if (amount == null || isNaN(amount)) return symbol + '—';
    const negative = amount < 0;
    const abs = Math.abs(amount).toLocaleString('he-IL', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
    return (negative ? '-' : '') + symbol + abs;
}

export function formatPct(pct) {
    if (pct == null || isNaN(pct)) return '—';
    return (pct >= 0 ? '+' : '') + (pct * 100).toFixed(1) + '%';
}

export function formatDate(d) {
    if (!d) return '—';
    if (typeof d === 'string') d = new Date(d);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('he-IL');
}

export function toDateStr(d) {
    if (!d) return '';
    if (typeof d === 'string') {
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
        d = new Date(d);
    }
    if (isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
}

export function daysBetween(dateStr) {
    if (!dateStr) return 0;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 0;
    return Math.floor((new Date() - d) / 86400000);
}
