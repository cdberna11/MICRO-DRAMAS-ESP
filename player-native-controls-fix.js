/* =========================================================
   MICRO-DRAMAS-ESP — FIX CONTROLES REPRODUCTOR NATIVO

   El reproductor nativo MEGA instala un listener de click en
   el contenedor durante la fase de captura. Ese listener estaba
   deteniendo los clicks antes de que llegaran a Play, Mute,
   Fullscreen y X.

   Este archivo intercepta SOLO esos controles antes del listener
   del contenedor y deja intacto el resto del reproductor.
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
            return Promise.resolve(fn.call(document)).catch(() => {});
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
            const resultado = fn.call(reproductor);

            if (resultado && typeof resultado.catch === 'function') {
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

    function cerrarReproductor(reproductor, video) {
        if (video) {
            try {
                video.pause();
            } catch {}

            try {
                video.removeAttribute('src');
                video.load();
            } catch {}
        }

        const terminar = () => {
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

            /*
             * Si el reproductor original expone su cierre,
             * lo dejamos sincronizado con el DOM sin depender
             * del click que estamos bloqueando.
             */
            try {
                if (
                    typeof window.detenerReproductor ===
                    'function'
                ) {
                    window.detenerReproductor();
                }
            } catch {}
        };

        salirFullscreen().finally(terminar);
    }

    function manejarControl(event, control) {
        const reproductor =
            control.closest('.md-player');

        if (!reproductor) {
            return;
        }

        const video =
            reproductor.querySelector('.md-player__video');

        if (!video) {
            return;
        }

        /*
         * Muy importante: detener aquí evita que el listener
         * de captura del contenedor del reproductor bloquee
         * nuevamente la acción.
         */
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if (control.matches('.md-player__play')) {
            if (video.paused) {
                video.play().catch(() => {});
            } else {
                video.pause();
            }
            return;
        }

        if (control.matches('.md-player__mute')) {
            video.muted = !video.muted;
            return;
        }

        if (control.matches('.md-player__retroceder')) {
            const duration = Number(video.duration);
            if (Number.isFinite(duration) && duration > 0) {
                video.currentTime = Math.max(
                    0,
                    (Number(video.currentTime) || 0) - 10
                );
            }
            return;
        }

        if (control.matches('.md-player__avanzar')) {
            const duration = Number(video.duration);
            if (Number.isFinite(duration) && duration > 0) {
                video.currentTime = Math.min(
                    Math.max(0, duration - 0.05),
                    (Number(video.currentTime) || 0) + 10
                );
            }
            return;
        }

        if (control.matches('.md-player__fullscreen')) {
            if (estaEnFullscreen(reproductor)) {
                salirFullscreen();
            } else {
                entrarFullscreen(reproductor);
            }
            return;
        }

        if (control.matches('.md-player__close')) {
            cerrarReproductor(reproductor, video);
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
                const target = event.target;

                if (!(target instanceof Element)) {
                    return;
                }

                const control = target.closest(
                    '.md-player__play,' +
                    '.md-player__mute,' +
                    '.md-player__retroceder,' +
                    '.md-player__avanzar,' +
                    '.md-player__fullscreen,' +
                    '.md-player__close'
                );

                if (!control) {
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
