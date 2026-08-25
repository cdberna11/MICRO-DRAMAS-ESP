"use strict";

/*
 * Protección exclusiva del panel móvil:
 * evita que una petición administrativa quede esperando indefinidamente.
 * No modifica el flujo del escritorio.
 */
(function protegerFetchAdministrativoMovil() {
    const fetchOriginal = window.fetch.bind(window);
    const TIEMPO_MAXIMO = 20000;

    window.fetch = function (input, init = {}) {
        const url = typeof input === "string"
            ? input
            : input?.url || "";

        const esApiAdministrativa =
            url.startsWith("/api/admin/") ||
            url.includes("/api/admin/");

        if (!esApiAdministrativa || typeof AbortController === "undefined") {
            return fetchOriginal(input, init);
        }

        const controller = new AbortController();
        const signalOriginal = init.signal;

        if (signalOriginal) {
            if (signalOriginal.aborted) {
                controller.abort();
            } else {
                signalOriginal.addEventListener("abort", () => controller.abort(), { once: true });
            }
        }

        const timeout = window.setTimeout(() => controller.abort(), TIEMPO_MAXIMO);

        return fetchOriginal(input, { ...init, signal: controller.signal })
            .catch(error => {
                if (error?.name === "AbortError") {
                    throw new Error("La conexión administrativa tardó demasiado. Recarga la página e inténtalo nuevamente.");
                }
                throw error;
            })
            .finally(() => window.clearTimeout(timeout));
    };
})();
