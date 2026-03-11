// ============================================================
// Reactive State Store
// Simple observable key-value map with subscriptions
// ============================================================

const _state = {};
const _listeners = new Map();

export function get(key) {
    return _state[key];
}

function shallowEqual(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const k of keysA) {
        if (a[k] !== b[k]) {
            // For arrays of objects (e.g. Firestore snapshots), compare one level deeper
            if (typeof a[k] === 'object' && typeof b[k] === 'object'
                && a[k] !== null && b[k] !== null
                && !Array.isArray(a[k]) && !Array.isArray(b[k])) {
                if (!shallowEqual(a[k], b[k])) return false;
            } else {
                return false;
            }
        }
    }
    return true;
}

export function set(key, value) {
    const prev = _state[key];
    if (shallowEqual(prev, value)) return;
    _state[key] = value;
    const cbs = _listeners.get(key);
    if (cbs) cbs.forEach(cb => cb(value, prev));
    const wcbs = _listeners.get('*');
    if (wcbs) wcbs.forEach(cb => cb(key, value, prev));
}

export function subscribe(key, callback) {
    if (!_listeners.has(key)) _listeners.set(key, new Set());
    _listeners.get(key).add(callback);
    return () => _listeners.get(key)?.delete(callback);
}

export function getAll() {
    return { ..._state };
}
