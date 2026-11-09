
import { getUserFromSession } from "./user-auth.js";

export function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
export async function authorize(context) {
  const db = context.env.DB;
  if (!db) return { error: json({ success: false, error: "Base de datos D1 no disponible." }, 503) };
  const user = await getUserFromSession(db, context.request);
  if (!user || !Number.isSafeInteger(Number(user.id))) {
    return { error: json({ success: false, error: "Inicia sesión para acceder a tu perfil." }, 401) };
  }
  await ensureMediaSchema(db);
  return { db, userId: Number(user.id) };
}

// Migración idempotente en D1. La primera solicitud autenticada crea las tablas
// para usuarios existentes y futuros, sin cambiar las tablas de reproducción.
export async function ensureMediaSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS user_watchlist (
    user_id INTEGER NOT NULL,
    drama_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id, drama_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS user_playback_progress (
    user_id INTEGER NOT NULL,
    drama_id INTEGER NOT NULL,
    source_sha TEXT NOT NULL,
    position_ms INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    completed INTEGER NOT NULL DEFAULT 0,
    event_ms INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id, drama_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS user_notification_reads (
    user_id INTEGER NOT NULL,
    notification_key TEXT NOT NULL,
    read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id, notification_key),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_user_watchlist_user ON user_watchlist(user_id, created_at DESC)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_user_progress_user ON user_playback_progress(user_id, updated_at DESC)").run();
}

export async function sha256(input) {
  const bytes = new TextEncoder().encode(String(input || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
}

export function positiveDramaId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function readBody(request) {
  try { return await request.json(); } catch { return {}; }
}

function parseTime(raw) {
  if (!raw) return null;
  const text = String(raw).trim().replace(" ", "T");
  const parsed = new Date(/[zZ]$|[+-]\d\d:\d\d$/.test(text) ? text : text + "Z");
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
export async function userNotifications(db, userId) {
  const latest = await db.prepare(`
    SELECT id, title, cover_url, status, created_at, published_at
    FROM dramas WHERE
      (status = 'published' AND datetime(published_at) >= datetime('now','-7 days'))
      OR (status = 'draft' AND datetime(created_at) >= datetime('now','-30 days'))
    ORDER BY COALESCE(published_at, created_at) DESC LIMIT 80
  `).all();
  const reads = await db.prepare(
    "SELECT notification_key FROM user_notification_reads WHERE user_id = ?"
  ).bind(userId).all();
  const readKeys = new Set((reads.results || []).map(row => row.notification_key));
  const now = Date.now();
  return (latest.results || []).map(row => {
    const premiere = row.status === "published";
    const date = parseTime(premiere ? row.published_at : row.created_at);
    if (!date || date.getTime() > now) return null;
    const ageMs = now - date.getTime();
    if (ageMs > (premiere ? 7 : 30) * 86400000) return null;
    const key = (premiere ? "premiere:" : "upcoming:") + row.id + ":" + date.getTime();
    return {
      key, dramaId: Number(row.id), title: String(row.title || "Microdrama"),
      coverUrl: String(row.cover_url || ""), type: premiere ? "premiere" : "upcoming",
      createdAt: date.toISOString(), read: readKeys.has(key)
    };
  }).filter(Boolean).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
}
