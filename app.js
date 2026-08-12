"use strict";


/* =========================================================
   CONFIGURACIÓN
========================================================= */

const PORTADA_GENERICA =
    "/portadas/generica/portada-generica.png";


/* =========================================================
   ESTADO
========================================================= */

let detalleMovilActual = null;

let reproductorActual = null;


/* =========================================================
   DETECTAR VISTA MÓVIL
========================================================= */

function esVistaMovil() {

    return window.matchMedia(
        "(max-width: 600px)"
    ).matches;
}


/* =========================================================
   CARGAR DRAMAS
========================================================= */

async function cargarDramas() {

    const catalogo =
        document.getElementById("catalogo");


    if (!catalogo) {

        console.error(
            'No se encontró el elemento con id "catalogo".'
        );

        return;
    }


    try {

        const respuesta =
            await fetch("/api/dramas");


        if (!respuesta.ok) {

            throw new Error(
                `Error al consultar la API: ${respuesta.status}`
            );
        }


        const datos =
            await respuesta.json();


        if (
            !datos.success ||
            !Array.isArray(datos.dramas)
        ) {

            throw new Error(
                "La API devolvió una respuesta no válida."
            );
        }


        catalogo.innerHTML = "";


        if (datos.dramas.length === 0) {

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


    } catch (error) {

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
   MICRODRAMA NUEVO
   Se considera nuevo durante 72 horas.
========================================================= */

function esDramaNuevo(createdAt) {

    if (
        typeof createdAt !== "string" ||
        createdAt.trim() === ""
    ) {
        return false;
    }

    const valor =
        createdAt
            .trim()
            .replace(" ", "T");

    /*
     * D1 utiliza CURRENT_TIMESTAMP en UTC.
     * Añadimos Z para interpretar correctamente
     * la fecha como UTC.
     */
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
        72 * 60 * 60 * 1000;

    const diferencia =
        ahora -
        fechaCreacion.getTime();

    return (
        diferencia >= 0 &&
        diferencia < setentaDosHoras
    );
}


/* =========================================================
   REGISTRAR REPRODUCCIÓN
========================================================= */

async function registrarVista(drama) {

    if (
        !drama ||
        !Number.isInteger(
            Number(drama.id)
        )
    ) {
        return null;
    }

    try {

        const respuesta =
            await fetch(
                "/api/dramas/view",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        id: Number(drama.id)
                    })
                }
            );

        if (!respuesta.ok) {
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

        return Number(datos.views) || 0;

    } catch (error) {

        /*
         * Una falla del contador NO debe impedir
         * que el usuario pueda ver el microdrama.
         */
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

function crearTarjetaDrama(drama) {

    const catalogo =
        document.getElementById("catalogo");


    if (!catalogo) {
        return;
    }


    const tarjeta =
        document.createElement("article");

    tarjeta.className =
        "drama-card";


/* -----------------------------------------------------
   ETIQUETA RECIÉN AGREGADO
----------------------------------------------------- */

if (
    esDramaNuevo(
        drama.created_at
    )
) {

    const etiquetaNuevo =
        document.createElement("div");

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
   ETIQUETA TOP
   Aparece desde 3 reproducciones.
----------------------------------------------------- */

if (
    Number(drama.views) >= 3
) {

    const etiquetaTop =
        document.createElement("div");

    etiquetaTop.className =
        "drama-card__top";

    etiquetaTop.textContent =
        "🔥";

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
        document.createElement("img");


    const portadaUrl =
        typeof drama.cover_url === "string" &&
        drama.cover_url.trim() !== ""
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
            once: true
        }
    );


    /* -----------------------------------------------------
       OVERLAY
    ----------------------------------------------------- */

    const overlay =
        document.createElement("div");

    overlay.className =
        "drama-card__overlay";


    /* -----------------------------------------------------
       TÍTULO
    ----------------------------------------------------- */

    const titulo =
        document.createElement("h2");

    titulo.className =
        "drama-card__title";

    titulo.textContent =
        drama.title;


    /* -----------------------------------------------------
       TIPO
    ----------------------------------------------------- */

    const tipo =
        document.createElement("p");

    tipo.className =
        "drama-card__type";

    tipo.textContent =
        "Microdrama doblado al español.";


    /* -----------------------------------------------------
       PLATAFORMA
    ----------------------------------------------------- */

    const plataforma =
        document.createElement("p");

    plataforma.className =
        "drama-card__platform";


    const etiquetaPlataforma =
        document.createElement("strong");

    etiquetaPlataforma.textContent =
        "Plataforma: ";


    plataforma.appendChild(
        etiquetaPlataforma
    );


    plataforma.appendChild(
        document.createTextNode(
            typeof drama.platform === "string" &&
            drama.platform.trim() !== ""
                ? drama.platform.trim()
                : "No especificada"
        )
    );


    /* -----------------------------------------------------
       CONTROLES
    ----------------------------------------------------- */

    const controles =
        document.createElement("div");

    controles.className =
        "drama-card__controls";


    /* -----------------------------------------------------
       BOTÓN VER
    ----------------------------------------------------- */

    const botonVer =
        document.createElement("button");

    botonVer.type =
        "button";

    botonVer.className =
        "drama-card__play";
   
botonVer.dataset.dramaId =
    String(drama.id);

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
        (evento) => {

            evento.preventDefault();

            evento.stopPropagation();


            reproducirDrama(
                drama
            );
        }
    );


    /* -----------------------------------------------------
       BOTÓN +
    ----------------------------------------------------- */

    const botonMas =
        document.createElement("button");

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
        document.createElement("div");

    descripcion.className =
        "drama-card__description";


    const descripcionTexto =
        typeof drama.video_description === "string" &&
        drama.video_description.trim() !== ""
            ? drama.video_description.trim()
            : drama.description;


    descripcion.textContent =
        descripcionTexto || "";


    botonMas.addEventListener(
        "click",
        (evento) => {

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


    /* -----------------------------------------------------
       CONSTRUIR CONTROLES
    ----------------------------------------------------- */

    controles.appendChild(
        botonVer
    );

    controles.appendChild(
        botonMas
    );


    /* -----------------------------------------------------
       CONSTRUIR OVERLAY
    ----------------------------------------------------- */

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


    /* -----------------------------------------------------
       CONSTRUIR TARJETA
    ----------------------------------------------------- */

    tarjeta.appendChild(
        portada
    );

    tarjeta.appendChild(
        overlay
    );


    /* -----------------------------------------------------
       DETALLE MÓVIL
    ----------------------------------------------------- */

    tarjeta.addEventListener(
        "click",
        (evento) => {

            if (
                !esVistaMovil()
            ) {
                return;
            }


            if (
                evento.target.closest("button")
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
        document.createElement("div");

    detalle.id =
        "detalle-movil";

    detalle.className =
        "mobile-detail";


    detalle.setAttribute(
        "aria-hidden",
        "true"
    );


    const fondo =
        document.createElement("div");

    fondo.className =
        "mobile-detail__backdrop";


    const panel =
        document.createElement("div");

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


    /* -----------------------------------------------------
       CERRAR
    ----------------------------------------------------- */

    const cerrar =
        document.createElement("button");

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


    /* -----------------------------------------------------
       PORTADA
    ----------------------------------------------------- */

    const imagen =
        document.createElement("img");

    imagen.className =
        "mobile-detail__image";


    /* -----------------------------------------------------
       CONTENIDO
    ----------------------------------------------------- */

    const contenido =
        document.createElement("div");

    contenido.className =
        "mobile-detail__content";


    /* -----------------------------------------------------
       TÍTULO
    ----------------------------------------------------- */

    const titulo =
        document.createElement("h2");

    titulo.className =
        "mobile-detail__title";


    /* -----------------------------------------------------
       TIPO
    ----------------------------------------------------- */

    const tipo =
        document.createElement("p");

    tipo.className =
        "mobile-detail__type";

    tipo.textContent =
        "Microdrama doblado al español.";


    /* -----------------------------------------------------
       PLATAFORMA
    ----------------------------------------------------- */

    const plataforma =
        document.createElement("p");

    plataforma.className =
        "mobile-detail__platform";


    /* -----------------------------------------------------
       BOTÓN VER
    ----------------------------------------------------- */

    const botonVer =
        document.createElement("button");

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
        (evento) => {

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


    /* -----------------------------------------------------
       DESCRIPCIÓN
    ----------------------------------------------------- */

    const tituloDescripcion =
        document.createElement("h3");

    tituloDescripcion.className =
        "mobile-detail__description-title";

    tituloDescripcion.textContent =
        "Descripción";


    const descripcion =
        document.createElement("p");

    descripcion.className =
        "mobile-detail__description";


    /* -----------------------------------------------------
       ACCIONES
    ----------------------------------------------------- */

    const acciones =
        document.createElement("div");

    acciones.className =
        "mobile-detail__actions";


    acciones.appendChild(
        botonVer
    );


    /* -----------------------------------------------------
       CONSTRUIR
    ----------------------------------------------------- */

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

function abrirDetalleMovil(drama) {

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


    const portadaUrl =
        typeof drama.cover_url === "string" &&
        drama.cover_url.trim() !== ""
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
            typeof drama.platform === "string" &&
            drama.platform.trim() !== ""
                ? drama.platform.trim()
                : "No especificada"
        }`;


    const descripcionTexto =
        typeof drama.video_description === "string" &&
        drama.video_description.trim() !== ""
            ? drama.video_description.trim()
            : drama.description;


    descripcion.textContent =
        descripcionTexto ||
        "Sin descripción disponible.";


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
   CREAR REPRODUCTOR
========================================================= */

function crearReproductor() {

    if (
        document.getElementById(
            "reproductor"
        )
    ) {
        return;
    }


    const reproductor =
        document.createElement("div");

    reproductor.id =
        "reproductor";

    reproductor.className =
        "video-player";


    reproductor.setAttribute(
        "aria-hidden",
        "true"
    );


    /* -----------------------------------------------------
       FONDO
    ----------------------------------------------------- */

    const fondo =
        document.createElement("div");

    fondo.className =
        "video-player__backdrop";


    /* -----------------------------------------------------
       VENTANA
    ----------------------------------------------------- */

    const ventana =
        document.createElement("div");

    ventana.className =
        "video-player__window";


    ventana.setAttribute(
        "role",
        "dialog"
    );


    ventana.setAttribute(
        "aria-modal",
        "true"
    );


    /* -----------------------------------------------------
       CABECERA
    ----------------------------------------------------- */

    const cabecera =
        document.createElement("div");

    cabecera.className =
        "video-player__header";


    const titulo =
        document.createElement("h2");

    titulo.className =
        "video-player__title";


    const cerrar =
        document.createElement("button");

    cerrar.type =
        "button";

    cerrar.className =
        "video-player__close";

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


    /* -----------------------------------------------------
       ÁREA DEL VIDEO
    ----------------------------------------------------- */

    const videoArea =
        document.createElement("div");

    videoArea.className =
        "video-player__area";


    /* -----------------------------------------------------
       IFRAME
    ----------------------------------------------------- */

    const iframe =
        document.createElement("iframe");


    iframe.className =
        "video-player__iframe";


    iframe.title =
        "Reproductor del microdrama";


    iframe.setAttribute(
        "allow",
        "autoplay; fullscreen; encrypted-media; picture-in-picture"
    );


    iframe.setAttribute(
        "allowfullscreen",
        ""
    );


    iframe.setAttribute(
        "frameborder",
        "0"
    );


    iframe.setAttribute(
        "referrerpolicy",
        "strict-origin-when-cross-origin"
    );


    videoArea.appendChild(
        iframe
    );


    /* -----------------------------------------------------
       CONSTRUIR
    ----------------------------------------------------- */

    ventana.appendChild(
        cabecera
    );

    ventana.appendChild(
        videoArea
    );


    reproductor.appendChild(
        fondo
    );

    reproductor.appendChild(
        ventana
    );


    document.body.appendChild(
        reproductor
    );


    /* -----------------------------------------------------
       EVENTOS
    ----------------------------------------------------- */

    cerrar.addEventListener(
        "click",
        cerrarReproductor
    );


    fondo.addEventListener(
        "click",
        cerrarReproductor
    );
}


/* =========================================================
   ABRIR REPRODUCTOR
========================================================= */

function reproducirDrama(drama) {

    if (!drama) {
        return;
    }


    const embedUrl =
        typeof drama.embed_url === "string"
            ? drama.embed_url.trim()
            : "";


    if (!embedUrl) {

        mostrarMensajeSinVideo(
            drama.title
        );

        return;
    }


    crearReproductor();


    const reproductor =
        document.getElementById(
            "reproductor"
        );


    const iframe =
        reproductor.querySelector(
            ".video-player__iframe"
        );


    const titulo =
        reproductor.querySelector(
            ".video-player__title"
        );


    if (
        !iframe ||
        !titulo
    ) {
        return;
    }


    titulo.textContent =
        drama.title;


    /*
     * IMPORTANTE:
     *
     * Se utiliza exactamente el embed_url
     * almacenado en D1.
     *
     * No se modifica el fragmento # de Mega.
     */

    iframe.src =
        embedUrl;


    reproductorActual =
        drama;
/* -----------------------------------------------------
   REGISTRAR VISTA
----------------------------------------------------- */

registrarVista(
    drama
).then(
    (viewsActualizadas) => {

        if (
            viewsActualizadas === null
        ) {
            return;
        }

        /*
         * Actualizamos el valor local.
         */
        drama.views =
            viewsActualizadas;

        /*
         * Si acaba de alcanzar 3 vistas,
         * mostramos inmediatamente el 🔥
         * sin esperar a recargar la página.
         */
        if (
            viewsActualizadas >= 3
        ) {

            const tarjetas =
                document.querySelectorAll(
                    ".drama-card"
                );

            tarjetas.forEach(
                (tarjeta) => {

                    /*
                     * Buscamos la tarjeta
                     * correspondiente mediante
                     * el botón Ver.
                     */
                    const boton =
                        tarjeta.querySelector(
                            ".drama-card__play"
                        );

                    if (
                        !boton
                    ) {
                        return;
                    }

                    /*
                     * La referencia al drama
                     * se conserva en el closure
                     * de cada botón.
                     */
                    if (
                        boton.dataset.dramaId !==
                        String(drama.id)
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

                    etiquetaTop.textContent =
                        "🔥";

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
    }
);
   

    /* -----------------------------------------------------
       MOSTRAR
    ----------------------------------------------------- */

    reproductor.classList.add(
        "is-open"
    );


    reproductor.setAttribute(
        "aria-hidden",
        "false"
    );


    document.body.classList.add(
        "video-player-open"
    );


    /*
     * Intentamos llevar el foco al iframe.
     *
     * Esto no controla el reproductor
     * interno de Mega, pero deja el iframe
     * preparado para recibir la interacción.
     */

    requestAnimationFrame(
        () => {

            iframe.focus();
        }
    );
}


/* =========================================================
   CERRAR REPRODUCTOR
========================================================= */

function cerrarReproductor() {

    const reproductor =
        document.getElementById(
            "reproductor"
        );


    if (!reproductor) {
        return;
    }


    const iframe =
        reproductor.querySelector(
            ".video-player__iframe"
        );


    /*
     * Destruimos la reproducción.
     */

    if (iframe) {

        iframe.src =
            "about:blank";
    }


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


    reproductorActual =
        null;
}


/* =========================================================
   MENSAJE SIN VIDEO
========================================================= */

function mostrarMensajeSinVideo(
    tituloDrama
) {

    const mensaje =
        document.createElement("div");

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
                todavía no tiene un reproductor configurado.
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
    (evento) => {

        if (
            evento.key !== "Escape"
        ) {
            return;
        }


        const reproductor =
            document.getElementById(
                "reproductor"
            );


        if (
            reproductor &&
            reproductor.classList.contains(
                "is-open"
            )
        ) {

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
   INICIAR
========================================================= */

cargarDramas();
