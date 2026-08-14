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
        video_url,
        status,
        featured,
        sort_order,
        created_at,
        updated_at,
        published_at,
        top_period_start,
        top_period_views,
        categories
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

    const dramas =
      Array.isArray(result.results)
        ? result.results.map(
            drama => {

              const views =
                Number(
                  drama.views
                ) || 0;

              const topPeriodViews =
                Number(
                  drama.top_period_views
                ) || 0;

              let periodViews = 0;


              /* =================================================
                 CALCULAR BLOQUE SEMANAL
              ================================================= */

              if (
                typeof drama.top_period_start ===
                  "string" &&
                drama.top_period_start.trim() !==
                  ""
              ) {

                const valor =
                  drama.top_period_start
                    .trim()
                    .replace(
                      " ",
                      "T"
                    );


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

                  const diferencia =
                    Date.now() -
                    fecha.getTime();


                  const UNA_SEMANA =
                    7 *
                    24 *
                    60 *
                    60 *
                    1000;


                  if (
                    diferencia >= 0 &&
                    diferencia <
                      UNA_SEMANA
                  ) {

                    periodViews =
                      Math.max(
                        0,
                        views -
                          topPeriodViews
                      );

                  }

                }

              }


              /* =================================================
                 CATEGORÍAS
                 -------------------------------------------------
                 D1 guarda las categorías como JSON TEXT:

                 ["SUPERACION","VENGANZA"]

                 Convertimos ese texto en un array real
                 para que el administrador y el portal puedan
                 utilizarlo directamente.
              ================================================= */

              let categories = [];


              if (
                typeof drama.categories ===
                  "string" &&
                drama.categories.trim() !==
                  ""
              ) {

                try {

                  const categoriasParseadas =
                    JSON.parse(
                      drama.categories
                    );


                  if (
                    Array.isArray(
                      categoriasParseadas
                    )
                  ) {

                    categories =
                      categoriasParseadas;

                  }

                } catch {

                  categories = [];

                }

              }


              return {
                ...drama,

                views,

                top_period_views:
                  topPeriodViews,

                period_views:
                  periodViews,

                categories

              };

            }
          )
        : [];


    return Response.json(
      {
        success: true,
        dramas
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
