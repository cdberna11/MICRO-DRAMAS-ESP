"use strict";

/*
 * Login administrativo en dos pasos:
 * 1) correo/teléfono
 * 2) PIN de 4 dígitos
 *
 * Este archivo vive en la raíz del sitio para quedar fuera de cualquier
 * protección de Cloudflare Access aplicada a /admin/*.
 */

(function inicializarLoginAdmin() {
    function init() {
        if (window.__microDramasAdminLoginInitialized) return;
        window.__microDramasAdminLoginInitialized = true;

        const form = document.getElementById("admin-login-form");
        const identifierStep = document.getElementById("admin-step-identifier");
        const pinStep = document.getElementById("admin-step-pin");
        const identifierInput = document.getElementById("admin-identifier");
        const pinInput = document.getElementById("admin-pin");
        const userBox = document.getElementById("admin-login-user");
        const message = document.getElementById("admin-login-message");
        const continueButton = document.getElementById("admin-continue");
        const submitPinButton = document.getElementById("admin-submit-pin");
        const backButton = document.getElementById("admin-back");

        if (!form || !identifierStep || !pinStep || !identifierInput || !pinInput || !continueButton) {
            console.error("Login administrativo: faltan elementos del formulario.");
            return;
        }

        let identifier = "";
        let solicitudEnCurso = false;

        function mostrarMensaje(texto) {
            if (!message) return;
            message.hidden = !texto;
            message.textContent = texto || "";
        }

        function setBusy(button, busy, text) {
            if (!button) return;
            button.disabled = busy;
            if (busy) {
                if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
                button.textContent = text;
            } else if (button.dataset.originalText) {
                button.textContent = button.dataset.originalText;
            }
        }

        function mostrarPasoPin(user) {
            identifierStep.hidden = true;
            pinStep.hidden = false;

            if (userBox) {
                userBox.textContent = user?.displayName
                    ? `${user.displayName} · ${user.email || user.phone || identifier}`
                    : identifier;
            }

            pinInput.value = "";
            mostrarMensaje("");

            window.setTimeout(() => pinInput.focus(), 100);
        }

        function volverIdentificador() {
            pinStep.hidden = true;
            identifierStep.hidden = false;
            pinInput.value = "";
            mostrarMensaje("");
            window.setTimeout(() => identifierInput.focus(), 50);
        }

        async function fetchLogin(payload) {
            const controller = new AbortController();
            const timeout = window.setTimeout(() => controller.abort(), 15000);

            try {
                const response = await fetch("/api/auth/login", {
                    method: "POST",
                    credentials: "same-origin",
                    cache: "no-store",
                    redirect: "follow",
                    signal: controller.signal,
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                        "Cache-Control": "no-cache"
                    },
                    body: JSON.stringify(payload)
                });

                const raw = await response.text();
                let data = {};

                try {
                    data = raw ? JSON.parse(raw) : {};
                } catch {
                    throw new Error(`El servidor respondió con un formato inesperado (HTTP ${response.status}).`);
                }

                if (!response.ok || !data.success) {
                    throw new Error(data.error || `No se pudo comprobar la cuenta (HTTP ${response.status}).`);
                }

                return data;
            } catch (error) {
                if (error?.name === "AbortError") {
                    throw new Error("La solicitud tardó demasiado. Comprueba tu conexión e inténtalo nuevamente.");
                }
                throw error;
            } finally {
                window.clearTimeout(timeout);
            }
        }

        async function iniciarPasoIdentificador(event) {
            event?.preventDefault();
            event?.stopPropagation();

            if (solicitudEnCurso) return;

            identifier = String(identifierInput.value || "").trim();

            if (!identifier) {
                mostrarMensaje("Introduce tu correo electrónico o teléfono.");
                identifierInput.focus();
                return;
            }

            solicitudEnCurso = true;
            setBusy(continueButton, true, "Comprobando...");
            mostrarMensaje("Comprobando la cuenta...");

            try {
                const data = await fetchLogin({
                    identifier,
                    adminOnly: true
                });

                if (!data.user) {
                    throw new Error("No se recibió la información de la cuenta.");
                }

                if (data.requiresPin !== true) {
                    throw new Error("La cuenta no está disponible para validación con PIN.");
                }

                mostrarPasoPin(data.user);
            } catch (error) {
                console.error("Error en primer paso del login administrativo:", error);
                mostrarMensaje(error?.message || "No se pudo comprobar la cuenta.");
            } finally {
                solicitudEnCurso = false;
                setBusy(continueButton, false);
            }
        }

        function esDispositivoMovil() {
            return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
                || Boolean(window.matchMedia && window.matchMedia("(max-width: 760px)").matches);
        }

        async function completarLogin(event) {
            event?.preventDefault();
            event?.stopPropagation();

            if (solicitudEnCurso) return;

            const pin = String(pinInput.value || "").trim();
            if (!/^\d{4}$/.test(pin)) {
                mostrarMensaje("Introduce el PIN de 4 dígitos de tu cuenta.");
                pinInput.focus();
                return;
            }

            solicitudEnCurso = true;
            setBusy(submitPinButton, true, "Entrando...");
            mostrarMensaje("Validando PIN...");

            try {
                const data = await fetchLogin({
                    identifier,
                    pin,
                    adminOnly: true
                });

                if (String(data.user?.role || "user").toLowerCase() !== "admin") {
                    throw new Error("La cuenta no tiene permisos de administrador.");
                }

                const destino = esDispositivoMovil()
                    ? "/admin-movil/?login=20260825"
                    : "/admin/?login=20260825";

                window.location.replace(destino);
            } catch (error) {
                console.error("Error en segundo paso del login administrativo:", error);
                mostrarMensaje(error?.message || "No se pudo iniciar sesión.");
            } finally {
                solicitudEnCurso = false;
                setBusy(submitPinButton, false);
            }
        }

        form.addEventListener("submit", event => {
            if (pinStep.hidden) {
                iniciarPasoIdentificador(event);
            } else {
                completarLogin(event);
            }
        });

        backButton?.addEventListener("click", event => {
            event.preventDefault();
            volverIdentificador();
        });

        pinInput.addEventListener("input", () => {
            pinInput.value = pinInput.value.replace(/\D/g, "").slice(0, 4);
        });

        identifierInput.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                event.preventDefault();
                iniciarPasoIdentificador(event);
            }
        });

        pinInput.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                event.preventDefault();
                completarLogin(event);
            }
        });

        identifierInput.focus();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();
