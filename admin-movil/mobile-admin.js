"use strict";

/*
 * Administrador exclusivo para la vista móvil.
 * No depende de /admin/admin.js ni modifica el panel de escritorio.
 */
(function () {
    const API_DRAMAS = "/api/admin/dramas";
    const API_PUBLICAR = "/api/admin/publish";
    const API_LOGOUT = "/api/auth/logout";

    let dramas = [];
    let busqueda = "";

    const $ = id => document.getElementById(id);

    function mostrarError(mensaje) {
        const estado = $("estado-carga");
        const vacio = $("estado-vacio");
        const tabla = $("contenedor-tabla");
        const busquedaEl = $("contenedor-busqueda");

        if (estado) {
            estado.hidden = false;
            estado.className = "loading-state mobile-list-error";
            estado.textContent = mensaje;
        }
        if (vacio) vacio.hidden = true;
        if (tabla) tabla.hidden = true;
        if (busquedaEl) busquedaEl.hidden = true;
    }

    function normalizar(valor) {
        return String(valor ?? "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();
    }

    function obtenerCategoria(drama) {
        if (Array.isArray(drama?.categories) && drama.categories.length) {
            return String(drama.categories[0]).trim().toUpperCase();
        }
        return "Sin categoría";
    }

    function formatearFecha(valor) {
        if (!valor) return "—";
        const fecha = new Date(String(valor).replace(" ", "T") + (String(valor).includes("Z") ? "" : "Z"));
        if (Number.isNaN(fecha.getTime())) return String(valor);
        return new Intl.DateTimeFormat("es-PA", {
            dateStyle: "short",
            timeStyle: "short"
        }).format(fecha);
    }

    function crearCelda(texto, clase = "") {
        const td = document.createElement("td");
        td.textContent = texto;
        if (clase) td.className = clase;
        return td;
    }

    function crearFila(drama) {
        const fila = document.createElement("tr");

        fila.appendChild(crearCelda(drama.id ?? "—"));

        const celdaDrama = document.createElement("td");
        const info = document.createElement("div");
        info.className = "drama-info";

        const portada = document.createElement("img");
        portada.className = "drama-cover";
        portada.src = drama.cover_url || "/portadas/generica/portada-generica.png";
        portada.alt = "";
        portada.loading = "lazy";
        portada.onerror = () => { portada.hidden = true; };

        const textos = document.createElement("div");
        const titulo = document.createElement("p");
        titulo.className = "drama-title";
        titulo.textContent = drama.title || "Sin título";
        const slug = document.createElement("p");
        slug.className = "drama-slug";
        slug.textContent = drama.slug || "";
        textos.append(titulo, slug);
        info.append(portada, textos);
        celdaDrama.appendChild(info);
        fila.appendChild(celdaDrama);

        fila.appendChild(crearCelda(drama.platform || "—"));
        fila.appendChild(crearCelda(obtenerCategoria(drama)));
        fila.appendChild(crearCelda(String(drama.video_url || "").trim() ? "No" : "Sí", "mega-status-cell"));

        const celdaEstado = document.createElement("td");
        const estado = String(drama.status || "draft").toLowerCase();
        const badge = document.createElement("span");
        badge.className = `status-badge ${estado === "published" ? "status-badge--published" : "status-badge--draft"}`;
        badge.textContent = estado === "published" ? "Publicado" : "Borrador";
        celdaEstado.appendChild(badge);
        fila.appendChild(celdaEstado);

        fila.appendChild(crearCelda(drama.featured === true || drama.featured === 1 || drama.featured === "1" ? "Sí" : "No"));
        fila.appendChild(crearCelda(drama.sort_order ?? "—"));
        fila.appendChild(crearCelda(formatearFecha(drama.updated_at)));

        const acciones = document.createElement("td");
        acciones.className = "mobile-row-actions";
        const boton = document.createElement("button");
        boton.type = "button";
        boton.className = "button button--edit mobile-publish-button";

        if (estado === "published") {
            boton.textContent = "Publicado";
            boton.disabled = true;
            boton.classList.add("mobile-publish-button--done");
        } else {
            boton.textContent = "Publicar";
            boton.addEventListener("click", () => publicarDrama(drama.id, boton));
        }

        acciones.appendChild(boton);
        fila.appendChild(acciones);
        return fila;
    }

    function renderizar() {
        const lista = $("lista-dramas");
        const tabla = $("contenedor-tabla");
        const vacio = $("estado-vacio");
        const carga = $("estado-carga");
        const contenedorBusqueda = $("contenedor-busqueda");
        const resultado = $("resultado-busqueda");

        if (!lista || !tabla || !vacio || !carga || !contenedorBusqueda) return;

        const termino = normalizar(busqueda);
        const filtrados = termino
            ? dramas.filter(drama => [
                drama.id,
                drama.title,
                drama.slug,
                drama.platform,
                obtenerCategoria(drama),
                drama.status === "published" ? "publicado" : "borrador",
                drama.video_url ? "no" : "si"
            ].some(valor => normalizar(valor).includes(termino)))
            : dramas;

        carga.hidden = true;
        contenedorBusqueda.hidden = dramas.length === 0;
        resultado.textContent = termino
            ? `Mostrando ${filtrados.length} de ${dramas.length} microdramas.`
            : `${dramas.length} microdramas`;

        lista.replaceChildren();

        if (!filtrados.length) {
            tabla.hidden = true;
            vacio.hidden = false;
            vacio.textContent = termino
                ? "No se encontraron microdramas que coincidan con la búsqueda."
                : "No hay microdramas registrados.";
            return;
        }

        vacio.hidden = true;
        tabla.hidden = false;
        const fragmento = document.createDocumentFragment();
        filtrados.forEach(drama => fragmento.appendChild(crearFila(drama)));
        lista.appendChild(fragmento);
    }

    async function cargarDramas() {
        const carga = $("estado-carga");
        if (carga) {
            carga.hidden = false;
            carga.className = "loading-state";
            carga.textContent = "Cargando microdramas...";
        }

        try {
            const respuesta = await fetch(API_DRAMAS, {
                method: "GET",
                credentials: "same-origin",
                headers: { Accept: "application/json" },
                cache: "no-store"
            });

            const datos = await respuesta.json().catch(() => ({}));

            if (!respuesta.ok || !datos.success || !Array.isArray(datos.dramas)) {
                throw new Error(datos.error || `La API respondió con el estado ${respuesta.status}.`);
            }

            dramas = datos.dramas;
            renderizar();
        } catch (error) {
            console.error("Error al cargar microdramas móviles:", error);
            mostrarError(`No se pudieron cargar los microdramas. ${error.message || "Verifica tu sesión administrativa."}`);
        }
    }

    async function publicarDrama(id, boton) {
        if (!Number.isInteger(Number(id)) || boton.disabled) return;
        if (!window.confirm("¿Publicar este microdrama ahora?")) return;

        boton.disabled = true;
        boton.textContent = "Publicando...";

        try {
            const respuesta = await fetch(API_PUBLICAR, {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json"
                },
                body: JSON.stringify({ id: Number(id) })
            });

            const datos = await respuesta.json().catch(() => ({}));
            if (!respuesta.ok || !datos.success) {
                throw new Error(datos.error || `La API respondió con el estado ${respuesta.status}.`);
            }

            const drama = dramas.find(item => Number(item.id) === Number(id));
            if (drama) {
                drama.status = "published";
                drama.published_at = new Date().toISOString();
                drama.updated_at = new Date().toISOString();
            }
            renderizar();
        } catch (error) {
            console.error("Error al publicar microdrama móvil:", error);
            boton.disabled = false;
            boton.textContent = "Publicar";
            window.alert(error.message || "No se pudo publicar el microdrama.");
        }
    }

    async function cerrarSesion() {
        const boton = $("boton-salir-admin");
        if (!boton || boton.disabled) return;
        if (!window.confirm("¿Deseas cerrar la sesión administrativa?")) return;

        boton.disabled = true;
        boton.textContent = "Saliendo...";
        try {
            const respuesta = await fetch(API_LOGOUT, {
                method: "POST",
                credentials: "same-origin",
                headers: { Accept: "application/json" },
                cache: "no-store"
            });
            const datos = await respuesta.json().catch(() => ({}));
            if (!respuesta.ok || !datos.success) {
                throw new Error(datos.error || "No se pudo cerrar la sesión.");
            }
            window.location.replace("/admin-login.html");
        } catch (error) {
            boton.disabled = false;
            boton.textContent = "Salir";
            window.alert(error.message || "No se pudo cerrar la sesión.");
        }
    }

    function iniciar() {
        const buscador = $("buscador-dramas");
        const limpiar = $("boton-limpiar-busqueda");
        const salir = $("boton-salir-admin");

        if (buscador) {
            buscador.addEventListener("input", () => {
                busqueda = buscador.value;
                if (limpiar) limpiar.hidden = !busqueda;
                renderizar();
            });
        }

        if (limpiar) {
            limpiar.addEventListener("click", () => {
                if (buscador) buscador.value = "";
                busqueda = "";
                limpiar.hidden = true;
                if (buscador) buscador.focus();
                renderizar();
            });
        }

        if (salir) salir.addEventListener("click", cerrarSesion);
        cargarDramas();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", iniciar, { once: true });
    } else {
        iniciar();
    }
})();
