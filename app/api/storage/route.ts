import { NextResponse } from 'next/server';
import {
    getSessionFromCookies,
    getStoredUsers,
    isHiddenSystemUser,
    toPublicUser,
} from '@/app/lib/serverAuth';
import { readDataValue, writeDataValue } from '@/app/lib/storage/dataStore';
import { toLiteProfile } from '@/app/lib/liteProfile';
import {
    assertRateLimit,
    assertTrustedMutationRequest,
    getClientIdentifier,
    readJsonBody,
    securityErrorResponse,
} from '@/app/lib/serverSecurity';
import { isAiKnowledgeSourceKey, scheduleAiKnowledgeSync } from '@/app/lib/aiKnowledge';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const MAX_BATCH_KEYS = 30;
const MAX_CHUNKS = 400;
const MAX_STRING_UPLOAD_CHARACTERS = 60 * 1024 * 1024;
const MAX_ARRAY_UPLOAD_ITEMS = 25_000;
const MAX_TEST_RESULTS_PER_WRITE = 3;
const STORAGE_KEY_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;

type UnknownRecord = Record<string, unknown>;
type Session = NonNullable<Awaited<ReturnType<typeof getSessionFromCookies>>>;

const isRecord = (value: unknown): value is UnknownRecord => {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
};

const toRecordArray = (value: unknown): UnknownRecord[] => {
    return Array.isArray(value) ? value.filter(isRecord) : [];
};

const AUTH_READ_KEYS = new Set([
    'tea_hub_dynamic_route_v2',
    'tea_hub_dynamic_tests_v1',
    'tea_hub_dynamic_basics_v2',
    'tea_hub_urgent_files_v1',
    'tea_hub_assortment_matrix_v2',
    'tea_hub_products_v1',
    'tea_master_unified_v1',
    'sys_top_cats_v2',
    'sys_subs_map_v2',
    'sys_strengths_map_v2',
    'tea_hub_test_types_v1',
]);

const AUTH_WRITE_KEYS = new Set([
    'tea_hub_dynamic_route_v2',
    'tea_hub_dynamic_tests_v1',
    'tea_hub_dynamic_basics_v2',
    'tea_hub_urgent_files_v1',
    'tea_hub_assortment_matrix_v2',
    'tea_hub_products_v1',
    'tea_master_unified_v1',
    'sys_top_cats_v2',
    'sys_subs_map_v2',
    'sys_strengths_map_v2',
    'tea_hub_test_types_v1',
    'admin_cal_notes_v1',
]);

const isOwnKey = (key: string, prefix: string, userId: string) => key === `${prefix}${userId}`;
const isFileDataKey = (key: string) => key.startsWith('file_data_');
const isAiHistoryKey = (key: string) => key.startsWith('th_ai_history_');
const USER_SCOPED_PREFIXES = [
    'profile_data_',
    'prog_route_',
    'prog_tests_',
    'prog_basics_',
    'dismissed_tasks_',
    'th_passed_tests_',
] as const;

const getUserIdFromScopedKey = (key: string) => {
    const prefix = USER_SCOPED_PREFIXES.find((candidate) => key.startsWith(candidate));
    return prefix ? key.slice(prefix.length) : '';
};

const isHiddenSystemUserKey = async (key: string, sessionId: string) => {
    const targetUserId = getUserIdFromScopedKey(key);
    if (!targetUserId || targetUserId === sessionId) {
        return false;
    }

    const users = await getStoredUsers();
    const targetUser = users.find((user) => user.id === targetUserId);
    return isHiddenSystemUser(targetUser);
};

const isUserScopedKey = (key: string) => {
    return USER_SCOPED_PREFIXES.some((prefix) => key.startsWith(prefix));
};

const filterHiddenSystemResults = async (results: UnknownRecord[]) => {
    const users = await getStoredUsers();
    const hiddenUsers = users.filter(isHiddenSystemUser);
    const hiddenIds = new Set(hiddenUsers.map((user) => user.id));
    const hiddenNames = new Set(hiddenUsers.map((user) => user.name).filter(Boolean));

    return results.filter((result) => {
        const userId = typeof result.userId === 'string' ? result.userId : '';
        const userName = typeof result.userName === 'string' ? result.userName : '';
        return userId
            ? !hiddenIds.has(userId)
            : !(userName && hiddenNames.has(userName));
    });
};

