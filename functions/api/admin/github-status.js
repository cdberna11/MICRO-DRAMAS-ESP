/* =========================================================
   ESTADO DE GITHUB
   MICRO-DRAMAS-ESP

   Comprueba que el token de GitHub exista y tenga acceso al
   repositorio. La fecha de expiración se obtiene de Cloudflare.
   Si la variable no está configurada, se utiliza la fecha del
   token actualmente creado: 14/08/2027.
========================================================= */

function respuestaJson(datos, estado = 200) {
    return Response.json(
        datos,
        {
            status: estado,
            headers: {
                "Cache-Control": "no-store",
                "Content-Type": "application/json; charset=utf-8"
            }
        }
    );
}

function fechaValida(valor) {
    return /^\d{4}-\d{2}-\d{2}$/.test(
        String(valor || "")
    );
}

function obtenerDiasRestantes(fechaISO) {
    if (!fechaValida(fechaISO)) {
        return null;
    }

    const fecha =
        new Date(`${fechaISO}T23:59:59Z`);

    if (Number.isNaN(fecha.getTime())) {
        return null;
    }

    return Math.max(
        0,
        Math.ceil(
            (fecha.getTime() - Date.now()) / 86400000
        )
    );
}

export async function onRequestGet(context) {

    const token =
        context.env.GITHUB_TOKEN;

    if (!token) {
        return respuestaJson(
            {
                success: false,
                connected: false,
                error:
                    "El secret GITHUB_TOKEN no está configurado en Cloudflare."
            },
            500
        );
    }

    const repository =
        String(
            context.env.GITHUB_REPOSITORY ||
            "cdberna11/MICRO-DRAMAS-ESP"
        ).trim();

    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
        return respuestaJson(
            {
                success: false,
                connected: false,
                error:
                    "La configuración del repositorio de GitHub no es válida."
            },
            500
        );
    }

    try {

        const respuesta =
            await fetch(
                `https://api.github.com/repos/${repository}`,
                {
                    method: "GET",
                    headers: {
                        "Accept":
                            "application/vnd.github+json",
                        "Authorization":
                            `Bearer ${token}`,
                        "X-GitHub-Api-Version":
                            "2022-11-28",
                        "User-Agent":
                            "MICRO-DRAMAS-ESP"
                    }
                }
            );

        if (!respuesta.ok) {

            let motivo =
                "GitHub rechazó la autenticación.";

            if (respuesta.status === 401) {
                motivo =
                    "El token de GitHub es inválido, expiró o fue revocado.";
            } else if (respuesta.status === 403) {
                motivo =
                    "GitHub rechazó el acceso. Revisa los permisos del token.";
            } else if (respuesta.status === 404) {
                motivo =
                    "El token no tiene acceso al repositorio configurado.";
            }

            return respuestaJson(
                {
                    success: false,
                    connected: false,
                    status: respuesta.status,
                    error: motivo
                },
                502
            );
        }

        const fechaVariable =
            String(
                context.env.GITHUB_TOKEN_EXPIRES_AT ||
                ""
            ).trim();

        const fechaConfigurada =
            fechaValida(fechaVariable)
                ? fechaVariable
                : "2027-08-14";

        return respuestaJson(
            {
                success: true,
                connected: true,
                repository,
                expiresAt: fechaConfigurada,
                daysRemaining:
                    obtenerDiasRestantes(fechaConfigurada)
            },
            200
        );

    } catch (error) {

        console.error(
            "Error comprobando GitHub:",
            error
        );

        return respuestaJson(
            {
                success: false,
                connected: false,
                error:
                    "No se pudo comprobar la conexión con GitHub."
            },
            502
        );
    }
}
