// ============================================================
// Event Bus — simple pub/sub for cross-cutting concerns
// Used for: toast, modal:open, modal:close, prices:updated
// ============================================================

const listeners = new Map();

export function on(event, callback) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(callback);
    return () => listeners.get(event)?.delete(callback);
}

export function emit(event, data) {
    const cbs = listeners.get(event);
    if (cbs) cbs.forEach(cb => cb(data));
}
