
import { authorize, json, sha256, userNotifications } from "../../lib/user-media.js";
export async function onRequestGet(context) {
  try {
    const auth = await authorize(context);
    if (auth.error) return auth.error;
    const { db, userId } = auth;
    const [watchlist, progress, notifications] = await Promise.all([
      db.prepare("SELECT l.drama_id FROM user_watchlist l JOIN dramas d ON d.id = l.drama_id WHERE l.user_id = ? AND d.status IN ('published', 'draft') ORDER BY l.created_at DESC").bind(userId).all(),
      db.prepare(`SELECT p.drama_id, p.position_ms, p.duration_ms, p.completed, p.updated_at,
        p.source_sha, d.video_url
        FROM user_playback_progress p
        JOIN dramas d ON d.id = p.drama_id
        WHERE p.user_id = ? AND d.status = 'published'
        ORDER BY p.updated_at DESC LIMIT 250`).bind(userId).all(),
      userNotifications(db, userId)
    ]);
    const progressItems = (await Promise.all((progress.results || []).map(async row => {
      if (!row.video_url || await sha256(row.video_url) !== row.source_sha) return null;
      return {
        dramaId: Number(row.drama_id),
        positionMs: Number(row.position_ms) || 0,
        durationMs: Number(row.duration_ms) || 0,
        completed: Boolean(row.completed),
        updatedAt: row.updated_at
      };
    }))).filter(Boolean);
    return json({
      success: true, userId,
      watchlist: (watchlist.results || []).map(x => Number(x.drama_id)),
      progress: progressItems, notifications,
      unreadCount: notifications.filter(x => !x.read).length
    });
  } catch (error) {
    console.error("[user/state]", error);
    return json({ success: false, error: "No fue posible cargar tu perfil." }, 500);
  }
}
