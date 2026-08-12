async function cargarDramas() {
    const catalogo = document.getElementById("catalogo");

    try {
        const respuesta = await fetch("./dramas.json");

        if (!respuesta.ok) {
            throw new Error(`Error al cargar dramas.json: ${respuesta.status}`);
        }

        const dramas = await respuesta.json();

        catalogo.innerHTML = "";

        dramas.forEach((drama) => {
            const tarjeta = document.createElement("article");
            tarjeta.className = "card";

            const portada = document.createElement("img");
            portada.src = drama.portada;
            portada.alt = `Portada de ${drama.titulo}`;
            portada.loading = "lazy";

            const contenido = document.createElement("div");
            contenido.className = "card-content";

            const titulo = document.createElement("h2");
            titulo.textContent = drama.titulo;

            const plataforma = document.createElement("p");

            const etiquetaPlataforma = document.createElement("strong");
            etiquetaPlataforma.textContent = "Plataforma: ";

            plataforma.appendChild(etiquetaPlataforma);
            plataforma.appendChild(
                document.createTextNode(drama.plataforma)
            );

            const descripcion = document.createElement("p");
            descripcion.textContent = drama.descripcion;

            const boton = document.createElement("a");
            boton.className = "btn";
            boton.href = drama.video;
            boton.textContent = "Ver ahora";

            contenido.appendChild(titulo);
            contenido.appendChild(plataforma);
            contenido.appendChild(descripcion);
            contenido.appendChild(boton);

            tarjeta.appendChild(portada);
            tarjeta.appendChild(contenido);

            catalogo.appendChild(tarjeta);
        });
    } catch (error) {
        console.error(error);
        catalogo.innerHTML =
            '<p class="mensaje-error">No se pudo cargar el catálogo.</p>';
    }
}

cargarDramas();
