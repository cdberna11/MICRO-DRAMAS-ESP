export async function onRequest(context) {

    const request = context.request;

    const url = new URL(request.url);

    const pathname = url.pathname;


    // =====================================================
    // RUTAS QUE QUEREMOS PROTEGER
    // =====================================================

    const rutasProtegidas = [
        "/",
        "/index.html"
    ];


    // =====================================================
    // SI NO ES LA CARTELERA, DEJAR PASAR NORMALMENTE
    // =====================================================

    if (!rutasProtegidas.includes(pathname)) {

        return context.next();

    }


    // =====================================================
    // COMPROBAR COOKIE DE SESIÓN
    // =====================================================

    const cookies = request.headers.get("Cookie") || "";


    const tieneSesion = cookies
        .split(";")
        .some(cookie => {

            return cookie.trim() === "microdramas_session=1";

        });


    // =====================================================
    // SI NO HAY SESIÓN → PORTAL DE USUARIO
    // =====================================================

    if (!tieneSesion) {

        return Response.redirect(
            new URL("/portal", request.url),
            302
        );

    }


    // =====================================================
    // SI HAY SESIÓN → PERMITIR CARTELERA
    // =====================================================

    return context.next();

}
