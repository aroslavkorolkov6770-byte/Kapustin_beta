import { runMigrations } from './shared.mjs';

try {
    await runMigrations();
    console.log('Схема MySQL готова.');
} catch (error) {
    console.error('Не удалось применить миграции MySQL:', error);
    process.exitCode = 1;
}