const isOwnProgressKey = (key: string, userId: string) => {
    return (
        isOwnKey(key, 'prog_route_', userId)
        || isOwnKey(key, 'prog_tests_', userId)
        || isOwnKey(key, 'prog_basics_', userId)
        || isOwnKey(key, 'dismissed_tasks_', userId)
        || isOwnKey(key, 'th_passed_tests_', userId)
    );
};

const getNotificationsForUser = (allNotifications: UnknownRecord[], userId: string) => {
    return allNotifications.filter((item) => {
        const isVisibleTarget = item.target === 'Все' || item.target === userId || !item.target;
        const dismissedBy = Array.isArray(item.dismissedBy) ? item.dismissedBy : [];
        return isVisibleTarget && !dismissedBy.includes(userId);
    });
};

const mergeNotificationsForUser = (
    existingNotifications: UnknownRecord[],
    updatedVisibleNotifications: UnknownRecord[],
    session: Session,
) => {
    const updatedIds = new Set(
        (Array.isArray(updatedVisibleNotifications) ? updatedVisibleNotifications : [])
            .map((item) => String(item.id ?? ''))
            .filter(Boolean),
    );
    const existingIds = new Set(existingNotifications.map((item) => String(item.id ?? '')));
    const dismissedNotifications = existingNotifications.map((item) => {
        const isVisibleTarget = item.target === 'Все' || item.target === session.id || !item.target;
        const itemId = String(item.id ?? '');

        if (!isVisibleTarget || !itemId || updatedIds.has(itemId)) {
            return item;
        }

        const dismissedBy = Array.isArray(item.dismissedBy) ? item.dismissedBy : [];
        return dismissedBy.includes(session.id)
            ? item
            : { ...item, dismissedBy: [...dismissedBy, session.id] };
    });
    const timeoutAlerts = (Array.isArray(updatedVisibleNotifications) ? updatedVisibleNotifications : [])
        .filter((item) => {
            const itemId = String(item.id ?? '');
            return (
                itemId
                && !existingIds.has(itemId)
                && item.target === 'u_admin'
                && item.title === 'Провал по таймеру'
            );
        })
        .slice(0, 1)
        .map((item) => ({
            id: String(item.id).slice(0, 120),
            title: 'Провал по таймеру',
            text: String(item.text ?? '').trim().slice(0, 500),
            time: String(item.time ?? '').trim().slice(0, 120),
            target: 'u_admin',
            createdBy: session.id,
            createdAt: new Date().toISOString(),
        }));

    return [...timeoutAlerts, ...dismissedNotifications];
};

const getTestResultsForUser = (allResults: UnknownRecord[], userId: string, userName: string) => {
    return allResults.filter((item) => {
        if (item.userId) {
            return item.userId === userId;
        }

        return item.userName === userName;
    });
};

