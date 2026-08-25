"use strict";

/*
 * Lógica exclusiva del panel móvil.
 * No modifica el panel de escritorio.
 */
(function prepararPanelMovil() {
    const botonSalir = document.getElementById("boton-salir-admin");
    const encabezado = document.querySelector(".admin-header__content");

    /* El botón Salir se conserva como única acción superior del móvil. */
    if (botonSalir && encabezado) {
        botonSalir.classList.add("admin-mobile-exit");
        encabezado.appendChild(botonSalir);
    }

    /*
     * Evita que una petición administrativa del móvil quede esperando
     * indefinidamente. El flujo del escritorio no se toca.
     */
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
