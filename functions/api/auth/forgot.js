function json(data, status = 200) {
    return Response.json(data, {
        status,
        headers: {
            "Cache-Control": "no-store",
            "Content-Type": "application/json; charset=utf-8"
        }
    });
}

export async function onRequestPost() {
    return json({
        success: false,
        code: "PIN_RESET_NOT_ENABLED",
        error: "El restablecimiento del PIN todavía no está habilitado. Primero debemos configurar el envío de códigos por correo o teléfono."
    }, 409);
}
