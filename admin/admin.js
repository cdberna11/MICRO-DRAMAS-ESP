"use strict";


/* =========================================================
   CONFIGURACIÓN
========================================================= */

const API_ADMIN_DRAMAS =
    "/api/admin/dramas";

const DESCRIPCION_AUTOMATICA =
    "Drama doblado al español.";

const API_ADMIN_CATEGORIES =
    "/api/admin/categories";


let categoriasDisponibles = [];

let dramasActuales = [];

let textoBusqueda = "";

let modoFormulario =
    "nuevo";


/* =========================================================
   INICIO
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        inicializarFormulario();

        inicializarSeleccionMultiple();

        inicializarBuscador();

        inicializarNuevaCategoria();

        inicializarNuevaPlataforma();

        cargarCategoriasAdministrativas();

        cargarDramasAdministrativos();

    }
);


/* =========================================================
   INICIALIZAR FORMULARIO
========================================================= */

function inicializarFormulario() {

    const botonNuevo =
        document.getElementById(
            "boton-nuevo"
        );


    const botonCancelar =
        document.getElementById(
            "boton-cancelar"
        );


    const formulario =
        document.getElementById(
            "form-nuevo-drama"
        );


    const campoTitulo =
        document.getElementById(
            "title"
        );


    const campoPlataforma =
        document.getElementById(
            "platform"
        );


    if (
        botonNuevo
    ) {

        botonNuevo.addEventListener(
            "click",
            abrirFormularioNuevo
        );

    }


    if (
        botonCancelar
    ) {

        botonCancelar.addEventListener(
            "click",
            cerrarFormulario
        );

    }


    if (
        formulario
    ) {

        formulario.addEventListener(
            "submit",
            guardarFormulario
        );

    }


    if (
        campoTitulo
    ) {

        campoTitulo.addEventListener(
            "input",
            () => {

                document.getElementById(
                    "slug"
                ).value =
                    generarSlug(
                        campoTitulo.value
                    );

            }
        );

    }


    if (
        campoPlataforma
    ) {

        campoPlataforma.dataset.previousValue =
            campoPlataforma.value || "";

    }

}


/* =========================================================
   CARGAR CATEGORÍAS
========================================================= */

async function cargarCategoriasAdministrativas() {

    const selector =
        document.getElementById(
            "categorias-selector"
        );


    if (
        !selector
    ) {

        return;

    }


    try {

        const respuesta =
            await fetch(
                API_ADMIN_CATEGORIES,
                {

                    method:
                        "GET",

                    credentials:
                        "same-origin",

                    headers: {
                        "Accept":
                            "application/json"
                    },

                    cache:
                        "no-store"

                }
            );


        if (
            !respuesta.ok
        ) {

            throw new Error(
                `La API de categorías respondió con el estado ${respuesta.status}.`
            );

        }


        const datos =
            await respuesta.json();


        if (
            !datos.success ||
            !Array.isArray(
                datos.categories
            )
        ) {

            throw new Error(
                "La API de categorías devolvió una respuesta no válida."
            );

        }


        categoriasDisponibles =
            datos.categories.filter(
                categoria =>
                    categoria.active === true
            );


        renderizarSelectorCategorias(
            []
        );


    } catch (
        error
    ) {

        console.error(
            "Error al cargar categorías:",
            error
        );


        categoriasDisponibles =
            [];


        selector.innerHTML =
            `
            <option value="">
                No se pudieron cargar las categorías
            </option>
            `;

    }

}


/* =========================================================
   RENDERIZAR SELECTOR DE CATEGORÍA
========================================================= */

function renderizarSelectorCategorias(
    seleccionada = []
) {

    const selector =
        document.getElementById(
            "categorias-selector"
        );


    if (
        !selector
    ) {

        return;

    }


    selector.innerHTML =
        "";


    /* -----------------------------------------------------
       OPCIÓN INICIAL
    ----------------------------------------------------- */

    const opcionInicial =
        document.createElement(
            "option"
        );


    opcionInicial.value =
        "";


    opcionInicial.textContent =
        "Seleccione una categoría";


    selector.appendChild(
        opcionInicial
    );


    /* -----------------------------------------------------
       CATEGORÍAS EXISTENTES
    ----------------------------------------------------- */

    categoriasDisponibles.forEach(
        categoria => {

            const nombre =
                String(
                    categoria.name
                )
                    .trim()
                    .toUpperCase();


            const opcion =
                document.createElement(
                    "option"
                );


            opcion.value =
                nombre;


            opcion.textContent =
                nombre;


            selector.appendChild(
                opcion
            );

        }
    );


    /* -----------------------------------------------------
       SEPARADOR
    ----------------------------------------------------- */

    const separador =
        document.createElement(
            "option"
        );


    separador.disabled =
        true;


    separador.textContent =
        "────────────────────────";


    selector.appendChild(
        separador
    );


    /* -----------------------------------------------------
       NUEVA CATEGORÍA
    ----------------------------------------------------- */

    const opcionNueva =
        document.createElement(
            "option"
        );


    opcionNueva.value =
        "__NUEVA_CATEGORIA__";


    opcionNueva.textContent =
        "+ NUEVA CATEGORÍA";


    selector.appendChild(
        opcionNueva
    );


    /* -----------------------------------------------------
       RESTAURAR CATEGORÍA
    ----------------------------------------------------- */

    if (
        Array.isArray(
            seleccionada
        ) &&
        seleccionada.length > 0
    ) {

        const categoriaActual =
            String(
                seleccionada[0]
            )
                .trim()
                .toUpperCase();


        const existe =
            categoriasDisponibles.some(
                categoria =>
                    String(
                        categoria.name
                    )
                        .trim()
                        .toUpperCase() ===
                    categoriaActual
            );


        if (
            existe
        ) {

            selector.value =
                categoriaActual;

        }

    }


    selector.dataset.previousValue =
        selector.value || "";

}


/* =========================================================
   INICIALIZAR NUEVA CATEGORÍA
========================================================= */