const appendTestResultsForUser = async (
    existingResults: UnknownRecord[],
    nextResults: UnknownRecord[],
    session: Session,
) => {
    const existingIds = new Set(existingResults.map((item) => String(item.id ?? '')));
    const candidates = Array.isArray(nextResults) ? nextResults : [];
    const appendedResults: UnknownRecord[] = [];
    const [storedTests, urgentFiles] = await Promise.all([
        readDataValue<UnknownRecord[]>('tea_hub_dynamic_tests_v1', []),
        readDataValue<UnknownRecord[]>('tea_hub_urgent_files_v1', []),
    ]);
    const availableTests = [
        ...toRecordArray(storedTests),
        ...toRecordArray(urgentFiles).filter((item) => item.isTest || Array.isArray(item.quiz)),
    ];

    for (const candidate of candidates) {
        if (!candidate || typeof candidate !== 'object' || appendedResults.length >= MAX_TEST_RESULTS_PER_WRITE) {
            continue;
        }

        const clientId = String(candidate.id ?? '').trim().slice(0, 120);
        const safeId = `${session.id}:${clientId || Date.now()}`;
        if ((clientId && existingIds.has(clientId)) || existingIds.has(safeId)) {
            continue;
        }

        const testId = String(candidate.testId ?? '').trim().slice(0, 160);
        const storedTest = availableTests.find((item) => String(item.id ?? '') === testId);
        const quiz = Array.isArray(storedTest?.quiz) ? storedTest.quiz.filter(isRecord) : [];
        const answers = Array.isArray(candidate.answers) ? candidate.answers.slice(0, 200) : [];
        const isTimeout = candidate.isTimeout === true;

        if (!testId || (!isTimeout && (quiz.length === 0 || answers.length !== quiz.length))) {
            continue;
        }
        const correctAnswers = isTimeout
            ? 0
            : quiz.reduce((total: number, question, index: number) => {
                return total + (Number.isInteger(answers[index]) && answers[index] === question.c ? 1 : 0);
            }, 0);
        const scoreValue = isTimeout ? 0 : Math.round((correctAnswers / quiz.length) * 100);
        const testName = String(storedTest?.title || storedTest?.name || candidate.testName || 'Тест').trim().slice(0, 240);

        const attempts = existingResults.filter((item) => {
            return item.userId === session.id && String(item.testId ?? '') === testId;
        }).length + appendedResults.filter((item) => item.testId === testId).length + 1;

        appendedResults.push({
            id: safeId,
            testId,
            userId: session.id,
            userName: session.name,
            testName,
            score: scoreValue,
            attempts,
            date: new Date().toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'long',
                hour: '2-digit',
                minute: '2-digit',
            }),
            createdAt: new Date().toISOString(),
        });
        existingIds.add(safeId);
    }

    return [...appendedResults, ...existingResults];
};

const canReadKey = async (key: string, session: Awaited<ReturnType<typeof getSessionFromCookies>>) => {
    if (key === 'tea_hub_push_subs_v1') return false;

    if (!session) {
        return false;
    }

    if (await isHiddenSystemUserKey(key, session.id)) {
        return false;
    }

    if (session.role === 'admin') {
        return true;
    }

    if (AUTH_READ_KEYS.has(key)) {
        return true;
    }

    if (key === 'tea_hub_notifications_v1' || key === 'tea_hub_test_results_v1') {
        return true;
    }

    if (isFileDataKey(key)) {
        return true;
    }

    if (isAiHistoryKey(key)) {
        return key === `th_ai_history_emp_${session.id}` || key === `th_ai_history_${session.id}`;
    }

    if (
        isOwnKey(key, 'profile_data_', session.id) ||
        isOwnKey(key, 'prog_route_', session.id) ||
        isOwnKey(key, 'prog_tests_', session.id) ||
        isOwnKey(key, 'prog_basics_', session.id) ||
        isOwnKey(key, 'dismissed_tasks_', session.id) ||
        isOwnKey(key, 'th_passed_tests_', session.id)
    ) {
        return true;
    }

    return false;
};

const canWriteKey = async (key: string, session: Awaited<ReturnType<typeof getSessionFromCookies>>) => {
    if (key === 'tea_hub_push_subs_v1') return false;

    if (!session) {
        return false;
    }

    if (await isHiddenSystemUserKey(key, session.id)) {
        return false;
    }

    if (session.role === 'admin') {
        return (
            AUTH_WRITE_KEYS.has(key)
            || key === 'tea_hub_notifications_v1'

            || key === 'tea_hub_test_results_v1'
            || isFileDataKey(key)
            || isAiHistoryKey(key)
            || isUserScopedKey(key)
        );
    }

    if (key === 'tea_hub_notifications_v1' || key === 'tea_hub_test_results_v1') {
        return true;
    }

    if (isAiHistoryKey(key)) {
        return key === `th_ai_history_emp_${session.id}` || key === `th_ai_history_${session.id}`;
    }

    if (
        isOwnProgressKey(key, session.id)
    ) {
        return true;
    }

    return false;
};

