"use strict";

/* =========================================================
   MICRO-DRAMAS-ESP
   REPRODUCTOR PROPIO
   MEGAJS + MP4Box.js + MediaSource

   IMPORTANTE:

   Este archivo reemplaza completamente el app.js anterior.

   Mantiene:
   - Catálogo
   - API /api/dramas
   - Portadas
   - TOP
   - RECIÉN AGREGADO
   - PRÓXIMO ESTRENO
   - Detalle móvil
   - Registro de vistas

   Y reemplaza:
   - iframe de MEGA

   Por:

   MEGA privado
       ↓
   MEGAJS
       ↓
   MP4Box.js
       ↓
   MediaSource
       ↓
   SourceBuffer
       ↓
   <video>

   ========================================================= */


/* =========================================================
   CONFIGURACIÓN
========================================================= */

const PORTADA_GENERICA =
    "/portadas/generica/portada-generica.png";


/*
 * MEGAJS
 *
 * Se carga dinámicamente porque index.html
 * actualmente utiliza app.js como script normal.
 */

const MEGAJS_URL =
    "https://unpkg.com/megajs/dist/main.browser-es.mjs";


/*
 * MP4Box.js
 *
 * Utilizamos la misma familia de versión
 * utilizada durante el laboratorio.
 */

const MP4BOX_URL =
    "https://cdn.jsdelivr.net/npm/mp4box@2.4.1/dist/mp4box.all.mjs";


/*
 * Tamaño inicial utilizado para localizar
 * la estructura del MP4.
 */

const RANGO_INICIAL =
    4 * 1024 * 1024;


/*
 * Tamaño de cada bloque multimedia.
 *
 * 8 MB fue validado durante el laboratorio.
 */

const RANGO_MEDIA =
    8 * 1024 * 1024;


/*
 * Cantidad de muestras aproximada
 * por segmento.
 */

const MUESTRAS_POR_SEGMENTO =
    60;


/*
 * Buffer mínimo antes de intentar
 * reproducir automáticamente.
 */

const BUFFER_INICIAL =
    4;


/*
 * Buffer objetivo.
 *
 * No queremos descargar indefinidamente
 * si el usuario ya tiene suficiente contenido.
 */

const BUFFER_OBJETIVO =
    45;


/*
 * Cuando el buffer cae por debajo
 * de este valor, continuamos descargando.
 */

const BUFFER_BAJO =
    8;


/*
 * Límite de seguridad por sesión.

 * IMPORTANTE:
 *
 * NO es un límite del vídeo.
 *
 * Solamente evita que una prueba
 * defectuosa descargue todo el archivo.
 *
 * Una vez validado el reproductor,
 * podremos ajustar este valor.
 */

const LIMITE_DESCARGA_SESION =
    512 * 1024 * 1024;


/*
 * Máximo de tiempo que esperamos
 * una operación de SourceBuffer.
 */

const TIMEOUT_SOURCEBUFFER =
    30000;


/* =========================================================
   ESTADO GENERAL
========================================================= */

let detalleMovilActual =
    null;


let reproductorActual =
    null;


/* =========================================================
   ESTADO DEL REPRODUCTOR
========================================================= */

let playerState = {

    open:
        false,

    loading:
        false,

    stopped:
        false,

    operationId:
        0,

    drama:
        null,

    file:
        null,

    fileSize:
        0,

    megaLoaded:
        false,

    mp4box:
        null,

    mp4Info:
        null,

    mp4Ready:
        false,

    mp4Error:
        false,

    mediaSource:
        null,

    mediaSourceUrl:
        null,

    videoElement:
        null,

    sourceBuffers:
        new Map(),

    sourceQueues:
        new Map(),

    videoTrackId:
        null,

    audioTrackId:
        null,

    totalDownloaded:
        0,

    totalSegments:
        0,

    totalAppended:
        0,

    megaRequests:
        0,

    cursor:
        0,

    playbackStarted:
        false,

    streamStarted:
        false,

    metadataPromise:
        null,

    metadataResolve:
        null,

    metadataReject:
        null,

    diagnosticsTimer:
        null,

    loadingPromise:
        null,

    pendingRead:
        false

};


/* =========================================================
   ESTADO DE CARGA DE LIBRERÍAS
========================================================= */

let libreriasPromise =
    null;


let MEGAFile =
    null;


let MP4BoxAPI =
    null;


/* =========================================================
   DETECTAR VISTA MÓVIL
========================================================= */

function esVistaMovil() {

    return window.matchMedia(
        "(max-width: 600px)"
    ).matches;

}


/* =========================================================
   CARGAR LIBRERÍAS
========================================================= */

async function cargarLibreriasReproductor() {

    if (
        libreriasPromise
    ) {

        return libreriasPromise;

    }


    libreriasPromise =
        (async () => {

            console.log(
                "[REPRODUCTOR] Cargando MEGAJS..."
            );


            const megaModule =
                await import(
                    MEGAJS_URL
                );


            MEGAFile =
                megaModule.File ||
                megaModule.default?.File ||
                megaModule.default;


            if (
                !MEGAFile ||
                typeof MEGAFile.fromURL !==
                "function"
            ) {

                throw new Error(
                    "No se pudo inicializar MEGAJS."
                );

            }


            console.log(
                "[REPRODUCTOR] ✓ MEGAJS cargado."
            );


            console.log(
                "[REPRODUCTOR] Cargando MP4Box.js..."
            );


            const mp4boxModule =
                await import(
                    MP4BOX_URL
                );


            MP4BoxAPI =
                mp4boxModule.default ||
                mp4boxModule;


            if (
                !MP4BoxAPI ||
                typeof MP4BoxAPI.createFile !==
                "function"
            ) {

                throw new Error(
                    "No se pudo inicializar MP4Box.js."
                );

            }


            console.log(
                "[REPRODUCTOR] ✓ MP4Box.js cargado."
            );


            return true;

        })();


    try {

        await libreriasPromise;


    } catch (
        error
    ) {

        libreriasPromise =
            null;


        throw error;

    }


    return true;

}


/* =========================================================
   CARGAR DRAMAS
========================================================= */

async function cargarDramas() {

    const catalogo =
        document.getElementById(
            "catalogo"
        );


    if (!catalogo) {

        console.error(
            'No se encontró el elemento con id "catalogo".'
        );

        return;

    }


    try {

        const respuesta =
            await fetch(
                "/api/dramas"
            );


        if (!respuesta.ok) {

            throw new Error(
                `Error al consultar la API: ${respuesta.status}`
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
                "La API devolvió una respuesta no válida."
            );

        }


        catalogo.innerHTML =
            "";


        if (
            datos.dramas.length ===
            0
        ) {

            catalogo.innerHTML =
                `
                <p class="mensaje-vacio">
                    No hay microdramas disponibles.
                </p>
                `;


            return;

        }


        datos.dramas.forEach(
            crearTarjetaDrama
        );


    } catch (
        error
    ) {

        console.error(
            "Error al cargar el catálogo:",
            error
        );


        catalogo.innerHTML =
            `
            <p class="mensaje-error">
                No se pudo cargar el catálogo.
            </p>
            `;

    }

}


/* =========================================================
   ESTADO BORRADOR
========================================================= */

function esDramaBorrador(
    drama
) {

    if (!drama) {

        return false;

    }


    const estado =
        typeof drama.status ===
        "string"
            ? drama.status
                .trim()
                .toLowerCase()
            : "";


    return (
        estado === "borrador" ||
        estado === "draft"
    );

}


/* =========================================================
   MICRODRAMA NUEVO
========================================================= */

function esDramaNuevo(
    createdAt
) {

    if (
        typeof createdAt !==
        "string" ||
        createdAt.trim() ===
        ""
    ) {

        return false;

    }


    const valor =
        createdAt
            .trim()
            .replace(
                " ",
                "T"
            );


    const fechaCreacion =
        new Date(
            valor.endsWith("Z")
                ? valor
                : `${valor}Z`
        );


    if (
        Number.isNaN(
            fechaCreacion.getTime()
        )
    ) {

        return false;

    }


    const ahora =
        Date.now();


    const setentaDosHoras =
        72 *
        60 *
        60 *
        1000;


    const diferencia =
        ahora -
        fechaCreacion.getTime();


    return (
        diferencia >= 0 &&
        diferencia <
        setentaDosHoras
    );

}


/* =========================================================
   REGISTRAR REPRODUCCIÓN
========================================================= */

async function registrarVista(
    drama
) {

    if (
        !drama ||
        !Number.isInteger(
            Number(
                drama.id
            )
        )
    ) {

        return null;

    }


    try {

        const respuesta =
            await fetch(
                "/api/dramas/view",
                {
                    method:
                        "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            id:
                                Number(
                                    drama.id
                                )
                        })
                }
            );


        if (
            !respuesta.ok
        ) {

            throw new Error(
                `Error al registrar vista: ${respuesta.status}`
            );

        }


        const datos =
            await respuesta.json();


        if (
            !datos.success
        ) {

            throw new Error(
                datos.error ||
                "No se pudo registrar la vista."
            );

        }


        return Number(
            datos.views
        ) || 0;


    } catch (
        error
    ) {

        console.error(
            "No se pudo registrar la reproducción:",
            error
        );


        return null;

    }

}


/* =========================================================
   CREAR TARJETA
========================================================= */

