const AVATARS = [
    "avatar-1.png", "avatar-2.png", "avatar-3.png", "avatar-4.png",
    "avatar-5.png", "avatar-6.png", "avatar-7.png", "avatar-8.png"
];

const $ = selector => document.querySelector(selector);
const loginPanel = $("#login-panel");
const registerPanel = $("#register-panel");
const forgotPanel = $("#forgot-panel");
const onboardingPanel = $("#onboarding-panel");
const profilePanel = $("#profile-panel");
const authMessage = $("#auth-message");
const editModal = $("#edit-profile-modal");
let manageProfileMode = false;

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
    [loginPanel, registerPanel, forgotPanel, onboardingPanel, profilePanel].forEach(item => {
        item.hidden = item !== panel;
    });
    clearMessage();
}

function avatarUrl(name) {
    return `/assets/${encodeURIComponent(name)}`;
}

function validPassword(password) {
    return password.length >= 8;
}

async function api(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        },
        credentials: "same-origin"
    });
    let data = {};
    try { data = await response.json(); } catch {}
    return { response, data };
}

function renderAvatarOptions(containerSelector, selected) {
    const container = $(containerSelector);
    if (!container) return;
    container.innerHTML = "";
    AVATARS.forEach(name => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `avatar-option${name === selected ? " selected" : ""}`;
        button.dataset.avatar = name;
        button.setAttribute("aria-label", `Seleccionar ${name}`);
        button.innerHTML = `<img src="${avatarUrl(name)}" alt="">`;
        button.addEventListener("click", () => {
            container.querySelectorAll(".avatar-option").forEach(item => {
                item.classList.toggle("selected", item === button);
            });
        });
        container.appendChild(button);
    });
}

function selectedAvatar(containerSelector) {
    return $(`${containerSelector} .avatar-option.selected`)?.dataset.avatar || null;
}

function openEditProfile() {
    $("#edit-display-name").value = $("#profile-name").textContent;
    const currentAvatar = $("#profile-avatar-img").src.split("/").pop();
    renderAvatarOptions("#edit-avatars", currentAvatar);
    editModal.hidden = false;
    document.body.style.overflow = "hidden";
}

function closeEditProfile() {
    editModal.hidden = true;
    document.body.style.overflow = "";
}

async function loadSession() {
    const { response, data } = await api("/api/auth/me", { method: "GET" });

    if (!response.ok || !data.authenticated) {
        manageProfileMode = false;
        showPanel(loginPanel);
        return;
    }

    const user = data.user;

    if (!user.profileCompleted) {
        $("#onboarding-name").value = user.displayName;
        renderAvatarOptions("#onboarding-avatars", user.avatar);
        showPanel(onboardingPanel);
        return;
    }

    manageProfileMode = false;
    $("#profile-name").textContent = user.displayName;
    $("#profile-account").textContent = user.email || "";
    $("#profile-avatar-img").src = avatarUrl(user.avatar);
    $("#profile-avatar-img").alt = `Avatar de ${user.displayName}`;
    $("#profile-avatar-button").classList.remove("manage-mode");
    showPanel(profilePanel);
}

$("#go-register").addEventListener("click", () => showPanel(registerPanel));
$("#register-go-login").addEventListener("click", () => showPanel(loginPanel));
$("#forgot-go-login").addEventListener("click", () => showPanel(loginPanel));
$("#go-forgot").addEventListener("click", () => showPanel(forgotPanel));

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
    const displayName = $("#register-name").value.trim();
    const identifier = $("#register-identifier").value.trim();
    const password = $("#register-password").value;
    const confirm = $("#register-confirm").value;

    if (!validPassword(password)) {
        showMessage("La contraseña debe tener al menos 8 caracteres.");
        return;
    }
    if (password !== confirm) {
        showMessage("Las contraseñas no son iguales.");
        return;
    }

    const button = $("#register-submit");
    button.disabled = true;
    const { response, data } = await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ displayName, identifier, password, confirmPassword: confirm })
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
    if (newPassword.length < 8) {
        showMessage("La nueva contraseña debe tener al menos 8 caracteres.");
        return;
    }
    if (newPassword !== confirm) {
        showMessage("Las contraseñas no son iguales.");
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
    setTimeout(() => showPanel(loginPanel), 700);
});

$("#onboarding-form").addEventListener("submit", async event => {
    event.preventDefault();
    clearMessage();
    const displayName = $("#onboarding-name").value.trim();
    const avatar = selectedAvatar("#onboarding-avatars");

    if (displayName.length < 2) {
        showMessage("El nombre debe tener al menos 2 caracteres.");
        return;
    }
    if (!avatar) {
        showMessage("Selecciona un avatar para continuar.");
        return;
    }

    const button = $("#onboarding-submit");
    button.disabled = true;
    const { response, data } = await api("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ displayName, avatar })
    });
    button.disabled = false;

    if (!response.ok || !data.success) {
        showMessage(data.error || "No se pudo guardar el perfil.");
        return;
    }
    await loadSession();
});

$("#profile-avatar-button").addEventListener("click", () => {
    if (manageProfileMode) {
        openEditProfile();
        return;
    }
    window.location.href = "/";
});

$("#manage-profile-button").addEventListener("click", () => {
    manageProfileMode = true;
    $("#profile-avatar-button").classList.add("manage-mode");
});

$("#edit-profile-form").addEventListener("submit", async event => {
    event.preventDefault();
    clearMessage();
    const displayName = $("#edit-display-name").value.trim();
    const avatar = selectedAvatar("#edit-avatars");

    if (displayName.length < 2) {
        showMessage("El nombre debe tener al menos 2 caracteres.");
        return;
    }
    if (!avatar) {
        showMessage("Selecciona un avatar para continuar.");
        return;
    }

    const button = $("#edit-save");
    button.disabled = true;
    const { response, data } = await api("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ displayName, avatar })
    });
    button.disabled = false;

    if (!response.ok || !data.success) {
        showMessage(data.error || "No se pudo actualizar el perfil.");
        return;
    }

    closeEditProfile();
    await loadSession();
});

$("#close-edit-profile").addEventListener("click", closeEditProfile);
editModal.querySelector("[data-close-edit]").addEventListener("click", closeEditProfile);
document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !editModal.hidden) closeEditProfile();
});

$("#logout-button").addEventListener("click", () => {
    window.location.href = "/api/session/logout";
});

loadSession();