function inicializarNuevaCategoria() {

    const selector =
        document.getElementById(
            "categorias-selector"
        );


    const modal =
        document.getElementById(
            "modal-nueva-categoria"
        );


    const campo =
        document.getElementById(
            "nueva-categoria"
        );


    const botonCrear =
        document.getElementById(
            "boton-crear-categoria"
        );


    const botonCancelar =
        document.getElementById(
            "boton-cancelar-categoria"
        );


    const botonCerrar =
        document.getElementById(
            "boton-cerrar-modal-categoria"
        );


    const backdrop =
        document.getElementById(
            "category-modal-backdrop"
        );


    const mensaje =
        document.getElementById(
            "mensaje-nueva-categoria"
        );


    if (
        !selector ||
        !modal ||
        !campo ||
        !botonCrear
    ) {

        return;

    }


    /* -----------------------------------------------------
       SELECT
    ----------------------------------------------------- */

    selector.addEventListener(
        "change",
        () => {

            if (
                selector.value ===
                "__NUEVA_CATEGORIA__"
            ) {

                abrirModal();

                return;

            }


            selector.dataset.previousValue =
                selector.value;

        }
    );


    /* -----------------------------------------------------
       CREAR
    ----------------------------------------------------- */

    botonCrear.addEventListener(
        "click",
        crearCategoria
    );


    /* -----------------------------------------------------
       CANCELAR
    ----------------------------------------------------- */

    if (
        botonCancelar
    ) {

        botonCancelar.addEventListener(
            "click",
            cerrarModal
        );

    }


    /* -----------------------------------------------------
       CERRAR X
    ----------------------------------------------------- */

    if (
        botonCerrar
    ) {

        botonCerrar.addEventListener(
            "click",
            cerrarModal
        );

    }


    /* -----------------------------------------------------
       CERRAR FONDO
    ----------------------------------------------------- */

    if (
        backdrop
    ) {

        backdrop.addEventListener(
            "click",
            cerrarModal
        );

    }


    /* -----------------------------------------------------
       TECLADO
    ----------------------------------------------------- */

    campo.addEventListener(
        "keydown",
        evento => {

            if (
                evento.key ===
                "Enter"
            ) {

                evento.preventDefault();

                crearCategoria();

            }


            if (
                evento.key ===
                "Escape"
            ) {

                evento.preventDefault();

                cerrarModal();

            }

        }
    );


    /* -----------------------------------------------------
       ABRIR MODAL
    ----------------------------------------------------- */

    function abrirModal() {

        campo.value =
            "";


        mensaje.hidden =
            true;


        mensaje.textContent =
            "";


        modal.hidden =
            false;


        document.body.classList.add(
            "category-modal-open"
        );


        setTimeout(
            () => {

                campo.focus();

            },
            50
        );

    }


    /* -----------------------------------------------------
       CERRAR MODAL
    ----------------------------------------------------- */

    function cerrarModal() {

        modal.hidden =
            true;


        document.body.classList.remove(
            "category-modal-open"
        );


        selector.value =
            selector.dataset.previousValue ||
            "";


        campo.value =
            "";


        mensaje.hidden =
            true;


        mensaje.textContent =
            "";

    }


    /* -----------------------------------------------------
       CREAR CATEGORÍA
    ----------------------------------------------------- */

    async function crearCategoria() {

        const nombre =
            campo.value
                .trim()
                .replace(
                    /\s+/g,
                    " "
                );


        if (
            !nombre
        ) {

            mostrarError(
                "Escribe el nombre de la categoría."
            );

            campo.focus();

            return;

        }


        if (
            nombre.length <
            2
        ) {

            mostrarError(
                "El nombre de la categoría es demasiado corto."
            );

            campo.focus();

            return;

        }


        botonCrear.disabled =
            true;


        if (
            botonCancelar
        ) {

            botonCancelar.disabled =
                true;

        }


        if (
            botonCerrar
        ) {

            botonCerrar.disabled =
                true;

        }


        botonCrear.textContent =
            "Creando...";


        try {

            const respuesta =
                await fetch(
                    API_ADMIN_CATEGORIES,
                    {

                        method:
                            "POST",

                        credentials:
                            "same-origin",

                        headers: {

                            "Content-Type":
                                "application/json",

                            "Accept":
                                "application/json"

                        },

                        body:
                            JSON.stringify({
                                name:
                                    nombre
                            })

                    }
                );


            const resultado =
                await respuesta.json();


            if (
                !respuesta.ok ||
                !resultado.success
            ) {

                throw new Error(
                    resultado.error ||
                    "No se pudo crear la categoría."
                );

            }


            const nuevaCategoria =
                resultado.category;


            if (
                !nuevaCategoria
            ) {

                throw new Error(
                    "La API no devolvió la categoría creada."
                );

            }


            categoriasDisponibles.push(
                nuevaCategoria
            );


            categoriasDisponibles.sort(
                (
                    a,
                    b
                ) =>
                    Number(
                        a.sort_order
                    ) -
                    Number(
                        b.sort_order
                    )
            );


            const nombreCategoria =
                String(
                    nuevaCategoria.name
                )
                    .trim()
                    .toUpperCase();


            renderizarSelectorCategorias(
                [
                    nombreCategoria
                ]
            );


            selector.value =
                nombreCategoria;


            selector.dataset.previousValue =
                nombreCategoria;


            modal.hidden =
                true;


            document.body.classList.remove(
                "category-modal-open"
            );


            campo.value =
                "";


            mensaje.hidden =
                true;


            mostrarMensajeAdmin(
                `Categoría "${nombreCategoria}" creada correctamente.`,
                "success"
            );


        } catch (
            error
        ) {

            console.error(
                "Error al crear categoría:",
                error
            );


            mostrarError(
                error.message ||
                "No se pudo crear la categoría."
            );


        } finally {

            botonCrear.disabled =
                false;


            if (
                botonCancelar
            ) {

                botonCancelar.disabled =
                    false;

            }


            if (
                botonCerrar
            ) {

                botonCerrar.disabled =
                    false;

            }


            botonCrear.textContent =
                "Crear categoría";

        }

    }


    function mostrarError(
        texto
    ) {

        mensaje.textContent =
            texto;


        mensaje.className =
            "category-modal__message category-modal__message--error";


        mensaje.hidden =
            false;

    }

}


