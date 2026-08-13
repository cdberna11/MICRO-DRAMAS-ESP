"use strict";

/* =========================================================
   MICRO-DRAMAS-ESP
   REPRODUCTOR PROPIO
   MEGAJS + MP4Box.js + MediaSource

   FUNCIONES:
   - Catálogo
   - Descripciones
   - Visitas
   - TOP
   - Recién agregado
   - Próximo estreno
   - Detalle móvil
   - MEGA privado
   - Buffer dinámico
   - Barra de progreso
   - SEEK
   - +/- 10 segundos
   - Teclado +/- 5 segundos
========================================================= */


/* =========================================================
   CONFIGURACIÓN
========================================================= */

const PORTADA_GENERICA =
    "/portadas/generica/portada-generica.png";

const MEGAJS_URL =
    "https://unpkg.com/megajs/dist/main.browser-es.mjs";

const MP4BOX_URL =
    "https://cdn.jsdelivr.net/npm/mp4box@2.4.1/dist/mp4box.all.mjs";

const RANGO_INICIAL =
    4 * 1024 * 1024;

const RANGO_MEDIA =
    8 * 1024 * 1024;

const MUESTRAS_POR_SEGMENTO =
    60;

const BUFFER_INICIAL =
    4;

const BUFFER_OBJETIVO =
    45;

const BUFFER_BAJO =
    8;

const TIMEOUT_SOURCEBUFFER =
    30000;


/*
 * No existe límite artificial
 * de descarga por sesión.
 */

const LIMITE_DESCARGA_SESION =
    Number.POSITIVE_INFINITY;


/*
 * Máximo de lectura utilizado para
 * reconstruir la estructura MP4
 * durante un SEEK remoto.
 */

const SEEK_REINICIO_MAX =
    16 * 1024 * 1024;


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

    streamGeneration:
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

    duration:
        0,

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

    playAttempt:
        false,

    metadataPromise:
        null,

    metadataResolve:
        null,

    metadataReject:
        null,

    playerElements:
        null,

    seekInProgress:
        false,

    seekToken:
        0,

    userSeeking:
        false,

    pendingSeekTime:
        null,

    allowAutoplay:
        true,

    bootstrapBuffers:
        [],

    bootstrapEnd:
        0,

    bootstrapReady:
        false,

    initSegments:
        new Map()

};


/* =========================================================
   LIBRERÍAS
========================================================= */

let libreriasPromise =
    null;

let MEGAFile =
    null;

let MP4BoxAPI =
    null;


/* =========================================================
   VISTA MÓVIL
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
   CARGAR CATÁLOGO
========================================================= */

