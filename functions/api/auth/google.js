import { ensureUserSchema, createUserSession, buildSessionCookie } from "../../lib/user-auth.js";
import { getGoogleCsrfCookie, verifyGoogleIdToken } from "../../lib/google-auth.js";

function json(data, status = 200, extraHeaders = {}) {
    return Response.json(data, { status, headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8", ...extraHeaders } });
}

export async function onRequestPost(context) {
    const db = context.env.DB;
    if (!db) return json({ success: false, error: "La base de datos no está disponible." }, 500);
    try {
        await ensureUserSchema(db);
        const form = await context.request.formData();
        const credential = String(form.get("credential") || "");
        const csrfBody = String(form.get("g_csrf_token") || "");
        const csrfCookie = getGoogleCsrfCookie(context.request);
        if (!credential || !csrfBody || !csrfCookie || csrfBody !== csrfCookie) return json({ success: false, error: "No se pudo validar la solicitud de Google." }, 403);

        const clientId = String(context.env.GOOGLE_CLIENT_ID || "").trim();
        if (!clientId) return json({ success: false, error: "Google todavía no está configurado." }, 503);

        const payload = await verifyGoogleIdToken(credential, clientId);
        const googleSub = String(payload.sub);
        const email = String(payload.email).trim().toLowerCase();
        const name = String(payload.name || email.split("@")[0] || "Usuario").trim().slice(0, 60) || "Usuario";

        let user = await db.prepare(`SELECT * FROM users WHERE google_sub = ? LIMIT 1`).bind(googleSub).first();
        if (!user) {
            const existingEmail = await db.prepare(`SELECT id, auth_provider FROM users WHERE email = ? LIMIT 1`).bind(email).first();
            if (existingEmail) return json({ success: false, code: "EMAIL_ALREADY_REGISTERED", error: "Ya existe una cuenta con ese correo. Inicia sesión con su método original." }, 409);
            const result = await db.prepare(`
                INSERT INTO users (email, phone, password_hash, auth_method, auth_provider, google_sub, display_name, avatar, phone_verified, email_verified)
                VALUES (?, NULL, 'GOOGLE_ONLY', 'email', 'google', ?, ?, 'avatar-1.png', 0, 1)
            `).bind(email, googleSub, name).run();
            const userId = result.meta?.last_row_id;
            if (!userId) return json({ success: false, error: "No se pudo crear la cuenta de Google." }, 500);
            user = { id: userId };
        } else {
            await db.prepare(`UPDATE users SET email = ?, display_name = ?, email_verified = 1, last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(email, name, user.id).run();
        }

        await db.prepare(`UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(user.id).run();
        const session = await createUserSession(db, user.id);
        return json({ success: true, authProvider: "google" }, 200, { "Set-Cookie": buildSessionCookie(session.sessionId) });
    } catch (error) {
        console.error("Error con Google Sign-In:", error);
        return json({ success: false, error: "No se pudo validar la cuenta de Google." }, 401);
    }
}
