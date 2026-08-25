/*
 * Endpoint exclusivo para el panel administrativo móvil.
 * Reutiliza exactamente la misma consulta D1 del administrador de escritorio.
 * La autorización se realiza en functions/_middleware.js mediante la sesión D1.
 */
export { onRequestGet, onRequestPost } from "../admin/dramas.js";
