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


/*
 * Mantiene en memoria los registros cargados.
 * Sirve para calcular visualmente el siguiente orden
 * y para editar los registros existentes.
 */
let dramasActuales = [];


/*
 * Texto utilizado actualmente en el buscador.
 */
let textoBusqueda = "";


/*
 * Indica si el formulario está creando o editando.
 */
let modoFormulario = "nuevo";


/* =========================================================
   INICIO
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        inicializarFormulario();

        inicializarSeleccionMultiple();

        inicializarBuscador();

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


    botonNuevo.addEventListener(
        "click",
        abrirFormularioNuevo
    );


    botonCancelar.addEventListener(
        "click",
        cerrarFormulario
    );


    formulario.addEventListener(
        "submit",
        guardarFormulario
    );


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


    campoPlataforma.addEventListener(
        "change",
        manejarCambioPlataforma
    );


    /*
     * Estado inicial:
     * ninguna plataforma seleccionada,
     * por lo tanto se habilita el campo
     * de nueva plataforma.
     */

    manejarCambioPlataforma({
        target: campoPlataforma
    });
}


/* =========================================================
   CARGAR CATEGORÍAS
========================================================= */

async function cargarCategoriasAdministrativas() {

    const contenedor =
        document.getElementById(
            "categorias-selector"
        );


    if (
        !contenedor
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


        renderizarSelectorCategorias();


    } catch (error) {

        console.error(
            "Error al cargar categorías:",
            error
        );


        categoriasDisponibles =
            [];


        contenedor.innerHTML =
            `
            <div class="categories-error">
                No se pudieron cargar las categorías.
            </div>
            `;

    }

}


/* =========================================================
   RENDERIZAR SELECTOR DE CATEGORÍAS
========================================================= */

function renderizarSelectorCategorias(
    seleccionadas = []
) {

    const contenedor =
        document.getElementById(
            "categorias-selector"
        );


    if (
        !contenedor
    ) {

        return;
    }


    if (
        categoriasDisponibles.length === 0
    ) {

        contenedor.innerHTML =
            `
            <div class="categories-empty">
                No hay categorías activas disponibles.
            </div>
            `;

        return;
    }


    const seleccion =
        Array.isArray(
            seleccionadas
        )
            ? seleccionadas.map(
                categoria =>
                    String(
                        categoria
                    )
                        .trim()
                        .toUpperCase()
            )
            : [];


    contenedor.innerHTML =
        "";


    categoriasDisponibles.forEach(
        categoria => {

            const nombre =
                String(
                    categoria.name
                )
                    .trim()
                    .toUpperCase();


            const wrapper =
                document.createElement(
                    "label"
                );


            wrapper.className =
                "category-option";


            const checkbox =
                document.createElement(
                    "input"
                );


            checkbox.type =
                "checkbox";


            checkbox.className =
                "drama-category-checkbox";


            checkbox.value =
                nombre;


            checkbox.checked =
                seleccion.includes(
                    nombre
                );


            const texto =
                document.createElement(
                    "span"
                );


            texto.textContent =
                nombre;


            wrapper.appendChild(
                checkbox
            );


            wrapper.appendChild(
                texto
            );


            contenedor.appendChild(
                wrapper
            );

        }
    );

}


/* =========================================================
   OBTENER CATEGORÍAS SELECCIONADAS
========================================================= */

function obtenerCategoriasSeleccionadas() {

    const casillas =
        document.querySelectorAll(
            ".drama-category-checkbox:checked"
        );


    return Array.from(
        casillas
    ).map(
        casilla =>
            String(
                casilla.value
            )
                .trim()
                .toUpperCase()
    );

}

/* =========================================================
   ABRIR FORMULARIO NUEVO
========================================================= */

function abrirFormularioNuevo() {

    modoFormulario =
        "nuevo";


    limpiarFormulario();


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


    establecerSiguienteOrdenVisual();


    document.getElementById(
        "title"
    ).focus();
}


/* =========================================================
   ABRIR FORMULARIO DE EDICIÓN
========================================================= */

function abrirFormularioEdicion(
    drama
) {

    modoFormulario =
        "editar";


    limpiarFormulario();


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


    /*
     * NUEVA ESTRUCTURA:
     *
     * video_url es ahora la columna oficial
     * donde se almacenan los enlaces MEGA.
     *
     * video_url_2 NO se carga en el formulario
     * porque es una columna histórica/respaldo.
     */
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


    document.getElementById(
        "sort_order"
    ).value =
        drama.sort_order || "1";


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


    const campoNueva =
        document.getElementById(
            "nueva-plataforma"
        );


    const plataformaPredefinida =
        Array.from(
            select.options
        ).some(
            (opcion) =>
                opcion.value === plataforma
        );


    if (
        plataformaPredefinida
    ) {

        select.value =
            plataforma;


        campoNueva.value =
            "";


        desactivarNuevaPlataforma();


        return;
    }


    /*
     * Si no está en las opciones predefinidas,
     * significa que es una plataforma personalizada.
     */

    select.value =
        "";


    activarNuevaPlataforma(
        plataforma
    );
}


