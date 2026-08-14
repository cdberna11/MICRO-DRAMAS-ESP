const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
const GOOGLE_KEYS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_CSRF_COOKIE = "md_google_csrf";

function base64UrlToBytes(value) {
    const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(String(value).length / 4) * 4, "=");
    const binary = atob(normalized);
    return Uint8Array.from(binary, char => char.charCodeAt(0));
}
function base64UrlToJson(value) { return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))); }

let cachedKeys = null;
let cachedKeysExpiresAt = 0;

async function getGoogleKeys() {
    if (cachedKeys && Date.now() < cachedKeysExpiresAt) return cachedKeys;
    const response = await fetch(GOOGLE_KEYS_URL, { headers: { "Accept": "application/json" } });
    if (!response.ok) throw new Error("No se pudieron obtener las claves de Google.");
    const data = await response.json();
    const cacheControl = response.headers.get("Cache-Control") || "";
    const maxAge = Number((cacheControl.match(/max-age=(\d+)/i) || [])[1] || 3600);
    cachedKeys = data.keys || [];
    cachedKeysExpiresAt = Date.now() + Math.max(60, maxAge - 60) * 1000;
    return cachedKeys;
}

export async function verifyGoogleIdToken(idToken, clientId) {
    if (!clientId) throw new Error("GOOGLE_CLIENT_ID no está configurado.");
    const parts = String(idToken || "").split(".");
    if (parts.length !== 3) throw new Error("Token de Google no válido.");
    const header = base64UrlToJson(parts[0]);
    const payload = base64UrlToJson(parts[1]);
    if (header.alg !== "RS256" || !header.kid) throw new Error("Firma de Google no válida.");
    if (!GOOGLE_ISSUERS.has(payload.iss)) throw new Error("Emisor de Google no válido.");
    if (payload.aud !== clientId) throw new Error("El token no pertenece a esta aplicación.");
    if (!payload.sub || !payload.email || payload.email_verified !== true) throw new Error("La cuenta de Google no está verificada.");
    if (!Number.isFinite(Number(payload.exp)) || Number(payload.exp) <= Math.floor(Date.now() / 1000)) throw new Error("El token de Google ha expirado.");

    const keyData = (await getGoogleKeys()).find(item => item.kid === header.kid);
    if (!keyData) {
        cachedKeys = null;
        cachedKeysExpiresAt = 0;
        const refreshed = (await getGoogleKeys()).find(item => item.kid === header.kid);
        if (!refreshed) throw new Error("No se encontró la clave de Google.");
        return verifyWithKey(refreshed, parts, payload);
    }
    return verifyWithKey(keyData, parts, payload);
}

async function verifyWithKey(keyData, parts, payload) {
    const cryptoKey = await crypto.subtle.importKey(
        "jwk",
        keyData,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"]
    );
    const valid = await crypto.subtle.verify(
        { name: "RSASSA-PKCS1-v1_5" },
        cryptoKey,
        base64UrlToBytes(parts[2]),
        new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    );
    if (!valid) throw new Error("Firma de Google no válida.");
    return payload;
}

export function buildGoogleCsrfCookie(value) {
    return `${GOOGLE_CSRF_COOKIE}=${encodeURIComponent(value)}; Path=/; Secure; SameSite=Lax; Max-Age=600`;
}
export function clearGoogleCsrfCookie() {
    return `${GOOGLE_CSRF_COOKIE}=; Path=/; Secure; SameSite=Lax; Max-Age=0`;
}
export function getGoogleCsrfCookie(request) {
    const cookies = request.headers.get("Cookie") || "";
    const prefix = `${GOOGLE_CSRF_COOKIE}=`;
    for (const item of cookies.split(";")) {
        const cookie = item.trim();
        if (cookie.startsWith(prefix)) return decodeURIComponent(cookie.slice(prefix.length));
    }
    return null;
}
export function newGoogleCsrfToken() { return bytesToHex(crypto.getRandomValues(new Uint8Array(32))); }
function bytesToHex(bytes) { return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join(""); }