function crearTarjetaDrama(
    drama
) {

    const catalogo =
        document.getElementById(
            "catalogo"
        );


    if (!catalogo) {

        return;

    }


    const tarjeta =
        document.createElement(
            "article"
        );


    tarjeta.className =
        "drama-card";


    const esBorrador =
        esDramaBorrador(
            drama
        );


    /* -----------------------------------------------------
       PRÓXIMO ESTRENO
    ----------------------------------------------------- */

    if (
        esBorrador
    ) {

        const etiquetaProximo =
            document.createElement(
                "div"
            );


        etiquetaProximo.className =
            "drama-card__upcoming";


        etiquetaProximo.textContent =
            "PRÓXIMO ESTRENO";


        etiquetaProximo.setAttribute(
            "aria-label",
            "Microdrama próximo estreno"
        );


        tarjeta.appendChild(
            etiquetaProximo
        );


    } else if (
        esDramaNuevo(
            drama.created_at
        )
    ) {

        const etiquetaNuevo =
            document.createElement(
                "div"
            );


        etiquetaNuevo.className =
            "drama-card__new";


        etiquetaNuevo.textContent =
            "RECIÉN AGREGADO";


        etiquetaNuevo.setAttribute(
            "aria-label",
            "Microdrama recién agregado"
        );


        tarjeta.appendChild(
            etiquetaNuevo
        );

    }


    /* -----------------------------------------------------
       TOP
    ----------------------------------------------------- */

    if (
        Number(
            drama.views
        ) >= 3
    ) {

        const etiquetaTop =
            document.createElement(
                "div"
            );


        etiquetaTop.className =
            "drama-card__top";


        etiquetaTop.innerHTML =
            `
            <span aria-hidden="true">🔥</span>
            TOP
            `;


        etiquetaTop.setAttribute(
            "aria-label",
            "Microdrama TOP"
        );


        tarjeta.appendChild(
            etiquetaTop
        );

    }


    /* -----------------------------------------------------
       PORTADA
    ----------------------------------------------------- */

    const portada =
        document.createElement(
            "img"
        );


    const portadaUrl =
        typeof drama.cover_url ===
            "string" &&
        drama.cover_url.trim() !==
            ""
            ? drama.cover_url.trim()
            : PORTADA_GENERICA;


    portada.src =
        portadaUrl;


    portada.alt =
        `Portada de ${drama.title}`;


    portada.loading =
        "lazy";


    portada.addEventListener(
        "error",
        () => {

            if (
                !portada.src.endsWith(
                    PORTADA_GENERICA
                )
            ) {

                portada.src =
                    PORTADA_GENERICA;

            }

        },
        {
            once:
                true
        }
    );


    /* -----------------------------------------------------
       OVERLAY
    ----------------------------------------------------- */

    const overlay =
        document.createElement(
            "div"
        );


    overlay.className =
        "drama-card__overlay";


    /* -----------------------------------------------------
       TÍTULO
    ----------------------------------------------------- */

    const titulo =
        document.createElement(
            "h2"
        );


    titulo.className =
        "drama-card__title";


    titulo.textContent =
        drama.title;


    /* -----------------------------------------------------
       TIPO
    ----------------------------------------------------- */

    const tipo =
        document.createElement(
            "p"
        );


    tipo.className =
        "drama-card__type";


    tipo.textContent =
        "Microdrama doblado al español.";


    /* -----------------------------------------------------
       PLATAFORMA
    ----------------------------------------------------- */

    const plataforma =
        document.createElement(
            "p"
        );


    plataforma.className =
        "drama-card__platform";


    const etiquetaPlataforma =
        document.createElement(
            "strong"
        );


    etiquetaPlataforma.textContent =
        "Plataforma: ";


    plataforma.appendChild(
        etiquetaPlataforma
    );


    plataforma.appendChild(
        document.createTextNode(
            typeof drama.platform ===
                "string" &&
            drama.platform.trim() !==
                ""
                ? drama.platform.trim()
                : "No especificada"
        )
    );


    /* -----------------------------------------------------
       CONTROLES
    ----------------------------------------------------- */

    const controles =
        document.createElement(
            "div"
        );


    controles.className =
        "drama-card__controls";


    let botonVer =
        null;


    if (
        !esBorrador
    ) {

        botonVer =
            document.createElement(
                "button"
            );


        botonVer.type =
            "button";


        botonVer.className =
            "drama-card__play";


        botonVer.dataset.dramaId =
            String(
                drama.id
            );


        botonVer.innerHTML =
            `
            <span
                class="drama-card__play-icon"
                aria-hidden="true"
            >
                ▶
            </span>

            <span>
                Ver
            </span>
            `;


        botonVer.addEventListener(
            "click",
            evento => {

                evento.preventDefault();

                evento.stopPropagation();


                reproducirDrama(
                    drama
                );

            }
        );

    }


    /* -----------------------------------------------------
       BOTÓN +
    ----------------------------------------------------- */

    const botonMas =
        document.createElement(
            "button"
        );


    botonMas.type =
        "button";


    botonMas.className =
        "drama-card__more";


    botonMas.textContent =
        "+";


    botonMas.setAttribute(
        "aria-label",
        `Mostrar descripción de ${drama.title}`
    );


    botonMas.setAttribute(
        "aria-expanded",
        "false"
    );


    /* -----------------------------------------------------
       DESCRIPCIÓN
    ----------------------------------------------------- */

    const descripcion =
        document.createElement(
            "div"
        );


    descripcion.className =
        "drama-card__description";


    const descripcionTexto =
        typeof drama.video_description ===
            "string" &&
        drama.video_description.trim() !==
            ""
            ? drama.video_description.trim()
            : drama.description;


    descripcion.textContent =
        descripcionTexto ||
        "";


    botonMas.addEventListener(
        "click",
        evento => {

            evento.preventDefault();

            evento.stopPropagation();


            const abierta =
                tarjeta.classList.toggle(
                    "is-description-open"
                );


            botonMas.textContent =
                abierta
                    ? "−"
                    : "+";


            botonMas.setAttribute(
                "aria-expanded",
                abierta
                    ? "true"
                    : "false"
            );

        }
    );


    if (
        botonVer
    ) {

        controles.appendChild(
            botonVer
        );

    }


    controles.appendChild(
        botonMas
    );


    overlay.appendChild(
        titulo
    );


    overlay.appendChild(
        tipo
    );


    overlay.appendChild(
        plataforma
    );


    overlay.appendChild(
        controles
    );


    overlay.appendChild(
        descripcion
    );


    tarjeta.appendChild(
        portada
    );


    tarjeta.appendChild(
        overlay
    );


    tarjeta.addEventListener(
        "click",
        evento => {

            if (
                !esVistaMovil()
            ) {

                return;

            }


            if (
                evento.target.closest(
                    "button"
                )
            ) {

                return;

            }


            abrirDetalleMovil(
                drama
            );

        }
    );


    catalogo.appendChild(
        tarjeta
    );

}


/* =========================================================
   DETALLE MÓVIL
========================================================= */

function crearDetalleMovil() {

    if (
        document.getElementById(
            "detalle-movil"
        )
    ) {

        return;

    }


    const detalle =
        document.createElement(
            "div"
        );


    detalle.id =
        "detalle-movil";


    detalle.className =
        "mobile-detail";


    detalle.setAttribute(
        "aria-hidden",
        "true"
    );


    const fondo =
        document.createElement(
            "div"
        );


    fondo.className =
        "mobile-detail__backdrop";


    const panel =
        document.createElement(
            "div"
        );


    panel.className =
        "mobile-detail__panel";


    panel.setAttribute(
        "role",
        "dialog"
    );


    panel.setAttribute(
        "aria-modal",
        "true"
    );


    const cerrar =
        document.createElement(
            "button"
        );


    cerrar.type =
        "button";


    cerrar.className =
        "mobile-detail__close";


    cerrar.innerHTML =
        "×";


    cerrar.setAttribute(
        "aria-label",
        "Cerrar"
    );


    const imagen =
        document.createElement(
            "img"
        );


    imagen.className =
        "mobile-detail__image";


    const contenido =
        document.createElement(
            "div"
        );


    contenido.className =
        "mobile-detail__content";


    const titulo =
        document.createElement(
            "h2"
        );


    titulo.className =
        "mobile-detail__title";


    const tipo =
        document.createElement(
            "p"
        );


    tipo.className =
        "mobile-detail__type";


    tipo.textContent =
        "Microdrama doblado al español.";


    const plataforma =
        document.createElement(
            "p"
        );


    plataforma.className =
        "mobile-detail__platform";


    const botonVer =
        document.createElement(
            "button"
        );


    botonVer.type =
        "button";


    botonVer.className =
        "mobile-detail__play";


    botonVer.innerHTML =
        `
        <span
            class="mobile-detail__play-icon"
            aria-hidden="true"
        >
            ▶
        </span>

        <span>
            Ver
        </span>
        `;


    botonVer.addEventListener(
        "click",
        evento => {

            evento.preventDefault();


            if (
                !detalleMovilActual
            ) {

                return;

            }


            reproducirDrama(
                detalleMovilActual
            );

        }
    );


    const tituloDescripcion =
        document.createElement(
            "h3"
        );


    tituloDescripcion.className =
        "mobile-detail__description-title";


    tituloDescripcion.textContent =
        "Descripción";


    const descripcion =
        document.createElement(
            "p"
        );


    descripcion.className =
        "mobile-detail__description";


    const acciones =
        document.createElement(
            "div"
        );


    acciones.className =
        "mobile-detail__actions";


    acciones.appendChild(
        botonVer
    );


    contenido.appendChild(
        titulo
    );


    contenido.appendChild(
        tipo
    );


    contenido.appendChild(
        plataforma
    );


    contenido.appendChild(
        acciones
    );


    contenido.appendChild(
        tituloDescripcion
    );


    contenido.appendChild(
        descripcion
    );


    panel.appendChild(
        cerrar
    );


    panel.appendChild(
        imagen
    );


    panel.appendChild(
        contenido
    );


    detalle.appendChild(
        fondo
    );


    detalle.appendChild(
        panel
    );


    document.body.appendChild(
        detalle
    );


    cerrar.addEventListener(
        "click",
        cerrarDetalleMovil
    );


    fondo.addEventListener(
        "click",
        cerrarDetalleMovil
    );

}


/* =========================================================
   ABRIR DETALLE MÓVIL
========================================================= */

function abrirDetalleMovil(
    drama
) {

    crearDetalleMovil();


    const detalle =
        document.getElementById(
            "detalle-movil"
        );


    if (!detalle) {

        return;

    }


    const imagen =
        detalle.querySelector(
            ".mobile-detail__image"
        );


    const titulo =
        detalle.querySelector(
            ".mobile-detail__title"
        );


    const plataforma =
        detalle.querySelector(
            ".mobile-detail__platform"
        );


    const descripcion =
        detalle.querySelector(
            ".mobile-detail__description"
        );


    const botonVer =
        detalle.querySelector(
            ".mobile-detail__play"
        );


    const portadaUrl =
        typeof drama.cover_url ===
            "string" &&
        drama.cover_url.trim() !==
            ""
            ? drama.cover_url.trim()
            : PORTADA_GENERICA;


    imagen.src =
        portadaUrl;


    imagen.alt =
        `Portada de ${drama.title}`;


    imagen.onerror =
        () => {

            if (
                !imagen.src.endsWith(
                    PORTADA_GENERICA
                )
            ) {

                imagen.src =
                    PORTADA_GENERICA;

            }

        };


    titulo.textContent =
        drama.title;


    plataforma.textContent =
        `Plataforma: ${
            typeof drama.platform ===
                "string" &&
            drama.platform.trim() !==
                ""
                ? drama.platform.trim()
                : "No especificada"
        }`;


    const descripcionTexto =
        typeof drama.video_description ===
            "string" &&
        drama.video_description.trim() !==
            ""
            ? drama.video_description.trim()
            : drama.description;


    descripcion.textContent =
        descripcionTexto ||
        "Sin descripción disponible.";


    if (
        botonVer
    ) {

        botonVer.hidden =
            esDramaBorrador(
                drama
            );

    }


    detalleMovilActual =
        drama;


    detalle.classList.add(
        "is-open"
    );


    detalle.setAttribute(
        "aria-hidden",
        "false"
    );


    document.body.classList.add(
        "mobile-detail-open"
    );

}


