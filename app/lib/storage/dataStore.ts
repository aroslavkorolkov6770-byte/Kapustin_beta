import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { getDataBackend } from '@/app/lib/database/config';
import { getMySqlPool } from '@/app/lib/database/mysqlPool';
import { readJsonFile, writeJsonFile } from '@/app/lib/storage/jsonFileStore';

interface StorageEntryRow extends RowDataPacket {
    storage_key: string;
    payload: string;
    version: number;
}

const parseStoredPayload = <T>(key: string, payload: string, fallback: T): T => {
    try {
        return JSON.parse(payload) as T;
    } catch (error) {
        console.error(`Ошибка разбора MySQL-значения ${key}:`, error);
        return fallback;
    }
};

export const readDataValue = async <T = unknown>(key: string, fallback: T): Promise<T> => {
    if (getDataBackend() === 'json') {
        return readJsonFile(key, fallback);
    }

    const [rows] = await getMySqlPool().execute<StorageEntryRow[]>(
        'SELECT storage_key, payload, version FROM storage_entries WHERE storage_key = ? LIMIT 1',
        [key],
    );

    if (rows.length === 0) {
        return fallback;
    }

    return structuredClone(parseStoredPayload(key, rows[0].payload, fallback));
};

export const readDataValues = async (keys: string[]) => {
    const uniqueKeys = [...new Set(keys.filter(Boolean))];
    const result: Record<string, unknown> = {};

    if (uniqueKeys.length === 0) {
        return result;
    }

    if (getDataBackend() === 'json') {
        uniqueKeys.forEach((key) => {
            result[key] = readJsonFile(key, []);
        });
        return result;
    }

    const placeholders = uniqueKeys.map(() => '?').join(', ');
    const [rows] = await getMySqlPool().execute<StorageEntryRow[]>(
        `SELECT storage_key, payload, version FROM storage_entries WHERE storage_key IN (${placeholders})`,
        uniqueKeys,
    );

    uniqueKeys.forEach((key) => {
        result[key] = [];
    });

    rows.forEach((row) => {
        result[row.storage_key] = parseStoredPayload(row.storage_key, row.payload, []);
    });

    return result;
};

export const writeDataValue = async (key: string, data: unknown) => {
    if (getDataBackend() === 'json') {
        writeJsonFile(key, data);
        return;
    }

    const pool = getMySqlPool();
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();
        const [existingRows] = await connection.execute<StorageEntryRow[]>(
            'SELECT storage_key, payload, version FROM storage_entries WHERE storage_key = ? FOR UPDATE',
            [key],
        );
        const existingEntry = existingRows[0];

        if (existingEntry) {
            await connection.execute<ResultSetHeader>(
                `INSERT INTO storage_entry_backups
                    (storage_key, version, payload, backup_reason)
                 VALUES (?, ?, ?, ?)`,
                [key, existingEntry.version, existingEntry.payload, data === null ? 'delete' : 'update'],
            );
        }

        if (data === null) {
            await connection.execute<ResultSetHeader>(
                'DELETE FROM storage_entries WHERE storage_key = ?',
                [key],
            );
            await connection.commit();
            return;
        }

        const serializedPayload = JSON.stringify(data);

        if (typeof serializedPayload !== 'string') {
            throw new Error(`Невозможно сериализовать значение ключа ${key}`);
        }

        if (existingEntry) {
            await connection.execute<ResultSetHeader>(
                `UPDATE storage_entries
                 SET payload = ?, version = version + 1, source_checksum = NULL, source_file = NULL
                 WHERE storage_key = ?`,
                [serializedPayload, key],
            );
        } else {
            await connection.execute<ResultSetHeader>(
                `INSERT INTO storage_entries
                    (storage_key, payload, version)
                 VALUES (?, ?, 1)`,
                [key, serializedPayload],
            );
        }

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};
