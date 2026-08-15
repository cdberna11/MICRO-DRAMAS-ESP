"use strict";

const API_ADMIN_PUBLISH = "/api/admin/publish";

function adminNormalizar(valor) {
    return String(valor ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function adminEstadoBusqueda(valor) {
    const texto = adminNormalizar(valor);
    if (["publicado", "publicados", "published"].includes(texto)) return "published";
    if (["borrador", "borradores", "draft"].includes(texto)) return "draft";
    return null;
}

function mejorarTablaAdmin() {
    const tabla = document.querySelector(".admin-table");
    const lista = document.getElementById("lista-dramas");
    if (!tabla || !lista) return;

    const encabezado = tabla.querySelector("thead tr");
    if (encabezado && !encabezado.querySelector(".th-mega-status")) {
        const th = document.createElement("th");
        th.scope = "col";
        th.className = "th-mega-status";
        th.textContent = "Sin enlace MEGA";
        encabezado.insertBefore(th, encabezado.children[5] || null);
    }

    Array.from(lista.querySelectorAll("tr")).forEach(fila => {
        if (!fila.querySelector(".mega-status-cell")) {
            const celda = document.createElement("td");
            celda.className = "mega-status-cell";
            celda.textContent = "—";
            celda.title = "Comprobando enlace MEGA...";
            fila.insertBefore(celda, fila.children[5] || null);
        }

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

        celdaAcciones.appendChild(botonPublicar);
    });
}

async function completarEstadoMega() {
    const filas = Array.from(document.querySelectorAll("#lista-dramas tr"));
    if (!filas.length) return;

    try {
        const respuesta = await fetch("/api/admin/dramas", {
            method: "GET",
            credentials: "same-origin",
            headers: { "Accept": "application/json" },
            cache: "no-store"
        });
        if (!respuesta.ok) return;
        const datos = await respuesta.json();
        if (!datos.success || !Array.isArray(datos.dramas)) return;

        const porId = new Map(datos.dramas.map(drama => [String(drama.id), drama]));
        filas.forEach(fila => {
            const id = String(fila.children[1]?.textContent || "").trim();
            const drama = porId.get(id);
            const celda = fila.querySelector(".mega-status-cell");
            if (!celda || !drama) return;

            const sinEnlace = !String(drama.video_url || "").trim();
            celda.textContent = sinEnlace ? "Sí" : "No";
            celda.classList.toggle("mega-status--missing", sinEnlace);
            celda.classList.toggle("mega-status--ok", !sinEnlace);
            celda.title = sinEnlace
                ? "Este microdrama no tiene enlace de MEGA."
                : "Este microdrama tiene enlace de MEGA.";
        });
    } catch (error) {
        console.error("Error comprobando enlaces MEGA:", error);
    }
}

function aplicarFiltroEstadoDesdeTabla(estado) {
    const filas = Array.from(document.querySelectorAll("#lista-dramas tr"));
    let visibles = 0;

    filas.forEach(fila => {
        const indiceEstado = fila.querySelector(".mega-status-cell") ? 6 : 5;
        const texto = fila.children[indiceEstado]?.querySelector(".status-badge")?.textContent || "";
        const coincide = adminNormalizar(texto) === (estado === "published" ? "publicado" : "borrador");
        fila.hidden = !coincide;
        if (coincide) visibles += 1;
    });

    const resultado = document.getElementById("resultado-busqueda");
    if (resultado) {
        resultado.textContent = visibles === 0
            ? "No se encontraron microdramas con ese estado."
            : `Mostrando ${visibles} microdrama${visibles === 1 ? "" : "s"} con estado ${estado === "published" ? "publicado" : "borrador"}.`;
    }
}

function inicializarMejorasAdmin() {
    const buscador = document.getElementById("buscador-dramas");
    if (buscador) {
        let procesandoEstado = false;

        buscador.addEventListener("input", evento => {
            if (procesandoEstado) return;

            const estado = adminEstadoBusqueda(buscador.value);
            if (!estado) {
                setTimeout(() => {
                    mejorarTablaAdmin();
                    completarEstadoMega();
                }, 0);
                return;
            }

            evento.stopImmediatePropagation();
            procesandoEstado = true;
            const valorOriginal = buscador.value;
            buscador.value = "";
            buscador.dispatchEvent(new Event("input", { bubbles: true }));
            buscador.value = valorOriginal;

            setTimeout(() => {
                aplicarFiltroEstadoDesdeTabla(estado);
                const botonLimpiar = document.getElementById("boton-limpiar-busqueda");
                if (botonLimpiar) botonLimpiar.hidden = false;
                procesandoEstado = false;
            }, 0);
        }, true);
    }

    const lista = document.getElementById("lista-dramas");
    if (lista) {
        const observer = new MutationObserver(() => {
            mejorarTablaAdmin();
            completarEstadoMega();
        });
        observer.observe(lista, { childList: true });
    }

    mejorarTablaAdmin();
    completarEstadoMega();
}

document.addEventListener("DOMContentLoaded", inicializarMejorasAdmin);


/* =========================================================
   CORRECCIÓN AISLADA — REFRESCAR DESPUÉS DE CREAR
   =========================================================

   admin.js ya guarda correctamente el microdrama y muestra
   "Microdrama guardado correctamente.".

   No modificamos el flujo de guardado existente.
   Solamente observamos ese mensaje de éxito y refrescamos
   la página cuando se trata de un NUEVO microdrama.

   Las ediciones existentes y las demás acciones del panel
   permanecen sin cambios.
========================================================= */

function inicializarRefrescoDespuesDeGuardar() {

    const mensaje =
        document.getElementById("mensaje-admin");

    if (!mensaje) {
        return;
    }

    const observer = new MutationObserver(() => {

        const texto =
            String(mensaje.textContent || "").trim();

        const esExitoNuevo =
            texto === "Microdrama guardado correctamente." &&
            mensaje.hidden === false;

        if (!esExitoNuevo) {
            return;
        }

        observer.disconnect();

        setTimeout(() => {
            window.location.reload();
        }, 150);

    });

    observer.observe(mensaje, {
        childList: true,
        characterData: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["hidden"]
    });
}

document.addEventListener(
    "DOMContentLoaded",
    inicializarRefrescoDespuesDeGuardar
);