/* =========================================================
   CERRAR DETALLE MÓVIL
========================================================= */

function cerrarDetalleMovil() {

    const detalle =
        document.getElementById(
            "detalle-movil"
        );


    if (!detalle) {

        return;

    }


    detalle.classList.remove(
        "is-open"
    );


    detalle.setAttribute(
        "aria-hidden",
        "true"
    );


    document.body.classList.remove(
        "mobile-detail-open"
    );


    detalleMovilActual =
        null;

}


/* =========================================================
   ESTILOS DEL REPRODUCTOR
========================================================= */

function insertarEstilosReproductor() {

    if (
        document.getElementById(
            "micro-dramas-player-style"
        )
    ) {

        return;

    }


    const style =
        document.createElement(
            "style"
        );


    style.id =
        "micro-dramas-player-style";


    style.textContent =
        `
        /* =================================================
           REPRODUCTOR MICRO-DRAMAS-ESP
        ================================================= */

        .md-player {

            position: fixed;

            inset: 0;

            z-index: 999999;

            display: none;

            align-items: center;

            justify-content: center;

            background:
                rgba(0, 0, 0, 0.94);

            padding: 20px;

            box-sizing: border-box;

        }


        .md-player.is-open {

            display: flex;

        }


        .md-player__window {

            width: min(
                1200px,
                100%
            );

            max-height: 95vh;

            display: flex;

            flex-direction: column;

            background:
                #080808;

            border:
                1px solid
                rgba(255,255,255,0.12);

            border-radius:
                12px;

            overflow:
                hidden;

            box-shadow:
                0 25px 80px
                rgba(0,0,0,0.65);

        }


        .md-player__header {

            min-height:
                54px;

            display:
                flex;

            align-items:
                center;

            justify-content:
                space-between;

            gap:
                15px;

            padding:
                0 16px;

            background:
                #111;

            color:
                #fff;

        }


        .md-player__title {

            margin:
                0;

            font-size:
                17px;

            font-weight:
                600;

            overflow:
                hidden;

            text-overflow:
                ellipsis;

            white-space:
                nowrap;

        }


        .md-player__close {

            width:
                38px;

            height:
                38px;

            flex:
                0 0 38px;

            border:
                0;

            border-radius:
                50%;

            background:
                rgba(255,255,255,0.10);

            color:
                #fff;

            font-size:
                26px;

            line-height:
                1;

            cursor:
                pointer;

        }


        .md-player__close:hover {

            background:
                rgba(255,255,255,0.20);

        }


        .md-player__area {

            position:
                relative;

            background:
                #000;

            width:
                100%;

            aspect-ratio:
                16 / 9;

            min-height:
                240px;

            overflow:
                hidden;

        }


        .md-player__video {

            display:
                block;

            width:
                100%;

            height:
                100%;

            background:
                #000;

            object-fit:
                contain;

        }


        .md-player__loading {

            position:
                absolute;

            inset:
                0;

            z-index:
                3;

            display:
                flex;

            align-items:
                center;

            justify-content:
                center;

            flex-direction:
                column;

            gap:
                12px;

            background:
                rgba(0,0,0,0.72);

            color:
                #fff;

            text-align:
                center;

            pointer-events:
                none;

            opacity:
                1;

            transition:
                opacity 0.2s ease;

        }


        .md-player__loading.is-hidden {

            opacity:
                0;

        }


        .md-player__spinner {

            width:
                38px;

            height:
                38px;

            border:
                3px solid
                rgba(255,255,255,0.25);

            border-top-color:
                #fff;

            border-radius:
                50%;

            animation:
                mdPlayerSpin
                0.8s linear infinite;

        }


        @keyframes mdPlayerSpin {

            to {

                transform:
                    rotate(360deg);

            }

        }


        .md-player__message {

            max-width:
                90%;

            font-size:
                14px;

            opacity:
                0.9;

        }


        .md-player__controls {

            padding:
                10px 12px 12px;

            background:
                #111;

            color:
                #fff;

        }


        .md-player__progress {

            width:
                100%;

            height:
                5px;

            appearance:
                none;

            cursor:
                pointer;

            background:
                #444;

            border-radius:
                999px;

            margin:
                0 0 10px;

        }


        .md-player__progress::-webkit-slider-thumb {

            appearance:
                none;

            width:
                13px;

            height:
                13px;

            border-radius:
                50%;

            background:
                #fff;

            cursor:
                pointer;

        }


        .md-player__progress::-moz-range-thumb {

            width:
                13px;

            height:
                13px;

            border:
                0;

            border-radius:
                50%;

            background:
                #fff;

            cursor:
                pointer;

        }


        .md-player__buttons {

            display:
                flex;

            align-items:
                center;

            gap:
                7px;

        }


        .md-player__button {

            min-width:
                36px;

            height:
                36px;

            padding:
                0 9px;

            border:
                0;

            border-radius:
                7px;

            background:
                rgba(255,255,255,0.10);

            color:
                #fff;

            cursor:
                pointer;

            font-size:
                14px;

        }


        .md-player__button:hover {

            background:
                rgba(255,255,255,0.18);

        }


        .md-player__time {

            margin-left:
                auto;

            font-size:
                12px;

            white-space:
                nowrap;

            opacity:
                0.85;

        }


        .md-player__volume {

            width:
                85px;

            accent-color:
                #fff;

        }


        .md-player__status {

            margin-top:
                8px;

            min-height:
                16px;

            font-family:
                monospace;

            font-size:
                10px;

            color:
                rgba(255,255,255,0.55);

            overflow:
                hidden;

            text-overflow:
                ellipsis;

            white-space:
                nowrap;

        }


        @media (
            max-width: 700px
        ) {

            .md-player {

                padding:
                    0;

            }


            .md-player__window {

                width:
                    100%;

                max-height:
                    100vh;

                height:
                    100vh;

                border-radius:
                    0;

                border:
                    0;

            }


            .md-player__area {

                aspect-ratio:
                    auto;

                flex:
                    1;

                min-height:
                    0;

            }


            .md-player__video {

                object-fit:
                    contain;

            }


            .md-player__header {

                min-height:
                    50px;

            }


            .md-player__buttons {

                gap:
                    4px;

            }


            .md-player__button {

                min-width:
                    34px;

                padding:
                    0 7px;

            }


            .md-player__volume {

                width:
                    65px;

            }

        }
        `;


    document.head.appendChild(
        style
    );

}


/* =========================================================
   CREAR REPRODUCTOR
========================================================= */

