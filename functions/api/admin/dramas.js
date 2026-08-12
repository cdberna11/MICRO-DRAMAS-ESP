function crearRespuestaJson(datos, estado = 200) {
  return Response.json(datos, {
    status: estado,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

export async function onRequestGet(context) {
  try {
    const database = context.env.DB;

    if (!database) {
      return crearRespuestaJson(
        {
          success: false,
          error: "El binding DB no está disponible."
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

    const dramas = Array.isArray(resultado.results)
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
        error: "No se pudieron obtener los dramas administrativos."
      },
      500
    );
  }
}
