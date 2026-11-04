"use strict";

const API_ADMIN_USERS = "/api/admin/users";

function inicializarAdministracionUsuarios() {
    const boton = document.getElementById("boton-administrar-usuarios");
    const vista = document.getElementById("vista-usuarios");
    const recargar = document.getElementById("boton-recargar-usuarios");
    const eliminar = document.getElementById("boton-eliminar-usuarios");
    const seleccionarTodos = document.getElementById("seleccionar-todos-usuarios");

    if (!boton || !vista) return;

    boton.addEventListener("click", async () => {
        if (typeof mostrarVistaUsuarios === "function") {
            mostrarVistaUsuarios();
        } else {
            vista.hidden = false;
        }

        await cargarUsuariosAdministrativos();
    });

    if (recargar) recargar.addEventListener("click", cargarUsuariosAdministrativos);
    if (eliminar) eliminar.addEventListener("click", eliminarUsuariosSeleccionados);

    if (seleccionarTodos) {
        seleccionarTodos.addEventListener("change", () => {
            document.querySelectorAll(".usuario-checkbox").forEach(casilla => {
                casilla.checked = seleccionarTodos.checked;
            });
            actualizarSeleccionUsuarios();
        });
    }
}


async function cargarUsuariosAdministrativos() {
    const estado = document.getElementById("estado-carga-usuarios");
    const cuerpo = document.getElementById("lista-usuarios");
    const vacio = document.getElementById("usuarios-vacio");

    if (!cuerpo) return;

    cuerpo.replaceChildren();
    if (estado) {
        estado.hidden = false;
        estado.textContent = "Cargando usuarios...";
    }
    if (vacio) vacio.hidden = true;

    actualizarSeleccionUsuarios();

    try {
        const respuesta = await fetch(API_ADMIN_USERS, {
            method: "GET",
            credentials: "same-origin",
            headers: { "Accept": "application/json" },
            cache: "no-store"
        });

        const resultado = await respuesta.json();
        if (!respuesta.ok || !resultado.success) {
            throw new Error(resultado.error || "No se pudieron cargar los usuarios.");
        }

        const usuarios = Array.isArray(resultado.users) ? resultado.users : [];

        usuarios.forEach(usuario => cuerpo.appendChild(crearFilaUsuario(usuario)));

        if (estado) estado.hidden = true;
        if (vacio) vacio.hidden = usuarios.length !== 0;

        actualizarSeleccionUsuarios();
    } catch (error) {
        console.error("Error cargando usuarios:", error);
        if (estado) {
            estado.hidden = false;
            estado.textContent = error.message || "No se pudieron cargar los usuarios.";
            estado.className = "users-status users-status--error";
        }
    }
}

function crearFilaUsuario(usuario) {
    const fila = document.createElement("tr");

    const seleccion = document.createElement("td");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "usuario-checkbox";
    checkbox.value = usuario.id;
    checkbox.title = "Seleccionar usuario";
    checkbox.addEventListener("change", actualizarSeleccionUsuarios);
    seleccion.appendChild(checkbox);
    fila.appendChild(seleccion);

    fila.appendChild(crearCeldaUsuario(usuario.id));
    fila.appendChild(crearCeldaUsuario(usuario.display_name || "Usuario"));
    fila.appendChild(crearCeldaUsuario(usuario.email || "—"));
    fila.appendChild(crearCeldaUsuario(usuario.phone || "—"));
    fila.appendChild(crearCeldaUsuario(usuario.auth_method || "local"));
    fila.appendChild(crearCeldaUsuario(usuario.auth_provider || "local"));
    fila.appendChild(crearCeldaUsuario(formatearFechaUsuario(usuario.created_at)));
    fila.appendChild(crearCeldaUsuario(formatearFechaUsuario(usuario.last_login_at)));

    const acciones = document.createElement("td");
    const botonEliminar = document.createElement("button");
    botonEliminar.type = "button";
    botonEliminar.className = "button button--user-delete delete-action delete-action--compact";
    botonEliminar.setAttribute("aria-label", `Eliminar usuario ${usuario.display_name || usuario.email || usuario.id}`);
    botonEliminar.innerHTML = `
        <span class="delete-action__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
                <path class="delete-action__lid" d="M8 7h8M10 4h4l1 3H9l1-3"></path>
                <path class="delete-action__bin" d="M7.5 7 9 20h6l1.5-13M11 10v7M13 10v7"></path>
            </svg>
        </span>
        <span class="delete-action__label">Eliminar</span>
    `;
    botonEliminar.addEventListener("click", () => eliminarUsuarios([Number(usuario.id)], botonEliminar));
    acciones.appendChild(botonEliminar);
    fila.appendChild(acciones);

    return fila;
}

