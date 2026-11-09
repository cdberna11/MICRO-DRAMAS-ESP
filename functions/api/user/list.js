
import { authorize, json, positiveDramaId, readBody } from "../../lib/user-media.js";
export async function onRequestPost(context) {
  try {
    const auth = await authorize(context);
    if (auth.error) return auth.error;
    const body = await readBody(context.request);
    const id = positiveDramaId(body.dramaId);
    if (!id) return json({ success: false, error: "Microdrama no válido." }, 400);
    const drama = await auth.db.prepare("SELECT id FROM dramas WHERE id = ? AND status IN ('published','draft') LIMIT 1").bind(id).first();
    if (!drama) return json({ success: false, error: "Microdrama no disponible." }, 404);
    await auth.db.prepare("INSERT OR IGNORE INTO user_watchlist (user_id, drama_id) VALUES (?, ?)").bind(auth.userId, id).run();
    return json({ success: true, dramaId: id, saved: true });
  } catch (error) {
    console.error("[user/list POST]", error);
    return json({ success: false, error: "No se pudo guardar en Mi lista." }, 500);
  }
}
export async function onRequestDelete(context) {
  try {
    const auth = await authorize(context);
    if (auth.error) return auth.error;
    const body = await readBody(context.request);
    const id = positiveDramaId(body.dramaId);
    if (!id) return json({ success: false, error: "Microdrama no válido." }, 400);
    await auth.db.prepare("DELETE FROM user_watchlist WHERE user_id = ? AND drama_id = ?").bind(auth.userId, id).run();
    return json({ success: true, dramaId: id, saved: false });
  } catch (error) {
    console.error("[user/list DELETE]", error);
    return json({ success: false, error: "No se pudo quitar de Mi lista." }, 500);
  }
}
