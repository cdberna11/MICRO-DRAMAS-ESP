
import { authorize, json, positiveDramaId, readBody, sha256 } from "../../lib/user-media.js";
export async function onRequestPut(context) {
  try {
    const auth = await authorize(context);
    if (auth.error) return auth.error;
    const body = await readBody(context.request);
    const id = positiveDramaId(body.dramaId);
    const position = Math.round(Number(body.positionMs));
    const duration = Math.round(Number(body.durationMs));
    const eventMs = Math.round(Number(body.eventMs));
    if (!id || !Number.isSafeInteger(position) || !Number.isSafeInteger(duration) ||
        duration <= 0 || duration > 24 * 60 * 60 * 1000 || position < 0 || position > duration + 1000 ||
        !Number.isSafeInteger(eventMs) || eventMs <= 0) {
      return json({ success: false, error: "Progreso no válido." }, 400);
    }
    const drama = await auth.db.prepare("SELECT video_url FROM dramas WHERE id = ? AND status = 'published' LIMIT 1").bind(id).first();
    if (!drama?.video_url) return json({ success: false, error: "Reproducción no disponible." }, 404);
    const fingerprint = await sha256(drama.video_url);
    const ended = body.completed === true || position >= duration - Math.min(6000, duration * .015);
    await auth.db.prepare(`
      INSERT INTO user_playback_progress
        (user_id,drama_id,source_sha,position_ms,duration_ms,completed,event_ms,updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id,drama_id) DO UPDATE SET
        source_sha=excluded.source_sha, position_ms=excluded.position_ms,
        duration_ms=excluded.duration_ms, completed=excluded.completed,
        event_ms=excluded.event_ms, updated_at=CURRENT_TIMESTAMP
      WHERE excluded.event_ms >= user_playback_progress.event_ms
        OR excluded.source_sha <> user_playback_progress.source_sha
    `).bind(auth.userId, id, fingerprint, Math.min(position,duration), duration, ended ? 1 : 0, eventMs).run();
    return json({ success: true, dramaId: id, completed: ended });
  } catch (error) {
    console.error("[user/progress PUT]", error);
    return json({ success: false, error: "No se pudo guardar el progreso." }, 500);
  }
}
