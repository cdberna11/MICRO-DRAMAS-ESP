/*
 * Corrección puntual del registro del portal.
 * Mantiene intacto portal.js y sustituye únicamente el submit del registro
 * para usar un solo identificador (correo o teléfono) y enviar confirmPin.
 */
(() => {
    const form = document.querySelector("#register-form");
    if (!form) return;

    form.addEventListener("submit", async event => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const name = document.querySelector("#register-name")?.value.trim() || "";
        const identifierInput = document.querySelector("#register-identifier");
        const identifier = identifierInput?.value.trim() || "";
        const pin = document.querySelector("#register-pin")?.value.trim() || "";
        const pinConfirm = document.querySelector("#register-pin-confirm")?.value.trim() || "";
        const method = document.querySelector(".auth-method-option.selected")?.dataset.method || "email";

        if (!name || !identifier) {
            return showMessage("Completa todos los campos.");
        }

        if (!/^\d{4}$/.test(pin)) {
            return showMessage("El PIN debe tener exactamente 4 números.");
        }

        if (pin !== pinConfirm) {
            return showMessage("Los PIN no son iguales.");
        }

        const button = document.querySelector("#register-submit");
        if (button) button.disabled = true;

        try {
            const normalizedIdentifier = method === "email"
                ? identifier.toLowerCase()
                : identifier;

            const { response, data } = await api("/api/auth/register", {
                method: "POST",
                body: JSON.stringify({
                    displayName: name,
                    identifier: normalizedIdentifier,
                    email: method === "email" ? normalizedIdentifier : null,
                    authMethod: method,
                    pin,
                    confirmPin: pinConfirm
                })
            });

            if (!response.ok) {
                return showMessage(data.error || "No se pudo completar el registro.");
            }

            /*
             * El registro ya crea la sesión. Reutilizamos el flujo normal
             * de login para que portal.js establezca pendingIdentifier y
             * muestre la pantalla PIN exactamente igual en PC y móvil.
             */
            const loginIdentifier = document.querySelector("#login-identifier");
            if (loginIdentifier) loginIdentifier.value = normalizedIdentifier;
            document.querySelector("#login-form")?.requestSubmit();
        } catch {
            showMessage("No se pudo conectar con el servidor.");
        } finally {
            if (button) button.disabled = false;
        }
    }, true);
})();
