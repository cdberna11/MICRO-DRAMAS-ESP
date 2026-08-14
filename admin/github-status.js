"use strict";

(function () {

    const API_GITHUB_STATUS =
        "/api/admin/github-status";

    const FECHA_EXPIRACION_POR_DEFECTO =
        "2027-08-14";

    document.addEventListener(
        "DOMContentLoaded",
        comprobarEstadoGitHub
    );

    async function comprobarEstadoGitHub() {

        const contenedor =
            document.getElementById("estado-github");

        const titulo =
            document.getElementById("github-status-title");

        const detalle =
            document.getElementById("github-status-detail");

        const expiracion =
            document.getElementById("github-status-expiration");

        if (!contenedor || !titulo || !detalle || !expiracion) {
            return;
        }

        try {

            const respuesta =
                await fetch(
                    API_GITHUB_STATUS,
                    {
                        method: "GET",
                        credentials: "same-origin",
                        cache: "no-store",
                        headers: {
                            "Accept": "application/json"
                        }
                    }
                );

            const resultado =
                await respuesta.json().catch(
                    () => ({})
                );

            if (
                !respuesta.ok ||
                !resultado.success ||
                !resultado.connected
            ) {
                throw new Error(
                    resultado.error ||
                    "No se pudo comprobar GitHub."
                );
            }

            contenedor.classList.remove("github-status--error");
            contenedor.classList.add("github-status--connected");

            titulo.textContent =
                "GitHub: Conectado";

            detalle.textContent =
                `Repositorio: ${resultado.repository}`;

            const dias =
                Number.isInteger(resultado.daysRemaining)
                    ? resultado.daysRemaining
                    : calcularDiasRestantes(FECHA_EXPIRACION_POR_DEFECTO);

            const fechaISO =
                /^\d{4}-\d{2}-\d{2}$/.test(String(resultado.expiresAt || ""))
                    ? resultado.expiresAt
                    : FECHA_EXPIRACION_POR_DEFECTO;

            const fecha =
                formatearFecha(fechaISO);

            if (Number.isInteger(dias) && fecha) {
                expiracion.textContent =
                    `Token válido · quedan ${dias} días · expira ${fecha}`;
            } else if (fecha) {
                expiracion.textContent =
                    `Token válido · expira ${fecha}`;
            } else {
                expiracion.textContent =
                    "Token válido";
            }

        } catch (error) {

            contenedor.classList.remove("github-status--connected");
            contenedor.classList.add("github-status--error");

            titulo.textContent =
                "GitHub: Token inválido o no disponible";

            detalle.textContent =
                error?.message ||
                "No se pudo comprobar la conexión con GitHub.";

            expiracion.textContent =
                "Las portadas no podrán subirse hasta corregir el acceso.";
        }
    }

    function calcularDiasRestantes(fechaISO) {

        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fechaISO || ""))) {
            return null;
        }

        const fecha =
            new Date(`${fechaISO}T23:59:59Z`);

        if (Number.isNaN(fecha.getTime())) {
            return null;
        }

        return Math.max(
            0,
            Math.ceil(
                (fecha.getTime() - Date.now()) / 86400000
            )
        );
    }

    function formatearFecha(valor) {

        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor || ""))) {
            return "";
        }

        const [anio, mes, dia] =
            String(valor).split("-").map(Number);

        return new Intl.DateTimeFormat(
            "es-PA",
            {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                timeZone: "America/Panama"
            }
        ).format(
            new Date(
                Date.UTC(anio, mes - 1, dia, 12, 0, 0)
            )
        );
    }

})();
