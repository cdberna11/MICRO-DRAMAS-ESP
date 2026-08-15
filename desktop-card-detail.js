/* =========================================================
   MICRO-DRAMAS-ESP — DETALLE DE TARJETA / ESCRITORIO

   Solo escritorio (> 600px).
   No modifica la tarjeta existente ni su animación.
   No modifica la experiencia móvil.

   Comportamiento:
   - Clic en la tarjeta -> abre detalle ampliado.
   - + -> conserva su función original.
   - VER -> conserva su función original/reproductor.
   - Borrador -> detalle sin botón VER.
========================================================= */

(function instalarDetalleTarjetasEscritorio() {

    "use strict";

    const MEDIA_QUERY = "(min-width: 601px)";
    let modal = null;
    let tarjetaOrigen = null;

    function esEscritorio() {
        return window.matchMedia(MEDIA_QUERY).matches;
    }

    function texto(selector, tarjeta, fallback = "Sin información") {
        const elemento = tarjeta.querySelector(selector);
        const valor = elemento?.textContent?.trim();
        return valor || fallback;
    }

    function crearModal() {
        if (modal) {
            return modal;
        }

        modal = document.createElement("div");
        modal.className = "desktop-card-detail";
        modal.hidden = true;
        modal.setAttribute("aria-hidden", "true");

        modal.innerHTML = `
            <div class="desktop-card-detail__backdrop" data-detail-close></div>

            <section
                class="desktop-card-detail__panel"
                role="dialog"
                aria-modal="true"
                aria-label="Detalle del microdrama"
            >
                <button
                    type="button"
                    class="desktop-card-detail__close"
                    aria-label="Cerrar detalle"
                    data-detail-close
                >
                    ×
                </button>

                <div class="desktop-card-detail__cover-wrap">
                    <img
                        class="desktop-card-detail__cover"
                        alt=""
                    >
                </div>

                <div class="desktop-card-detail__content">
                    <h2 class="desktop-card-detail__title"></h2>

                    <p class="desktop-card-detail__type"></p>

                    <p class="desktop-card-detail__platform"></p>

                    <p class="desktop-card-detail__category"></p>

                    <p class="desktop-card-detail__views"></p>

                    <div class="desktop-card-detail__description-wrap">
                        <h3>Descripción</h3>
                        <p class="desktop-card-detail__description"></p>
                    </div>

                    <div class="desktop-card-detail__actions"></div>
                </div>
            </section>
        `;

        document.body.appendChild(modal);

        modal.addEventListener("click", evento => {
            const cerrar = evento.target.closest("[data-detail-close]");

            if (cerrar) {
                evento.preventDefault();
                cerrarModal();
            }
        });

        const botonCerrar = modal.querySelector(
            ".desktop-card-detail__close"
        );

        botonCerrar.addEventListener("click", evento => {
            evento.preventDefault();
            cerrarModal();
        });

        return modal;
    }

    function abrirModal(tarjeta) {
        if (!esEscritorio() || !tarjeta) {
            return;
        }

        crearModal();

        tarjetaOrigen = tarjeta;

        const portada = tarjeta.querySelector(
            ".drama-card__cover"
        );

        const imagen = modal.querySelector(
            ".desktop-card-detail__cover"
        );

        imagen.src = portada?.currentSrc || portada?.src || "";
        imagen.alt = texto(".drama-card__title", tarjeta, "Microdrama");

        modal.querySelector(
            ".desktop-card-detail__title"
        ).textContent = texto(
            ".drama-card__title",
            tarjeta,
            "Sin título"
        );

        modal.querySelector(
            ".desktop-card-detail__type"
        ).textContent = texto(
            ".drama-card__type",
            tarjeta,
            "Microdrama doblado al español."
        );

        modal.querySelector(
            ".desktop-card-detail__platform"
        ).textContent = texto(
            ".drama-card__platform",
            tarjeta,
            "Plataforma: Sin información"
        );

        modal.querySelector(
            ".desktop-card-detail__category"
        ).textContent = texto(
            ".drama-card__category",
            tarjeta,
            "Categoría: Sin categoría"
        );

        modal.querySelector(
            ".desktop-card-detail__views"
        ).textContent = texto(
            ".drama-card__views",
            tarjeta,
            "0 vistas"
        );

        const descripcion = texto(
            ".drama-card__description",
            tarjeta,
            "Sin descripción disponible."
        );

        modal.querySelector(
            ".desktop-card-detail__description"
        ).textContent = descripcion;

        const acciones = modal.querySelector(
            ".desktop-card-detail__actions"
        );

        acciones.innerHTML = "";

        /*
         * La existencia del botón original determina si el drama
         * es reproducible/publicado. Los borradores no lo tienen.
         */
        const botonVerOriginal = tarjeta.querySelector(
            ".drama-card__play"
        );

        if (botonVerOriginal) {
            const botonVer = document.createElement("button");

            botonVer.type = "button";
            botonVer.className = "desktop-card-detail__play";
            botonVer.innerHTML = `
                <span aria-hidden="true">▶</span>
                VER
            `;

            botonVer.addEventListener("click", evento => {
                evento.preventDefault();
                evento.stopPropagation();

                cerrarModal();

                /*
                 * Dejamos que el botón original ejecute exactamente
                 * la lógica existente del reproductor.
                 */
                setTimeout(() => {
                    botonVerOriginal.click();
                }, 0);
            });

            acciones.appendChild(botonVer);
        }

        document.body.classList.add(
            "desktop-card-detail-open"
        );

        modal.hidden = false;
        modal.setAttribute("aria-hidden", "false");

        requestAnimationFrame(() => {
            modal.classList.add("is-open");
        });

        modal.querySelector(
            ".desktop-card-detail__close"
        ).focus();
    }

    function cerrarModal() {
        if (!modal || modal.hidden) {
            return;
        }

        modal.classList.remove("is-open");
        modal.setAttribute("aria-hidden", "true");
        document.body.classList.remove(
            "desktop-card-detail-open"
        );

        setTimeout(() => {
            if (!modal) {
                return;
            }

            modal.hidden = true;
            tarjetaOrigen = null;
        }, 180);
    }

    function instalarEventos() {
        const catalogo = document.getElementById("catalogo");

        if (!catalogo || catalogo.dataset.desktopDetailReady === "true") {
            return;
        }

        catalogo.dataset.desktopDetailReady = "true";

        catalogo.addEventListener("click", evento => {
            if (!esEscritorio()) {
                return;
            }

            const tarjeta = evento.target.closest(".drama-card");

            if (!tarjeta || !catalogo.contains(tarjeta)) {
                return;
            }

            /*
             * Los controles internos ya tienen stopPropagation en app.js.
             * Estas comprobaciones son una segunda barrera para evitar
             * abrir el detalle al usar + o VER.
             */
            if (
                evento.target.closest(
                    ".drama-card__more, .drama-card__play, button, a"
                )
            ) {
                return;
            }

            evento.preventDefault();
            abrirModal(tarjeta);
        });

        document.addEventListener("keydown", evento => {
            if (
                evento.key === "Escape" &&
                modal &&
                !modal.hidden &&
                esEscritorio()
            ) {
                cerrarModal();
            }
        });

        window.addEventListener("resize", () => {
            if (!esEscritorio()) {
                cerrarModal();
            }
        }, { passive: true });
    }

    function iniciar() {
        crearModal();
        instalarEventos();
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            iniciar,
            { once: true }
        );
    } else {
        iniciar();
    }

})();
