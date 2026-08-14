const AVATARS = [
    "avatar-1.png", "avatar-2.png", "avatar-3.png", "avatar-4.png",
    "avatar-5.png", "avatar-6.png", "avatar-7.png", "avatar-8.png"
];

const $ = selector => document.querySelector(selector);
const loginPanel = $("#login-panel");
const registerPanel = $("#register-panel");
const profilePanel = $("#profile-panel");
const forgotPanel = $("#forgot-panel");
const authMessage = $("#auth-message");
const registerIdentifierLabel = $("label[for='register-identifier']");

function showMessage(message, type = "error") {
    authMessage.textContent = message;
    authMessage.className = `auth-message ${type}`;
    authMessage.hidden = false;
}

function clearMessage() {
    authMessage.hidden = true;
    authMessage.textContent = "";
}

function showPanel(panel) {
    [loginPanel, registerPanel, profilePanel, forgotPanel].forEach(item => {
        item.hidden = item !== panel;
    });
    clearMessage();
}

function avatarUrl(name) {
    return `/assets/${encodeURIComponent(name)}`;
}

async function api(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
        credentials: "same-origin"
    });
    let data = {};
    try { data = await response.json(); } catch { /* sin JSON */ }
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
        button.addEventListener("click", () => {
            container.querySelectorAll(".avatar-option").forEach(item => item.classList.remove("selected"));
            button.classList.add("selected");
        });
        container.appendChild(button);
    });
}

async function loadSession() {
    const { response, data } = await api("/api/auth/me", { method: "GET" });
    if (!response.ok || !data.authenticated) {
        showPanel(loginPanel);
        return;
    }

    $("#profile-name").textContent = data.user.displayName;
    $("#profile-avatar-img").src = avatarUrl(data.user.avatar);
    $("#profile-account").textContent = data.user.authMethod === "phone" ? data.user.phone : data.user.email;
    $("#profile-display-name").value = data.user.displayName;
    renderAvatarOptions(data.user.avatar);
    showPanel(profilePanel);
}

$("#go-register").addEventListener("click", () => showPanel(registerPanel));
$("#register-go-login").addEventListener("click", () => showPanel(loginPanel));
$("#forgot-go-login").addEventListener("click", () => showPanel(loginPanel));
$("#go-forgot").addEventListener("click", () => showPanel(forgotPanel));
$("#profile-avatar-img").addEventListener("click", () => { window.location.href = "/"; });

$("#register-method-email").addEventListener("change", () => {
    $("#register-identifier").type = "email";
    $("#register-identifier").placeholder = "correo@ejemplo.com";
    registerIdentifierLabel.textContent = "Correo";
});

$("#register-method-phone").addEventListener("change", () => {
    $("#register-identifier").type = "tel";
    $("#register-identifier").placeholder = "+507 6000 0000";
    registerIdentifierLabel.textContent = "Número de WhatsApp";
});

$("#login-form").addEventListener("submit", async event => {
    event.preventDefault();
    clearMessage();
    const button = $("#login-submit");
    button.disabled = true;
    const { response, data } = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier: $("#login-identifier").value.trim(), password: $("#login-password").value })
    });
    button.disabled = false;
    if (!response.ok || !data.success) {
        showMessage(data.error || "No se pudo iniciar sesión.");
        return;
    }
    await loadSession();
});

$("#register-form").addEventListener("submit", async event => {
    event.preventDefault();
    clearMessage();
    const method = $("input[name='register-method']:checked").value;
    const displayName = $("#register-name").value.trim();
    const identifier = $("#register-identifier").value.trim();
    const password = $("#register-password").value;
    const confirm = $("#register-confirm").value;
    if (password !== confirm) {
        showMessage("Las contraseñas no coinciden.");
        return;
    }
    const button = $("#register-submit");
    button.disabled = true;
    const { response, data } = await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ method, displayName, identifier, password })
    });
    button.disabled = false;
    if (!response.ok || !data.success) {
        showMessage(data.error || "No se pudo crear la cuenta.");
        return;
    }
    await loadSession();
});

$("#forgot-form").addEventListener("submit", async event => {
    event.preventDefault();
    clearMessage();
    const identifier = $("#forgot-identifier").value.trim();
    const newPassword = $("#forgot-password").value;
    const confirm = $("#forgot-confirm").value;
    if (newPassword !== confirm) {
        showMessage("Las contraseñas no coinciden.");
        return;
    }
    const button = $("#forgot-submit");
    button.disabled = true;
    const { response, data } = await api("/api/auth/forgot", {
        method: "POST",
        body: JSON.stringify({ identifier, newPassword })
    });
    button.disabled = false;
    if (!response.ok || !data.success) {
        showMessage(data.error || "No se pudo restablecer la contraseña.");
        return;
    }
    showMessage("Contraseña restablecida correctamente.", "success");
    setTimeout(loadSession, 700);
});

$("#profile-form").addEventListener("submit", async event => {
    event.preventDefault();
    clearMessage();
    const selected = document.querySelector(".avatar-option.selected");
    const { response, data } = await api("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({
            displayName: $("#profile-display-name").value.trim(),
            avatar: selected?.dataset.avatar
        })
    });
    if (!response.ok || !data.success) {
        showMessage(data.error || "No se pudo actualizar el perfil.");
        return;
    }
    await loadSession();
});

$("#enter-catalog").addEventListener("click", () => { window.location.href = "/"; });
$("#logout-button").addEventListener("click", () => { window.location.href = "/api/session/logout"; });

loadSession();
