"use strict";

/*
 * Login administrativo en dos pasos:
 * 1) correo/teléfono
 * 2) PIN de 4 dígitos
 *
 * El flujo de autenticación es compartido.
 * La animación visual del PIN se activa únicamente en dispositivos móviles.
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
        const esMovil = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
            || Boolean(window.matchMedia && window.matchMedia("(max-width: 760px)").matches);

        const mobilePin = {
            container: document.getElementById("admin-mobile-pin"),
            status: document.getElementById("admin-mobile-pin-status"),
            cards: Array.from(document.querySelectorAll(".admin-mobile-pin-card")),
            dots: Array.from(document.querySelectorAll("#admin-mobile-pin-dots span")),
            inputs: Array.from(document.querySelectorAll("[data-pin-mobile]")),
            enabled: false
        };

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

        function actualizarPinMovil() {
            if (!mobilePin.enabled) return;
            const value = String(pinInput.value || "").replace(/\D/g, "").slice(0, 4);
            pinInput.value = value;

            mobilePin.cards.forEach((card, index) => {
                card.classList.toggle("is-filled", index < value.length);
                card.classList.toggle("is-current", index === value.length && value.length < 4);
                card.classList.remove("is-complete");
            });
            mobilePin.dots.forEach((dot, index) => {
                dot.classList.toggle("is-filled", index < value.length);
                dot.classList.remove("is-success");
            });

            mobilePin.container?.classList.remove("is-validating", "is-success", "complete");
            mobilePin.status?.classList.remove("is-complete", "is-validating", "is-success");

            if (value.length === 4) {
                mobilePin.cards.forEach(card => card.classList.add("is-complete"));
                mobilePin.container?.classList.add("complete");
                mobilePin.status?.classList.add("is-complete");
                if (mobilePin.status) mobilePin.status.textContent = "PIN completo";
            } else {
                if (mobilePin.status) mobilePin.status.textContent = value.length ? "Ingresa tu PIN" : "Ingresa tu PIN";
            }
        }

        function inicializarPinMovil() {
            if (!esMovil || !mobilePin.container || mobilePin.inputs.length !== 4) return;
            mobilePin.enabled = true;
            actualizarPinMovil();

            mobilePin.inputs.forEach((input, index) => {
                input.addEventListener("focus", () => {
                    if (mobilePin.enabled && index !== Math.min(pinInput.value.length, 3)) {
                        const target = mobilePin.inputs[Math.min(pinInput.value.length, 3)];
                        target?.focus();
                    }
                });

                input.addEventListener("input", () => {
                    const digits = String(input.value || "").replace(/\D/g, "");
                    if (!digits) {
                        input.value = "";
                        actualizarPinMovil();
                        return;
                    }

                    const before = String(pinInput.value || "").slice(0, index);
                    const nextValue = (before + digits.charAt(0)).slice(0, 4);
                    pinInput.value = nextValue;
                    mobilePin.inputs.forEach((item, itemIndex) => {
                        item.value = nextValue.charAt(itemIndex) || "";
                    });
                    actualizarPinMovil();

                    const nextIndex = Math.min(nextValue.length, 3);
                    if (nextValue.length < 4) mobilePin.inputs[nextIndex]?.focus();
                    else input.blur();
                });

                input.addEventListener("keydown", event => {
                    if (event.key === "Backspace" && !input.value && index > 0) {
                        const nextValue = String(pinInput.value || "").slice(0, index - 1);
                        pinInput.value = nextValue;
                        mobilePin.inputs.forEach((item, itemIndex) => {
                            item.value = nextValue.charAt(itemIndex) || "";
                        });
                        actualizarPinMovil();
                        mobilePin.inputs[index - 1]?.focus();
                        event.preventDefault();
                    }
                    if (event.key === "Enter") {
                        event.preventDefault();
                        completarLogin(event);
                    }
                });

                input.addEventListener("paste", event => {
                    event.preventDefault();
                    const pasted = String(event.clipboardData?.getData("text") || "").replace(/\D/g, "").slice(0, 4);
                    if (!pasted) return;
                    pinInput.value = pasted;
                    mobilePin.inputs.forEach((item, itemIndex) => {
                        item.value = pasted.charAt(itemIndex) || "";
                    });
                    actualizarPinMovil();
                    if (pasted.length < 4) mobilePin.inputs[pasted.length]?.focus();
                    else mobilePin.inputs[3]?.blur();
                });
            });
        }

        function prepararPinMovil() {
            if (!mobilePin.enabled) return;
            mobilePin.inputs.forEach(input => { input.value = ""; });
            pinInput.value = "";
            mobilePin.container?.classList.remove("shake", "complete", "is-validating", "is-success");
            mobilePin.status?.classList.remove("is-complete", "is-validating", "is-success");
            if (mobilePin.status) mobilePin.status.textContent = "Ingresa tu PIN";
            actualizarPinMovil();
            window.setTimeout(() => mobilePin.inputs[0]?.focus(), 120);
        }

        function mostrarEstadoPinMovil(estado) {
            if (!mobilePin.enabled) return;
            mobilePin.container?.classList.remove("shake", "complete", "is-validating", "is-success");
            mobilePin.status?.classList.remove("is-complete", "is-validating", "is-success");

            if (estado === "validating") {
                mobilePin.container?.classList.add("is-validating");
                mobilePin.status?.classList.add("is-validating");
                if (mobilePin.status) mobilePin.status.textContent = "Verificando PIN...";
            } else if (estado === "success") {
                mobilePin.container?.classList.add("is-success");
                mobilePin.status?.classList.add("is-success");
                mobilePin.cards.forEach(card => card.classList.add("is-complete"));
                mobilePin.dots.forEach(dot => dot.classList.add("is-success"));
                if (mobilePin.status) mobilePin.status.textContent = "Acceso correcto";
            } else if (estado === "error") {
                mobilePin.container?.classList.add("shake");
                if (mobilePin.status) mobilePin.status.textContent = "PIN incorrecto";
                window.setTimeout(() => prepararPinMovil(), 500);
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
            prepararPinMovil();

            if (!mobilePin.enabled) window.setTimeout(() => pinInput.focus(), 100);
        }

        function volverIdentificador() {
            pinStep.hidden = true;
            identifierStep.hidden = false;
            pinInput.value = "";
            mostrarMensaje("");
            if (mobilePin.enabled) {
                mobilePin.inputs.forEach(input => { input.value = ""; });
                mobilePin.container?.classList.remove("shake", "complete", "is-validating", "is-success");
                mobilePin.status?.classList.remove("is-complete", "is-validating", "is-success");
                if (mobilePin.status) mobilePin.status.textContent = "Ingresa tu PIN";
            }
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
                const data = await fetchLogin({ identifier, adminOnly: true });

                if (!data.user) throw new Error("No se recibió la información de la cuenta.");
                if (data.requiresPin !== true) throw new Error("La cuenta no está disponible para validación con PIN.");

                mostrarPasoPin(data.user);
            } catch (error) {
                console.error("Error en primer paso del login administrativo:", error);
                mostrarMensaje(error?.message || "No se pudo comprobar la cuenta.");
            } finally {
                solicitudEnCurso = false;
                setBusy(continueButton, false);
            }
        }

        async function completarLogin(event) {
            event?.preventDefault();
            event?.stopPropagation();

            if (solicitudEnCurso) return;

            const pin = String(pinInput.value || "").trim();
            if (!/^\d{4}$/.test(pin)) {
                if (mobilePin.enabled) mobilePin.container?.classList.add("shake");
                mostrarMensaje("Introduce el PIN de 4 dígitos de tu cuenta.");
                if (mobilePin.enabled) mobilePin.inputs[Math.min(pin.length, 3)]?.focus();
                else pinInput.focus();
                return;
            }

            solicitudEnCurso = true;
            setBusy(submitPinButton, true, "Entrando...");
            mostrarMensaje("Validando PIN...");
            mostrarEstadoPinMovil("validating");

            try {
                const data = await fetchLogin({ identifier, pin, adminOnly: true });

                if (String(data.user?.role || "user").toLowerCase() !== "admin") {
                    throw new Error("La cuenta no tiene permisos de administrador.");
                }

                if (mobilePin.enabled) {
                    mostrarEstadoPinMovil("success");
                    await new Promise(resolve => window.setTimeout(resolve, 520));
                }

                const destino = esMovil
                    ? "/admin-movil/?login=20260825"
                    : "/admin/?login=20260825";

                window.location.replace(destino);
            } catch (error) {
                console.error("Error en segundo paso del login administrativo:", error);
                mostrarEstadoPinMovil("error");
                mostrarMensaje(error?.message || "No se pudo iniciar sesión.");
            } finally {
                solicitudEnCurso = false;
                setBusy(submitPinButton, false);
            }
        }

        form.addEventListener("submit", event => {
            if (pinStep.hidden) iniciarPasoIdentificador(event);
            else completarLogin(event);
        });

        backButton?.addEventListener("click", event => {
            event.preventDefault();
            volverIdentificador();
        });

        pinInput.addEventListener("input", () => {
            pinInput.value = pinInput.value.replace(/\D/g, "").slice(0, 4);
            if (mobilePin.enabled) {
                mobilePin.inputs.forEach((input, index) => { input.value = pinInput.value.charAt(index) || ""; });
                actualizarPinMovil();
            }
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

        inicializarPinMovil();
        identifierInput.focus();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();
