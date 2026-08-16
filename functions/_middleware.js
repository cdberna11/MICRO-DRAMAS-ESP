import { ensureUserSchema, getAdminFromRequest, getUserFromSession } from "./lib/user-auth.js";

export async function onRequest(context) {
    const request = context.request;
    const url = new URL(request.url);
    const pathname = url.pathname;
    const db = context.env.DB;

    // El acceso oficial sigue siendo /admin. La pantalla de login vive fuera
    // de /admin para evitar que el middleware pueda redirigirla sobre sí misma.
    const rutasPublicasAdmin = new Set([
        "/admin-login.html",
        "/admin/login.html",
        "/admin/admin-login.js",
        "/admin/admin-login.css"
    ]);

    if (rutasPublicasAdmin.has(pathname)) {
        return context.next();
    }

    // Toda API administrativa exige una sesión con role=admin.
    if (pathname === "/api/admin" || pathname.startsWith("/api/admin/")) {
        if (!db) {
            return Response.json({ success: false, error: "La base de datos no está disponible." }, { status: 500 });
        }

        try {
            await ensureUserSchema(db);
            const admin = await getAdminFromRequest(db, request, false);
            if (admin) return context.next();
        } catch (error) {
            console.error("Error comprobando permisos administrativos:", error);
        }

        return Response.json({
            success: false,
            error: "Se requieren permisos de administrador."
        }, {
            status: 403,
            headers: {
                "Cache-Control": "no-store",
                "Content-Type": "application/json; charset=utf-8"
            }
        });
    }

    // /admin es la ruta canónica del panel. Un usuario no autenticado va al
    // login público fuera de /admin; un administrador entra directamente.
    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
        if (!db) {
            return Response.redirect(new URL("/admin-login.html", request.url), 302);
        }

        try {
            await ensureUserSchema(db);
            const admin = await getAdminFromRequest(db, request, true);
            if (admin) return context.next();
        } catch (error) {
            console.error("Error comprobando acceso al panel administrativo:", error);
        }

        return Response.redirect(new URL("/admin-login.html", request.url), 302);
    }

    // La cartelera pública mantiene su comportamiento actual.
    const rutasProtegidas = ["/", "/index.html"];
    if (!rutasProtegidas.includes(pathname)) return context.next();

    const legacyCookies = request.headers.get("Cookie") || "";
    const legacySession = legacyCookies
        .split(";")
        .some(cookie => cookie.trim() === "microdramas_session=1");

    if (legacySession) return context.next();

    if (db) {
        try {
            await ensureUserSchema(db);
            const user = await getUserFromSession(db, request, false);
            if (user) return context.next();
        } catch (error) {
            console.error("Error comprobando sesión de usuario:", error);
        }
    }

    return Response.redirect(new URL("/portal", request.url), 302);
}
