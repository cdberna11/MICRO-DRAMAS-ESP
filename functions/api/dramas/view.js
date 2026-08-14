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
           Obtener estado actual del microdrama
        ----------------------------------------------------- */

        const dramaAntes =
            await database
                .prepare(`
                    SELECT
                        id,
                        views,
                        top_period_start,
                        top_period_views
                    FROM dramas
                    WHERE id = ?
                    AND status = 'published'
                    LIMIT 1
                `)
                .bind(id)
                .first();

        if (!dramaAntes) {
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
           Determinar inicio del bloque actual
        ----------------------------------------------------- */

        const ahora = Date.now();

        let inicioPeriodo = null;

        if (
            typeof dramaAntes.top_period_start === "string" &&
            dramaAntes.top_period_start.trim() !== ""
        ) {
            const valor =
                dramaAntes.top_period_start
                    .trim()
                    .replace(" ", "T");

            const fecha =
                new Date(
                    valor.endsWith("Z")
                        ? valor
                        : `${valor}Z`
                );

            if (
                !Number.isNaN(
                    fecha.getTime()
                )
            ) {
                inicioPeriodo =
                    fecha.getTime();
            }
        }

        const UNA_SEMANA =
            7 *
            24 *
            60 *
            60 *
            1000;

        const periodoTerminado =
            !inicioPeriodo ||
            ahora - inicioPeriodo >= UNA_SEMANA;

        /* -----------------------------------------------------
           Registrar reproducción

           BLOQUE ACTUAL:
               views aumenta.
               top_period_views permanece igual.

           NUEVO BLOQUE:
               views aumenta.
               top_period_views toma el valor anterior
               de views.

           La reproducción que inicia el nuevo bloque
           se convierte en la primera vista del nuevo
           periodo.
        ----------------------------------------------------- */

        const actualizacion =
            periodoTerminado
                ? await database
                    .prepare(`
                        UPDATE dramas
                        SET
                            views = views + 1,
                            top_period_start = CURRENT_TIMESTAMP,
                            top_period_views = views
                        WHERE id = ?
                        AND status = 'published'
                    `)
                    .bind(id)
                    .run()

                : await database
                    .prepare(`
                        UPDATE dramas
                        SET
                            views = views + 1
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
           Obtener valores actualizados
        ----------------------------------------------------- */

        const drama =
            await database
                .prepare(`
                    SELECT
                        id,
                        views,
                        top_period_start,
                        top_period_views
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
           Calcular reproducciones nuevas del bloque
        ----------------------------------------------------- */

        const viewsActuales =
            Number(drama.views) || 0;

        const viewsInicioPeriodo =
            Number(
                drama.top_period_views
            ) || 0;

        const reproduccionesPeriodo =
            Math.max(
                0,
                viewsActuales -
                viewsInicioPeriodo
            );

        /* -----------------------------------------------------
           Respuesta
        ----------------------------------------------------- */

        return Response.json(
            {
                success: true,
                id: drama.id,
                views: viewsActuales,
                top_period_start:
                    drama.top_period_start,
                top_period_views:
                    viewsInicioPeriodo,
                period_views:
                    reproduccionesPeriodo
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
