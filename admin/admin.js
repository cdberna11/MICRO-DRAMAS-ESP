"use strict";


/* =========================================================
   CONFIGURACIÓN
   ========================================================= */

const API_ADMIN_DRAMAS = "/api/admin/dramas";


/* =========================================================
   INICIO
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {
        cargarDramasAdministrativos();
    }
);


/* =========================================================
   CARGAR MICRODRAMAS
   ========================================================= */

async function cargarDramasAdministrativos() {

    const elementos = obtenerElementos();

    if (!elementos) {
        return;
    }

    mostrarEstadoCarga(elementos);


    try {

        const respuesta = await fetch(
            API_ADMIN_DRAMAS,
            {
                method: "GET",

                credentials: "same-origin",

                headers: {
                    Accept: "application/json"
                },

                cache: "no-store"
            }
        );


        if (!respuesta.ok) {

            throw new Error(
                `La API respondió con el estado ${respuesta.status}.`
            );

        }


        const datos = await respuesta.json();


        if (
            !datos.success ||
            !Array.isArray(datos.dramas)
        ) {

            throw new Error(
                "La API administrativa devolvió una respuesta no válida."
            );

        }


        renderizarDramas(
            datos.dramas,
            elementos
        );


    } catch (error) {

        console.error(
            "Error al cargar los microdramas administrativos:",
            error
        );


        mostrarError(
            elementos,
            "No se pudieron cargar los microdramas. Recarga la página e inténtalo nuevamente."
        );

    }
}


/* =========================================================
   OBTENER ELEMENTOS DEL DOM
   ========================================================= */

function obtenerElementos() {

    const elementos = {

        estadoCarga:
            document.getElementById("estado-carga"),

        estadoVacio:
            document.getElementById("estado-vacio"),

        contenedorTabla:
            document.getElementById("contenedor-tabla"),

        listaDramas:
            document.getElementById("lista-dramas"),

        mensajeAdmin:
            document.getElementById("mensaje-admin")
    };


    const elementoFaltante =
        Object.entries(elementos).find(
            ([, elemento]) => !elemento
        );


    if (elementoFaltante) {

        console.error(
            `No se encontró el elemento administrativo: ${elementoFaltante[0]}.`
        );

        return null;
    }


    return elementos;
}


/* =========================================================
   ESTADO DE CARGA
   ========================================================= */

function mostrarEstadoCarga(elementos) {

    elementos.estadoCarga.hidden = false;

    elementos.estadoVacio.hidden = true;

    elementos.contenedorTabla.hidden = true;

    elementos.mensajeAdmin.hidden = true;

    elementos.listaDramas.replaceChildren();
}


/* =========================================================
   RENDERIZAR DRAMAS
   ========================================================= */

function renderizarDramas(
    dramas,
    elementos
) {

    elementos.estadoCarga.hidden = true;

    elementos.mensajeAdmin.hidden = true;

    elementos.listaDramas.replaceChildren();


    if (dramas.length === 0) {

        elementos.estadoVacio.hidden = false;

        elementos.contenedorTabla.hidden = true;

        return;
    }


    const fragmento =
        document.createDocumentFragment();


    dramas.forEach(
        (drama) => {

            fragmento.appendChild(
                crearFilaDrama(drama)
            );

        }
    );


    elementos.listaDramas.appendChild(
        fragmento
    );


    elementos.estadoVacio.hidden = true;

    elementos.contenedorTabla.hidden = false;
}


/* =========================================================
   CREAR FILA
   ========================================================= */

function crearFilaDrama(drama) {

    const fila =
        document.createElement("tr");


    fila.appendChild(
        crearCelda(
            normalizarTexto(
                drama.id,
                "—"
            )
        )
    );


    fila.appendChild(
        crearCeldaInformacionDrama(
            drama
        )
    );


    fila.appendChild(
        crearCelda(
            normalizarTexto(
                drama.platform,
                "—"
            )
        )
    );


    fila.appendChild(
        crearCeldaEstado(
            drama.status
        )
    );


    fila.appendChild(
        crearCeldaDestacado(
            drama.featured
        )
    );


    fila.appendChild(
        crearCelda(
            normalizarTexto(
                drama.sort_order,
                "0"
            )
        )
    );


    fila.appendChild(
        crearCelda(
            formatearFecha(
                drama.updated_at
            )
        )
    );


    fila.appendChild(
        crearCeldaAcciones()
    );


    return fila;
}


/* =========================================================
   CELDA SIMPLE
   ========================================================= */

function crearCelda(contenido) {

    const celda =
        document.createElement("td");


    celda.textContent = contenido;


    return celda;
}


/* =========================================================
   INFORMACIÓN DEL MICRODRAMA
   ========================================================= */

