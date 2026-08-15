const AVATARS = [
    "avatar-1.png", "avatar-2.png", "avatar-3.png", "avatar-4.png",
    "avatar-5.png", "avatar-6.png", "avatar-7.png", "avatar-8.png"
];

const $ = selector => document.querySelector(selector);
const loginPanel = $("#login-panel");
const pinPanel = $("#pin-panel");
const registerPanel = $("#register-panel");
const forgotPanel = $("#forgot-panel");
const onboardingPanel = $("#onboarding-panel");
const profilePanel = $("#profile-panel");
const authMessage = $("#auth-message");
const editModal = $("#edit-profile-modal");
const migrationModal = $("#pin-migration-modal");
const pinInputs = Array.from(document.querySelectorAll(".pin-input"));
let manageProfileMode = false;
let pendingIdentifier = "";
let registerAuthMethod = "email";

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
    [loginPanel, pinPanel, registerPanel, forgotPanel, onboardingPanel, profilePanel].forEach(item => {
        item.hidden = item !== panel;
    });
    document.body.classList.toggle("login-mode", panel === loginPanel);
    document.body.classList.toggle("profile-mode", panel === profilePanel);
    document.body.classList.toggle("pin-mode", panel === pinPanel);
    clearMessage();
    if (panel !== pinPanel) clearPinInputs();
}

function avatarUrl(name) {
    return `/assets/${encodeURIComponent(name || "avatar-1.png")}`;
}

function validPin(pin) {
    return /^\d{4}$/.test(pin);
}

function getPinValue() {
    return pinInputs.map(input => input.value).join("");
}

function clearPinInputs() {
    pinInputs.forEach(input => {
        input.value = "";
        input.classList.remove("filled", "active");
    });
}

function focusFirstPin() {
    const firstEmpty = pinInputs.find(input => !input.value) || pinInputs[0];
    firstEmpty?.focus();
    updatePinVisualState();
}

function updatePinVisualState() {
    pinInputs.forEach(input => {
        input.classList.toggle("filled", Boolean(input.value));
        input.classList.toggle("active", document.activeElement === input);
    });
}

function preparePinInputs() {
    pinInputs.forEach((input, index) => {
        input.addEventListener("focus", updatePinVisualState);
        input.addEventListener("blur", updatePinVisualState);

        input.addEventListener("input", () => {
            const digits = input.value.replace(/\D/g, "");
            input.value = digits.slice(-1);
            updatePinVisualState();

            if (input.value && index < pinInputs.length - 1) {
                pinInputs[index + 1].focus();
            }

            if (getPinValue().length === 4) {
                setTimeout(() => {
                    if (getPinValue().length === 4) $("#pin-form").requestSubmit();
                }, 80);
            }
        });

        input.addEventListener("keydown", event => {
            if (event.key === "Backspace" && !input.value && index > 0) {
                pinInputs[index - 1].value = "";
                pinInputs[index - 1].focus();
                updatePinVisualState();
            }
            if (event.key === "ArrowLeft" && index > 0) pinInputs[index - 1].focus();
            if (event.key === "ArrowRight" && index < pinInputs.length - 1) pinInputs[index + 1].focus();
        });

        input.addEventListener("paste", event => {
            event.preventDefault();
            const pasted = (event.clipboardData?.getData("text") || "").replace(/\D/g, "").slice(0, 4);
            pasted.split("").forEach((digit, digitIndex) => {
                if (pinInputs[digitIndex]) pinInputs[digitIndex].value = digit;
            });
            updatePinVisualState();
            const next = pinInputs[Math.min(pasted.length, 3)];
            next?.focus();
            if (pasted.length === 4) setTimeout(() => $("#pin-form").requestSubmit(), 80);
        });
    });
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
    renderAvatarOptions("#edit-avatars", decodeURIComponent(currentAvatar));
    editModal.hidden = false;
    document.body.style.overflow = "hidden";
}

function closeEditProfile() {
    editModal.hidden = true;
    document.body.style.overflow = "";
}

function showPinMigrationModal() {
    clearMigrationMessage();
    $("#migration-current-password").value = "";
    $("#migration-pin").value = "";
    $("#migration-pin-confirm").value = "";
    migrationModal.hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(() => $("#migration-current-password")?.focus(), 60);
}

