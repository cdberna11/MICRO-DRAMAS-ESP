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

        inicializarFormularioNuevoDrama();

        cargarDramasAdministrativos();

    }
);


/* =========================================================
   FORMULARIO NUEVO MICRODRAMA
   ========================================================= */

function inicializarFormularioNuevoDrama() {

    const botonNuevo =
        document.getElementById("boton-nuevo");

    const formularioContenedor =
        document.getElementById("formulario-nuevo");

    const formulario =
        document.getElementById("form-nuevo-drama");

    const botonCancelar =
        document.getElementById("boton-cancelar");


    if (
        !botonNuevo ||
        !formularioContenedor ||
        !formulario ||
        !botonCancelar
    ) {

        console.error(
            "No se pudieron inicializar los controles del formulario de nuevo microdrama."
        );

        return;
    }


    /* -----------------------------------------------------
       ABRIR FORMULARIO
       ----------------------------------------------------- */

    botonNuevo.addEventListener(
        "click",
        () => {

            formularioContenedor.hidden = false;

            botonNuevo.disabled = true;


            const campoTitulo =
                document.getElementById("title");


            if (campoTitulo) {

                campoTitulo.focus();

            }
        }
    );


    /* -----------------------------------------------------
       CANCELAR
       ----------------------------------------------------- */

    botonCancelar.addEventListener(
        "click",
        () => {

            cerrarFormularioNuevoDrama();

        }
    );


    /* -----------------------------------------------------
       GUARDAR
       ----------------------------------------------------- */

    formulario.addEventListener(
        "submit",
        async (evento) => {

            evento.preventDefault();

            await guardarNuevoDrama(
                formulario,
                botonNuevo
            );

        }
    );
}


/* =========================================================
   CERRAR FORMULARIO NUEVO MICRODRAMA
   ========================================================= */

function cerrarFormularioNuevoDrama() {

    const formularioContenedor =
        document.getElementById("formulario-nuevo");

    const formulario =
        document.getElementById("form-nuevo-drama");

    const botonNuevo =
        document.getElementById("boton-nuevo");


    if (formulario) {

        formulario.reset();

    }


    const orden =
        document.getElementById("sort_order");


    if (orden) {

        orden.value = "1";

    }


    if (formularioContenedor) {

        formularioContenedor.hidden = true;

    }


    if (botonNuevo) {

        botonNuevo.disabled = false;

    }
}


/* =========================================================
   GUARDAR NUEVO MICRODRAMA
   ========================================================= */

async function guardarNuevoDrama(
    formulario,
    botonNuevo
) {

    const botonGuardar =
        document.getElementById("boton-guardar");


    if (!botonGuardar) {

        console.error(
            "No se encontró el botón Guardar microdrama."
        );

        return;
    }


    /* -----------------------------------------------------
       VALIDACIÓN HTML
       ----------------------------------------------------- */

    if (!formulario.checkValidity()) {

        formulario.reportValidity();

        return;
    }


    /* -----------------------------------------------------
       OBTENER DATOS
       ----------------------------------------------------- */

    const datosFormulario =
        new FormData(formulario);


    const datos = {

        title:
            String(
                datosFormulario.get("title") || ""
            ).trim(),

        slug:
            String(
                datosFormulario.get("slug") || ""
            ).trim(),

        platform:
            String(
                datosFormulario.get("platform") || ""
            ).trim(),

        description:
            String(
                datosFormulario.get("description") || ""
            ).trim(),

        video_description:
            String(
                datosFormulario.get("video_description") || ""
            ).trim(),

        cover_url:
            String(
                datosFormulario.get("cover_url") || ""
            ).trim(),

        video_url:
            String(
                datosFormulario.get("video_url") || ""
            ).trim(),

        embed_url:
            String(
                datosFormulario.get("embed_url") || ""
            ).trim(),

        status:
            String(
                datosFormulario.get("status") || "draft"
            ).trim(),

        featured:
            datosFormulario.has("featured"),

        sort_order:
            Number(
                datosFormulario.get("sort_order") || 0
            )

    };


    /* -----------------------------------------------------
       ESTADO DEL BOTÓN
       ----------------------------------------------------- */

    botonGuardar.disabled = true;

    botonGuardar.textContent =
        "Guardando...";


    try {

        /* -------------------------------------------------
           PETICIÓN POST
           ------------------------------------------------- */

        const respuesta =
            await fetch(
                API_ADMIN_DRAMAS,
                {
                    method: "POST",

                    credentials: "same-origin",

                    headers: {
                        "Content-Type":
                            "application/json",

                        "Accept":
                            "application/json"
                    },

                    body:
                        JSON.stringify(datos)
                }
            );


        /* -------------------------------------------------
           LEER RESPUESTA
           ------------------------------------------------- */

        let resultado = null;


        try {

            resultado =
                await respuesta.json();

        } catch (error) {

            resultado = null;

        }


        /* -------------------------------------------------
           ERROR HTTP
           ------------------------------------------------- */

        if (!respuesta.ok) {

            const mensaje =
                resultado &&
                typeof resultado.error === "string"

                    ? resultado.error

                    : `La API respondió con el estado ${respuesta.status}.`;


            throw new Error(
                mensaje
            );
        }


        /* -------------------------------------------------
           VALIDAR RESPUESTA API
           ------------------------------------------------- */

        if (
            !resultado ||
            resultado.success !== true
        ) {

            throw new Error(

                resultado &&
                typeof resultado.error === "string"

                    ? resultado.error

                    : "La API no confirmó el registro del microdrama."

            );
        }


        /* -------------------------------------------------
           CERRAR FORMULARIO
           ------------------------------------------------- */

        cerrarFormularioNuevoDrama();


        /* -------------------------------------------------
           MOSTRAR ÉXITO
           ------------------------------------------------- */

        mostrarMensajeAdmin(
            "Microdrama guardado correctamente.",
            "success"
        );


        /* -------------------------------------------------
           ACTUALIZAR TABLA
           ------------------------------------------------- */

        await cargarDramasAdministrativos();


        /*
         * Después de recargar la tabla mostramos nuevamente
         * el mensaje porque cargarDramasAdministrativos()
         * limpia el mensaje durante el renderizado.
         */

        mostrarMensajeAdmin(
            "Microdrama guardado correctamente.",
            "success"
        );


    } catch (error) {

        console.error(
            "Error al guardar el nuevo microdrama:",
            error
        );


        mostrarMensajeAdmin(
            error.message ||
            "No se pudo guardar el microdrama.",
            "error"
        );


    } finally {

        botonGuardar.disabled = false;

        botonGuardar.textContent =
            "Guardar microdrama";


        if (botonNuevo) {

            botonNuevo.disabled = false;

        }
    }
}


