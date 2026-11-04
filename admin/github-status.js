"use strict";

(function () {

    const API_GITHUB_STATUS =
        "/api/admin/github-status";

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

        const tituloToken =
            document.getElementById("github-token-title");

        if (!contenedor || !titulo || !detalle || !expiracion || !tituloToken) {
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

            contenedor.classList.remove(
                "github-status--error",
                "github-status--warning"
            );
            contenedor.classList.add("github-status--connected");

            titulo.textContent =
                "GitHub: Conectado";

            detalle.textContent =
                `Repositorio: ${resultado.repository}`;

            const fechaISO =
                /^\d{4}-\d{2}-\d{2}$/.test(String(resultado.expiresAt || ""))
                    ? resultado.expiresAt
                    : "";

            const fecha =
                formatearFecha(fechaISO);

            const dias =
                Number.isInteger(resultado.daysRemaining)
                    ? resultado.daysRemaining
                    : calcularDiasRestantes(
                        fechaActualPanamaISO(),
                        fechaISO
                    );

            const proximoAExpirar =
                Number.isInteger(dias) &&
                dias <= 30;

            tituloToken.textContent =
                proximoAExpirar
                    ? "Token: Próximo a expirar"
                    : "Token: Válido";

            if (proximoAExpirar) {
                contenedor.classList.add(
                    "github-status--warning"
                );
            }

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
            contenedor.classList.remove("github-status--warning");
            contenedor.classList.add("github-status--error");

            titulo.textContent =
                "GitHub: Token inválido o no disponible";

            detalle.textContent =
                error?.message ||
                "No se pudo comprobar la conexión con GitHub.";

            tituloToken.textContent =
                "Token: No disponible";

            expiracion.textContent =
                "Las portadas no podrán subirse hasta corregir el acceso.";
        }
    }

    function calcularDiasRestantes(fechaInicioISO, fechaExpiracionISO) {

        if (
            !/^\d{4}-\d{2}-\d{2}$/.test(String(fechaInicioISO || "")) ||
            !/^\d{4}-\d{2}-\d{2}$/.test(String(fechaExpiracionISO || ""))
        ) {
            return null;
        }

        const inicio =
            new Date(`${fechaInicioISO}T00:00:00Z`);

        const expiracion =
            new Date(`${fechaExpiracionISO}T00:00:00Z`);

        if (
            Number.isNaN(inicio.getTime()) ||
            Number.isNaN(expiracion.getTime())
        ) {
            return null;
        }

        return Math.max(
            0,
            Math.ceil(
                (expiracion.getTime() - inicio.getTime()) / 86400000
            )
        );
    }

    function fechaActualPanamaISO() {

        const partes =
            new Intl.DateTimeFormat(
                "en-CA",
                {
                    timeZone: "America/Panama",
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit"
                }
            ).formatToParts(new Date());

        const valores = {};

        partes.forEach(parte => {
            if (parte.type !== "literal") {
                valores[parte.type] = parte.value;
            }
        });

        if (!valores.year || !valores.month || !valores.day) {
            return "";
        }

        return `${valores.year}-${valores.month}-${valores.day}`;
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
