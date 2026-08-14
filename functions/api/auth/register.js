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

export async function onRequestPost(context) {
    const db = context.env.DB;
    if (!db) {
        return json({ success: false, code: "DB_UNAVAILABLE", error: "La base de datos no está disponible." }, 500);
    }

    try {
        const body = await context.request.json();
        const displayName = String(body.displayName || "").trim().slice(0, 60);
        const email = normalizeEmail(body.identifier);
        const password = String(body.password || "");
        const confirmPassword = String(body.confirmPassword || "");

        if (displayName.length < 2) {
            return json({ success: false, code: "INVALID_NAME", error: "Escribe un nombre válido." }, 400);
        }
        if (!validEmail(email)) {
            return json({ success: false, code: "INVALID_EMAIL", error: "Escribe un correo electrónico válido." }, 400);
        }
        if (password.length < 8) {
            return json({ success: false, code: "PASSWORD_TOO_SHORT", error: "La contraseña debe tener al menos 8 caracteres." }, 400);
        }
        if (password !== confirmPassword) {
            return json({ success: false, code: "PASSWORD_MISMATCH", error: "Las contraseñas no son iguales." }, 400);
        }

        const existingUser = await db.prepare(
            `SELECT id FROM users WHERE lower(email) = ? LIMIT 1`
        ).bind(email).first();

        if (existingUser) {
            return json({ success: false, code: "EMAIL_ALREADY_REGISTERED", error: "Este correo ya está registrado." }, 409);
        }

        const passwordHash = await hashPassword(password);

        try {
            // Inserción simple compatible con la estructura D1 existente.
            // No dependemos de RETURNING ni de meta.last_row_id.
            await db.prepare(`
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
        } catch (insertError) {
            console.error("Error INSERT users:", insertError);
            const message = String(insertError?.message || insertError || "");
            if (/unique|constraint/i.test(message)) {
                return json({ success: false, code: "EMAIL_ALREADY_REGISTERED", error: "Este correo ya está registrado." }, 409);
            }
            return json({ success: false, code: "USER_INSERT_FAILED", error: "No se pudo guardar la cuenta en la base de datos." }, 500);
        }

        // Recuperamos el usuario por correo después del INSERT.
        // Esto evita depender de valores específicos del resultado de D1.
        const createdUser = await db.prepare(`
            SELECT id, email, display_name, avatar
            FROM users
            WHERE lower(email) = ?
            LIMIT 1
        `).bind(email).first();

        if (!createdUser?.id) {
            console.error("El usuario se insertó, pero no pudo recuperarse desde D1.");
            return json({ success: false, code: "USER_NOT_FOUND_AFTER_INSERT", error: "La cuenta se guardó pero no pudo confirmarse." }, 500);
        }

        try {
            const session = await createUserSession(db, createdUser.id);
            return json(
                {
                    success: true,
                    user: {
                        id: createdUser.id,
                        displayName: createdUser.display_name,
                        avatar: createdUser.avatar,
                        authMethod: "email",
                        authProvider: "local"
                    }
                },
                201,
                { "Set-Cookie": buildSessionCookie(session.sessionId) }
            );
        } catch (sessionError) {
            console.error("Error creando sesión después del registro:", sessionError);
            // La cuenta ya fue creada correctamente. No la eliminamos.
            return json({
                success: true,
                sessionCreated: false,
                user: {
                    id: createdUser.id,
                    displayName: createdUser.display_name,
                    avatar: createdUser.avatar,
                    authMethod: "email",
                    authProvider: "local"
                },
                message: "Cuenta creada correctamente. Inicia sesión para continuar."
            }, 201);
        }
    } catch (error) {
        console.error("Error general al registrar usuario:", error);
        return json({ success: false, code: "REGISTER_UNEXPECTED_ERROR", error: "No se pudo completar el registro." }, 500);
    }
}
