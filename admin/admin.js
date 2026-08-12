"use strict";


/* =========================================================
   CONFIGURACIÓN
   ========================================================= */

const API_ADMIN_DRAMAS =
    "/api/admin/dramas";


const DESCRIPCION_AUTOMATICA =
    "Drama doblado al español.";


const OPCION_NUEVA_PLATAFORMA =
    "__agregar_nueva__";


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
   INICIALIZAR FORMULARIO
   ========================================================= */

function inicializarFormularioNuevoDrama() {

    const botonNuevo =
        document.getElementById(
            "boton-nuevo"
        );

    const formularioContenedor =
        document.getElementById(
            "formulario-nuevo"
        );

    const formulario =
        document.getElementById(
            "form-nuevo-drama"
        );

    const botonCancelar =
        document.getElementById(
            "boton-cancelar"
        );

    const campoTitulo =
        document.getElementById(
            "title"
        );

    const campoSlug =
        document.getElementById(
            "slug"
        );

    const campoPlataforma =
        document.getElementById(
            "platform"
        );


    if (
        !botonNuevo ||
        !formularioContenedor ||
        !formulario ||
        !botonCancelar ||
        !campoTitulo ||
        !campoSlug ||
        !campoPlataforma
    ) {

        console.error(
            "No se pudieron inicializar correctamente los controles del formulario."
        );

        return;
    }


    /* -----------------------------------------------------
       ABRIR FORMULARIO
       ----------------------------------------------------- */

    botonNuevo.addEventListener(
        "click",
        async () => {

            formularioContenedor.hidden =
                false;

            botonNuevo.disabled =
                true;


            establecerDescripcionAutomatica();


            await establecerSiguienteOrden();


            campoTitulo.focus();

        }
    );


    /* -----------------------------------------------------
       GENERAR SLUG AUTOMÁTICAMENTE
       ----------------------------------------------------- */

    campoTitulo.addEventListener(
        "input",
        () => {

            campoSlug.value =
                generarSlug(
                    campoTitulo.value
                );

        }
    );


    /* -----------------------------------------------------
       CAMBIAR PLATAFORMA
       ----------------------------------------------------- */

    campoPlataforma.addEventListener(
        "change",
        manejarCambioPlataforma
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
   DESCRIPCIÓN AUTOMÁTICA
   ========================================================= */

function establecerDescripcionAutomatica() {

    const campoDescripcion =
        document.getElementById(
            "description"
        );


    if (!campoDescripcion) {

        return;
    }


    campoDescripcion.value =
        DESCRIPCION_AUTOMATICA;
}


/* =========================================================
   MANEJAR PLATAFORMA
   ========================================================= */

function manejarCambioPlataforma(
    evento
) {

    const valor =
        evento.target.value;


    const contenedorNuevaPlataforma =
        document.getElementById(
            "nueva-plataforma-container"
        );

    const campoNuevaPlataforma =
        document.getElementById(
            "nueva-plataforma"
        );


    if (
        !contenedorNuevaPlataforma ||
        !campoNuevaPlataforma
    ) {

        return;
    }


    if (
        valor === OPCION_NUEVA_PLATAFORMA
    ) {

        contenedorNuevaPlataforma.hidden =
            false;

        campoNuevaPlataforma.required =
            true;

        campoNuevaPlataforma.focus();

    } else {

        contenedorNuevaPlataforma.hidden =
            true;

        campoNuevaPlataforma.required =
            false;

        campoNuevaPlataforma.value =
            "";
    }
}


/* =========================================================
   OBTENER PLATAFORMA FINAL
   ========================================================= */

function obtenerPlataformaSeleccionada() {

    const campoPlataforma =
        document.getElementById(
            "platform"
        );

    const campoNuevaPlataforma =
        document.getElementById(
            "nueva-plataforma"
        );


    if (
        !campoPlataforma
    ) {

        return "";
    }


    if (
        campoPlataforma.value ===
        OPCION_NUEVA_PLATAFORMA
    ) {

        return String(
            campoNuevaPlataforma?.value ||
            ""
        ).trim();
    }


    return String(
        campoPlataforma.value ||
        ""
    ).trim();
}


/* =========================================================
   GENERAR SLUG
   ========================================================= */

function generarSlug(
    texto
) {

    if (
        typeof texto !== "string"
    ) {

        return "";
    }


    return texto

        .normalize(
            "NFD"
        )

        .replace(
            /[\u0300-\u036f]/g,
            ""
        )

        .toLowerCase()

        .replace(
            /&/g,
            " y "
        )

        .replace(
            /[^a-z0-9]+/g,
            "-"
        )

        .replace(
            /^-+/,
            ""
        )

        .replace(
            /-+$/,
            ""
        )

        .slice(
            0,
            200
        )

        .replace(
            /-+$/,
            ""
        );
}


/* =========================================================
   OBTENER SIGUIENTE ORDEN
   ========================================================= */

async function establecerSiguienteOrden() {

    const campoOrden =
        document.getElementById(
            "sort_order"
        );


    if (!campoOrden) {

        return;
    }


    campoOrden.value =
        "1";


    try {

        const respuesta =
            await fetch(
                API_ADMIN_DRAMAS,
                {
                    method: "GET",

                    credentials:
                        "same-origin",

                    headers: {
                        Accept:
                            "application/json"
                    },

                    cache:
                        "no-store"
                }
            );


        if (
            !respuesta.ok
        ) {

            return;
        }


        const datos =
            await respuesta.json();


        if (
            !datos.success ||
            !Array.isArray(
                datos.dramas
            )
        ) {

            return;
        }


        let mayorOrden =
            0;


        datos.dramas.forEach(
            (drama) => {

                const orden =
                    Number(
                        drama.sort_order
                    );


                if (
                    Number.isInteger(
                        orden
                    ) &&
                    orden > mayorOrden
                ) {

                    mayorOrden =
                        orden;
                }
            }
        );


        campoOrden.value =
            String(
                mayorOrden + 1
            );


    } catch (error) {

        console.error(
            "No se pudo calcular el siguiente orden:",
            error
        );
    }
}


/* =========================================================
   CERRAR FORMULARIO
   ========================================================= */

function cerrarFormularioNuevoDrama() {

    const formularioContenedor =
        document.getElementById(
            "formulario-nuevo"
        );

    const formulario =
        document.getElementById(
            "form-nuevo-drama"
        );

    const botonNuevo =
        document.getElementById(
            "boton-nuevo"
        );

    const campoDescripcion =
        document.getElementById(
            "description"
        );

    const campoNuevaPlataforma =
        document.getElementById(
            "nueva-plataforma"
        );

    const contenedorNuevaPlataforma =
        document.getElementById(
            "nueva-plataforma-container"
        );

    const campoPlataforma =
        document.getElementById(
            "platform"
        );


    if (formulario) {

        formulario.reset();
    }


    if (campoDescripcion) {

        campoDescripcion.value =
            DESCRIPCION_AUTOMATICA;
    }


    if (campoPlataforma) {

        campoPlataforma.value =
            "";
    }


    if (campoNuevaPlataforma) {

        campoNuevaPlataforma.value =
            "";

        campoNuevaPlataforma.required =
            false;
    }


    if (contenedorNuevaPlataforma) {

        contenedorNuevaPlataforma.hidden =
            true;
    }


    if (formularioContenedor) {

        formularioContenedor.hidden =
            true;
    }


    if (botonNuevo) {

        botonNuevo.disabled =
            false;
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
        document.getElementById(
            "boton-guardar"
        );


    if (!botonGuardar) {

        console.error(
            "No se encontró el botón Guardar microdrama."
        );

        return;
    }


    /* -----------------------------------------------------
       VALIDACIÓN HTML
       ----------------------------------------------------- */

    if (
        !formulario.checkValidity()
    ) {

        formulario.reportValidity();

        return;
    }


    const plataforma =
        obtenerPlataformaSeleccionada();


    if (!plataforma) {

        mostrarMensajeAdmin(
            "Debes seleccionar una plataforma.",
            "error"
        );

        return;
    }


    const campoOrden =
        document.getElementById(
            "sort_order"
        );


    const datosFormulario =
        new FormData(
            formulario
        );


    const datos = {

        title:
            String(
                datosFormulario.get(
                    "title"
                ) || ""
            ).trim(),


        slug:
            String(
                datosFormulario.get(
                    "slug"
                ) || ""
            ).trim()
            .toLowerCase(),


        platform:
            plataforma,


        description:
            DESCRIPCION_AUTOMATICA,


        video_description:
            String(
                datosFormulario.get(
                    "video_description"
                ) || ""
            ).trim(),


        cover_url:
            String(
                datosFormulario.get(
                    "cover_url"
                ) || ""
            ).trim(),


        embed_url:
            String(
                datosFormulario.get(
                    "embed_url"
                ) || ""
            ).trim(),


        status:
            String(
                datosFormulario.get(
                    "status"
                ) || "draft"
            ).trim(),


        featured:
            datosFormulario.has(
                "featured"
            ),


        sort_order:
            Number(
                campoOrden?.value || 1
            )

    };


    /* -----------------------------------------------------
       BOTÓN
       ----------------------------------------------------- */

    botonGuardar.disabled =
        true;

    botonGuardar.textContent =
        "Guardando...";


    try {

        const respuesta =
            await fetch(
                API_ADMIN_DRAMAS,
                {
                    method: "POST",

                    credentials:
                        "same-origin",

                    headers: {

                        "Content-Type":
                            "application/json",

                        "Accept":
                            "application/json"

                    },

                    body:
                        JSON.stringify(
                            datos
                        )
                }
            );


        let resultado =
            null;


        try {

            resultado =
                await respuesta.json();

        } catch {

            resultado =
                null;
        }


        if (
            !respuesta.ok
        ) {

            const mensaje =
                resultado &&
                typeof resultado.error ===
                    "string"

                    ? resultado.error

                    : `La API respondió con el estado ${respuesta.status}.`;


            throw new Error(
                mensaje
            );
        }


        if (
            !resultado ||
            resultado.success !== true
        ) {

            throw new Error(

                resultado &&
                typeof resultado.error ===
                    "string"

                    ? resultado.error

                    : "La API no confirmó el registro del microdrama."
            );
        }


        cerrarFormularioNuevoDrama();


        await cargarDramasAdministrativos();


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

        botonGuardar.disabled =
            false;

        botonGuardar.textContent =
            "Guardar microdrama";


        if (botonNuevo) {

            botonNuevo.disabled =
                false;
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

                    credentials:
                        "same-origin",

                    headers: {
                        Accept:
                            "application/json"
                    },

                    cache:
                        "no-store"
                }
            );


        if (
            !respuesta.ok
        ) {

            throw new Error(
                `La API respondió con el estado ${respuesta.status}.`
            );
        }


        const datos =
            await respuesta.json();


        if (
            !datos.success ||
            !Array.isArray(
                datos.dramas
            )
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
   OBTENER ELEMENTOS
   ========================================================= */

function obtenerElementos() {

    const elementos = {

        estadoCarga:
            document.getElementById(
                "estado-carga"
            ),

        estadoVacio:
            document.getElementById(
                "estado-vacio"
            ),

        contenedorTabla:
            document.getElementById(
                "contenedor-tabla"
            ),

        listaDramas:
            document.getElementById(
                "lista-dramas"
            ),

        mensajeAdmin:
            document.getElementById(
                "mensaje-admin"
            )

    };


    const elementoFaltante =
        Object.entries(
            elementos
        ).find(
            ([, elemento]) =>
                !elemento
        );


    if (
        elementoFaltante
    ) {

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


    if (
        dramas.length === 0
    ) {

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
        document.createElement(
            "tr"
        );


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
        document.createElement(
            "td"
        );


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
        document.createElement(
            "td"
        );


    const contenedor =
        document.createElement(
            "div"
        );


    contenedor.className =
        "drama-info";


    const portada =
        document.createElement(
            "img"
        );


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
        document.createElement(
            "div"
        );


    const titulo =
        document.createElement(
            "p"
        );


    titulo.className =
        "drama-title";


    titulo.textContent =
        normalizarTexto(
            drama.title,
            "Sin título"
        );


    const slug =
        document.createElement(
            "p"
        );


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
        document.createElement(
            "td"
        );


    const indicador =
        document.createElement(
            "span"
        );


    const estado =
        normalizarTexto(
            estadoOriginal,
            "draft"
        ).toLowerCase();


    indicador.className =
        "status-badge";


    if (
        estado === "published"
    ) {

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
        document.createElement(
            "td"
        );


    const indicador =
        document.createElement(
            "span"
        );


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
        document.createElement(
            "td"
        );


    const mensaje =
        document.createElement(
            "span"
        );


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
   MOSTRAR MENSAJE
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


    mensajeAdmin.className =
        tipo === "success"
            ? "admin-message admin-message--success"
            : "admin-message admin-message--error";


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
