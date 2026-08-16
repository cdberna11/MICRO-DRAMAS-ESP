import { ensureUserSchema, getAdminFromRequest } from "../../lib/user-auth.js";

function crearRespuestaJson(datos, estado = 200) {
    return Response.json(datos, {
        status: estado,
        headers: {
            "Cache-Control": "no-store",
            "Content-Type": "application/json; charset=utf-8"
        }
    });
}

function obtenerIds(datos) {
    const valores = Array.isArray(datos?.ids)
        ? datos.ids
        : [datos?.id];

    return [
        ...new Set(
            valores
                .map(valor => Number(valor))
                .filter(id => Number.isInteger(id) && id > 0)
        )
    ];
}

async function obtenerAdmin(database, request) {
    await ensureUserSchema(database);
    return getAdminFromRequest(database, request, true);
}

export async function onRequestGet(context) {
    try {
        const database = context.env.DB;

        if (!database) {
            return crearRespuestaJson({ success: false, error: "El binding DB no está disponible." }, 500);
        }

        const admin = await obtenerAdmin(database, context.request);
        if (!admin) return crearRespuestaJson({ success: false, error: "Se requieren permisos de administrador." }, 403);

        const resultado = await database.prepare(`
            SELECT
                id,
                email,
                phone,
                auth_method,
                display_name,
                avatar,
                role,
                phone_verified,
                email_verified,
                created_at,
                updated_at,
                last_login_at,
                auth_provider
            FROM users
            ORDER BY id DESC
        `).all();

        return crearRespuestaJson({
            success: true,
            users: Array.isArray(resultado.results) ? resultado.results : []
        });
    } catch (error) {
        console.error("Error GET usuarios administrativos:", error);
        return crearRespuestaJson({ success: false, error: "No se pudieron obtener los usuarios." }, 500);
    }
}

export async function onRequestPatch(context) {
    try {
        const database = context.env.DB;

        if (!database) {
            return crearRespuestaJson({ success: false, error: "El binding DB no está disponible." }, 500);
        }

        const admin = await obtenerAdmin(database, context.request);
        if (!admin) return crearRespuestaJson({ success: false, error: "Se requieren permisos de administrador." }, 403);

        let datos;
        try {
            datos = await context.request.json();
        } catch {
            return crearRespuestaJson({ success: false, error: "La solicitud no contiene JSON válido." }, 400);
        }

        const id = Number(datos?.id);
        const role = String(datos?.role || "").trim().toLowerCase();

        if (!Number.isInteger(id) || id <= 0) {
            return crearRespuestaJson({ success: false, error: "Usuario no válido." }, 400);
        }
        if (!["user", "admin"].includes(role)) {
            return crearRespuestaJson({ success: false, error: "Rol no válido." }, 400);
        }

        const usuario = await database.prepare(`SELECT id, email, display_name, role FROM users WHERE id = ? LIMIT 1`).bind(id).first();
        if (!usuario) return crearRespuestaJson({ success: false, error: "El usuario no existe." }, 404);

        const rolActual = String(usuario.role || "user").toLowerCase();
        if (rolActual === role) {
            return crearRespuestaJson({
                success: true,
                message: role === "admin" ? "El usuario ya es administrador." : "El usuario ya tiene rol de usuario.",
                user: { ...usuario, role }
            });
        }

        if (role === "user") {
            if (!admin.legacy && Number(admin.id) === id) {
                return crearRespuestaJson({ success: false, error: "No puedes quitarte a ti mismo el último acceso administrativo." }, 400);
            }

            const conteo = await database.prepare(`SELECT COUNT(*) AS total FROM users WHERE lower(role) = 'admin'`).first();
            const totalAdmins = Number(conteo?.total || 0);
            if (totalAdmins <= 1) {
                return crearRespuestaJson({ success: false, error: "Debe existir al menos un administrador. No se puede quitar el último administrador." }, 400);
            }
        }

        await database.prepare(`
            UPDATE users
            SET role = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).bind(role, id).run();

        return crearRespuestaJson({
            success: true,
            message: role === "admin"
                ? `Ahora ${usuario.display_name || "el usuario"} tiene permisos de administrador.`
                : `Se retiraron los permisos de administrador de ${usuario.display_name || "el usuario"}.`,
            user: {
                id: usuario.id,
                email: usuario.email,
                display_name: usuario.display_name,
                role
            }
        });
    } catch (error) {
        console.error("Error PATCH rol usuario:", error);
        return crearRespuestaJson({ success: false, error: "No se pudo actualizar el rol del usuario." }, 500);
    }
}

export async function onRequestDelete(context) {
    try {
        const database = context.env.DB;

        if (!database) {
            return crearRespuestaJson({ success: false, error: "El binding DB no está disponible." }, 500);
        }

        const admin = await obtenerAdmin(database, context.request);
        if (!admin) return crearRespuestaJson({ success: false, error: "Se requieren permisos de administrador." }, 403);

        let datos;
        try {
            datos = await context.request.json();
        } catch {
            return crearRespuestaJson({ success: false, error: "La solicitud no contiene JSON válido." }, 400);
        }

        const ids = obtenerIds(datos);
        if (ids.length === 0) return crearRespuestaJson({ success: false, error: "No se seleccionó ningún usuario válido." }, 400);

        if (!admin.legacy && ids.includes(Number(admin.id))) {
            return crearRespuestaJson({ success: false, error: "No puedes eliminar tu propia cuenta administrativa desde este panel." }, 400);
        }

        const placeholders = ids.map(() => "?").join(", ");

        await database.prepare(`DELETE FROM user_sessions WHERE user_id IN (${placeholders})`).bind(...ids).run();
        const eliminacion = await database.prepare(`DELETE FROM users WHERE id IN (${placeholders})`).bind(...ids).run();
        const eliminados = Number(eliminacion.meta?.changes || 0);

        return crearRespuestaJson({
            success: true,
            deleted: eliminados,
            message: eliminados === 1 ? "Usuario eliminado correctamente." : `${eliminados} usuarios eliminados correctamente.`
        });
    } catch (error) {
        console.error("Error DELETE usuarios administrativos:", error);
        return crearRespuestaJson({ success: false, error: "No se pudieron eliminar los usuarios." }, 500);
    }
}
