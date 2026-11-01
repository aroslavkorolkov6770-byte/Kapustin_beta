CREATE TABLE IF NOT EXISTS schema_migrations (
    migration_name VARCHAR(191) NOT NULL PRIMARY KEY,
    applied_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS storage_entries (
    storage_key VARCHAR(191) NOT NULL PRIMARY KEY,
    payload LONGTEXT NOT NULL,
    version BIGINT UNSIGNED NOT NULL DEFAULT 1,
    source_file VARCHAR(255) NULL,
    source_checksum CHAR(64) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT chk_storage_entries_payload_json CHECK (JSON_VALID(payload))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS storage_entry_backups (
    backup_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    storage_key VARCHAR(191) NOT NULL,
    version BIGINT UNSIGNED NOT NULL,
    payload LONGTEXT NOT NULL,
    backup_reason VARCHAR(32) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_storage_entry_backups_key_created (storage_key, created_at),
    CONSTRAINT chk_storage_entry_backups_payload_json CHECK (JSON_VALID(payload))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS data_import_runs (
    import_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    source_directory VARCHAR(1024) NOT NULL,
    imported_files INT UNSIGNED NOT NULL,
    import_checksum CHAR(64) NOT NULL,
    import_mode VARCHAR(32) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
