/* =========================================================
   MICRO-DRAMAS-ESP — NAVEGACIÓN MÓVIL
   Home / Categorías / Avatar
   Solo activa en pantallas de hasta 600px.
========================================================= */

(function instalarNavegacionMovil() {

    "use strict";

    if (window.__microDramasMobileNavInstalled) {
        return;
    }

    window.__microDramasMobileNavInstalled = true;

    const SVG_HOME = `
        <svg class="mobile-bottom-nav__icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3.2 3.5 10v10.2c0 .5.4.8.9.8h5.1v-6.3h5v6.3h5.1c.5 0 .9-.3.9-.8V10L12 3.2z"/>
        </svg>
    `;

    const SVG_MENU = `
        <svg class="mobile-bottom-nav__icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 6.5c0-.6.4-1 1-1h16c.6 0 1 .4 1 1s-.4 1-1 1H4c-.6 0-1-.4-1-1zm0 5.5c0-.6.4-1 1-1h16c.6 0 1 .4 1 1s-.4 1-1 1H4c-.6 0-1-.4-1-1zm0 5.5c0-.6.4-1 1-1h16c.6 0 1 .4 1 1s-.4 1-1 1H4c-.6 0-1-.4-1-1z"/>
        </svg>
    `;

    function esMovil() {
        return window.matchMedia(
            "(max-width: 600px)"
        ).matches;
    }

    function cerrarMenuCategoriasSeguro() {
        const boton = document.querySelector(
            ".menu-categorias-portal__close"
        );

        const menu = document.getElementById(
            "menu-categorias-portal"
        );

        if (menu && menu.classList.contains("is-open")) {
            if (boton) {
                boton.click();
            } else {
                menu.classList.remove("is-open");
                menu.setAttribute("aria-hidden", "true");
            }
        }
    }

    function mostrarTodosLosDramas() {
        const botonTodos = document.querySelector(
            '.menu-categoria-item[data-category-slug="todos"]'
        );

        if (botonTodos) {
            botonTodos.click();
            return;
        }

        const botonCategorias = document.getElementById(
            "boton-menu-categorias"
        );

        if (!botonCategorias) {
            return;
        }

        botonCategorias.click();

        setTimeout(() => {
            const todos = document.querySelector(
                '.menu-categoria-item[data-category-slug="todos"]'
            );

            if (todos) {
                todos.click();
            }
        }, 80);
    }

    function abrirCategorias() {
        cerrarMenuUsuario();

        const botonCategorias = document.getElementById(
            "boton-menu-categorias"
        );

        if (botonCategorias) {
            botonCategorias.click();
        }
    }

    function cerrarMenuUsuario() {
        const menu = document.querySelector(
            ".mobile-bottom-nav__user-menu"
        );

        if (menu) {
            menu.hidden = true;
        }
    }

    function crearBarra() {
        if (!esMovil()) {
            return;
        }

        if (document.querySelector(".mobile-bottom-nav")) {
            return;
        }

        const barra = document.createElement("nav");
        barra.className = "mobile-bottom-nav";
        barra.setAttribute("aria-label", "Navegación móvil");

        const botonHome = document.createElement("button");
        botonHome.type = "button";
        botonHome.className = "mobile-bottom-nav__button";
        botonHome.setAttribute("aria-label", "Inicio");
        botonHome.innerHTML = `${SVG_HOME}<span class="mobile-bottom-nav__label">INICIO</span>`;

        const botonCategorias = document.createElement("button");
        botonCategorias.type = "button";
        botonCategorias.className = "mobile-bottom-nav__button";
        botonCategorias.setAttribute("aria-label", "Categorías");
        botonCategorias.innerHTML = `${SVG_MENU}<span class="mobile-bottom-nav__label">CATEGORÍAS</span>`;

        const botonUsuario = document.createElement("button");
        botonUsuario.type = "button";
        botonUsuario.className = "mobile-bottom-nav__button";
        botonUsuario.setAttribute("aria-label", "Usuario");
        botonUsuario.innerHTML = `
            <img
                class="mobile-bottom-nav__avatar"
                src="/assets/avatar-1.png"
                alt="Usuario"
            >
            <span class="mobile-bottom-nav__label mobile-bottom-nav__username">Usuario</span>
        `;

        const menuUsuario = document.createElement("div");
        menuUsuario.className = "mobile-bottom-nav__user-menu";
        menuUsuario.hidden = true;
        menuUsuario.innerHTML = `
            <button
                type="button"
                class="mobile-bottom-nav__logout"
            >
                Cerrar sesión
            </button>
        `;

        const botonLogout = menuUsuario.querySelector(
            ".mobile-bottom-nav__logout"
        );

        botonHome.addEventListener("click", () => {
            cerrarMenuUsuario();
            cerrarMenuCategoriasSeguro();
            mostrarTodosLosDramas();
            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });
        });

        botonCategorias.addEventListener("click", () => {
            abrirCategorias();
        });

        botonUsuario.addEventListener("click", evento => {
            evento.stopPropagation();

            const abrir = menuUsuario.hidden;

            cerrarMenuCategoriasSeguro();
            menuUsuario.hidden = !abrir;
        });

        menuUsuario.addEventListener("click", evento => {
            evento.stopPropagation();
        });

        botonLogout.addEventListener("click", () => {
            window.location.href = "/api/session/logout";
        });

        document.addEventListener("click", () => {
            cerrarMenuUsuario();
        });

        barra.appendChild(botonHome);
        barra.appendChild(botonCategorias);
        barra.appendChild(botonUsuario);

        document.body.appendChild(barra);
        document.body.appendChild(menuUsuario);

        cargarAvatarUsuario(botonUsuario);
    }

    async function cargarAvatarUsuario(botonUsuario) {
        try {
            const response = await fetch(
                "/api/auth/me",
                {
                    method: "GET",
                    credentials: "same-origin",
                    cache: "no-store",
                    headers: {
                        "Accept": "application/json"
                    }
                }
            );

            const data = await response.json().catch(
                () => ({})
            );

            if (
                !response.ok ||
                !data.authenticated ||
                !data.user
            ) {
                return;
            }

            const avatar = botonUsuario.querySelector(
                ".mobile-bottom-nav__avatar"
            );

            const username = botonUsuario.querySelector(
                ".mobile-bottom-nav__username"
            );

            const displayName =
                String(
                    data.user.displayName ||
                    data.user.name ||
                    "Usuario"
                ).trim() || "Usuario";

            if (avatar) {
                avatar.src =
                    `/assets/${encodeURIComponent(
                        data.user.avatar || "avatar-1.png"
                    )}`;

                avatar.alt =
                    `Avatar de ${displayName}`;
            }

            if (username) {
                username.textContent = displayName;
                username.title = displayName;
            }

        } catch (error) {
            console.warn(
                "[NAVEGACIÓN MÓVIL] No se pudo cargar el usuario:",
                error
            );
        }
    }

    function controlarResponsive() {
        const barra = document.querySelector(
            ".mobile-bottom-nav"
        );

        if (!barra) {
            return;
        }

        barra.style.display = esMovil()
            ? "flex"
            : "none";
    }

    function iniciar() {
        crearBarra();
        controlarResponsive();

        window.addEventListener(
            "resize",
            controlarResponsive,
            { passive: true }
        );
    }

    if (
        document.readyState === "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            iniciar,
            { once: true }
        );
    } else {
        iniciar();
    }

})();
