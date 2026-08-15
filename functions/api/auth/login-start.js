/*
 * Compatibilidad con el flujo actual del portal.
 *
 * El frontend utiliza /api/auth/login-start para el primer paso
 * del inicio de sesión (identificar la cuenta y solicitar el PIN).
 * La lógica real vive en login.js y ya soporta ambos pasos.
 */
export { onRequestPost } from "./login.js";
