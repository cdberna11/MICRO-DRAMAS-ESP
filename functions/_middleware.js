import { ensureUserSchema, getAdminFromRequest, getUserFromSession } from "./lib/user-auth.js";

export async function onRequest(context) {
    const request = context.request;
    const url = new URL(request.url);
    const pathname = url.pathname;
    const db = context.env.DB;

    /*
       1) El login administrativo y sus recursos mínimos deben poder abrirse
          sin autenticación para que un usuario pueda iniciar sesión.
    */
    const rutasPublicasAdmin = new Set([
        "/admin/login.html",
        "/admin/admin-login.js",
        "/admin/admin-login.css"
    ]);

    if (rutasPublicasAdmin.has(pathname)) {
        return context.next();
    }

    /*
       2) Todo /api/admin/* requiere una cuenta con role=admin.
          Se conserva temporalmente la cookie legacy microdramas_session=1
          para no romper el acceso administrativo existente mientras se
          asigna el primer administrador desde la pantalla de usuarios.
    */
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

    /*
       3) Todo el portal /admin/* requiere role=admin.
    */
    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
        if (!db) {
            return Response.redirect(new URL("/admin/login.html", request.url), 302);
        }

        try {
            await ensureUserSchema(db);
            const admin = await getAdminFromRequest(db, request, true);
            if (admin) return context.next();
        } catch (error) {
            console.error("Error comprobando acceso al panel administrativo:", error);
        }

        return Response.redirect(new URL("/admin/login.html", request.url), 302);
    }

    /*
       4) La cartelera pública mantiene su comportamiento actual:
          sesión legacy o cuenta de usuario autenticada.
    */
    const rutasProtegidas = [
        "/",
        "/index.html"
    ];

    if (!rutasProtegidas.includes(pathname)) {
        return context.next();
    }

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

    return Response.redirect(
        new URL("/portal", request.url),
        302
    );
}
