/* =========================================================
   API ADMINISTRATIVA DE CATEGORÍAS
   MICRO-DRAMAS-ESP
========================================================= */


/* =========================================================
   RESPUESTA JSON
========================================================= */

function crearRespuestaJson(
    datos,
    estado = 200
) {

    return Response.json(
        datos,
        {
            status: estado,
            headers: {
                "Cache-Control": "no-store",
                "Content-Type":
                    "application/json; charset=utf-8"
            }
        }
    );

}


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


/* =========================================================
   GENERAR SLUG
========================================================= */

function generarSlug(
    nombre
) {

    return nombre
        .normalize("NFD")
        .replace(
            /[\u0300-\u036f]/g,
            ""
        )
        .toLowerCase()
        .trim()
        .replace(
            /[^a-z0-9]+/g,
            "-"
        )
        .replace(
            /^-+|-+$/g,
            "");

}


/* =========================================================
   VALIDAR NOMBRE
========================================================= */

function validarNombre(
    nombre
) {

    if (
        !nombre
    ) {

        return "El nombre de la categoría es obligatorio.";

    }


    if (
        nombre.length < 2
    ) {

        return "El nombre de la categoría es demasiado corto.";

    }


    if (
        nombre.length > 100
    ) {

        return "El nombre de la categoría no puede superar 100 caracteres.";

    }


    return null;

}


/* =========================================================
   CONVERTIR ENTERO
========================================================= */

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


/* =========================================================
   CONVERTIR ACTIVO
========================================================= */

function convertirActivo(
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


/* =========================================================
   GET
   LISTAR CATEGORÍAS
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
                        name,
                        slug,
                        sort_order,
                        active,
                        created_at
                    FROM categories
                    ORDER BY
                        sort_order ASC,
                        id ASC
                `)
                .all();


        const categories =
            Array.isArray(
                resultado.results
            )
                ? resultado.results.map(
                    categoria => ({
                        id:
                            Number(
                                categoria.id
                            ),

                        name:
                            String(
                                categoria.name
                            ),

                        slug:
                            String(
                                categoria.slug
                            ),

                        sort_order:
                            Number(
                                categoria.sort_order
                            ) || 0,

                        active:
                            Number(
                                categoria.active
                            ) === 1,

                        created_at:
                            categoria.created_at
                    })
                )
                : [];


        return crearRespuestaJson(
            {
                success: true,

                categories
            }
        );


    } catch (error) {

        console.error(
            "Error GET categories:",
            error
        );


        return crearRespuestaJson(
            {
                success: false,

                error:
                    "No se pudieron obtener las categorías."
            },
            500
        );

    }

}


/* =========================================================
   POST
   CREAR CATEGORÍA
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
           Content-Type
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
           JSON
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
           NOMBRE
        ----------------------------------------------------- */

        const nombre =
            limpiarTexto(
                datos?.name
            )
                .toUpperCase();


        const errorNombre =
            validarNombre(
                nombre
            );


        if (
            errorNombre
        ) {

            return crearRespuestaJson(
                {
                    success: false,

                    error:
                        errorNombre
                },
                400
            );

        }


        /* -----------------------------------------------------
           SLUG
        ----------------------------------------------------- */

        const slug =
            generarSlug(
                nombre
            );


        if (
            !slug
        ) {

            return crearRespuestaJson(
                {
                    success: false,

                    error:
                        "No se pudo generar un slug válido para la categoría."
                },
                400
            );

        }


        /* -----------------------------------------------------
           COMPROBAR NOMBRE DUPLICADO
        ----------------------------------------------------- */

        const nombreExistente =
            await database
                .prepare(`
                    SELECT
                        id
                    FROM categories
                    WHERE UPPER(name) = ?
                    LIMIT 1
                `)
                .bind(
                    nombre
                )
                .first();


        if (
            nombreExistente
        ) {

            return crearRespuestaJson(
                {
                    success: false,

                    error:
                        "Ya existe una categoría con ese nombre."
                },
                409
            );

        }


        /* -----------------------------------------------------
           COMPROBAR SLUG DUPLICADO
        ----------------------------------------------------- */

        const slugExistente =
            await database
                .prepare(`
                    SELECT
                        id
                    FROM categories
                    WHERE slug = ?
                    LIMIT 1
                `)
                .bind(
                    slug
                )
                .first();


        if (
            slugExistente
        ) {

            return crearRespuestaJson(
                {
                    success: false,

                    error:
                        "Ya existe una categoría con ese slug."
                },
                409
            );

        }


        /* -----------------------------------------------------
           SIGUIENTE ORDEN
        ----------------------------------------------------- */

        const ultimoOrden =
            await database
                .prepare(`
                    SELECT
                        COALESCE(
                            MAX(sort_order),
                            0
                        ) AS max_order
                    FROM categories
                `)
                .first();


        const siguienteOrden =
            (
                Number(
                    ultimoOrden?.max_order
                ) || 0
            ) + 1;


        /* -----------------------------------------------------
           INSERTAR
        ----------------------------------------------------- */

        const insercion =
            await database
                .prepare(`
                    INSERT INTO categories (
                        name,
                        slug,
                        sort_order,
                        active,
                        created_at
                    )
                    VALUES (
                        ?,
                        ?,
                        ?,
                        1,
                        CURRENT_TIMESTAMP
                    )
                `)
                .bind(
                    nombre,
                    slug,
                    siguienteOrden
                )
                .run();


        if (
            !insercion.success
        ) {

            throw new Error(
                "Cloudflare D1 no confirmó la creación de la categoría."
            );

        }


        return crearRespuestaJson(
            {
                success: true,

                message:
                    "Categoría creada correctamente.",

                id:
                    insercion.meta?.last_row_id,

                category: {
                    id:
                        insercion.meta?.last_row_id,

                    name:
                        nombre,

                    slug,

                    sort_order:
                        siguienteOrden,

                    active:
                        true
                }
            },
            201
        );


    } catch (error) {

        console.error(
            "Error POST categories:",
            error
        );


        return crearRespuestaJson(
            {
                success: false,

                error:
                    "No se pudo crear la categoría."
            },
            500
        );

    }

}