function crearReproductor() {

    if (
        document.getElementById(
            "md-player"
        )
    ) {

        return;

    }


    insertarEstilosReproductor();


    const reproductor =
        document.createElement(
            "div"
        );


    reproductor.id =
        "md-player";


    reproductor.className =
        "md-player";


    reproductor.setAttribute(
        "aria-hidden",
        "true"
    );


    const ventana =
        document.createElement(
            "div"
        );


    ventana.className =
        "md-player__window";


    ventana.setAttribute(
        "role",
        "dialog"
    );


    ventana.setAttribute(
        "aria-modal",
        "true"
    );


    const cabecera =
        document.createElement(
            "div"
        );


    cabecera.className =
        "md-player__header";


    const titulo =
        document.createElement(
            "h2"
        );


    titulo.className =
        "md-player__title";


    const cerrar =
        document.createElement(
            "button"
        );


    cerrar.type =
        "button";


    cerrar.className =
        "md-player__close";


    cerrar.textContent =
        "×";


    cerrar.setAttribute(
        "aria-label",
        "Cerrar reproductor"
    );


    cabecera.appendChild(
        titulo
    );


    cabecera.appendChild(
        cerrar
    );


    const area =
        document.createElement(
            "div"
        );


    area.className =
        "md-player__area";


    const video =
        document.createElement(
            "video"
        );


    video.className =
        "md-player__video";


    video.controls =
        false;


    video.playsInline =
        true;


    video.preload =
        "metadata";


    video.setAttribute(
        "playsinline",
        ""
    );


    const loading =
        document.createElement(
            "div"
        );


    loading.className =
        "md-player__loading";


    const spinner =
        document.createElement(
            "div"
        );


    spinner.className =
        "md-player__spinner";


    const loadingMessage =
        document.createElement(
            "div"
        );


    loadingMessage.className =
        "md-player__message";


    loadingMessage.textContent =
        "Preparando vídeo...";


    loading.appendChild(
        spinner
    );


    loading.appendChild(
        loadingMessage
    );


    area.appendChild(
        video
    );


    area.appendChild(
        loading
    );


    const controles =
        document.createElement(
            "div"
        );


    controles.className =
        "md-player__controls";


    const progress =
        document.createElement(
            "input"
        );


    progress.type =
        "range";


    progress.className =
        "md-player__progress";


    progress.min =
        "0";


    progress.max =
        "100";


    progress.value =
        "0";


    progress.step =
        "0.1";


    progress.setAttribute(
        "aria-label",
        "Progreso del vídeo"
    );


    const botones =
        document.createElement(
            "div"
        );


    botones.className =
        "md-player__buttons";


    const play =
        document.createElement(
            "button"
        );


    play.type =
        "button";


    play.className =
        "md-player__button";


    play.textContent =
        "▶";


    play.setAttribute(
        "aria-label",
        "Reproducir"
    );


    const retroceder =
        document.createElement(
            "button"
        );


    retroceder.type =
        "button";


    retroceder.className =
        "md-player__button";


    retroceder.textContent =
        "↶ 10";


    retroceder.setAttribute(
        "aria-label",
        "Retroceder 10 segundos"
    );


    const avanzar =
        document.createElement(
            "button"
        );


    avanzar.type =
        "button";


    avanzar.className =
        "md-player__button";


    avanzar.textContent =
        "10 ↷";


    avanzar.setAttribute(
        "aria-label",
        "Avanzar 10 segundos"
    );


    const mute =
        document.createElement(
            "button"
        );


    mute.type =
        "button";


    mute.className =
        "md-player__button";


    mute.textContent =
        "🔊";


    mute.setAttribute(
        "aria-label",
        "Silenciar"
    );


    const volume =
        document.createElement(
            "input"
        );


    volume.type =
        "range";


    volume.className =
        "md-player__volume";


    volume.min =
        "0";


    volume.max =
        "1";


    volume.step =
        "0.01";


    volume.value =
        "1";


    volume.setAttribute(
        "aria-label",
        "Volumen"
    );


    const fullscreen =
        document.createElement(
            "button"
        );


    fullscreen.type =
        "button";


    fullscreen.className =
        "md-player__button";


    fullscreen.textContent =
        "⛶";


    fullscreen.setAttribute(
        "aria-label",
        "Pantalla completa"
    );


    const time =
        document.createElement(
            "div"
        );


    time.className =
        "md-player__time";


    time.textContent =
        "0:00 / 0:00";


    botones.appendChild(
        play
    );


    botones.appendChild(
        retroceder
    );


    botones.appendChild(
        avanzar
    );


    botones.appendChild(
        mute
    );


    botones.appendChild(
        volume
    );


    botones.appendChild(
        fullscreen
    );


    botones.appendChild(
        time
    );


    const status =
        document.createElement(
            "div"
        );


    status.className =
        "md-player__status";


    status.textContent =
        "Esperando...";


    controles.appendChild(
        progress
    );


    controles.appendChild(
        botones
    );


    controles.appendChild(
        status
    );


    ventana.appendChild(
        cabecera
    );


    ventana.appendChild(
        area
    );


    ventana.appendChild(
        controles
    );


    reproductor.appendChild(
        ventana
    );


    document.body.appendChild(
        reproductor
    );


    playerState.videoElement =
        video;


    playerState.playerElements = {

        reproductor:
            reproductor,

        ventana:
            ventana,

        titulo:
            titulo,

        cerrar:
            cerrar,

        area:
            area,

        video:
            video,

        loading:
            loading,

        loadingMessage:
            loadingMessage,

        play:
            play,

        retroceder:
            retroceder,

        avanzar:
            avanzar,

        mute:
            mute,

        volume:
            volume,

        fullscreen:
            fullscreen,

        progress:
            progress,

        time:
            time,

        status:
            status

    };


    /* -----------------------------------------------------
       CERRAR
    ----------------------------------------------------- */

    cerrar.addEventListener(
        "click",
        cerrarReproductor
    );


    /* -----------------------------------------------------
       PLAY / PAUSA
    ----------------------------------------------------- */

    play.addEventListener(
        "click",
        async () => {

            if (
                !video.paused
            ) {

                video.pause();

                return;

            }


            try {

                await video.play();

            } catch (
                error
            ) {

                actualizarEstadoPlayer(
                    "Pulsa PLAY para iniciar el vídeo."
                );

            }

        }
    );


    /* -----------------------------------------------------
       RETROCEDER
    ----------------------------------------------------- */

    retroceder.addEventListener(
        "click",
        () => {

            if (
                !Number.isFinite(
                    video.currentTime
                )
            ) {

                return;

            }


            video.currentTime =
                Math.max(
                    0,
                    video.currentTime -
                    10
                );

        }
    );


    /* -----------------------------------------------------
       AVANZAR
    ----------------------------------------------------- */

    avanzar.addEventListener(
        "click",
        () => {

            if (
                !Number.isFinite(
                    video.currentTime
                )
            ) {

                return;

            }


            const duration =
                Number(
                    video.duration
                );


            video.currentTime =
                Math.min(
                    Number.isFinite(
                        duration
                    )
                        ? duration
                        : video.currentTime +
                          10,

                    video.currentTime +
                    10
                );

        }
    );


    /* -----------------------------------------------------
       MUTE
    ----------------------------------------------------- */

    mute.addEventListener(
        "click",
        () => {

            video.muted =
                !video.muted;


            actualizarIconoVolumen();

        }
    );


    /* -----------------------------------------------------
       VOLUMEN
    ----------------------------------------------------- */

    volume.addEventListener(
        "input",
        () => {

            video.volume =
                Number(
                    volume.value
                );


            video.muted =
                video.volume ===
                0;


            actualizarIconoVolumen();

        }
    );


    /* -----------------------------------------------------
       PANTALLA COMPLETA
    ----------------------------------------------------- */

    fullscreen.addEventListener(
        "click",
        alternarPantallaCompleta
    );


    /* -----------------------------------------------------
       PROGRESO
    ----------------------------------------------------- */

    progress.addEventListener(
        "input",
        () => {

            const duration =
                Number(
                    video.duration
                );


            if (
                !Number.isFinite(
                    duration
                ) ||
                duration <= 0
            ) {

                return;

            }


            const porcentaje =
                Number(
                    progress.value
                ) /
                100;


            video.currentTime =
                duration *
                porcentaje;

        }
    );


    /* -----------------------------------------------------
       VIDEO EVENTOS
    ----------------------------------------------------- */

    video.addEventListener(
        "play",
        () => {

            actualizarBotonPlay();


            actualizarEstadoPlayer(
                "Reproduciendo"
            );

        }
    );


    video.addEventListener(
        "pause",
        () => {

            actualizarBotonPlay();


            if (
                !playerState.stopped
            ) {

                actualizarEstadoPlayer(
                    "Pausado"
                );

            }

        }
    );


    video.addEventListener(
        "waiting",
        () => {

            mostrarLoading(
                "Cargando más vídeo..."
            );

        }
    );


    video.addEventListener(
        "playing",
        () => {

            playerState.playbackStarted =
                true;


            ocultarLoading();


            actualizarBotonPlay();


            actualizarEstadoPlayer(
                "Reproduciendo"
            );

        }
    );


    video.addEventListener(
        "timeupdate",
        actualizarControlesVideo
    );


    video.addEventListener(
        "durationchange",
        actualizarControlesVideo
    );


    video.addEventListener(
        "progress",
        actualizarControlesVideo
    );


    video.addEventListener(
        "ended",
        () => {

            actualizarBotonPlay();


            actualizarEstadoPlayer(
                "Vídeo finalizado"
            );

        }
    );


    video.addEventListener(
        "error",
        () => {

            const error =
                video.error;


            const codigo =
                error
                    ? error.code
                    : "desconocido";


            console.error(
                "[REPRODUCTOR] MediaError:",
                error
            );


            actualizarEstadoPlayer(
                `Error de reproducción (código ${codigo}).`
            );


            mostrarLoading(
                "Se produjo un error al reproducir el vídeo."
            );

        }
    );


    /* -----------------------------------------------------
       ESC
    ----------------------------------------------------- */

    document.addEventListener(
        "keydown",
        manejarTecladoPlayer
    );

}


/* =========================================================
   MOSTRAR LOADING
========================================================= */

function mostrarLoading(
    mensaje
) {

    const elementos =
        playerState.playerElements;


    if (
        !elementos
    ) {

        return;

    }


    elementos.loadingMessage.textContent =
        mensaje ||
        "Preparando vídeo...";


    elementos.loading.classList.remove(
        "is-hidden"
    );

}


/* =========================================================
   OCULTAR LOADING
========================================================= */

function ocultarLoading() {

    const elementos =
        playerState.playerElements;


    if (
        !elementos
    ) {

        return;

    }


    elementos.loading.classList.add(
        "is-hidden"
    );

}


/* =========================================================
   ESTADO PLAYER
========================================================= */

function actualizarEstadoPlayer(
    mensaje
) {

    const elementos =
        playerState.playerElements;


    if (
        !elementos
    ) {

        return;

    }


    elementos.status.textContent =
        mensaje;

}


/* =========================================================
   ICONO VOLUMEN
========================================================= */

function actualizarIconoVolumen() {

    const elementos =
        playerState.playerElements;


    if (
        !elementos ||
        !playerState.videoElement
    ) {

        return;

    }


    const video =
        playerState.videoElement;


    if (
        video.muted ||
        video.volume ===
        0
    ) {

        elementos.mute.textContent =
            "🔇";

        return;

    }


    if (
        video.volume <
        0.5
    ) {

        elementos.mute.textContent =
            "🔉";

        return;

    }


    elementos.mute.textContent =
        "🔊";

}


/* =========================================================
   BOTÓN PLAY
========================================================= */

function actualizarBotonPlay() {

    const elementos =
        playerState.playerElements;


    if (
        !elementos ||
        !playerState.videoElement
    ) {

        return;

    }


    const pausado =
        playerState.videoElement.paused;


    elementos.play.textContent =
        pausado
            ? "▶"
            : "❚❚";


    elementos.play.setAttribute(
        "aria-label",
        pausado
            ? "Reproducir"
            : "Pausar"
    );

}


/* =========================================================
   FORMATO TIEMPO
========================================================= */

function formatoTiempo(
    segundos
) {

    if (
        !Number.isFinite(
            segundos
        ) ||
        segundos < 0
    ) {

        return "0:00";

    }


    const total =
        Math.floor(
            segundos
        );


    const horas =
        Math.floor(
            total /
            3600
        );


    const minutos =
        Math.floor(
            (
                total %
                3600
            ) /
            60
        );


    const segundosRestantes =
        total %
        60;


    if (
        horas > 0
    ) {

        return (
            `${horas}:` +
            `${String(
                minutos
            ).padStart(
                2,
                "0"
            )}:` +
            `${String(
                segundosRestantes
            ).padStart(
                2,
                "0"
            )}`
        );

    }


    return (
        `${minutos}:` +
        `${String(
            segundosRestantes
        ).padStart(
            2,
            "0"
        )}`
    );

}


/* =========================================================
   FORMATO BYTES
========================================================= */

function formatoBytes(
    bytes
) {

    if (
        !Number.isFinite(
            bytes
        ) ||
        bytes <= 0
    ) {

        return "0 B";

    }


    const unidades =
        [
            "B",
            "KB",
            "MB",
            "GB",
            "TB"
        ];


    const indice =
        Math.min(
            Math.floor(
                Math.log(
                    bytes
                ) /
                Math.log(
                    1024
                )
            ),
            unidades.length -
            1
        );


    const valor =
        bytes /
        Math.pow(
            1024,
            indice
        );


    return (
        valor.toFixed(
            indice ===
            0
                ? 0
                : 2
        ) +
        " " +
        unidades[indice]
    );

}


/* =========================================================
   CONTROLES VIDEO
========================================================= */

function actualizarControlesVideo() {

    const elementos =
        playerState.playerElements;


    const video =
        playerState.videoElement;


    if (
        !elementos ||
        !video
    ) {

        return;

    }


    const duration =
        Number(
            video.duration
        );


    const current =
        Number(
            video.currentTime
        );


    if (
        Number.isFinite(
            duration
        ) &&
        duration > 0
    ) {

        elementos.progress.value =
            String(
                (
                    current /
                    duration
                ) *
                100
            );

    }


    elementos.time.textContent =
        `${formatoTiempo(current)} / ${formatoTiempo(duration)}`;


    actualizarEstadoBuffer();

}


