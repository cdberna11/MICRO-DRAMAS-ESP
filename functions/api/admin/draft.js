function respuestaJson(datos, estado = 200) {
    return Response.json(datos, {
        status: estado,
        headers: { "Cache-Control": "no-store" }
    });
}

export async function onRequestPost(context) {
    try {
        const db = context.env.DB;
        if (!db) return respuestaJson({ success: false, error: "La base de datos no está disponible." }, 500);

        let datos;
        try {
            datos = await context.request.json();
        } catch {
            return respuestaJson({ success: false, error: "La solicitud no contiene JSON válido." }, 400);
        }

        const id = Number(datos?.id);
        if (!Number.isInteger(id) || id <= 0) {
            return respuestaJson({ success: false, error: "El identificador del microdrama no es válido." }, 400);
        }

        const drama = await db.prepare("SELECT id, status FROM dramas WHERE id = ? LIMIT 1").bind(id).first();
        if (!drama) return respuestaJson({ success: false, error: "El microdrama no existe." }, 404);
        if (String(drama.status).toLowerCase() === "draft") {
            return respuestaJson({ success: true, alreadyDraft: true, message: "El microdrama ya está en borrador." });
        }

        const actualizacion = await db.prepare(`
            UPDATE dramas
            SET status = 'draft', published_at = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).bind(id).run();
        if (!actualizacion.success) throw new Error("Cloudflare D1 no confirmó el cambio de estado.");

        return respuestaJson({ success: true, message: "Microdrama guardado como borrador." });
    } catch (error) {
        console.error("Error al volver a borrador:", error);
        return respuestaJson({ success: false, error: "No se pudo cambiar el microdrama a borrador." }, 500);
    }
}
