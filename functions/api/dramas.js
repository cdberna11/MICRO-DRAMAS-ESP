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
          status: 500
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
        video_url,
        embed_url,
        featured,
        sort_order,
        created_at,
        updated_at
      FROM dramas
      WHERE status = 'published'
      ORDER BY
        featured DESC,
        sort_order ASC,
        id DESC
    `;

    const result = await database.prepare(query).all();

    return Response.json(
      {
        success: true,
        dramas: result.results
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, max-age=60"
        }
      }
    );
  } catch (error) {
    console.error("Error al consultar los dramas:", error);

    return Response.json(
      {
        success: false,
        error: "No se pudieron obtener los dramas."
      },
      {
        status: 500
      }
    );
  }
}
