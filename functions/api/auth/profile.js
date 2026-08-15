import { ensureUserSchema, getUserFromSession } from "../../lib/user-auth.js";

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;

  if (!db) {
    return json({ ok: false, error: "La base de datos no está disponible." }, 500);
  }

  if (request.method !== "PUT" && request.method !== "POST" && request.method !== "PATCH") {
    return json({ ok: false, error: "Método no permitido." }, 405);
  }

  try {
    // Usar exactamente el mismo sistema de sesión que emplean
    // registro, login y /api/auth/me.
    await ensureUserSchema(db);
    const current = await getUserFromSession(db, request);

    if (!current) {
      return json({ ok: false, error: "Sesión no válida." }, 401);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "Datos de perfil no válidos." }, 400);
    }

    const displayName = String(
      body?.display_name ?? body?.displayName ?? body?.name ?? current.display_name ?? ""
    ).trim().slice(0, 60);

    const avatar = String(body?.avatar ?? "").trim();

    const allowedAvatars = new Set([
      "avatar-1.png",
      "avatar-2.png",
      "avatar-3.png",
      "avatar-4.png",
      "avatar-5.png",
      "avatar-6.png",
      "avatar-7.png",
      "avatar-8.png"
    ]);

    if (displayName.length < 2) {
      return json({ ok: false, error: "El nombre debe tener al menos 2 caracteres." }, 400);
    }

    if (!allowedAvatars.has(avatar)) {
      return json({ ok: false, error: "Avatar no válido." }, 400);
    }

    await db.prepare(`
      UPDATE users
      SET display_name = ?,
          avatar = ?,
          profile_completed = 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(displayName, avatar, current.id).run();

    const updated = await db.prepare(`
      SELECT id, email, phone, display_name, avatar,
             auth_method, auth_provider, profile_completed,
             email_verified, phone_verified
      FROM users
      WHERE id = ?
      LIMIT 1
    `).bind(current.id).first();

    if (!updated) {
      return json({ ok: false, error: "No se pudo confirmar la actualización del perfil." }, 500);
    }

    return json({
      ok: true,
      success: true,
      user: {
        id: updated.id,
        email: updated.email,
        phone: updated.phone,
        displayName: updated.display_name,
        avatar: updated.avatar,
        profileCompleted: Boolean(updated.profile_completed),
        authMethod: updated.auth_method,
        authProvider: updated.auth_provider || "local",
        emailVerified: Boolean(updated.email_verified),
        phoneVerified: Boolean(updated.phone_verified)
      }
    });
  } catch (error) {
    console.error("PROFILE_UPDATE_ERROR:", error);
    return json({
      ok: false,
      success: false,
      error: "No se pudo guardar el perfil."
    }, 500);
  }
}
