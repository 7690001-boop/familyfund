// ============================================================
// School Service — Firestore CRUD for finance school topics & family discussion
// ============================================================

import { FIREBASE_CDN } from '../config.js';
import { getAppDb } from '../firebase-init.js';
import * as store from '../store.js';

let _unsubTopics = null;
let _fs = null;

async function fs() {
    if (!_fs) _fs = await import(`${FIREBASE_CDN}/firebase-firestore.js`);
    return _fs;
}

export async function listen(familyId) {
    stopListening();
    const { collection, onSnapshot, query, orderBy } = await fs();
    const db = getAppDb();
    _unsubTopics = onSnapshot(
        query(collection(db, 'families', familyId, 'schoolTopics'), orderBy('created_at', 'desc')),
        (snap) => {
            const topics = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            store.set('schoolTopics', topics);
        },
        (err) => console.error('School topics listener error:', err)
    );
}

export function stopListening() {
    if (_unsubTopics) { _unsubTopics(); _unsubTopics = null; }
    store.set('schoolTopics', []);
}

export async function addTopic(familyId, { title, category, content, created_by_name, ...rest }) {
    const { collection, addDoc } = await fs();
    const db = getAppDb();
    await addDoc(collection(db, 'families', familyId, 'schoolTopics'), {
        title,
        category,
        content,
        created_by_name,
        created_at: new Date().toISOString(),
        comment_count: 0,
        ...rest,
    });
}

export async function deleteTopic(familyId, topicId) {
    const { doc, deleteDoc } = await fs();
    const db = getAppDb();
    await deleteDoc(doc(db, 'families', familyId, 'schoolTopics', topicId));
}

