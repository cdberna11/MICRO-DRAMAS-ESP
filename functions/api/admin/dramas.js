function crearRespuestaJson(
    datos,
    estado = 200
) {
    return Response.json(
        datos,
        {
            status: estado,
            headers: {
                "Cache-Control":
                    "no-store",

                "Content-Type":
                    "application/json; charset=utf-8"
            }
        }
    );
}


/* =========================================================
   CONFIGURACIÓN
========================================================= */

const DESCRIPCION_AUTOMATICA =
    "Drama doblado al español.";

const PORTADA_GENERICA =
    "/portadas/generica/portada-generica.png";


/* =========================================================
   UTILIDADES
========================================================= */

function limpiarTexto(
    valor
) {
    return typeof valor === "string"
        ? valor.trim()
        : "";
}


function convertirEntero(
    valor,
    predeterminado = 0
) {
    const numero =
        Number.parseInt(
            valor,
            10
        );

    return Number.isInteger(
        numero
    )
        ? numero
        : predeterminado;
}


function convertirDestacado(
    valor
) {
    if (
        valor === true ||
        valor === 1 ||
        valor === "1"
    ) {
        return 1;
    }

    return 0;
}


function esUrlHttpValida(
    valor
) {
    if (!valor) {
        return true;
    }

    try {
        const url =
            new URL(
                valor
            );

        return (
            url.protocol === "http:" ||
            url.protocol === "https:"
        );

    } catch {
        return false;
    }
}


function esSlugValido(
    slug
) {
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(
        slug
    );
}


/* =========================================================
   NORMALIZAR DRAMA
========================================================= */

function normalizarDrama(
    datos
) {
    return {
        slug:
            limpiarTexto(
                datos.slug
            ).toLowerCase(),

        title:
            limpiarTexto(
                datos.title
            ),

        platform:
            limpiarTexto(
                datos.platform
            ),

        /*
         * La descripción NO se toma del cliente.
         * El servidor la establece siempre.
         */

        description:
            DESCRIPCION_AUTOMATICA,

        video_description:
            limpiarTexto(
                datos.video_description
            ),

        /*
         * Si no se proporciona una portada,
         * se utiliza automáticamente la portada genérica.
         */

        cover_url:
            limpiarTexto(
                datos.cover_url
            ) || PORTADA_GENERICA,

        /*
         * video_url ya no se utiliza
         * en el nuevo formulario.
         *
         * La columna permanece en D1
         * por compatibilidad.
         */

        embed_url:
            limpiarTexto(
                datos.embed_url
            ),

        status:
            limpiarTexto(
                datos.status
            ).toLowerCase() ||
            "published",

        featured:
            convertirDestacado(
                datos.featured
            )
    };
}


/* =========================================================
   VALIDAR DRAMA
========================================================= */

function validarDrama(
    drama
) {
    const errores = [];


    /* -----------------------------------------------------
       TÍTULO
    ----------------------------------------------------- */

    if (
        !drama.title
    ) {
        errores.push(
            "El título es obligatorio."
        );
    }


    if (
        drama.title.length > 200
    ) {
        errores.push(
            "El título no puede superar 200 caracteres."
        );
    }


    /* -----------------------------------------------------
       SLUG
    ----------------------------------------------------- */

    if (
        !drama.slug
    ) {
        errores.push(
            "El slug es obligatorio."
        );

    } else if (
        !esSlugValido(
            drama.slug
        )
    ) {
        errores.push(
            "El slug generado no es válido."
        );
    }


    if (
        drama.slug.length > 200
    ) {
        errores.push(
            "El slug no puede superar 200 caracteres."
        );
    }


    /* -----------------------------------------------------
       PLATAFORMA
    ----------------------------------------------------- */

    if (
        !drama.platform
    ) {
        errores.push(
            "La plataforma es obligatoria."
        );
    }


    if (
        drama.platform.length > 100
    ) {
        errores.push(
            "El nombre de la plataforma no puede superar 100 caracteres."
        );
    }


    /* -----------------------------------------------------
       ESTADO
    ----------------------------------------------------- */

    if (
        ![
            "draft",
            "published"
        ].includes(
            drama.status
        )
    ) {
        errores.push(
            "El estado debe ser draft o published."
        );
    }


    /* -----------------------------------------------------
       URL PORTADA
    -----------------------------------------------------

       Se permiten:

       1. URL externa HTTP/HTTPS
       2. Ruta local que comience con "/"

       La portada genérica utiliza una ruta local.
    */

    const portadaEsValida =
        drama.cover_url.startsWith("/") ||
        esUrlHttpValida(
            drama.cover_url
        );

    if (
        !portadaEsValida
    ) {
        errores.push(
            "La URL de portada debe comenzar con http://, https:// o utilizar una ruta local válida."
        );
    }


    /* -----------------------------------------------------
       URL EMBED
    ----------------------------------------------------- */

    if (
        !esUrlHttpValida(
            drama.embed_url
        )
    ) {
        errores.push(
            "La URL de inserción debe comenzar con http:// o https://."
        );
    }


    return errores;
}


