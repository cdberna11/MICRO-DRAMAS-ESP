import { ensureUserSchema, getCookie, clearSessionCookie } from "../../lib/user-auth.js";

export async function onRequestGet(context) {
    const headers = new Headers();
    const db = context.env.DB;
    const sessionId = getCookie(context.request, "md_user_session");

    if (db && sessionId) {
        try {
            await ensureUserSchema(db);
            await db.prepare(`DELETE FROM user_sessions WHERE id = ?`).bind(sessionId).run();
        } catch (error) {
            console.error("Error cerrando sesión:", error);
        }
    }

    headers.append("Set-Cookie", clearSessionCookie());
    headers.append("Set-Cookie", "microdramas_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
    headers.set("Location", "/portal");

    return new Response(null, { status: 302, headers });
}