function clearMigrationMessage() {
    const message = $("#migration-message");
    message.hidden = true;
    message.textContent = "";
}

function showMigrationMessage(message) {
    const element = $("#migration-message");
    element.textContent = message;
    element.hidden = false;
}

function closePinMigrationModal() {
    migrationModal.hidden = true;
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
    $("#profile-avatar-img").src = avatarUrl(user.avatar);
    $("#profile-avatar-img").alt = `Avatar de ${user.displayName}`;
    $("#profile-avatar-button").classList.remove("manage-mode");
    showPanel(profilePanel);
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

function updateRegisterMethodUI() {
    document.querySelectorAll(".auth-method-option").forEach(button => {
        button.classList.toggle("selected", button.dataset.method === registerAuthMethod);
    });

    const identifier = $("#register-identifier");
    const label = $("#register-identifier-label");
    if (registerAuthMethod === "phone") {
        label.textContent = "Teléfono de acceso";
        identifier.type = "tel";
        identifier.inputMode = "tel";
        identifier.autocomplete = "tel";
        identifier.placeholder = "+507 6000-0000";
    } else {
        label.textContent = "Correo de acceso";
        identifier.type = "email";
        identifier.inputMode = "email";
        identifier.autocomplete = "username";
        identifier.placeholder = "correo@ejemplo.com";
    }
}

$("#go-register").addEventListener("click", () => {
    registerAuthMethod = "email";
    updateRegisterMethodUI();
    showPanel(registerPanel);
});
$("#register-go-login").addEventListener("click", () => showPanel(loginPanel));
$("#forgot-go-login").addEventListener("click", () => showPanel(loginPanel));
$("#go-forgot").addEventListener("click", () => showPanel(forgotPanel));
$("#pin-back-login").addEventListener("click", () => {
    pendingIdentifier = "";
    clearPinInputs();
    showPanel(loginPanel);
});

$("#login-form").addEventListener("submit", async event => {
    event.preventDefault();
    const identifier = $("#login-identifier").value.trim();
    if (!identifier) return showMessage("Escribe tu correo o teléfono.");

    const button = $("#login-submit");
    button.disabled = true;
    try {
        const { response, data } = await api("/api/auth/login-start", {
            method: "POST",
            body: JSON.stringify({ identifier })
        });

        if (!response.ok) {
            if (data.code === "PASSWORD_ACCOUNT") {
                pendingIdentifier = identifier;
                showPinMigrationModal();
                return;
            }
            return showMessage(data.error || "No se pudo iniciar sesión.");
        }

        pendingIdentifier = identifier;
        $("#pin-account-label").textContent = "";
        showPanel(pinPanel);
        setTimeout(focusFirstPin, 60);
    } catch {
        showMessage("No se pudo conectar con el servidor.");
    } finally {
        button.disabled = false;
    }
});

$("#pin-form").addEventListener("submit", async event => {
    event.preventDefault();
    const pin = getPinValue();
    if (!validPin(pin)) return showMessage("El PIN debe tener 4 dígitos.");

    const button = $("#pin-submit");
    button.disabled = true;
    try {
        const { response, data } = await api("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ identifier: pendingIdentifier, pin })
        });
        if (!response.ok) {
            clearPinInputs();
            focusFirstPin();
            return showMessage(data.error || "PIN incorrecto.");
        }
        pendingIdentifier = "";
        await loadSession();
    } catch {
        showMessage("No se pudo conectar con el servidor.");
    } finally {
        button.disabled = false;
    }
});

document.querySelectorAll(".auth-method-option").forEach(button => {
    button.addEventListener("click", () => {
        registerAuthMethod = button.dataset.method || "email";
        updateRegisterMethodUI();
    });
});