/* =========================================================
   SIGUIENTE ORDEN
========================================================= */

async function obtenerSiguienteOrden(
    database
) {
    const resultado =
        await database
            .prepare(`
                SELECT
                    COALESCE(
                        MAX(sort_order),
                        0
                    ) AS max_order
                FROM dramas
            `)
            .first();


    const maximo =
        convertirEntero(
            resultado?.max_order,
            0
        );


    return Math.max(
        1,
        maximo + 1
    );
}


/* =========================================================
   GET
   Obtener todos los microdramas
========================================================= */

export async function onRequestGet(
    context
) {
    try {

        const database =
            context.env.DB;


        if (
            !database
        ) {
            return crearRespuestaJson(
                {
                    success: false,

                    error:
                        "El binding DB no está disponible."
                },
                500
            );
        }


        const resultado =
            await database
                .prepare(`
                    SELECT
                        id,
                        slug,
                        title,
                        platform,
                        description,
                        video_description,
                        cover_url,
                        video_url,
                        embed_url,
                        status,
                        featured,
                        sort_order,
                        created_at,
                        updated_at
                    FROM dramas
                    ORDER BY
                        featured DESC,
                        sort_order ASC,
                        id DESC
                `)
                .all();


        return crearRespuestaJson(
            {
                success: true,

                dramas:
                    Array.isArray(
                        resultado.results
                    )
                        ? resultado.results
                        : []
            }
        );


    } catch (error) {

        console.error(
            "Error GET dramas:",
            error
        );


        return crearRespuestaJson(
            {
                success: false,

                error:
                    "No se pudieron obtener los microdramas."
            },
            500
        );
    }
}


/* =========================================================
   POST
   Crear nuevo microdrama
========================================================= */

export async function onRequestPost(
    context
) {
    try {

        const database =
            context.env.DB;


        if (
            !database
        ) {
            return crearRespuestaJson(
                {
                    success: false,

                    error:
                        "El binding DB no está disponible."
                },
                500
            );
        }


        /* -----------------------------------------------------
           Verificar Content-Type
        ----------------------------------------------------- */

        const contentType =
            context.request.headers.get(
                "content-type"
            ) || "";


        if (
            !contentType
                .toLowerCase()
                .includes(
                    "application/json"
                )
        ) {
            return crearRespuestaJson(
                {
                    success: false,

                    error:
                        "La solicitud debe utilizar application/json."
                },
                415
            );
        }


        /* -----------------------------------------------------
           Leer JSON
        ----------------------------------------------------- */

        let datos;


        try {

            datos =
                await context.request.json();

        } catch {

            return crearRespuestaJson(
                {
                    success: false,

                    error:
                        "El cuerpo JSON de la solicitud no es válido."
                },
                400
            );
        }


        /* -----------------------------------------------------
           Validar estructura
        ----------------------------------------------------- */

        if (
            !datos ||
            typeof datos !== "object" ||
            Array.isArray(datos)
        ) {
            return crearRespuestaJson(
                {
                    success: false,

                    error:
                        "Los datos enviados no son válidos."
                },
                400
            );
        }


        /* -----------------------------------------------------
           Normalizar
        ----------------------------------------------------- */

        const drama =
            normalizarDrama(
                datos
            );


        /* -----------------------------------------------------
           Validar
        ----------------------------------------------------- */

        const errores =
            validarDrama(
                drama
            );


        if (
            errores.length > 0
        ) {
            return crearRespuestaJson(
                {
                    success: false,

                    error:
                        errores[0],

                    errors:
                        errores
                },
                400
            );
        }


        /* -----------------------------------------------------
           Comprobar slug duplicado
        ----------------------------------------------------- */

        const existente =
            await database
                .prepare(`
                    SELECT
                        id
                    FROM dramas
                    WHERE slug = ?
                    LIMIT 1
                `)
                .bind(
                    drama.slug
                )
                .first();


        if (
            existente
        ) {
            return crearRespuestaJson(
                {
                    success: false,

                    error:
                        "Ya existe un microdrama con ese slug."
                },
                409
            );
        }


        /* -----------------------------------------------------
           Orden automático
        ----------------------------------------------------- */

        const siguienteOrden =
            await obtenerSiguienteOrden(
                database
            );


        /* -----------------------------------------------------
           Insertar
        ----------------------------------------------------- */

        const insercion =
            await database
                .prepare(`
                    INSERT INTO dramas (
                        slug,
                        title,
                        platform,
                        description,
                        video_description,
                        cover_url,
                        video_url,
                        embed_url,
                        status,
                        featured,
                        sort_order,
                        created_at,
                        updated_at
                    )
                    VALUES (
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        '',
                        ?,
                        ?,
                        ?,
                        ?,
                        CURRENT_TIMESTAMP,
                        CURRENT_TIMESTAMP
                    )
                `)
                .bind(
                    drama.slug,
                    drama.title,
                    drama.platform,
                    drama.description,
                    drama.video_description,
                    drama.cover_url,
                    drama.embed_url,
                    drama.status,
                    drama.featured,
                    siguienteOrden
                )
                .run();


        if (
            !insercion.success
        ) {
            throw new Error(
                "Cloudflare D1 no confirmó la inserción."
            );
        }


        return crearRespuestaJson(
            {
                success: true,

                message:
                    "Microdrama creado correctamente.",

                id:
                    insercion.meta?.last_row_id
            },
            201
        );


    } catch (error) {

        console.error(
            "Error POST dramas:",
            error
        );


        const mensaje =
            String(
                error?.message || ""
            );


        if (
            mensaje.includes(
                "UNIQUE constraint failed"
            ) ||
            mensaje.includes(
                "dramas.slug"
            )
        ) {
            return crearRespuestaJson(
                {
                    success: false,

                    error:
                        "Ya existe un microdrama con ese slug."
                },
                409
            );
        }


        return crearRespuestaJson(
            {
                success: false,

                error:
                    "No se pudo crear el microdrama."
            },
            500
        );
    }
}


