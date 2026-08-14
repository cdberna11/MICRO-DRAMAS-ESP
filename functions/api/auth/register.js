import { hashPassword, normalizeEmail, validEmail, createUserSession, buildSessionCookie } from "../../lib/user-auth.js";

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

function validPassword(password) {
    return password.length >= 8
        && /[A-Z]/.test(password)
        && /[a-z]/.test(password)
        && /\d/.test(password)
        && /[^A-Za-z0-9]/.test(password);
}

export async function onRequestPost(context) {
    const db = context.env.DB;
    if (!db) {
        return json({ success: false, error: "La base de datos no está disponible." }, 500);
    }

    try {
        // La estructura real de D1 ya fue verificada. No ejecutamos migraciones
        // automáticas durante cada registro para evitar que una migración antigua
        // bloquee una operación válida.
        const body = await context.request.json();
        const displayName = String(body.displayName || "").trim().slice(0, 60);
        const email = normalizeEmail(body.identifier);
        const password = String(body.password || "");

        if (displayName.length < 2) {
            return json({ success: false, error: "Escribe un nombre válido." }, 400);
        }
        if (!validEmail(email)) {
            return json({ success: false, error: "Escribe un correo electrónico válido." }, 400);
        }
        if (!validPassword(password)) {
            return json({
                success: false,
                error: "La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula, un número y un carácter especial."
            }, 400);
        }

        const duplicate = await db.prepare(
            `SELECT id FROM users WHERE email = ? LIMIT 1`
        ).bind(email).first();

        if (duplicate) {
            return json({
                success: false,
                code: "EMAIL_ALREADY_REGISTERED",
                error: "Este correo ya está registrado."
            }, 409);
        }

        const passwordHash = await hashPassword(password);
        let userId;

        try {
            const result = await db.prepare(`
                INSERT INTO users (
                    email,
                    phone,
                    password_hash,
                    auth_method,
                    display_name,
                    avatar,
                    phone_verified,
                    email_verified
                ) VALUES (?, NULL, ?, 'email', ?, 'avatar-1.png', 0, 0)
            `).bind(email, passwordHash, displayName).run();

            userId = result.meta?.last_row_id;
            if (!userId) {
                throw new Error("D1 no devolvió el ID del usuario creado.");
            }
        } catch (insertError) {
            console.error("Error INSERT users:", insertError);
            const message = String(insertError?.message || insertError || "");
            if (/unique|constraint/i.test(message)) {
                return json({
                    success: false,
                    code: "EMAIL_ALREADY_REGISTERED",
                    error: "Este correo ya está registrado."
                }, 409);
            }
            return json({
                success: false,
                error: "No se pudo guardar la cuenta en la base de datos."
            }, 500);
        }

        try {
            const session = await createUserSession(db, userId);
            return json(
                {
                    success: true,
                    user: {
                        id: userId,
                        displayName,
                        avatar: "avatar-1.png",
                        authMethod: "email",
                        authProvider: "local"
                    }
                },
                201,
                { "Set-Cookie": buildSessionCookie(session.sessionId) }
            );
        } catch (sessionError) {
            console.error("Error creando sesión después del registro:", sessionError);
            // Evita dejar una cuenta creada pero sin sesión si la sesión no pudo crearse.
            try {
                await db.prepare(`DELETE FROM users WHERE id = ?`).bind(userId).run();
            } catch (cleanupError) {
                console.error("Error limpiando usuario tras fallo de sesión:", cleanupError);
            }
            return json({
                success: false,
                error: "La cuenta no pudo iniciar sesión después del registro. Inténtalo nuevamente."
            }, 500);
        }
    } catch (error) {
        console.error("Error general al registrar usuario:", error);
        return json({ success: false, error: "No se pudo completar el registro." }, 500);
    }
}
