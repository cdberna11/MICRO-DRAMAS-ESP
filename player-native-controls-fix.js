/* =========================================================
   MICRO-DRAMAS-ESP — FIX CONTROLES REPRODUCTOR NATIVO

   El reproductor nativo instala un listener de click en el
   contenedor durante captura. Ese listener bloquea el click
   antes de que llegue al control.

   IMPORTANTE:
   Los botones Play, -10, +10, Mute y Fullscreen comparten
   actualmente la clase .md-player__button. No existen las
   clases individuales que utilizaba la versión anterior de
   este fix. Por eso el fix anterior interceptaba el click y
   después no identificaba el botón, dejándolo sin acción.

   Este archivo identifica los controles por su posición real
   dentro de .md-player__buttons y mantiene intacto el resto.
========================================================= */
(function () {
    'use strict';

    let instalado = false;

    function salirFullscreen() {
        const fn =
            document.exitFullscreen ||
            document.webkitExitFullscreen;

        if (!fn) {
            return Promise.resolve();
        }

        try {
            return Promise.resolve(
                fn.call(document)
            ).catch(() => {});
        } catch {
            return Promise.resolve();
        }
    }

    function entrarFullscreen(reproductor) {
        const fn =
            reproductor.requestFullscreen ||
            reproductor.webkitRequestFullscreen;

        if (!fn) {
            return;
        }

        try {
            const resultado = fn.call(
                reproductor
            );

            if (
                resultado &&
                typeof resultado.catch === 'function'
            ) {
                resultado.catch(error => {
                    console.warn(
                        '[MEGA NATIVO] No se pudo entrar en fullscreen:',
                        error
                    );
                });
            }
        } catch (error) {
            console.warn(
                '[MEGA NATIVO] No se pudo entrar en fullscreen:',
                error
            );
        }
    }

    function estaEnFullscreen(reproductor) {
        return (
            document.fullscreenElement === reproductor ||
            document.webkitFullscreenElement === reproductor
        );
    }

    function obtenerTipoControl(control, reproductor) {
        if (
            control.matches('.md-player__close')
        ) {
            return 'close';
        }

        const botones = Array.from(
            reproductor.querySelectorAll(
                '.md-player__buttons > .md-player__button'
            )
        );

        const indice = botones.indexOf(
            control
        );

        switch (indice) {
            case 0:
                return 'play';
            case 1:
                return 'back10';
            case 2:
                return 'forward10';
            case 3:
                return 'mute';
            case 4:
                return 'fullscreen';
            default:
                return null;
        }
    }

    function cerrarReproductor(reproductor) {
        const video =
            reproductor.querySelector(
                '.md-player__video'
            );

        salirFullscreen().finally(() => {
            try {
                if (
                    typeof window.cerrarReproductor ===
                    'function'
                ) {
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

            reproductor.classList.remove(
                'native-fullscreen',
                'is-open'
            );

            reproductor.setAttribute(
                'aria-hidden',
                'true'
            );

            document.body.classList.remove(
                'video-player-open'
            );
        });
    }

    function manejarControl(event, control) {
        const reproductor =
            control.closest('.md-player');

        if (!reproductor) {
            return;
        }

        const video =
            reproductor.querySelector(
                '.md-player__video'
            );

        if (!video) {
            return;
        }

        const tipo =
            obtenerTipoControl(
                control,
                reproductor
            );

        if (!tipo) {
            return;
        }

        /*
         * Este bloqueo es intencional: evita que el listener
         * de captura del reproductor vuelva a detener el click.
         */
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
                const duration = Number(
                    video.duration
                );

                if (
                    Number.isFinite(duration) &&
                    duration > 0
                ) {
                    video.currentTime = Math.max(
                        0,
                        (Number(video.currentTime) || 0) - 10
                    );
                }
                return;
            }

            case 'forward10': {
                const duration = Number(
                    video.duration
                );

                if (
                    Number.isFinite(duration) &&
                    duration > 0
                ) {
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
                if (
                    estaEnFullscreen(reproductor)
                ) {
                    salirFullscreen();
                } else {
                    entrarFullscreen(
                        reproductor
                    );
                }
                return;

            case 'close':
                cerrarReproductor(
                    reproductor
                );
                return;
        }
    }

    function instalar() {
        if (instalado) {
            return;
        }

        instalado = true;

        document.addEventListener(
            'click',
            event => {
                const target =
                    event.target;

                if (
                    !(target instanceof Element)
                ) {
                    return;
                }

                const control =
                    target.closest(
                        '.md-player__close,' +
                        '.md-player__button'
                    );

                if (!control) {
                    return;
                }

                const reproductor =
                    control.closest(
                        '.md-player'
                    );

                if (!reproductor) {
                    return;
                }

                /*
                 * Solo interceptamos los botones del reproductor.
                 * No afecta la barra de progreso ni el volumen.
                 */
                if (
                    !control.matches(
                        '.md-player__close,' +
                        '.md-player__buttons > .md-player__button'
                    )
                ) {
                    return;
                }

                manejarControl(
                    event,
                    control
                );
            },
            true
        );
    }

    instalar();
})();
