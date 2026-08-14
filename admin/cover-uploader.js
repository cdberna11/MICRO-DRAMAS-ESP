"use strict";

/* =========================================================
   SUBIDOR DE PORTADAS
   MICRO-DRAMAS-ESP

   Añade al campo URL de portada un botón que abre un popup.
   La imagen se envía a /api/admin/upload-cover y la API
   devuelve la ruta pública que se coloca automáticamente
   en #cover_url.
========================================================= */

(function () {

    const API_UPLOAD =
        "/api/admin/upload-cover";

    const PLATAFORMAS = [
        "DramaBox",
        "DramaWave",
        "GoodShort",
        "FlickReel",
        "Melolo",
        "NetShort",
        "ReelShort"
    ];

    let modal = null;
    let archivoSeleccionado = null;


    document.addEventListener(
        "DOMContentLoaded",
        inicializarSubidorPortadas
    );


    function inicializarSubidorPortadas() {

        const campoPortada =
            document.getElementById("cover_url");

        if (!campoPortada) {
            return;
        }

        prepararCampoPortada(
            campoPortada
        );

        crearModalPortada();
    }


    function prepararCampoPortada(
        campo
    ) {

        campo.placeholder =
            "Se generará al subir la portada";

        campo.readOnly = true;

        campo.title =
            "La ruta se completa automáticamente al subir la portada.";

        const grupo =
            campo.closest(".form-group");

        if (!grupo) {
            return;
        }

        const boton =
            document.createElement("button");

        boton.type = "button";
        boton.id = "boton-subir-portada";
        boton.className =
            "button button--secondary cover-upload-button";
        boton.textContent = "🖼️ Subir portada";

        boton.addEventListener(
            "click",
            abrirModalPortada
        );

        campo.insertAdjacentElement(
            "afterend",
            boton
        );

        const ayuda =
            document.createElement("small");

        ayuda.className =
            "cover-upload-help";

        ayuda.textContent =
            "La imagen se guardará automáticamente en la carpeta de su plataforma.";

        boton.insertAdjacentElement(
            "afterend",
            ayuda
        );
    }


    function crearModalPortada() {

        modal =
            document.createElement("div");

        modal.id =
            "modal-subir-portada";

        modal.className =
            "cover-modal";

        modal.hidden = true;

        modal.innerHTML = `
            <div class="cover-modal__backdrop" data-cover-close="true"></div>

            <div
                class="cover-modal__dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="cover-modal-title"
            >

                <div class="cover-modal__header">

                    <h3 id="cover-modal-title">
                        Subir portada
                    </h3>

                    <button
                        type="button"
                        class="cover-modal__close"
                        id="cover-modal-close"
                        aria-label="Cerrar"
                    >
                        ×
                    </button>

                </div>

                <div class="cover-modal__body">

                    <div class="cover-modal__field">

                        <label for="cover-upload-platform">
                            Plataforma de la portada
                        </label>

                        <select id="cover-upload-platform">
                            <option value="">
                                Seleccione una plataforma
                            </option>
                        </select>

                    </div>

                    <div class="cover-modal__field">

                        <label>
                            Imagen de portada
                        </label>

                        <div
                            id="cover-drop-zone"
                            class="cover-drop-zone"
                            tabindex="0"
                        >

                            <div class="cover-drop-zone__icon">
                                🖼️
                            </div>

                            <strong>
                                Arrastra la imagen aquí
                            </strong>

                            <span>
                                o
                            </span>

                            <button
                                type="button"
                                id="cover-select-file"
                                class="button button--secondary"
                            >
                                Seleccionar imagen
                            </button>

                            <small>
                                JPG, PNG, WEBP o GIF · máximo 10 MB
                            </small>

                        </div>

                        <input
                            type="file"
                            id="cover-file-input"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            hidden
                        >

                    </div>

                    <div
                        id="cover-preview-container"
                        class="cover-preview"
                        hidden
                    >

                        <img
                            id="cover-preview-image"
                            alt="Vista previa de portada"
                        >

                        <div class="cover-preview__info">
                            <strong id="cover-file-name"></strong>
                            <span id="cover-file-size"></span>
                        </div>

                    </div>

                    <div
                        id="cover-upload-message"
                        class="cover-modal__message"
                        hidden
                    ></div>

                </div>

                <div class="cover-modal__actions">

                    <button
                        type="button"
                        id="cover-modal-cancel"
                        class="button button--secondary"
                    >
                        Cancelar
                    </button>

                    <button
                        type="button"
                        id="cover-upload-submit"
                        class="button button--primary"
                        disabled
                    >
                        Subir portada
                    </button>

                </div>

            </div>
        `;

        document.body.appendChild(
            modal
        );

        cargarPlataformas();
        conectarEventosModal();
    }


    function cargarPlataformas() {

        const selector =
            modal.querySelector(
                "#cover-upload-platform"
            );

        PLATAFORMAS.forEach(
            plataforma => {

                const opcion =
                    document.createElement("option");

                opcion.value = plataforma;
                opcion.textContent = plataforma;

                selector.appendChild(
                    opcion
                );
            }
        );

        const selectorPrincipal =
            document.getElementById("platform");

        if (selectorPrincipal) {

            selectorPrincipal.addEventListener(
                "change",
                sincronizarPlataforma
            );
        }
    }


    function sincronizarPlataforma() {

        const principal =
            document.getElementById("platform");

        const selector =
            modal?.querySelector(
                "#cover-upload-platform"
            );

        if (!principal || !selector) {
            return;
        }

        if (
            PLATAFORMAS.includes(
                principal.value
            )
        ) {
            selector.value =
                principal.value;
        }
    }


    function conectarEventosModal() {

        const cerrar =
            () => cerrarModalPortada();

        modal.querySelector(
            "#cover-modal-close"
        ).addEventListener(
            "click",
            cerrar
        );

        modal.querySelector(
            "#cover-modal-cancel"
        ).addEventListener(
            "click",
            cerrar
        );

        modal.querySelector(
            ".cover-modal__backdrop"
        ).addEventListener(
            "click",
            cerrar
        );

        const input =
            modal.querySelector(
                "#cover-file-input"
            );

        modal.querySelector(
            "#cover-select-file"
        ).addEventListener(
            "click",
            () => input.click()
        );

        input.addEventListener(
            "change",
            () => {
                if (input.files?.[0]) {
                    seleccionarArchivo(
                        input.files[0]
                    );
                }
            }
        );

        const dropZone =
            modal.querySelector(
                "#cover-drop-zone"
            );

        [
            "dragenter",
            "dragover"
        ].forEach(
            evento => {
                dropZone.addEventListener(
                    evento,
                    event => {
                        event.preventDefault();
                        dropZone.classList.add(
                            "cover-drop-zone--active"
                        );
                    }
                );
            }
        );

        [
            "dragleave",
            "drop"
        ].forEach(
            evento => {
                dropZone.addEventListener(
                    evento,
                    event => {
                        event.preventDefault();
                        dropZone.classList.remove(
                            "cover-drop-zone--active"
                        );
                    }
                );
            }
        );

        dropZone.addEventListener(
            "drop",
            event => {
                const archivo =
                    event.dataTransfer?.files?.[0];

                if (archivo) {
                    seleccionarArchivo(
                        archivo
                    );
                }
            }
        );

        dropZone.addEventListener(
            "click",
            event => {
                if (
                    event.target.closest("button")
                ) {
                    return;
                }

                input.click();
            }
        );

        dropZone.addEventListener(
            "keydown",
            event => {
                if (
                    event.key === "Enter" ||
                    event.key === " "
                ) {
                    event.preventDefault();
                    input.click();
                }
            }
        );

        modal.querySelector(
            "#cover-upload-platform"
        ).addEventListener(
            "change",
            actualizarEstadoBoton
        );

        modal.querySelector(
            "#cover-upload-submit"
        ).addEventListener(
            "click",
            subirPortada
        );

        document.addEventListener(
            "keydown",
            event => {
                if (
                    event.key === "Escape" &&
                    modal &&
                    !modal.hidden
                ) {
                    cerrarModalPortada();
                }
            }
        );
    }


    function abrirModalPortada() {

        const principal =
            document.getElementById("platform");

        const selector =
            modal.querySelector(
                "#cover-upload-platform"
            );

        const mensaje =
            modal.querySelector(
                "#cover-upload-message"
            );

        archivoSeleccionado = null;

        modal.querySelector(
            "#cover-file-input"
        ).value = "";

        modal.querySelector(
            "#cover-preview-container"
        ).hidden = true;

        mensaje.hidden = true;
        mensaje.textContent = "";
        mensaje.className =
            "cover-modal__message";

        selector.value =
            PLATAFORMAS.includes(
                principal?.value
            )
                ? principal.value
                : "";

        modal.hidden = false;
        document.body.classList.add(
            "cover-modal-open"
        );

        actualizarEstadoBoton();

        setTimeout(
            () => selector.focus(),
            50
        );
    }


    function cerrarModalPortada() {

        if (!modal) {
            return;
        }

        modal.hidden = true;
        archivoSeleccionado = null;

        document.body.classList.remove(
            "cover-modal-open"
        );
    }


    function seleccionarArchivo(
        archivo
    ) {

        const mensaje =
            modal.querySelector(
                "#cover-upload-message"
            );

        const tipos = [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif"
        ];

        if (!tipos.includes(archivo.type)) {
            mostrarMensaje(
                "Formato no permitido. Usa JPG, PNG, WEBP o GIF.",
                "error"
            );
            return;
        }

        if (
            archivo.size <= 0 ||
            archivo.size > 10 * 1024 * 1024
        ) {
            mostrarMensaje(
                "La imagen debe pesar más de 0 bytes y no superar 10 MB.",
                "error"
            );
            return;
        }

        archivoSeleccionado = archivo;

        const preview =
            modal.querySelector(
                "#cover-preview-container"
            );

        const imagen =
            modal.querySelector(
                "#cover-preview-image"
            );

        const nombre =
            modal.querySelector(
                "#cover-file-name"
            );

        const peso =
            modal.querySelector(
                "#cover-file-size"
            );

        imagen.src =
            URL.createObjectURL(
                archivo
            );

        nombre.textContent =
            archivo.name;

        peso.textContent =
            formatearTamano(
                archivo.size
            );

        preview.hidden = false;

        mensaje.hidden = true;
        mensaje.textContent = "";

        actualizarEstadoBoton();
    }


    function actualizarEstadoBoton() {

        const selector =
            modal?.querySelector(
                "#cover-upload-platform"
            );

        const boton =
            modal?.querySelector(
                "#cover-upload-submit"
            );

        if (!selector || !boton) {
            return;
        }

        boton.disabled = !(
            selector.value &&
            archivoSeleccionado
        );
    }


    async function subirPortada() {

        const selector =
            modal.querySelector(
                "#cover-upload-platform"
            );

        const boton =
            modal.querySelector(
                "#cover-upload-submit"
            );

        const titulo =
            document.getElementById(
                "title"
            )?.value.trim() || "";

        const slug =
            document.getElementById(
                "slug"
            )?.value.trim() || "";

        if (!selector.value) {
            mostrarMensaje(
                "Selecciona la plataforma de la portada.",
                "error"
            );
            return;
        }

        if (!archivoSeleccionado) {
            mostrarMensaje(
                "Selecciona o arrastra una imagen.",
                "error"
            );
            return;
        }

        if (!slug) {
            mostrarMensaje(
                "Primero escribe el título del microdrama para generar el slug.",
                "error"
            );
            return;
        }

        boton.disabled = true;
        boton.textContent =
            "Subiendo...";

        mostrarMensaje(
            "Subiendo la portada a GitHub...",
            "info"
        );

        try {

            const datos =
                new FormData();

            datos.append(
                "file",
                archivoSeleccionado
            );

            datos.append(
                "platform",
                selector.value
            );

            datos.append(
                "slug",
                slug
            );

            datos.append(
                "title",
                titulo
            );

            const respuesta =
                await fetch(
                    API_UPLOAD,
                    {
                        method: "POST",
                        credentials: "same-origin",
                        body: datos
                    }
                );

            const resultado =
                await respuesta.json()
                    .catch(
                        () => ({})
                    );

            if (
                !respuesta.ok ||
                !resultado.success
            ) {
                throw new Error(
                    resultado.error ||
                    "No se pudo subir la portada."
                );
            }

            const campoPortada =
                document.getElementById(
                    "cover_url"
                );

            if (campoPortada) {
                campoPortada.value =
                    resultado.path || "";
            }

            const principal =
                document.getElementById(
                    "platform"
                );

            if (
                principal &&
                PLATAFORMAS.includes(
                    selector.value
                )
            ) {
                principal.value =
                    selector.value;
            }

            mostrarMensaje(
                "Portada subida correctamente. La ruta se colocó automáticamente en el formulario.",
                "success"
            );

            boton.textContent =
                "Portada subida";

            setTimeout(
                cerrarModalPortada,
                1200
            );

        } catch (error) {

            console.error(
                "Error al subir portada:",
                error
            );

            mostrarMensaje(
                error.message ||
                "No se pudo subir la portada.",
                "error"
            );

            boton.disabled = false;
            boton.textContent =
                "Subir portada";
        }
    }


    function mostrarMensaje(
        texto,
        tipo
    ) {

        const mensaje =
            modal.querySelector(
                "#cover-upload-message"
            );

        mensaje.textContent =
            texto;

        mensaje.className =
            `cover-modal__message cover-modal__message--${tipo}`;

        mensaje.hidden = false;
    }


    function formatearTamano(
        bytes
    ) {

        if (bytes < 1024) {
            return `${bytes} B`;
        }

        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)} KB`;
        }

        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

})();
