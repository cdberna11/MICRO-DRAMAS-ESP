import { getSessionUser } from "./_session.js";

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "PUT" && request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Método no permitido." }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const user = await getSessionUser(request, env);
    if (!user) {
      return new Response(JSON.stringify({ ok: false, error: "Sesión no válida." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const body = await request.json();
    const displayName = String(body?.display_name ?? body?.name ?? "").trim();
    const avatar = String(body?.avatar ?? "").trim();

    if (!displayName) {
      return new Response(JSON.stringify({ ok: false, error: "El nombre es obligatorio." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (!/^avatar-[1-8]\.png$/.test(avatar)) {
      return new Response(JSON.stringify({ ok: false, error: "Avatar no válido." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    await env.DB.prepare(`
      UPDATE users
      SET display_name = ?, avatar = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(displayName, avatar, user.id).run();

    const updated = await env.DB.prepare(`
      SELECT id, email, phone, display_name, avatar, auth_method, auth_provider
      FROM users
      WHERE id = ?
      LIMIT 1
    `).bind(user.id).first();

    return new Response(JSON.stringify({ ok: true, user: updated }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("PROFILE_UPDATE_ERROR", error);
    return new Response(JSON.stringify({ ok: false, error: "No se pudo guardar el perfil." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
