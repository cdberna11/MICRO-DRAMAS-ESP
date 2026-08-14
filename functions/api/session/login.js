export async function onRequestPost(context) {

    const headers = new Headers();

    headers.set(
        "Set-Cookie",
        "microdramas_session=1; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400"
    );

    headers.set(
        "Location",
        "/"
    );

    return new Response(null, {
        status: 302,
        headers
    });

}
