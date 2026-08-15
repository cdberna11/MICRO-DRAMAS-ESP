/* =========================================================
   MICRO-DRAMAS-ESP — CONTROLES FULLSCREEN
   Mantiene intactas las acciones de los controles que ya
   funcionan. Solo agrega mostrar/ocultar controles en fullscreen.
========================================================= */
(function () {
    'use strict';

    const CLASE = 'native-fullscreen-controls-visible';
    let timer = null;
    let instalado = false;

    function obtenerReproductorFullscreen() {
        const elemento =
            document.fullscreenElement ||
            document.webkitFullscreenElement;

        if (
            elemento &&
            elemento.matches &&
            elemento.matches('.md-player')
        ) {
            return elemento;
        }

        return document.querySelector('.md-player.native-fullscreen');
    }

    function obtenerControles(reproductor) {
        if (!reproductor) return null;

        return (
            reproductor.querySelector('.md-player__controls') ||
            reproductor.querySelector('.md-player__bottom') ||
            reproductor.querySelector('.md-player__buttons')
        );
    }

    function estaEnFullscreen() {
        return !!obtenerReproductorFullscreen();
    }

    function mostrar(reproductor, ocultarDespues) {
        const controles = obtenerControles(reproductor);
        if (!controles) return;

        clearTimeout(timer);
        reproductor.classList.add(CLASE);
        controles.classList.add(CLASE);
        controles.removeAttribute('hidden');

        if (ocultarDespues) {
            timer = setTimeout(() => {
                if (estaEnFullscreen()) {
                    ocultar(reproductor);
                }
            }, 3200);
        }
    }

    function ocultar(reproductor) {
        const controles = obtenerControles(reproductor);
        clearTimeout(timer);
        if (!controles) return;

        reproductor.classList.remove(CLASE);
        controles.classList.remove(CLASE);
    }

    function restaurar(reproductor) {
        const controles = obtenerControles(reproductor);
        clearTimeout(timer);
        if (!controles) return;

        reproductor.classList.remove(CLASE);
        controles.classList.remove(CLASE);
        controles.removeAttribute('hidden');
    }

    function sincronizarFullscreen() {
        const reproductor = obtenerReproductorFullscreen();

        if (reproductor) {
            ocultar(reproductor);
            return;
        }

        document
            .querySelectorAll('.md-player.' + CLASE)
            .forEach(restaurar);
    }

    function esControl(event) {
        const target = event.target;
        if (!(target instanceof Element)) return false;

        return !!target.closest(
            '.md-player__controls,' +
            '.md-player__bottom,' +
            '.md-player__buttons,' +
            '.md-player__button,' +
            '.md-player__close,' +
            '.md-player__progress,' +
            '.md-player__volume,' +
            'button,input'
        );
    }

    function alternarDesdeSuperficie(event) {
        const reproductor = obtenerReproductorFullscreen();
        if (!reproductor || esControl(event)) return;

        const target = event.target;
        if (!(target instanceof Element) || !reproductor.contains(target)) {
            return;
        }

        const controles = obtenerControles(reproductor);
        if (!controles) return;

        if (controles.classList.contains(CLASE)) {
            ocultar(reproductor);
        } else {
            mostrar(reproductor, false);
        }
    }

    function instalar() {
        if (instalado) return;
        instalado = true;

        document.addEventListener(
            'fullscreenchange',
            sincronizarFullscreen
        );

        document.addEventListener(
            'webkitfullscreenchange',
            sincronizarFullscreen
        );

        /* Un toque/clic sobre el vídeo alterna la visibilidad.
           Los controles existentes quedan completamente fuera. */
        document.addEventListener(
            'click',
            alternarDesdeSuperficie,
            false
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            instalar,
            { once: true }
        );
    } else {
        instalar();
    }
})();
