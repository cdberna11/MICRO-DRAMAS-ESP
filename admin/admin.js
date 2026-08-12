"use strict";

const API_ADMIN_DRAMAS = "/api/admin/dramas";

document.addEventListener("DOMContentLoaded", () => {
    cargarDramasAdministrativos();
});

async function cargarDramasAdministrativos() {
    const elementos = obtenerElementos();

    if (!elementos) {
        return;
    }

    mostrarEstadoCarga(elementos);

    try {
        const respuesta = await fetch(API_ADMIN_DRAMAS, {
            method: "GET",
            credentials: "same-origin",
            headers: {
                Accept: "application/json"
            },
            cache: "no-store"
        });

        if (!respuesta.ok) {
            throw new Error(
                `La API respondió con el estado ${respuesta.status}.`
            );
        }

        const datos = await respuesta.json();

        if (!datos.success || !Array.isArray(datos.dramas)) {
            throw new Error(
                "La API administrativa devolvió una respuesta no válida."
            );
        }

        renderizarDramas(datos.dramas, elementos);
    } catch (error) {
        console.error(
            "Error al cargar los microdramas administrativos:",
            error
        );

        mostrarError(
            elementos,
            "No se pudieron cargar los microdramas. Recarga la página e inténtalo nuevamente."
        );
    }
}

function obtenerElementos() {
    const elementos = {
        estadoCarga: document.getElementById("estado-carga"),
        estadoVacio: document.getElementById("estado-vacio"),
        contenedorTabla: document.getElementById("contenedor-tabla"),
        listaDramas: document.getElementById("lista-dramas"),
        mensajeAdmin: document.getElementById("mensaje-admin")
    };

    const elementoFaltante = Object.entries(elementos).find(
        ([, elemento]) => !elemento
    );

    if (elementoFaltante) {
        console.error(
            `No se encontró el elemento administrativo: ${elementoFaltante[0]}.`
        );

        return null;
    }

    return elementos;
}

function mostrarEstadoCarga(elementos) {
    elementos.estadoCarga.hidden = false;
    elementos.estadoVacio.hidden = true;
    elementos.contenedorTabla.hidden = true;
    elementos.mensajeAdmin.hidden = true;
    elementos.listaDramas.replaceChildren();
}

function renderizarDramas(dramas, elementos) {
    elementos.estadoCarga.hidden = true;
    elementos.listaDramas.replaceChildren();

    if (dramas.length === 0) {
        elementos.estadoVacio.hidden = false;
        elementos.contenedorTabla.hidden = true;
        return;
    }

    const fragmento = document.createDocumentFragment();

    dramas.forEach((drama) => {
        fragmento.appendChild(crearFilaDrama(drama));
    });

    elementos.listaDramas.appendChild(fragmento);
    elementos.estadoVacio.hidden = true;
    elementos.contenedorTabla.hidden = false;
}

function crearFilaDrama(drama) {
    const fila = document.createElement("tr");

    fila.appendChild(
        crearCelda(normalizarTexto(drama.id, "—"))
    );

    fila.appendChild(
        crearCeldaInformacionDrama(drama)
    );

    fila.appendChild(
        crearCelda(normalizarTexto(drama.platform, "—"))
    );

    fila.appendChild(
        crearCeldaEstado(drama.status)
    );

    fila.appendChild(
        crearCeldaDestacado(drama.featured)
    );

    fila.appendChild(
        crearCelda(normalizarTexto(drama.sort_order, "0"))
    );

    fila.appendChild(
        crearCelda(formatearFecha(drama.updated_at))
    );

    fila.appendChild(
        crearCeldaAcciones()
    );

    return fila;
}

function crearCelda(contenido) {
    const celda = document.createElement("td");
    celda.textContent = contenido;
    return celda;
}

function crearCeldaInformacionDrama(drama) {
    const celda = document.createElement("td");

    const contenedor = document.createElement("div");
    contenedor.className = "drama-info";

    const portada = document.createElement("img");
    portada.className = "drama-cover";
    portada.src = obtenerRutaPortada(drama.cover_url);
    portada.alt = `Portada de ${normalizarTexto(
        drama.title,
        "microdrama"
    )}`;
    portada.loading = "lazy";
    portada.width = 48;
    portada.height = 72;

    portada.addEventListener(
        "error",
        () => {
            portada.hidden = true;
        },
        {
            once: true
        }
    );

    const textos = document.createElement("div");

    const titulo = document.createElement("p");
    titulo.className = "drama-title";
    titulo.textContent = normalizarTexto(
        drama.title,
        "Sin título"
    );

    const slug = document.createElement("p");
    slug.className = "drama-slug";
    slug.textContent = normalizarTexto(
        drama.slug,
        "Sin slug"
    );
    slug.title = slug.textContent;

    textos.appendChild(titulo);
    textos.appendChild(slug);

    contenedor.appendChild(portada);
    contenedor.appendChild(textos);

    celda.appendChild(contenedor);

    return celda;
}

function crearCeldaEstado(estadoOriginal) {
    const celda = document.createElement("td");
    const indicador = document.createElement("span");

    const estado = normalizarTexto(
        estadoOriginal,
        "draft"
    ).toLowerCase();

    indicador.className = "status-badge";

    if (estado === "published") {
        indicador.classList.add(
            "status-badge--published"
        );
        indicador.textContent = "Publicado";
    } else {
        indicador.classList.add(
            "status-badge--draft"
        );
        indicador.textContent = "Borrador";
    }

    celda.appendChild(indicador);

    return celda;
}

function crearCeldaDestacado(valor) {
    const celda = document.createElement("td");
    const indicador = document.createElement("span");

    const destacado =
        valor === true ||
        valor === 1 ||
        valor === "1";

    indicador.className = destacado
        ? "feature-value feature-value--yes"
        : "feature-value feature-value--no";

    indicador.textContent = destacado
        ? "Sí"
        : "No";

    celda.appendChild(indicador);

    return celda;
}

function crearCeldaAcciones() {
    const celda = document.createElement("td");
    const mensaje
