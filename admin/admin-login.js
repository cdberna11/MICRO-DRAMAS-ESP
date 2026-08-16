"use strict";

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
    userBox.textContent = user?.displayName
        ? `${user.displayName} · ${user.email || user.phone || identifier}`
        : identifier;
    pinInput.value = "";
    pinInput.focus();
}

function volverIdentificador() {
    pinStep.hidden = true;
    identifierStep.hidden = false;
    pinInput.value = "";
    mostrarMensaje("");
    identifierInput.focus();
}

async function iniciarPasoIdentificador() {
    identifier = String(identifierInput.value || "").trim();
    if (!identifier) {
        mostrarMensaje("Introduce tu correo electrónico o teléfono.");
        identifierInput.focus();
        return;
    }

    setBusy(continueButton, true, "Comprobando...");
    mostrarMensaje("");

    try {
        const response = await fetch("/api/auth/login", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({ identifier, adminOnly: true })
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success) {
            throw new Error(data.error || "No se pudo comprobar la cuenta.");
        }

        mostrarPasoPin(data.user);
    } catch (error) {
        mostrarMensaje(error.message || "No se pudo comprobar la cuenta.");
    } finally {
        setBusy(continueButton, false);
    }
}

async function completarLogin() {
    const pin = String(pinInput.value || "").trim();
    if (!/^\d{4}$/.test(pin)) {
        mostrarMensaje("Introduce el PIN de 4 dígitos de tu cuenta.");
        pinInput.focus();
        return;
    }

    setBusy(submitPinButton, true, "Entrando...");
    mostrarMensaje("");

    try {
        const response = await fetch("/api/auth/login", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({ identifier, pin, adminOnly: true })
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success) {
            throw new Error(data.error || "No se pudo iniciar sesión.");
        }
        if (String(data.user?.role || "user").toLowerCase() !== "admin") {
            throw new Error("La cuenta no tiene permisos de administrador.");
        }

        window.location.replace("/admin/");
    } catch (error) {
        mostrarMensaje(error.message || "No se pudo iniciar sesión.");
    } finally {
        setBusy(submitPinButton, false);
    }
}

form?.addEventListener("submit", event => {
    event.preventDefault();
    if (!identifierStep.hidden) iniciarPasoIdentificador();
    else completarLogin();
});

backButton?.addEventListener("click", volverIdentificador);
pinInput?.addEventListener("input", () => {
    pinInput.value = pinInput.value.replace(/\D/g, "").slice(0, 4);
});

identifierInput?.focus();
