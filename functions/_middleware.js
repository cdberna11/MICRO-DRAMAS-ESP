import { ensureUserSchema, getCookie, getUserFromSession } from "./lib/user-auth.js";

export async function onRequest(context) {
    const request = context.request;
    const url = new URL(request.url);
    const pathname = url.pathname;

    const rutasProtegidas = [
        "/",
        "/index.html"
    ];

    if (!rutasProtegidas.includes(pathname)) {
        return context.next();
    }

    /*
       Conservamos la sesión administrativa/legada para no romper
       el acceso existente mientras migramos el portal a cuentas reales.
    */
    const legacyCookies = request.headers.get("Cookie") || "";
    const legacySession = legacyCookies
        .split(";")
        .some(cookie => cookie.trim() === "microdramas_session=1");

    if (legacySession) {
        return context.next();
    }

    const db = context.env.DB;
    if (db) {
        try {
            await ensureUserSchema(db);
            const user = await getUserFromSession(db, request, false);
            if (user) {
                return context.next();
            }
        } catch (error) {
            console.error("Error comprobando sesión de usuario:", error);
        }
    }

    return Response.redirect(
        new URL("/portal", request.url),
        302
    );
}
