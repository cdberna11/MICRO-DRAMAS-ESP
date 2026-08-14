/* =========================================================
   PROTECCIÓN DE API ADMINISTRATIVA
   MICRO-DRAMAS-ESP

   Todas las Functions dentro de /api/admin requieren la
   sesión administrativa existente.
========================================================= */

function tieneSesion(request) {
    const cookies =
        request.headers.get("Cookie") || "";

    return cookies
        .split(";")
        .some(cookie =>
            cookie.trim() === "microdramas_session=1"
        );
}


export async function onRequest(context) {

    if (!tieneSesion(context.request)) {
        return Response.json(
            {
                success: false,
                error: "No autorizado. Inicia sesión en el panel administrativo."
            },
            {
                status: 401,
                headers: {
                    "Cache-Control": "no-store",
                    "Content-Type": "application/json; charset=utf-8"
                }
            }
        );
    }

    return context.next();
}
