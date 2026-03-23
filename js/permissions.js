// ============================================================
// Permissions — declarative role-based access control
// Single source of truth for what each role can do
// ============================================================

const RULES = {
    // System admin permissions
    'admin:view-families':       (user) => user.role === 'system',
    'admin:manage-announcements':(user) => user.role === 'system',
    'admin:view-feedback':       (user) => user.role === 'system',
    'admin:manage-system':       (user) => user.role === 'system',

    // Feedback — any family user can send
    'feedback:send':         (user) => user.role === 'manager' || user.role === 'member',

    // Family management
    'family:edit':           (user) => user.role === 'manager',

    // Kid/member management
    'kid:create':            (user) => user.role === 'manager',
    'kid:delete':            (user) => user.role === 'manager',
    'kid:rename':            (user) => user.role === 'manager',

    // Investments — manager only, except toggle-hidden and rename which kids can do for their own
    'investment:create':     (user) => user.role === 'manager',
    'investment:edit':       (user) => user.role === 'manager',
    'investment:delete':     (user) => user.role === 'manager',
    'investment:rename':     (user, ctx) => {
        if (user.role === 'manager') return true;
        return user.role === 'member' && user.kidName === ctx?.kidName;
    },
    'investment:toggle-hidden': (user, ctx) => {
        if (user.role === 'manager') return true;
        return user.role === 'member' && user.kidName === ctx?.kidName;
    },
    'investment:view':       (user, ctx) => {
        if (user.role === 'manager') return true;
        return user.kidName === ctx?.kidName;
    },

    // Goals — members can manage their own
    'goal:create':           (user, ctx) => {
        if (user.role === 'manager') return true;
        return user.role === 'member' && user.kidName === ctx?.kidName;
    },
    'goal:edit':             (user, ctx) => {
        if (user.role === 'manager') return true;
        return user.role === 'member' && user.kidName === ctx?.kidName;
    },
    'goal:delete':           (user, ctx) => {
        if (user.role === 'manager') return true;
        return user.role === 'member' && user.kidName === ctx?.kidName;
    },

    // Simulations — members can manage their own
    'simulation:create':     (user, ctx) => {
        if (user.role === 'manager') return true;
        return user.role === 'member' && user.kidName === ctx?.kidName;
    },
    'simulation:edit':       (user, ctx) => {
        if (user.role === 'manager') return true;
        return user.role === 'member' && user.kidName === ctx?.kidName;
    },
    'simulation:delete':     (user, ctx) => {
        if (user.role === 'manager') return true;
        return user.role === 'member' && user.kidName === ctx?.kidName;
    },

    // Members
    'member:create':         (user) => user.role === 'manager',
    'member:delete':         (user) => user.role === 'manager',
    'member:reset-password': (user) => user.role === 'manager',

    // Settings
    'settings:view':         (user) => user.role === 'manager',
    'settings:edit':         (user) => user.role === 'manager',

    // Import/Export
    'data:export':           (user) => user.role === 'manager',
    'data:import':           (user) => user.role === 'manager',

    // Prices
    'prices:refresh':        (user) => user.role === 'manager',

    // Investment requests — kids can submit; managers can approve/reject
    'investment-request:create': (user, ctx) => {
        if (user.role === 'member') return user.kidName === ctx?.kidName;
        return false;
    },
    'investment-request:manage': (user) => user.role === 'manager',
    'investment-request:view':   (user, ctx) => {
        if (user.role === 'manager') return true;
        return user.role === 'member' && user.kidName === ctx?.kidName;
    },

    // Family overview — both roles
    'family-view:access':    () => true,

    // Finance school — all family members can view and comment; only managers add/delete topics
    'school:access':         (user) => user.role === 'manager' || user.role === 'member',
    'school:add-topic':      (user) => user.role === 'manager',
    'school:delete-topic':   (user) => user.role === 'manager',
    'school:comment':        (user) => user.role === 'manager' || user.role === 'member',
    'school:delete-comment': (user) => user.role === 'manager',
};

export function can(user, action, context) {
    if (!user) return false;
    const rule = RULES[action];
    if (!rule) return false;
    return rule(user, context);
}

export function filterForUser(user, items, kidField = 'kid') {
    if (!user) return [];
    if (user.role === 'manager') return items;
    return items.filter(item => item[kidField] === user.kidName);
}
