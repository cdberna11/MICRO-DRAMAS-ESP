/* =========================================================
   API PÚBLICA DE CATEGORÍAS
   MICRO-DRAMAS-ESP

   Ruta:
   /api/categories_public
========================================================= */

export async function onRequestGet(context) {

    try {

        const database =
            context.env.DB;


        /* =====================================================
           VERIFICAR D1
        ===================================================== */

        if (!database) {

            return Response.json(
                {
                    success: false,
                    error:
                        "El binding DB no está disponible."
                },
                {
                    status: 500,
                    headers: {
                        "Cache-Control":
                            "no-store",
                        "Content-Type":
                            "application/json; charset=utf-8"
                    }
                }
            );

        }


        /* =====================================================
           OBTENER CATEGORÍAS ACTIVAS
        ===================================================== */

        const resultadoCategorias =
            await database
                .prepare(`
                    SELECT
                        id,
                        name,
                        slug,
                        sort_order
                    FROM categories
                    WHERE active = 1
                    ORDER BY
                        sort_order ASC,
                        id ASC
                `)
                .all();


        const categorias =
            Array.isArray(
                resultadoCategorias.results
            )
                ? resultadoCategorias.results.map(
                    categoria => ({

                        id:
                            Number(
                                categoria.id
                            ),

                        name:
                            String(
                                categoria.name || ""
                            )
                                .trim()
                                .toUpperCase(),

                        slug:
                            String(
                                categoria.slug || ""
                            )
                                .trim()
                                .toLowerCase(),

                        sort_order:
                            Number(
                                categoria.sort_order
                            ) || 0,

                        drama_ids:
                            []

                    })
                )
                : [];


        /* =====================================================
           OBTENER MICRODRAMAS PUBLICADOS

           IMPORTANTE:
           Solo consultamos publicados porque esta API
           será utilizada por la cartelera pública.
        ===================================================== */

        const resultadoDramas =
            await database
                .prepare(`
                    SELECT
                        id,
                        categories
                    FROM dramas
                    WHERE status = 'published'
                `)
                .all();


        const dramas =
            Array.isArray(
                resultadoDramas.results
            )
                ? resultadoDramas.results
                : [];


        /* =====================================================
           RELACIONAR DRAMAS CON CATEGORÍAS
        ===================================================== */

        dramas.forEach(
            drama => {

                let categoriasDrama =
                    [];


                /* ---------------------------------------------
                   Leer JSON almacenado en dramas.categories
                --------------------------------------------- */

                if (
                    typeof drama.categories ===
                        "string" &&
                    drama.categories.trim() !==
                        ""
                ) {

                    try {

                        const valor =
                            JSON.parse(
                                drama.categories
                            );


                        if (
                            Array.isArray(
                                valor
                            )
                        ) {

                            categoriasDrama =
                                valor
                                    .map(
                                        categoria =>
                                            String(
                                                categoria
                                            )
                                                .trim()
                                                .toUpperCase()
                                    )
                                    .filter(
                                        Boolean
                                    );

                        }

                    } catch (error) {

                        console.warn(
                            `Categorías inválidas para el drama ${drama.id}:`,
                            error
                        );

                        categoriasDrama =
                            [];

                    }

                }


                /* ---------------------------------------------
                   Relacionar con la categoría correspondiente
                --------------------------------------------- */

                categoriasDrama.forEach(
                    nombreCategoria => {

                        const categoria =
                            categorias.find(
                                elemento =>
                                    elemento.name ===
                                    nombreCategoria
                            );


                        if (
                            !categoria
                        ) {

                            return;

                        }


                        const dramaId =
                            Number(
                                drama.id
                            );


                        if (
                            !categoria.drama_ids.includes(
                                dramaId
                            )
                        ) {

                            categoria.drama_ids.push(
                                dramaId
                            );

                        }

                    }
                );

            }
        );


        /* =====================================================
           AGREGAR CANTIDAD DE DRAMAS
        ===================================================== */

        categorias.forEach(
            categoria => {

                categoria.drama_count =
                    categoria.drama_ids.length;

            }
        );


        /* =====================================================
           RESPUESTA
        ===================================================== */

        return Response.json(
            {
                success: true,
                categories:
                    categorias
            },
            {
                status: 200,
                headers: {
                    "Cache-Control":
                        "no-store",
                    "Content-Type":
                        "application/json; charset=utf-8"
                }
            }
        );


    } catch (error) {

        console.error(
            "Error al consultar categorías públicas:",
            error
        );


        return Response.json(
            {
                success: false,
                error:
                    "No se pudieron obtener las categorías."
            },
            {
                status: 500,
                headers: {
                    "Cache-Control":
                        "no-store",
                    "Content-Type":
                        "application/json; charset=utf-8"
                }
            }
        );

    }

}