/* =========================================================
   PUT
   MODIFICAR CATEGORÍA
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
           Content-Type
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
           JSON
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
                        "El identificador de la categoría no es válido."
                },
                400
            );

        }


        /* -----------------------------------------------------
           COMPROBAR EXISTENCIA
        ----------------------------------------------------- */

        const existente =
            await database
                .prepare(`
                    SELECT
                        id,
                        name,
                        slug,
                        sort_order,
                        active
                    FROM categories
                    WHERE id = ?
                    LIMIT 1
                `)
                .bind(
                    id
                )
                .first();


        if (
            !existente
        ) {

            return crearRespuestaJson(
                {
                    success: false,

                    error:
                        "La categoría no existe."
                },
                404
            );

        }


        /* -----------------------------------------------------
           NOMBRE
           Si no se envía, conservamos el actual.
        ----------------------------------------------------- */

        const nombre =
            datos?.name !== undefined
                ? limpiarTexto(
                    datos.name
                ).toUpperCase()
                : String(
                    existente.name
                )
                    .trim()
                    .toUpperCase();


        const errorNombre =
            validarNombre(
                nombre
            );


        if (
            errorNombre
        ) {

            return crearRespuestaJson(
                {
                    success: false,

                    error:
                        errorNombre
                },
                400
            );

        }


        /* -----------------------------------------------------
           SLUG
        ----------------------------------------------------- */

        const slug =
            generarSlug(
                nombre
            );


        if (
            !slug
        ) {

            return crearRespuestaJson(
                {
                    success: false,

                    error:
                        "No se pudo generar un slug válido para la categoría."
                },
                400
            );

        }


        /* -----------------------------------------------------
           ORDEN
        ----------------------------------------------------- */

        const sortOrder =
            datos?.sort_order !== undefined
                ? Math.max(
                    1,
                    convertirEntero(
                        datos.sort_order,
                        existente.sort_order
                    )
                )
                : Number(
                    existente.sort_order
                ) || 1;


        /* -----------------------------------------------------
           ACTIVO
        ----------------------------------------------------- */

        const active =
            datos?.active !== undefined
                ? convertirActivo(
                    datos.active
                )
                : Number(
                    existente.active
                ) === 1
                    ? 1
                    : 0;


        /* -----------------------------------------------------
           NOMBRE DUPLICADO
        ----------------------------------------------------- */

        const nombreDuplicado =
            await database
                .prepare(`
                    SELECT
                        id
                    FROM categories
                    WHERE UPPER(name) = ?
                    AND id != ?
                    LIMIT 1
                `)
                .bind(
                    nombre,
                    id
                )
                .first();


        if (
            nombreDuplicado
        ) {

            return crearRespuestaJson(
                {
                    success: false,

                    error:
                        "Ya existe otra categoría con ese nombre."
                },
                409
            );

        }


        /* -----------------------------------------------------
           SLUG DUPLICADO
        ----------------------------------------------------- */

        const slugDuplicado =
            await database
                .prepare(`
                    SELECT
                        id
                    FROM categories
                    WHERE slug = ?
                    AND id != ?
                    LIMIT 1
                `)
                .bind(
                    slug,
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
                        "Ya existe otra categoría con ese slug."
                },
                409
            );

        }


        /* -----------------------------------------------------
           ACTUALIZAR
        ----------------------------------------------------- */

        const actualizacion =
            await database
                .prepare(`
                    UPDATE categories
                    SET
                        name = ?,
                        slug = ?,
                        sort_order = ?,
                        active = ?
                    WHERE id = ?
                `)
                .bind(
                    nombre,
                    slug,
                    sortOrder,
                    active,
                    id
                )
                .run();


        if (
            !actualizacion.success
        ) {

            throw new Error(
                "Cloudflare D1 no confirmó la actualización de la categoría."
            );

        }


        return crearRespuestaJson(
            {
                success: true,

                message:
                    "Categoría actualizada correctamente.",

                category: {
                    id,

                    name:
                        nombre,

                    slug,

                    sort_order:
                        sortOrder,

                    active:
                        active === 1
                }
            }
        );


    } catch (error) {

        console.error(
            "Error PUT categories:",
            error
        );


        return crearRespuestaJson(
            {
                success: false,

                error:
                    "No se pudo actualizar la categoría."
            },
            500
        );

    }

}
