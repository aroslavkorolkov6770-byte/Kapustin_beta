import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
    createDatabaseConnection,
    getArgumentValue,
    hasArgument,
    projectRoot,
    runMigrations,
} from './shared.mjs';

const replaceExisting = hasArgument('--replace');
const dryRun = hasArgument('--dry-run');
const sourceDirectory = path.resolve(
    projectRoot,
    getArgumentValue('--source') || 'data',
);

const hashContent = (content) => crypto.createHash('sha256').update(content).digest('hex');

try {
    if (!fs.existsSync(sourceDirectory)) {
        throw new Error(`Каталог источника не найден: ${sourceDirectory}`);
    }

    const files = fs.readdirSync(sourceDirectory)
        .filter((fileName) => fileName.toLowerCase().endsWith('.json'))
        .sort((left, right) => left.localeCompare(right, 'en'));

    const entries = files.map((fileName) => {
        const filePath = path.join(sourceDirectory, fileName);
        const rawPayload = fs.readFileSync(filePath, 'utf8');
        const parsedPayload = JSON.parse(rawPayload);

        return {
            key: path.basename(fileName, path.extname(fileName)),
            fileName,
            payload: JSON.stringify(parsedPayload),
            checksum: hashContent(rawPayload),
        };
    });

    const importChecksum = hashContent(
        entries.map((entry) => `${entry.fileName}\0${entry.checksum}`).join('\n'),
    );

    console.log(`Проверено JSON-файлов: ${entries.length}`);
    console.log(`Контрольная сумма набора: ${importChecksum}`);

    if (dryRun) {
        console.log('Dry-run завершен: база данных не изменялась.');
        process.exit(0);
    }

    await runMigrations();
    const connection = await createDatabaseConnection();

    try {
        const [countRows] = await connection.query('SELECT COUNT(*) AS total FROM storage_entries');
        const existingCount = Number(countRows[0]?.total || 0);

        if (existingCount > 0 && !replaceExisting) {
            const placeholders = entries.map(() => '?').join(', ');
            const [existingRows] = await connection.execute(
                `SELECT storage_key, source_checksum
                 FROM storage_entries
                 WHERE storage_key IN (${placeholders})`,
                entries.map((entry) => entry.key),
            );
            const checksumByKey = new Map(
                existingRows.map((row) => [row.storage_key, row.source_checksum]),
            );
            const alreadyImported = entries.every(
                (entry) => checksumByKey.get(entry.key) === entry.checksum,
            );

            if (alreadyImported) {
                console.log('Этот набор JSON уже импортирован. Повторная запись не требуется.');
                process.exit(0);
            }

            throw new Error(
                'В storage_entries уже есть данные. Для осознанной замены используйте --replace.',
            );
        }

        await connection.beginTransaction();

        try {
            for (const entry of entries) {
                if (replaceExisting) {
                    const [rows] = await connection.execute(
                        'SELECT payload, version FROM storage_entries WHERE storage_key = ? FOR UPDATE',
                        [entry.key],
                    );
                    const existingEntry = rows[0];

                    if (existingEntry) {
                        await connection.execute(
                            `INSERT INTO storage_entry_backups
                                (storage_key, version, payload, backup_reason)
                             VALUES (?, ?, ?, 'import_replace')`,
                            [entry.key, existingEntry.version, existingEntry.payload],
                        );
                    }
                }

                await connection.execute(
                    `INSERT INTO storage_entries
                        (storage_key, payload, version, source_file, source_checksum)
                     VALUES (?, ?, 1, ?, ?)
                     ON DUPLICATE KEY UPDATE
                        payload = VALUES(payload),
                        version = version + 1,
                        source_file = VALUES(source_file),
                        source_checksum = VALUES(source_checksum)`,
                    [entry.key, entry.payload, entry.fileName, entry.checksum],
                );
            }

            await connection.execute(
                `INSERT INTO data_import_runs
                    (source_directory, imported_files, import_checksum, import_mode)
                 VALUES (?, ?, ?, ?)`,
                [
                    sourceDirectory,
                    entries.length,
                    importChecksum,
                    replaceExisting ? 'replace' : 'initial',
                ],
            );
            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        }

        console.log(`Импортировано записей: ${entries.length}`);
    } finally {
        await connection.end();
    }
} catch (error) {
    console.error('Импорт JSON в MySQL не выполнен:', error);
    process.exitCode = 1;
}
