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
        return json({
            success: false,
            code: "DB_UNAVAILABLE",
            error: "La base de datos no está disponible."
        }, 500);
    }

    let body;
    try {
        body = await context.request.json();
    } catch (error) {
        console.error("REGISTER_JSON_ERROR:", error);
        return json({
            success: false,
            code: "INVALID_REQUEST",
            error: "La solicitud de registro no es válida."
        }, 400);
    }

    const displayName = String(body?.displayName || "").trim().slice(0, 60);
    const email = normalizeEmail(body?.identifier);
    const password = String(body?.password || "");
    const confirmPassword = String(body?.confirmPassword || "");

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

    // 1. Comprobar si el correo ya existe.
    try {
        const existingUser = await db.prepare(
            `SELECT id FROM users WHERE lower(email) = ? LIMIT 1`
        ).bind(email).first();

        if (existingUser) {
            return json({
                success: false,
                code: "EMAIL_ALREADY_REGISTERED",
                error: "Este correo ya está registrado."
            }, 409);
        }
    } catch (error) {
        console.error("REGISTER_EMAIL_CHECK_ERROR:", error);
        return json({
            success: false,
            code: "EMAIL_CHECK_FAILED",
            error: "No se pudo comprobar el correo en la base de datos."
        }, 500);
    }

    // 2. Generar la contraseña protegida.
    let passwordHash;
    try {
        passwordHash = await hashPassword(password);
    } catch (error) {
        console.error("REGISTER_PASSWORD_HASH_ERROR:", error);
        return json({
            success: false,
            code: "PASSWORD_HASH_FAILED",
            error: "No se pudo preparar la contraseña."
        }, 500);
    }

    // 3. Guardar el usuario. No ejecutamos migraciones aquí:
    //    la estructura de D1 ya fue comprobada y funciona correctamente.
    try {
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
    } catch (error) {
        console.error("REGISTER_INSERT_ERROR:", error);
        const message = String(error?.message || error || "");

        if (/unique|constraint/i.test(message)) {
            return json({
                success: false,
                code: "EMAIL_ALREADY_REGISTERED",
                error: "Este correo ya está registrado."
            }, 409);
        }

        return json({
            success: false,
            code: "USER_INSERT_FAILED",
            error: "No se pudo guardar la cuenta en la base de datos."
        }, 500);
    }

    // 4. Recuperar el usuario recién creado.
    let createdUser;
    try {
        createdUser = await db.prepare(`
            SELECT id, email, display_name, avatar
            FROM users
            WHERE lower(email) = ?
            LIMIT 1
        `).bind(email).first();
    } catch (error) {
        console.error("REGISTER_USER_LOOKUP_ERROR:", error);
        return json({
            success: false,
            code: "USER_LOOKUP_FAILED",
            error: "La cuenta se guardó, pero no pudo confirmarse."
        }, 500);
    }

    if (!createdUser?.id) {
        console.error("REGISTER_USER_NOT_FOUND_AFTER_INSERT");
        return json({
            success: false,
            code: "USER_NOT_FOUND_AFTER_INSERT",
            error: "La cuenta se guardó, pero no pudo confirmarse."
        }, 500);
    }

    // 5. Crear la sesión de usuario.
    try {
        const session = await createUserSession(db, createdUser.id);

        return json({
            success: true,
            user: {
                id: createdUser.id,
                email: createdUser.email,
                displayName: createdUser.display_name,
                avatar: createdUser.avatar,
                authMethod: "email",
                authProvider: "local"
            }
        }, 201, {
            "Set-Cookie": buildSessionCookie(session.sessionId)
        });
    } catch (error) {
        console.error("REGISTER_SESSION_ERROR:", error);

        // El usuario ya existe y no se elimina si la sesión falla.
        return json({
            success: true,
            sessionCreated: false,
            requiresLogin: true,
            user: {
                id: createdUser.id,
                email: createdUser.email,
                displayName: createdUser.display_name,
                avatar: createdUser.avatar,
                authMethod: "email",
                authProvider: "local"
            },
            message: "Cuenta creada correctamente. Inicia sesión para continuar."
        }, 201);
    }
}