/* =========================================================
   OBTENER CATEGORÍA SELECCIONADA
========================================================= */

function obtenerCategoriasSeleccionadas() {

    const selector =
        document.getElementById(
            "categorias-selector"
        );


    if (
        !selector
    ) {

        return [];

    }


    const valor =
        String(
            selector.value || ""
        )
            .trim()
            .toUpperCase();


    if (
        valor === "" ||
        valor ===
            "__NUEVA_CATEGORIA__"
    ) {

        return [];

    }


    return [
        valor
    ];

}


/* =========================================================
   ABRIR FORMULARIO NUEVO
========================================================= */

function abrirFormularioNuevo() {

    modoFormulario =
        "nuevo";


    limpiarFormulario();


    renderizarSelectorCategorias(
        []
    );


    document.getElementById(
        "titulo-formulario"
    ).textContent =
        "Nuevo microdrama";


    document.getElementById(
        "descripcion-formulario"
    ).textContent =
        "Completa los datos del microdrama que deseas registrar.";


    document.getElementById(
        "boton-guardar"
    ).textContent =
        "Guardar microdrama";


    document.getElementById(
        "formulario-nuevo"
    ).hidden =
        false;


    document.getElementById(
        "boton-nuevo"
    ).disabled =
        true;


    establecerDescripcionAutomatica();


    document.getElementById(
        "title"
    ).focus();

}


/* =========================================================
   ABRIR FORMULARIO EDICIÓN
========================================================= */

function abrirFormularioEdicion(
    drama
) {

    modoFormulario =
        "editar";


    limpiarFormulario();


    renderizarSelectorCategorias(
        Array.isArray(
            drama.categories
        )
            ? drama.categories
            : []
    );


    document.getElementById(
        "titulo-formulario"
    ).textContent =
        "Editar microdrama";


    document.getElementById(
        "descripcion-formulario"
    ).textContent =
        "Modifica los datos que deseas actualizar.";


    document.getElementById(
        "boton-guardar"
    ).textContent =
        "Guardar cambios";


    document.getElementById(
        "drama-id"
    ).value =
        drama.id;


    document.getElementById(
        "title"
    ).value =
        drama.title || "";


    document.getElementById(
        "slug"
    ).value =
        drama.slug || "";


    document.getElementById(
        "video_description"
    ).value =
        drama.video_description || "";


    document.getElementById(
        "cover_url"
    ).value =
        drama.cover_url || "";


    document.getElementById(
        "video_url"
    ).value =
        drama.video_url || "";


    document.getElementById(
        "status"
    ).value =
        drama.status || "published";


    document.getElementById(
        "featured"
    ).checked =
        drama.featured === true ||
        drama.featured === 1 ||
        drama.featured === "1";


    establecerDescripcionAutomatica();


    establecerPlataformaEdicion(
        drama.platform || ""
    );


    document.getElementById(
        "formulario-nuevo"
    ).hidden =
        false;


    document.getElementById(
        "boton-nuevo"
    ).disabled =
        true;


    window.scrollTo(
        {
            top: 0,
            behavior: "smooth"
        }
    );


    document.getElementById(
        "title"
    ).focus();

}


/* =========================================================
   PLATAFORMA EN EDICIÓN
========================================================= */

function establecerPlataformaEdicion(
    plataforma
) {

    const select =
        document.getElementById(
            "platform"
        );


    if (
        !select
    ) {

        return;

    }


    const valor =
        String(
            plataforma || ""
        )
            .trim();


    if (
        valor === ""
    ) {

        select.value =
            "";


        select.dataset.previousValue =
            "";

        return;

    }


    /*
     * Buscar plataforma existente.
     */

    let opcion =
        Array.from(
            select.options
        ).find(
            elemento =>
                String(
                    elemento.value
                )
                    .trim()
                    .toLowerCase() ===
                valor.toLowerCase()
        );


    /*
     * Si no existe, crearla temporalmente.
     *
     * Esto permite editar microdramas antiguos
     * que tengan una plataforma personalizada.
     */

    if (
        !opcion
    ) {

        opcion =
            document.createElement(
                "option"
            );


        opcion.value =
            valor;


        opcion.textContent =
            valor;


        const opcionNueva =
            select.querySelector(
                'option[value="__NUEVA_PLATAFORMA__"]'
            );


        if (
            opcionNueva
        ) {

            select.insertBefore(
                opcion,
                opcionNueva
            );

        } else {

            select.appendChild(
                opcion
            );

        }

    }


    select.value =
        valor;


    select.dataset.previousValue =
        valor;

}


/* =========================================================
   CAMBIO DE PLATAFORMA
========================================================= */

function manejarCambioPlataforma(
    evento
) {

    const select =
        evento.target;


    const valor =
        select.value;


    if (
        valor ===
        "__NUEVA_PLATAFORMA__"
    ) {

        abrirModalNuevaPlataforma();

        return;

    }


    select.dataset.previousValue =
        valor;

}


/* =========================================================
   OBTENER PLATAFORMA FINAL
========================================================= */

function obtenerPlataformaFinal() {

    const select =
        document.getElementById(
            "platform"
        );


    if (
        !select
    ) {

        return "";

    }


    const valor =
        String(
            select.value || ""
        )
            .trim();


    if (
        valor ===
        "__NUEVA_PLATAFORMA__"
    ) {

        return "";

    }


    return valor;

}


/* =========================================================
   INICIALIZAR NUEVA PLATAFORMA
========================================================= */

