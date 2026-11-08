"use strict";

const API_ADMIN_PUBLISH = "/api/admin/publish";
const API_ADMIN_DRAFT = "/api/admin/draft";

function adminNormalizar(valor) {
    return String(valor ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function mejorarTablaAdmin() {
    const tabla = document.querySelector(".admin-table");
    const lista = document.getElementById("lista-dramas");
    if (!tabla || !lista) return;

    Array.from(lista.querySelectorAll("tr")).forEach(fila => {
        const celdaAcciones = fila.lastElementChild;
        if (!celdaAcciones || celdaAcciones.querySelector(".button--publish")) return;

        const botonEditar = celdaAcciones.querySelector(".button--edit");
        if (!botonEditar) return;

        const botonPublicar = document.createElement("button");
        botonPublicar.type = "button";
        botonPublicar.className = "button button--publish";

        const estadoTexto = fila.children[6]?.querySelector(".status-badge")?.textContent || "";
        const publicado = adminNormalizar(estadoTexto) === "publicado";

        botonPublicar.textContent = publicado ? "Publicado" : "Publicar";
        botonPublicar.disabled = publicado;
        botonPublicar.title = publicado
            ? "Este microdrama ya está publicado"
            : "Publicar microdrama sin abrir el editor";

        botonPublicar.addEventListener("click", async evento => {
            evento.stopPropagation();
            const id = Number(fila.children[1]?.textContent);
            if (!Number.isInteger(id) || id <= 0 || botonPublicar.disabled) return;

            if (!window.confirm("¿Publicar este microdrama ahora?")) return;

            botonPublicar.disabled = true;
            botonPublicar.textContent = "Publicando...";

            try {
                const respuesta = await fetch(API_ADMIN_PUBLISH, {
                    method: "POST",
                    credentials: "same-origin",
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    body: JSON.stringify({ id })
                });

                const resultado = await respuesta.json();
                if (!respuesta.ok || !resultado.success) {
                    throw new Error(resultado.error || "No se pudo publicar el microdrama.");
                }

                if (typeof window.cargarDramasAdministrativos === "function") {
                    await window.cargarDramasAdministrativos();
                }

                if (typeof window.mostrarMensajeAdmin === "function") {
                    window.mostrarMensajeAdmin(
                        resultado.message || "Microdrama publicado correctamente.",
                        "success"
                    );
                }
            } catch (error) {
                console.error("Error publicación rápida:", error);
                botonPublicar.disabled = false;
                botonPublicar.textContent = "Publicar";
                if (typeof window.mostrarMensajeAdmin === "function") {
                    window.mostrarMensajeAdmin(
                        error.message || "No se pudo publicar el microdrama.",
                        "error"
                    );
                }
            }
        });

        const botonBorrador = document.createElement("button");
        botonBorrador.type = "button";
        botonBorrador.className = "button button--draft";
        botonBorrador.textContent = "Borrador";
        botonBorrador.disabled = !publicado;
        botonBorrador.title = publicado
            ? "Retirar del catálogo y guardar como borrador"
            : "Este microdrama ya está en borrador";

        botonBorrador.addEventListener("click", async evento => {
            evento.stopPropagation();
            const id = Number(fila.children[1]?.textContent);
            if (!Number.isInteger(id) || id <= 0 || botonBorrador.disabled) return;
            if (!window.confirm("¿Volver este microdrama a borrador? Dejará de aparecer en el catálogo.")) return;

            botonBorrador.disabled = true;
            botonBorrador.textContent = "Guardando...";

            try {
                const respuesta = await fetch(API_ADMIN_DRAFT, {
                    method: "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json", "Accept": "application/json" },
                    body: JSON.stringify({ id })
                });
                const resultado = await respuesta.json();
                if (!respuesta.ok || !resultado.success) {
                    throw new Error(resultado.error || "No se pudo cambiar a borrador.");
                }
                if (typeof window.cargarDramasAdministrativos === "function") {
                    await window.cargarDramasAdministrativos();
                }
                if (typeof window.mostrarMensajeAdmin === "function") {
                    window.mostrarMensajeAdmin(resultado.message || "Microdrama guardado como borrador.", "success");
                }
            } catch (error) {
                console.error("Error al cambiar a borrador:", error);
                botonBorrador.disabled = false;
                botonBorrador.textContent = "Borrador";
                if (typeof window.mostrarMensajeAdmin === "function") {
                    window.mostrarMensajeAdmin(error.message || "No se pudo cambiar a borrador.", "error");
                }
            }
        });

        celdaAcciones.append(botonPublicar, botonBorrador);
    });
}

function inicializarMejorasAdmin() {
    const lista = document.getElementById("lista-dramas");
    if (lista) {
        const observer = new MutationObserver(() => {
            mejorarTablaAdmin();
        });
        observer.observe(lista, { childList: true });
    }

    mejorarTablaAdmin();
}

document.addEventListener("DOMContentLoaded", inicializarMejorasAdmin);


/* =========================================================
   SALIR DEL PANEL ADMINISTRATIVO
   El botón se agrega junto a las acciones existentes.
   Cierra la sesión en D1, elimina las cookies y vuelve
   a la pantalla de acceso administrativo.
========================================================= */

async function cerrarSesionAdministrativa() {
    const boton = document.getElementById("boton-salir-admin");
    if (!boton || boton.disabled) return;

    const confirmar = window.confirm("¿Deseas cerrar la sesión administrativa?");
    if (!confirmar) return;

    boton.disabled = true;
    boton.textContent = "Saliendo...";

    try {
        const respuesta = await fetch("/api/auth/logout", {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Accept": "application/json"
            },
            cache: "no-store"
        });

        const resultado = await respuesta.json().catch(() => ({}));

        if (!respuesta.ok || !resultado.success) {
            throw new Error(
                resultado.error ||
                "No se pudo cerrar la sesión."
            );
        }

        window.location.replace("/admin-login.html");
    } catch (error) {
        console.error("Error al cerrar sesión administrativa:", error);
        boton.disabled = false;
        boton.textContent = "Salir";
        window.alert(
            error.message ||
            "No se pudo cerrar la sesión. Inténtalo nuevamente."
        );
    }
}

function inicializarBotonSalirAdmin() {
    const acciones = document.querySelector(".admin-panel__actions");
    if (!acciones || document.getElementById("boton-salir-admin")) return;

    const boton = document.createElement("button");
    boton.id = "boton-salir-admin";
    boton.type = "button";
    boton.className = "button button--secondary button--logout";
    boton.textContent = "Salir";
    boton.title = "Cerrar sesión administrativa";
    boton.setAttribute("aria-label", "Cerrar sesión administrativa");
    boton.addEventListener("click", cerrarSesionAdministrativa);

    acciones.appendChild(boton);
}

document.addEventListener(
    "DOMContentLoaded",
    inicializarBotonSalirAdmin
);
