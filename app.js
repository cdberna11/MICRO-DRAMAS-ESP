async function cargarDramas() {
    const catalogo = document.getElementById("catalogo");

    if (!catalogo) {
        console.error('No se encontró el elemento con id "catalogo".');
        return;
    }

    try {
        const respuesta = await fetch("/api/dramas");

        if (!respuesta.ok) {
            throw new Error(
                `Error al consultar la API: ${respuesta.status}`
            );
        }

        const datos = await respuesta.json();

        if (!datos.success || !Array.isArray(datos.dramas)) {
            throw new Error("La API devolvió una respuesta no válida.");
        }

        catalogo.innerHTML = "";

        if (datos.dramas.length === 0) {
            catalogo.innerHTML =
                '<p class="mensaje-vacio">No hay dramas disponibles.</p>';
            return;
        }

        datos.dramas.forEach((drama) => {
            const tarjeta = document.createElement("article");
            tarjeta.className = "card";

            const portada = document.createElement("img");
            portada.src = drama.cover_url;
            portada.alt = `Portada de ${drama.title}`;
            portada.loading = "lazy";

            const contenido = document.createElement("div");
            contenido.className = "card-content";

            const titulo = document.createElement("h2");
            titulo.textContent = drama.title;

            const plataforma = document.createElement("p");

            const etiquetaPlataforma = document.createElement("strong");
            etiquetaPlataforma.textContent = "Plataforma: ";

            plataforma.appendChild(etiquetaPlataforma);
            plataforma.appendChild(
                document.createTextNode(drama.platform)
            );

            const descripcion = document.createElement("p");
            descripcion.textContent = drama.description;

            const detallesDescripcion = document.createElement("details");
            detallesDescripcion.className = "video-details";

            const resumenDescripcion = document.createElement("summary");
            resumenDescripcion.textContent = "Descripción del video";

            const descripcionVideo = document.createElement("p");
            descripcionVideo.className = "video-description";
            descripcionVideo.textContent = drama.video_description;

            detallesDescripcion.appendChild(resumenDescripcion);
            detallesDescripcion.appendChild(descripcionVideo);    
            const boton = document.createElement("a");
            boton.className = "btn";
            boton.href = drama.embed_url;
            boton.textContent = "Ver ahora";
            boton.target = "_blank";
            boton.rel = "noopener noreferrer";

            contenido.appendChild(titulo);
            contenido.appendChild(plataforma);
            contenido.appendChild(descripcion);
            contenido.appendChild(detallesDescripcion);
            contenido.appendChild(boton);

            tarjeta.appendChild(portada);
            tarjeta.appendChild(contenido);

            catalogo.appendChild(tarjeta);
        });
    } catch (error) {
        console.error("Error al cargar el catálogo:", error);

        catalogo.innerHTML =
            '<p class="mensaje-error">No se pudo cargar el catálogo.</p>';
    }
}

cargarDramas();
