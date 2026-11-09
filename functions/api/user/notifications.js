
import { authorize, json, readBody, userNotifications } from "../../lib/user-media.js";
export async function onRequestPost(context) {
  try {
    const auth = await authorize(context);
    if (auth.error) return auth.error;
    const body = await readBody(context.request);
    const requested = Array.isArray(body.keys) ? body.keys : [];
    if (!requested.length || requested.length > 100 || requested.some(k => typeof k !== "string" || k.length > 180)) {
      return json({ success: false, error: "Notificaciones no válidas." }, 400);
    }
    const validKeys = new Set((await userNotifications(auth.db, auth.userId)).map(item => item.key));
    const keys = [...new Set(requested)].filter(key => validKeys.has(key));
    for (const key of keys) {
      await auth.db.prepare("INSERT OR IGNORE INTO user_notification_reads(user_id,notification_key) VALUES (?,?)").bind(auth.userId,key).run();
    }
    return json({ success: true, readKeys: keys });
  } catch (error) {
    console.error("[user/notifications POST]", error);
    return json({ success: false, error: "No se pudieron marcar los avisos." }, 500);
  }
}
