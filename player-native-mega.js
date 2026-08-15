/* MICRO-DRAMAS-ESP — reproductor nativo sobre MEGAJS + HTTP Range */
(function () {
    'use strict';

    const SW_URL = '/mega-video-sw.js?v=1';
    const STREAM_PATH = '/api/mega-video';
    let registrationPromise = null;

    function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) return Promise.resolve(null);
        if (registrationPromise) return registrationPromise;

        registrationPromise = navigator.serviceWorker.register(SW_URL, {
            scope: '/',
            updateViaCache: 'none'
        }).then(async registration => {
            try { await registration.update(); } catch {}

            if (navigator.serviceWorker.controller) {
                return registration;
            }

            await new Promise(resolve => {
                const timeout = setTimeout(resolve, 5000);
                const onChange = () => {
                    clearTimeout(timeout);
                    navigator.serviceWorker.removeEventListener(
                        'controllerchange',
                        onChange
                    );
                    resolve();
                };

                navigator.serviceWorker.addEventListener(
                    'controllerchange',
                    onChange,
                    { once: true }
                );
            });

            return registration;
        }).catch(error => {
            console.warn(
                '[MEGA NATIVO] Service Worker no disponible:',
                error
            );
            return null;
        });

        return registrationPromise;
    }

    registerServiceWorker();

    function isControlled() {
        return Boolean(navigator.serviceWorker?.controller);
    }

    function blockOriginal(element, handler) {
        if (!element) return;

        element.addEventListener(
            'click',
            event => {
                event.preventDefault();
                event.stopImmediatePropagation();
                handler(event);
            },
            true
        );
    }

    function updateNativeControls(video, elements) {
        const duration = Number(video.duration);
        const current = Number(video.currentTime) || 0;

        if (
            Number.isFinite(duration) &&
            duration > 0
        ) {
            elements.progress.value = String(
                (current / duration) * 100
            );
        }

        elements.time.textContent =
            `${formatTime(current)} / ${formatTime(duration)}`;

        elements.play.textContent =
            video.paused ? '▶' : '❚❚';

        elements.mute.textContent =
            video.muted || video.volume === 0
                ? '🔇'
                : video.volume < 0.5
                    ? '🔉'
                    : '🔊';

        elements.status.textContent =
            `NATIVO · ${
                video.networkState === 2
                    ? 'DESCARGANDO'
                    : video.paused
                        ? 'PAUSADO'
                        : 'REPRODUCIENDO'
            }`;
    }

    function formatTime(value) {
        if (
            !Number.isFinite(value) ||
            value < 0
        ) {
            return '0:00';
        }

        const total = Math.floor(value);
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;

        return h > 0
            ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
            : `${m}:${String(s).padStart(2, '0')}`;
    }

    function enterFullscreen(elements) {
        const target = elements.reproductor;
        const request =
            target.requestFullscreen ||
            target.webkitRequestFullscreen;

        if (request) {
            Promise.resolve(
                request.call(target)
            ).catch(error => {
                console.warn(
                    '[MEGA NATIVO] No se pudo entrar en fullscreen:',
                    error
                );
            });
        }
    }

    async function exitFullscreen() {
        const exit =
            document.exitFullscreen ||
            document.webkitExitFullscreen;

        if (exit) {
            try {
                await exit.call(document);
            } catch {}
        }
    }

    function isFullscreen(elements) {
        return (
            document.fullscreenElement === elements.reproductor ||
            document.webkitFullscreenElement === elements.reproductor
        );
    }

    function setupFullscreen(elements, video) {
        const sync = () => {
            const full = isFullscreen(elements);

            elements.reproductor.classList.toggle(
                'native-fullscreen',
                full
            );

            if (!full) {
                elements.controls.classList.remove(
                    'native-controls-visible'
                );
            }
        };

        document.addEventListener(
            'fullscreenchange',
            sync
        );

        document.addEventListener(
            'webkitfullscreenchange',
            sync
        );

        blockOriginal(
            elements.fullscreen,
            () => {
                if (isFullscreen(elements)) {
                    exitFullscreen();
                } else {
                    enterFullscreen(elements);
                }
            }
        );

        blockOriginal(
            elements.reproductor,
            event => {
                if (!isFullscreen(elements)) return;

                if (
                    event.target.closest(
                        '.md-player__controls, .md-player__header'
                    )
                ) {
                    return;
                }

                elements.controls.classList.add(
                    'native-controls-visible'
                );

                clearTimeout(
                    elements._nativeHideTimer
                );

                elements._nativeHideTimer =
                    setTimeout(() => {
                        if (
                            !video.paused &&
                            isFullscreen(elements)
                        ) {
                            elements.controls.classList.remove(
                                'native-controls-visible'
                            );
                        }
                    }, 2500);
            }
        );

        video.addEventListener(
            'play',
            () => {
                if (isFullscreen(elements)) {
                    elements.controls.classList.remove(
                        'native-controls-visible'
                    );
                }
            }
        );
    }

    function closeNativePlayer(elements, video) {
        clearTimeout(elements._nativeHideTimer);

        video.pause();

        exitFullscreen().finally(() => {
            video.removeAttribute('src');
            video.load();

            elements.reproductor.classList.remove(
                'native-fullscreen',
                'is-open'
            );

            elements.reproductor.setAttribute(
                'aria-hidden',
                'true'
            );

            document.body.classList.remove(
                'video-player-open'
            );

            playerState.open = false;
            playerState.stopped = true;
            playerState.loading = false;
        });
    }

    function wireControls(elements, video) {
        const seek = seconds => {
            const duration = Number(video.duration);

            if (
                !Number.isFinite(duration) ||
                duration <= 0
            ) {
                return;
            }

            const target = Math.max(
                0,
                Math.min(
                    duration - 0.05,
                    (Number(video.currentTime) || 0) + seconds
                )
            );

            video.currentTime = target;
            updateNativeControls(video, elements);
        };

        blockOriginal(elements.play, () => {
            if (video.paused) {
                video.play().catch(() => {});
            } else {
                video.pause();
            }
        });

        blockOriginal(
            elements.retroceder,
            () => seek(-10)
        );

        blockOriginal(
            elements.avanzar,
            () => seek(10)
        );

        blockOriginal(
            elements.mute,
            () => {
                video.muted = !video.muted;
                updateNativeControls(video, elements);
            }
        );

        blockOriginal(
            elements.volume,
            () => {
                video.volume = Number(
                    elements.volume.value
                );

                video.muted =
                    video.volume === 0;

                updateNativeControls(video, elements);
            }
        );

        blockOriginal(
            elements.progress,
            () => {
                const duration = Number(video.duration);

                if (
                    !Number.isFinite(duration) ||
                    duration <= 0
                ) {
                    return;
                }

                const target =
                    duration *
                    (Number(elements.progress.value) / 100);

                video.currentTime = Math.max(
                    0,
                    Math.min(duration - 0.05, target)
                );

                updateNativeControls(video, elements);
            }
        );

        elements.progress.addEventListener(
            'input',
            event => {
                event.stopImmediatePropagation();

                const duration = Number(video.duration);

                if (
                    Number.isFinite(duration) &&
                    duration > 0
                ) {
                    const target =
                        duration *
                        (Number(elements.progress.value) / 100);

                    elements.time.textContent =
                        `${formatTime(target)} / ${formatTime(duration)}`;
                }
            },
            true
        );

        blockOriginal(
            elements.cerrar,
            () => closeNativePlayer(elements, video)
        );

        [
            'loadedmetadata',
            'durationchange',
            'timeupdate',
            'progress',
            'playing',
            'pause',
            'seeked',
            'waiting',
            'stalled'
        ].forEach(type => {
            video.addEventListener(
                type,
                () => updateNativeControls(video, elements)
            );
        });

        video.addEventListener(
            'loadedmetadata',
            () => {
                elements.loading.classList.add(
                    'is-hidden'
                );
                updateNativeControls(video, elements);
            }
        );

        video.addEventListener(
            'canplay',
            () => elements.loading.classList.add('is-hidden')
        );

        video.addEventListener(
            'playing',
            () => elements.loading.classList.add('is-hidden')
        );

        video.addEventListener(
            'waiting',
            () => {
                elements.loadingMessage.textContent =
                    'Cargando...';
                elements.loading.classList.remove(
                    'is-hidden'
                );
            }
        );

        video.addEventListener(
            'error',
            () => {
                const code = video.error?.code || 0;

                elements.loadingMessage.textContent =
                    `No se pudo reproducir el vídeo. Error ${code}.`;

                elements.loading.classList.remove(
                    'is-hidden'
                );

                elements.status.textContent =
                    `NATIVO · ERROR ${code}`;
            }
        );

        setupFullscreen(elements, video);
    }

    function nativeCss() {
        if (
            document.getElementById(
                'mega-native-player-style'
            )
        ) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'mega-native-player-style';

        style.textContent = `
.md-player.native-fullscreen {
    padding: 0 !important;
    background: #000 !important;
}

.md-player.native-fullscreen .md-player__window {
    width: 100% !important;
    height: 100% !important;
    max-height: none !important;
    border: 0 !important;
    border-radius: 0 !important;
}

.md-player.native-fullscreen .md-player__area {
    flex: 1 !important;
    min-height: 0 !important;
    aspect-ratio: auto !important;
}

.md-player.native-fullscreen .md-player__controls {
    display: none !important;
}

.md-player.native-fullscreen .md-player__controls.native-controls-visible {
    display: block !important;
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10;
}

.md-player.native-fullscreen .md-player__header {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    z-index: 11;
    background: linear-gradient(rgba(0,0,0,.75), transparent);
}
`;

        document.head.appendChild(style);
    }

    async function startNative(drama) {
        const url =
            typeof drama?.video_url === 'string'
                ? drama.video_url.trim()
                : '';

        if (
            !url ||
            !/^https:\/\/(?:www\.)?mega\.(?:nz|co\.nz)\//i.test(url)
        ) {
            return false;
        }

        if (!('serviceWorker' in navigator)) {
            return false;
        }

        const registration =
            await registerServiceWorker();

        if (
            !registration ||
            !isControlled()
        ) {
            return false;
        }

        if (playerState.open) {
            try {
                detenerReproductor();
            } catch {}
        }

        crearReproductor();
        nativeCss();

        const elements =
            playerState.playerElements;

        const video =
            elements.video;

        const operationId =
            ++playerState.operationId;

        playerState.open = true;
        playerState.loading = true;
        playerState.stopped = false;
        playerState.drama = drama;
        playerState.file = null;
        playerState.fileSize = 0;
        playerState.mp4box = null;
        playerState.mp4Info = null;
        playerState.mp4Ready = false;
        playerState.mp4Error = false;
        playerState.duration = 0;
        playerState.mediaSource = null;
        playerState.mediaSourceUrl = null;
        playerState.sourceBuffers = new Map();
        playerState.sourceQueues = new Map();
        playerState.totalDownloaded = 0;
        playerState.totalSegments = 0;
        playerState.totalAppended = 0;
        playerState.seekInProgress = false;
        playerState.pendingSeekTime = null;
        playerState.allowAutoplay = true;
        playerState.streamStarted = true;
        playerState.playbackStarted = false;

        elements.titulo.textContent =
            drama.title || '';

        elements.progress.value = '0';
        elements.time.textContent = '0:00 / 0:00';
        elements.status.textContent =
            'NATIVO · CONECTANDO';

        elements.loadingMessage.textContent =
            'Conectando con MEGA...';

        elements.loading.classList.remove(
            'is-hidden'
        );

        elements.reproductor.classList.add(
            'is-open'
        );

        elements.reproductor.setAttribute(
            'aria-hidden',
            'false'
        );

        document.body.classList.add(
            'video-player-open'
        );

        if (typeof registrarVista === 'function') {
            registrarVista(drama)
                .then(resultado => {
                    if (!resultado) return;

                    drama.views = resultado.views;
                    drama.period_views = resultado.period_views;
                    drama.top_period_start =
                        resultado.top_period_start;
                    drama.top_period_views =
                        resultado.top_period_views;

                    if (
                        typeof actualizarVistasTarjeta ===
                        'function'
                    ) {
                        actualizarVistasTarjeta(
                            drama,
                            resultado.views
                        );
                    }
                })
                .catch(() => {});
        }

        video.crossOrigin = 'anonymous';
        video.preload = 'metadata';
        video.controls = false;
        video.src =
            `${STREAM_PATH}?url=${encodeURIComponent(url)}&v=1`;
        video.load();

        wireControls(
            elements,
            video
        );

        updateNativeControls(
            video,
            elements
        );

        video.play()
            .then(() => {
                playerState.playbackStarted = true;
                elements.loading.classList.add(
                    'is-hidden'
                );
                updateNativeControls(
                    video,
                    elements
                );
            })
            .catch(() => {
                elements.loading.classList.add(
                    'is-hidden'
                );
                elements.status.textContent =
                    'NATIVO · LISTO — pulsa PLAY';
                updateNativeControls(
                    video,
                    elements
                );
            });

        console.log(
            '[MEGA NATIVO] ✓ Reproductor nativo activado:',
            drama.title,
            operationId
        );

        return true;
    }

    window.__microDramasNativeMega = {
        start: startNative,
        registerServiceWorker
    };

    const original =
        window.reproducirDrama;

    if (typeof original === 'function') {
        window.reproducirDrama = async function (drama) {
            try {
                if (await startNative(drama)) {
                    return;
                }
            } catch (error) {
                console.warn(
                    '[MEGA NATIVO] Fallback al reproductor anterior:',
                    error
                );

                try {
                    detenerReproductor();
                } catch {}
            }

            return original(drama);
        };
    }
})();
