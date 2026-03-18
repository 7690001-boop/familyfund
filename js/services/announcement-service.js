// ============================================================
// Announcement Service — reads announcements from Firestore
// Falls back to static announcements.json if Firestore is empty
// ============================================================

let _db = null;

async function db() {
    if (!_db) {
        const { getFirestore } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
        const { getApp } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js');
        _db = getFirestore(getApp());
    }
    return _db;
}

export async function loadAnnouncements() {
    try {
        const firestore = await db();
        const { collection, query, orderBy, getDocs } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
        const q = query(collection(firestore, 'announcements'), orderBy('created_at', 'desc'));
        const snap = await getDocs(q);
        if (snap.size > 0) {
            return snap.docs.map(d => {
                const data = d.data();
                return { version: data.version, date: data.date, title: data.title, items: data.items };
            });
        }
    } catch (e) {
        console.warn('Failed to load announcements from Firestore, falling back to JSON:', e);
    }
    // Fallback to static JSON
    try {
        const res = await fetch('announcements.json');
        if (res.ok) return await res.json();
    } catch (_) { /* ignore */ }
    return [];
}
