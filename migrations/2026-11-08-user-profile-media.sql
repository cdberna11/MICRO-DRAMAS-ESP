-- Migración opcional de D1 (también se ejecuta idempotentemente en las Pages Functions).
-- Base de datos: binding DB. No modifica tablas existentes ni contenido de usuarios.
CREATE TABLE IF NOT EXISTS user_watchlist (
 user_id INTEGER NOT NULL, drama_id INTEGER NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (user_id, drama_id),
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS user_playback_progress (
 user_id INTEGER NOT NULL, drama_id INTEGER NOT NULL,
 source_sha TEXT NOT NULL, position_ms INTEGER NOT NULL DEFAULT 0,
 duration_ms INTEGER NOT NULL DEFAULT 0, completed INTEGER NOT NULL DEFAULT 0,
 event_ms INTEGER NOT NULL DEFAULT 0,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (user_id, drama_id),
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS user_notification_reads (
 user_id INTEGER NOT NULL, notification_key TEXT NOT NULL,
 read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (user_id, notification_key),
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_watchlist_user ON user_watchlist(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_progress_user ON user_playback_progress(user_id, updated_at DESC);
