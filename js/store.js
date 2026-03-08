// ============================================================
// Reactive State Store
// Simple observable key-value map with subscriptions
// ============================================================

const _state = {};
const _listeners = new Map();

export function get(key) {
    return _state[key];
}

export function set(key, value) {
    const prev = _state[key];
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
