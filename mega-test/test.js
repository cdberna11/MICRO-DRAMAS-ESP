/* =========================================================
   MEGA-TEST — CONTROL DEL LABORATORIO

   El motor real del reproductor se carga desde copias exactas
   de producción ubicadas en esta misma carpeta.

   Este archivo SOLO controla la prueba. No contiene el motor.
========================================================= */

'use strict';

const VIDEOS = {
    video1: {
        id: 'mega-test-1',
        title: 'EL OJO DE LA RIQUEZA',
        video_url: 'https://mega.nz/file/ulBR1aaC#90sGdNoolQrZyf_1T9uTht2qB9kKjb7bQGV0ycxXSlg'
    },
    video2: {
        id: 'mega-test-2',
        title: 'DE LA TRAICIÓN AL TRONO',
        video_url: 'https://mega.nz/file/PlRVAaqK#q6k9C9wVySYblyzsk9G8w0D4DyJTc04q47_oSBAd8LU'
    }
};

const select = document.getElementById('video-select');
const openButton = document.getElementById('btn-play-test');
const stopButton = document.getElementById('btn-stop-test');
const status = document.getElementById('status');

/*
 * El reproductor de producción registra vistas al abrir un vídeo.
 * En el laboratorio lo anulamos para que las pruebas no alteren
 * las estadísticas de la cartelera.
 */
window.registrarVista = async () => null;
window.actualizarVistasTarjeta = () => {};

function setStatus(message, type = 'idle') {
    if (!status) return;

    status.textContent = message;
    status.className = `status status-${type}`;
}

async function abrirPrueba() {
    const drama = VIDEOS[select?.value];

    if (!drama) {
        setStatus('No se seleccionó un vídeo de prueba.', 'error');
        return;
    }

    if (typeof window.reproducirDrama !== 'function') {
        setStatus('El reproductor base todavía no está disponible.', 'error');
        return;
    }

    setStatus(`Abriendo: ${drama.title}`, 'working');

    try {
        await window.reproducirDrama(drama);
        setStatus(`Reproductor abierto: ${drama.title}`, 'ok');
    } catch (error) {
        console.error('[MEGA-TEST]', error);
        setStatus(
            `Error al abrir: ${error?.message || error}`,
            'error'
        );
    }
}

function cerrarPrueba() {
    if (typeof window.cerrarReproductor === 'function') {
        window.cerrarReproductor();
        setStatus('Reproductor cerrado.', 'idle');
        return;
    }

    if (typeof window.detenerReproductor === 'function') {
        window.detenerReproductor();
    }

    const reproductor = document.getElementById('md-player');

    if (reproductor) {
        reproductor.classList.remove('is-open');
        reproductor.setAttribute('aria-hidden', 'true');
    }

    setStatus('Reproductor cerrado.', 'idle');
}

openButton?.addEventListener('click', abrirPrueba);
stopButton?.addEventListener('click', cerrarPrueba);

setStatus(
    'Base del reproductor cargada. Selecciona un vídeo y pulsa «Abrir reproductor».',
    'idle'
);