/* =========================================================
   BUFFER DISPONIBLE
========================================================= */

function obtenerBufferAdelante() {

    const video =
        playerState.videoElement;


    if (
        !video
    ) {

        return 0;

    }


    const buffered =
        video.buffered;


    const current =
        Number(
            video.currentTime
        );


    if (
        !buffered ||
        buffered.length ===
        0
    ) {

        return 0;

    }


    for (
        let i = 0;
        i < buffered.length;
        i++
    ) {

        const inicio =
            buffered.start(
                i
            );


        const fin =
            buffered.end(
                i
            );


        if (
            current >=
                inicio &&
            current <=
                fin
        ) {

            return Math.max(
                0,
                fin -
                current
            );

        }

    }


    return 0;

}


/* =========================================================
   ESTADO BUFFER
========================================================= */

function actualizarEstadoBuffer() {

    if (
        !playerState.streamStarted
    ) {

        return;

    }


    const buffer =
        obtenerBufferAdelante();


    if (
        !playerState.videoElement
    ) {

        return;

    }


    if (
        !playerState.videoElement.paused &&
        buffer <
        BUFFER_BAJO
    ) {

        actualizarEstadoPlayer(
            `Cargando... buffer ${buffer.toFixed(1)} s`
        );

    }

}


/* =========================================================
   PANTALLA COMPLETA
========================================================= */

async function alternarPantallaCompleta() {

    const elementos =
        playerState.playerElements;


    if (
        !elementos
    ) {

        return;

    }


    try {

        if (
            document.fullscreenElement
        ) {

            await document.exitFullscreen();

            return;

        }


        if (
            elementos.ventana.requestFullscreen
        ) {

            await elementos.ventana.requestFullscreen();

        }

    } catch (
        error
    ) {

        console.warn(
            "[REPRODUCTOR] No se pudo activar pantalla completa:",
            error
        );

    }

}


/* =========================================================
   TECLADO
========================================================= */

function manejarTecladoPlayer(
    evento
) {

    const reproductor =
        document.getElementById(
            "md-player"
        );


    if (
        !reproductor ||
        !reproductor.classList.contains(
            "is-open"
        )
    ) {

        return;

    }


    const video =
        playerState.videoElement;


    if (
        !video
    ) {

        return;

    }


    /*
     * No interferir cuando el usuario
     * está escribiendo en un input.
     */

    const tag =
        evento.target?.tagName;


    if (
        tag === "INPUT" ||
        tag === "TEXTAREA"
    ) {

        return;

    }


    switch (
        evento.key.toLowerCase()
    ) {

        case " ":

        case "k":

            evento.preventDefault();


            if (
                video.paused
            ) {

                video.play().catch(
                    () => {}
                );

            } else {

                video.pause();

            }


            break;


        case "arrowleft":

            evento.preventDefault();


            video.currentTime =
                Math.max(
                    0,
                    video.currentTime -
                    5
                );


            break;


        case "arrowright":

            evento.preventDefault();


            video.currentTime =
                Math.min(
                    Number.isFinite(
                        video.duration
                    )
                        ? video.duration
                        : video.currentTime +
                          5,

                    video.currentTime +
                    5
                );


            break;


        case "m":

            evento.preventDefault();


            video.muted =
                !video.muted;


            actualizarIconoVolumen();


            break;


        case "f":

            evento.preventDefault();


            alternarPantallaCompleta();


            break;


        case "escape":

            if (
                !document.fullscreenElement
            ) {

                cerrarReproductor();

            }


            break;

    }

}


/* =========================================================
   LEER RANGO DESDE MEGA
========================================================= */

async function leerRangoMega(
    start,
    size
) {

    const file =
        playerState.file;


    if (
        !file
    ) {

        throw new Error(
            "No existe archivo MEGA cargado."
        );

    }


    if (
        start < 0 ||
        start >=
        playerState.fileSize
    ) {

        throw new Error(
            `Rango MEGA inválido: ${start}`
        );

    }


    const end =
        Math.min(
            start +
            size -
            1,
            playerState.fileSize -
            1
        );


    const esperado =
        end -
        start +
        1;


    playerState.megaRequests++;


    actualizarEstadoPlayer(
        `Descargando ${formatoBytes(esperado)}...`
    );


    const stream =
        file.download({
            start:
                start,

            end:
                end,

            maxConnections:
                1,

            initialChunkSize:
                128 *
                1024,

            chunkSizeIncrement:
                128 *
                1024,

            maxChunkSize:
                1024 *
                1024

        });


    if (
        !stream
    ) {

        throw new Error(
            "MEGAJS no devolvió un stream."
        );

    }


    const chunks =
        [];


    let recibido =
        0;


    await new Promise(
        (
            resolve,
            reject
        ) => {

            let terminado =
                false;


            stream.on(
                "data",
                chunk => {

                    if (
                        !chunk
                    ) {

                        return;

                    }


                    let array;


                    if (
                        chunk instanceof
                        Uint8Array
                    ) {

                        array =
                            chunk;

                    } else if (
                        chunk.buffer
                    ) {

                        array =
                            new Uint8Array(
                                chunk.buffer,
                                chunk.byteOffset ||
                                0,
                                chunk.byteLength
                            );

                    } else {

                        return;

                    }


                    const copia =
                        array.slice();


                    chunks.push(
                        copia
                    );


                    recibido +=
                        copia.byteLength;

                }
            );


            stream.on(
                "error",
                error => {

                    if (
                        terminado
                    ) {

                        return;

                    }


                    terminado =
                        true;


                    reject(
                        error
                    );

                }
            );


            stream.on(
                "end",
                () => {

                    if (
                        terminado
                    ) {

                        return;

                    }


                    terminado =
                        true;


                    resolve();

                }
            );

        }
    );


    if (
        recibido !==
        esperado
    ) {

        throw new Error(
            `MEGAJS entregó ${recibido} bytes; esperábamos ${esperado}.`
        );

    }


    const resultado =
        new Uint8Array(
            recibido
        );


    let offset =
        0;


    for (
        const chunk of
        chunks
    ) {

        resultado.set(
            chunk,
            offset
        );


        offset +=
            chunk.byteLength;

    }


    const arrayBuffer =
        resultado.buffer;


    /*
     * MUY IMPORTANTE:

     * MP4Box necesita conocer
     * la posición real dentro
     * del archivo original.
     */

    arrayBuffer.fileStart =
        start;


    playerState.totalDownloaded +=
        recibido;


    playerState.cursor =
        end +
        1;


    return {

        buffer:
            arrayBuffer,

        start:
            start,

        end:
            end,

        size:
            recibido

    };

}


/* =========================================================
   CREAR PROMESA METADATA
========================================================= */

function crearPromesaMetadata() {

    playerState.metadataPromise =
        new Promise(
            (
                resolve,
                reject
            ) => {

                playerState.metadataResolve =
                    resolve;


                playerState.metadataReject =
                    reject;

            }
        );


    return playerState.metadataPromise;

}


/* =========================================================
   CONFIGURAR MP4BOX
========================================================= */

function configurarMP4Box() {

    const mp4box =
        playerState.mp4box;


    if (
        !mp4box
    ) {

        throw new Error(
            "MP4Box no está inicializado."
        );

    }


    mp4box.onMoovStart =
        () => {

            console.log(
                "[REPRODUCTOR] ✓ MP4Box detectó MOOV."
            );

        };


    mp4box.onError =
        error => {

            playerState.mp4Error =
                true;


            console.error(
                "[REPRODUCTOR] MP4Box:",
                error
            );


            actualizarEstadoPlayer(
                `Error MP4Box: ${error}`
            );


            if (
                playerState.metadataReject
            ) {

                playerState.metadataReject(
                    new Error(
                        String(
                            error
                        )
                    )
                );

            }

        };


    mp4box.onReady =
        info => {

            if (
                playerState.mp4Ready
            ) {

                return;

            }


            playerState.mp4Ready =
                true;


            playerState.mp4Info =
                info;


            console.log(
                "[REPRODUCTOR] ✓ MP4Box listo.",
                info
            );


            try {

                prepararMediaSource(
                    info
                );


                prepararSegmentacion(
                    info
                );


                if (
                    playerState.metadataResolve
                ) {

                    playerState.metadataResolve(
                        info
                    );

                }


            } catch (
                error
            ) {

                playerState.mp4Error =
                    true;


                console.error(
                    "[REPRODUCTOR]",
                    error
                );


                if (
                    playerState.metadataReject
                ) {

                    playerState.metadataReject(
                        error
                    );

                }

            }

        };


    mp4box.onSegment =
        (
            trackId,
            user,
            buffer,
            sampleNumber,
            last
        ) => {

            playerState.totalSegments++;


            let foundTrackId =
                null;


            for (
                const [
                    id,
                    sourceBuffer
                ]
                of
                playerState.sourceBuffers
                    .entries()
            ) {

                if (
                    sourceBuffer ===
                    user
                ) {

                    foundTrackId =
                        id;


                    break;

                }

            }


            /*
             * Compatibilidad adicional:
             * si user no coincide,
             * usamos trackId.
             */

            if (
                foundTrackId ===
                null &&
                playerState.sourceBuffers.has(
                    trackId
                )
            ) {

                foundTrackId =
                    trackId;

            }


            if (
                foundTrackId ===
                null
            ) {

                console.error(
                    "[REPRODUCTOR] Segmento sin SourceBuffer.",
                    trackId
                );


                return;

            }


            encolarSourceBuffer(
                foundTrackId,
                buffer
            );


            console.log(
                `[REPRODUCTOR] Segmento ${playerState.totalSegments}: track=${trackId}, bytes=${formatoBytes(buffer.byteLength)}, sample=${sampleNumber}${last ? " FINAL" : ""}`
            );


            actualizarDiagnostico();

        };

}


/* =========================================================
   PREPARAR MEDIASOURCE
========================================================= */

