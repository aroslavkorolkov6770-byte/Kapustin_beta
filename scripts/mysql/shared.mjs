import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(currentDirectory, '..', '..');
export const migrationsDirectory = path.join(projectRoot, 'database', 'migrations');

const parseEnvFile = (filePath) => {
    if (!fs.existsSync(filePath)) {
        return {};
    }

    return fs.readFileSync(filePath, 'utf8')
        .split(/\r?\n/)
        .reduce((result, rawLine) => {
            const line = rawLine.trim();

            if (!line || line.startsWith('#') || !line.includes('=')) {
                return result;
            }

            const separatorIndex = line.indexOf('=');
            const key = line.slice(0, separatorIndex).trim();
            let value = line.slice(separatorIndex + 1).trim();

            if (
                (value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))
            ) {
                value = value.slice(1, -1);
            }

            result[key] = value;
            return result;
        }, {});
};

export const loadProjectEnv = () => {
    const mergedValues = {
        ...parseEnvFile(path.join(projectRoot, '.env')),
        ...parseEnvFile(path.join(projectRoot, '.env.local')),
    };

    Object.entries(mergedValues).forEach(([key, value]) => {
        if (typeof process.env[key] === 'undefined') {
            process.env[key] = value;
        }
    });
};

const parsePositiveInteger = (value, fallback) => {
    const parsedValue = Number.parseInt(value || '', 10);
    return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
};

export const getScriptMySqlConfig = () => {
    loadProjectEnv();
    const mysqlUrl = process.env.MYSQL_URL?.trim();
    let host = process.env.MYSQL_HOST?.trim() || '';
    let port = parsePositiveInteger(process.env.MYSQL_PORT, 3306);
    let database = process.env.MYSQL_DATABASE?.trim() || '';
    let user = process.env.MYSQL_USER?.trim() || '';
    let password = process.env.MYSQL_PASSWORD || '';

    if (mysqlUrl) {
        const parsedUrl = new URL(mysqlUrl);

        if (parsedUrl.protocol !== 'mysql:') {
            throw new Error('MYSQL_URL должен начинаться с mysql://');
        }

        host = parsedUrl.hostname;
        port = parsedUrl.port ? parsePositiveInteger(parsedUrl.port, 3306) : 3306;
        database = decodeURIComponent(parsedUrl.pathname.replace(/^\//, ''));
        user = decodeURIComponent(parsedUrl.username);
        password = decodeURIComponent(parsedUrl.password);
    }

    const missingVariables = [
        ['MYSQL_HOST', host],
        ['MYSQL_DATABASE', database],
        ['MYSQL_USER', user],
        ['MYSQL_PASSWORD', password],
    ].filter(([, value]) => !value).map(([name]) => name);

    if (missingVariables.length > 0) {
        throw new Error(`Не настроены переменные MySQL: ${missingVariables.join(', ')}`);
    }

    return {
        host,
        port,
        database,
        user,
        password,
        charset: 'utf8mb4',
        timezone: 'Z',
        ssl: process.env.MYSQL_SSL === 'true'
            ? {
                rejectUnauthorized: process.env.MYSQL_SSL_REJECT_UNAUTHORIZED !== 'false',
            }
            : undefined,
    };
};

export const createDatabaseConnection = async ({ multipleStatements = false } = {}) => {
    const config = getScriptMySqlConfig();

    return mysql.createConnection({
        ...config,
        multipleStatements,
    });
};

export const runMigrations = async () => {
    const connection = await createDatabaseConnection({ multipleStatements: true });

    try {
        await connection.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                migration_name VARCHAR(191) NOT NULL PRIMARY KEY,
                applied_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
        `);

        const migrationFiles = fs.readdirSync(migrationsDirectory)
            .filter((fileName) => fileName.endsWith('.sql'))
            .sort((left, right) => left.localeCompare(right, 'en'));

        for (const migrationFile of migrationFiles) {
            const [rows] = await connection.execute(
                'SELECT migration_name FROM schema_migrations WHERE migration_name = ? LIMIT 1',
                [migrationFile],
            );

            if (rows.length > 0) {
                continue;
            }

            const sql = fs.readFileSync(path.join(migrationsDirectory, migrationFile), 'utf8');
            await connection.beginTransaction();

            try {
                await connection.query(sql);
                await connection.execute(
                    'INSERT INTO schema_migrations (migration_name) VALUES (?)',
                    [migrationFile],
                );
                await connection.commit();
                console.log(`Применена миграция: ${migrationFile}`);
            } catch (error) {
                await connection.rollback();
                throw error;
            }
        }
    } finally {
        await connection.end();
    }
};

export const getArgumentValue = (name) => {
    const argumentsList = process.argv.slice(2);
    const prefix = `${name}=`;
    const inlineArgument = argumentsList.find((value) => value.startsWith(prefix));

    if (inlineArgument) {
        return inlineArgument.slice(prefix.length);
    }

    const argumentIndex = argumentsList.indexOf(name);
    const followingValue = argumentIndex >= 0 ? argumentsList[argumentIndex + 1] : '';

    return followingValue && !followingValue.startsWith('--') ? followingValue : '';
};

export const hasArgument = (name) => process.argv.slice(2).includes(name);