function inicializarNuevaPlataforma() {

    const selector =
        document.getElementById(
            "platform"
        );


    const modal =
        document.getElementById(
            "modal-nueva-plataforma"
        );


    const campo =
        document.getElementById(
            "nueva-plataforma-modal"
        );


    const botonCrear =
        document.getElementById(
            "boton-crear-plataforma"
        );


    const botonCancelar =
        document.getElementById(
            "boton-cancelar-categoria-plataforma"
        );


    const botonCerrar =
        document.getElementById(
            "boton-cerrar-modal-plataforma"
        );


    const backdrop =
        document.getElementById(
            "platform-modal-backdrop"
        );


    const mensaje =
        document.getElementById(
            "mensaje-nueva-plataforma"
        );


    if (
        !selector ||
        !modal ||
        !campo ||
        !botonCrear
    ) {

        return;

    }


    selector.addEventListener(
        "change",
        manejarCambioPlataforma
    );


    botonCrear.addEventListener(
        "click",
        usarNuevaPlataforma
    );


    if (
        botonCancelar
    ) {

        botonCancelar.addEventListener(
            "click",
            cerrarModalNuevaPlataforma
        );

    }


    if (
        botonCerrar
    ) {

        botonCerrar.addEventListener(
            "click",
            cerrarModalNuevaPlataforma
        );

    }


    if (
        backdrop
    ) {

        backdrop.addEventListener(
            "click",
            cerrarModalNuevaPlataforma
        );

    }


    campo.addEventListener(
        "keydown",
        evento => {

            if (
                evento.key ===
                "Enter"
            ) {

                evento.preventDefault();

                usarNuevaPlataforma();

            }


            if (
                evento.key ===
                "Escape"
            ) {

                evento.preventDefault();

                cerrarModalNuevaPlataforma();

            }

        }
    );


    function abrirModalNuevaPlataforma() {

        campo.value =
            "";


        mensaje.hidden =
            true;


        mensaje.textContent =
            "";


        modal.hidden =
            false;


        document.body.classList.add(
            "category-modal-open"
        );


        setTimeout(
            () => {

                campo.focus();

            },
            50
        );

    }


    function cerrarModalNuevaPlataforma() {

        modal.hidden =
            true;


        document.body.classList.remove(
            "category-modal-open"
        );


        selector.value =
            selector.dataset.previousValue ||
            "";


        campo.value =
            "";


        mensaje.hidden =
            true;


        mensaje.textContent =
            "";

    }


    function usarNuevaPlataforma() {

        const nombre =
            campo.value
                .trim()
                .replace(
                    /\s+/g,
                    " "
                );


        if (
            !nombre
        ) {

            mostrarErrorPlataforma(
                "Escribe el nombre de la plataforma."
            );

            campo.focus();

            return;

        }


        if (
            nombre.length <
            2
        ) {

            mostrarErrorPlataforma(
                "El nombre de la plataforma es demasiado corto."
            );

            campo.focus();

            return;

        }


        /*
         * Buscar si ya existe.
         */

        let opcion =
            Array.from(
                selector.options
            ).find(
                elemento =>
                    String(
                        elemento.value
                    )
                        .trim()
                        .toLowerCase() ===
                    nombre.toLowerCase()
            );


        /*
         * Si no existe, crear opción.
         */

        if (
            !opcion
        ) {

            opcion =
                document.createElement(
                    "option"
                );


            opcion.value =
                nombre;


            opcion.textContent =
                nombre;


            const opcionNueva =
                selector.querySelector(
                    'option[value="__NUEVA_PLATAFORMA__"]'
                );


            if (
                opcionNueva
            ) {

                selector.insertBefore(
                    opcion,
                    opcionNueva
                );

            } else {

                selector.appendChild(
                    opcion
                );

            }

        }


        /*
         * Seleccionar nueva plataforma.
         */

        selector.value =
            opcion.value;


        selector.dataset.previousValue =
            opcion.value;


        /*
         * Cerrar modal.
         */

        modal.hidden =
            true;


        document.body.classList.remove(
            "category-modal-open"
        );


        campo.value =
            "";


        mensaje.hidden =
            true;


        mensaje.textContent =
            "";

    }


    function mostrarErrorPlataforma(
        texto
    ) {

        mensaje.textContent =
            texto;


        mensaje.className =
            "category-modal__message category-modal__message--error";


        mensaje.hidden =
            false;

    }


    window.abrirModalNuevaPlataforma =
        abrirModalNuevaPlataforma;

}


/* =========================================================
   GENERAR SLUG
========================================================= */

function generarSlug(
    texto
) {

    if (
        typeof texto !==
        "string"
    ) {

        return "";

    }


    return texto

        .normalize(
            "NFD"
        )

        .replace(
            /[\u0300-\u036f]/g,
            ""
        )

        .toLowerCase()

        .replace(
            /&/g,
            " y "
        )

        .replace(
            /[^a-z0-9]+/g,
            "-"
        )

        .replace(
            /^-+/,
            ""
        )

        .replace(
            /-+$/g,
            ""
        )

        .slice(
            0,
            200
        )

        .replace(
            /-+$/g,
            ""
        );

}


/* =========================================================
   DESCRIPCIÓN AUTOMÁTICA
========================================================= */

function establecerDescripcionAutomatica() {

    const campo =
        document.getElementById(
            "description"
        );


    if (
        campo
    ) {

        campo.value =
            DESCRIPCION_AUTOMATICA;

    }

}


/* =========================================================
   GUARDAR
========================================================= */

