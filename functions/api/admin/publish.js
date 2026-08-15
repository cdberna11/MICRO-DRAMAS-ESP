function crearRespuestaJson(datos, estado = 200) {
    return Response.json(datos, {
        status: estado,
        headers: {
            "Cache-Control": "no-store",
            "Content-Type": "application/json; charset=utf-8"
        }
    });
}

export async function onRequestPost(context) {
    try {
        const database = context.env.DB;

        if (!database) {
            return crearRespuestaJson({
                success: false,
                error: "El binding DB no está disponible."
            }, 500);
        }

        let datos;

        try {
            datos = await context.request.json();
        } catch {
            return crearRespuestaJson({
                success: false,
                error: "La solicitud no contiene JSON válido."
            }, 400);
        }

        const id = Number(datos?.id);

        if (!Number.isInteger(id) || id <= 0) {
            return crearRespuestaJson({
                success: false,
                error: "El identificador del microdrama no es válido."
            }, 400);
        }

        const drama = await database.prepare(`
            SELECT id, status
            FROM dramas
            WHERE id = ?
            LIMIT 1
        `).bind(id).first();

        if (!drama) {
            return crearRespuestaJson({
                success: false,
                error: "El microdrama no existe."
            }, 404);
        }

        if (String(drama.status).toLowerCase() === "published") {
            return crearRespuestaJson({
                success: true,
                alreadyPublished: true,
                message: "El microdrama ya está publicado."
            });
        }

        const actualizacion = await database.prepare(`
            UPDATE dramas
            SET
                status = 'published',
                published_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).bind(id).run();

        if (!actualizacion.success) {
            throw new Error("Cloudflare D1 no confirmó la publicación.");
        }

        return crearRespuestaJson({
            success: true,
            message: "Microdrama publicado correctamente."
        });
    } catch (error) {
        console.error("Error al publicar microdrama:", error);

        return crearRespuestaJson({
            success: false,
            error: "No se pudo publicar el microdrama."
        }, 500);
    }
}