// Returns an unsubscribe function; calls callback(comments[]) on each update
export async function listenComments(familyId, topicId, callback) {
    const { collection, onSnapshot, query, orderBy } = await fs();
    const db = getAppDb();
    const unsub = onSnapshot(
        query(
            collection(db, 'families', familyId, 'schoolTopics', topicId, 'comments'),
            orderBy('created_at', 'asc')
        ),
        (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
        (err) => console.error('School comments listener error:', err)
    );
    return unsub;
}

export async function addComment(familyId, topicId, text, authorName) {
    const { collection, addDoc, doc, updateDoc, increment } = await fs();
    const db = getAppDb();
    const now = new Date().toISOString();
    await addDoc(
        collection(db, 'families', familyId, 'schoolTopics', topicId, 'comments'),
        { text, author_name: authorName, created_at: now }
    );
    // Bump comment count and update last_comment_at on the parent topic
    await updateDoc(doc(db, 'families', familyId, 'schoolTopics', topicId), {
        comment_count: increment(1),
        last_comment_at: now,
    });
}

export async function updateTopic(familyId, topicId, data) {
    const { doc, updateDoc } = await fs();
    const db = getAppDb();
    await updateDoc(doc(db, 'families', familyId, 'schoolTopics', topicId), data);
}

// Returns unsub function; calls callback(questions[]) on each update
export async function listenQuestions(familyId, topicId, callback) {
    const { collection, onSnapshot, query, orderBy } = await fs();
    const db = getAppDb();
    return onSnapshot(
        query(collection(db, 'families', familyId, 'schoolTopics', topicId, 'questions'), orderBy('created_at', 'asc')),
        (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
        (err) => console.error('School questions listener error:', err)
    );
}

export async function addQuestion(familyId, topicId, text, authorName) {
    const { collection, addDoc, doc, updateDoc } = await fs();
    const db = getAppDb();
    const now = new Date().toISOString();
    await addDoc(collection(db, 'families', familyId, 'schoolTopics', topicId, 'questions'), {
        text,
        author_name: authorName,
        created_at: now,
        answer: null,
    });
    await updateDoc(doc(db, 'families', familyId, 'schoolTopics', topicId), {
        last_question_at: now,
    });
}

export async function answerQuestion(familyId, topicId, questionId, answerText, authorName) {
    const { doc, updateDoc } = await fs();
    const db = getAppDb();
    const now = new Date().toISOString();
    await updateDoc(doc(db, 'families', familyId, 'schoolTopics', topicId, 'questions', questionId), {
        answer: { text: answerText, author_name: authorName, answered_at: now },
    });
    await updateDoc(doc(db, 'families', familyId, 'schoolTopics', topicId), {
        last_question_at: now,
    });
}

export async function deleteQuestion(familyId, topicId, questionId) {
    const { doc, deleteDoc } = await fs();
    const db = getAppDb();
    await deleteDoc(doc(db, 'families', familyId, 'schoolTopics', topicId, 'questions', questionId));
}

// ============================================================
// User progress tracking
// ============================================================

let _unsubProgress = null;

export async function listenProgress(familyId, userId, callback) {
    stopListeningProgress();
    const { doc, onSnapshot } = await fs();
    const db = getAppDb();
    _unsubProgress = onSnapshot(
        doc(db, 'families', familyId, 'schoolProgress', userId),
        (snap) => callback(snap.exists() ? snap.data() : {}),
        (err) => console.error('School progress listener error:', err)
    );
}

export function stopListeningProgress() {
    if (_unsubProgress) { _unsubProgress(); _unsubProgress = null; }
}

async function _mergeProgress(familyId, userId, topicId, fields) {
    const { doc, updateDoc, setDoc } = await fs();
    const db = getAppDb();
    // Use dot-notation keys so only these specific fields are written without
    // overwriting other fields in the same topicId map entry.
    const dotFields = {};
    for (const [k, v] of Object.entries(fields)) {
        dotFields[`${topicId}.${k}`] = v;
    }
    try {
        await updateDoc(doc(db, 'families', familyId, 'schoolProgress', userId), dotFields);
    } catch {
        // Document doesn't exist yet — create it
        await setDoc(doc(db, 'families', familyId, 'schoolProgress', userId), { [topicId]: fields });
    }
}

export async function markTopicRead(familyId, userId, topicId) {
    await _mergeProgress(familyId, userId, topicId, {
        read: true,
        lastSeen: new Date().toISOString(),
    });
}

export async function markQuizDone(familyId, userId, topicId) {
    await _mergeProgress(familyId, userId, topicId, { quizDone: true });
}

export async function markGameDone(familyId, userId, topicId) {
    await _mergeProgress(familyId, userId, topicId, { gameDone: true });
}

const DEFAULT_TOPICS = [
    {
        template_id: 'what-is-stock',
        title: 'מה זה מניה?',
        category: 'מניות',
        content: 'מניה היא חלק קטן בחברה.\nכשאתה קונה מניה — אתה הופך לשותף בחברה!\n\nדוגמה: לאפל יש מיליוני מניות. אם יש לך מניה אחת — אתה בעלים של חלק קטן מאפל! 🍎\n\nאם החברה מרוויחה ← שווי המניה עולה\nאם החברה מפסידה ← שווי המניה יורד\n\nזו הסיבה שמשקיעים בוחרים חברות שהם מאמינים בהן!',
        quiz: [
            {
                question: 'מה קורה כשאתה קונה מניה בחברה?',
                options: ['אתה מלווה כסף לחברה', 'אתה הופך לשותף בחברה', 'אתה מקבל ריבית קבועה', 'אתה קונה מוצר מהחברה'],
                correct: 1,
            },
            {
                question: 'אם חברה מרוויחה הרבה כסף, מה קורה למניה שלה?',
                options: ['שווי המניה יורד', 'לא משתנה כלום', 'שווי המניה עולה', 'המניה נעלמת'],
                correct: 2,
            },
        ],
    },
    {
        template_id: 'compound-interest',
        title: 'ריבית דריבית — הקסם של הכסף',
        category: 'ריבית דריבית',
        content: 'ריבית דריבית פירושה שהריבית שקיבלת — גם היא מרוויחה ריבית!\n\nדוגמה עם 100 ₪ ו-10% בשנה:\n📅 שנה 1: 100 ₪ ← 110 ₪\n📅 שנה 2: 110 ₪ ← 121 ₪\n📅 שנה 3: 121 ₪ ← 133 ₪\n\nאחרי 10 שנים — הכסף יהיה 259 ₪ בלי לעשות כלום! 🚀\n\nסוד: ככל שמתחילים מוקדם יותר, הקסם גדול יותר!',
        quiz: [
            {
                question: 'מה ההבדל בין ריבית רגילה לריבית דריבית?',
                options: ['אין הבדל', 'בריבית דריבית הריבית מרוויחה גם היא ריבית', 'ריבית דריבית תמיד נמוכה יותר', 'רק בנקים יכולים לקבל אותה'],
                correct: 1,
            },
            {
                question: 'מתי כדאי להתחיל לחסוך כדי ליהנות מריבית דריבית?',
                options: ['כמה שיותר מאוחר', 'לא משנה מתי', 'כמה שיותר מוקדם', 'רק אחרי גיל 18'],
                correct: 2,
            },
        ],
    },
    {
        template_id: 'diversification',
        title: 'פיזור — לא לשים הכל בסל אחד',
        category: 'פיזור',
        content: 'פיזור פירושו לפזר את הכסף על הרבה השקעות שונות.\n\n🥚 הכלל: "אל תשים את כל הביצים בסל אחד"\n\nלמה חשוב לפזר?\n• אם חברה אחת נכשלת — לא מאבדים הכל\n• כשמשהו יורד, משהו אחר יכול לעלות\n• מקטין את הסיכון הכולל\n\nדוגמה: עדיף להשקיע 100 ₪ בכל אחת מ-10 חברות מאשר 1,000 ₪ בחברה אחת!',
        quiz: [
            {
                question: 'מה זה פיזור השקעות?',
                options: ['להשקיע הכל במניה אחת חזקה', 'לפזר את הכסף על הרבה השקעות שונות', 'להשקיע רק בזהב', 'לחכות לזמן הנכון'],
                correct: 1,
            },
            {
                question: 'מה הסיבה העיקרית לפזר השקעות?',
                options: ['כי הכסף גדל יותר מהר', 'כי הבנק מרוויח פחות', 'כי אם השקעה אחת נכשלת לא מאבדים הכל', 'כי זה חוק'],
                correct: 2,
            },
        ],
    },
    {
        template_id: 'savings-vs-invest',
        title: 'חיסכון לעומת השקעה',
        category: 'כללי',
        content: 'שני כלים שונים לניהול כסף:\n\n🏦 חיסכון — שמירת כסף במקום בטוח\n• בטוח לחלוטין\n• ריבית נמוכה\n• מתאים למטרות קרובות (חופשה, מתנה)\n\n📈 השקעה — שימוש בכסף כדי להרוויח יותר\n• פוטנציאל לרווח גבוה\n• יש סיכון — הכסף יכול לרדת\n• מתאים למטרות רחוקות (קולג\', דירה)\n\nהנוסחה המנצחת: חיסכון לטווח קצר + השקעה לטווח ארוך! 💡',
        quiz: [
            {
                question: 'איזו אפשרות מתאימה יותר לקנייה של גיימפד בעוד חודשיים?',
                options: ['השקעה במניות', 'חשבון חיסכון', 'קרן מניות', 'מט"ח'],
                correct: 1,
            },
            {
                question: 'מה היתרון של השקעה על פני חיסכון רגיל?',
                options: ['בטוחה יותר', 'מתאימה לטווח קצר', 'פוטנציאל לרווח גבוה יותר', 'ללא סיכון בכלל'],
                correct: 2,
            },
        ],
    },
    {
        template_id: 'what-is-etf',
        title: 'מה זה ETF — קרן סל?',
        category: 'קרנות',
        content: 'ETF (קרן סל) היא כמו סל קניות שמכיל הרבה מניות יחד.\n\n🛒 במקום לקנות מניה אחת של חברה אחת — אתה קונה "סל" שמכיל עשרות או מאות חברות בבת אחת!\n\nדוגמה מפורסמת: S&P 500\n• מכיל 500 החברות הגדולות בארה"ב (אפל, גוגל, אמזון ועוד)\n• קניית יחידה אחת = השקעה ב-500 חברות!\n\nיתרונות ETF:\n✅ פיזור אוטומטי — אם חברה אחת נופלת, 499 אחרות מגנות עליך\n✅ עמלות נמוכות — זול יותר ממנהל השקעות\n✅ קל לקנייה — נסחר כמו מניה רגילה\n\nרוב המשקיעים הגדולים ממליצים להתחיל עם ETF!',
        quiz: [
            {
                question: 'מה מכיל ETF של S&P 500?',
                options: ['מניה אחת חזקה', '500 איגרות חוב', '500 החברות הגדולות בארה"ב', 'זהב וכסף'],
                correct: 2,
            },
            {
                question: 'מה היתרון הגדול של ETF לעומת מניה בודדת?',
                options: ['תמיד עולה בערכו', 'פיזור אוטומטי על הרבה חברות', 'ללא סיכון', 'הבנק מבטיח אותו'],
                correct: 1,
            },
            {
                question: 'כיצד נסחר ETF?',
                options: ['רק דרך הבנק פעם בשבוע', 'אפשר לקנות ולמכור כמו מניה רגילה', 'רק דרך מנהל השקעות', 'רק בסוף השנה'],
                correct: 1,
            },
        ],
    },
    {
        template_id: 'what-is-bond',
        title: 'מה זה אג"ח?',
        category: 'אג"ח',
        content: 'אגרת חוב (אג"ח) היא הלוואה שאתה נותן לממשלה או לחברה — ומקבל ריבית קבועה בתמורה.\n\n💡 דמיין שחבר מבקש ממך הלוואה של 100 ₪ ומבטיח להחזיר 110 ₪ בעוד שנה — זה בדיוק אג"ח!\n\nשני סוגים עיקריים:\n🏛️ אג"ח ממשלתי — הלוואה לממשלה. בטוח מאוד, ריבית נמוכה.\n🏢 אג"ח קונצרני — הלוואה לחברה. יותר ריבית, אבל יותר סיכון.\n\nהשוואה למניה:\n• מניה = שותפות (מרוויח אם החברה מרוויחה)\n• אג"ח = הלוואה (מקבל ריבית קבועה בכל מקרה)\n\nאג"ח מתאים למשקיעים שרוצים יציבות וצפיות!',
        quiz: [
            {
                question: 'מהי אגרת חוב (אג"ח) בעצם?',
                options: ['חלק בבעלות חברה', 'הלוואה שנותנים לממשלה או חברה תמורת ריבית', 'מטבע דיגיטלי', 'תוכנית חיסכון בנקאית'],
                correct: 1,
            },
            {
                question: 'איזה אג"ח בטוח יותר בדרך כלל?',
                options: ['אג"ח קונצרני (חברה)', 'אג"ח ממשלתי', 'שניהם שווים', 'תלוי בגודל הריבית'],
                correct: 1,
            },
            {
                question: 'מה ההבדל העיקרי בין אג"ח למניה?',
                options: ['אין הבדל', 'אג"ח נותן ריבית קבועה; מניה תלויה ברווחי החברה', 'מניה בטוחה יותר', 'אג"ח רק לחברות גדולות'],
                correct: 1,
            },
        ],
    },
    {
        template_id: 'capital-market',
        title: 'שוק ההון — איפה קונים ומוכרים?',
        category: 'שוק ההון',
        content: 'שוק ההון הוא המקום שבו קונים ומוכרים מניות, אג"ח וניירות ערך אחרים.\n\n🏛️ הבורסות המפורסמות בעולם:\n• NYSE ו-NASDAQ — ניו יורק, הגדולות בעולם (אפל, גוגל, טסלה)\n• בורסת תל אביב (TASE) — ישראל\n• לונדון, טוקיו, הונג קונג — ועוד עשרות ברחבי העולם\n\n📊 מדד שוק — מה זה?\nמדד הוא "ממוצע" של קבוצת מניות שמראה לנו את מצב השוק.\n• S&P 500 — 500 החברות הגדולות בארה"ב\n• דאו ג\'ונס — 30 חברות ענק אמריקאיות\n• ת"א 125 — 125 החברות הגדולות בישראל\n\n📅 שעות מסחר:\nהבורסה לא פתוחה 24/7 — יש שעות קבועות בימי עסקים.\n\nכשאומרים "השוק ירד היום" — מתכוונים שהמדד ירד!',
        quiz: [
            {
                question: 'מה זה מדד S&P 500?',
                options: ['500 האנשים העשירים בארה"ב', 'ממוצע של 500 החברות הגדולות בארה"ב', 'מטבע אמריקאי', '500 אג"ח ממשלתיים'],
                correct: 1,
            },
            {
                question: 'כשאומרים "השוק עלה היום" — למה מתכוונים?',
                options: ['מחירי הנדל"ן עלו', 'מדד המניות הראשי עלה', 'הריבית עלתה', 'הדולר התחזק'],
                correct: 1,
            },
        ],
    },
    {
        template_id: 'what-is-dividend',
        title: 'מה זה דיבידנד?',
        category: 'מניות',
        content: 'דיבידנד הוא תשלום שחברה מחלקת לבעלי המניות שלה מתוך הרווחים שלה.\n\n💰 איך זה עובד?\nנניח שיש לך 10 מניות של חברה שמחלקת 5 ₪ דיבידנד לכל מניה — אתה מקבל 50 ₪ ישירות לחשבון!\n\nלא כל החברות מחלקות דיבידנד:\n• חברות "בשלות" (בנקים, חברות שירות) — מחלקות דיבידנד\n• חברות צמיחה (סטארטאפים, טכנולוגיה) — משקיעות את הרווח חזרה בעסק\n\nשתי דרכים להרוויח ממניות:\n1️⃣ עלייה בשווי המניה (קנית ב-100 ₪, עכשיו שווה 150 ₪)\n2️⃣ דיבידנד — תשלום תקופתי מהרווחים\n\nמשקיעים שאוהבים "הכנסה פסיבית" מחפשים מניות דיבידנד!',
        quiz: [
            {
                question: 'מה זה דיבידנד?',
                options: ['סוג של מניה', 'תשלום לבעלי מניות מרווחי החברה', 'קנס על מכירת מניה', 'עמלת קנייה'],
                correct: 1,
            },
            {
                question: 'אילו חברות נוטות יותר לחלק דיבידנד?',
                options: ['סטארטאפים צעירים', 'חברות טכנולוגיה בצמיחה', 'חברות בשלות ויציבות כמו בנקים', 'כל חברה חייבת לחלק'],
                correct: 2,
            },
        ],
    },
    {
        template_id: 'inflation',
        title: 'אינפלציה — למה הכסף שלך נשחק?',
        category: 'כלכלה',
        content: 'אינפלציה פירושה שהמחירים עולים עם הזמן — ובגלל זה 100 ₪ היום שווים פחות מ-100 ₪ לפני 10 שנים.\n\n🛒 דוגמה:\nלחם שעלה 5 ₪ לפני 10 שנים עולה היום 10 ₪.\nאם חסכת 5 ₪ מתחת לבלטה — אתה יכול לקנות חצי כיכר!\n\n📉 זה אומר:\n• כסף שיושב בחשבון שוטף — מאבד ערך כל שנה\n• הבנק נותן ריבית נמוכה מהאינפלציה — אתה "מפסיד" בלי לשים לב\n\n🚀 הפתרון — להשקיע!\nהיסטורית, שוק המניות עולה יותר מקצב האינפלציה.\nהשקעה = הגנה על כוח הקנייה של הכסף שלך.\n\n🇮🇱 בישראל: מדד המחירים לצרכן (מדד) מודד את האינפלציה.',
        quiz: [
            {
                question: 'מה זה אינפלציה?',
                options: ['עלייה בשווי המניות', 'עלייה כללית במחירים לאורך זמן', 'ירידה בשיעור הריבית', 'גידול בייצור'],
                correct: 1,
            },
            {
                question: 'מדוע כסף מזומן מתחת לכרית "מפסיד" ערך?',
                options: ['הוא מתקלקל פיזית', 'האינפלציה מפחיתה את כוח הקנייה שלו', 'הבנק גובה עמלה', 'הממשלה לוקחת ממנו'],
                correct: 1,
            },
            {
                question: 'איך משקיעים מתגוננים מפני אינפלציה?',
                options: ['שומרים כסף מזומן', 'משקיעים בנכסים שצומחים כמו מניות', 'קונים יותר ביום שישי', 'מחכים שהאינפלציה תעבור'],
                correct: 1,
            },
        ],
    },
    {
        template_id: 'mutual-fund',
        title: 'קרן נאמנות — מנהל השקעות בשבילך',
        category: 'קרנות',
        content: 'קרן נאמנות היא כלי השקעה שבו מנהל מקצועי מחליט בשבילך היכן להשקיע.\n\n👨‍💼 איך זה עובד?\nהרבה משקיעים שמים כסף יחד בקרן, ומנהל מקצועי בוחר מניות/אג"ח עבורם.\n\nההבדל מ-ETF:\n📦 ETF — עוקב אחרי מדד אוטומטית, עמלות נמוכות מאוד\n👨‍💼 קרן נאמנות — מנהל פעיל שמנסה "להכות את השוק", עמלות גבוהות יותר\n\nסוגי קרנות בישראל:\n• קרן כספית — כמו חיסכון נזיל, ריבית סבירה ובטוחה\n• קרן מניות — השקעה במניות, פוטנציאל גבוה יותר\n• קרן מעורבת — שילוב של מניות ואג"ח\n\n💡 עובדה מפתיעה: רוב מנהלי הקרנות לא מצליחים להשיג תשואה טובה יותר מ-ETF פשוט לאורך זמן!',
        quiz: [
            {
                question: 'מה ההבדל העיקרי בין קרן נאמנות ל-ETF?',
                options: ['קרן נאמנות זולה יותר', 'קרן נאמנות מנוהלת על ידי אדם; ETF עוקב מדד אוטומטית', 'ETF מסוכן יותר', 'אין הבדל'],
                correct: 1,
            },
            {
                question: 'מה זה קרן כספית?',
                options: ['קרן שמשקיעה רק בזהב', 'השקעה נזילה ובטוחה יחסית עם ריבית סבירה', 'קרן לילדים בלבד', 'הלוואה מהבנק'],
                correct: 1,
            },
        ],
    },
    {
        template_id: 'risk-return',
        title: 'סיכון ותשואה — שני צדדי אותו מטבע',
        category: 'כללי',
        content: 'בעולם ההשקעות יש כלל ברזל: ככל שפוטנציאל הרווח גבוה יותר — הסיכון גדול יותר.\n\n📊 סולם הסיכון:\n🟢 נמוך: פיקדון בבנק, אג"ח ממשלתי — בטוח, תשואה נמוכה (1-3%)\n🟡 בינוני: קרן מעורבת, אג"ח קונצרני — תנודות מתונות (4-7%)\n🔴 גבוה: מניות בודדות, קריפטו — יכול לעלות מאוד, יכול גם לרדת מאוד (10%+)\n\n💡 שני עקרונות חשובים:\n1. אל תשקיע כסף שתצטרך בקרוב! שוק המניות יכול לרדת לתקופות ארוכות.\n2. טווח ארוך = פחות סיכון. ב-20 שנה, שוק המניות עלה כמעט תמיד.\n\nמה מתאים לך? תלוי בגיל, ביעדים, ובכמה "לחץ" אתה יכול לסבול.',
        quiz: [
            {
                question: 'השקעה עם תשואה פוטנציאלית גבוהה מאוד — מה זה אומר על הסיכון שלה?',
                options: ['הסיכון נמוך', 'הסיכון גם גבוה', 'הסיכון לא קשור לתשואה', 'הסיכון מבוטח'],
                correct: 1,
            },
            {
                question: 'מדוע השקעה לטווח ארוך בשוק המניות נחשבת פחות מסוכנת?',
                options: ['כי אין תנודות', 'כי היסטורית השוק עולה לאורך עשרות שנים', 'כי הממשלה מבטיחה', 'כי מניות תמיד עולות'],
                correct: 1,
            },
        ],
    },
    {
        template_id: 'israeli-stocks',
        title: 'מניות ישראליות — הבורסה בתל אביב',
        category: 'שוק ההון',
        content: 'בורסת תל אביב (TASE) היא שוק ניירות הערך הישראלי, שנוסד ב-1953.\n\n📈 המדדים הישראליים הראשיים:\n• ת"א 35 — 35 החברות הגדולות בישראל (בנק הפועלים, טבע, מזרחי-טפחות...)\n• ת"א 125 — 125 החברות הגדולות\n• ת"א-SME 60 — חברות ביניים\n\n🏢 תחומים חזקים בישראל:\n• פיננסים — בנקים וחברות ביטוח\n• ביומד ותרופות — טבע, פריגו\n• נדל"ן — חברות בנייה גדולות\n• טכנולוגיה — חברות היי-טק\n\n💱 שים לב: מניות ישראליות נסחרות בשקלים, אבל חלקן גם בנסחרות בארה"ב (דואל-ליסטינג).\n\n🌍 אפשר להשקיע גם בחו"ל מישראל — דרך ברוקר ישראלי או זר.',
        quiz: [
            {
                question: 'מה כולל מדד ת"א 35?',
                options: ['35 אג"ח ממשלתיים', '35 החברות הגדולות הנסחרות בבורסת תל אביב', '35 קרנות נאמנות', '35 מטבעות'],
                correct: 1,
            },
            {
                question: 'באיזה מטבע נסחרות מניות בבורסת תל אביב?',
                options: ['דולר', 'אירו', 'שקל', 'יין יפני'],
                correct: 2,
            },
        ],
    },
    {
        template_id: 'how-to-start',
        title: 'איך להתחיל להשקיע — צעד ראשון',
        category: 'כללי',
        content: 'מוכנים להתחיל? הנה מדריך פשוט:\n\n📋 שלב 1 — הגדירו מטרה\nלמה אתם משקיעים? (קולג׳, דירה, פרישה, חירום)\nלמשך כמה זמן? קצר (1-3 שנים) / ארוך (10+ שנות)\n\n💰 שלב 2 — קבעו סכום\nהשקיעו רק כסף שלא תצטרכו בקרוב!\nאפשר להתחיל גם עם 50-100 ₪ בחודש.\n\n🏦 שלב 3 — בחרו פלטפורמה\n• ברוקר ישראלי: בית השקעות (מיטב, אלטשולר-שחם, IBI)\n• ברוקר בינלאומי: Interactive Brokers, eToro\n\n📦 שלב 4 — בחרו מה לקנות\nמתחילים? ETF רחב (S&P 500 / עולמי) הוא נקודת התחלה מצוינת.\n\n🔁 שלב 5 — השקיעו בקביעות\nהשקעה חודשית קבועה ("Dollar Cost Averaging") מקטינה את הסיכון — קונים פחות יחידות כשהמחיר גבוה, יותר כשהמחיר נמוך.\n\nזכרו: הזמן בשוק חשוב יותר מ-"תזמון השוק"! ⏰',
        quiz: [
            {
                question: 'מה עדיף: לחכות לרגע הנכון להשקיע, או להשקיע בקביעות?',
                options: ['לחכות לרגע הנכון תמיד עדיף', 'השקעה קבועה לאורך זמן עדיפה ברוב המקרים', 'תלוי במזל', 'עדיף לא להשקיע בכלל'],
                correct: 1,
            },
            {
                question: 'מה מומלץ למתחילים לקנות?',
                options: ['מניה אחת של חברה שאוהבים', 'מטבע קריפטו', 'ETF רחב על מדד עולמי', 'זהב בלבד'],
                correct: 2,
            },
            {
                question: 'מה זה "Dollar Cost Averaging"?',
                options: ['המרת דולרים לשקלים', 'השקעה של סכום קבוע בכל חודש', 'קנייה רק כשהשוק יורד', 'מכירה של מניות בשיא'],
                correct: 1,
            },
        ],
    },
];

export async function seedDefaultTopics(familyId, createdByName) {
    const { collection, doc, setDoc } = await fs();
    const db = getAppDb();
    for (const topic of DEFAULT_TOPICS) {
        await setDoc(doc(db, 'families', familyId, 'schoolTopics', topic.template_id), {
            ...topic,
            created_by_name: createdByName,
            created_at: new Date().toISOString(),
            comment_count: 0,
        });
    }
}

// Backfill template_id on existing docs that match a default topic title
export async function migrateTopicTemplateIds(familyId) {
    const { collection, getDocs, doc, updateDoc } = await fs();
    const db = getAppDb();
    const snap = await getDocs(collection(db, 'families', familyId, 'schoolTopics'));
    const titleToSlug = Object.fromEntries(DEFAULT_TOPICS.map(t => [t.title, t.template_id]));
    let count = 0;
    for (const d of snap.docs) {
        const data = d.data();
        const slug = titleToSlug[data.title];
        if (slug && !data.template_id) {
            await updateDoc(doc(db, 'families', familyId, 'schoolTopics', d.id), { template_id: slug });
            count++;
        }
    }
    return count;
}

// Delete a topic matching a template_id field
export async function deleteTopicByTemplateId(familyId, templateId) {
    const { collection, query, where, getDocs, doc, deleteDoc } = await fs();
    const db = getAppDb();
    const snap = await getDocs(
        query(collection(db, 'families', familyId, 'schoolTopics'), where('template_id', '==', templateId))
    );
    await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'families', familyId, 'schoolTopics', d.id))));
}

