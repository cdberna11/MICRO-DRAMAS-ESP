import { ensureUserSchema, getUserFromSession } from "../../lib/user-auth.js";

function json(data, status = 200) {
    return Response.json(data, {
        status,
        headers: {
            "Cache-Control": "no-store",
            "Content-Type": "application/json; charset=utf-8"
        }
    });
}

export async function onRequestGet(context) {
    const db = context.env.DB;
    if (!db) return json({ success: false, error: "La base de datos no está disponible." }, 500);

    try {
        await ensureUserSchema(db);
        const user = await getUserFromSession(db, context.request);
        if (!user) return json({ success: false, authenticated: false }, 401);

        return json({
            success: true,
            authenticated: true,
            user: {
                id: user.id,
                email: user.email,
                phone: user.phone,
                authMethod: user.auth_method,
                displayName: user.display_name,
                avatar: user.avatar,
                emailVerified: Boolean(user.email_verified),
                phoneVerified: Boolean(user.phone_verified)
            }
        });
    } catch (error) {
        console.error("Error consultando sesión:", error);
        return json({ success: false, error: "No se pudo consultar la sesión." }, 500);
    }
}

export async function onRequestPatch(context) {
    const db = context.env.DB;
    if (!db) return json({ success: false, error: "La base de datos no está disponible." }, 500);

    try {
        await ensureUserSchema(db);
        const user = await getUserFromSession(db, context.request);
        if (!user) return json({ success: false, authenticated: false }, 401);

        const body = await context.request.json();
        const displayName = String(body.displayName || "").trim().slice(0, 60);
        const avatar = String(body.avatar || "").trim();
        const allowedAvatars = new Set([
            "avatar-1.png", "avatar-2.png", "avatar-3.png", "avatar-4.png",
            "avatar-5.png", "avatar-6.png", "avatar-7.png", "avatar-8.png"
        ]);

        if (displayName.length < 2) return json({ success: false, error: "El nombre debe tener al menos 2 caracteres." }, 400);
        if (!allowedAvatars.has(avatar)) return json({ success: false, error: "Avatar no válido." }, 400);

        await db.prepare(`UPDATE users SET display_name = ?, avatar = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(displayName, avatar, user.id).run();

        return json({ success: true, user: { id: user.id, displayName, avatar } });
    } catch (error) {
        console.error("Error actualizando perfil:", error);
        return json({ success: false, error: "No se pudo actualizar el perfil." }, 500);
    }
}
