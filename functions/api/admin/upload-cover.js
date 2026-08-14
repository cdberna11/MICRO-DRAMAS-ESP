/* =========================================================
   API ADMINISTRATIVA DE PORTADAS
   MICRO-DRAMAS-ESP

   Recibe una imagen desde el panel administrativo y la guarda
   directamente en GitHub dentro de:

       /portadas/{plataforma}/{slug}.{extension}

   Variables/Secrets de Cloudflare:

       GITHUB_TOKEN
       GITHUB_REPOSITORY       (opcional; por defecto
                                cdberna11/MICRO-DRAMAS-ESP)
       GITHUB_COVERS_BRANCH    (opcional; por defecto main)
       GITHUB_COVERS_ROOT      (opcional; por defecto portadas)
========================================================= */

function respuestaJson(
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


function limpiarTexto(valor) {

    return typeof valor === "string"
        ? valor.trim()
        : "";
}


function normalizarSegmento(valor) {

    return limpiarTexto(valor)
        .normalize("NFD")
        .replace(
            /[\u0300-\u036f]/g,
            ""
        )
        .toLowerCase()
        .replace(
            /[^a-z0-9]+/g,
            "-"
        )
        .replace(
            /^-+|-+$/g,
            "");
}


function extensionImagen(nombre) {

    const nombreLimpio =
        limpiarTexto(nombre)
            .toLowerCase();

    const coincidencia =
        nombreLimpio.match(
            /\.(jpg|jpeg|png|webp|gif)$/
        );

    return coincidencia
        ? coincidencia[1] === "jpeg"
            ? "jpg"
            : coincidencia[1]
        : "";
}


function tipoImagenValido(tipo) {

    return [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif"
    ].includes(
        String(tipo || "")
            .toLowerCase()
    );
}


function bytesABase64(bytes) {

    const tamanoBloque = 0x8000;
    let resultado = "";

    for (
        let posicion = 0;
        posicion < bytes.length;
        posicion += tamanoBloque
    ) {

        const bloque =
            bytes.subarray(
                posicion,
                Math.min(
                    posicion + tamanoBloque,
                    bytes.length
                )
            );

        resultado += String.fromCharCode(
            ...bloque
        );
    }

    return btoa(resultado);
}


async function obtenerArchivoExistente(
    url,
    token,
    branch
) {

    const respuesta =
        await fetch(
            `${url}?ref=${encodeURIComponent(branch)}`,
            {
                method: "GET",
                headers: {
                    "Accept":
                        "application/vnd.github+json",
                    "Authorization":
                        `Bearer ${token}`,
                    "X-GitHub-Api-Version":
                        "2022-11-28",
                    "User-Agent":
                        "MICRO-DRAMAS-ESP"
                }
            }
        );

    if (
        respuesta.status === 404
    ) {
        return null;
    }

    if (!respuesta.ok) {

        const texto =
            await respuesta.text();

        throw new Error(
            `GitHub no pudo consultar la portada existente (${respuesta.status}). ${texto.slice(0, 300)}`
        );
    }

    return await respuesta.json();
}


export async function onRequestPost(context) {

    try {

        const token =
            context.env.GITHUB_TOKEN;

        if (!token) {

            return respuestaJson(
                {
                    success: false,
                    error:
                        "Falta configurar el secret GITHUB_TOKEN en Cloudflare."
                },
                500
            );
        }


        const contentType =
            context.request.headers.get(
                "content-type"
            ) || "";

        if (!contentType
            .toLowerCase()
            .includes("multipart/form-data")) {

            return respuestaJson(
                {
                    success: false,
                    error:
                        "La portada debe enviarse como multipart/form-data."
                },
                415
            );
        }


        const formulario =
            await context.request.formData();

        const archivo =
            formulario.get("file");

        const plataforma =
            limpiarTexto(
                formulario.get("platform")
            );

        const slug =
            normalizarSegmento(
                formulario.get("slug")
            );

        const titulo =
            limpiarTexto(
                formulario.get("title")
            );


        if (!(archivo instanceof File)) {

            return respuestaJson(
                {
                    success: false,
                    error:
                        "No se recibió ninguna imagen."
                },
                400
            );
        }


        if (!tipoImagenValido(archivo.type)) {

            return respuestaJson(
                {
                    success: false,
                    error:
                        "Formato no permitido. Usa JPG, PNG, WEBP o GIF."
                },
                400
            );
        }


        const maximoBytes =
            10 * 1024 * 1024;

        if (archivo.size <= 0 || archivo.size > maximoBytes) {

            return respuestaJson(
                {
                    success: false,
                    error:
                        "La imagen debe pesar más de 0 bytes y no superar 10 MB."
                },
                400
            );
        }


        if (!plataforma) {

            return respuestaJson(
                {
                    success: false,
                    error:
                        "La plataforma de la portada es obligatoria."
                },
                400
            );
        }


        if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {

            return respuestaJson(
                {
                    success: false,
                    error:
                        "El slug del microdrama no es válido."
                },
                400
            );
        }


        const carpetaPlataforma =
            normalizarSegmento(
                plataforma
            );

        if (!carpetaPlataforma) {

            return respuestaJson(
                {
                    success: false,
                    error:
                        "No se pudo determinar la carpeta de la plataforma."
                },
                400
            );
        }


        const extension =
            extensionImagen(
                archivo.name
            );

        if (!extension) {

            return respuestaJson(
                {
                    success: false,
                    error:
                        "No se pudo determinar la extensión de la imagen."
                },
                400
            );
        }


        const repository =
            limpiarTexto(
                context.env.GITHUB_REPOSITORY
            ) ||
            "cdberna11/MICRO-DRAMAS-ESP";

        const branch =
            limpiarTexto(
                context.env.GITHUB_COVERS_BRANCH
            ) ||
            "main";

        const root =
            limpiarTexto(
                context.env.GITHUB_COVERS_ROOT
            ) ||
            "portadas";


        if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {

            return respuestaJson(
                {
                    success: false,
                    error:
                        "GITHUB_REPOSITORY no tiene un formato válido."
                },
                500
            );
        }


        const ruta =
            `${root}/${carpetaPlataforma}/${slug}.${extension}`;

        const apiUrl =
            `https://api.github.com/repos/${repository}/contents/${ruta}`;


        const bytes =
            new Uint8Array(
                await archivo.arrayBuffer()
            );

        const contenidoBase64 =
            bytesABase64(bytes);


        const existente =
            await obtenerArchivoExistente(
                apiUrl,
                token,
                branch
            );


        const cuerpo = {
            message:
                existente
                    ? `Actualiza portada: ${titulo || slug}`
                    : `Agrega portada: ${titulo || slug}`,

            content:
                contenidoBase64,

            branch
        };


        if (
            existente?.sha
        ) {
            cuerpo.sha =
                existente.sha;
        }


        const subida =
            await fetch(
                apiUrl,
                {
                    method: "PUT",

                    headers: {
                        "Accept":
                            "application/vnd.github+json",

                        "Authorization":
                            `Bearer ${token}`,

                        "X-GitHub-Api-Version":
                            "2022-11-28",

                        "Content-Type":
                            "application/json",

                        "User-Agent":
                            "MICRO-DRAMAS-ESP"
                    },

                    body:
                        JSON.stringify(
                            cuerpo
                        )
                }
            );


        const resultadoGitHub =
            await subida.json();


        if (!subida.ok) {

            console.error(
                "GitHub upload cover error:",
                resultadoGitHub
            );

            return respuestaJson(
                {
                    success: false,
                    error:
                        `GitHub rechazó la portada (${subida.status}).`
                },
                502
            );
        }


        const rutaPublica =
            `/${ruta}`;


        return respuestaJson(
            {
                success: true,

                message:
                    existente
                        ? "Portada actualizada correctamente."
                        : "Portada subida correctamente.",

                path:
                    rutaPublica,

                platform:
                    plataforma,

                filename:
                    `${slug}.${extension}`,

                branch
            },
            200
        );


    } catch (error) {

        console.error(
            "Error en upload-cover:",
            error
        );

        return respuestaJson(
            {
                success: false,
                error:
                    error?.message ||
                    "No se pudo subir la portada."
            },
            500
        );
    }
}
