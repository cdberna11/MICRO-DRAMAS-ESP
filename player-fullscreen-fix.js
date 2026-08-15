"use strict";

/* =========================================================
   MICRO-DRAMAS-ESP — FULLSCREEN ROBUSTO

   Solo modifica el comportamiento de pantalla completa.

   - El reproductor ocupa toda la pantalla.
   - En fullscreen los controles quedan ocultos.
   - Al tocar el vídeo aparecen temporalmente.
   - La X permanece disponible para cerrar.
   - X primero sale de fullscreen y después cierra el player.
   - Funciona con Fullscreen API estándar y fallback WebKit.
========================================================= */

(function instalarFullscreenRobusto() {

    let timerControles = null;

    function obtenerElementos() {
        return playerState?.playerElements || null;
    }

    function obtenerFullscreenElement() {
        return (
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            null
        );
    }

    async function salirFullscreenSeguro() {
        const activo = obtenerFullscreenElement();

        if (!activo) {
            return;
        }

        try {
            if (typeof document.exitFullscreen === "function") {
                await document.exitFullscreen();
            } else if (
                typeof document.webkitExitFullscreen === "function"
            ) {
                document.webkitExitFullscreen();
            }
        } catch (error) {
            console.warn(
                "[FULLSCREEN] No se pudo salir mediante la API:",
                error
            );
        }

        /*
         * Android/Chromium puede resolver exitFullscreen antes
         * de terminar visualmente la transición. Esperamos el
         * evento real o un pequeño fallback.
         */
        await new Promise(resolve => {
            let terminado = false;

            const finalizar = () => {
                if (terminado) return;
                terminado = true;
                document.removeEventListener(
                    "fullscreenchange",
                    finalizar
                );
                document.removeEventListener(
                    "webkitfullscreenchange",
                    finalizar
                );
                resolve();
            };

            document.addEventListener(
                "fullscreenchange",
                finalizar,
                { once: true }
            );

            document.addEventListener(
                "webkitfullscreenchange",
                finalizar,
                { once: true }
            );

            setTimeout(finalizar, 700);
        });
    }

    async function entrarFullscreenSeguro(elemento) {
        if (!elemento) return;

        try {
            if (typeof elemento.requestFullscreen === "function") {
                await elemento.requestFullscreen();
                return;
            }

            if (
                typeof elemento.webkitRequestFullscreen ===
                "function"
            ) {
                elemento.webkitRequestFullscreen();
            }
        } catch (error) {
            console.warn(
                "[FULLSCREEN] Error al entrar en pantalla completa:",
                error
            );
        }
    }

    function estaEnFullscreen() {
        return Boolean(obtenerFullscreenElement());
    }

    function ocultarControles() {
        const elementos = obtenerElementos();

        if (!elementos?.reproductor) return;

        elementos.reproductor.classList.remove(
            "fullscreen-controls-visible"
        );

        if (timerControles) {
            clearTimeout(timerControles);
            timerControles = null;
        }
    }

    function mostrarControles(temporal = true) {
        const elementos = obtenerElementos();

        if (!elementos?.reproductor || !estaEnFullscreen()) {
            return;
        }

        elementos.reproductor.classList.add(
            "fullscreen-controls-visible"
        );

        if (timerControles) {
            clearTimeout(timerControles);
            timerControles = null;
        }

        if (temporal) {
            timerControles = setTimeout(() => {
                const video = elementos.video;

                /* Si está pausado, dejamos los controles visibles
                   para permitir que el usuario vuelva a reproducir. */
                if (!video || !video.paused) {
                    ocultarControles();
                }
            }, 3000);
        }
    }

    async function alternarFullscreenSeguro(evento) {
        evento?.preventDefault?.();
        evento?.stopPropagation?.();
        evento?.stopImmediatePropagation?.();

        const elementos = obtenerElementos();
        if (!elementos?.ventana) return;

        if (estaEnFullscreen()) {
            await salirFullscreenSeguro();
            return;
        }

        await entrarFullscreenSeguro(elementos.ventana);
    }

    async function cerrarReproductorSeguro(evento) {
        evento?.preventDefault?.();
        evento?.stopPropagation?.();
        evento?.stopImmediatePropagation?.();

        /*
         * ORDEN CRÍTICO:
         * 1. salir de fullscreen;
         * 2. esperar la transición;
         * 3. cerrar/detener el reproductor.
         */
        await salirFullscreenSeguro();
        ocultarControles();

        try {
            cerrarReproductor();
        } catch (error) {
            console.warn(
                "[FULLSCREEN] Error cerrando reproductor:",
                error
            );
        }
    }

    function sincronizarEstadoFullscreen() {
        const elementos = obtenerElementos();

        if (!elementos?.reproductor) {
            return;
        }

        const activo = estaEnFullscreen();

        elementos.reproductor.classList.toggle(
            "is-fullscreen-active",
            activo
        );

        if (!activo) {
            ocultarControles();
        } else {
            /* Al entrar se ocultan los controles; tocar el vídeo los muestra. */
            ocultarControles();
        }

        console.log(
            activo
                ? "[FULLSCREEN] ✓ Pantalla completa activa."
                : "[FULLSCREEN] ✓ Pantalla completa finalizada."
        );
    }

    function instalarInteraccionFullscreen() {
        const elementos = obtenerElementos();

        if (
            !elementos?.area ||
            elementos.area.dataset.fullscreenInteraction === "1"
        ) {
            return;
        }

        elementos.area.dataset.fullscreenInteraction = "1";

        elementos.area.addEventListener(
            "pointerdown",
            evento => {
                if (!estaEnFullscreen()) return;

                /*
                 * Si el usuario toca un botón/slider, también
                 * mostramos los controles y dejamos que el evento
                 * continúe normalmente.
                 */
                if (evento.target.closest("button, input")) {
                    mostrarControles(true);
                    return;
                }

                mostrarControles(true);
            },
            { passive: true }
        );

        elementos.area.addEventListener(
            "touchstart",
            () => {
                if (estaEnFullscreen()) {
                    mostrarControles(true);
                }
            },
            { passive: true }
        );
    }

    function instalarHandlers() {
        const elementos = obtenerElementos();

        if (!elementos?.fullscreen || !elementos?.cerrar) {
            return false;
        }

        instalarInteraccionFullscreen();

        if (
            elementos.fullscreen.dataset.fullscreenFixInstalled ===
            "2"
        ) {
            return true;
        }

        /*
         * Capture + stopImmediatePropagation evita que el
         * listener original de app.js ejecute otra transición.
         */
        elementos.fullscreen.addEventListener(
            "click",
            alternarFullscreenSeguro,
            true
        );

        elementos.cerrar.addEventListener(
            "click",
            cerrarReproductorSeguro,
            true
        );

        elementos.fullscreen.dataset.fullscreenFixInstalled = "2";
        elementos.cerrar.dataset.fullscreenFixInstalled = "2";

        return true;
    }

    /*
     * El reproductor se crea dinámicamente.
     */
    let intentos = 0;

    const esperarPlayer = () => {
        if (instalarHandlers()) return;

        intentos++;

        if (intentos < 120) {
            setTimeout(esperarPlayer, 250);
        }
    };

    esperarPlayer();

    document.addEventListener(
        "fullscreenchange",
        sincronizarEstadoFullscreen
    );

    document.addEventListener(
        "webkitfullscreenchange",
        sincronizarEstadoFullscreen
    );

    document.addEventListener(
        "fullscreenerror",
        evento => {
            console.warn(
                "[FULLSCREEN] Error de la API:",
                evento
            );
        }
    );

    console.log(
        "[FULLSCREEN] ✓ Corrección robusta instalada."
    );

})();
