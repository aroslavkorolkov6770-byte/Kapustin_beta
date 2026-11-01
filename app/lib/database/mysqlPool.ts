import mysql, { type Pool } from 'mysql2/promise';
import { getMySqlRuntimeConfig } from '@/app/lib/database/config';

declare global {
    var vatesMySqlPool: Pool | undefined;
}

const createPool = () => {
    const config = getMySqlRuntimeConfig();

    return mysql.createPool({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        password: config.password,
        waitForConnections: true,
        connectionLimit: config.connectionLimit,
        queueLimit: 0,
        charset: 'utf8mb4',
        timezone: 'Z',
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
        ssl: config.ssl,
    });
};

export const getMySqlPool = () => {
    if (!globalThis.vatesMySqlPool) {
        globalThis.vatesMySqlPool = createPool();
    }

    return globalThis.vatesMySqlPool;
};

export const closeMySqlPool = async () => {
    if (!globalThis.vatesMySqlPool) {
        return;
    }

    await globalThis.vatesMySqlPool.end();
    globalThis.vatesMySqlPool = undefined;
};
