const SESSION_COOKIE = "md_user_session";
const SESSION_MAX_AGE = 60 * 60 * 3;

function bytesToHex(bytes) {
    return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
    return bytes;
}
function constantTimeEqual(a, b) {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let index = 0; index < a.length; index += 1) result |= a.charCodeAt(index) ^ b.charCodeAt(index);
    return result === 0;
}
export function normalizeEmail(value) { return String(value || "").trim().toLowerCase(); }
export function normalizePhone(value) { return String(value || "").replace(/[^0-9+]/g, "").replace(/^00/, "+"); }
export function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
export function validPhone(value) { return /^\+[1-9]\d{7,14}$/.test(value); }

export async function hashPassword(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 120000, hash: "SHA-256" }, key, 256);
    return `pbkdf2$120000$${bytesToHex(salt)}$${bytesToHex(new Uint8Array(bits))}`;
}
export async function verifyPassword(password, storedHash) {
    try {
        const [scheme, iterationsText, saltHex, hashHex] = String(storedHash || "").split("$");
        const iterations = Number(iterationsText);
        if (scheme !== "pbkdf2" || !Number.isInteger(iterations) || !saltHex || !hashHex) return false;
        const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
        const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: hexToBytes(saltHex), iterations, hash: "SHA-256" }, key, 256);
        return constantTimeEqual(bytesToHex(new Uint8Array(bits)), hashHex);
    } catch { return false; }
}

async function getTableColumns(db, tableName) {
    const result = await db.prepare(`PRAGMA table_info(${tableName})`).all();
    return new Set((result.results || []).map(column => column.name));
}

async function addColumnIfMissing(db, columns, tableName, columnName, definition) {
    if (columns.has(columnName)) return;
    await db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`).run();
    columns.add(columnName);
}

export async function ensureUserSchema(db) {
    // Migración segura: las operaciones de esquema se ejecutan por separado
    // para que una diferencia de una versión anterior no aborte el registro.
    await db.prepare(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        phone TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        auth_method TEXT NOT NULL CHECK (auth_method IN ('email','phone')),
        display_name TEXT NOT NULL DEFAULT 'Usuario',
        avatar TEXT NOT NULL DEFAULT 'avatar-1.png',
        phone_verified INTEGER NOT NULL DEFAULT 0,
        email_verified INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_login_at TEXT
    )`).run();

    await db.prepare(`CREATE TABLE IF NOT EXISTS user_sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_activity_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`).run();

    const userColumns = await getTableColumns(db, "users");
    await addColumnIfMissing(db, userColumns, "users", "email", "TEXT");
    await addColumnIfMissing(db, userColumns, "users", "phone", "TEXT");
    await addColumnIfMissing(db, userColumns, "users", "password_hash", "TEXT NOT NULL DEFAULT ''");
    await addColumnIfMissing(db, userColumns, "users", "auth_method", "TEXT NOT NULL DEFAULT 'email'");
    await addColumnIfMissing(db, userColumns, "users", "display_name", "TEXT NOT NULL DEFAULT 'Usuario'");
    await addColumnIfMissing(db, userColumns, "users", "avatar", "TEXT NOT NULL DEFAULT 'avatar-1.png'");
    await addColumnIfMissing(db, userColumns, "users", "phone_verified", "INTEGER NOT NULL DEFAULT 0");
    await addColumnIfMissing(db, userColumns, "users", "email_verified", "INTEGER NOT NULL DEFAULT 0");
    await addColumnIfMissing(db, userColumns, "users", "created_at", "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP");
    await addColumnIfMissing(db, userColumns, "users", "updated_at", "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP");
    await addColumnIfMissing(db, userColumns, "users", "last_login_at", "TEXT");
    await addColumnIfMissing(db, userColumns, "users", "auth_provider", "TEXT NOT NULL DEFAULT 'local'");
    await addColumnIfMissing(db, userColumns, "users", "google_sub", "TEXT");

    const sessionColumns = await getTableColumns(db, "user_sessions");
    await addColumnIfMissing(db, sessionColumns, "user_sessions", "user_id", "INTEGER NOT NULL DEFAULT 0");
    await addColumnIfMissing(db, sessionColumns, "user_sessions", "created_at", "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP");
    await addColumnIfMissing(db, sessionColumns, "user_sessions", "last_activity_at", "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP");
    await addColumnIfMissing(db, sessionColumns, "user_sessions", "expires_at", "TEXT NOT NULL DEFAULT ''");

    // Los índices son auxiliares; nunca deben impedir que una cuenta se registre.
    try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)`).run(); } catch {}
    try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at)`).run(); } catch {}
    try { await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL`).run(); } catch {}
}

export function getCookie(request, name) {
    const cookies = request.headers.get("Cookie") || "";
    const prefix = `${name}=`;
    for (const item of cookies.split(";")) {
        const cookie = item.trim();
        if (cookie.startsWith(prefix)) return decodeURIComponent(cookie.slice(prefix.length));
    }
    return null;
}
export function buildSessionCookie(sessionId) { return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`; }
export function clearSessionCookie() { return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`; }
export async function createUserSession(db, userId) {
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString();
    await db.prepare(`INSERT INTO user_sessions (id, user_id, expires_at) VALUES (?, ?, ?)`).bind(sessionId, userId, expiresAt).run();
    return { sessionId, expiresAt };
}
export async function getUserFromSession(db, request, touch = true) {
    const sessionId = getCookie(request, SESSION_COOKIE);
    if (!sessionId) return null;
    const row = await db.prepare(`
        SELECT u.id, u.email, u.phone, u.auth_method, u.auth_provider, u.google_sub,
               u.display_name, u.avatar, u.phone_verified, u.email_verified,
               s.id AS session_id, s.expires_at, s.last_activity_at
        FROM user_sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = ? LIMIT 1
    `).bind(sessionId).first();
    if (!row) return null;
    const expiresAt = new Date(row.expires_at).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        await db.prepare(`DELETE FROM user_sessions WHERE id = ?`).bind(sessionId).run();
        return null;
    }
    if (touch) {
        const nextExpiry = new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString();
        await db.prepare(`UPDATE user_sessions SET last_activity_at = CURRENT_TIMESTAMP, expires_at = ? WHERE id = ?`).bind(nextExpiry, sessionId).run();
        row.expires_at = nextExpiry;
    }
    return row;
}
export { SESSION_COOKIE, SESSION_MAX_AGE };
