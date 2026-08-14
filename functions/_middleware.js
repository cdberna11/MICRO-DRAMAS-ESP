export async function onRequest(context) {

    const request = context.request;
    const url = new URL(request.url);

    const pathname = url.pathname;


    // =====================================================
    // RUTAS QUE PROTEGEMOS
    // =====================================================

    const rutasProtegidas = [
        "/",
        "/index.html"
    ];


    // =====================================================
    // LAS DEMÁS RUTAS PASAN NORMALMENTE
    // =====================================================

    if (!rutasProtegidas.includes(pathname)) {

        return context.next();

    }


    // =====================================================
    // COMPROBAR SESIÓN
    // =====================================================

    const cookies = request.headers.get("Cookie") || "";

    const tieneSesion = cookies
        .split(";")
        .some(cookie =>
            cookie.trim() === "microdramas_session=1"
        );


    // =====================================================
    // SIN SESIÓN → PORTAL
    // =====================================================

    if (!tieneSesion) {

        return Response.redirect(
            new URL("/portal", request.url),
            302
        );

    }


    // =====================================================
    // CON SESIÓN → CARTELERA
    // =====================================================

    return context.next();

}