/* =========================================================
   CAMBIO DE PLATAFORMA
========================================================= */

function manejarCambioPlataforma(
    evento
) {

    const valor =
        evento.target.value;


    /*
     * Sin selección:
     * habilitar plataforma personalizada.
     */

    if (
        valor === ""
    ) {

        activarNuevaPlataforma();

        return;
    }


    /*
     * Plataforma predefinida:
     * bloquear campo personalizado.
     */

    desactivarNuevaPlataforma();
}


/* =========================================================
   ACTIVAR NUEVA PLATAFORMA
========================================================= */

function activarNuevaPlataforma(
    valorInicial = ""
) {

    const contenedor =
        document.getElementById(
            "nueva-plataforma-container"
        );


    const campo =
        document.getElementById(
            "nueva-plataforma"
        );


    contenedor.hidden =
        false;


    campo.disabled =
        false;


    campo.required =
        true;


    campo.placeholder =
        "Escribe el nombre de la plataforma";


    if (
        valorInicial !== ""
    ) {

        campo.value =
            valorInicial;

    }
}


/* =========================================================
   DESACTIVAR NUEVA PLATAFORMA
========================================================= */

function desactivarNuevaPlataforma() {

    const campo =
        document.getElementById(
            "nueva-plataforma"
        );


    campo.disabled =
        true;


    campo.required =
        false;


    campo.value =
        "";


    campo.placeholder =
        "Selecciona una plataforma predefinida";
}


/* =========================================================
   OBTENER PLATAFORMA FINAL
========================================================= */

function obtenerPlataformaFinal() {

    const select =
        document.getElementById(
            "platform"
        );


    const campoNueva =
        document.getElementById(
            "nueva-plataforma"
        );


    /*
     * Plataforma predefinida.
     */

    if (
        select.value !== ""
    ) {

        return select.value.trim();
    }


    /*
     * Plataforma personalizada.
     */

    return campoNueva.value.trim();
}


/* =========================================================
   GENERAR SLUG
========================================================= */

function generarSlug(
    texto
) {

    if (
        typeof texto !== "string"
    ) {

        return "";
    }


    return texto

        .normalize("NFD")

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

    document.getElementById(
        "description"
    ).value =
        DESCRIPCION_AUTOMATICA;
}


/* =========================================================
   ORDEN VISUAL
========================================================= */

function establecerSiguienteOrdenVisual() {

    if (
        !Array.isArray(
            dramasActuales
        )
    ) {

        document.getElementById(
            "sort_order"
        ).value =
            "1";

        return;
    }


    let mayor =
        0;


    dramasActuales.forEach(
        (drama) => {

            const orden =
                Number(
                    drama.sort_order
                );


            if (
                Number.isInteger(
                    orden
                ) &&
                orden > mayor
            ) {

                mayor =
                    orden;
            }

        }
    );


    document.getElementById(
        "sort_order"
    ).value =
        String(
            mayor + 1
        );
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
            "Debes seleccionar una plataforma o escribir una nueva plataforma.",
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


    /*
     * Actualizamos visualmente el campo.
     */

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


        /*
         * NUEVA ESTRUCTURA:
         *
         * Los enlaces MEGA nuevos se envían
         * exclusivamente como video_url.
         *
         * video_url_2 nunca se envía desde el
         * panel administrativo.
         */
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
            ).checked

    };


    /*
     * En edición necesitamos el ID.
     */

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


    } catch (error) {

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

    document.getElementById(
        "form-nuevo-drama"
    ).reset();


    document.getElementById(
        "drama-id"
    ).value =
        "";


    document.getElementById(
        "description"
    ).value =
        DESCRIPCION_AUTOMATICA;


    document.getElementById(
        "sort_order"
    ).value =
        "1";


    const campoNueva =
        document.getElementById(
            "nueva-plataforma"
        );


    campoNueva.disabled =
        false;


    campoNueva.required =
        true;


    campoNueva.value =
        "";


    campoNueva.placeholder =
        "Escribe el nombre de la plataforma";


    document.getElementById(
        "platform"
    ).value =
        "";


    document.getElementById(
        "status"
    ).value =
        "published";
}


