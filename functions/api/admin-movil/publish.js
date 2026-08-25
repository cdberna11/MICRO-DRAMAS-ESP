/*
 * Endpoint exclusivo para publicar desde el panel administrativo móvil.
 * Reutiliza la lógica existente de publicación para no duplicar reglas de D1.
 */
export { onRequestPost } from "../admin/publish.js";
