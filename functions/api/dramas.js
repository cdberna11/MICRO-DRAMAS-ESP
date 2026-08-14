export async function onRequestGet(context) {
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
            "Cache-Control": "no-store",
            "Content-Type": "application/json; charset=utf-8"
          }
        }
      );
    }

    const query = `
      SELECT
        id,
        slug,
        title,
        platform,
        description,
        video_description,
        cover_url,
        views,

        /* -----------------------------------------------
           DATOS DEL BLOQUE SEMANAL
           ----------------------------------------------- */

        top_period_start,
        top_period_views,

        /*
         * Reproducciones NUEVAS del bloque semanal.
         *
         * views:
         *     total histórico.
         *
         * top_period_views:
         *     total acumulado al comenzar
         *     el bloque semanal actual.
         *
         * Por lo tanto:
         *
         * period_views =
         *     views - top_period_views
         *
         * Ejemplo:
         *
         * views = 8
         * top_period_views = 3
         *
         * period_views = 5
         *
         * => TOP
         */

        CASE
          WHEN top_period_views IS NULL THEN 0
          WHEN views - top_period_views < 0 THEN 0
          ELSE views - top_period_views
        END AS period_views,

        video_url,
        status,
        featured,
        sort_order,
        created_at,
        updated_at,
        published_at

      FROM dramas

      WHERE status IN ('published', 'draft')

      ORDER BY
        featured DESC,
        sort_order ASC,
        id DESC
    `;

    const result =
      await database
        .prepare(query)
        .all();

    return Response.json(
      {
        success: true,

        dramas:
          Array.isArray(result.results)
            ? result.results
            : []
      },
      {
        status: 200,

        headers: {
          "Cache-Control": "no-store",
          "Content-Type":
            "application/json; charset=utf-8"
        }
      }
    );

  } catch (error) {

    console.error(
      "Error al consultar los dramas:",
      error
    );

    return Response.json(
      {
        success: false,
        error:
          "No se pudieron obtener los dramas."
      },
      {
        status: 500,

        headers: {
          "Cache-Control": "no-store",
          "Content-Type":
            "application/json; charset=utf-8"
        }
      }
    );
  }
}