async function guardarFormulario(
    evento
) {

    evento.preventDefault();


    const boton =
        document.getElementById(
            "boton-guardar"
        );


    const plataforma =
        obtenerPlataformaFinal();


    if (
        !plataforma
    ) {

        mostrarMensajeAdmin(
            "Debes seleccionar una plataforma.",
            "error"
        );

        return;

    }


    const titulo =
        document.getElementById(
            "title"
        ).value.trim();


    if (
        !titulo
    ) {

        mostrarMensajeAdmin(
            "El título es obligatorio.",
            "error"
        );

        return;

    }


    const categorias =
        obtenerCategoriasSeleccionadas();


    if (
        categorias.length !==
        1
    ) {

        mostrarMensajeAdmin(
            "Debes seleccionar una categoría para el microdrama.",
            "error"
        );

        return;

    }


    const slug =
        generarSlug(
            titulo
        );


    if (
        !slug
    ) {

        mostrarMensajeAdmin(
            "No se pudo generar un slug válido a partir del título.",
            "error"
        );

        return;

    }


    document.getElementById(
        "slug"
    ).value =
        slug;


    const datos = {

        title:
            titulo,

        slug:
            slug,

        platform:
            plataforma,

        description:
            DESCRIPCION_AUTOMATICA,

        video_description:
            document.getElementById(
                "video_description"
            ).value.trim(),

        cover_url:
            document.getElementById(
                "cover_url"
            ).value.trim(),

        video_url:
            document.getElementById(
                "video_url"
            ).value.trim(),

        status:
            document.getElementById(
                "status"
            ).value,

        featured:
            document.getElementById(
                "featured"
            ).checked,

        categories:
            categorias

    };


    if (
        modoFormulario ===
        "editar"
    ) {

        datos.id =
            Number(
                document.getElementById(
                    "drama-id"
                ).value
            );

    }


    boton.disabled =
        true;


    boton.textContent =
        modoFormulario ===
            "editar"
            ? "Guardando cambios..."
            : "Guardando...";


    try {

        const respuesta =
            await fetch(
                API_ADMIN_DRAMAS,
                {

                    method:
                        modoFormulario ===
                            "editar"
                            ? "PUT"
                            : "POST",

                    credentials:
                        "same-origin",

                    headers: {

                        "Content-Type":
                            "application/json",

                        "Accept":
                            "application/json"

                    },

                    body:
                        JSON.stringify(
                            datos
                        )

                }
            );


        let resultado;


        try {

            resultado =
                await respuesta.json();

        } catch {

            throw new Error(
                "El servidor devolvió una respuesta inválida."
            );

        }


        if (
            !respuesta.ok ||
            !resultado.success
        ) {

            throw new Error(
                resultado.error ||
                "No se pudo guardar el microdrama."
            );

        }


        cerrarFormulario();


        await cargarDramasAdministrativos();


        mostrarMensajeAdmin(
            modoFormulario ===
                "editar"
                ? "Microdrama actualizado correctamente."
                : "Microdrama guardado correctamente.",
            "success"
        );


    } catch (
        error
    ) {

        console.error(
            "Error al guardar microdrama:",
            error
        );


        mostrarMensajeAdmin(
            error.message ||
            "No se pudo guardar el microdrama.",
            "error"
        );


    } finally {

        boton.disabled =
            false;


        boton.textContent =
            modoFormulario ===
                "editar"
                ? "Guardar cambios"
                : "Guardar microdrama";

    }

}


/* =========================================================
   CERRAR FORMULARIO
========================================================= */

function cerrarFormulario() {

    document.getElementById(
        "formulario-nuevo"
    ).hidden =
        true;


    document.getElementById(
        "boton-nuevo"
    ).disabled =
        false;


    limpiarFormulario();

}


/* =========================================================
   LIMPIAR FORMULARIO
========================================================= */

function limpiarFormulario() {

    const formulario =
        document.getElementById(
            "form-nuevo-drama"
        );


    if (
        formulario
    ) {

        formulario.reset();

    }


    const dramaId =
        document.getElementById(
            "drama-id"
        );


    if (
        dramaId
    ) {

        dramaId.value =
            "";

    }


    establecerDescripcionAutomatica();


    const plataforma =
        document.getElementById(
            "platform"
        );


    if (
        plataforma
    ) {

        plataforma.value =
            "";


        plataforma.dataset.previousValue =
            "";

    }


    const status =
        document.getElementById(
            "status"
        );


    if (
        status
    ) {

        status.value =
            "draft";

    }


    renderizarSelectorCategorias(
        []
    );

}


/* =========================================================
   SELECCIÓN MÚLTIPLE DE REGISTROS
========================================================= */

function inicializarSeleccionMultiple() {

    const seleccionarTodos =
        document.getElementById(
            "seleccionar-todos"
        );


    const botonEliminar =
        document.getElementById(
            "boton-eliminar-seleccionados"
        );


    if (
        !seleccionarTodos ||
        !botonEliminar
    ) {

        return;

    }


    seleccionarTodos.addEventListener(
        "change",
        () => {

            const casillas =
                document.querySelectorAll(
                    ".drama-checkbox"
                );


            casillas.forEach(
                casilla => {

                    casilla.checked =
                        seleccionarTodos.checked;

                }
            );


            actualizarEstadoSeleccion();

        }
    );


    botonEliminar.addEventListener(
        "click",
        eliminarSeleccionados
    );

}


/* =========================================================
   ACTUALIZAR SELECCIÓN
========================================================= */

function actualizarEstadoSeleccion() {

    const casillas =
        Array.from(
            document.querySelectorAll(
                ".drama-checkbox"
            )
        );


    const seleccionadas =
        casillas.filter(
            casilla =>
                casilla.checked
        );


    const botonEliminar =
        document.getElementById(
            "boton-eliminar-seleccionados"
        );


    if (
        botonEliminar
    ) {

        botonEliminar.disabled =
            seleccionadas.length ===
            0;


        botonEliminar.textContent =
            seleccionadas.length > 0
                ? `Eliminar seleccionados (${seleccionadas.length})`
                : "Eliminar seleccionados";

    }


    const seleccionarTodos =
        document.getElementById(
            "seleccionar-todos"
        );


    if (
        seleccionarTodos
    ) {

        seleccionarTodos.checked =
            casillas.length > 0 &&
            seleccionadas.length ===
                casillas.length;


        seleccionarTodos.indeterminate =
            seleccionadas.length > 0 &&
            seleccionadas.length <
                casillas.length;

    }

}


