export async function onRequestPost(context) {
    try {
        const database = context.env.DB;

        if (!database) {
            return Response.json(
                {
                    success: false,
                    error: "El binding DB no está disponible."
                },
                {
                    status: 500,
                    headers: {
                        "Cache-Control": "no-store"
                    }
                }
            );
        }

        /* -----------------------------------------------------
           Verificar Content-Type
        ----------------------------------------------------- */

        const contentType =
            context.request.headers.get("content-type") || "";

        if (
            !contentType
                .toLowerCase()
                .includes("application/json")
        ) {
            return Response.json(
                {
                    success: false,
                    error:
                        "La solicitud debe utilizar application/json."
                },
                {
                    status: 415,
                    headers: {
                        "Cache-Control": "no-store"
                    }
                }
            );
        }

        /* -----------------------------------------------------
           Leer JSON
        ----------------------------------------------------- */

        let datos;

        try {
            datos = await context.request.json();
        } catch {
            return Response.json(
                {
                    success: false,
                    error:
                        "El cuerpo JSON de la solicitud no es válido."
                },
                {
                    status: 400,
                    headers: {
                        "Cache-Control": "no-store"
                    }
                }
            );
        }

        /* -----------------------------------------------------
           Validar ID
        ----------------------------------------------------- */

        const id = Number(datos?.id);

        if (
            !Number.isInteger(id) ||
            id <= 0
        ) {
            return Response.json(
                {
                    success: false,
                    error:
                        "El identificador del microdrama no es válido."
                },
                {
                    status: 400,
                    headers: {
                        "Cache-Control": "no-store"
                    }
                }
            );
        }

        /* -----------------------------------------------------
           Incrementar reproducciones
        ----------------------------------------------------- */

        const actualizacion =
            await database
                .prepare(`
                    UPDATE dramas
                    SET views = views + 1
                    WHERE id = ?
                    AND status = 'published'
                `)
                .bind(id)
                .run();

        if (!actualizacion.success) {
            throw new Error(
                "Cloudflare D1 no confirmó la actualización."
            );
        }

        /* -----------------------------------------------------
           Comprobar que el microdrama existe
        ----------------------------------------------------- */

        const drama =
            await database
                .prepare(`
                    SELECT
                        id,
                        views
                    FROM dramas
                    WHERE id = ?
                    AND status = 'published'
                    LIMIT 1
                `)
                .bind(id)
                .first();

        if (!drama) {
            return Response.json(
                {
                    success: false,
                    error:
                        "El microdrama no existe o no está publicado."
                },
                {
                    status: 404,
                    headers: {
                        "Cache-Control": "no-store"
                    }
                }
            );
        }

        /* -----------------------------------------------------
           Respuesta
        ----------------------------------------------------- */

        return Response.json(
            {
                success: true,
                id: drama.id,
                views: Number(drama.views) || 0
            },
            {
                status: 200,
                headers: {
                    "Cache-Control": "no-store"
                }
            }
        );

    } catch (error) {
        console.error(
            "Error al registrar reproducción:",
            error
        );

        return Response.json(
            {
                success: false,
                error:
                    "No se pudo registrar la reproducción."
            },
            {
                status: 500,
                headers: {
                    "Cache-Control": "no-store"
                }
            }
        );
    }
}