function crearCeldaUsuario(valor) {
    const celda = document.createElement("td");
    celda.textContent = valor;
    return celda;
}

function formatearFechaUsuario(valor) {
    if (!valor) return "—";
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) return String(valor);
    return new Intl.DateTimeFormat("es-PA", {
        dateStyle: "short",
        timeStyle: "short"
    }).format(fecha);
}

function obtenerUsuariosSeleccionados() {
    return Array.from(document.querySelectorAll(".usuario-checkbox:checked"))
        .map(casilla => Number(casilla.value))
        .filter(id => Number.isInteger(id) && id > 0);
}

function actualizarSeleccionUsuarios() {
    const seleccionados = obtenerUsuariosSeleccionados();
    const boton = document.getElementById("boton-eliminar-usuarios");
    const seleccionarTodos = document.getElementById("seleccionar-todos-usuarios");
    const total = document.querySelectorAll(".usuario-checkbox").length;

    if (boton) {
        boton.disabled = seleccionados.length === 0;

        const etiqueta =
            boton.querySelector(
                ".delete-action__label"
            );

        if (etiqueta) {
            etiqueta.textContent =
                "Eliminar";
        }

        boton.setAttribute(
            "aria-label",
            seleccionados.length
                ? `Eliminar ${seleccionados.length} usuario${seleccionados.length === 1 ? "" : "s"} seleccionado${seleccionados.length === 1 ? "" : "s"}`
                : "Eliminar usuarios seleccionados"
        );
    }

    if (seleccionarTodos) {
        seleccionarTodos.checked = total > 0 && seleccionados.length === total;
        seleccionarTodos.indeterminate = seleccionados.length > 0 && seleccionados.length < total;
    }
}

async function eliminarUsuariosSeleccionados() {
    const ids = obtenerUsuariosSeleccionados();
    if (!ids.length) return;

    const boton =
        document.getElementById(
            "boton-eliminar-usuarios"
        );

    await eliminarUsuarios(
        ids,
        boton
    );
}

async function eliminarUsuarios(
    ids,
    botonOrigen = null
) {
    const mensaje = ids.length === 1
        ? "¿Seguro que deseas eliminar este usuario?"
        : `¿Seguro que deseas eliminar ${ids.length} usuarios?`;

    const confirmado =
        await window.solicitarConfirmacionEliminacion({
            titulo:
                ids.length === 1
                    ? "Eliminar usuario"
                    : "Eliminar usuarios",
            mensaje,
            detalle:
                "También se cerrarán sus sesiones activas. Esta acción no se puede deshacer."
        });

    if (!confirmado) return;

    const boton =
        botonOrigen ||
        document.getElementById(
            "boton-eliminar-usuarios"
        );

    if (boton) {
        boton.disabled = true;
        boton.classList.add(
            "is-deleting"
        );
        boton.setAttribute(
            "aria-busy",
            "true"
        );
    }

    const inicioAnimacion =
        Date.now();

    try {
        const respuesta = await fetch(API_ADMIN_USERS, {
            method: "DELETE",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify({ ids })
        });

        const tiempoRestante =
            Math.max(
                0,
                900 -
                (
                    Date.now() -
                    inicioAnimacion
                )
            );

        if (tiempoRestante > 0) {
            await new Promise(
                resolver =>
                    window.setTimeout(
                        resolver,
                        tiempoRestante
                    )
            );
        }

        const resultado = await respuesta.json();
        if (!respuesta.ok || !resultado.success) {
            throw new Error(resultado.error || "No se pudieron eliminar los usuarios.");
        }

        await cargarUsuariosAdministrativos();
    } catch (error) {
        console.error("Error eliminando usuarios:", error);
        const estado = document.getElementById("estado-carga-usuarios");
        if (estado) {
            estado.hidden = false;
            estado.className = "users-status users-status--error";
            estado.textContent = error.message || "No se pudieron eliminar los usuarios.";
        }
    } finally {
        if (boton) {
            boton.classList.remove(
                "is-deleting"
            );
            boton.removeAttribute(
                "aria-busy"
            );
        }

        actualizarSeleccionUsuarios();
    }
}

document.addEventListener("DOMContentLoaded", inicializarAdministracionUsuarios);
