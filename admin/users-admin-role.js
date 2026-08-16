"use strict";

(function () {
    const API = "/api/admin/users";
    const usersById = new Map();
    let tbody = null;

    function ensureHeader() {
        const header = document.querySelector("#modal-administrar-usuarios .users-table thead tr");
        if (!header || header.querySelector(".usuario-role-header")) return;
        const headers = Array.from(header.children);
        const reference = headers.find(cell => cell.textContent.trim() === "Registro");
        const th = document.createElement("th");
        th.className = "usuario-role-header";
        th.scope = "col";
        th.textContent = "Rol";
        if (reference) header.insertBefore(th, reference);
        else header.appendChild(th);
    }

    function enhanceRows() {
        ensureHeader();
        if (!tbody) tbody = document.getElementById("lista-usuarios");
        if (!tbody) return;

        tbody.querySelectorAll("tr").forEach(row => {
            if (row.querySelector(".usuario-role-cell")) return;
            const idCell = row.children[1];
            const id = Number(idCell?.textContent || 0);
            const user = usersById.get(id);
            if (!user) return;

            const role = String(user.role || "user").toLowerCase() === "admin" ? "admin" : "user";
            const cell = document.createElement("td");
            cell.className = "usuario-role-cell";

            const label = document.createElement("label");
            label.className = "usuario-admin-toggle";
            label.title = role === "admin" ? "Quitar permisos de administrador" : "Conceder permisos de administrador";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.className = "usuario-admin-checkbox";
            checkbox.checked = role === "admin";
            checkbox.setAttribute("aria-label", `Administrador: ${user.display_name || user.email || id}`);

            const text = document.createElement("span");
            text.className = "usuario-admin-label";
            text.textContent = role === "admin" ? "Administrador" : "Usuario";

            checkbox.addEventListener("change", () => actualizarRol(user, checkbox, text, label));
            label.append(checkbox, text);
            cell.appendChild(label);

            const reference = row.children[7];
            if (reference) row.insertBefore(cell, reference);
            else row.appendChild(cell);
        });
    }

    async function actualizarRol(user, checkbox, text, label) {
        const nuevoRol = checkbox.checked ? "admin" : "user";
        const anterior = nuevoRol === "admin" ? "user" : "admin";
        checkbox.disabled = true;

        try {
            const response = await fetch(API, {
                method: "PATCH",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify({ id: Number(user.id), role: nuevoRol })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success) throw new Error(data.error || "No se pudo actualizar el rol.");

            user.role = nuevoRol;
            usersById.set(Number(user.id), user);
            text.textContent = nuevoRol === "admin" ? "Administrador" : "Usuario";
            label.title = nuevoRol === "admin" ? "Quitar permisos de administrador" : "Conceder permisos de administrador";
            mostrarMensajeRol(data.message || "Rol actualizado correctamente.", false);
        } catch (error) {
            checkbox.checked = anterior === "admin";
            text.textContent = anterior === "admin" ? "Administrador" : "Usuario";
            mostrarMensajeRol(error.message || "No se pudo actualizar el rol.", true);
        } finally {
            checkbox.disabled = false;
        }
    }

    function mostrarMensajeRol(texto, error) {
        const estado = document.getElementById("estado-carga-usuarios");
        if (!estado) return;
        estado.hidden = false;
        estado.className = error ? "users-status users-status--error" : "users-status users-status--success";
        estado.textContent = texto;
        clearTimeout(window.__adminRoleMessageTimer);
        window.__adminRoleMessageTimer = setTimeout(() => { estado.hidden = true; }, 3500);
    }

    const originalFetch = window.fetch.bind(window);
    window.fetch = async function (...args) {
        const response = await originalFetch(...args);
        try {
            const request = args[0];
            const url = typeof request === "string" ? request : request?.url || "";
            const method = (args[1]?.method || request?.method || "GET").toUpperCase();
            if (method === "GET" && new URL(url, location.origin).pathname === API) {
                response.clone().json().then(data => {
                    if (data?.success && Array.isArray(data.users)) {
                        usersById.clear();
                        data.users.forEach(user => usersById.set(Number(user.id), user));
                        requestAnimationFrame(enhanceRows);
                    }
                }).catch(() => {});
            }
        } catch {}
        return response;
    };

    const start = () => {
        tbody = document.getElementById("lista-usuarios");
        ensureHeader();
        if (!tbody) return;
        const observer = new MutationObserver(() => enhanceRows());
        observer.observe(tbody, { childList: true });
        enhanceRows();
    };

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
})();
