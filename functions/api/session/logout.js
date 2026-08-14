export async function onRequestGet(context) {

    const headers = new Headers();

    headers.set(
        "Set-Cookie",
        "microdramas_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
    );

    headers.set(
        "Location",
        "/portal"
    );

    return new Response(null, {
        status: 302,
        headers
    });

}
