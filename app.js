"use strict";


/* =========================================================
   CONFIGURACIÓN
========================================================= */

const PORTADA_GENERICA =
    "/portadas/generica/portada-generica.png";


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
       INFORMACIÓN SUPERPUESTA
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
       TEXTO
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


    /*
     * Por ahora solamente detenemos
     * el comportamiento.
     *
     * En la siguiente etapa este botón
     * abrirá el reproductor interno.
     */

    botonVer.addEventListener(
        "click",
        (evento) => {

            evento.preventDefault();
            evento.stopPropagation();

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


    /*
     * El botón + muestra u oculta
     * la descripción.
     */

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


    catalogo.appendChild(
        tarjeta
    );
}


/* =========================================================
   INICIAR
========================================================= */

cargarDramas();