function prepararMediaSource(
    info
) {

    if (
        !window.MediaSource
    ) {

        throw new Error(
            "Este navegador no soporta MediaSource."
        );

    }


    const video =
        playerState.videoElement;


    if (
        !video
    ) {

        throw new Error(
            "No existe el elemento <video>."
        );

    }


    const mediaSource =
        new MediaSource();


    playerState.mediaSource =
        mediaSource;


    const objectUrl =
        URL.createObjectURL(
            mediaSource
        );


    playerState.mediaSourceUrl =
        objectUrl;


    video.src =
        objectUrl;


    mediaSource.addEventListener(
        "sourceopen",
        () => {

            console.log(
                "[REPRODUCTOR] ✓ MediaSource abierto."
            );


            try {

                crearSourceBuffers(
                    info
                );

            } catch (
                error
            ) {

                console.error(
                    "[REPRODUCTOR]",
                    error
                );


                playerState.mp4Error =
                    true;

            }

        },
        {
            once:
                true
        }
    );

}


/* =========================================================
   ESPERAR MEDIASOURCE
========================================================= */

async function esperarMediaSourceAbierto() {

    const mediaSource =
        playerState.mediaSource;


    if (
        !mediaSource
    ) {

        throw new Error(
            "MediaSource no existe."
        );

    }


    if (
        mediaSource.readyState ===
        "open"
    ) {

        return;

    }


    await new Promise(
        (
            resolve,
            reject
        ) => {

            const timeout =
                setTimeout(
                    () => {

                        reject(
                            new Error(
                                "Timeout esperando MediaSource."
                            )
                        );

                    },
                    10000
                );


            const open =
                () => {

                    clearTimeout(
                        timeout
                    );


                    resolve();

                };


            const error =
                () => {

                    clearTimeout(
                        timeout
                    );


                    reject(
                        new Error(
                            "MediaSource informó un error."
                        )
                    );

                };


            mediaSource.addEventListener(
                "sourceopen",
                open,
                {
                    once:
                        true
                }
            );


            mediaSource.addEventListener(
                "error",
                error,
                {
                    once:
                        true
                }
            );

        }
    );

}


/* =========================================================
   CREAR SOURCEBUFFERS
========================================================= */

function crearSourceBuffers(
    info
) {

    const mediaSource =
        playerState.mediaSource;


    if (
        !mediaSource
    ) {

        throw new Error(
            "MediaSource no disponible."
        );

    }


    /*
     * Si ya fueron creados,
     * no los volvemos a crear.
     */

    if (
        playerState.sourceBuffers.size >
        0
    ) {

        return;

    }


    for (
        const track of
        info.tracks ||
        []
    ) {

        if (
            !track.codec
        ) {

            continue;

        }


        let mime =
            null;


        if (
            track.video
        ) {

            mime =
                `video/mp4; codecs="${track.codec}"`;

        } else if (
            track.audio
        ) {

            mime =
                `audio/mp4; codecs="${track.codec}"`;

        }


        if (
            !mime
        ) {

            continue;

        }


        console.log(
            `[REPRODUCTOR] Comprobando MSE: ${mime}`
        );


        if (
            !MediaSource.isTypeSupported(
                mime
            )
        ) {

            console.error(
                `[REPRODUCTOR] MSE no soporta ${mime}`
            );


            continue;

        }


        const sourceBuffer =
            mediaSource.addSourceBuffer(
                mime
            );


        playerState.sourceBuffers.set(
            track.id,
            sourceBuffer
        );


        playerState.sourceQueues.set(
            track.id,
            []
        );


        if (
            track.video
        ) {

            playerState.videoTrackId =
                track.id;

        }


        if (
            track.audio
        ) {

            playerState.audioTrackId =
                track.id;

        }


        sourceBuffer.addEventListener(
            "updateend",
            () => {

                bombearSourceBuffer(
                    track.id
                );


                actualizarDiagnostico();

            }
        );


        sourceBuffer.addEventListener(
            "error",
            () => {

                console.error(
                    `[REPRODUCTOR] SourceBuffer error track ${track.id}`
                );

            }
        );


        console.log(
            `[REPRODUCTOR] ✓ SourceBuffer track ${track.id}: ${mime}`
        );

    }


    if (
        playerState.videoTrackId ===
        null
    ) {

        throw new Error(
            "No se pudo crear el SourceBuffer de vídeo."
        );

    }

}


/* =========================================================
   PREPARAR SEGMENTACIÓN
========================================================= */

function prepararSegmentacion(
    info
) {

    const mp4box =
        playerState.mp4box;


    if (
        !mp4box
    ) {

        throw new Error(
            "MP4Box no existe."
        );

    }


    /*
     * Esperamos a que MediaSource
     * tenga abiertos los SourceBuffers.
     *
     * La configuración de segmentos
     * se realiza después.
     */

    esperarMediaSourceAbierto()
        .then(
            () => {

                if (
                    playerState.stopped
                ) {

                    return;

                }


                for (
                    const track of
                    info.tracks ||
                    []
                ) {

                    const sourceBuffer =
                        playerState.sourceBuffers.get(
                            track.id
                        );


                    if (
                        !sourceBuffer
                    ) {

                        continue;

                    }


                    mp4box.setSegmentOptions(
                        track.id,
                        sourceBuffer,
                        {
                            nbSamples:
                                MUESTRAS_POR_SEGMENTO,

                            rapAlignement:
                                true,

                            normalizeAudioSampleEntriesForMSE:
                                true

                        }
                    );


                    console.log(
                        `[REPRODUCTOR] ✓ Segmentación configurada track ${track.id}.`
                    );

                }


                const initSegments =
                    mp4box.initializeSegmentation(
                        "per-track"
                    );


                if (
                    !Array.isArray(
                        initSegments
                    )
                ) {

                    throw new Error(
                        "MP4Box no devolvió segmentos de inicialización."
                    );

                }


                for (
                    const init of
                    initSegments
                ) {

                    if (
                        !init ||
                        !init.buffer
                    ) {

                        continue;

                    }


                    encolarSourceBuffer(
                        init.id,
                        init.buffer
                    );


                    console.log(
                        `[REPRODUCTOR] ✓ Init segment track ${init.id}: ${formatoBytes(init.buffer.byteLength)}`
                    );

                }


                console.log(
                    "[REPRODUCTOR] ✓ Segmentación inicializada."
                );

            }
        )
        .catch(
            error => {

                console.error(
                    "[REPRODUCTOR] Error inicializando segmentación:",
                    error
                );


                playerState.mp4Error =
                    true;


                if (
                    playerState.metadataReject
                ) {

                    playerState.metadataReject(
                        error
                    );

                }

            }
        );

}


/* =========================================================
   ENCOLAR SOURCEBUFFER
========================================================= */

function encolarSourceBuffer(
    trackId,
    buffer
) {

    const queue =
        playerState.sourceQueues.get(
            trackId
        );


    if (
        !queue
    ) {

        console.error(
            `[REPRODUCTOR] No existe cola para track ${trackId}.`
        );


        return;

    }


    let copia;


    try {

        copia =
            buffer.slice(
                0
            );

    } catch {

        copia =
            buffer;

    }


    queue.push(
        copia
    );


    bombearSourceBuffer(
        trackId
    );

}


/* =========================================================
   BOMBEAR SOURCEBUFFER
========================================================= */

function bombearSourceBuffer(
    trackId
) {

    const sourceBuffer =
        playerState.sourceBuffers.get(
            trackId
        );


    const queue =
        playerState.sourceQueues.get(
            trackId
        );


    if (
        !sourceBuffer ||
        !queue ||
        sourceBuffer.updating ||
        queue.length ===
        0
    ) {

        return;

    }


    const mediaSource =
        playerState.mediaSource;


    if (
        !mediaSource ||
        mediaSource.readyState !==
        "open"
    ) {

        return;

    }


    const buffer =
        queue.shift();


    try {

        sourceBuffer.appendBuffer(
            buffer
        );


        playerState.totalAppended +=
            buffer.byteLength;


    } catch (
        error
    ) {

        queue.unshift(
            buffer
        );


        console.error(
            `[REPRODUCTOR] appendBuffer track ${trackId}:`,
            error
        );

    }

}


/* =========================================================
   OBTENER OFFSET SEEK
========================================================= */

function obtenerOffsetSeek(
    resultado
) {

    if (
        Number.isFinite(
            resultado
        )
    ) {

        return resultado;

    }


    if (
        resultado &&
        Number.isFinite(
            resultado.offset
        )
    ) {

        return resultado.offset;

    }


    return 0;

}


/* =========================================================
   ENCONTRAR MOOV
========================================================= */

async function localizarMOOV(
    operationId
) {

    const mp4box =
        playerState.mp4box;


    if (
        !mp4box
    ) {

        throw new Error(
            "MP4Box no está disponible."
        );

    }


    /*
     * Primer bloque.
     */

    let offset =
        0;


    const primerBloque =
        await leerRangoMega(
            0,
            Math.min(
                RANGO_INICIAL,
                playerState.fileSize
            )
        );


    if (
        playerState.stopped ||
        operationId !==
        playerState.operationId
    ) {

        return false;

    }


    const siguiente =
        mp4box.appendBuffer(
            primerBloque.buffer
        );


    offset =
        primerBloque.end +
        1;


    /*
     * MP4Box normalmente devuelve
     * el siguiente offset que necesita.
     *
     * Si devuelve una posición mucho
     * más adelante, saltamos directamente.
     */

    if (
        Number.isFinite(
            siguiente
        ) &&
        siguiente >= 0 &&
        siguiente <
            playerState.fileSize &&
        siguiente >
            offset
    ) {

        console.log(
            `[REPRODUCTOR] MP4Box solicita posición ${siguiente.toLocaleString()}`
        );


        offset =
            siguiente;

    }


    /*
     * Continuar hasta que MP4Box
     * encuentre MOOV / onReady.
     */

    while (
        !playerState.mp4Ready &&
        !playerState.mp4Error &&
        !playerState.stopped &&
        operationId ===
            playerState.operationId &&
        offset <
            playerState.fileSize
    ) {

        const size =
            Math.min(
                RANGO_MEDIA,
                playerState.fileSize -
                offset
            );


        const bloque =
            await leerRangoMega(
                offset,
                size
            );


        if (
            playerState.stopped ||
            operationId !==
                playerState.operationId
        ) {

            return false;

        }


        const resultado =
            mp4box.appendBuffer(
                bloque.buffer
            );


        const siguienteOffset =
            Number.isFinite(
                resultado
            )
                ? resultado
                : bloque.end +
                  1;


        /*
         * Si MP4Box pide una posición
         * diferente y válida, saltamos.
         */

        if (
            siguienteOffset >= 0 &&
            siguienteOffset <
                playerState.fileSize &&
            Math.abs(
                siguienteOffset -
                (
                    bloque.end +
                    1
                )
            ) >
                1024
        ) {

            console.log(
                `[REPRODUCTOR] MP4Box solicita nuevo offset: ${siguienteOffset.toLocaleString()}`
            );


            offset =
                siguienteOffset;

        } else {

            offset =
                bloque.end +
                1;

        }


        /*
         * Protección.

         * Si ya descargamos demasiado
         * durante la localización sin
         * encontrar MOOV, detenemos.
         */

        if (
            playerState.totalDownloaded >=
            LIMITE_DESCARGA_SESION
        ) {

            throw new Error(
                "No se encontró la estructura MOOV antes del límite de seguridad."
            );

        }

    }


    return (
        playerState.mp4Ready
    );

}