/* =========================================================
   PUT
   Actualizar microdrama existente
========================================================= */

export async function onRequestPut(
    context
) {
    try {

        const database =
            context.env.DB;


        if (
            !database
        ) {
            return crearRespuestaJson(
                {
                    success: false,

                    error:
                        "El binding DB no está disponible."
                },
                500
            );
        }


        /* -----------------------------------------------------
           Verificar Content-Type
        ----------------------------------------------------- */

        const contentType =
            context.request.headers.get(
                "content-type"
            ) || "";


        if (
            !contentType
                .toLowerCase()
                .includes(
                    "application/json"
                )
        ) {
            return crearRespuestaJson(
                {
                    success: false,

                    error:
                        "La solicitud debe utilizar application/json."
                },
                415
            );
        }


        /* -----------------------------------------------------
           Leer JSON
        ----------------------------------------------------- */

        let datos;


        try {

            datos =
                await context.request.json();

        } catch {

            return crearRespuestaJson(
                {
                    success: false,

                    error:
                        "El cuerpo JSON de la solicitud no es válido."
                },
                400
            );
        }


        /* -----------------------------------------------------
           ID
        ----------------------------------------------------- */

        const id =
            convertirEntero(
                datos?.id,
                0
            );


        if (
            id <= 0
        ) {
            return crearRespuestaJson(
                {
                    success: false,

                    error:
                        "El identificador del microdrama no es válido."
                },
                400
            );
        }


        /* -----------------------------------------------------
           Normalizar
        ----------------------------------------------------- */

        const drama =
            normalizarDrama(
                datos
            );


        /* -----------------------------------------------------
           Validar
        ----------------------------------------------------- */

        const errores =
            validarDrama(
                drama
            );


        if (
            errores.length > 0
        ) {
            return crearRespuestaJson(
                {
                    success: false,

                    error:
                        errores[0],

                    errors:
                        errores
                },
                400
            );
        }


        /* -----------------------------------------------------
           Verificar que existe
        ----------------------------------------------------- */

        const registro =
            await database
                .prepare(`
                    SELECT
                        id
                    FROM dramas
                    WHERE id = ?
                    LIMIT 1
                `)
                .bind(
                    id
                )
                .first();


        if (
            !registro
        ) {
            return crearRespuestaJson(
                {
                    success: false,

                    error:
                        "El microdrama no existe."
                },
                404
            );
        }


        /* -----------------------------------------------------
           Verificar slug duplicado
        ----------------------------------------------------- */

        const slugDuplicado =
            await database
                .prepare(`
                    SELECT
                        id
                    FROM dramas
                    WHERE slug = ?
                    AND id != ?
                    LIMIT 1
                `)
                .bind(
                    drama.slug,
                    id
                )
                .first();


        if (
            slugDuplicado
        ) {
            return crearRespuestaJson(
                {
                    success: false,

                    error:
                        "Otro microdrama ya utiliza ese slug."
                },
                409
            );
        }


        /* -----------------------------------------------------
           Actualizar

           IMPORTANTE:
           sort_order NO se toca.
           El orden actual del microdrama se conserva.
        ----------------------------------------------------- */

        const actualizacion =
            await database
                .prepare(`
                    UPDATE dramas
                    SET
                        slug = ?,
                        title = ?,
                        platform = ?,
                        description = ?,
                        video_description = ?,
                        cover_url = ?,
                        embed_url = ?,
                        status = ?,
                        featured = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `)
                .bind(
                    drama.slug,
                    drama.title,
                    drama.platform,
                    drama.description,
                    drama.video_description,
                    drama.cover_url,
                    drama.embed_url,
                    drama.status,
                    drama.featured,
                    id
                )
                .run();


        if (
            !actualizacion.success
        ) {
            throw new Error(
                "Cloudflare D1 no confirmó la actualización."
            );
        }


        return crearRespuestaJson(
            {
                success: true,

                message:
                    "Microdrama actualizado correctamente."
            }
        );


    } catch (error) {

        console.error(
            "Error PUT dramas:",
            error
        );


        const mensaje =
            String(
                error?.message || ""
            );


        if (
            mensaje.includes(
                "UNIQUE constraint failed"
            ) ||
            mensaje.includes(
                "dramas.slug"
            )
        ) {
            return crearRespuestaJson(
                {
                    success: false,

                    error:
                        "Otro microdrama ya utiliza ese slug."
                },
                409
            );
        }


        return crearRespuestaJson(
            {
                success: false,

                error:
                    "No se pudo actualizar el microdrama."
            },
            500
        );
    }
}


