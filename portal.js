const AVATARS = ["avatar-1.png", "avatar-2.png", "avatar-3.png", "avatar-4.png", "avatar-5.png", "avatar-6.png", "avatar-7.png", "avatar-8.png"];
const $ = selector => document.querySelector(selector);
const loginPanel = $("#login-panel");
const registerPanel = $("#register-panel");
const profilePanel = $("#profile-panel");
const forgotPanel = $("#forgot-panel");
const authMessage = $("#auth-message");
let googleCsrfToken = null;

function showMessage(message, type = "error") { authMessage.textContent = message; authMessage.className = `auth-message ${type}`; authMessage.hidden = false; }
function clearMessage() { authMessage.hidden = true; authMessage.textContent = ""; }
function showPanel(panel) { [loginPanel, registerPanel, profilePanel, forgotPanel].forEach(item => { item.hidden = item !== panel; }); clearMessage(); }
function avatarUrl(name) { return `/assets/${encodeURIComponent(name)}`; }

async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) }, credentials: "same-origin" });
    let data = {};
    try { data = await response.json(); } catch {}
    return { response, data };
}

function renderAvatarOptions(selected) {
    const container = $("#avatar-options");
    container.innerHTML = "";
    AVATARS.forEach(name => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `avatar-option${name === selected ? " selected" : ""}`;
        button.dataset.avatar = name;
        button.setAttribute("aria-label", `Seleccionar ${name}`);
        button.innerHTML = `<img src="${avatarUrl(name)}" alt="">`;
        button.addEventListener("click", () => container.querySelectorAll(".avatar-option").forEach(item => item.classList.toggle("selected", item === button)));
        container.appendChild(button);
    });
}

async function loadSession() {
    const { response, data } = await api("/api/auth/me", { method: "GET" });
    if (!response.ok || !data.authenticated) { showPanel(loginPanel); return; }
    $("#profile-name").textContent = data.user.displayName;
    $("#profile-avatar-img").src = avatarUrl(data.user.avatar);
    $("#profile-account").textContent = data.user.authProvider === "google" ? `${data.user.email} · Google` : data.user.email;
    $("#profile-display-name").value = data.user.displayName;
    renderAvatarOptions(data.user.avatar);
    showPanel(profilePanel);
}

async function initGoogleSignIn() {
    const loginBox = $("#google-login-button");
    const registerBox = $("#google-register-button");
    try {
        const response = await fetch("/api/auth/google-config", { credentials: "same-origin", cache: "no-store" });
        const config = await response.json();
        googleCsrfToken = config.csrfToken || null;
        if (!config.configured || !config.clientId || !googleCsrfToken) {
            const unavailable = "Google estará disponible cuando terminemos su configuración.";
            loginBox.innerHTML = `<div class="google-unavailable">${unavailable}</div>`;
            registerBox.innerHTML = `<div class="google-unavailable">${unavailable}</div>`;
            return;
        }
        window.handleGoogleCredential = async credentialResponse => {
            if (!credentialResponse?.credential || !googleCsrfToken) { showMessage("No se recibió una credencial válida de Google."); return; }
            const form = new URLSearchParams({ credential: credentialResponse.credential, g_csrf_token: googleCsrfToken });
            const response = await fetch("/api/auth/google", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" }, body: form.toString(), credentials: "same-origin" });
            let data = {};
            try { data = await response.json(); } catch {}
            if (!response.ok || !data.success) { showMessage(data.error || "No se pudo validar la cuenta de Google."); return; }
            await loadSession();
        };
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.onload = () => {
            google.accounts.id.initialize({ client_id: config.clientId, callback: window.handleGoogleCredential, ux_mode: "popup" });
            google.accounts.id.renderButton(loginBox, { type: "standard", theme: "outline", size: "large", text: "continue_with", shape: "rectangular", width: 360 });
            google.accounts.id.renderButton(registerBox, { type: "standard", theme: "outline", size: "large", text: "continue_with", shape: "rectangular", width: 360 });
        };
        document.head.appendChild(script);
    } catch {
        loginBox.innerHTML = `<div class="google-unavailable">No se pudo cargar Google.</div>`;
        registerBox.innerHTML = `<div class="google-unavailable">No se pudo cargar Google.</div>`;
    }
}

$("#go-register").addEventListener("click", () => showPanel(registerPanel));
$("#register-go-login").addEventListener("click", () => showPanel(loginPanel));
$("#forgot-go-login").addEventListener("click", () => showPanel(loginPanel));
$("#go-forgot").addEventListener("click", () => showPanel(forgotPanel));
$("#profile-avatar-img").addEventListener("click", () => { window.location.href = "/"; });

$("#login-form").addEventListener("submit", async event => {
    event.preventDefault(); clearMessage();
    const button = $("#login-submit"); button.disabled = true;
    const { response, data } = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: $("#login-identifier").value.trim(), password: $("#login-password").value }) });
    button.disabled = false;
    if (!response.ok || !data.success) { showMessage(data.error || "No se pudo iniciar sesión."); return; }
    await loadSession();
});

$("#register-form").addEventListener("submit", async event => {
    event.preventDefault(); clearMessage();
    const displayName = $("#register-name").value.trim();
    const identifier = $("#register-identifier").value.trim();
    const password = $("#register-password").value;
    const confirm = $("#register-confirm").value;
    if (password !== confirm) { showMessage("Las contraseñas no coinciden."); return; }
    const button = $("#register-submit"); button.disabled = true;
    const { response, data } = await api("/api/auth/register", { method: "POST", body: JSON.stringify({ displayName, identifier, password }) });
    button.disabled = false;
    if (!response.ok || !data.success) { showMessage(data.error || "No se pudo crear la cuenta."); return; }
    await loadSession();
});

$("#forgot-form").addEventListener("submit", async event => {
    event.preventDefault(); clearMessage();
    const identifier = $("#forgot-identifier").value.trim();
    const newPassword = $("#forgot-password").value;
    const confirm = $("#forgot-confirm").value;
    if (newPassword !== confirm) { showMessage("Las contraseñas no coinciden."); return; }
    const button = $("#forgot-submit"); button.disabled = true;
    const { response, data } = await api("/api/auth/forgot", { method: "POST", body: JSON.stringify({ identifier, newPassword }) });
    button.disabled = false;
    if (!response.ok || !data.success) { showMessage(data.error || "No se pudo restablecer la contraseña."); return; }
    showMessage("Contraseña restablecida correctamente.", "success");
    setTimeout(loadSession, 700);
});

$("#profile-form").addEventListener("submit", async event => {
    event.preventDefault(); clearMessage();
    const selected = document.querySelector(".avatar-option.selected");
    const { response, data } = await api("/api/auth/me", { method: "PATCH", body: JSON.stringify({ displayName: $("#profile-display-name").value.trim(), avatar: selected?.dataset.avatar }) });
    if (!response.ok || !data.success) { showMessage(data.error || "No se pudo actualizar el perfil."); return; }
    await loadSession();
});

$("#enter-catalog").addEventListener("click", () => { window.location.href = "/"; });
$("#logout-button").addEventListener("click", () => { window.location.href = "/api/session/logout"; });

loadSession();
initGoogleSignIn();