function crearCeldaInformacionDrama(
    drama
) {

    const celda =
        document.createElement("td");


    const contenedor =
        document.createElement("div");


    contenedor.className =
        "drama-info";


    const portada =
        document.createElement("img");


    portada.className =
        "drama-cover";


    portada.src =
        obtenerRutaPortada(
            drama.cover_url
        );


    portada.alt =
        `Portada de ${normalizarTexto(
            drama.title,
            "microdrama"
        )}`;


    portada.loading = "lazy";

    portada.width = 48;

    portada.height = 72;


    portada.addEventListener(
        "error",
        () => {

            portada.hidden = true;

        },
        {
            once: true
        }
    );


    const textos =
        document.createElement("div");


    const titulo =
        document.createElement("p");


    titulo.className =
        "drama-title";


    titulo.textContent =
        normalizarTexto(
            drama.title,
            "Sin título"
        );


    const slug =
        document.createElement("p");


    slug.className =
        "drama-slug";


    slug.textContent =
        normalizarTexto(
            drama.slug,
            "Sin slug"
        );


    slug.title =
        slug.textContent;


    textos.appendChild(
        titulo
    );


    textos.appendChild(
        slug
    );


    contenedor.appendChild(
        portada
    );


    contenedor.appendChild(
        textos
    );


    celda.appendChild(
        contenedor
    );


    return celda;
}


/* =========================================================
   ESTADO
   ========================================================= */

function crearCeldaEstado(
    estadoOriginal
) {

    const celda =
        document.createElement("td");


    const indicador =
        document.createElement("span");


    const estado =
        normalizarTexto(
            estadoOriginal,
            "draft"
        ).toLowerCase();


    indicador.className =
        "status-badge";


    if (estado === "published") {

        indicador.classList.add(
            "status-badge--published"
        );


        indicador.textContent =
            "Publicado";

    } else {

        indicador.classList.add(
            "status-badge--draft"
        );


        indicador.textContent =
            "Borrador";
    }


    celda.appendChild(
        indicador
    );


    return celda;
}


/* =========================================================
   DESTACADO
   ========================================================= */

function crearCeldaDestacado(
    valor
) {

    const celda =
        document.createElement("td");


    const indicador =
        document.createElement("span");


    const destacado =
        valor === true ||
        valor === 1 ||
        valor === "1";


    indicador.className =
        destacado
            ? "feature-value feature-value--yes"
            : "feature-value feature-value--no";


    indicador.textContent =
        destacado
            ? "Sí"
            : "No";


    celda.appendChild(
        indicador
    );


    return celda;
}


/* =========================================================
   ACCIONES
   ========================================================= */

function crearCeldaAcciones() {

    const celda =
        document.createElement("td");


    const mensaje =
        document.createElement("span");


    mensaje.className =
        "action-placeholder";


    mensaje.textContent =
        "Próximamente";


    mensaje.title =
        "Las acciones de edición se habilitarán próximamente.";


    celda.appendChild(
        mensaje
    );


    return celda;
}


/* =========================================================
   PORTADA
   ========================================================= */

function obtenerRutaPortada(
    coverUrl
) {

    const portada =
        normalizarTexto(
            coverUrl,
            ""
        ).trim();


    if (!portada) {
        return "";
    }


    return portada;
}


/* =========================================================
   NORMALIZAR TEXTO
   ========================================================= */

function normalizarTexto(
    valor,
    valorPorDefecto
) {

    if (
        valor === null ||
        valor === undefined ||
        valor === ""
    ) {

        return valorPorDefecto;
    }


    return String(valor);
}


/* =========================================================
   FECHA
   ========================================================= */

function formatearFecha(
    fechaOriginal
) {

    if (
        fechaOriginal === null ||
        fechaOriginal === undefined ||
        fechaOriginal === ""
    ) {

        return "—";
    }


    const fecha =
        new Date(fechaOriginal);


    if (
        Number.isNaN(
            fecha.getTime()
        )
    ) {

        return String(
            fechaOriginal
        );
    }


    return new Intl.DateTimeFormat(
        "es-PA",
        {
            dateStyle: "short",
            timeStyle: "short"
        }
    ).format(fecha);
}


/* =========================================================
   MOSTRAR ERROR
   ========================================================= */

function mostrarError(
    elementos,
    mensaje
) {

    elementos.estadoCarga.hidden = true;

    elementos.estadoVacio.hidden = true;

    elementos.contenedorTabla.hidden = true;


    elementos.mensajeAdmin.textContent =
        mensaje;


    elementos.mensajeAdmin.className =
        "admin-message admin-message--error";


    elementos.mensajeAdmin.hidden =
        false;
}
