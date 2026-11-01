import 'server-only';

import { readDataValue, writeDataValue } from '@/app/lib/storage/dataStore';

export const USER_ONLINE_WINDOW_MS = 90_000;
const USER_PRESENCE_KEY_PREFIX = 'tea_hub_presence_';
const USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;

export interface UserPresenceRecord {
    userId: string;
    lastSeenAt: string;
    isOnline: boolean;
}

export interface UserPresenceState {
    isOnline: boolean;
    lastSeenAt: string | null;
}

const getPresenceKey = (userId: string) => `${USER_PRESENCE_KEY_PREFIX}${userId}`;

const normalizePresenceRecord = (value: unknown, userId: string): UserPresenceRecord | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const record = value as Partial<UserPresenceRecord>;
    const lastSeenAt = typeof record.lastSeenAt === 'string' ? record.lastSeenAt : '';
    const lastSeenAtMs = Date.parse(lastSeenAt);

    if (
        record.userId !== userId
        || !lastSeenAt
        || !Number.isFinite(lastSeenAtMs)
    ) {
        return null;
    }

    return {
        userId,
        lastSeenAt,
        isOnline: record.isOnline !== false,
    };
};

const assertValidUserId = (userId: string) => {
    if (!USER_ID_PATTERN.test(userId)) {
        throw new Error('Некорректный идентификатор пользователя');
    }
};

export const markUserOnline = async (userId: string) => {
    assertValidUserId(userId);

    const record: UserPresenceRecord = {
        userId,
        lastSeenAt: new Date().toISOString(),
        isOnline: true,
    };

    await writeDataValue(getPresenceKey(userId), record);
    return record;
};

export const markUserOffline = async (userId: string) => {
    assertValidUserId(userId);

    const existingValue = await readDataValue<unknown>(getPresenceKey(userId), null);
    const existingRecord = normalizePresenceRecord(existingValue, userId);
    const record: UserPresenceRecord = {
        userId,
        lastSeenAt: existingRecord?.lastSeenAt || new Date().toISOString(),
        isOnline: false,
    };

    await writeDataValue(getPresenceKey(userId), record);
    return record;
};

export const getUserPresence = async (userId: string): Promise<UserPresenceState> => {
    assertValidUserId(userId);

    const value = await readDataValue<unknown>(getPresenceKey(userId), null);
    const record = normalizePresenceRecord(value, userId);

    if (!record) {
        return { isOnline: false, lastSeenAt: null };
    }

    const lastSeenAtMs = Date.parse(record.lastSeenAt);
    const isWithinOnlineWindow = lastSeenAtMs >= Date.now() - USER_ONLINE_WINDOW_MS;

    return {
        isOnline: record.isOnline && isWithinOnlineWindow,
        lastSeenAt: record.lastSeenAt,
    };
};

export const getUsersPresence = async (userIds: string[]) => {
    const uniqueUserIds = [...new Set(userIds.filter((userId) => USER_ID_PATTERN.test(userId)))];
    const states = await Promise.all(uniqueUserIds.map((userId) => getUserPresence(userId)));

    return uniqueUserIds.reduce<Record<string, UserPresenceState>>((result, userId, index) => {
        result[userId] = states[index];
        return result;
    }, {});
};
