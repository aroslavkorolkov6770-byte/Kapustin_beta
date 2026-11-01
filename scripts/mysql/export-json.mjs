import fs from 'node:fs';
import path from 'node:path';
import {
    createDatabaseConnection,
    getArgumentValue,
    hasArgument,
    projectRoot,
} from './shared.mjs';

const force = hasArgument('--force');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputDirectory = path.resolve(
    projectRoot,
    getArgumentValue('--output') || path.join('tmp', `mysql-export-${timestamp}`),
);
const sanitizeKey = (key) => key.replace(/[^a-zA-Z0-9_-]/g, '_');

try {
    if (fs.existsSync(outputDirectory) && fs.readdirSync(outputDirectory).length > 0 && !force) {
        throw new Error(`Каталог экспорта не пуст: ${outputDirectory}. Используйте --force.`);
    }

    fs.mkdirSync(outputDirectory, { recursive: true });
    const connection = await createDatabaseConnection();

    try {
        const [rows] = await connection.query(
            'SELECT storage_key, payload FROM storage_entries ORDER BY storage_key',
        );

        for (const row of rows) {
            const filePath = path.join(outputDirectory, `${sanitizeKey(row.storage_key)}.json`);
            const parsedPayload = JSON.parse(row.payload);
            fs.writeFileSync(filePath, JSON.stringify(parsedPayload, null, 2), 'utf8');
        }

        console.log(`Экспортировано файлов: ${rows.length}`);
        console.log(`Каталог: ${outputDirectory}`);
    } finally {
        await connection.end();
    }
} catch (error) {
    console.error('Экспорт MySQL не выполнен:', error);
    process.exitCode = 1;
}
