"use strict";

/*
 * Lógica exclusiva del panel móvil.
 * No modifica el panel de escritorio.
 */
(function prepararPanelMovil() {
    /*
     * El botón Salir ya es gestionado por mobile-admin.js.
     * Este archivo solo controla tiempos máximos de las APIs móviles.
     */

    const fetchOriginal = window.fetch.bind(window);
    const TIEMPO_MAXIMO = 20000;

    window.fetch = function (input, init = {}) {
        const url = typeof input === "string"
            ? input
            : input?.url || "";

        const esApiAdministrativaMovil =
            url.startsWith("/api/admin-movil/") ||
            url.includes("/api/admin-movil/");

        if (!esApiAdministrativaMovil || typeof AbortController === "undefined") {
            return fetchOriginal(input, init);
        }

        const controller = new AbortController();
        const signalOriginal = init.signal;

        if (signalOriginal) {
            if (signalOriginal.aborted) {
                controller.abort();
            } else {
                signalOriginal.addEventListener(
                    "abort",
                    () => controller.abort(),
                    { once: true }
                );
            }
        }

        const timeout = window.setTimeout(
            () => controller.abort(),
            TIEMPO_MAXIMO
        );

        return fetchOriginal(
            input,
            { ...init, signal: controller.signal }
        )
            .catch(error => {
                if (error?.name === "AbortError") {
                    throw new Error(
                        "La conexión administrativa tardó demasiado. Recarga la página e inténtalo nuevamente."
                    );
                }
                throw error;
            })
            .finally(() => window.clearTimeout(timeout));
    };
})();
