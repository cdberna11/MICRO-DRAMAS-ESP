import {
    ensureUserSchema,
    normalizeEmail,
    normalizePhone,
    validEmail,
    validPhone,
    verifyPassword,
    createUserSession,
    buildSessionCookie
} from "../../lib/user-auth.js";

function json(data, status = 200, extraHeaders = {}) {
    return Response.json(data, {
        status,
        headers: {
            "Cache-Control": "no-store",
            "Content-Type": "application/json; charset=utf-8",
            ...extraHeaders
        }
    });
}

export async function onRequestPost(context) {
    const db = context.env.DB;
    if (!db) return json({ success: false, error: "La base de datos no está disponible." }, 500);

    try {
        await ensureUserSchema(db);
        const body = await context.request.json();
        const identifierRaw = String(body.identifier || "").trim();
        const password = String(body.password || "");

        if (!identifierRaw || !password) return json({ success: false, error: "Completa usuario y contraseña." }, 400);

        const email = normalizeEmail(identifierRaw);
        const phone = normalizePhone(identifierRaw);
        const row = validEmail(email)
            ? await db.prepare(`SELECT * FROM users WHERE email = ? LIMIT 1`).bind(email).first()
            : validPhone(phone)
                ? await db.prepare(`SELECT * FROM users WHERE phone = ? LIMIT 1`).bind(phone).first()
                : null;

        if (!row || !(await verifyPassword(password, row.password_hash))) {
            return json({ success: false, error: "Correo, teléfono o contraseña incorrectos." }, 401);
        }

        await db.prepare(`UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(row.id).run();
        const session = await createUserSession(db, row.id);

        return json(
            {
                success: true,
                user: {
                    id: row.id,
                    displayName: row.display_name,
                    avatar: row.avatar,
                    authMethod: row.auth_method
                }
            },
            200,
            { "Set-Cookie": buildSessionCookie(session.sessionId) }
        );
    } catch (error) {
        console.error("Error al iniciar sesión:", error);
        return json({ success: false, error: "No se pudo iniciar sesión." }, 500);
    }
}
