export type DataBackend = 'json' | 'mysql';

export interface MySqlRuntimeConfig {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    connectionLimit: number;
    ssl: undefined | {
        rejectUnauthorized: boolean;
    };
}

const parsePositiveInteger = (value: string | undefined, fallback: number) => {
    const parsedValue = Number.parseInt(value || '', 10);
    return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
};

export const getDataBackend = (): DataBackend => {
    const backend = (process.env.DATA_BACKEND || 'json').trim().toLowerCase();

    if (backend !== 'json' && backend !== 'mysql') {
        throw new Error('DATA_BACKEND должен иметь значение json или mysql');
    }

    return backend;
};

export const getMySqlRuntimeConfig = (): MySqlRuntimeConfig => {
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
        connectionLimit: parsePositiveInteger(process.env.MYSQL_CONNECTION_LIMIT, 10),
        ssl: process.env.MYSQL_SSL === 'true'
            ? {
                rejectUnauthorized: process.env.MYSQL_SSL_REJECT_UNAUTHORIZED !== 'false',
            }
            : undefined,
    };
};
