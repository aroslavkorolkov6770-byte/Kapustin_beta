import { createDatabaseConnection } from './shared.mjs';

try {
    const connection = await createDatabaseConnection();

    try {
        const [[serverRow]] = await connection.query(
            'SELECT VERSION() AS version, DATABASE() AS database_name',
        );
        const [[storageRow]] = await connection.query(
            'SELECT COUNT(*) AS entries, COALESCE(SUM(version), 0) AS total_versions FROM storage_entries',
        );
        const [[backupRow]] = await connection.query(
            'SELECT COUNT(*) AS backups FROM storage_entry_backups',
        );

        console.log(`MySQL: ${serverRow.version}`);
        console.log(`База: ${serverRow.database_name}`);
        console.log(`Записей: ${storageRow.entries}`);
        console.log(`Версий: ${storageRow.total_versions}`);
        console.log(`Резервов записей: ${backupRow.backups}`);
    } finally {
        await connection.end();
    }
} catch (error) {
    console.error('MySQL недоступна:', error);
    process.exitCode = 1;
}
