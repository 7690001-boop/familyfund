// ============================================================
// Chat Service — Firestore CRUD for family chat topics & messages
// Uses real-time listeners (no polling). Messages are paginated:
//   - Initial load: last PAGE_SIZE messages via limitToLast
//   - Load more: older batch via cursor-based getDocs
//   - New messages arrive reactively via onSnapshot
// ============================================================

import { FIREBASE_CDN } from '../config.js';
import { getAppDb } from '../firebase-init.js';
import * as store from '../store.js';

const PAGE_SIZE = 25;

let unsubTopics = null;
let unsubMessages = null;
let _fs = null;
let _oldestSnap = null;     // cursor for "load more"
let _olderMessages = [];     // messages fetched via pagination (oldest first)
let _hasMore = true;
let _loadingMore = false;
let _currentFamilyId = null;
let _currentTopicId = null;

async function fs() {
    if (!_fs) _fs = await import(`${FIREBASE_CDN}/firebase-firestore.js`);
    return _fs;
}

export async function listenTopics(familyId) {
    stopTopics();
    const { collection, onSnapshot, query, orderBy } = await fs();
    const db = getAppDb();

    unsubTopics = onSnapshot(
        query(collection(db, 'families', familyId, 'chatTopics'), orderBy('lastMessageAt', 'desc')),
        (snap) => {
            const topics = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            store.set('chatTopics', topics);
        },
        (err) => console.error('Chat topics listener error:', err)
    );
}

export function stopTopics() {
    if (unsubTopics) { unsubTopics(); unsubTopics = null; }
    stopMessages();
}

// Listen to the latest PAGE_SIZE messages in real-time.
// Older messages are fetched on demand via loadMoreMessages().
export async function listenMessages(familyId, topicId) {
    stopMessages();
    _currentFamilyId = familyId;
    _currentTopicId = topicId;
    _olderMessages = [];
    _oldestSnap = null;
    _hasMore = true;
    _loadingMore = false;

    const { collection, onSnapshot, query, orderBy, limitToLast } = await fs();
    const db = getAppDb();

    unsubMessages = onSnapshot(
        query(
            collection(db, 'families', familyId, 'chatTopics', topicId, 'messages'),
            orderBy('created_at', 'asc'),
            limitToLast(PAGE_SIZE)
        ),
        (snap) => {
            const liveMessages = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            // Track the oldest doc from the live window for cursor pagination
            if (snap.docs.length > 0) {
                _oldestSnap = snap.docs[0];
            }

            // If initial load returned fewer than PAGE_SIZE, there are no older messages
            if (snap.docs.length < PAGE_SIZE && _olderMessages.length === 0) {
                _hasMore = false;
            }

            // Merge: older paginated messages + live window (deduplicated)
            const olderIds = new Set(_olderMessages.map(m => m.id));
            const uniqueLive = liveMessages.filter(m => !olderIds.has(m.id));
            store.set('chatMessages', [..._olderMessages, ...uniqueLive]);
        },
        (err) => console.error('Chat messages listener error:', err)
    );
}

// Fetch the next page of older messages (called on scroll-to-top)
export async function loadMoreMessages() {
    if (!_hasMore || _loadingMore || !_oldestSnap) return false;
    _loadingMore = true;

    try {
        const { collection, query, orderBy, endBefore, limitToLast, getDocs } = await fs();
        const db = getAppDb();

        const snap = await getDocs(query(
            collection(db, 'families', _currentFamilyId, 'chatTopics', _currentTopicId, 'messages'),
            orderBy('created_at', 'asc'),
            endBefore(_oldestSnap),
            limitToLast(PAGE_SIZE)
        ));

        if (snap.docs.length === 0) {
            _hasMore = false;
            return false;
        }

        if (snap.docs.length < PAGE_SIZE) {
            _hasMore = false;
        }

        const older = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        _oldestSnap = snap.docs[0];

        // Prepend to existing older messages
        _olderMessages = [...older, ..._olderMessages];

        // Re-merge with current live messages
        const current = store.get('chatMessages') || [];
        // Find where older messages end and live ones start
        const olderIds = new Set(_olderMessages.map(m => m.id));
        const liveOnly = current.filter(m => !olderIds.has(m.id));
        store.set('chatMessages', [..._olderMessages, ...liveOnly]);

        return true; // loaded some
    } finally {
        _loadingMore = false;
    }
}

export function hasMoreMessages() {
    return _hasMore;
}

export function isLoadingMore() {
    return _loadingMore;
}

export function stopMessages() {
    if (unsubMessages) { unsubMessages(); unsubMessages = null; }
    _olderMessages = [];
    _oldestSnap = null;
    _hasMore = true;
    _loadingMore = false;
    _currentFamilyId = null;
    _currentTopicId = null;
    store.set('chatMessages', null);
}

export async function createTopic(familyId, title, authorName, authorUid) {
    const { collection, addDoc, serverTimestamp } = await fs();
    const db = getAppDb();

    const ref = await addDoc(collection(db, 'families', familyId, 'chatTopics'), {
        title,
        created_by: authorUid,
        author_name: authorName,
        created_at: serverTimestamp(),
        lastMessageAt: serverTimestamp(),
        messageCount: 0,
    });
    return ref.id;
}

export async function sendMessage(familyId, topicId, text, authorName, authorUid) {
    const { collection, addDoc, doc, updateDoc, serverTimestamp, increment } = await fs();
    const db = getAppDb();

    await addDoc(collection(db, 'families', familyId, 'chatTopics', topicId, 'messages'), {
        text,
        author_name: authorName,
        author_uid: authorUid,
        created_at: serverTimestamp(),
    });

    // Update topic's last message time and count
    await updateDoc(doc(db, 'families', familyId, 'chatTopics', topicId), {
        lastMessageAt: serverTimestamp(),
        messageCount: increment(1),
        lastMessage: text.substring(0, 80),
        lastMessageAuthor: authorName,
    });
}

export async function editMessage(familyId, topicId, messageId, newText) {
    const { doc, updateDoc, serverTimestamp } = await fs();
    const db = getAppDb();
    await updateDoc(doc(db, 'families', familyId, 'chatTopics', topicId, 'messages', messageId), {
        text: newText,
        edited_at: serverTimestamp(),
    });
}

export async function deleteMessage(familyId, topicId, messageId) {
    const { doc, deleteDoc, updateDoc, serverTimestamp, increment } = await fs();
    const db = getAppDb();
    await deleteDoc(doc(db, 'families', familyId, 'chatTopics', topicId, 'messages', messageId));
    // Decrement topic message count
    await updateDoc(doc(db, 'families', familyId, 'chatTopics', topicId), {
        messageCount: increment(-1),
        lastMessageAt: serverTimestamp(),
    });
}

export async function deleteTopic(familyId, topicId) {
    const { collection, doc, deleteDoc, getDocs } = await fs();
    const db = getAppDb();
    const msgs = await getDocs(collection(db, 'families', familyId, 'chatTopics', topicId, 'messages'));
    await Promise.all(msgs.docs.map(d => deleteDoc(d.ref)));
    await deleteDoc(doc(db, 'families', familyId, 'chatTopics', topicId));
}

export async function lockTopic(familyId, topicId, locked) {
    const { doc, updateDoc } = await fs();
    const db = getAppDb();
    await updateDoc(doc(db, 'families', familyId, 'chatTopics', topicId), { locked });
}