/* =========================================================
   ESPERAR A QUE LAS COLAS TERMINEN
========================================================= */

function esperarColas() {

    return new Promise(
        resolve => {

            const inicio =
                Date.now();


            const revisar =
                () => {

                    let pendiente =
                        false;


                    for (
                        const queue
                        of
                        playerState
                            .sourceQueues
                            .values()
                    ) {

                        if (
                            queue.length >
                            0
                        ) {

                            pendiente =
                                true;


                            break;

                        }

                    }


                    for (
                        const sourceBuffer
                        of
                        playerState
                            .sourceBuffers
                            .values()
                    ) {

                        if (
                            sourceBuffer.updating
                        ) {

                            pendiente =
                                true;


                            break;

                        }

                    }


                    if (
                        !pendiente
                    ) {

                        resolve();

                        return;

                    }


                    if (
                        Date.now() -
                        inicio >
                        TIMEOUT_SOURCEBUFFER
                    ) {

                        resolve();

                        return;

                    }


                    setTimeout(
                        revisar,
                        50
                    );

                };


            revisar();

        }
    );

}


/* =========================================================
   ESPERAR A QUE EL BUFFER BAJE
========================================================= */

function esperarBufferBajo(
    operationId
) {

    return new Promise(
        resolve => {

            const revisar =
                () => {

                    if (
                        playerState.stopped ||
                        operationId !==
                            playerState.operationId
                    ) {

                        resolve();

                        return;

                    }


                    const buffer =
                        obtenerBufferAdelante();


                    if (
                        buffer <=
                        BUFFER_BAJO
                    ) {

                        resolve();

                        return;

                    }


                    setTimeout(
                        revisar,
                        500
                    );

                };


            revisar();

        }
    );

}


/* =========================================================
   INICIAR STREAMING MULTIMEDIA
========================================================= */

async function iniciarStreamingMedia(
    offsetInicial,
    operationId
) {

    const mp4box =
        playerState.mp4box;


    if (
        !mp4box
    ) {

        throw new Error(
            "MP4Box no está disponible."
        );

    }


    let offset =
        Math.max(
            0,
            Math.floor(
                offsetInicial
            )
        );


    playerState.cursor =
        offset;


    console.log(
        `[REPRODUCTOR] MP4Box.seek(0,true) → ${offset.toLocaleString()}`
    );


    /*
     * Iniciar procesamiento
     * de muestras.
     */

    mp4box.start();


    playerState.streamStarted =
        true;


    console.log(
        "[REPRODUCTOR] ✓ MP4Box inició procesamiento."
    );


    while (
        !playerState.stopped &&
        !playerState.mp4Error &&
        operationId ===
            playerState.operationId &&
        offset <
            playerState.fileSize
    ) {

        /*
         * Límite de seguridad.
         */

        if (
            playerState.totalDownloaded >=
            LIMITE_DESCARGA_SESION
        ) {

            console.log(
                "[REPRODUCTOR] Límite de seguridad alcanzado."
            );


            actualizarEstadoPlayer(
                "Reproducción activa — buffer limitado por laboratorio."
            );


            break;

        }


        /*
         * Si tenemos suficiente buffer,
         * esperamos a que baje.
         */

        const buffer =
            obtenerBufferAdelante();


        if (
            buffer >=
            BUFFER_OBJETIVO
        ) {

            await esperarBufferBajo(
                operationId
            );


            continue;

        }


        const size =
            Math.min(
                RANGO_MEDIA,
                playerState.fileSize -
                offset
            );


        const bloque =
            await leerRangoMega(
                offset,
                size
            );


        if (
            playerState.stopped ||
            operationId !==
                playerState.operationId
        ) {

            break;

        }


        /*
         * Entregar datos a MP4Box.
         */

        const siguiente =
            mp4box.appendBuffer(
                bloque.buffer
            );


        /*
         * El cursor real de lectura
         * continúa secuencialmente.

         * El valor devuelto por MP4Box
         * se registra para diagnóstico.
         */

        if (
            Number.isFinite(
                siguiente
            ) &&
            siguiente !==
                bloque.end +
                1
        ) {

            console.log(
                `[REPRODUCTOR] MP4Box siguiente posición interna: ${siguiente.toLocaleString()}`
            );

        }


        offset =
            bloque.end +
            1;


        playerState.cursor =
            offset;


        actualizarDiagnostico();


        /*
         * Intentar reproducción
         * cuando haya buffer.
         */

        await intentarReproduccion();


        /*
         * Dar tiempo al navegador
         * para procesar SourceBuffer.
         */

        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    10
                )
        );

    }


    /*
     * Finalizar MP4Box si realmente
     * llegamos al final del archivo.
     */

    if (
        offset >=
            playerState.fileSize &&
        !playerState.stopped &&
        !playerState.mp4Error
    ) {

        try {

            mp4box.flush();

        } catch (
            error
        ) {

            console.warn(
                "[REPRODUCTOR] Error en flush:",
                error
            );

        }

    }


    await esperarColas();


    actualizarDiagnostico();

}


/* =========================================================
   INTENTAR REPRODUCCIÓN
========================================================= */

async function intentarReproduccion() {

    const video =
        playerState.videoElement;


    if (
        !video ||
        playerState.playbackStarted ||
        playerState.stopped
    ) {

        return;

    }


    const buffer =
        obtenerBufferAdelante();


    if (
        buffer <
        BUFFER_INICIAL
    ) {

        return;

    }


    try {

        await video.play();


        playerState.playbackStarted =
            true;


        ocultarLoading();


        actualizarEstadoPlayer(
            "Reproduciendo"
        );


        actualizarBotonPlay();


    } catch (
        error
    ) {

        /*
         * Autoplay puede ser bloqueado
         * por el navegador.

         * No es un error del reproductor.
         */

        console.log(
            "[REPRODUCTOR] Autoplay bloqueado. El usuario debe pulsar PLAY."
        );


        ocultarLoading();


        actualizarEstadoPlayer(
            "Vídeo listo — pulsa PLAY."
        );

    }

}


/* =========================================================
   CARGAR ARCHIVO MEGA
========================================================= */

async function prepararArchivoMega(
    drama
) {

    const embedUrl =
        typeof drama.embed_url ===
            "string"
            ? drama.embed_url.trim()
            : "";


    if (
        !embedUrl
    ) {

        throw new Error(
            "Este microdrama no tiene enlace de vídeo."
        );

    }


    if (
        !MEGAFile
    ) {

        throw new Error(
            "MEGAJS todavía no está cargado."
        );

    }


    console.log(
        "[REPRODUCTOR] Creando archivo MEGA..."
    );


    const file =
        MEGAFile.fromURL(
            embedUrl
        );


    if (
        !file
    ) {

        throw new Error(
            "MEGAJS no pudo crear el archivo."
        );

    }


    console.log(
        "[REPRODUCTOR] Cargando atributos del archivo MEGA..."
    );


    const loaded =
        await file.loadAttributes();


    playerState.file =
        loaded ||
        file;


    playerState.fileSize =
        Number(
            playerState.file.size ||
            0
        );


    if (
        !playerState.fileSize
    ) {

        throw new Error(
            "MEGAJS no devolvió el tamaño del archivo."
        );

    }


    playerState.megaLoaded =
        true;


    console.log(
        `[REPRODUCTOR] ✓ Archivo MEGA: ${playerState.file.name || "sin nombre"}`
    );


    console.log(
        `[REPRODUCTOR] ✓ Tamaño: ${formatoBytes(playerState.fileSize)}`
    );


    return playerState.file;

}


/* =========================================================
   ABRIR REPRODUCTOR
========================================================= */

