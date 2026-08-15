"use strict";

/* =========================================================
   MICRO-DRAMAS-ESP
   CORRECCIÓN ESPECÍFICA DE PANTALLA COMPLETA

   Mantiene intacto el reproductor actual.
   Corrige únicamente:
   1. Cerrar el reproductor mientras está en fullscreen.
   2. Salir de fullscreen desde el botón ⛶.
   3. Sincronizar el estado cuando Android/Sistema sale
      de fullscreen por su cuenta.
========================================================= */

(function instalarFullscreenRobusto() {

    function obtenerElementos() {
        return playerState?.playerElements || null;
    }

    async function salirFullscreenSeguro() {
        try {
            if (document.fullscreenElement && typeof document.exitFullscreen === "function") {
                await document.exitFullscreen();
            }
        } catch (error) {
            console.warn("[FULLSCREEN] No se pudo salir mediante la API:", error);
        }
    }

    async function alternarFullscreenSeguro(evento) {
        evento?.preventDefault?.();
        evento?.stopPropagation?.();
        evento?.stopImmediatePropagation?.();

        const elementos = obtenerElementos();
        if (!elementos?.ventana) return;

        try {
            if (document.fullscreenElement) {
                await salirFullscreenSeguro();
                return;
            }

            if (typeof elementos.ventana.requestFullscreen === "function") {
                await elementos.ventana.requestFullscreen();
            }
        } catch (error) {
            console.warn("[FULLSCREEN] Error al cambiar fullscreen:", error);
        }
    }

    async function cerrarReproductorSeguro(evento) {
        evento?.preventDefault?.();
        evento?.stopPropagation?.();
        evento?.stopImmediatePropagation?.();

        /*
         * IMPORTANTE:
         * primero abandonamos fullscreen y esperamos a que el
         * navegador termine la transición; después cerramos el
         * reproductor. Así evitamos dejar el elemento oculto
         * atrapado en la capa fullscreen del navegador.
         */
        await salirFullscreenSeguro();

        try {
            cerrarReproductor();
        } catch (error) {
            console.warn("[FULLSCREEN] Error cerrando reproductor:", error);
        }
    }

    function instalarHandlers() {
        const elementos = obtenerElementos();

        if (!elementos?.fullscreen || !elementos?.cerrar) {
            return false;
        }

        if (elementos.fullscreen.dataset.fullscreenFixInstalled === "1") {
            return true;
        }

        /*
         * CAPTURE + stopImmediatePropagation evita que se ejecute
         * el listener antiguo de app.js en paralelo.
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

        elementos.fullscreen.dataset.fullscreenFixInstalled = "1";
        elementos.cerrar.dataset.fullscreenFixInstalled = "1";

        return true;
    }

    /*
     * El reproductor se crea dinámicamente. Esperamos hasta que
     * playerElements exista, sin tocar ninguna otra función.
     */
    let intentos = 0;
    const esperarPlayer = () => {
        if (instalarHandlers()) return;
        if (++intentos < 120) setTimeout(esperarPlayer, 250);
    };

    esperarPlayer();

    /*
     * Si el usuario sale de fullscreen mediante el gesto del
     * sistema/Android, dejamos el estado visual sincronizado.
     */
    document.addEventListener("fullscreenchange", () => {
        const elementos = obtenerElementos();
        if (!elementos?.reproductor) return;

        const activo = Boolean(document.fullscreenElement);
        elementos.reproductor.classList.toggle("is-fullscreen-active", activo);

        console.log(
            activo
                ? "[FULLSCREEN] ✓ Entró en pantalla completa."
                : "[FULLSCREEN] ✓ Salió de pantalla completa."
        );
    });

    document.addEventListener("fullscreenerror", evento => {
        console.warn("[FULLSCREEN] Error de la API:", evento);
    });

    console.log("[FULLSCREEN] ✓ Corrección robusta instalada.");

})();
