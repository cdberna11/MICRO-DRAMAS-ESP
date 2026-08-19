import { clearSessionCookie, getCookie, SESSION_COOKIE } from "../../lib/user-auth.js";

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
    const sessionId = getCookie(context.request, SESSION_COOKIE);

    try {
        if (db && sessionId) {
            await db.prepare("DELETE FROM user_sessions WHERE id = ?")
                .bind(sessionId)
                .run();
        }

        return json(
            { success: true },
            200,
            {
                "Set-Cookie": [
                    clearSessionCookie(),
                    "microdramas_session=; Path=/; Max-Age=0; SameSite=Lax"
                ]
            }
        );
    } catch (error) {
        console.error("Error al cerrar sesión:", error);

        // Aunque la limpieza de la sesión en D1 falle, se elimina la cookie
        // del navegador para impedir que el panel continúe usando la sesión.
        return json(
            { success: false, error: "No se pudo cerrar completamente la sesión." },
            500,
            {
                "Set-Cookie": [
                    clearSessionCookie(),
                    "microdramas_session=; Path=/; Max-Age=0; SameSite=Lax"
                ]
            }
        );
    }
}