/* =========================================================
   IDS SELECCIONADOS
========================================================= */

function obtenerIdsSeleccionados() {

    return Array.from(
        document.querySelectorAll(
            ".drama-checkbox:checked"
        )
    )
        .map(
            casilla =>
                Number(
                    casilla.value
                )
        )
        .filter(
            id =>
                Number.isInteger(
                    id
                ) &&
                id > 0
        );

}


/* =========================================================
   ELIMINAR SELECCIONADOS
========================================================= */

async function eliminarSeleccionados() {

    const ids =
        obtenerIdsSeleccionados();


    if (
        ids.length ===
        0
    ) {

        return;

    }


    const mensaje =
        ids.length ===
            1
            ? "¿Seguro que deseas eliminar este microdrama?"
            : `¿Seguro que deseas eliminar los ${ids.length} microdramas seleccionados?`;


    const confirmado =
        window.confirm(
            `${mensaje}\n\nEsta acción no se puede deshacer.`
        );


    if (
        !confirmado
    ) {

        return;

    }


    const boton =
        document.getElementById(
            "boton-eliminar-seleccionados"
        );


    boton.disabled =
        true;


    boton.textContent =
        "Eliminando...";


    try {

        const respuesta =
            await fetch(
                API_ADMIN_DRAMAS,
                {

                    method:
                        "DELETE",

                    credentials:
                        "same-origin",

                    headers: {

                        "Content-Type":
                            "application/json",

                        "Accept":
                            "application/json"

                    },

                    body:
                        JSON.stringify({
                            ids
                        })

                }
            );


        const resultado =
            await respuesta.json();


        if (
            !respuesta.ok ||
            !resultado.success
        ) {

            throw new Error(
                resultado.error ||
                "No se pudieron eliminar los microdramas."
            );

        }


        await cargarDramasAdministrativos();


        mostrarMensajeAdmin(
            resultado.message ||
            "Microdramas eliminados correctamente.",
            "success"
        );


    } catch (
        error
    ) {

        console.error(
            "Error al eliminar:",
            error
        );


        mostrarMensajeAdmin(
            error.message ||
            "No se pudieron eliminar los microdramas.",
            "error"
        );


    } finally {

        actualizarEstadoSeleccion();

    }

}


/* =========================================================
   INICIALIZAR BUSCADOR
========================================================= */

function inicializarBuscador() {

    const buscador =
        document.getElementById(
            "buscador-dramas"
        );


    const botonLimpiar =
        document.getElementById(
            "boton-limpiar-busqueda"
        );


    if (
        !buscador ||
        !botonLimpiar
    ) {

        return;

    }


    buscador.addEventListener(
        "input",
        () => {

            textoBusqueda =
                buscador.value.trim();


            botonLimpiar.hidden =
                textoBusqueda ===
                "";


            aplicarFiltroDramas();

        }
    );


    botonLimpiar.addEventListener(
        "click",
        () => {

            buscador.value =
                "";


            textoBusqueda =
                "";


            botonLimpiar.hidden =
                true;


            buscador.focus();


            aplicarFiltroDramas();

        }
    );

}


/* =========================================================
   OBTENER CATEGORÍA DEL DRAMA
========================================================= */

function obtenerCategoriaDramaAdmin(
    drama
) {

    if (
        !drama
    ) {

        return "Sin categoría";

    }


    let categorias =
        drama.categories;


    if (
        typeof categorias ===
            "string" &&
        categorias.trim() !==
            ""
    ) {

        try {

            categorias =
                JSON.parse(
                    categorias
                );

        } catch {

            categorias =
                [];

        }

    }


    if (
        Array.isArray(
            categorias
        ) &&
        categorias.length > 0
    ) {

        const nombre =
            String(
                categorias[0] ||
                ""
            )
                .trim()
                .toUpperCase();


        if (
            nombre !==
            ""
        ) {

            return nombre;

        }

    }


    return "Sin categoría";

}


/* =========================================================
   APLICAR FILTRO
========================================================= */

function aplicarFiltroDramas() {

    const elementos =
        obtenerElementos();


    if (
        !elementos
    ) {

        return;

    }


    const resultadoBusqueda =
        document.getElementById(
            "resultado-busqueda"
        );


    if (
        textoBusqueda ===
        ""
    ) {

        renderizarDramas(
            dramasActuales,
            elementos
        );


        if (
            resultadoBusqueda
        ) {

            resultadoBusqueda.textContent =
                `${dramasActuales.length} microdrama${
                    dramasActuales.length ===
                    1
                        ? ""
                        : "s"
                }`;

        }


        actualizarEstadoSeleccion();

        return;

    }


    const busqueda =
        normalizarTextoBusqueda(
            textoBusqueda
        );


    const dramasFiltrados =
        dramasActuales.filter(
            drama => {

                const id =
                    normalizarTextoBusqueda(
                        drama.id
                    );


                const titulo =
                    normalizarTextoBusqueda(
                        drama.title
                    );


                const plataforma =
                    normalizarTextoBusqueda(
                        drama.platform
                    );


                const categoria =
                    normalizarTextoBusqueda(
                        obtenerCategoriaDramaAdmin(
                            drama
                        )
                    );


                return (
                    id.includes(
                        busqueda
                    ) ||
                    titulo.includes(
                        busqueda
                    ) ||
                    plataforma.includes(
                        busqueda
                    ) ||
                    categoria.includes(
                        busqueda
                    )
                );

            }
        );


    renderizarDramas(
        dramasFiltrados,
        elementos
    );


    if (
        resultadoBusqueda
    ) {

        resultadoBusqueda.textContent =
            dramasFiltrados.length ===
            0
                ? "No se encontraron microdramas que coincidan con la búsqueda."
                : `Mostrando ${
                    dramasFiltrados.length
                } de ${
                    dramasActuales.length
                } microdrama${
                    dramasActuales.length ===
                    1
                        ? ""
                        : "s"
                }.`;

    }


    actualizarEstadoSeleccion();

}


