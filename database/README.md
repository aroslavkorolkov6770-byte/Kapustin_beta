# MySQL для Ватэс

## Что подготовлено

- Приложение по умолчанию продолжает работать с JSON.
- Переключение выполняется переменной `DATA_BACKEND`.
- MySQL хранит те же ключи и JSON-значения, поэтому интерфейс и API не требуют переделки.
- Перед каждым обновлением существующей записи MySQL сохраняет предыдущую версию в `storage_entry_backups`.
- Импорт не изменяет исходные файлы в `data/`.

Поддерживаемая версия: MySQL `8.0` или новее.

## Локальная настройка Windows

После установки MySQL Server выполнить:

```powershell
npm install
npm run db:setup-local
```

Скрипт:

1. запускает отдельный локальный MySQL на `127.0.0.1:3307`;
2. создает базу `vates_local` и пользователя приложения;
3. записывает пароль только в исключенный из Git файл `.env.local`;
4. применяет миграции;
5. импортирует JSON;
6. сверяет MySQL с исходными JSON.

Остановка локальной базы:

```powershell
npm run db:stop-local
```

## Команды базы данных

```powershell
npm run db:migrate
npm run db:import-json
npm run db:verify-json
npm run db:health
npm run db:export-json -- --output tmp/mysql-export
```

Дополнительные безопасные режимы:

```powershell
npm run db:import-json -- --dry-run
npm run db:import-json -- --source C:\path\to\data
```

`--replace` заменяет существующие записи и должен использоваться только осознанно после резервной копии:

```powershell
npm run db:import-json -- --source C:\path\to\data --replace
```

## Перенос на хост

1. Остановить операции записи или включить короткое техническое окно.
2. Создать архив серверной папки `data/` и SHA-256-манифест.
3. Создать пустую базу и отдельного пользователя MySQL без прав администратора сервера.
4. Добавить MySQL-переменные окружения, сохранив `DATA_BACKEND=json`.
5. Выполнить `npm install`, миграции, пробный импорт и проверку.
6. Только после успешной проверки установить `DATA_BACKEND=mysql`.
7. Пересобрать приложение и перезапустить PM2 с обновленными переменными.
8. Проверить вход, пользователей, материалы, документы, тесты и одну контролируемую запись.

Переменные окружения:

```dotenv
DATA_BACKEND=json
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=vates
MYSQL_USER=vates_app
MYSQL_PASSWORD=strong_private_password
MYSQL_CONNECTION_LIMIT=10
MYSQL_SSL=false
MYSQL_SSL_REJECT_UNAUTHORIZED=true
```

Команды подготовки, пока приложение еще работает с JSON:

```bash
npm install
npm run db:migrate
npm run db:import-json -- --dry-run
npm run db:import-json
npm run db:verify-json
npm run db:health
```

После проверки изменить только:

```dotenv
DATA_BACKEND=mysql
```

Затем:

```bash
npm run build
pm2 restart tea-hub --update-env
```

## Откат

Если после переключения еще не было новых записей, достаточно вернуть:

```dotenv
DATA_BACKEND=json
```

и выполнить:

```bash
pm2 restart tea-hub --update-env
```

Если после переключения пользователи уже изменяли данные, сначала экспортировать MySQL в отдельный каталог и сохранить его вместе с резервной копией. Нельзя просто переключиться на старые JSON, иначе новые изменения останутся только в MySQL.

```bash
npm run db:export-json -- --output /var/backups/tea-hub/mysql-export
```

Никогда не копировать экспорт поверх `data/` без отдельной проверки количества файлов и контрольных сумм.
