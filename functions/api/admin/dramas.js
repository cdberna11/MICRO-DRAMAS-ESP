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

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function esSlugValido(slug) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

function normali*arDrama(datos) {
  return {
    sl*g: limpiarTexto(datos.slug).toLowe*Case(),
    title: limpiarTexto(da*os.title),
    platform: limpiarTe*to(datos.platform),
    descriptio*: limpiarTexto(datos.description),*    video_description: limpiarText*(datos.video_description),
    cov*r_url: limpiarTexto(datos.cover_ur*),
    video_url: limpiarTexto(dat*s.video_url),
    embed_url: limpi*rTexto(datos.embed_url),
    statu*: limpiarTexto(datos.status).toLow*rCase() || "draft",
    featured: *onvertirEntero(datos.featured, 0) *== 1 ? 1 : 0,
    sort_order: Math*max(0, convertirEntero(datos.sort_*rder, 0))
  };
}

function validar*rama(drama) {
  const errores = []*

  if (!drama.title) {
    errore*.push("El título es obligatorio.")*
  }

  if (drama.title.length > 2*0) {
    errores.push("El título n* puede superar 200 caracteres.");
* }

  if (!drama.slug) {
    error*s.push("El slug es obligatorio.");*  } else if (!esSlugValido(drama.s*ug)) {
    errores.push(
      "El*slug solamente puede contener letr*s minúsculas, números y guiones."
*   );
  }

  if (drama.slug.length*> 200) {
    errores.push("El slug*no puede superar 200 caracteres.")*
  }

  if (!drama.platform) {
   *errores.push("La plataforma es obl*gatoria.");
  }

  if (!["draft", "published"].includes(drama.status)* {
    errores.push("El estado deb* ser draft o published.");
  }

  *onst urls = [
    ["La URL de portada", drama.cover_url],
    ["La URL del video", drama.video_url],
    ["La URL de inserción", drama.embed_url]
  ];

  for (const [nombre, valor] of urls) {
    if (!esUrlHtt*Valida(valor)) {
      errores.pus*(`${nombre} debe comenzar con http*// o https://.`);
    }
  }

  ret*rn errores;
}

export async functi*n onRequestGet(context) {
  try {
*   const database = context.env.DB*

    if (!database) {
      retur* crearRespuestaJson(
        {
   *      success: false,
          er*or: "El binding DB no está disponi*le."
        },
        500
      *;
    }

    const consulta = `
  *   SELECT
        id,
        slug*
        title,
        platform,
*       description,
        video_*escription,
        cover_url,
   *    video_url,
        embed_url,
*       status,
        featured,
 *      sort_order,
        created_*t,
        updated_at
      FROM d*amas
      ORDER BY
        featur*d DESC,
        sort_order ASC,
  *     id DESC
    `;

    const res*ltado = await database
      .prep*re(consulta)
      .all();

    co*st dramas = Array.isArray(resultad*.results)
      ? resultado.result*
      : [];

    return crearResp*estaJson({
      success: true,
  *   dramas
    });
  } catch (error* {
    console.error(
      "Error*al consultar los dramas administra*ivos:",
      error
    );

    re*urn crearRespuestaJson(
      {
  *     success: false,
        error* "No se pudieron obtener los drama* administrativos."
      },
      *00
    );
  }
}

export async func*ion onRequestPost(context) {
  try*{
    const database = context.env*DB;

    if (!database) {
      re*urn crearRespuestaJson(
        {
*         success: false,
         *error: "El binding DB no está disp*nible."
        },
        500
   *  );
    }

    const contentType * context.request.headers.get("cont*nt-type") || "";

    if (!content*ype.toLowerCase().includes("applic*tion/json")) {
      return crearR*spuestaJson(
        {
          s*ccess: false,
          error: "La*solicitud debe utilizar applicatio*/json."
        },
        415
   *  );
    }

    let datos;

    tr* {
      datos = await context.req*est.json();
    } catch {
      re*urn crearRespuestaJson(
        {
*         success: false,
         *error: "El cuerpo JSON de la solic*tud no es válido."
        },
    *   400
      );
    }

    if (!da*os || typeof datos !== "object" ||*Array.isArray(datos)) {
      retu*n crearRespuestaJson(
        {
  *       success: false,
          e*ror: "Los datos enviados no son vá*idos."
        },
        400
    * );
    }

    const drama = norma*izarDrama(datos);
    const errore* = validarDrama(drama);

    if (e*rores.length > 0) {
      return c*earRespuestaJson(
        {
      *   success: false,
          error* errores[0],
          errors: err*res
        },
        400
      )*
    }

    const existente = awai* database
      .prepare(
        *
          SELECT id
          FRO* dramas
          WHERE slug = ?
 *        LIMIT 1
        `
      )
*     .bind(drama.slug)
      .firs*();

    if (existente) {
      re*urn crearRespuestaJson(
        {
*         success: false,
         *error: "Ya existe un microdrama co* ese slug."
        },
        409*      );
    }

    const insercio* = await database
      .prepare(
*       `
          INSERT INTO dra*as (
            slug,
           *title,
            platform,
     *      description,
            vid*o_description,
            cover_u*l,
            video_url,
        *   embed_url,
            status,
*           featured,
            s*rt_order,
            created_at,
*           updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `
      )
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

    if (!insercion.success) {
      throw new Error("Cloudflare D1 no confirmó la inserción.");
    }

    const idCreado = insercion.meta?.last_row_id;

    if (!idCreado) {
      throw new Error("D1 no devolvió el identificador del registro.");
    }

    const nuevoDrama = await database
      .prepare(
        `
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
        `
      )
      .bind(idCreado)
      .first();

    return crearRespuestaJson(
      {
        success: true,
        message: "Microdrama creado correctamente.",
        drama: nuevoDrama
      },
      201
    );
  } catch (error) {
    console.error(
      "Error al crear el microdrama:",
      error
    );

    const mensaje = String(error?.message || "");

    if (
      mensaje.includes("UNIQUE constraint failed") ||
      mensaje.includes("dramas.slug")
    ) {
      return crearRespuestaJson(
        {
          success: false,
          error: "Ya existe un microdrama con ese slug."
        },
        409
      );
    }

    return crearRespuestaJson(
      {
        success: false,
        error: "No se pudo crear el microdrama."
      },
      500
    );
  }
}
