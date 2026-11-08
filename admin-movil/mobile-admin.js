"use strict";

/*
 * Administrador exclusivo para la vista móvil.
 * No depende de /admin/admin.js ni modifica el panel de escritorio.
 */
(function () {
    const API_DRAMAS = "/api/admin-movil/dramas";
    const API_PUBLICAR = "/api/admin-movil/publish";
    const API_BORRADOR = "/api/admin-movil/draft";
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
            .replace(/[^a-z0-9]+/g, " ")
            .replace(/\s+/g, " ")
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
        const texto = String(valor);
        const fecha = new Date(texto.includes("T") ? texto : texto.replace(" ", "T") + (texto.includes("Z") ? "" : "Z"));
        if (Number.isNaN(fecha.getTime())) return texto;
        return new Intl.DateTimeFormat("es-PA", {
            dateStyle: "short",
            timeStyle: "short"
        }).format(fecha);
    }

    function crearFila(drama) {
        const fila = document.createElement("article");
        fila.className = "mobile-drama-card";
        const cabecera = document.createElement("div");
        cabecera.className = "mobile-drama-card__header";
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

        const estado = String(drama.status || "draft").toLowerCase();
        const badge = document.createElement("span");
        badge.className = `status-badge ${estado === "published" ? "status-badge--published" : "status-badge--draft"}`;
        badge.textContent = estado === "published" ? "Publicado" : "Borrador";
        cabecera.append(info, badge);

        const detalle = document.createElement("div");
        detalle.className = "mobile-drama-card__detail";
        const etiqueta = document.createElement("span");
        etiqueta.textContent = "Enlace MEGA";
        const mega = document.createElement("strong");
        const tieneMega = String(drama.video_url || "").trim() !== "";
        mega.className = tieneMega ? "mega-status-cell--available" : "mega-status-cell--missing";
        mega.textContent = tieneMega ? "Disponible" : "Sin enlace";
        detalle.append(etiqueta, mega);

        const acciones = document.createElement("div");
        acciones.className = "mobile-drama-card__actions";
        const publicar = document.createElement("button");
        publicar.type = "button";
        publicar.className = "mobile-action mobile-action--publish";
        publicar.textContent = estado === "published" ? "Publicado" : "Publicar";
        publicar.disabled = estado === "published";
        publicar.addEventListener("click", () => cambiarEstado(drama.id, "published", publicar));

        const borrador = document.createElement("button");
        borrador.type = "button";
        borrador.className = "mobile-action mobile-action--draft";
        borrador.textContent = "Borrador";
        borrador.disabled = estado !== "published";
        borrador.addEventListener("click", () => cambiarEstado(drama.id, "draft", borrador));
        acciones.append(publicar, borrador);
        fila.append(cabecera, detalle, acciones);
        return fila;
    }

    function renderizar() {
        const lista = $("lista-dramas");
        const tabla = $("contenedor-tabla");
        const vacio = $("estado-vacio");
        const carga = $("estado-carga");
        const contenedorBusqueda = $("contenedor-busqueda");
        const resultado = $("resultado-busqueda");

        if (!lista || !tabla || !vacio || !carga || !contenedorBusqueda || !resultado) return;

        const terminos =
            normalizar(
                busqueda
            )
                .split(" ")
                .filter(Boolean);

        const filtrados =
            terminos.length
                ? dramas.filter(
                    drama => {
                        const estado =
                            String(
                                drama.status ||
                                "draft"
                            ).toLowerCase();

                        const publicado =
                            estado ===
                            "published";

                        const destacado =
                            drama.featured === true ||
                            drama.featured === 1 ||
                            drama.featured === "1";

                        const tieneMega =
                            String(
                                drama.video_url || ""
                            ).trim() !== "";

                        const documentoBusqueda =
                            normalizar(
                                [
                                    "id",
                                    drama.id,
                                    drama.title,
                                    drama.slug,
                                    drama.platform,
                                    obtenerCategoria(
                                        drama
                                    ),
                                    drama.video_description,
                                    publicado
                                        ? "publicado published"
                                        : "borrador draft",
                                    destacado
                                        ? "destacado si"
                                        : "no destacado",
                                    tieneMega
                                        ? "mega enlace disponible"
                                        : "mega sin enlace faltante",
                                    drama.sort_order,
                                    formatearFecha(
                                        drama.updated_at
                                    )
                                ].join(" ")
                            );

                        const palabras =
                            documentoBusqueda
                                .split(" ")
                                .filter(Boolean);

                        return terminos.every(
                            termino =>
                                termino.length <= 2
                                    ? palabras.includes(
                                        termino
                                    )
                                    : palabras.some(
                                        palabra =>
                                            palabra.includes(
                                                termino
                                            )
                                    )
                        );
                    }
                )
                : dramas;

        carga.hidden = true;
        contenedorBusqueda.hidden = false;
        resultado.textContent =
            terminos.length
                ? `Mostrando ${filtrados.length} de ${dramas.length} microdrama${dramas.length === 1 ? "" : "s"}.`
                : `Mostrando los ${dramas.length} microdramas.`;

        lista.replaceChildren();

        if (!filtrados.length) {
            tabla.hidden = true;
            vacio.hidden = false;
            vacio.textContent = terminos.length
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

    async function cambiarEstado(id, nuevoEstado, boton) {
        if (!Number.isInteger(Number(id)) || boton.disabled) return;
        const publicar = nuevoEstado === "published";
        const pregunta = publicar
            ? "¿Publicar este microdrama ahora?"
            : "¿Volver este microdrama a borrador? Dejará de aparecer en el catálogo.";
        if (!window.confirm(pregunta)) return;

        boton.disabled = true;
        boton.textContent = publicar ? "Publicando..." : "Guardando...";

        try {
            const respuesta = await fetch(publicar ? API_PUBLICAR : API_BORRADOR, {
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
                drama.status = nuevoEstado;
                drama.published_at = publicar ? new Date().toISOString() : null;
                drama.updated_at = new Date().toISOString();
            }
            renderizar();
        } catch (error) {
            console.error("Error al cambiar estado móvil:", error);
            boton.disabled = false;
            boton.textContent = publicar ? "Publicar" : "Borrador";
            window.alert(error.message || "No se pudo cambiar el estado del microdrama.");
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

            if (!respuesta.ok && datos.success !== false) {
                throw new Error(datos.error || "No se pudo cerrar la sesión.");
            }

            window.location.replace("/admin-login.html?logout=20260825-mobile");
        } catch (error) {
            console.error("Error al cerrar sesión móvil:", error);
            boton.disabled = false;
            boton.textContent = "Salir";
            window.alert(error.message || "No se pudo cerrar la sesión. Inténtalo nuevamente.");
        }
    }

    function iniciar() {
        const buscador = $("buscador-dramas");
        const limpiar = $("boton-limpiar-busqueda");
        const salir = $("boton-salir-admin");
        const envoltura =
            buscador?.closest(
                ".admin-search__input-wrapper"
            );

        const actualizarEstadoVisual =
            () => {
                const activa =
                    busqueda.trim() !== "";

                if (limpiar) {
                    limpiar.hidden =
                        !activa;
                }

                if (envoltura) {
                    envoltura.classList.toggle(
                        "has-query",
                        activa
                    );
                }
            };

        if (buscador) {
            buscador.addEventListener("input", () => {
                busqueda = buscador.value;
                actualizarEstadoVisual();
                renderizar();
            });

            buscador.addEventListener("keydown", evento => {
                if (
                    evento.key === "Escape" &&
                    busqueda
                ) {
                    evento.preventDefault();
                    buscador.value = "";
                    busqueda = "";
                    actualizarEstadoVisual();
                    renderizar();
                }
            });
        }

        if (limpiar) {
            limpiar.addEventListener("click", evento => {
                evento.stopPropagation();
                if (buscador) buscador.value = "";
                busqueda = "";
                actualizarEstadoVisual();
                if (buscador) buscador.focus();
                renderizar();
            });
        }

        if (envoltura) {
            envoltura.addEventListener("click", evento => {
                if (
                    evento.target !==
                    limpiar
                ) {
                    buscador.focus();
                }
            });
        }

        actualizarEstadoVisual();

        if (salir) salir.addEventListener("click", cerrarSesion);
        cargarDramas();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", iniciar, { once: true });
    } else {
        iniciar();
    }
})();
