import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
    createDatabaseConnection,
    getArgumentValue,
    projectRoot,
} from './shared.mjs';

const sourceDirectory = path.resolve(
    projectRoot,
    getArgumentValue('--source') || 'data',
);
const hashContent = (content) => crypto.createHash('sha256').update(content).digest('hex');

try {
    const files = fs.readdirSync(sourceDirectory)
        .filter((fileName) => fileName.toLowerCase().endsWith('.json'))
        .sort((left, right) => left.localeCompare(right, 'en'));
    const connection = await createDatabaseConnection();
    const problems = [];

    try {
        for (const fileName of files) {
            const key = path.basename(fileName, path.extname(fileName));
            const rawPayload = fs.readFileSync(path.join(sourceDirectory, fileName), 'utf8');
            const normalizedPayload = JSON.stringify(JSON.parse(rawPayload));
            const checksum = hashContent(rawPayload);
            const [rows] = await connection.execute(
                `SELECT payload, source_checksum
                 FROM storage_entries
                 WHERE storage_key = ?
                 LIMIT 1`,
                [key],
            );
            const row = rows[0];

            if (!row) {
                problems.push(`${fileName}: запись отсутствует`);
                continue;
            }

            if (JSON.stringify(JSON.parse(row.payload)) !== normalizedPayload) {
                problems.push(`${fileName}: содержимое отличается`);
            }

            if (row.source_checksum !== checksum) {
                problems.push(`${fileName}: контрольная сумма отличается`);
            }
        }
    } finally {
        await connection.end();
    }

    if (problems.length > 0) {
        problems.forEach((problem) => console.error(problem));
        throw new Error(`Обнаружено расхождений: ${problems.length}`);
    }

    console.log(`MySQL полностью совпадает с ${files.length} JSON-файлами.`);
} catch (error) {
    console.error('Проверка MySQL не пройдена:', error);
    process.exitCode = 1;
}
