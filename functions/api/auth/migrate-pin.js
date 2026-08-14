import { ensureUserSchema, normalizeEmail, validEmail, verifyPassword, hashPassword, createUserSession, buildSessionCookie } from "../../lib/user-auth.js";

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
        const email = normalizeEmail(body?.identifier);
        const currentPassword = String(body?.currentPassword || "");
        const pin = String(body?.pin || "");
        const confirmPin = String(body?.confirmPin || "");

        if (!validEmail(email)) return json({ success: false, error: "Introduce un correo electrónico válido." }, 400);
        if (!currentPassword) return json({ success: false, error: "Introduce tu contraseña actual para confirmar la cuenta." }, 400);
        if (!/^\d{4}$/.test(pin)) return json({ success: false, error: "El PIN debe tener exactamente 4 números." }, 400);
        if (pin !== confirmPin) return json({ success: false, error: "Los PIN no son iguales." }, 400);

        const row = await db.prepare(`SELECT * FROM users WHERE lower(email) = ? LIMIT 1`).bind(email).first();
        if (!row) return json({ success: false, error: "No encontramos una cuenta con ese correo." }, 404);
        if (row.auth_provider === "google") return json({ success: false, code: "GOOGLE_ACCOUNT", error: "Esta cuenta utiliza Google." }, 409);
        if (Number(row.pin_enabled) === 1) return json({ success: false, code: "PIN_ALREADY_ENABLED", error: "Esta cuenta ya utiliza un PIN de 4 dígitos." }, 409);
        if (row.auth_method !== "email") return json({ success: false, code: "NOT_LEGACY_EMAIL", error: "Esta cuenta no requiere migración." }, 409);

        if (!(await verifyPassword(currentPassword, row.password_hash))) {
            return json({ success: false, error: "La contraseña actual no es correcta." }, 401);
        }

        const pinHash = await hashPassword(pin);
        await db.prepare(`
            UPDATE users
            SET password_hash = ?, pin_enabled = 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).bind(pinHash, row.id).run();

        const session = await createUserSession(db, row.id);
        return json({
            success: true,
            message: "PIN actualizado correctamente.",
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
        console.error("Error migrando cuenta a PIN:", error);
        return json({ success: false, error: "No se pudo actualizar la cuenta al nuevo sistema de PIN." }, 500);
    }
}