/* =========================================================
   DELETE
   Eliminar uno o varios microdramas
========================================================= */

export async function onRequestDelete(
    context
) {
    try {

        const database =
            context.env.DB;


        if (
            !database
        ) {
            return crearRespuestaJson(
                {
                    success: false,

                    error:
                        "El binding DB no está disponible."
                },
                500
            );
        }


        /* -----------------------------------------------------
           Verificar Content-Type
        ----------------------------------------------------- */

        const contentType =
            context.request.headers.get(
                "content-type"
            ) || "";


        if (
            !contentType
                .toLowerCase()
                .includes(
                    "application/json"
                )
        ) {
            return crearRespuestaJson(
                {
                    success: false,

                    error:
                        "La solicitud debe utilizar application/json."
                },
                415
            );
        }


        /* -----------------------------------------------------
           Leer JSON
        ----------------------------------------------------- */

        let datos;


        try {

            datos =
                await context.request.json();

        } catch {

            return crearRespuestaJson(
                {
                    success: false,

                    error:
                        "El cuerpo JSON de la solicitud no es válido."
                },
                400
            );
        }


        /* -----------------------------------------------------
           Obtener IDs
        ----------------------------------------------------- */

        const ids =
            Array.isArray(
                datos?.ids
            )
                ? [
                    ...new Set(
                        datos.ids
                            .map(
                                (id) =>
                                    convertirEntero(
                                        id,
                                        0
                                    )
                            )
                            .filter(
                                (id) =>
                                    id > 0
                            )
                    )
                ]
                : [];


        if (
            ids.length === 0
        ) {
            return crearRespuestaJson(
                {
                    success: false,

                    error:
                        "No se seleccionaron microdramas para eliminar."
                },
                400
            );
        }


        /* -----------------------------------------------------
           Crear placeholders seguros
        ----------------------------------------------------- */

        const placeholders =
            ids
                .map(
                    () => "?"
                )
                .join(", ");


        /* -----------------------------------------------------
           Eliminar
        ----------------------------------------------------- */

        const eliminacion =
            await database
                .prepare(`
                    DELETE FROM dramas
                    WHERE id IN (${placeholders})
                `)
                .bind(
                    ...ids
                )
                .run();


        if (
            !eliminacion.success
        ) {
            throw new Error(
                "Cloudflare D1 no confirmó la eliminación."
            );
        }


        return crearRespuestaJson(
            {
                success: true,

                message:
                    ids.length === 1
                        ? "Microdrama eliminado correctamente."
                        : "Microdramas eliminados correctamente.",

                deleted:
                    ids.length
            }
        );


    } catch (error) {

        console.error(
            "Error DELETE dramas:",
            error
        );


        return crearRespuestaJson(
            {
                success: false,

                error:
                    "No se pudieron eliminar los microdramas."
            },
            500
        );
    }
}
