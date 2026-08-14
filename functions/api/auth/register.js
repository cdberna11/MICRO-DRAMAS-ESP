import { ensureUserSchema, hashPassword, normalizeEmail, validEmail, createUserSession, buildSessionCookie } from "../../lib/user-auth.js";

function json(data, status = 200, extraHeaders = {}) {
    return Response.json(data, { status, headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8", ...extraHeaders } });
}

export async function onRequestPost(context) {
    const db = context.env.DB;
    if (!db) return json({ success: false, error: "La base de datos no está disponible." }, 500);
    try {
        await ensureUserSchema(db);
        const body = await context.request.json();
        const displayName = String(body.displayName || "").trim().slice(0, 60);
        const email = normalizeEmail(body.identifier);
        const password = String(body.password || "");
        if (displayName.length < 2) return json({ success: false, error: "Escribe un nombre válido." }, 400);
        if (!validEmail(email)) return json({ success: false, error: "Escribe un correo electrónico válido." }, 400);
        if (password.length < 8) return json({ success: false, error: "La contraseña debe tener al menos 8 caracteres." }, 400);

        const duplicate = await db.prepare(`SELECT id FROM users WHERE email = ? LIMIT 1`).bind(email).first();
        if (duplicate) return json({ success: false, error: "Ya existe una cuenta con ese correo." }, 409);

        const passwordHash = await hashPassword(password);
        const result = await db.prepare(`
            INSERT INTO users (email, phone, password_hash, auth_method, auth_provider, display_name, avatar, phone_verified, email_verified)
            VALUES (?, NULL, ?, 'email', 'local', ?, 'avatar-1.png', 0, 0)
        `).bind(email, passwordHash, displayName).run();
        const userId = result.meta?.last_row_id;
        if (!userId) return json({ success: false, error: "No se pudo crear la cuenta." }, 500);

        const session = await createUserSession(db, userId);
        return json({ success: true, user: { id: userId, displayName, avatar: "avatar-1.png", authMethod: "email", authProvider: "local" } }, 201, { "Set-Cookie": buildSessionCookie(session.sessionId) });
    } catch (error) {
        console.error("Error al registrar usuario:", error);
        return json({ success: false, error: "No se pudo completar el registro." }, 500);
    }
}
