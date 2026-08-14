import { buildGoogleCsrfCookie, newGoogleCsrfToken } from "../../lib/google-auth.js";

export async function onRequestGet(context) {
    const clientId = String(context.env.GOOGLE_CLIENT_ID || "").trim();
    const csrfToken = newGoogleCsrfToken();
    return Response.json(
        { configured: Boolean(clientId), clientId: clientId || null, csrfToken },
        {
            headers: {
                "Cache-Control": "no-store",
                "Content-Type": "application/json; charset=utf-8",
                "Set-Cookie": buildGoogleCsrfCookie(csrfToken)
            }
        }
    );
}