/* =========================================================
   NORMALIZAR BÚSQUEDA
========================================================= */

function normalizarTextoBusqueda(
    valor
) {

    return String(
        valor ?? ""
    )
        .normalize(
            "NFD"
        )
        .replace(
            /[\u0300-\u036f]/g,
            ""
        )
        .toLowerCase()
        .trim();

}


/* =========================================================
   CARGAR DRAMAS
========================================================= */

async function cargarDramasAdministrativos() {

    const elementos =
        obtenerElementos();


    if (
        !elementos
    ) {

        return;

    }


    mostrarEstadoCarga(
        elementos
    );


    try {

        const respuesta =
            await fetch(
                API_ADMIN_DRAMAS,
                {

                    method:
                        "GET",

                    credentials:
                        "same-origin",

                    headers: {
                        "Accept":
                            "application/json"
                    },

                    cache:
                        "no-store"

                }
            );


        if (
            !respuesta.ok
        ) {

            throw new Error(
                `La API respondió con el estado ${respuesta.status}.`
            );

        }


        const datos =
            await respuesta.json();


        if (
            !datos.success ||
            !Array.isArray(
                datos.dramas
            )
        ) {

            throw new Error(
                "La API administrativa devolvió una respuesta no válida."
            );

        }


        dramasActuales =
            datos.dramas;


        aplicarFiltroDramas();


        actualizarEstadoSeleccion();


    } catch (
        error
    ) {

        console.error(
            "Error al cargar microdramas:",
            error
        );


        mostrarError(
            elementos,
            error.message ||
            "No se pudieron cargar los microdramas."
        );

    }

}


/* =========================================================
   OBTENER ELEMENTOS
========================================================= */

function obtenerElementos() {

    const elementos = {

        estadoCarga:
            document.getElementById(
                "estado-carga"
            ),

        estadoVacio:
            document.getElementById(
                "estado-vacio"
            ),

        contenedorTabla:
            document.getElementById(
                "contenedor-tabla"
            ),

        listaDramas:
            document.getElementById(
                "lista-dramas"
            ),

        mensajeAdmin:
            document.getElementById(
                "mensaje-admin"
            )

    };


    const faltante =
        Object.entries(
            elementos
        ).find(
            ([, elemento]) =>
                !elemento
        );


    if (
        faltante
    ) {

        console.error(
            `Falta el elemento administrativo: ${faltante[0]}`
        );


        return null;

    }


    return elementos;

}


/* =========================================================
   ESTADO DE CARGA
========================================================= */

function mostrarEstadoCarga(
    elementos
) {

    elementos.estadoCarga.hidden =
        false;


    elementos.estadoVacio.hidden =
        true;


    elementos.contenedorTabla.hidden =
        true;


    elementos.listaDramas.replaceChildren();


    const contenedorBusqueda =
        document.getElementById(
            "contenedor-busqueda"
        );


    if (
        contenedorBusqueda
    ) {

        contenedorBusqueda.hidden =
            true;

    }

}


/* =========================================================
   RENDERIZAR DRAMAS
========================================================= */

function renderizarDramas(
    dramas,
    elementos
) {

    elementos.estadoCarga.hidden =
        true;


    elementos.listaDramas.replaceChildren();


    const contenedorBusqueda =
        document.getElementById(
            "contenedor-busqueda"
        );


    if (
        contenedorBusqueda
    ) {

        contenedorBusqueda.hidden =
            dramasActuales.length ===
            0;

    }


    if (
        dramas.length ===
        0
    ) {

        elementos.contenedorTabla.hidden =
            true;


        elementos.estadoVacio.hidden =
            false;


        elementos.estadoVacio.textContent =
            textoBusqueda ===
                ""
                ? "No hay microdramas registrados."
                : "No se encontraron microdramas que coincidan con la búsqueda.";


        return;

    }


    elementos.estadoVacio.hidden =
        true;


    const fragmento =
        document.createDocumentFragment();


    dramas.forEach(
        drama => {

            fragmento.appendChild(
                crearFilaDrama(
                    drama
                )
            );

        }
    );


    elementos.listaDramas.appendChild(
        fragmento
    );


    elementos.contenedorTabla.hidden =
        false;

}


/* =========================================================
   CREAR FILA
========================================================= */

function crearFilaDrama(
    drama
) {

    const fila =
        document.createElement(
            "tr"
        );


    fila.className =
        "drama-row-clickable";


    fila.title =
        "Haz clic para editar este microdrama";


    const celdaSeleccion =
        document.createElement(
            "td"
        );


    const casilla =
        document.createElement(
            "input"
        );


    casilla.type =
        "checkbox";


    casilla.className =
        "drama-checkbox";


    casilla.value =
        drama.id;


    casilla.title =
        "Seleccionar microdrama";


    casilla.addEventListener(
        "click",
        evento => {

            evento.stopPropagation();

        }
    );


    casilla.addEventListener(
        "change",
        actualizarEstadoSeleccion
    );


    celdaSeleccion.appendChild(
        casilla
    );


    fila.appendChild(
        celdaSeleccion
    );


    fila.appendChild(
        crearCelda(
            normalizarTexto(
                drama.id,
                "—"
            )
        )
    );


    fila.appendChild(
        crearCeldaInformacionDrama(
            drama
        )
    );


    fila.appendChild(
        crearCelda(
            normalizarTexto(
                drama.platform,
                "—"
            )
        )
    );


    /* =====================================================
       CATEGORÍA
    ===================================================== */

    fila.appendChild(
        crearCelda(
            obtenerCategoriaDramaAdmin(
                drama
            )
        )
    );


    fila.appendChild(
        crearCeldaEstado(
            drama.status
        )
    );


    fila.appendChild(
        crearCeldaDestacado(
            drama.featured
        )
    );


    /*
     * ORDEN
     *
     * Se mantiene únicamente en la tabla.
     * Ya no existe como campo editable del formulario.
     */

    fila.appendChild(
        crearCelda(
            normalizarTexto(
                drama.sort_order,
                "—"
            )
        )
    );


    fila.appendChild(
        crearCelda(
            formatearFecha(
                drama.updated_at
            )
        )
    );


    const celdaAcciones =
        document.createElement(
            "td"
        );


    const botonEditar =
        document.createElement(
            "button"
        );


    botonEditar.type =
        "button";


    botonEditar.className =
        "button button--edit";


    botonEditar.textContent =
        "Editar";


    botonEditar.addEventListener(
        "click",
        evento => {

            evento.stopPropagation();


            abrirFormularioEdicion(
                drama
            );

        }
    );


    celdaAcciones.appendChild(
        botonEditar
    );


    fila.appendChild(
        celdaAcciones
    );


    fila.addEventListener(
        "click",
        () => {

            abrirFormularioEdicion(
                drama
            );

        }
    );


    return fila;

}