/* =========================================================
   SELECCIÓN MÚLTIPLE
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


    seleccionarTodos.addEventListener(
        "change",
        () => {

            const casillas =
                document.querySelectorAll(
                    ".drama-checkbox"
                );


            casillas.forEach(
                (casilla) => {

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
            (casilla) =>
                casilla.checked
        );


    const botonEliminar =
        document.getElementById(
            "boton-eliminar-seleccionados"
        );


    botonEliminar.disabled =
        seleccionadas.length === 0;


    botonEliminar.textContent =
        seleccionadas.length > 0
            ? `Eliminar seleccionados (${seleccionadas.length})`
            : "Eliminar seleccionados";


    const seleccionarTodos =
        document.getElementById(
            "seleccionar-todos"
        );


    seleccionarTodos.checked =
        casillas.length > 0 &&
        seleccionadas.length ===
            casillas.length;


    seleccionarTodos.indeterminate =
        seleccionadas.length > 0 &&
        seleccionadas.length <
            casillas.length;
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
            (casilla) =>
                Number(
                    casilla.value
                )
        )
        .filter(
            (id) =>
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
        ids.length === 0
    ) {

        return;
    }


    const mensaje =
        ids.length === 1
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
                        JSON.stringify(
                            {
                                ids
                            }
                        )

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


    } catch (error) {

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

        console.error(
            "No se pudo inicializar el buscador de microdramas."
        );

        return;
    }


    buscador.addEventListener(
        "input",
        () => {

            textoBusqueda =
                buscador.value.trim();


            botonLimpiar.hidden =
                textoBusqueda === "";


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


    /*
     * Sin búsqueda:
     * mostrar todos los registros.
     */

    if (
        textoBusqueda === ""
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
                    dramasActuales.length === 1
                        ? ""
                        : "s"
                }`;

        }


        actualizarEstadoSeleccion();

        return;
    }


    /*
     * Normalizamos la búsqueda para ignorar:
     *
     * - Mayúsculas
     * - Minúsculas
     * - Acentos
     */

    const busqueda =
        normalizarTextoBusqueda(
            textoBusqueda
        );


    const dramasFiltrados =
        dramasActuales.filter(
            (drama) => {

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


                return (
                    id.includes(busqueda) ||
                    titulo.includes(busqueda) ||
                    plataforma.includes(busqueda)
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
            dramasFiltrados.length === 0
                ? "No se encontraron microdramas que coincidan con la búsqueda."
                : `Mostrando ${
                    dramasFiltrados.length
                } de ${
                    dramasActuales.length
                } microdrama${
                    dramasActuales.length === 1
                        ? ""
                        : "s"
                }.`;
    }


    actualizarEstadoSeleccion();
}


/* =========================================================
   NORMALIZAR TEXTO PARA BÚSQUEDA
========================================================= */

function normalizarTextoBusqueda(
    valor
) {

    return String(
        valor ?? ""
    )
        .normalize("NFD")
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


    } catch (error) {

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
   RENDERIZAR
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


    /*
     * La barra de búsqueda se muestra siempre
     * que existan microdramas cargados,
     * incluso cuando la búsqueda actual
     * no produce resultados.
     */

    if (
        contenedorBusqueda
    ) {

        contenedorBusqueda.hidden =
            dramasActuales.length === 0;
    }


    if (
        dramas.length === 0
    ) {

        elementos.contenedorTabla.hidden =
            true;


        elementos.estadoVacio.hidden =
            false;


        elementos.estadoVacio.textContent =
            textoBusqueda === ""
                ? "No hay microdramas registrados."
                : "No se encontraron microdramas que coincidan con la búsqueda.";


        return;
    }


    elementos.estadoVacio.hidden =
        true;


    elementos.estadoVacio.textContent =
        "No hay microdramas registrados.";


    const fragmento =
        document.createDocumentFragment();


    dramas.forEach(
        (drama) => {

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


    /* -----------------------------------------------------
       SELECCIÓN
    ----------------------------------------------------- */

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
        (evento) => {

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


    /* -----------------------------------------------------
       ID
    ----------------------------------------------------- */

    fila.appendChild(
        crearCelda(
            normalizarTexto(
                drama.id,
                "—"
            )
        )
    );


    /* -----------------------------------------------------
       MICRODRAMA
    ----------------------------------------------------- */

    fila.appendChild(
        crearCeldaInformacionDrama(
            drama
        )
    );


    /* -----------------------------------------------------
       PLATAFORMA
    ----------------------------------------------------- */

    fila.appendChild(
        crearCelda(
            normalizarTexto(
                drama.platform,
                "—"
            )
        )
    );


    /* -----------------------------------------------------
       ESTADO
    ----------------------------------------------------- */

    fila.appendChild(
        crearCeldaEstado(
            drama.status
        )
    );


    /* -----------------------------------------------------
       DESTACADO
    ----------------------------------------------------- */

    fila.appendChild(
        crearCeldaDestacado(
            drama.featured
        )
    );


    /* -----------------------------------------------------
       ORDEN
    ----------------------------------------------------- */

    fila.appendChild(
        crearCelda(
            normalizarTexto(
                drama.sort_order,
                "—"
            )
        )
    );


    /* -----------------------------------------------------
       ACTUALIZACIÓN
    ----------------------------------------------------- */

    fila.appendChild(
        crearCelda(
            formatearFecha(
                drama.updated_at
            )
        )
    );


    /* -----------------------------------------------------
       EDITAR
    ----------------------------------------------------- */

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
        (evento) => {

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


    /* -----------------------------------------------------
       CLICK SOBRE TODA LA FILA
    ----------------------------------------------------- */

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
            once: true
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
        estado === "published"
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

    const portada =
        normalizarTexto(
            coverUrl,
            ""
        ).trim();


    return portada;
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


    elemento.textContent =
        mensaje;


    elemento.className =
        tipo === "success"
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
