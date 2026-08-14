import {
    ensureUserSchema,
    normalizeEmail,
    normalizePhone,
    validEmail,
    validPhone,
    hashPassword,
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
        const identifier = String(body.identifier || "").trim();
        const newPassword = String(body.newPassword || "");

        if (!identifier) return json({ success: false, error: "Introduce tu correo o número de teléfono." }, 400);
        if (newPassword.length < 8) return json({ success: false, error: "La nueva contraseña debe tener al menos 8 caracteres." }, 400);

        const email = normalizeEmail(identifier);
        const phone = normalizePhone(identifier);
        const row = validEmail(email)
            ? await db.prepare(`SELECT id, auth_method FROM users WHERE email = ? LIMIT 1`).bind(email).first()
            : validPhone(phone)
                ? await db.prepare(`SELECT id, auth_method FROM users WHERE phone = ? LIMIT 1`).bind(phone).first()
                : null;

        if (!row) {
            return json({ success: false, found: false, error: "Usuario no encontrado o no registrado." }, 404);
        }

        if (row.auth_method === "phone") {
            return json({
                success: false,
                found: true,
                code: "WHATSAPP_VERIFICATION_REQUIRED",
                error: "Usuario encontrado. La recuperación por teléfono requiere el PIN de WhatsApp y se habilitará con Meta WhatsApp Cloud API."
            }, 409);
        }

        const passwordHash = await hashPassword(newPassword);
        await db.prepare(`UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(passwordHash, row.id).run();

        const session = await createUserSession(db, row.id);
        return json(
            { success: true, found: true, message: "Contraseña restablecida correctamente." },
            200,
            { "Set-Cookie": buildSessionCookie(session.sessionId) }
        );
    } catch (error) {
        console.error("Error recuperando contraseña:", error);
        return json({ success: false, error: "No se pudo restablecer la contraseña." }, 500);
    }
}
