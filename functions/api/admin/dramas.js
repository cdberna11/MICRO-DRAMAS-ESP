function crearRespuestaJson(datos, estado = 200) {
    return Response.json(datos, {
        status: estado,
        headers: {
            "Cache-Control": "no-store",
            "Content-Type": "application/json; charset=utf-8"
        }
    });
}


function limpiarTexto(valor) {
    return typeof valor === "string"
        ? valor.trim()
        : "";
}


function convertirEntero(valor, valorPredeterminado = 0) {
    const numero = Number.parseInt(valor, 10);

    return Number.isInteger(numero)
        ? numero
        : valorPredeterminado;
}


function esUrlHttpValida(valor) {
    if (!valor) {
        return true;
    }

    try {
        const url = new URL(valor);

        return (
            url.protocol === "http:" ||
            url.protocol === "https:"
        );

    } catch {
        return false;
    }
}


function esSlugValido(slug) {
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}


function normalizarDrama(datos) {
    return {
        slug: limpiarTexto(datos.slug).toLowerCase(),

        title: limpiarTexto(datos.title),

        platform: limpiarTexto(datos.platform),

        description: limpiarTexto(
            datos.description
        ),

        video_description: limpiarTexto(
            datos.video_description
        ),

        cover_url: limpiarTexto(
            datos.cover_url
        ),

        video_url: limpiarTexto(
            datos.video_url
        ),

        embed_url: limpiarTexto(
            datos.embed_url
        ),

        status:
            limpiarTexto(datos.status).toLowerCase() ||
            "draft",

        featured:
            convertirEntero(
                datos.featured,
                0
            ) === 1
                ? 1
                : 0,

        sort_order: Math.max(
            0,
            convertirEntero(
                datos.sort_order,
                0
            )
        )
    };
}


function validarDrama(drama) {
    const errores = [];


    // Título
    if (!drama.title) {
        errores.push(
            "El título es obligatorio."
        );
    }


    if (drama.title.length > 200) {
        errores.push(
            "El título no puede superar 200 caracteres."
        );
    }


    // Slug
    if (!drama.slug) {

        errores.push(
            "El slug es obligatorio."
        );

    } else if (!esSlugValido(drama.slug)) {

        errores.push(
            "El slug solamente puede contener letras minúsculas, números y guiones."
        );
    }


    if (drama.slug.length > 200) {
        errores.push(
            "El slug no puede superar 200 caracteres."
        );
    }


    // Plataforma
    if (!drama.platform) {
        errores.push(
            "La plataforma es obligatoria."
        );
    }


    // Estado
    if (
        !["draft", "published"].includes(
            drama.status
        )
    ) {
        errores.push(
            "El estado debe ser draft o published."
        );
    }


    // URLs
    const urls = [
        [
            "La URL de portada",
            drama.cover_url
        ],
        [
            "La URL del video",
            drama.video_url
        ],
        [
            "La URL de inserción",
            drama.embed_url
        ]
    ];


    for (const [nombre, valor] of urls) {

        if (!esUrlHttpValida(valor)) {

            errores.push(
                `${nombre} debe comenzar con http:// o https://.`
            );
        }
    }


    return errores;
}


/* =========================================================
   GET /api/admin/dramas
   ========================================================= */

export async function onRequestGet(context) {

    try {

        const database = context.env.DB;


        if (!database) {

            return crearRespuestaJson(
                {
                    success: false,
                    error:
                        "El binding DB no está disponible."
                },
                500
            );
        }


        const consulta = `
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
        `;


        const resultado = await database
            .prepare(consulta)
            .all();


        const dramas = Array.isArray(
            resultado.results
        )
            ? resultado.results
            : [];


        return crearRespuestaJson({
            success: true,
            dramas
        });


    } catch (error) {

        console.error(
            "Error al consultar los dramas administrativos:",
            error
        );


        return crearRespuestaJson(
            {
                success: false,
                error:
                    "No se pudieron obtener los dramas administrativos."
            },
            500
        );
    }
}


/* =========================================================
   POST /api/admin/dramas
   ========================================================= */

export async function onRequestPost(context) {

    try {

        const database = context.env.DB;


        if (!database) {

            return crearRespuestaJson(
                {
                    success: false,
                    error:
                        "El binding DB no está disponible."
                },
                500
            );
        }


        /* ---------------------------------------------------
           Verificar Content-Type
        --------------------------------------------------- */

        const contentType =
            context.request.headers.get(
                "content-type"
            ) || "";


        if (
            !contentType
                .toLowerCase()
                .includes("application/json")
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


        /* ---------------------------------------------------
           Leer JSON
        --------------------------------------------------- */

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


        /* ---------------------------------------------------
           Validar estructura del cuerpo
        --------------------------------------------------- */

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


        /* ---------------------------------------------------
           Normalizar
        --------------------------------------------------- */

        const drama =
            normalizarDrama(datos);


        /* ---------------------------------------------------
           Validar
        --------------------------------------------------- */

        const errores =
            validarDrama(drama);


        if (errores.length > 0) {

            return crearRespuestaJson(
                {
                    success: false,
                    error: errores[0],
                    errors: errores
                },
                400
            );
        }


        /* ---------------------------------------------------
           Comprobar slug duplicado
        --------------------------------------------------- */

        const existente =
            await database
                .prepare(`
                    SELECT id
                    FROM dramas
                    WHERE slug = ?
                    LIMIT 1
                `)
                .bind(drama.slug)
                .first();


        if (existente) {

            return crearRespuestaJson(
                {
                    success: false,
                    error:
                        "Ya existe un microdrama con ese slug."
                },
                409
            );
        }


        /* ---------------------------------------------------
           Insertar registro en D1
        --------------------------------------------------- */

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
                        ?,
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
                    drama.video_url,
                    drama.embed_url,
                    drama.status,
                    drama.featured,
                    drama.sort_order
                )
                .run();


        /* ---------------------------------------------------
           Confirmar inserción
        --------------------------------------------------- */

        if (!insercion.success) {

            throw new Error(
                "Cloudflare D1 no confirmó la inserción."
            );
        }


        /* ---------------------------------------------------
           Obtener ID creado
        --------------------------------------------------- */

        const idCreado =
            insercion.meta?.last_row_id;


        if (
            idCreado === undefined ||
            idCreado === null
        ) {

            throw new Error(
                "D1 no devolvió el identificador del registro."
            );
        }


        /* ---------------------------------------------------
           Obtener registro recién creado
        --------------------------------------------------- */

        const nuevoDrama =
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
                    WHERE id = ?
                    LIMIT 1
                `)
                .bind(idCreado)
                .first();


        /* ---------------------------------------------------
           Respuesta
        --------------------------------------------------- */

        return crearRespuestaJson(
            {
                success: true,
                message:
                    "Microdrama creado correctamente.",
                drama: nuevoDrama
            },
            201
        );


    } catch (error) {

        console.error(
            "Error al crear el microdrama:",
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
