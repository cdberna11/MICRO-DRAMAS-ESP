import { ensureUserSchema } from "../../lib/user-auth.js";

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

export async function onRequestGet(context) {
    try {
        const database = context.env.DB;

        if (!database) {
            return crearRespuestaJson({
                success: false,
                error: "El binding DB no está disponible."
            }, 500);
        }

        await ensureUserSchema(database);

        const resultado = await database.prepare(`
            SELECT
                id,
                email,
                phone,
                auth_method,
                display_name,
                avatar,
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
            users: Array.isArray(resultado.results)
                ? resultado.results
                : []
        });
    } catch (error) {
        console.error("Error GET usuarios administrativos:", error);

        return crearRespuestaJson({
            success: false,
            error: "No se pudieron obtener los usuarios."
        }, 500);
    }
}

export async function onRequestDelete(context) {
    try {
        const database = context.env.DB;

        if (!database) {
            return crearRespuestaJson({
                success: false,
                error: "El binding DB no está disponible."
            }, 500);
        }

        await ensureUserSchema(database);

        let datos;

        try {
            datos = await context.request.json();
        } catch {
            return crearRespuestaJson({
                success: false,
                error: "La solicitud no contiene JSON válido."
            }, 400);
        }

        const ids = obtenerIds(datos);

        if (ids.length === 0) {
            return crearRespuestaJson({
                success: false,
                error: "No se seleccionó ningún usuario válido."
            }, 400);
        }

        const placeholders = ids.map(() => "?").join(", ");

        await database.prepare(`
            DELETE FROM user_sessions
            WHERE user_id IN (${placeholders})
        `).bind(...ids).run();

        const eliminacion = await database.prepare(`
            DELETE FROM users
            WHERE id IN (${placeholders})
        `).bind(...ids).run();

        const eliminados = Number(eliminacion.meta?.changes || 0);

        return crearRespuestaJson({
            success: true,
            deleted: eliminados,
            message:
                eliminados === 1
                    ? "Usuario eliminado correctamente."
                    : `${eliminados} usuarios eliminados correctamente.`
        });
    } catch (error) {
        console.error("Error DELETE usuarios administrativos:", error);

        return crearRespuestaJson({
            success: false,
            error: "No se pudieron eliminar los usuarios."
        }, 500);
    }
}
