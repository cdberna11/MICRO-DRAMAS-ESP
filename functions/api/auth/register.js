import { ensureUserSchema, normalizeEmail, normalizePhone, validEmail, validPhone, hashPassword, createUserSession, buildSessionCookie } from "../../lib/user-auth.js";

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
    if (!db) return json({ success: false, code: "DB_UNAVAILABLE", error: "La base de datos no está disponible." }, 500);

    let body;
    try {
        await ensureUserSchema(db);
        body = await context.request.json();
    } catch (error) {
        console.error("REGISTER_INIT_ERROR:", error);
        return json({ success: false, code: "INVALID_REQUEST", error: "La solicitud de registro no es válida." }, 400);
    }

    const displayName = String(body?.displayName || "").trim().slice(0, 60);
    const authMethod = body?.authMethod === "phone" ? "phone" : "email";
    const identifier = authMethod === "phone"
        ? normalizePhone(body?.identifier)
        : normalizeEmail(body?.identifier);
    const email = authMethod === "email" ? identifier : null;
    const pin = String(body?.pin || "");
    const confirmPin = String(body?.confirmPin || "");

    if (displayName.length < 2) {
        return json({ success: false, code: "INVALID_NAME", error: "Escribe un nombre válido." }, 400);
    }

    if (authMethod === "email" && !validEmail(identifier)) {
        return json({ success: false, code: "INVALID_EMAIL", error: "Introduce un correo electrónico válido." }, 400);
    }

    if (authMethod === "phone" && !validPhone(identifier)) {
        return json({ success: false, code: "INVALID_PHONE", error: "Introduce un número de teléfono válido, incluyendo el código de país." }, 400);
    }

    if (!/^\d{4}$/.test(pin)) {
        return json({ success: false, code: "INVALID_PIN", error: "El PIN debe tener exactamente 4 números." }, 400);
    }

    if (pin !== confirmPin) {
        return json({ success: false, code: "PIN_MISMATCH", error: "Los PIN no son iguales." }, 400);
    }

    try {
        if (authMethod === "email") {
            const existingEmail = await db.prepare(`
                SELECT id FROM users WHERE lower(email) = ? LIMIT 1
            `).bind(identifier).first();

            if (existingEmail) {
                return json({
                    success: false,
                    code: "EMAIL_ALREADY_REGISTERED",
                    error: "Este correo ya está registrado."
                }, 409);
            }
        } else {
            const existingPhone = await db.prepare(`
                SELECT id FROM users WHERE phone = ? LIMIT 1
            `).bind(identifier).first();

            if (existingPhone) {
                return json({
                    success: false,
                    code: "PHONE_ALREADY_REGISTERED",
                    error: "Este número de teléfono ya está registrado."
                }, 409);
            }
        }
    } catch (error) {
        console.error("REGISTER_IDENTIFIER_CHECK_ERROR:", error);
        return json({
            success: false,
            code: "IDENTIFIER_CHECK_FAILED",
            error: "No se pudo comprobar la cuenta en la base de datos."
        }, 500);
    }

    let pinHash;
    try {
        pinHash = await hashPassword(pin);
    } catch (error) {
        console.error("REGISTER_PIN_HASH_ERROR:", error);
        return json({
            success: false,
            code: "PIN_HASH_FAILED",
            error: "No se pudo preparar el PIN."
        }, 500);
    }

    let createdUserId;
    try {
        const result = await db.prepare(`
            INSERT INTO users (
                email, phone, password_hash, auth_method, display_name, avatar,
                profile_completed, phone_verified, email_verified, auth_provider, pin_enabled
            ) VALUES (?, ?, ?, ?, ?, 'avatar-1.png', 0, 0, 0, 'local', 1)
        `).bind(
            email,
            authMethod === "phone" ? identifier : null,
            pinHash,
            authMethod,
            displayName
        ).run();

        createdUserId = result?.meta?.last_row_id ?? result?.lastRowId ?? null;
    } catch (error) {
        console.error("REGISTER_INSERT_ERROR:", error);
        const message = String(error?.message || error || "");
        if (/unique|constraint/i.test(message)) {
            if (/phone/i.test(message)) {
                return json({
                    success: false,
                    code: "PHONE_ALREADY_REGISTERED",
                    error: "Este número de teléfono ya está registrado."
                }, 409);
            }
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

    let createdUser;
    try {
        if (createdUserId) {
            createdUser = await db.prepare(`
                SELECT id, email, phone, display_name, avatar, profile_completed, auth_method
                FROM users
                WHERE id = ? LIMIT 1
            `).bind(createdUserId).first();
        }

        if (!createdUser) {
            createdUser = authMethod === "phone"
                ? await db.prepare(`
                    SELECT id, email, phone, display_name, avatar, profile_completed, auth_method
                    FROM users WHERE phone = ? LIMIT 1
                `).bind(identifier).first()
                : await db.prepare(`
                    SELECT id, email, phone, display_name, avatar, profile_completed, auth_method
                    FROM users WHERE lower(email) = ? LIMIT 1
                `).bind(identifier).first();
        }
    } catch (error) {
        console.error("REGISTER_USER_LOOKUP_ERROR:", error);
        return json({
            success: false,
            code: "USER_LOOKUP_FAILED",
            error: "La cuenta se guardó, pero no pudo confirmarse."
        }, 500);
    }

    if (!createdUser?.id) {
        return json({
            success: false,
            code: "USER_NOT_FOUND_AFTER_INSERT",
            error: "La cuenta se guardó, pero no pudo confirmarse."
        }, 500);
    }

    try {
        const session = await createUserSession(db, createdUser.id);
        return json({
            success: true,
            user: {
                id: createdUser.id,
                email: createdUser.email,
                phone: createdUser.phone,
                displayName: createdUser.display_name,
                avatar: createdUser.avatar,
                profileCompleted: Boolean(createdUser.profile_completed),
                authMethod: createdUser.auth_method,
                authProvider: "local"
            }
        }, 201, { "Set-Cookie": buildSessionCookie(session.sessionId) });
    } catch (error) {
        console.error("REGISTER_SESSION_ERROR:", error);
        return json({
            success: true,
            sessionCreated: false,
            requiresLogin: true,
            user: {
                id: createdUser.id,
                email: createdUser.email,
                phone: createdUser.phone,
                displayName: createdUser.display_name,
                avatar: createdUser.avatar,
                profileCompleted: false,
                authMethod: createdUser.auth_method,
                authProvider: "local"
            },
            message: "Cuenta creada correctamente. Inicia sesión para continuar."
        }, 201);
    }
}
