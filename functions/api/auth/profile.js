import { getSessionUser } from "./session.js";

export async function onRequest(context) {
  const { request, env } = context;
  const json = (data, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });

  if (request.method !== "PUT" && request.method !== "POST") return json({ ok: false, error: "Método no permitido." }, 405);

  try {
    const cookie = request.headers.get("Cookie") || "";
    const match = cookie.match(/(?:^|;\s*)session_id=([^;]+)/);
    if (!match) return json({ ok: false, error: "Sesión no válida." }, 401);

    const sessionId = decodeURIComponent(match[1]);
    const current = await env.DB.prepare(`
      SELECT u.id, u.email, u.phone, u.display_name, u.avatar, u.auth_method, u.auth_provider
      FROM user_sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > CURRENT_TIMESTAMP LIMIT 1
    `).bind(sessionId).first();
    if (!current) return json({ ok: false, error: "Sesión no válida." }, 401);

    const body = await request.json();
    const displayName = String(body?.display_name ?? body?.name ?? "").trim();
    const avatar = String(body?.avatar ?? "").trim();
    if (!displayName) return json({ ok: false, error: "El nombre es obligatorio." }, 400);
    if (!/^avatar-[1-8]\.png$/.test(avatar)) return json({ ok: false, error: "Avatar no válido." }, 400);

    await env.DB.prepare(`UPDATE users SET display_name = ?, avatar = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(displayName, avatar, current.id).run();

    const updated = await env.DB.prepare(`SELECT id, email, phone, display_name, avatar, auth_method, auth_provider FROM users WHERE id = ? LIMIT 1`)
      .bind(current.id).first();
    return json({ ok: true, user: updated });
  } catch (error) {
    console.error("PROFILE_UPDATE_ERROR", error);
    return json({ ok: false, error: "No se pudo guardar el perfil." }, 500);
  }
}