/* =========================================================
   CARGAR MICRODRAMAS
   ========================================================= */

async function cargarDramasAdministrativos() {

    const elementos =
        obtenerElementos();


    if (!elementos) {

        return;

    }


    mostrarEstadoCarga(
        elementos
    );


    try {

        const respuesta =
            await fetch(
                API_ADMIN_DRAMAS,
                {
                    method: "GET",

                    credentials: "same-origin",

                    headers: {
                        Accept:
                            "application/json"
                    },

                    cache: "no-store"
                }
            );


        if (!respuesta.ok) {

            throw new Error(
                `La API respondió con el estado ${respuesta.status}.`
            );

        }


        const datos =
            await respuesta.json();


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
            ([, elemento]) =>
                !elemento
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

function mostrarEstadoCarga(
    elementos
) {

    elementos.estadoCarga.hidden =
        false;


    elementos.estadoVacio.hidden =
        true;


    elementos.contenedorTabla.hidden =
        true;


    elementos.mensajeAdmin.hidden =
        true;


    elementos.listaDramas.replaceChildren();
}


/* =========================================================
   RENDERIZAR DRAMAS
   ========================================================= */

function renderizarDramas(
    dramas,
    elementos
) {

    elementos.estadoCarga.hidden =
        true;


    elementos.mensajeAdmin.hidden =
        true;


    elementos.listaDramas.replaceChildren();


    if (dramas.length === 0) {

        elementos.estadoVacio.hidden =
            false;


        elementos.contenedorTabla.hidden =
            true;


        return;
    }


    const fragmento =
        document.createDocumentFragment();


    dramas.forEach(
        (drama) => {

            fragmento.appendChild(
                crearFilaDrama(
                    drama
                )
            );

        }
    );


    elementos.listaDramas.appendChild(
        fragmento
    );


    elementos.estadoVacio.hidden =
        true;


    elementos.contenedorTabla.hidden =
        false;
}


/* =========================================================
   CREAR FILA
   ========================================================= */

function crearFilaDrama(
    drama
) {

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

function crearCelda(
    contenido
) {

    const celda =
        document.createElement("td");


    celda.textContent =
        contenido;


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


    portada.loading =
        "lazy";


    portada.width =
        48;


    portada.height =
        72;


    portada.addEventListener(
        "error",
        () => {

            portada.hidden =
                true;

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


    return String(
        valor
    );
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
        new Date(
            fechaOriginal
        );


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
            dateStyle:
                "short",

            timeStyle:
                "short"
        }
    ).format(
        fecha
    );
}


/* =========================================================
   MOSTRAR MENSAJE ADMINISTRATIVO
   ========================================================= */

function mostrarMensajeAdmin(
    mensaje,
    tipo
) {

    const mensajeAdmin =
        document.getElementById(
            "mensaje-admin"
        );


    if (!mensajeAdmin) {

        return;

    }


    mensajeAdmin.textContent =
        mensaje;


    if (tipo === "success") {

        mensajeAdmin.className =
            "admin-message admin-message--success";

    } else {

        mensajeAdmin.className =
            "admin-message admin-message--error";

    }


    mensajeAdmin.hidden =
        false;
}


/* =========================================================
   MOSTRAR ERROR
   ========================================================= */

function mostrarError(
    elementos,
    mensaje
) {

    elementos.estadoCarga.hidden =
        true;


    elementos.estadoVacio.hidden =
        true;


    elementos.contenedorTabla.hidden =
        true;


    elementos.mensajeAdmin.textContent =
        mensaje;


    elementos.mensajeAdmin.className =
        "admin-message admin-message--error";


    elementos.mensajeAdmin.hidden =
        false;
}
