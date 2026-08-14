import { ensureUserSchema, normalizeEmail, validEmail, hashPassword, createUserSession, buildSessionCookie } from "../../lib/user-auth.js";

function json(data, status = 200, extraHeaders = {}) {
    return Response.json(data, { status, headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8", ...extraHeaders } });
}

export async function onRequestPost(context) {
    const db = context.env.DB;
    if (!db) return json({ success: false, error: "La base de datos no está disponible." }, 500);
    try {
        await ensureUserSchema(db);
        const body = await context.request.json();
        const email = normalizeEmail(body.identifier);
        const newPassword = String(body.newPassword || "");
        if (!validEmail(email)) return json({ success: false, error: "Introduce un correo electrónico válido." }, 400);
        if (newPassword.length < 8) return json({ success: false, error: "La nueva contraseña debe tener al menos 8 caracteres." }, 400);

        const row = await db.prepare(`SELECT id, auth_provider FROM users WHERE email = ? LIMIT 1`).bind(email).first();
        if (!row) return json({ success: false, found: false, error: "Usuario no encontrado o no registrado." }, 404);
        if (row.auth_provider === "google") return json({ success: false, found: true, code: "GOOGLE_ACCOUNT", error: "Esta cuenta utiliza Google. No tiene una contraseña propia. Inicia sesión con Google." }, 409);

        const passwordHash = await hashPassword(newPassword);
        await db.prepare(`UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(passwordHash, row.id).run();
        const session = await createUserSession(db, row.id);
        return json({ success: true, found: true, message: "Contraseña restablecida correctamente." }, 200, { "Set-Cookie": buildSessionCookie(session.sessionId) });
    } catch (error) {
        console.error("Error recuperando contraseña:", error);
        return json({ success: false, error: "No se pudo restablecer la contraseña." }, 500);
    }
}
