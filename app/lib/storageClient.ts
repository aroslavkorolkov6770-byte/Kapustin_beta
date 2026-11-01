const CHUNKED_UPLOAD_KEYS = new Set([
    'tea_hub_products_v1',
    'tea_hub_urgent_files_v1',
    'tea_hub_dynamic_route_v2',
    'tea_hub_dynamic_tests_v1',
    'tea_hub_assortment_matrix_v2',
    'tea_hub_test_results_v1',
]);
const CHUNK_SIZE = 150;
const CHUNK_UPLOAD_THRESHOLD = 250_000;
const STRING_CHUNK_SIZE = 180_000;
const STORAGE_CACHE_TTL_MS = 12_000;
const WRITE_RETRY_LIMIT = 2;

type CacheEntry = {
    value: any;
    expiresAt: number;
};

const storageCache = new Map<string, CacheEntry>();
const inFlightBatchRequests = new Map<string, Promise<Record<string, any>>>();
const inFlightWriteQueues = new Map<string, Promise<any>>();

const getBatchCacheKey = (keys: string[]) => [...keys].sort().join('||');

const readCachedValue = (key: string) => {
    const cachedEntry = storageCache.get(key);

    if (!cachedEntry) {
        return undefined;
    }

    if (cachedEntry.expiresAt < Date.now()) {
        storageCache.delete(key);
        return undefined;
    }

    return cachedEntry.value;
};

const writeCachedValue = (key: string, value: any) => {
    storageCache.set(key, {
        value,
        expiresAt: Date.now() + STORAGE_CACHE_TTL_MS,
    });
};

const invalidateStorageCache = (key: string) => {
    storageCache.delete(key);
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const postJson = async (payload: Record<string, any>) => {
    let lastError: unknown;

    for (let attempt = 0; attempt <= WRITE_RETRY_LIMIT; attempt += 1) {
        try {
            const response = await fetch('/api/storage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const responsePayload = await response.json().catch(() => ({}));
                throw new Error(responsePayload?.error || `Ошибка сохранения на сервер: ${response.status}`);
            }

            return response.json().catch(() => ({ success: true }));
        } catch (error) {
            lastError = error;

            if (attempt >= WRITE_RETRY_LIMIT) {
                break;
            }

            await wait(250 * (attempt + 1));
        }
    }

    console.error('Ошибка сохранения на сервер:', lastError);
    throw lastError;
};

const saveChunkedArrayToServer = async (key: string, data: any[]) => {
    const totalChunks = Math.max(1, Math.ceil(data.length / CHUNK_SIZE));

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
        const chunkData = data.slice(chunkIndex * CHUNK_SIZE, (chunkIndex + 1) * CHUNK_SIZE);
        await postJson({
            key,
            data: chunkData,
            chunked: true,
            chunkIndex,
            totalChunks,
        });
    }
};

const saveChunkedStringToServer = async (key: string, data: string) => {
    const totalChunks = Math.max(1, Math.ceil(data.length / STRING_CHUNK_SIZE));

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
        const chunkData = data.slice(chunkIndex * STRING_CHUNK_SIZE, (chunkIndex + 1) * STRING_CHUNK_SIZE);
        await postJson({
            key,
            data: chunkData,
            chunked: true,
            chunkType: 'string',
            chunkIndex,
            totalChunks,
        });
    }
};

export const saveDataToServer = async (key: string, data: any) => {
    const previousWrite = inFlightWriteQueues.get(key) || Promise.resolve();

    const nextWrite = previousWrite
        .catch(() => undefined)
        .then(async () => {
            const serializedLength = JSON.stringify(data)?.length ?? 0;
            invalidateStorageCache(key);

            if (CHUNKED_UPLOAD_KEYS.has(key) && Array.isArray(data) && serializedLength > CHUNK_UPLOAD_THRESHOLD) {
                return saveChunkedArrayToServer(key, data);
            }

            if ((typeof data === 'string' || key.startsWith('file_data_')) && typeof data === 'string' && serializedLength > CHUNK_UPLOAD_THRESHOLD) {
                return saveChunkedStringToServer(key, data);
            }

            return postJson({ key, data });
        })
        .finally(() => {
            const activeWrite = inFlightWriteQueues.get(key);
            if (activeWrite === nextWrite) {
                inFlightWriteQueues.delete(key);
            }
        });

    inFlightWriteQueues.set(key, nextWrite);
    return nextWrite;
};

export const fetchStorageBatch = async (keys: string[]) => {
    const safeKeys = keys.filter(Boolean);
    const result: Record<string, any> = {};
    const missingKeys: string[] = [];

    safeKeys.forEach((key) => {
        const cachedValue = readCachedValue(key);
        if (typeof cachedValue === 'undefined') {
            missingKeys.push(key);
            return;
        }

        result[key] = cachedValue;
    });

    if (missingKeys.length === 0) {
        return result;
    }

    const batchCacheKey = getBatchCacheKey(missingKeys);
    const existingRequest = inFlightBatchRequests.get(batchCacheKey);

    if (existingRequest) {
        const cachedPayload = await existingRequest;
        return { ...result, ...cachedPayload };
    }

    const nextRequest = fetch(`/api/storage?keys=${encodeURIComponent(missingKeys.join(','))}`, {
        cache: 'no-store',
    })
        .then(async (response) => {
            if (!response.ok) {
                throw new Error(`Ошибка пакетной загрузки данных: ${response.status}`);
            }

            const payload = await response.json();

            if (payload && typeof payload === 'object') {
                Object.entries(payload).forEach(([key, value]) => {
                    writeCachedValue(key, value);
                });
            }

            return payload as Record<string, any>;
        })
        .finally(() => {
            inFlightBatchRequests.delete(batchCacheKey);
        });

    inFlightBatchRequests.set(batchCacheKey, nextRequest);
    const fetchedPayload = await nextRequest;

    return { ...result, ...fetchedPayload };
};