$("#register-form").addEventListener("submit", async event => {
    event.preventDefault();
    const name = $("#register-name").value.trim();
    const email = $("#register-email").value.trim().toLowerCase();
    const identifier = $("#register-identifier").value.trim();
    const pin = $("#register-pin").value.trim();
    const pinConfirm = $("#register-pin-confirm").value.trim();

    if (!name || !email || !identifier) return showMessage("Completa todos los campos.");
    if (!validPin(pin)) return showMessage("El PIN debe tener exactamente 4 números.");
    if (pin !== pinConfirm) return showMessage("Los PIN no son iguales.");

    const button = $("#register-submit");
    button.disabled = true;
    try {
        const { response, data } = await api("/api/auth/register", {
            method: "POST",
            body: JSON.stringify({
                displayName: name,
                email,
                identifier,
                authMethod: registerAuthMethod,
                pin
            })
        });
        if (!response.ok) return showMessage(data.error || "No se pudo completar el registro.");
        pendingIdentifier = identifier;
        showPanel(pinPanel);
        setTimeout(focusFirstPin, 60);
    } catch {
        showMessage("No se pudo conectar con el servidor.");
    } finally {
        button.disabled = false;
    }
});

$("#onboarding-form").addEventListener("submit", async event => {
    event.preventDefault();
    const displayName = $("#onboarding-name").value.trim();
    const avatar = selectedAvatar("#onboarding-avatars");
    if (!displayName || !avatar) return showMessage("Selecciona un nombre y un avatar.");

    const button = $("#onboarding-submit");
    button.disabled = true;
    try {
        const { response, data } = await api("/api/auth/profile", {
            method: "PUT",
            body: JSON.stringify({ displayName, avatar })
        });
        if (!response.ok) return showMessage(data.error || "No se pudo guardar el perfil.");
        await loadSession();
    } catch {
        showMessage("No se pudo conectar con el servidor.");
    } finally {
        button.disabled = false;
    }
});

$("#profile-avatar-button").addEventListener("click", () => {
    if (manageProfileMode) {
        openEditProfile();
        return;
    }
    window.location.href = "/";
});

$("#manage-profile-button").addEventListener("click", () => {
    manageProfileMode = !manageProfileMode;
    $("#profile-avatar-button").classList.toggle("manage-mode", manageProfileMode);
});

$("#logout-button").addEventListener("click", async () => {
    const button = $("#logout-button");
    button.disabled = true;
    try {
        await api("/api/auth/logout", { method: "POST" });
    } finally {
        window.location.href = "/portal";
    }
});

$("#close-edit-profile").addEventListener("click", closeEditProfile);
document.querySelector("[data-close-edit]")?.addEventListener("click", closeEditProfile);

$("#edit-profile-form").addEventListener("submit", async event => {
    event.preventDefault();
    const displayName = $("#edit-display-name").value.trim();
    const avatar = selectedAvatar("#edit-avatars");
    if (!displayName || !avatar) return;

    const button = $("#edit-save");
    button.disabled = true;
    try {
        const { response, data } = await api("/api/auth/profile", {
            method: "PUT",
            body: JSON.stringify({ displayName, avatar })
        });
        if (!response.ok) return showMessage(data.error || "No se pudo guardar el perfil.");
        closeEditProfile();
        manageProfileMode = false;
        await loadSession();
    } catch {
        showMessage("No se pudo conectar con el servidor.");
    } finally {
        button.disabled = false;
    }
});

$("#pin-migration-form").addEventListener("submit", async event => {
    event.preventDefault();
    const currentPassword = $("#migration-current-password").value;
    const pin = $("#migration-pin").value.trim();
    const pinConfirm = $("#migration-pin-confirm").value.trim();

    clearMigrationMessage();
    if (!currentPassword) return showMigrationMessage("Escribe tu contraseña actual.");
    if (!validPin(pin)) return showMigrationMessage("El PIN debe tener exactamente 4 números.");
    if (pin !== pinConfirm) return showMigrationMessage("Los PIN no son iguales.");

    const button = $("#migration-submit");
    button.disabled = true;
    try {
        const { response, data } = await api("/api/auth/migrate-pin", {
            method: "POST",
            body: JSON.stringify({ identifier: pendingIdentifier, currentPassword, pin })
        });
        if (!response.ok) return showMigrationMessage(data.error || "No se pudo actualizar el PIN.");
        closePinMigrationModal();
        pendingIdentifier = "";
        await loadSession();
    } catch {
        showMigrationMessage("No se pudo conectar con el servidor.");
    } finally {
        button.disabled = false;
    }
});

migrationModal?.addEventListener("click", event => {
    if (event.target.classList.contains("migration-modal-backdrop")) closePinMigrationModal();
});

preparePinInputs();
updateRegisterMethodUI();
loadSession();