async function reproducirDrama(
    drama
) {

    if (
        !drama
    ) {

        return;

    }


    if (
        esDramaBorrador(
            drama
        )
    ) {

        console.warn(
            "[REPRODUCTOR] El microdrama está en Borrador."
        );


        return;

    }


    const embedUrl =
        typeof drama.embed_url ===
            "string"
            ? drama.embed_url.trim()
            : "";


    if (
        !embedUrl
    ) {

        mostrarMensajeSinVideo(
            drama.title
        );


        return;

    }


    /*
     * Si ya existe una sesión,
     * la detenemos antes de abrir otra.
     */

    if (
        playerState.open
    ) {

        detenerReproductor();

    }


    crearReproductor();


    const elementos =
        playerState.playerElements;


    const operationId =
        ++playerState.operationId;


    playerState.open =
        true;


    playerState.loading =
        true;


    playerState.stopped =
        false;


    playerState.drama =
        drama;


    playerState.mp4box =
        null;


    playerState.mp4Info =
        null;


    playerState.mp4Ready =
        false;


    playerState.mp4Error =
        false;


    playerState.mediaSource =
        null;


    playerState.mediaSourceUrl =
        null;


    playerState.sourceBuffers =
        new Map();


    playerState.sourceQueues =
        new Map();


    playerState.videoTrackId =
        null;


    playerState.audioTrackId =
        null;


    playerState.totalDownloaded =
        0;


    playerState.totalSegments =
        0;


    playerState.totalAppended =
        0;


    playerState.megaRequests =
        0;


    playerState.cursor =
        0;


    playerState.playbackStarted =
        false;


    playerState.streamStarted =
        false;


    playerState.pendingRead =
        false;


    reproductorActual =
        drama;


    elementos.titulo.textContent =
        drama.title;


    elementos.video.removeAttribute(
        "src"
    );


    elementos.video.load();


    elementos.progress.value =
        "0";


    elementos.time.textContent =
        "0:00 / 0:00";


    mostrarLoading(
        "Cargando reproductor..."
    );


    actualizarEstadoPlayer(
        "Cargando MEGAJS y MP4Box..."
    );


    elementos.reproductor.classList.add(
        "is-open"
    );


    elementos.reproductor.setAttribute(
        "aria-hidden",
        "false"
    );


    document.body.classList.add(
        "video-player-open"
    );


    /*
     * Registrar vista.
     *
     * No bloquea el reproductor.
     */

    registrarVista(
        drama
    ).then(
        viewsActualizadas => {

            if (
                viewsActualizadas ===
                null
            ) {

                return;

            }


            drama.views =
                viewsActualizadas;


            actualizarTOPTarjeta(
                drama,
                viewsActualizadas
            );

        }
    );


    try {

        /*
         * ---------------------------------------------
         * LIBRERÍAS
         * ---------------------------------------------
         */

        await cargarLibreriasReproductor();


        if (
            operationId !==
            playerState.operationId ||
            playerState.stopped
        ) {

            return;

        }


        /*
         * ---------------------------------------------
         * ARCHIVO MEGA
         * ---------------------------------------------
         */

        actualizarEstadoPlayer(
            "Conectando con MEGA..."
        );


        await prepararArchivoMega(
            drama
        );


        /*
         * ---------------------------------------------
         * MP4BOX
         * ---------------------------------------------
         */

        playerState.mp4box =
            MP4BoxAPI.createFile();


        configurarMP4Box();


        crearPromesaMetadata();


        /*
         * ---------------------------------------------
         * LOCALIZAR MOOV
         * ---------------------------------------------
         */

        mostrarLoading(
            "Analizando estructura del vídeo..."
        );


        actualizarEstadoPlayer(
            "Buscando estructura MP4..."
        );


        const encontrado =
            await localizarMOOV(
                operationId
            );


        if (
            !encontrado
        ) {

            throw new Error(
                "No se pudo localizar la estructura MOOV del vídeo."
            );

        }


        if (
            playerState.mp4Error
        ) {

            throw new Error(
                "MP4Box informó un error."
            );

        }


        /*
         * ---------------------------------------------
         * ESPERAR METADATA
         * ---------------------------------------------
         */

        if (
            !playerState.mp4Ready
        ) {

            await Promise.race(
                [
                    playerState.metadataPromise,

                    new Promise(
                        resolve =>
                            setTimeout(
                                resolve,
                                5000
                            )
                    )

                ]
            );

        }


        if (
            !playerState.mp4Ready
        ) {

            throw new Error(
                "MP4Box no terminó de analizar el vídeo."
            );

        }


        /*
         * ---------------------------------------------
         * OBTENER OFFSET PARA MUESTRAS
         * ---------------------------------------------
         */

        let seekResult;


        try {

            seekResult =
                playerState.mp4box.seek(
                    0,
                    true
                );

        } catch (
            error
        ) {

            console.warn(
                "[REPRODUCTOR] seek() produjo un error:",
                error
            );


            seekResult =
                0;

        }


        const mediaOffset =
            obtenerOffsetSeek(
                seekResult
            );


        console.log(
            `[REPRODUCTOR] ✓ MP4Box.seek(0,true) → ${mediaOffset.toLocaleString()}`
        );


        actualizarEstadoPlayer(
            "Preparando segmentos..."
        );


        mostrarLoading(
            "Preparando vídeo..."
        );


        /*
         * ---------------------------------------------
         * ESPERAR SOURCEBUFFERS
         * ---------------------------------------------
         */

        await esperarMediaSourceAbierto();


        /*
         * Esperar un poco para que
         * los SourceBuffers sean creados.
         */

        const inicioBuffers =
            Date.now();


        while (
            playerState.sourceBuffers.size ===
                0 &&
            Date.now() -
                inicioBuffers <
                10000
        ) {

            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        50
                    )
            );

        }


        if (
            playerState.sourceBuffers.size ===
            0
        ) {

            throw new Error(
                "No se pudieron crear los SourceBuffers."
            );

        }


        /*
         * ---------------------------------------------
         * INICIAR STREAMING
         * ---------------------------------------------
         */

        mostrarLoading(
            "Iniciando reproducción..."
        );


        actualizarEstadoPlayer(
            "Descargando vídeo..."
        );


        await iniciarStreamingMedia(
            mediaOffset,
            operationId
        );


        if (
            !playerState.playbackStarted &&
            obtenerBufferAdelante() >=
                BUFFER_INICIAL
        ) {

            await intentarReproduccion();

        }


    } catch (
        error
    ) {

        console.error(
            "[REPRODUCTOR] Error:",
            error
        );


        if (
            operationId !==
            playerState.operationId
        ) {

            return;

        }


        playerState.mp4Error =
            true;


        actualizarEstadoPlayer(
            `Error: ${error.message || error}`
        );


        mostrarLoading(
            error.message ||
            "No se pudo reproducir el vídeo."
        );

    } finally {

        if (
            operationId ===
            playerState.operationId
        ) {

            playerState.loading =
                false;


            actualizarDiagnostico();

        }

    }

}


/* =========================================================
   ACTUALIZAR TOP DE TARJETA
========================================================= */

function actualizarTOPTarjeta(
    drama,
    views
) {

    if (
        Number(
            views
        ) <
        3
    ) {

        return;

    }


    const tarjetas =
        document.querySelectorAll(
            ".drama-card"
        );


    tarjetas.forEach(
        tarjeta => {

            const boton =
                tarjeta.querySelector(
                    ".drama-card__play"
                );


            if (
                !boton
            ) {

                return;

            }


            if (
                boton.dataset.dramaId !==
                String(
                    drama.id
                )
            ) {

                return;

            }


            if (
                tarjeta.querySelector(
                    ".drama-card__top"
                )
            ) {

                return;

            }


            const etiquetaTop =
                document.createElement(
                    "div"
                );


            etiquetaTop.className =
                "drama-card__top";


            etiquetaTop.innerHTML =
                `
                <span aria-hidden="true">🔥</span>
                TOP
                `;


            etiquetaTop.setAttribute(
                "aria-label",
                "Microdrama TOP"
            );


            tarjeta.appendChild(
                etiquetaTop
            );

        }
    );

}


/* =========================================================
   DIAGNÓSTICO
========================================================= */

function actualizarDiagnostico() {

    const video =
        playerState.videoElement;


    if (
        !video
    ) {

        return;

    }


    const buffer =
        obtenerBufferAdelante();


    const elementos =
        playerState.playerElements;


    if (
        !elementos
    ) {

        return;

    }


    /*
     * Mantener información útil
     * pero sin llenar la interfaz.
     */

    const estado =
        playerState.mp4Error
            ? "ERROR"
            : playerState.playbackStarted
                ? "REPRODUCIENDO"
                : playerState.streamStarted
                    ? "CARGANDO"
                    : "PREPARANDO";


    elementos.status.textContent =
        `${estado} · Buffer ${buffer.toFixed(1)}s · ${formatoBytes(playerState.totalDownloaded)} · Seg ${playerState.totalSegments}`;

}


/* =========================================================
   DETENER REPRODUCTOR
========================================================= */

function detenerReproductor() {

    playerState.stopped =
        true;


    playerState.open =
        false;


    playerState.loading =
        false;


    playerState.operationId++;


    if (
        playerState.mp4box
    ) {

        try {

            playerState.mp4box.stop();

        } catch (
            error
        ) {

            console.warn(
                error
            );

        }

    }


    const video =
        playerState.videoElement;


    if (
        video
    ) {

        try {

            video.pause();

        } catch {

            /* Sin acción */

        }


        video.removeAttribute(
            "src"
        );


        video.load();

    }


    if (
        playerState.mediaSource &&
        playerState.mediaSource.readyState ===
            "open"
    ) {

        try {

            playerState.mediaSource.endOfStream();

        } catch {

            /* Puede ocurrir si hay
               operaciones pendientes. */

        }

    }


    if (
        playerState.mediaSourceUrl
    ) {

        try {

            URL.revokeObjectURL(
                playerState.mediaSourceUrl
            );

        } catch {

            /* Sin acción */

        }

    }


    playerState.mediaSource =
        null;


    playerState.mediaSourceUrl =
        null;


    playerState.mp4box =
        null;


    playerState.sourceBuffers =
        new Map();


    playerState.sourceQueues =
        new Map();


    playerState.streamStarted =
        false;


    playerState.playbackStarted =
        false;


    reproductorActual =
        null;

}


/* =========================================================
   CERRAR REPRODUCTOR
========================================================= */

function cerrarReproductor() {

    const reproductor =
        document.getElementById(
            "md-player"
        );


    if (
        !reproductor
    ) {

        return;

    }


    detenerReproductor();


    reproductor.classList.remove(
        "is-open"
    );


    reproductor.setAttribute(
        "aria-hidden",
        "true"
    );


    document.body.classList.remove(
        "video-player-open"
    );

}


/* =========================================================
   MENSAJE SIN VIDEO
========================================================= */

function mostrarMensajeSinVideo(
    tituloDrama
) {

    const mensaje =
        document.createElement(
            "div"
        );


    mensaje.className =
        "video-missing-message";


    mensaje.innerHTML =
        `
        <div class="video-missing-message__box">

            <h2>
                Video no disponible
            </h2>

            <p>
                El microdrama
                <strong></strong>
                todavía no tiene un vídeo configurado.
            </p>

            <button
                type="button"
                class="video-missing-message__close"
            >
                Cerrar
            </button>

        </div>
        `;


    const titulo =
        mensaje.querySelector(
            "strong"
        );


    titulo.textContent =
        tituloDrama;


    const cerrar =
        mensaje.querySelector(
            ".video-missing-message__close"
        );


    cerrar.addEventListener(
        "click",
        () => {

            mensaje.remove();

        }
    );


    document.body.appendChild(
        mensaje
    );

}


/* =========================================================
   TECLA ESC
========================================================= */

document.addEventListener(
    "keydown",
    evento => {

        if (
            evento.key !==
            "Escape"
        ) {

            return;

        }


        const reproductor =
            document.getElementById(
                "md-player"
            );


        if (
            reproductor &&
            reproductor.classList.contains(
                "is-open"
            )
        ) {

            if (
                document.fullscreenElement
            ) {

                document.exitFullscreen()
                    .catch(
                        () => {}
                    );


                return;

            }


            cerrarReproductor();


            return;

        }


        cerrarDetalleMovil();

    }
);


/* =========================================================
   CAMBIO DE TAMAÑO
========================================================= */

window.addEventListener(
    "resize",
    () => {

        if (
            !esVistaMovil()
        ) {

            cerrarDetalleMovil();

        }

    }
);


/* =========================================================
   INICIALIZAR REPRODUCTOR
========================================================= */

function inicializarReproductor() {

    crearReproductor();


    /*
     * El reproductor no carga MEGAJS
     * hasta que el usuario pulsa "Ver".

     * Esto evita cargar librerías pesadas
     * al abrir simplemente el catálogo.
     */

}


/* =========================================================
   INICIAR APLICACIÓN
========================================================= */

inicializarReproductor();


cargarDramas();
