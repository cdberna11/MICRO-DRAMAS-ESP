/* =========================================================
   MICRO-DRAMAS-ESP — CONTROLES NATIVOS + FULLSCREEN

   Mantiene las acciones de los controles que ya funcionan y
   añade únicamente la alternancia de visibilidad en fullscreen.
========================================================= */
(function () {
    'use strict';

    const CLASE = 'native-fullscreen-controls-visible';
    let timer = null;
    let instalado = false;

    function salirFullscreen() {
        const fn =
            document.exitFullscreen ||
            document.webkitExitFullscreen;

        if (!fn) return Promise.resolve();

        try {
            return Promise.resolve(fn.call(document)).catch(() => {});
        } catch {
            return Promise.resolve();
        }
    }

    function entrarFullscreen(reproductor) {
        const fn =
            reproductor.requestFullscreen ||
            reproductor.webkitRequestFullscreen;

        if (!fn) return;

        try {
            const resultado = fn.call(reproductor);
            if (resultado && typeof resultado.catch === 'function') {
                resultado.catch(() => {});
            }
        } catch {}
    }

    function estaEnFullscreen(reproductor) {
        return (
            document.fullscreenElement === reproductor ||
            document.webkitFullscreenElement === reproductor
        );
    }

    function obtenerTipoControl(control, reproductor) {
        if (control.matches('.md-player__close')) return 'close';

        const botones = Array.from(
            reproductor.querySelectorAll(
                '.md-player__buttons > .md-player__button'
            )
        );

        switch (botones.indexOf(control)) {
            case 0: return 'play';
            case 1: return 'back10';
            case 2: return 'forward10';
            case 3: return 'mute';
            case 4: return 'fullscreen';
            default: return null;
        }
    }

    function cerrarReproductor(reproductor) {
        const video = reproductor.querySelector('.md-player__video');

        salirFullscreen().finally(() => {
            try {
                if (typeof window.cerrarReproductor === 'function') {
                    window.cerrarReproductor();
                    return;
                }
            } catch {}

            if (video) {
                try {
                    video.pause();
                    video.removeAttribute('src');
                    video.load();
                } catch {}
            }

            reproductor.classList.remove('native-fullscreen', 'is-open');
            reproductor.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('video-player-open');
        });
    }

    function manejarControl(event, control) {
        const reproductor = control.closest('.md-player');
        if (!reproductor) return;

        const video = reproductor.querySelector('.md-player__video');
        if (!video) return;

        const tipo = obtenerTipoControl(control, reproductor);
        if (!tipo) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        switch (tipo) {
            case 'play':
                if (video.paused) {
                    video.play().catch(() => {});
                } else {
                    video.pause();
                }
                return;

            case 'back10': {
                const duration = Number(video.duration);
                if (Number.isFinite(duration) && duration > 0) {
                    video.currentTime = Math.max(
                        0,
                        (Number(video.currentTime) || 0) - 10
                    );
                }
                return;
            }

            case 'forward10': {
                const duration = Number(video.duration);
                if (Number.isFinite(duration) && duration > 0) {
                    video.currentTime = Math.min(
                        duration - 0.05,
                        (Number(video.currentTime) || 0) + 10
                    );
                }
                return;
            }

            case 'mute':
                video.muted = !video.muted;
                return;

            case 'fullscreen':
                if (estaEnFullscreen(reproductor)) {
                    salirFullscreen();
                } else {
                    entrarFullscreen(reproductor);
                }
                return;

            case 'close':
                cerrarReproductor(reproductor);
                return;
        }
    }

    /* =====================================================
       FULLSCREEN — VISIBILIDAD DE CONTROLES
    ====================================================== */

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

    function mostrar(reproductor) {
        const controles = obtenerControles(reproductor);
        if (!controles) return;

        clearTimeout(timer);
        reproductor.classList.add(CLASE);
        controles.classList.add(CLASE);
        controles.removeAttribute('hidden');
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
        } else {
            document
                .querySelectorAll('.md-player.' + CLASE)
                .forEach(restaurar);
        }
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
            mostrar(reproductor);
        }
    }

    function instalar() {
        if (instalado) return;
        instalado = true;

        /* PRIMERO: conservar las acciones funcionales de los controles. */
        document.addEventListener(
            'click',
            event => {
                const target = event.target;
                if (!(target instanceof Element)) return;

                const control = target.closest(
                    '.md-player__close,.md-player__button'
                );
                if (!control) return;

                const reproductor = control.closest('.md-player');
                if (!reproductor) return;

                if (!control.matches(
                    '.md-player__close,' +
                    '.md-player__buttons > .md-player__button'
                )) {
                    return;
                }

                manejarControl(event, control);
            },
            true
        );

        /* SEGUNDO: sincronizar entrada/salida de fullscreen. */
        document.addEventListener(
            'fullscreenchange',
            sincronizarFullscreen
        );

        document.addEventListener(
            'webkitfullscreenchange',
            sincronizarFullscreen
        );

        /* TERCERO: solo una superficie libre del vídeo alterna controles. */
        document.addEventListener(
            'click',
            alternarDesdeSuperficie,
            false
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', instalar, { once: true });
    } else {
        instalar();
    }
})();