async function cargarDramas() {

    const catalogo =
        document.getElementById(
            "catalogo"
        );


    if (
        !catalogo
    ) {

        console.error(
            'No se encontró #catalogo.'
        );

        return;

    }


    try {

        const respuesta =
            await fetch(
                "/api/dramas"
            );


        if (
            !respuesta.ok
        ) {

            throw new Error(
                `Error API: ${respuesta.status}`
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
                "Respuesta inválida de /api/dramas."
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
            "Error al cargar catálogo:",
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
   BORRADOR
========================================================= */

function esDramaBorrador(
    drama
) {

    if (
        !drama
    ) {

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
   DRAMA NUEVO
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


    const fecha =
        new Date(
            valor.endsWith("Z")
                ? valor
                : `${valor}Z`
        );


    if (
        Number.isNaN(
            fecha.getTime()
        )
    ) {

        return false;

    }


    const diferencia =
        Date.now() -
        fecha.getTime();


    return (
        diferencia >=
        0 &&
        diferencia <
        72 *
        60 *
        60 *
        1000
    );

}


/* =========================================================
   REGISTRAR VISTA
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


    if (
        !catalogo
    ) {

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


    if (
        esBorrador
    ) {

        const etiqueta =
            document.createElement(
                "div"
            );


        etiqueta.className =
            "drama-card__upcoming";


        etiqueta.textContent =
            "PRÓXIMO ESTRENO";


        tarjeta.appendChild(
            etiqueta
        );


    } else if (
        esDramaNuevo(
            drama.created_at
        )
    ) {

        const etiqueta =
            document.createElement(
                "div"
            );


        etiqueta.className =
            "drama-card__new";


        etiqueta.textContent =
            "RECIÉN AGREGADO";


        tarjeta.appendChild(
            etiqueta
        );

    }


    if (
        Number(
            drama.views
        ) >=
        3
    ) {

        const top =
            document.createElement(
                "div"
            );


        top.className =
            "drama-card__top";


        top.innerHTML =
            `
            <span aria-hidden="true">
                🔥
            </span>
            TOP
            `;


        tarjeta.appendChild(
            top
        );

    }


    const portada =
        document.createElement(
            "img"
        );


    portada.className =
        "drama-card__cover";


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


    const overlay =
        document.createElement(
            "div"
        );


    overlay.className =
        "drama-card__overlay";


    const titulo =
        document.createElement(
            "h2"
        );


    titulo.className =
        "drama-card__title";


    titulo.textContent =
        drama.title;


    const tipo =
        document.createElement(
            "p"
        );


    tipo.className =
        "drama-card__type";


    tipo.textContent =
        "Microdrama doblado al español.";


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
        "aria-expanded",
        "false"
    );


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
            : (
                typeof drama.description ===
                "string"
                    ? drama.description.trim()
                    : ""
            );


    descripcion.textContent =
        descripcionTexto ||
        "Sin descripción disponible.";


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


    const vistas =
        document.createElement(
            "span"
        );


    vistas.className =
        "drama-card__views";


    actualizarTextoVistas(
        vistas,
        Number(
            drama.views
        ) || 0
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


    controles.appendChild(
        vistas
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
   TEXTO DE VISTAS
========================================================= */

function actualizarTextoVistas(
    elemento,
    views
) {

    if (
        !elemento
    ) {

        return;

    }


    const cantidad =
        Number(
            views
        ) || 0;


    elemento.innerHTML =
        `
        <span aria-hidden="true">
            👁
        </span>
        ${cantidad}
        ${
            cantidad === 1
                ? "vista"
                : "vistas"
        }
        `;

}


/* =========================================================
   ACTUALIZAR VISTAS
========================================================= */

function actualizarVistasTarjeta(
    drama,
    views
) {

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


            const vistas =
                tarjeta.querySelector(
                    ".drama-card__views"
                );


            actualizarTextoVistas(
                vistas,
                views
            );


            if (
                Number(
                    views
                ) >=
                3 &&
                !tarjeta.querySelector(
                    ".drama-card__top"
                )
            ) {

                const top =
                    document.createElement(
                        "div"
                    );


                top.className =
                    "drama-card__top";


                top.innerHTML =
                    `
                    <span aria-hidden="true">
                        🔥
                    </span>
                    TOP
                    `;


                tarjeta.appendChild(
                    top
                );

            }

        }
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


    const cerrar =
        document.createElement(
            "button"
        );


    cerrar.type =
        "button";


    cerrar.className =
        "mobile-detail__close";


    cerrar.textContent =
        "×";


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


    const vistas =
        document.createElement(
            "p"
        );


    vistas.className =
        "mobile-detail__views";


    const acciones =
        document.createElement(
            "div"
        );


    acciones.className =
        "mobile-detail__actions";


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


    const descripcionTitulo =
        document.createElement(
            "h3"
        );


    descripcionTitulo.textContent =
        "Descripción";


    const descripcion =
        document.createElement(
            "p"
        );


    descripcion.className =
        "mobile-detail__description";


    botonVer.addEventListener(
        "click",
        evento => {

            evento.preventDefault();


            if (
                detalleMovilActual
            ) {

                reproducirDrama(
                    detalleMovilActual
                );

            }

        }
    );


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
        vistas
    );


    contenido.appendChild(
        acciones
    );


    contenido.appendChild(
        descripcionTitulo
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


function abrirDetalleMovil(
    drama
) {

    crearDetalleMovil();


    const detalle =
        document.getElementById(
            "detalle-movil"
        );


    if (
        !detalle
    ) {

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


    const vistas =
        detalle.querySelector(
            ".mobile-detail__views"
        );


    const descripcion =
        detalle.querySelector(
            ".mobile-detail__description"
        );


    const botonVer =
        detalle.querySelector(
            ".mobile-detail__play"
        );


    imagen.src =
        typeof drama.cover_url ===
        "string" &&
        drama.cover_url.trim() !==
        ""
            ? drama.cover_url.trim()
            : PORTADA_GENERICA;


    imagen.alt =
        `Portada de ${drama.title}`;


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


    actualizarTextoVistas(
        vistas,
        Number(
            drama.views
        ) || 0
    );


    const descripcionTexto =
        typeof drama.video_description ===
        "string" &&
        drama.video_description.trim() !==
        ""
            ? drama.video_description.trim()
            : (
                typeof drama.description ===
                "string"
                    ? drama.description.trim()
                    : ""
            );


    descripcion.textContent =
        descripcionTexto ||
        "Sin descripción disponible.";


    botonVer.hidden =
        esDramaBorrador(
            drama
        );


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


function cerrarDetalleMovil() {

    const detalle =
        document.getElementById(
            "detalle-movil"
        );


    if (
        !detalle
    ) {

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
   ESTILOS REPRODUCTOR
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
.md-player {
    position: fixed;
    inset: 0;
    z-index: 999999;
    display: none;
    align-items: center;
    justify-content: center;
    background: rgba(0,0,0,0.94);
    padding: 20px;
    box-sizing: border-box;
}

.md-player.is-open {
    display: flex;
}

.md-player__window {
    width: min(1200px,100%);
    max-height: 95vh;
    display: flex;
    flex-direction: column;
    background: #080808;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 25px 80px rgba(0,0,0,0.65);
}

.md-player__header {
    min-height: 54px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 15px;
    padding: 0 16px;
    background: #111;
    color: #fff;
}

.md-player__title {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.md-player__close {
    width: 38px;
    height: 38px;
    flex: 0 0 38px;
    border: 0;
    border-radius: 50%;
    background: rgba(255,255,255,0.10);
    color: #fff;
    font-size: 26px;
    cursor: pointer;
}

.md-player__area {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    min-height: 240px;
    background: #000;
    overflow: hidden;
}

.md-player__video {
    display: block;
    width: 100%;
    height: 100%;
    background: #000;
    object-fit: contain;
}

.md-player__loading {
    position: absolute;
    inset: 0;
    z-index: 3;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 12px;
    background: rgba(0,0,0,0.72);
    color: #fff;
    text-align: center;
    pointer-events: none;
    opacity: 1;
    transition: opacity .2s ease;
}

.md-player__loading.is-hidden {
    opacity: 0;
}

.md-player__spinner {
    width: 38px;
    height: 38px;
    border: 3px solid rgba(255,255,255,0.25);
    border-top-color: #fff;
    border-radius: 50%;
    animation: mdPlayerSpin .8s linear infinite;
}

@keyframes mdPlayerSpin {
    to {
        transform: rotate(360deg);
    }
}

.md-player__message {
    max-width: 90%;
    font-size: 14px;
}

.md-player__controls {
    padding: 10px 12px 12px;
    background: #111;
    color: #fff;
}

.md-player__progress {
    width: 100%;
    height: 5px;
    appearance: none;
    cursor: pointer;
    background: #444;
    border-radius: 999px;
    margin: 0 0 10px;
}

.md-player__progress::-webkit-slider-thumb {
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    cursor: pointer;
}

.md-player__progress::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border: 0;
    border-radius: 50%;
    background: #fff;
    cursor: pointer;
}

.md-player__buttons {
    display: flex;
    align-items: center;
    gap: 7px;
}

.md-player__button {
    min-width: 36px;
    height: 36px;
    padding: 0 9px;
    border: 0;
    border-radius: 7px;
    background: rgba(255,255,255,0.10);
    color: #fff;
    cursor: pointer;
    font-size: 14px;
}

.md-player__button:hover {
    background: rgba(255,255,255,0.18);
}

.md-player__volume {
    width: 85px;
}

.md-player__time {
    margin-left: auto;
    font-size: 12px;
    white-space: nowrap;
}

.md-player__status {
    margin-top: 8px;
    min-height: 16px;
    font-family: monospace;
    font-size: 10px;
    color: rgba(255,255,255,0.55);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

@media (max-width:700px) {
    .md-player {
        padding: 0;
    }

    .md-player__window {
        width: 100%;
        height: 100vh;
        max-height: 100vh;
        border-radius: 0;
    }

    .md-player__area {
        flex: 1;
        min-height: 0;
        aspect-ratio: auto;
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

    insertarEstilosReproductor();


    if (
        document.getElementById(
            "md-player"
        )
    ) {

        return;

    }


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


    const header =
        document.createElement(
            "div"
        );


    header.className =
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


    video.setAttribute(
        "playsinline",
        ""
    );


    video.preload =
        "auto";


    video.controls =
        false;


    video.volume =
        1;


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


    const controls =
        document.createElement(
            "div"
        );


    controls.className =
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


    progress.step =
        "0.01";


    progress.value =
        "0";


    const buttons =
        document.createElement(
            "div"
        );


    buttons.className =
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


    const time =
        document.createElement(
            "span"
        );


    time.className =
        "md-player__time";


    time.textContent =
        "0:00 / 0:00";


    const status =
        document.createElement(
            "div"
        );


    status.className =
        "md-player__status";


    status.textContent =
        "Preparando";


    header.appendChild(
        titulo
    );


    header.appendChild(
        cerrar
    );


    buttons.appendChild(
        play
    );


    buttons.appendChild(
        retroceder
    );


    buttons.appendChild(
        avanzar
    );


    buttons.appendChild(
        mute
    );


    buttons.appendChild(
        volume
    );


    buttons.appendChild(
        fullscreen
    );


    buttons.appendChild(
        time
    );


    controls.appendChild(
        progress
    );


    controls.appendChild(
        buttons
    );


    controls.appendChild(
        status
    );


    ventana.appendChild(
        header
    );


    ventana.appendChild(
        area
    );


    ventana.appendChild(
        controls
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


    cerrar.addEventListener(
        "click",
        cerrarReproductor
    );


    play.addEventListener(
        "click",
        async () => {

            if (
                !video.paused
            ) {

                playerState.allowAutoplay =
                    false;

                video.pause();

                return;

            }


            playerState.allowAutoplay =
                true;


            try {

                await video.play();

            } catch {

                actualizarEstadoPlayer(
                    "Pulsa PLAY para iniciar."
                );

            }

        }
    );


    /* =====================================================
       BOTÓN -10
    ===================================================== */

    retroceder.addEventListener(
        "click",
        evento => {

            evento.preventDefault();
            evento.stopPropagation();


            ejecutarSaltoSegundos(
                -10
            );

        }
    );


    /* =====================================================
       BOTÓN +10
    ===================================================== */

    avanzar.addEventListener(
        "click",
        evento => {

            evento.preventDefault();
            evento.stopPropagation();


            ejecutarSaltoSegundos(
                10
            );

        }
    );


    mute.addEventListener(
        "click",
        () => {

            video.muted =
                !video.muted;


            actualizarIconoVolumen();

        }
    );


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


    fullscreen.addEventListener(
        "click",
        alternarPantallaCompleta
    );


    /* =====================================================
       BARRA
    ===================================================== */

    progress.addEventListener(
        "pointerdown",
        () => {

            playerState.userSeeking =
                true;

            playerState.pendingSeekTime =
                null;

        }
    );


    progress.addEventListener(
        "input",
        () => {

            const duration =
                obtenerDuracionVideo();


            if (
                !Number.isFinite(
                    duration
                ) ||
                duration <=
                0
            ) {

                return;

            }


            const destino =
                duration *
                (
                    Number(
                        progress.value
                    ) /
                    100
                );


            playerState.pendingSeekTime =
                destino;


            time.textContent =
                `${formatoTiempo(destino)} / ${formatoTiempo(duration)}`;

        }
    );


    progress.addEventListener(
        "change",
        () => {

            ejecutarSeekDesdeBarra();

        }
    );


    video.addEventListener(
        "play",
        () => {

            actualizarBotonPlay();

        }
    );


    video.addEventListener(
        "pause",
        () => {

            actualizarBotonPlay();


            if (
                !playerState.seekInProgress &&
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

            if (
                !playerState.seekInProgress
            ) {

                mostrarLoading(
                    "Cargando más vídeo..."
                );

            }

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
        "seeking",
        () => {

            console.log(
                `[SEEK] Evento seeking → ${video.currentTime.toFixed(2)}`
            );

        }
    );


    video.addEventListener(
        "seeked",
        () => {

            console.log(
                `[SEEK] Evento seeked → ${video.currentTime.toFixed(2)}`
            );


            actualizarControlesVideo();

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

}


/* =========================================================
   DURACIÓN REAL DEL MP4
========================================================= */

function obtenerDuracionMP4(
    info
) {

    if (
        !info
    ) {

        return 0;

    }


    const duration =
        Number(
            info.duration
        );


    const timescale =
        Number(
            info.timescale
        );


    if (
        Number.isFinite(
            duration
        ) &&
        duration >
        0 &&
        Number.isFinite(
            timescale
        ) &&
        timescale >
        0
    ) {

        return (
            duration /
            timescale
        );

    }


    if (
        Array.isArray(
            info.tracks
        )
    ) {

        let mayor =
            0;


        for (
            const track
            of
            info.tracks
        ) {

            const td =
                Number(
                    track.duration
                );


            const ts =
                Number(
                    track.timescale
                );


            if (
                Number.isFinite(
                    td
                ) &&
                td >
                0
            ) {

                const segundos =
                    Number.isFinite(
                        ts
                    ) &&
                    ts >
                    0
                        ? td / ts
                        : td;


                mayor =
                    Math.max(
                        mayor,
                        segundos
                    );

            }

        }


        if (
            mayor >
            0
        ) {

            return mayor;

        }

    }


    return 0;

}


/* =========================================================
   DURACIÓN USADA POR LOS CONTROLES
========================================================= */

function obtenerDuracionVideo() {

    const video =
        playerState.videoElement;


    const videoDuration =
        Number(
            video?.duration
        );


    if (
        Number.isFinite(
            videoDuration
        ) &&
        videoDuration >
        0
    ) {

        return videoDuration;

    }


    const mp4Duration =
        Number(
            playerState.duration
        );


    if (
        Number.isFinite(
            mp4Duration
        ) &&
        mp4Duration >
        0
    ) {

        return mp4Duration;

    }


    return 0;

}


/* =========================================================
   LOADING
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
   ESTADO
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
   FORMATO TIEMPO
========================================================= */

function formatoTiempo(
    segundos
) {

    if (
        !Number.isFinite(
            segundos
        ) ||
        segundos <
        0
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
        horas >
        0
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
        bytes <=
        0
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
        unidades[
            indice
        ]
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
        obtenerDuracionVideo();


    const current =
        Number(
            video.currentTime
        );


    if (
        Number.isFinite(
            duration
        ) &&
        duration >
        0 &&
        !playerState.userSeeking &&
        !playerState.seekInProgress
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


    actualizarDiagnostico();

}


/* =========================================================
   BUFFER
========================================================= */

function estaEnBuffer(
    tiempo
) {

    const video =
        playerState.videoElement;


    if (
        !video ||
        !video.buffered
    ) {

        return false;

    }


    for (
        let i = 0;
        i <
        video.buffered.length;
        i++
    ) {

        if (
            tiempo >=
            video.buffered.start(
                i
            ) &&
            tiempo <=
            video.buffered.end(
                i
            )
        ) {

            return true;

        }

    }


    return false;

}


function obtenerBufferAdelante() {

    const video =
        playerState.videoElement;


    if (
        !video ||
        !video.buffered ||
        video.buffered.length ===
        0
    ) {

        return 0;

    }


    const current =
        Number(
            video.currentTime
        );


    for (
        let i = 0;
        i <
        video.buffered.length;
        i++
    ) {

        const inicio =
            video.buffered.start(
                i
            );


        const fin =
            video.buffered.end(
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
   DIAGNÓSTICO
========================================================= */

function actualizarDiagnostico() {

    const elementos =
        playerState.playerElements;


    if (
        !elementos
    ) {

        return;

    }


    const buffer =
        obtenerBufferAdelante();


    const estado =
        playerState.mp4Error
            ? "ERROR"
            : playerState.seekInProgress
                ? "SEEK"
                : playerState.playbackStarted
                    ? "REPRODUCIENDO"
                    : playerState.streamStarted
                        ? "CARGANDO"
                        : "PREPARANDO";


    elementos.status.textContent =
        `${estado} · Buffer ${buffer.toFixed(1)}s · ${formatoBytes(playerState.totalDownloaded)} · Seg ${playerState.totalSegments}`;

}


/* =========================================================
   VOLUMEN
========================================================= */

function actualizarIconoVolumen() {

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


    if (
        video.muted ||
        video.volume ===
        0
    ) {

        elementos.mute.textContent =
            "🔇";


    } else if (
        video.volume <
        0.5
    ) {

        elementos.mute.textContent =
            "🔉";


    } else {

        elementos.mute.textContent =
            "🔊";

    }

}


/* =========================================================
   PLAY
========================================================= */

function actualizarBotonPlay() {

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


    elementos.play.textContent =
        video.paused
            ? "▶"
            : "❚❚";

}


/* =========================================================
   LEER RANGO MEGA
========================================================= */

async function leerRangoMega(
    start,
    size,
    actualizarUI =
        true
) {

    const file =
        playerState.file;


    if (
        !file
    ) {

        throw new Error(
            "No existe archivo MEGA."
        );

    }


    if (
        start <
        0 ||
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


    if (
        actualizarUI
    ) {

        actualizarEstadoPlayer(
            `Descargando ${formatoBytes(esperado)}...`
        );

    }


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
            "MEGAJS no devolvió stream."
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


    let posicion =
        0;


    for (
        const chunk
        of
        chunks
    ) {

        resultado.set(
            chunk,
            posicion
        );


        posicion +=
            chunk.byteLength;

    }


    const buffer =
        resultado.buffer;


    /*
     * FUNDAMENTAL PARA MP4BOX
     */

    buffer.fileStart =
        start;


    playerState.totalDownloaded +=
        recibido;


    playerState.cursor =
        end +
        1;


    return {

        buffer:
            buffer,

        start:
            start,

        end:
            end,

        size:
            recibido

    };

}


/* =========================================================
   PROMESA METADATA
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

function configurarMP4Box(
    mp4box
) {

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


            /*
             * OBTENER DURACIÓN
             */

            const duracion =
                obtenerDuracionMP4(
                    info
                );


            if (
                duracion >
                0
            ) {

                playerState.duration =
                    duracion;


                console.log(
                    `[REPRODUCTOR] ✓ Duración MP4: ${formatoTiempo(duracion)} (${duracion.toFixed(3)} s)`
                );

            } else {

                console.warn(
                    "[REPRODUCTOR] No se pudo obtener duración desde MP4Box."
                );

            }


            if (
                playerState.metadataResolve
            ) {

                playerState.metadataResolve(
                    info
                );

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
                playerState.sourceBuffers.entries()
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

                console.warn(
                    "[REPRODUCTOR] Segmento sin SourceBuffer:",
                    trackId
                );

                return;

            }


            encolarSourceBuffer(
                foundTrackId,
                buffer
            );


            actualizarDiagnostico();

        };

}


/* =========================================================
   CREAR MEDIASOURCE
========================================================= */

function crearMediaSource() {

    if (
        !window.MediaSource
    ) {

        throw new Error(
            "El navegador no soporta MediaSource."
        );

    }


    const video =
        playerState.videoElement;


    if (
        !video
    ) {

        throw new Error(
            "No existe el elemento video."
        );

    }


    const mediaSource =
        new MediaSource();


    playerState.mediaSource =
        mediaSource;


    const url =
        URL.createObjectURL(
            mediaSource
        );


    playerState.mediaSourceUrl =
        url;


    video.src =
        url;


    return new Promise(
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


            mediaSource.addEventListener(
                "sourceopen",
                () => {

                    clearTimeout(
                        timeout
                    );


                    /*
                     * ASIGNAR DURACIÓN REAL
                     */

                    if (
                        playerState.duration >
                        0
                    ) {

                        try {

                            mediaSource.duration =
                                playerState.duration;


                            console.log(
                                `[REPRODUCTOR] ✓ MediaSource.duration = ${playerState.duration.toFixed(3)}`
                            );

                        } catch (
                            error
                        ) {

                            console.warn(
                                "[REPRODUCTOR] No se pudo asignar duration:",
                                error
                            );

                        }

                    }


                    resolve();

                },
                {
                    once:
                        true
                }
            );


            mediaSource.addEventListener(
                "error",
                () => {

                    clearTimeout(
                        timeout
                    );


                    reject(
                        new Error(
                            "MediaSource informó un error."
                        )
                    );

                },
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
        !mediaSource ||
        mediaSource.readyState !==
        "open"
    ) {

        throw new Error(
            "MediaSource no está abierto."
        );

    }


    playerState.sourceBuffers =
        new Map();


    playerState.sourceQueues =
        new Map();


    playerState.videoTrackId =
        null;


    playerState.audioTrackId =
        null;


    for (
        const track
        of
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
            !mime ||
            !MediaSource.isTypeSupported(
                mime
            )
        ) {

            console.warn(
                "[REPRODUCTOR] MSE no soporta:",
                mime
            );

            continue;

        }


        const sourceBuffer =
            mediaSource.addSourceBuffer(
                mime
            );


        sourceBuffer.mode =
            "segments";


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
                    "[REPRODUCTOR] SourceBuffer error:",
                    track.id
                );

            }
        );

    }


    if (
        playerState.videoTrackId ===
        null
    ) {

        throw new Error(
            "No se pudo crear SourceBuffer de vídeo."
        );

    }

}


/* =========================================================
   SEGMENTACIÓN
========================================================= */

function configurarSegmentacion(
    mp4box,
    info
) {

    playerState.initSegments =
        new Map();


    for (
        const track
        of
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
            "MP4Box no devolvió init segments."
        );

    }


    for (
        const init
        of
        initSegments
    ) {

        if (
            !init ||
            !init.buffer
        ) {

            continue;

        }


        const copia =
            init.buffer.slice(
                0
            );


        playerState.initSegments.set(
            init.id,
            copia
        );


        encolarSourceBuffer(
            init.id,
            copia
        );

    }


    console.log(
        "[REPRODUCTOR] ✓ Segmentación preparada."
    );

}


/* =========================================================
   ENCOLAR
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
   BOMBEAR
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
   ESPERAR COLAS
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
                        playerState.sourceQueues.values()
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


                    if (
                        !pendiente
                    ) {

                        for (
                            const sourceBuffer
                            of
                            playerState.sourceBuffers.values()
                        ) {

                            if (
                                sourceBuffer.updating
                            ) {

                                pendiente =
                                    true;

                                break;

                            }

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
   CREAR SESIÓN MSE
========================================================= */

async function crearSesionMedia(
    operationId
) {

    await crearMediaSource();


    if (
        playerState.stopped ||
        operationId !==
        playerState.operationId
    ) {

        return;

    }


    crearSourceBuffers(
        playerState.mp4Info
    );


    configurarSegmentacion(
        playerState.mp4box,
        playerState.mp4Info
    );


    await esperarColas();

}


/* =========================================================
   CREAR MP4BOX
========================================================= */

function crearNuevoMP4Box() {

    const mp4box =
        MP4BoxAPI.createFile();


    playerState.mp4box =
        mp4box;


    playerState.mp4Ready =
        false;


    playerState.mp4Error =
        false;


    crearPromesaMetadata();


    configurarMP4Box(
        mp4box
    );


    return mp4box;

}


/* =========================================================
   LOCALIZAR MOOV
========================================================= */

async function localizarMOOV(
    operationId,
    guardarBootstrap =
        true
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
        0;


    const bootstrap =
        [];


    const primerBloque =
        await leerRangoMega(
            0,
            Math.min(
                RANGO_INICIAL,
                playerState.fileSize
            ),
            false
        );


    if (
        playerState.stopped ||
        operationId !==
        playerState.operationId
    ) {

        return false;

    }


    if (
        guardarBootstrap
    ) {

        bootstrap.push(
            primerBloque.buffer.slice(
                0
            )
        );

    }


    let siguiente =
        mp4box.appendBuffer(
            primerBloque.buffer
        );


    offset =
        primerBloque.end +
        1;


    if (
        Number.isFinite(
            siguiente
        ) &&
        siguiente >
        offset &&
        siguiente <
        playerState.fileSize
    ) {

        offset =
            siguiente;

    }


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
                size,
                false
            );


        if (
            playerState.stopped ||
            operationId !==
            playerState.operationId
        ) {

            return false;

        }


        if (
            guardarBootstrap &&
            offset <
            SEEK_REINICIO_MAX
        ) {

            bootstrap.push(
                bloque.buffer.slice(
                    0
                )
            );

        }


        siguiente =
            mp4box.appendBuffer(
                bloque.buffer
            );


        offset =
            bloque.end +
            1;


        if (
            Number.isFinite(
                siguiente
            ) &&
            siguiente >
            offset &&
            siguiente <
            playerState.fileSize
        ) {

            offset =
                siguiente;

        }


        playerState.bootstrapEnd =
            offset;

    }


    if (
        guardarBootstrap
    ) {

        playerState.bootstrapBuffers =
            bootstrap;


        playerState.bootstrapEnd =
            offset;


        playerState.bootstrapReady =
            true;

    }


    return (
        playerState.mp4Ready
    );

}


/* =========================================================
   INICIAR SESIÓN
========================================================= */

async function inicializarSesionInicial(
    operationId
) {

    crearNuevoMP4Box();


    mostrarLoading(
        "Analizando estructura del vídeo..."
    );


    actualizarEstadoPlayer(
        "Buscando estructura MP4..."
    );


    const encontrado =
        await localizarMOOV(
            operationId,
            true
        );


    if (
        !encontrado
    ) {

        throw new Error(
            "No se pudo localizar MOOV."
        );

    }


    if (
        playerState.mp4Error
    ) {

        throw new Error(
            "MP4Box informó un error."
        );

    }


    if (
        playerState.duration >
        0
    ) {

        actualizarControlesVideo();

    }


    await crearSesionMedia(
        operationId
    );


    let resultadoSeek =
        0;


    try {

        resultadoSeek =
            playerState.mp4box.seek(
                0,
                true
            );

    } catch (
        error
    ) {

        console.warn(
            "[REPRODUCTOR] seek inicial:",
            error
        );

    }


    const offset =
        obtenerOffsetSeek(
            resultadoSeek
        );


    console.log(
        `[REPRODUCTOR] ✓ Inicio multimedia: ${offset.toLocaleString()}`
    );


    iniciarStreamingMedia(
        offset,
        operationId,
        playerState.streamGeneration
    ).catch(
        error => {

            if (
                !playerState.stopped
            ) {

                console.error(
                    "[REPRODUCTOR] Streaming:",
                    error
                );

            }

        }
    );

}


/* =========================================================
   STREAMING
========================================================= */

async function iniciarStreamingMedia(
    offsetInicial,
    operationId,
    generation
) {

    const mp4box =
        playerState.mp4box;


    if (
        !mp4box
    ) {

        throw new Error(
            "MP4Box no disponible."
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


    try {

        mp4box.start();

    } catch (
        error
    ) {

        console.warn(
            "[REPRODUCTOR] mp4box.start():",
            error
        );

    }


    playerState.streamStarted =
        true;


    while (
        !playerState.stopped &&
        !playerState.mp4Error &&
        operationId ===
        playerState.operationId &&
        generation ===
        playerState.streamGeneration &&
        offset <
        playerState.fileSize
    ) {

        const buffer =
            obtenerBufferAdelante();


        if (
            buffer >=
            BUFFER_OBJETIVO
        ) {

            await esperarBufferBajo(
                operationId,
                generation
            );


            continue;

        }


        if (
            playerState.totalDownloaded >=
            LIMITE_DESCARGA_SESION
        ) {

            break;

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
            playerState.operationId ||
            generation !==
            playerState.streamGeneration
        ) {

            break;

        }


        mp4box.appendBuffer(
            bloque.buffer
        );


        offset =
            bloque.end +
            1;


        playerState.cursor =
            offset;


        actualizarDiagnostico();


        await intentarReproduccion();


        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    10
                )
        );

    }


    if (
        offset >=
        playerState.fileSize &&
        !playerState.stopped &&
        operationId ===
        playerState.operationId &&
        generation ===
        playerState.streamGeneration
    ) {

        try {

            mp4box.flush();

        } catch (
            error
        ) {

            console.warn(
                "[REPRODUCTOR] flush:",
                error
            );

        }

    }

}


/* =========================================================
   ESPERAR BUFFER BAJO
========================================================= */

function esperarBufferBajo(
    operationId,
    generation
) {

    return new Promise(
        resolve => {

            const revisar =
                () => {

                    if (
                        playerState.stopped ||
                        operationId !==
                        playerState.operationId ||
                        generation !==
                        playerState.streamGeneration
                    ) {

                        resolve();

                        return;

                    }


                    if (
                        obtenerBufferAdelante() <=
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
   INTENTAR REPRODUCCIÓN
========================================================= */

async function intentarReproduccion() {

    const video =
        playerState.videoElement;


    if (
        !video ||
        playerState.playbackStarted ||
        playerState.stopped ||
        playerState.seekInProgress ||
        !playerState.allowAutoplay
    ) {

        return;

    }


    if (
        obtenerBufferAdelante() <
        BUFFER_INICIAL
    ) {

        return;

    }


    if (
        playerState.playAttempt
    ) {

        return;

    }


    playerState.playAttempt =
        true;


    try {

        await video.play();


        playerState.playbackStarted =
            true;


        ocultarLoading();


        actualizarBotonPlay();


        actualizarEstadoPlayer(
            "Reproduciendo"
        );

    } catch {

        ocultarLoading();


        actualizarEstadoPlayer(
            "Vídeo listo — pulsa PLAY."
        );

    } finally {

        playerState.playAttempt =
            false;

    }

}


/* =========================================================
   PREPARAR ARCHIVO MEGA
========================================================= */

async function prepararArchivoMega(
    drama
) {

    const url =
        typeof drama.embed_url ===
        "string"
            ? drama.embed_url.trim()
            : "";


    if (
        !url
    ) {

        throw new Error(
            "Este microdrama no tiene vídeo."
        );

    }


    if (
        !MEGAFile
    ) {

        throw new Error(
            "MEGAJS no está cargado."
        );

    }


    /*
     * Aceptamos /file/ y también /embed/
     * por compatibilidad.
     */

    const megaUrl =
        url.replace(
            "https://mega.nz/embed/",
            "https://mega.nz/file/"
        );


    const file =
        MEGAFile.fromURL(
            megaUrl
        );


    if (
        !file
    ) {

        throw new Error(
            "MEGAJS no pudo crear el archivo."
        );

    }


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
        `[REPRODUCTOR] ✓ Archivo: ${
            playerState.file.name ||
            "sin nombre"
        }`
    );


    console.log(
        `[REPRODUCTOR] ✓ Tamaño: ${
            formatoBytes(
                playerState.fileSize
            )
        }`
    );


    return playerState.file;

}


/* =========================================================
   REPRODUCIR DRAMA
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


    playerState.file =
        null;


    playerState.fileSize =
        0;


    playerState.mp4box =
        null;


    playerState.mp4Info =
        null;


    playerState.mp4Ready =
        false;


    playerState.mp4Error =
        false;


    playerState.duration =
        0;


    playerState.mediaSource =
        null;


    playerState.mediaSourceUrl =
        null;


    playerState.sourceBuffers =
        new Map();


    playerState.sourceQueues =
        new Map();


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


    playerState.seekInProgress =
        false;


    playerState.seekToken =
        0;


    playerState.userSeeking =
        false;


    playerState.pendingSeekTime =
        null;


    playerState.allowAutoplay =
        true;


    playerState.streamGeneration =
        0;


    playerState.bootstrapBuffers =
        [];


    playerState.bootstrapEnd =
        0;


    playerState.bootstrapReady =
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


    registrarVista(
        drama
    ).then(
        views => {

            if (
                views ===
                null
            ) {

                return;

            }


            drama.views =
                views;


            actualizarVistasTarjeta(
                drama,
                views
            );

        }
    );


    try {

        await cargarLibreriasReproductor();


        if (
            operationId !==
            playerState.operationId ||
            playerState.stopped
        ) {

            return;

        }


        actualizarEstadoPlayer(
            "Conectando con MEGA..."
        );


        await prepararArchivoMega(
            drama
        );


        await inicializarSesionInicial(
            operationId
        );


        playerState.loading =
            false;


        actualizarDiagnostico();


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


        playerState.loading =
            false;


        mostrarLoading(
            error.message ||
            "No se pudo reproducir el vídeo."
        );


        actualizarEstadoPlayer(
            `Error: ${
                error.message ||
                error
            }`
        );

    }

}


/* =========================================================
   SALTO ±10
========================================================= */

function ejecutarSaltoSegundos(
    segundos
) {

    const video =
        playerState.videoElement;


    if (
        !video
    ) {

        return;

    }


    const actual =
        Number(
            video.currentTime
        );


    const duration =
        obtenerDuracionVideo();


    console.log(
        "[SEEK] Botón:",
        segundos,
        "Actual:",
        actual,
        "Duración:",
        duration
    );


    if (
        !Number.isFinite(
            actual
        )
    ) {

        actualizarEstadoPlayer(
            "El tiempo actual todavía no está disponible."
        );

        return;

    }


    if (
        !Number.isFinite(
            duration
        ) ||
        duration <=
        0
    ) {

        actualizarEstadoPlayer(
            "La duración del vídeo todavía no está disponible."
        );

        return;

    }


    const destino =
        Math.max(
            0,
            Math.min(
                duration -
                0.05,
                actual +
                Number(
                    segundos
                )
            )
        );


    ejecutarSeekReal(
        destino
    );

}


/* =========================================================
   SEEK DESDE BARRA
========================================================= */

async function ejecutarSeekDesdeBarra() {

    const destino =
        Number(
            playerState.pendingSeekTime
        );


    playerState.userSeeking =
        false;


    playerState.pendingSeekTime =
        null;


    if (
        !Number.isFinite(
            destino
        )
    ) {

        return;

    }


    await ejecutarSeekReal(
        destino
    );

}


/* =========================================================
   SEEK REAL
========================================================= */

async function ejecutarSeekReal(
    destino
) {

    const video =
        playerState.videoElement;


    if (
        !video ||
        playerState.stopped
    ) {

        return;

    }


    const duration =
        obtenerDuracionVideo();


    console.log(
        "[SEEK] Duración:",
        {
            video:
                video.duration,

            mp4box:
                playerState.duration,

            utilizada:
                duration
        }
    );


    if (
        !Number.isFinite(
            duration
        ) ||
        duration <=
        0
    ) {

        actualizarEstadoPlayer(
            "La duración del vídeo todavía no está disponible."
        );

        return;

    }


    const tiempo =
        Math.max(
            0,
            Math.min(
                duration -
                0.05,
                Number(
                    destino
                )
            )
        );


    if (
        !Number.isFinite(
            tiempo
        )
    ) {

        return;

    }


    if (
        playerState.seekInProgress
    ) {

        playerState.pendingSeekTime =
            tiempo;


        console.log(
            `[SEEK] SEEK ocupado. Nuevo destino: ${formatoTiempo(tiempo)}`
        );


        return;

    }


    /*
     * =====================================================
     * SEEK LOCAL
     * =====================================================
     */

    if (
        estaEnBuffer(
            tiempo
        )
    ) {

        console.log(
            `[SEEK] LOCAL → ${formatoTiempo(tiempo)}`
        );


        try {

            if (
                typeof video.fastSeek ===
                "function"
            ) {

                try {

                    video.fastSeek(
                        tiempo
                    );

                } catch {

                    video.currentTime =
                        tiempo;

                }

            } else {

                video.currentTime =
                    tiempo;

            }


            actualizarControlesVideo();


            setTimeout(
                () => {

                    const actual =
                        Number(
                            video.currentTime
                        );


                    console.log(
                        `[SEEK] Verificación LOCAL → solicitado ${formatoTiempo(tiempo)} / actual ${formatoTiempo(actual)}`
                    );


                    if (
                        Math.abs(
                            actual -
                            tiempo
                        ) >
                        0.75
                    ) {

                        ejecutarSeekRemoto(
                            tiempo
                        );

                    }

                },
                200
            );


        } catch (
            error
        ) {

            console.warn(
                "[SEEK] SEEK local falló:",
                error
            );


            ejecutarSeekRemoto(
                tiempo
            );

        }


        return;

    }


    /*
     * =====================================================
     * SEEK REMOTO
     * =====================================================
     */

    await ejecutarSeekRemoto(
        tiempo
    );

}


/* =========================================================
   SEEK REMOTO
========================================================= */

async function ejecutarSeekRemoto(
    tiempo
) {

    const video =
        playerState.videoElement;


    if (
        !video ||
        playerState.stopped
    ) {

        return;

    }


    if (
        playerState.seekInProgress
    ) {

        playerState.pendingSeekTime =
            tiempo;

        return;

    }


    const token =
        ++playerState.seekToken;


    const operationId =
        playerState.operationId;


    const estabaReproduciendo =
        !video.paused;


    playerState.seekInProgress =
        true;


    playerState.allowAutoplay =
        estabaReproduciendo;


    const generation =
        ++playerState.streamGeneration;


    try {

        console.log(
            "=========================================="
        );


        console.log(
            `[SEEK] REMOTO → ${formatoTiempo(tiempo)}`
        );


        mostrarLoading(
            `Buscando ${formatoTiempo(tiempo)}...`
        );


        actualizarEstadoPlayer(
            `Buscando ${formatoTiempo(tiempo)}...`
        );


        try {

            video.pause();

        } catch {}


        /*
         * Detener MP4Box actual.
         */

        if (
            playerState.mp4box
        ) {

            try {

                playerState.mp4box.stop();

            } catch {}

        }


        /*
         * Liberar MSE anterior.
         */

        const oldMediaSource =
            playerState.mediaSource;


        const oldUrl =
            playerState.mediaSourceUrl;


        if (
            oldMediaSource &&
            oldMediaSource.readyState ===
            "open"
        ) {

            try {

                oldMediaSource.endOfStream();

            } catch {}

        }


        if (
            oldUrl
        ) {

            try {

                URL.revokeObjectURL(
                    oldUrl
                );

            } catch {}

        }


        playerState.mediaSource =
            null;


        playerState.mediaSourceUrl =
            null;


        playerState.sourceBuffers =
            new Map();


        playerState.sourceQueues =
            new Map();


        playerState.initSegments =
            new Map();


        playerState.mp4Ready =
            false;


        playerState.mp4Error =
            false;


        playerState.streamStarted =
            false;


        playerState.playbackStarted =
            false;


        /*
         * Crear nuevo MP4Box.
         */

        const mp4box =
            crearNuevoMP4Box();


        if (
            token !==
            playerState.seekToken ||
            operationId !==
            playerState.operationId
        ) {

            return;

        }


        actualizarEstadoPlayer(
            "Reconstruyendo estructura MP4..."
        );


        /*
         * Para el SEEK remoto necesitamos
         * reconstruir la información MP4.
         */

        const encontrado =
            await localizarMOOV(
                operationId,
                false
            );


        if (
            token !==
            playerState.seekToken ||
            operationId !==
            playerState.operationId ||
            playerState.stopped
        ) {

            return;

        }


        if (
            !encontrado ||
            !playerState.mp4Ready
        ) {

            throw new Error(
                "MP4Box no pudo reconstruir la estructura del vídeo."
            );

        }


        /*
         * La duración vuelve a quedar disponible
         * después del nuevo onReady().
         */

        const nuevaDuracion =
            obtenerDuracionMP4(
                playerState.mp4Info
            );


        if (
            nuevaDuracion >
            0
        ) {

            playerState.duration =
                nuevaDuracion;

        }


        /*
         * Calcular offset físico.
         */

        actualizarEstadoPlayer(
            `Calculando posición ${formatoTiempo(tiempo)}...`
        );


        let resultadoSeek;


        try {

            resultadoSeek =
                mp4box.seek(
                    tiempo,
                    true
                );

        } catch (
            error
        ) {

            throw new Error(
                `MP4Box no pudo realizar SEEK: ${
                    error.message ||
                    error
                }`
            );

        }


        const offsetMega =
            obtenerOffsetSeek(
                resultadoSeek
            );


        console.log(
            "[SEEK] mp4box.seek():",
            resultadoSeek
        );


        console.log(
            `[SEEK] Offset MEGA: ${
                Number(
                    offsetMega
                ).toLocaleString()
            }`
        );


        if (
            !Number.isFinite(
                offsetMega
            ) ||
            offsetMega <
            0 ||
            offsetMega >=
            playerState.fileSize
        ) {

            throw new Error(
                `Offset MEGA inválido: ${offsetMega}`
            );

        }


        /*
         * Crear nuevo MediaSource.
         */

        actualizarEstadoPlayer(
            "Preparando nuevo buffer..."
        );


        await crearSesionMedia(
            operationId
        );


        if (
            token !==
            playerState.seekToken ||
            operationId !==
            playerState.operationId ||
            playerState.stopped
        ) {

            return;

        }


        playerState.streamStarted =
            true;


        actualizarEstadoPlayer(
            `Cargando ${formatoTiempo(tiempo)}...`
        );


        /*
         * Iniciar descarga desde el offset
         * calculado por MP4Box.
         */

        iniciarStreamingMedia(
            offsetMega,
            operationId,
            generation
        ).catch(
            error => {

                if (
                    token ===
                    playerState.seekToken &&
                    !playerState.stopped
                ) {

                    console.error(
                        "[SEEK] Streaming remoto:",
                        error
                    );

                }

            }
        );


        /*
         * Esperar hasta que el punto
         * solicitado aparezca realmente
         * en SourceBuffer.
         */

        const disponible =
            await esperarBufferEnPunto(
                tiempo,
                token,
                30000
            );


        if (
            token !==
            playerState.seekToken ||
            playerState.stopped
        ) {

            return;

        }


        if (
            !disponible
        ) {

            throw new Error(
                `El punto ${formatoTiempo(tiempo)} no llegó al buffer después de 30 segundos.`
            );

        }


        /*
         * Colocar posición exacta.
         */

        video.currentTime =
            tiempo;


        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    100
                )
        );


        console.log(
            `[SEEK] Resultado final: ${formatoTiempo(video.currentTime)}`
        );


        ocultarLoading();


        actualizarControlesVideo();


        if (
            estabaReproduciendo
        ) {

            playerState.allowAutoplay =
                true;


            try {

                await video.play();


                playerState.playbackStarted =
                    true;


                actualizarBotonPlay();


                actualizarEstadoPlayer(
                    `Reproduciendo desde ${formatoTiempo(tiempo)}`
                );

            } catch {

                actualizarBotonPlay();


                actualizarEstadoPlayer(
                    `Listo en ${formatoTiempo(tiempo)} — pulsa PLAY`
                );

            }

        } else {

            playerState.allowAutoplay =
                false;


            actualizarBotonPlay();


            actualizarEstadoPlayer(
                `Pausado en ${formatoTiempo(tiempo)}`
            );

        }


        console.log(
            `[SEEK] ✓ SEEK COMPLETADO`
        );


    } catch (
        error
    ) {

        console.error(
            "[SEEK] ERROR:",
            error
        );


        if (
            token ===
            playerState.seekToken
        ) {

            mostrarLoading(
                error.message ||
                "No se pudo realizar el salto."
            );


            actualizarEstadoPlayer(
                `Error SEEK: ${
                    error.message ||
                    error
                }`
            );

        }

    } finally {

        if (
            token ===
            playerState.seekToken
        ) {

            playerState.seekInProgress =
                false;


            const siguiente =
                playerState.pendingSeekTime;


            playerState.pendingSeekTime =
                null;


            if (
                Number.isFinite(
                    siguiente
                ) &&
                Math.abs(
                    siguiente -
                    Number(
                        video.currentTime
                    )
                ) >
                0.75
            ) {

                setTimeout(
                    () => {

                        ejecutarSeekReal(
                            siguiente
                        );

                    },
                    50
                );

            }

        }

    }

}


/* =========================================================
   ESPERAR BUFFER EN PUNTO
========================================================= */

function esperarBufferEnPunto(
    tiempo,
    token,
    timeout =
        30000
) {

    return new Promise(
        resolve => {

            const inicio =
                Date.now();


            const revisar =
                () => {

                    if (
                        playerState.stopped ||
                        token !==
                        playerState.seekToken
                    ) {

                        resolve(
                            false
                        );

                        return;

                    }


                    if (
                        estaEnBuffer(
                            tiempo
                        )
                    ) {

                        resolve(
                            true
                        );

                        return;

                    }


                    if (
                        Date.now() -
                        inicio >=
                        timeout
                    ) {

                        resolve(
                            false
                        );

                        return;

                    }


                    setTimeout(
                        revisar,
                        100
                    );

                };


            revisar();

        }
    );

}


/* =========================================================
   OFFSET SEEK
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
   FULLSCREEN
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
            "[REPRODUCTOR] Fullscreen:",
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


    if (
        evento.target?.tagName ===
        "INPUT"
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

                playerState.allowAutoplay =
                    true;


                video.play().catch(
                    () => {}
                );

            } else {

                playerState.allowAutoplay =
                    false;


                video.pause();

            }

            break;


        case "arrowleft":

            evento.preventDefault();


            ejecutarSeekReal(
                Math.max(
                    0,
                    video.currentTime -
                    5
                )
            );

            break;


        case "arrowright":

            evento.preventDefault();


            ejecutarSeekReal(
                Math.min(
                    obtenerDuracionVideo() -
                    0.05,
                    video.currentTime +
                    5
                )
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

    }

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


    playerState.seekToken++;


    playerState.streamGeneration++;


    if (
        playerState.mp4box
    ) {

        try {

            playerState.mp4box.stop();

        } catch {}

    }


    const video =
        playerState.videoElement;


    if (
        video
    ) {

        try {

            video.pause();

        } catch {}


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

        } catch {}

    }


    if (
        playerState.mediaSourceUrl
    ) {

        try {

            URL.revokeObjectURL(
                playerState.mediaSourceUrl
            );

        } catch {}

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


    playerState.seekInProgress =
        false;


    playerState.duration =
        0;


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
   SIN VIDEO
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


    mensaje.querySelector(
        "strong"
    ).textContent =
        tituloDrama;


    mensaje.querySelector(
        ".video-missing-message__close"
    ).addEventListener(
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
   RESIZE
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
   INICIALIZAR
========================================================= */

function inicializarReproductor() {

    crearReproductor();

}


inicializarReproductor();


cargarDramas();
