"use strict";

/*
 * Login administrativo en dos pasos:
 * 1) correo/teléfono
 * 2) PIN de 4 dígitos
 *
 * Se inicializa después de que el DOM esté disponible para que funcione
 * correctamente también en navegadores móviles y con caché agresiva.
 */

(function inicializarLoginAdmin() {
    function init() {
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

        if (!form || !identifierStep || !pinStep || !identifierInput || !pinInput) {
            console.error("Login administrativo: faltan elementos del formulario.");
            return;
        }

        let identifier = "";

        function mostrarMensaje(texto) {
            if (!message) return;
            message.hidden = !texto;
            message.textContent = texto || "";
        }

        function setBusy(button, busy, text) {
            if (!button) return;
            button.disabled = busy;
            if (busy) {
                button.dataset.originalText = button.textContent;
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
            window.setTimeout(() => pinInput.focus(), 50);
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
                    throw new Error(
                        `El servidor respondió con un formato inesperado (HTTP ${response.status}).`
                    );
                }

                if (!response.ok || !data.success) {
                    throw new Error(
                        data.error || `No se pudo comprobar la cuenta (HTTP ${response.status}).`
                    );
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
            if (event) event.preventDefault();

            identifier = String(identifierInput.value || "").trim();
            if (!identifier) {
                mostrarMensaje("Introduce tu correo electrónico o teléfono.");
                identifierInput.focus();
                return;
            }

            setBusy(continueButton, true, "Comprobando...");
            mostrarMensaje("");

            try {
                const data = await fetchLogin({
                    identifier,
                    adminOnly: true
                });

                if (!data.user) {
                    throw new Error("No se recibió la información de la cuenta.");
                }

                mostrarPasoPin(data.user);
            } catch (error) {
                console.error("Error en primer paso del login administrativo:", error);
                mostrarMensaje(error?.message || "No se pudo comprobar la cuenta.");
            } finally {
                setBusy(continueButton, false);
            }
        }

        async function completarLogin(event) {
            if (event) event.preventDefault();

            const pin = String(pinInput.value || "").trim();
            if (!/^\d{4}$/.test(pin)) {
                mostrarMensaje("Introduce el PIN de 4 dígitos de tu cuenta.");
                pinInput.focus();
                return;
            }

            setBusy(submitPinButton, true, "Entrando...");
            mostrarMensaje("");

            try {
                const data = await fetchLogin({
                    identifier,
                    pin,
                    adminOnly: true
                });

                if (String(data.user?.role || "user").toLowerCase() !== "admin") {
                    throw new Error("La cuenta no tiene permisos de administrador.");
                }

                window.location.replace("/admin/?login=20260819");
            } catch (error) {
                console.error("Error en segundo paso del login administrativo:", error);
                mostrarMensaje(error?.message || "No se pudo iniciar sesión.");
            } finally {
                setBusy(submitPinButton, false);
            }
        }

        form.addEventListener("submit", event => {
            event.preventDefault();
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

        // Evita el envío nativo del formulario en móviles si se pulsa Enter.
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
