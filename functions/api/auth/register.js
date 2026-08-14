import {
    ensureUserSchema,
    hashPassword,
    normalizeEmail,
    normalizePhone,
    validEmail,
    validPhone,
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
        const method = body.method === "phone" ? "phone" : "email";
        const displayName = String(body.displayName || "").trim().slice(0, 60);
        const password = String(body.password || "");

        if (displayName.length < 2) return json({ success: false, error: "Escribe un nombre válido." }, 400);
        if (password.length < 8) return json({ success: false, error: "La contraseña debe tener al menos 8 caracteres." }, 400);

        let email = null;
        let phone = null;
        let phoneVerified = 0;
        let emailVerified = 0;

        if (method === "email") {
            email = normalizeEmail(body.identifier);
            if (!validEmail(email)) return json({ success: false, error: "Escribe un correo electrónico válido." }, 400);
            emailVerified = 0;
        } else {
            phone = normalizePhone(body.identifier);
            if (!validPhone(phone)) return json({ success: false, error: "Escribe un número de WhatsApp válido con código de país." }, 400);
            return json({
                success: false,
                code: "WHATSAPP_NOT_CONFIGURED",
                error: "El registro por WhatsApp se habilitará cuando configuremos Meta WhatsApp Cloud API."
            }, 503);
        }

        const duplicate = method === "email"
            ? await db.prepare(`SELECT id FROM users WHERE email = ? LIMIT 1`).bind(email).first()
            : await db.prepare(`SELECT id FROM users WHERE phone = ? LIMIT 1`).bind(phone).first();

        if (duplicate) return json({ success: false, error: "Ya existe una cuenta con esos datos." }, 409);

        const passwordHash = await hashPassword(password);
        const result = await db.prepare(`
            INSERT INTO users (email, phone, password_hash, auth_method, display_name, avatar, phone_verified, email_verified)
            VALUES (?, ?, ?, ?, ?, 'avatar-1.png', ?, ?)
        `).bind(email, phone, passwordHash, method, displayName, phoneVerified, emailVerified).run();

        const userId = result.meta?.last_row_id;
        if (!userId) return json({ success: false, error: "No se pudo crear la cuenta." }, 500);

        const session = await createUserSession(db, userId);

        return json(
            {
                success: true,
                user: {
                    id: userId,
                    displayName,
                    avatar: "avatar-1.png",
                    authMethod: method
                }
            },
            201,
            { "Set-Cookie": buildSessionCookie(session.sessionId) }
        );
    } catch (error) {
        console.error("Error al registrar usuario:", error);
        return json({ success: false, error: "No se pudo completar el registro." }, 500);
    }
}
