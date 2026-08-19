"use strict";

const API_ADMIN_LOGOUT = "/api/auth/logout";

function inicializarBotonSalir() {
    const botonSalir = document.getElementById("boton-salir-admin");
    if (!botonSalir) return;

    botonSalir.addEventListener("click", async () => {
        const confirmar = window.confirm(
            "¿Deseas cerrar la sesión del administrador?"
        );

        if (!confirmar) return;

        botonSalir.disabled = true;
        const textoOriginal = botonSalir.textContent;
        botonSalir.textContent = "Saliendo...";

        try {
            const respuesta = await fetch(API_ADMIN_LOGOUT, {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Accept": "application/json"
                },
                cache: "no-store"
            });

            const resultado = await respuesta.json().catch(() => ({}));

            if (!respuesta.ok && resultado.success !== false) {
                throw new Error("No se pudo cerrar la sesión.");
            }

            // El parámetro evita que el navegador reutilice una versión
            // anterior de la pantalla de acceso.
            window.location.replace(
                "/admin-login.html?logout=20260819"
            );
        } catch (error) {
            console.error("Error al cerrar sesión:", error);
            botonSalir.disabled = false;
            botonSalir.textContent = textoOriginal;
            window.alert(
                error.message ||
                "No se pudo cerrar la sesión. Inténtalo nuevamente."
            );
        }
    });
}

document.addEventListener(
    "DOMContentLoaded",
    inicializarBotonSalir
);