/* =========================================================
   CELDA SIMPLE
========================================================= */

function crearCelda(
    contenido
) {

    const celda =
        document.createElement(
            "td"
        );


    celda.textContent =
        contenido;


    return celda;

}


/* =========================================================
   INFORMACIÓN DEL DRAMA
========================================================= */

function crearCeldaInformacionDrama(
    drama
) {

    const celda =
        document.createElement(
            "td"
        );


    const contenedor =
        document.createElement(
            "div"
        );


    contenedor.className =
        "drama-info";


    const portada =
        document.createElement(
            "img"
        );


    portada.className =
        "drama-cover";


    portada.src =
        obtenerRutaPortada(
            drama.cover_url
        );


    portada.alt =
        `Portada de ${normalizarTexto(
            drama.title,
            "microdrama"
        )}`;


    portada.loading =
        "lazy";


    portada.width =
        48;


    portada.height =
        72;


    portada.addEventListener(
        "error",
        () => {

            portada.hidden =
                true;

        },
        {
            once:
                true
        }
    );


    const textos =
        document.createElement(
            "div"
        );


    const titulo =
        document.createElement(
            "p"
        );


    titulo.className =
        "drama-title";


    titulo.textContent =
        normalizarTexto(
            drama.title,
            "Sin título"
        );


    const slug =
        document.createElement(
            "p"
        );


    slug.className =
        "drama-slug";


    slug.textContent =
        normalizarTexto(
            drama.slug,
            "Sin slug"
        );


    slug.title =
        slug.textContent;


    textos.appendChild(
        titulo
    );


    textos.appendChild(
        slug
    );


    contenedor.appendChild(
        portada
    );


    contenedor.appendChild(
        textos
    );


    celda.appendChild(
        contenedor
    );


    return celda;

}


/* =========================================================
   ESTADO
========================================================= */

function crearCeldaEstado(
    valor
) {

    const celda =
        document.createElement(
            "td"
        );


    const indicador =
        document.createElement(
            "span"
        );


    const estado =
        normalizarTexto(
            valor,
            "draft"
        ).toLowerCase();


    indicador.className =
        "status-badge";


    if (
        estado ===
        "published"
    ) {

        indicador.classList.add(
            "status-badge--published"
        );


        indicador.textContent =
            "Publicado";

    } else {

        indicador.classList.add(
            "status-badge--draft"
        );


        indicador.textContent =
            "Borrador";

    }


    celda.appendChild(
        indicador
    );


    return celda;

}


/* =========================================================
   DESTACADO
========================================================= */

function crearCeldaDestacado(
    valor
) {

    const celda =
        document.createElement(
            "td"
        );


    const destacado =
        valor === true ||
        valor === 1 ||
        valor === "1";


    celda.className =
        destacado
            ? "feature-value feature-value--yes"
            : "feature-value feature-value--no";


    celda.textContent =
        destacado
            ? "Sí"
            : "No";


    return celda;

}


/* =========================================================
   PORTADA
========================================================= */

function obtenerRutaPortada(
    coverUrl
) {

    return normalizarTexto(
        coverUrl,
        ""
    ).trim();

}


/* =========================================================
   NORMALIZAR TEXTO
========================================================= */

function normalizarTexto(
    valor,
    valorPorDefecto
) {

    if (
        valor === null ||
        valor === undefined ||
        valor === ""
    ) {

        return valorPorDefecto;

    }


    return String(
        valor
    );

}


/* =========================================================
   FECHA
========================================================= */

function formatearFecha(
    fechaOriginal
) {

    if (
        !fechaOriginal
    ) {

        return "—";

    }


    const fecha =
        new Date(
            fechaOriginal
        );


    if (
        Number.isNaN(
            fecha.getTime()
        )
    ) {

        return String(
            fechaOriginal
        );

    }


    return new Intl.DateTimeFormat(
        "es-PA",
        {
            dateStyle:
                "short",

            timeStyle:
                "short"
        }
    ).format(
        fecha
    );

}


/* =========================================================
   MENSAJE ADMIN
========================================================= */

function mostrarMensajeAdmin(
    mensaje,
    tipo
) {

    const elemento =
        document.getElementById(
            "mensaje-admin"
        );


    if (
        !elemento
    ) {

        return;

    }


    elemento.textContent =
        mensaje;


    elemento.className =
        tipo ===
            "success"
            ? "admin-message admin-message--success"
            : "admin-message admin-message--error";


    elemento.hidden =
        false;

}


/* =========================================================
   ERROR
========================================================= */

function mostrarError(
    elementos,
    mensaje
) {

    elementos.estadoCarga.hidden =
        true;


    elementos.estadoVacio.hidden =
        true;


    elementos.contenedorTabla.hidden =
        true;


    const contenedorBusqueda =
        document.getElementById(
            "contenedor-busqueda"
        );


    if (
        contenedorBusqueda
    ) {

        contenedorBusqueda.hidden =
            true;

    }


    mostrarMensajeAdmin(
        mensaje,
        "error"
    );

}
