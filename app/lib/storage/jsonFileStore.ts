import fs from 'fs';
import path from 'path';

const dataDir = path.join(process.cwd(), 'data');
const jsonFileCache = new Map<string, { parsed: unknown; modifiedAtMs: number }>();

const sanitizeKey = (key: string) => key.replace(/[^a-zA-Z0-9_-]/g, '_');

const ensureDataDir = () => {
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
};

const getFilePath = (key: string) => path.join(dataDir, `${sanitizeKey(key)}.json`);
const getTempFilePath = (key: string) => path.join(dataDir, `${sanitizeKey(key)}.tmp`);
const getBackupFilePath = (key: string) => path.join(dataDir, `${sanitizeKey(key)}.bak`);

export const readJsonFile = <T = unknown>(key: string, fallback: T): T => {
    ensureDataDir();
    const filePath = getFilePath(key);
    const backupFilePath = getBackupFilePath(key);

    if (!fs.existsSync(filePath) && !fs.existsSync(backupFilePath)) {
        return fallback;
    }

    try {
        const activeFilePath = fs.existsSync(filePath) ? filePath : backupFilePath;
        const stats = fs.statSync(activeFilePath);
        const cachedEntry = jsonFileCache.get(filePath);

        if (cachedEntry && cachedEntry.modifiedAtMs === stats.mtimeMs) {
            return structuredClone(cachedEntry.parsed) as T;
        }

        const parsedData = JSON.parse(fs.readFileSync(activeFilePath, 'utf8')) as T;
        jsonFileCache.set(filePath, {
            parsed: parsedData,
            modifiedAtMs: stats.mtimeMs,
        });

        return structuredClone(parsedData);
    } catch (error) {
        console.error(`Ошибка чтения файла ${filePath}:`, error);

        if (fs.existsSync(backupFilePath)) {
            try {
                const backupStats = fs.statSync(backupFilePath);
                const backupData = JSON.parse(fs.readFileSync(backupFilePath, 'utf8')) as T;
                jsonFileCache.set(filePath, {
                    parsed: backupData,
                    modifiedAtMs: backupStats.mtimeMs,
                });
                return structuredClone(backupData);
            } catch (backupError) {
                console.error(`Ошибка чтения резервной копии ${backupFilePath}:`, backupError);
            }
        }

        return fallback;
    }
};

export const writeJsonFile = (key: string, data: unknown) => {
    ensureDataDir();
    const filePath = getFilePath(key);
    const tempFilePath = getTempFilePath(key);
    const backupFilePath = getBackupFilePath(key);

    if (data === null) {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        if (fs.existsSync(backupFilePath)) {
            fs.unlinkSync(backupFilePath);
        }
        jsonFileCache.delete(filePath);
        return;
    }

    const payload = JSON.stringify(data, null, 2);

    if (typeof payload !== 'string') {
        throw new Error(`Невозможно сериализовать значение ключа ${key}`);
    }

    fs.writeFileSync(tempFilePath, payload, 'utf8');

    if (fs.existsSync(filePath)) {
        fs.copyFileSync(filePath, backupFilePath);
    }

    fs.renameSync(tempFilePath, filePath);
    fs.copyFileSync(filePath, backupFilePath);

    try {
        const stats = fs.statSync(filePath);
        jsonFileCache.set(filePath, {
            parsed: data,
            modifiedAtMs: stats.mtimeMs,
        });
    } catch (error) {
        console.error(`Ошибка обновления кеша файла ${filePath}:`, error);
        jsonFileCache.delete(filePath);
    }
};
