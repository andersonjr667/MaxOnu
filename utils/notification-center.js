const User = require('../models/User');

const listenersByUser = new Map();

function getUserSet(userId) {
    const key = String(userId);
    if (!listenersByUser.has(key)) {
        listenersByUser.set(key, new Set());
    }
    return listenersByUser.get(key);
}

function addSseClient(userId, res) {
    const set = getUserSet(userId);
    set.add(res);
}

function removeSseClient(userId, res) {
    const key = String(userId);
    const set = listenersByUser.get(key);
    if (!set) {
        return;
    }
    set.delete(res);
    if (set.size === 0) {
        listenersByUser.delete(key);
    }
}

function emitToUser(userId, eventName, payload) {
    const set = listenersByUser.get(String(userId));
    if (!set || !set.size) {
        return;
    }

    const body = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of set) {
        try {
            res.write(body);
        } catch (error) {
            // Ignore broken SSE sockets; they are cleaned up on close.
        }
    }
}

async function addUserNotification(userId, notification) {
    const doc = {
        type: notification.type,
        title: notification.title,
        message: notification.message,
        payload: notification.payload || {},
        readAt: null,
        createdAt: new Date()
    };

    const updated = await User.findByIdAndUpdate(
        userId,
        {
            $push: {
                notifications: {
                    $each: [doc],
                    $slice: -200
                }
            }
        },
        { new: true, select: 'notifications' }
    );

    if (!updated) {
        return null;
    }

    const saved = updated.notifications[updated.notifications.length - 1];
    const payload = {
        id: String(saved._id),
        type: saved.type,
        title: saved.title,
        message: saved.message,
        payload: saved.payload || {},
        readAt: saved.readAt,
        createdAt: saved.createdAt
    };

    emitToUser(userId, 'notification', payload);
    return payload;
}

module.exports = {
    addSseClient,
    removeSseClient,
    emitToUser,
    addUserNotification
};
