import { ensureUserSchema, normalizeEmail, normalizePhone, validEmail, validPhone, verifyPassword, createUserSession, buildSessionCookie } from "../../lib/user-auth.js";

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

function normalizeIdentifier(value) {
    const raw = String(value || "").trim();
    if (raw.includes("@")) return { type: "email", value: normalizeEmail(raw) };
    return { type: "phone", value: normalizePhone(raw) };
}

export async function onRequestPost(context) {
    const db = context.env.DB;
    if (!db) return json({ success: false, error: "La base de datos no está disponible." }, 500);

    try {
        await ensureUserSchema(db);
        const body = await context.request.json();
        const { type, value } = normalizeIdentifier(body?.identifier);
        const hasPin = Object.prototype.hasOwnProperty.call(body || {}, "pin");

        if (type === "email" && !validEmail(value)) return json({ success: false, error: "Introduce un correo electrónico válido." }, 400);
        if (type === "phone" && !validPhone(value)) return json({ success: false, error: "Introduce un número de teléfono válido, incluyendo el código de país." }, 400);

        const row = type === "email"
            ? await db.prepare(`SELECT * FROM users WHERE lower(email) = ? LIMIT 1`).bind(value).first()
            : await db.prepare(`SELECT * FROM users WHERE phone = ? LIMIT 1`).bind(value).first();

        if (!row) return json({ success: false, error: "No encontramos una cuenta con ese correo o teléfono." }, 404);
        if (row.auth_provider === "google") return json({ success: false, code: "GOOGLE_ACCOUNT", error: "Esta cuenta utiliza Google. Inicia sesión con Google." }, 409);

        if (!hasPin) {
            return json({
                success: true,
                requiresPin: true,
                user: {
                    id: row.id,
                    email: row.email,
                    phone: row.phone,
                    displayName: row.display_name,
                    avatar: row.avatar,
                    profileCompleted: Boolean(row.profile_completed),
                    authMethod: row.auth_method,
                    authProvider: row.auth_provider || "local"
                }
            });
        }

        const pin = String(body.pin || "");
        if (!/^\d{4}$/.test(pin)) return json({ success: false, error: "El PIN debe tener 4 dígitos." }, 400);

        if (!(await verifyPassword(pin, row.password_hash))) {
            return json({ success: false, error: "PIN incorrecto." }, 401);
        }

        await db.prepare(`UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(row.id).run();
        const session = await createUserSession(db, row.id);
        return json({
            success: true,
            user: {
                id: row.id,
                email: row.email,
                phone: row.phone,
                displayName: row.display_name,
                avatar: row.avatar,
                profileCompleted: Boolean(row.profile_completed),
                authMethod: row.auth_method,
                authProvider: row.auth_provider || "local"
            }
        }, 200, { "Set-Cookie": buildSessionCookie(session.sessionId) });
    } catch (error) {
        console.error("Error al iniciar sesión:", error);
        return json({ success: false, error: "No se pudo iniciar sesión." }, 500);
    }
}
