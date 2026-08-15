"use strict";

const API_ADMIN_USERS = "/api/admin/users";

function inicializarAdministracionUsuarios() {
    const boton = document.getElementById("boton-administrar-usuarios");
    const modal = document.getElementById("modal-administrar-usuarios");
    const cerrar = document.getElementById("boton-cerrar-modal-usuarios");
    const backdrop = document.getElementById("usuarios-modal-backdrop");
    const recargar = document.getElementById("boton-recargar-usuarios");
    const eliminar = document.getElementById("boton-eliminar-usuarios");
    const seleccionarTodos = document.getElementById("seleccionar-todos-usuarios");

    if (!boton || !modal) return;

    boton.addEventListener("click", async () => {
        abrirModalUsuarios();
        await cargarUsuariosAdministrativos();
    });

    if (cerrar) cerrar.addEventListener("click", cerrarModalUsuarios);
    if (backdrop) backdrop.addEventListener("click", cerrarModalUsuarios);
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

    document.addEventListener("keydown", evento => {
        if (evento.key === "Escape" && !modal.hidden) cerrarModalUsuarios();
    });
}

function abrirModalUsuarios() {
    const modal = document.getElementById("modal-administrar-usuarios");
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add("users-modal-open");
}

function cerrarModalUsuarios() {
    const modal = document.getElementById("modal-administrar-usuarios");
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("users-modal-open");
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
    botonEliminar.className = "button button--user-delete";
    botonEliminar.textContent = "Eliminar";
    botonEliminar.addEventListener("click", () => eliminarUsuarios([Number(usuario.id)]));
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
        boton.textContent = seleccionados.length
            ? `Eliminar seleccionados (${seleccionados.length})`
            : "Eliminar seleccionados";
    }

    if (seleccionarTodos) {
        seleccionarTodos.checked = total > 0 && seleccionados.length === total;
        seleccionarTodos.indeterminate = seleccionados.length > 0 && seleccionados.length < total;
    }
}

async function eliminarUsuariosSeleccionados() {
    const ids = obtenerUsuariosSeleccionados();
    if (!ids.length) return;
    await eliminarUsuarios(ids);
}

async function eliminarUsuarios(ids) {
    const mensaje = ids.length === 1
        ? "¿Seguro que deseas eliminar este usuario?\n\nTambién se cerrarán sus sesiones activas. Esta acción no se puede deshacer."
        : `¿Seguro que deseas eliminar ${ids.length} usuarios?\n\nTambién se cerrarán sus sesiones activas. Esta acción no se puede deshacer.`;

    if (!window.confirm(mensaje)) return;

    const boton = document.getElementById("boton-eliminar-usuarios");
    if (boton) boton.disabled = true;

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
        actualizarSeleccionUsuarios();
    }
}

document.addEventListener("DOMContentLoaded", inicializarAdministracionUsuarios);