// Update a topic by its Firestore document ID
export async function upsertTopicById(familyId, topicId, data) {
    const { doc, updateDoc } = await fs();
    const db = getAppDb();
    await updateDoc(doc(db, 'families', familyId, 'schoolTopics', topicId), {
        ...data,
        updated_at: new Date().toISOString(),
    });
}

// Update a topic matching a template_id field, or create new if not found
export async function upsertTopicByTemplateId(familyId, templateId, data, authorName) {
    const { collection, query, where, getDocs, doc, updateDoc, addDoc } = await fs();
    const db = getAppDb();
    const q = query(
        collection(db, 'families', familyId, 'schoolTopics'),
        where('template_id', '==', templateId)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
        await updateDoc(doc(db, 'families', familyId, 'schoolTopics', snap.docs[0].id), {
            ...data,
            updated_at: new Date().toISOString(),
        });
    } else {
        await addDoc(collection(db, 'families', familyId, 'schoolTopics'), {
            ...data,
            template_id: templateId,
            created_by_name: authorName,
            created_at: new Date().toISOString(),
            comment_count: 0,
        });
    }
}

// Delete all existing topics then bulk-add new ones
export async function overrideAllTopics(familyId, topics, authorName) {
    const { collection, getDocs, deleteDoc, addDoc, doc } = await fs();
    const db = getAppDb();
    const colRef = collection(db, 'families', familyId, 'schoolTopics');
    const snap = await getDocs(colRef);
    await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'families', familyId, 'schoolTopics', d.id))));
    for (const topic of topics) {
        const { id: _id, _delete, ...rest } = topic;
        await addDoc(colRef, {
            ...rest,
            created_by_name: authorName,
            created_at: new Date().toISOString(),
            comment_count: 0,
        });
    }
}

export async function deleteComment(familyId, topicId, commentId) {
    const { doc, deleteDoc, updateDoc, increment } = await fs();
    const db = getAppDb();
    await deleteDoc(doc(db, 'families', familyId, 'schoolTopics', topicId, 'comments', commentId));
    await updateDoc(doc(db, 'families', familyId, 'schoolTopics', topicId), {
        comment_count: increment(-1),
    });
}
