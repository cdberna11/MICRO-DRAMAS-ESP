async function cargarDramas() {

    const respuesta = await fetch("dramas.json");
    const dramas = await respuesta.json();

    const catalogo = document.getElementById("catalogo");

    catalogo.innerHTML = "";

    dramas.forEach(drama => {

        catalogo.innerHTML += `
            <div class="card">

                }" alt="${drama.titulo}">

                <div class="card-content">

                    <h2>${drama.titulo}</h2>

                    <p>${drama.plataforma}</p>

                    <p>${drama.descripcion}</p>

                    }" class="btn" target="_blank">
                        Ver ahora
                    </a>

                </div>

            </div>
        `;

    });

}

cargarDramas();
