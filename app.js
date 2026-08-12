"use strict";


/* =========================================================
   CONFIGURACIÓN
========================================================= */

const PORTADA_GENERICA =
    "/portadas/generica/portada-generica.png";


/* =========================================================
   REFERENCIAS
========================================================= */

let detalleMovilActual = null;


/* =========================================================
   DETECTAR DISPOSITIVO / VISTA MÓVIL
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


        catalogo.innerHTML = "";


        if (
            datos.dramas.length === 0
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


    /* -----------------------------------------------------
       TARJETA
    ----------------------------------------------------- */

    const tarjeta =
        document.createElement(
            "article"
        );

    tarjeta.className =
        "drama-card";


    /* -----------------------------------------------------
       PORTADA
    ----------------------------------------------------- */

    const portada =
        document.createElement(
            "img"
        );


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


    /*
     * Si una portada externa deja de funcionar,
     * se utiliza automáticamente la portada genérica.
     */

    portada.addEventListener(
        "error",
        () => {

            if (
                portada.src.endsWith(
                    PORTADA_GENERICA
                )
            ) {
                return;
            }


            portada.src =
                PORTADA_GENERICA;
        },
        {
            once: true
        }
    );


    /* -----------------------------------------------------
       INFORMACIÓN SUPERPUESTA — ESCRITORIO
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
        document.createElement(
            "div"
        );

    controles.className =
        "drama-card__controls";


    /* -----------------------------------------------------
       BOTÓN VER
    ----------------------------------------------------- */

    const botonVer =
        document.createElement(
            "button"
        );

    botonVer.type =
        "button";

    botonVer.className =
        "drama-card__play";

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


            /*
             * El reproductor interno será
             * implementado en la Etapa 3.
             */

            console.log(
                "Reproducir microdrama:",
                drama.title
            );
        }
    );


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
       INTERACCIÓN MÓVIL
    ----------------------------------------------------- */

    tarjeta.addEventListener(
        "click",
        (evento) => {

            /*
             * En escritorio no hacemos nada.
             * La interacción continúa siendo mediante hover.
             */

            if (
                !esVistaMovil()
            ) {
                return;
            }


            /*
             * Si se tocó un botón,
             * no abrimos nuevamente el detalle.
             */

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
   CREAR VISTA DE DETALLE MÓVIL
========================================================= */

function crearDetalleMovil() {

    /*
     * Evitamos crear el elemento más de una vez.
     */

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


    /* -----------------------------------------------------
       FONDO
    ----------------------------------------------------- */

    const fondo =
        document.createElement(
            "div"
        );

    fondo.className =
        "mobile-detail__backdrop";


    /* -----------------------------------------------------
       PANEL
    ----------------------------------------------------- */

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

    panel.setAttribute(
        "aria-labelledby",
        "detalle-movil-titulo"
    );


    /* -----------------------------------------------------
       BOTÓN CERRAR
    ----------------------------------------------------- */

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


    /* -----------------------------------------------------
       PORTADA
    ----------------------------------------------------- */

    const imagen =
        document.createElement(
            "img"
        );

    imagen.className =
        "mobile-detail__image";

    imagen.alt =
        "";


    /* -----------------------------------------------------
       CONTENIDO
    ----------------------------------------------------- */

    const contenido =
        document.createElement(
            "div"
        );

    contenido.className =
        "mobile-detail__content";


    /* -----------------------------------------------------
       TÍTULO
    ----------------------------------------------------- */

    const titulo =
        document.createElement(
            "h2"
        );

    titulo.id =
        "detalle-movil-titulo";

    titulo.className =
        "mobile-detail__title";


    /* -----------------------------------------------------
       TIPO
    ----------------------------------------------------- */

    const tipo =
        document.createElement(
            "p"
        );

    tipo.className =
        "mobile-detail__type";

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
        "mobile-detail__platform";


    /* -----------------------------------------------------
       BOTÓN VER
    ----------------------------------------------------- */

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
        (evento) => {

            evento.preventDefault();


            if (
                !detalleMovilActual
            ) {
                return;
            }


            /*
             * El reproductor interno se agregará
             * en la Etapa 3.
             */

            console.log(
                "Reproducir:",
                detalleMovilActual.title
            );
        }
    );


    /* -----------------------------------------------------
       DESCRIPCIÓN DEL VIDEO
    ----------------------------------------------------- */

    const etiquetaDescripcion =
        document.createElement(
            "h3"
        );

    etiquetaDescripcion.className =
        "mobile-detail__description-title";

    etiquetaDescripcion.textContent =
        "Descripción";


    const descripcion =
        document.createElement(
            "p"
        );

    descripcion.className =
        "mobile-detail__description";


    /* -----------------------------------------------------
       CONTROLES
    ----------------------------------------------------- */

    const acciones =
        document.createElement(
            "div"
        );

    acciones.className =
        "mobile-detail__actions";


    acciones.appendChild(
        botonVer
    );


    /* -----------------------------------------------------
       CONSTRUIR CONTENIDO
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
        etiquetaDescripcion
    );


    contenido.appendChild(
        descripcion
    );


    /* -----------------------------------------------------
       CONSTRUIR PANEL
    ----------------------------------------------------- */

    panel.appendChild(
        cerrar
    );


    panel.appendChild(
        imagen
    );


    panel.appendChild(
        contenido
    );


    /* -----------------------------------------------------
       CONSTRUIR DETALLE
    ----------------------------------------------------- */

    detalle.appendChild(
        fondo
    );


    detalle.appendChild(
        panel
    );


    document.body.appendChild(
        detalle
    );


    /* -----------------------------------------------------
       CERRAR
    ----------------------------------------------------- */

    cerrar.addEventListener(
        "click",
        cerrarDetalleMovil
    );


    fondo.addEventListener(
        "click",
        cerrarDetalleMovil
    );


    /*
     * ESC también permite cerrar
     * la ventana cuando se utiliza
     * un teclado.
     */

    document.addEventListener(
        "keydown",
        manejarTeclaEscape
    );
}


/* =========================================================
   ABRIR DETALLE MÓVIL
========================================================= */

function abrirDetalleMovil(
    drama
) {

    if (
        !esVistaMovil()
    ) {
        return;
    }


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


    /*
     * Fallback de portada.
     */

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


    const nombrePlataforma =
        typeof drama.platform === "string" &&
        drama.platform.trim() !== ""
            ? drama.platform.trim()
            : "No especificada";


    plataforma.textContent =
        `Plataforma: ${nombrePlataforma}`;


    const descripcionTexto =
        typeof drama.video_description === "string" &&
        drama.video_description.trim() !== ""
            ? drama.video_description.trim()
            : drama.description;


    descripcion.textContent =
        descripcionTexto || "Sin descripción disponible.";


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


    /*
     * Comenzamos arriba de la vista
     * cuando se abre.
     */

    const panel =
        detalle.querySelector(
            ".mobile-detail__panel"
        );


    if (panel) {

        panel.scrollTop =
            0;
    }
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
   TECLA ESC
========================================================= */

function manejarTeclaEscape(
    evento
) {

    if (
        evento.key !== "Escape"
    ) {
        return;
    }


    cerrarDetalleMovil();
}


/* =========================================================
   CERRAR SI CAMBIAMOS DE MÓVIL A ESCRITORIO
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