const readKeyForSession = async (key: string, session: Awaited<ReturnType<typeof getSessionFromCookies>>) => {
    const canRead = await canReadKey(key, session);

    if (!canRead) {
        throw new Error(`ACCESS_DENIED:${key}`);
    }

    const data = await readDataValue(key, []);

    if (key.startsWith('profile_data_')) return toLiteProfile(data);

    if (key === 'tea_hub_users_v1') {
        return (await getStoredUsers())
            .filter((user) => !isHiddenSystemUser(user))
            .map((user) => toPublicUser(user));
    }

    if (key === 'tea_hub_test_results_v1' && session?.role === 'admin') {
        return filterHiddenSystemResults(toRecordArray(data));
    }

    if (key === 'tea_hub_notifications_v1') {
        return session
            ? getNotificationsForUser(toRecordArray(data), session.id)
            : [];
    }

    if (!session || session.role === 'admin') {
        return data;
    }

    if (key === 'tea_hub_test_results_v1') {
        return getTestResultsForUser(toRecordArray(data), session.id, session.name);
    }

    return data;
};

const writeKeyForSession = async (
    key: string,
    data: unknown,
    session: Awaited<ReturnType<typeof getSessionFromCookies>>,
) => {
    const canWrite = await canWriteKey(key, session);

    if (!canWrite) {
        throw new Error(`ACCESS_DENIED:${key}`);
    }

    if (!session) {
        throw new Error('ACCESS_DENIED');
    }

    // Удаление из своего списка не должно стирать личные уведомления других сотрудников.
    if (key === 'tea_hub_notifications_v1') {
        const existingNotifications = await readDataValue<UnknownRecord[]>(key, []);
        await writeDataValue(
            key,
            mergeNotificationsForUser(toRecordArray(existingNotifications), toRecordArray(data), session),
        );
        return;
    }

    if (session.role !== 'admin') {
        if (key === 'tea_hub_test_results_v1') {
            const existingResults = await readDataValue<UnknownRecord[]>(key, []);
            await writeDataValue(
                key,
                await appendTestResultsForUser(
                    toRecordArray(existingResults),
                    toRecordArray(data),
                    session,
                ),
            );
            return;
        }
    }

    await writeDataValue(key, key.startsWith('profile_data_') ? toLiteProfile(data) : data);
};

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const rawKey = searchParams.get('key');
    const rawKeys = searchParams.get('keys');

    if (!rawKey && !rawKeys) {
        return NextResponse.json({ error: 'Не указан ключ данных' }, { status: 400 });
    }

    if (
        (rawKey && !STORAGE_KEY_PATTERN.test(rawKey))
        || (rawKeys && rawKeys.length > 4_000)
    ) {
        return NextResponse.json({ error: 'Некорректный ключ данных' }, { status: 400 });
    }

    const session = await getSessionFromCookies();

    if (!session) {
        return NextResponse.json({ error: 'Требуется авторизация' }, { status: 401 });
    }

    try {
        assertRateLimit('storage-read', getClientIdentifier(request, session.id), 300, 5 * 60 * 1000);

        if (rawKeys) {
            const keys = rawKeys
                .split(',')
                .map((key) => key.trim())
                .filter(Boolean);

            if (keys.length > MAX_BATCH_KEYS || keys.some((key) => !STORAGE_KEY_PATTERN.test(key))) {
                return NextResponse.json({ error: 'Запрошено слишком много ключей' }, { status: 400 });
            }

            const result: Record<string, unknown> = {};

            for (const key of keys) {
                try {
                    result[key] = await readKeyForSession(key, session);
                } catch (error) {
                    if (error instanceof Error && error.message.startsWith('ACCESS_DENIED')) {
                        result[key] = [];
                    } else {
                        console.error(`Ошибка чтения ключа ${key}:`, error);
                        result[key] = [];
                    }
                }
            }

            return NextResponse.json(result, {
                status: 200,
                headers: {
                    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                    Pragma: 'no-cache',
                    Expires: '0',
                },
            });
        }

        const data = await readKeyForSession(rawKey as string, session);
        return NextResponse.json(data, {
            status: 200,
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                Pragma: 'no-cache',
                Expires: '0',
            },
        });
    } catch (error) {
        const securityResponse = securityErrorResponse(error);
        if (securityResponse) {
            return securityResponse;
        }

        if (error instanceof Error && error.message.startsWith('ACCESS_DENIED')) {
            return NextResponse.json({ error: 'Недостаточно прав доступа' }, { status: 403 });
        }

        console.error('Ошибка чтения:', error);
        return NextResponse.json([], { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        assertTrustedMutationRequest(request);
        const session = await getSessionFromCookies();

        if (!session) {
            return NextResponse.json({ error: 'Требуется авторизация' }, { status: 401 });
        }

        assertRateLimit('storage-write', getClientIdentifier(request, session.id), 240, 5 * 60 * 1000);
        const body = await readJsonBody<Record<string, unknown>>(request, 1024 * 1024);
        const rawKey = typeof body.key === 'string' ? body.key : '';
        const { data } = body;
        const isChunked = body.chunked === true;
        const chunkType = body.chunkType === 'string' ? 'string' : 'array';
        const chunkIndex = Number.isInteger(body.chunkIndex) ? Number(body.chunkIndex) : 0;
        const totalChunks = Number.isInteger(body.totalChunks) ? Number(body.totalChunks) : 1;

        if (!STORAGE_KEY_PATTERN.test(rawKey) || typeof data === 'undefined') {
            return NextResponse.json({ error: 'Неверные данные' }, { status: 400 });
        }

        if (isChunked) {
            if (session.role !== 'admin') {
                return NextResponse.json(
                    { error: 'Chunk-загрузка доступна только администратору' },
                    { status: 403 },
                );
            }

            const isValidArrayChunk = chunkType === 'array' && Array.isArray(data);
            const isValidStringChunk = chunkType === 'string' && typeof data === 'string';

            if (
                (!isValidArrayChunk && !isValidStringChunk) ||
                totalChunks < 1 ||
                totalChunks > MAX_CHUNKS ||
                chunkIndex < 0 ||
                chunkIndex >= totalChunks
            ) {
                return NextResponse.json({ error: 'Неверные параметры chunk-загрузки' }, { status: 400 });
            }

            const canWrite = await canWriteKey(rawKey, session);

            if (!canWrite) {
                return NextResponse.json({ error: 'Недостаточно прав доступа' }, { status: 403 });
            }

            const tempKey = `${rawKey}__upload_tmp_${session.id}`;
            const existingTemp = chunkIndex === 0
                ? (chunkType === 'string' ? '' : [])
                : await readDataValue<unknown>(tempKey, chunkType === 'string' ? '' : []);
            const mergedChunk = chunkType === 'string'
                ? `${typeof existingTemp === 'string' ? existingTemp : ''}${data}`
                : [...(Array.isArray(existingTemp) ? existingTemp : []), ...data];

            if (
                (typeof mergedChunk === 'string' && mergedChunk.length > MAX_STRING_UPLOAD_CHARACTERS) ||
                (Array.isArray(mergedChunk) && mergedChunk.length > MAX_ARRAY_UPLOAD_ITEMS)
            ) {
                await writeDataValue(tempKey, null);
                return NextResponse.json({ error: 'Общий размер загрузки превышает допустимый лимит' }, { status: 413 });
            }

            if (chunkIndex === totalChunks - 1) {
                await writeKeyForSession(rawKey, mergedChunk, session);
                await writeDataValue(tempKey, null);
                if (isAiKnowledgeSourceKey(rawKey)) {
                    scheduleAiKnowledgeSync();
                }
                return NextResponse.json({ success: true, chunked: true, completed: true });
            }

            await writeDataValue(tempKey, mergedChunk);
            return NextResponse.json({ success: true, chunked: true, completed: false, chunkIndex });
        }

        await writeKeyForSession(rawKey, data, session);
        if (isAiKnowledgeSourceKey(rawKey)) {
            scheduleAiKnowledgeSync();
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        const securityResponse = securityErrorResponse(error);
        if (securityResponse) {
            return securityResponse;
        }

        if (error instanceof Error && error.message.startsWith('ACCESS_DENIED')) {
            return NextResponse.json({ error: 'Недостаточно прав доступа' }, { status: 403 });
        }

        console.error('Ошибка записи:', error);
        return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
    }
}
