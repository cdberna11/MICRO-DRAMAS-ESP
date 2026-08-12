async function cargarDramas() {
    const respuesta = await fetch("dramas.json");
    const dramas = await respuesta.json();

    const catalogo = document.getElementById("catalogo");

    catalogo.innerHTML = "";

    dramas.forEach(drama => {

        const card = `
            <div class="card">

                drama.portada}" alt="${drama.titulo}">

                <div class="card-content">

                    <h2>${drama.titulo}</h2>

                    <p><strong>Plataforma:</strong> ${drama.plataforma}</p>

                    <p>${drama.descripcion}</p>

                    ${drama.video}
                        Ver ahora
                    </a>

                </div>

            </div>
        `;

        catalogo.innerHTML += card;
    });
}

cargarDramas();
