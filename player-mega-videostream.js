/* MICRO-DRAMAS-ESP — Motor E oficial de reproducción MEGA
 * MEGA VideoStream 5.7 + MEGAJS
 * Mantiene la interfaz existente del portal y sustituye únicamente
 * el motor de reproducción por streaming por rangos.
 */
(function () {
    'use strict';

    const MEGAJS_URL = 'https://unpkg.com/megajs/dist/main.browser-es.mjs';
    const VIDEOSTREAM_UMD_URL = 'https://cdn.jsdelivr.net/gh/meganz/videostream@dd8ced8/dist/index.js';
    const VIDEOSTREAM_UMD_FALLBACK = 'https://raw.githubusercontent.com/meganz/videostream/dd8ced8/dist/index.js';

    let VideoStreamClass = null;
    let videoStream = null;
    let megaFile = null;
    let activeRun = 0;
    let controlsWiredFor = null;

    function formatTime(value) {
        if (!Number.isFinite(value) || value < 0) return '0:00';
        const total = Math.floor(value);
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        return h > 0
            ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
            : `${m}:${String(s).padStart(2, '0')}`;
    }

    function blockOriginal(element, handler) {
        if (!element) return;
        element.addEventListener('click', event => {
            event.preventDefault();
            event.stopImmediatePropagation();
            handler(event);
        }, true);
    }

    function updateControls(elements, video) {
        const duration = Number(video.duration);
        const current = Number(video.currentTime) || 0;

        if (Number.isFinite(duration) && duration > 0) {
            elements.progress.value = String((current / duration) * 100);
        }

        elements.time.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
        elements.play.textContent = video.paused ? '▶' : '❚❚';
        elements.mute.textContent = video.muted || video.volume === 0
            ? '🔇'
            : video.volume < 0.5 ? '🔉' : '🔊';
        elements.status.textContent = video.networkState === 2
            ? 'MEGA · DESCARGANDO'
            : video.paused ? 'MEGA · PAUSADO' : 'MEGA · REPRODUCIENDO';
    }

    function exitFullscreen() {
        const fn = document.exitFullscreen || document.webkitExitFullscreen;
        if (!fn) return Promise.resolve();
        try { return Promise.resolve(fn.call(document)).catch(() => {}); }
        catch { return Promise.resolve(); }
    }

    function isFullscreen(elements) {
        return document.fullscreenElement === elements.reproductor ||
            document.webkitFullscreenElement === elements.reproductor;
    }

    function enterFullscreen(elements) {
        const fn = elements.reproductor.requestFullscreen || elements.reproductor.webkitRequestFullscreen;
        if (!fn) return;
        try {
            const result = fn.call(elements.reproductor);
            if (result?.catch) result.catch(() => {});
        } catch {}
    }

    function setupFullscreen(elements, video) {
        const sync = () => {
            const full = isFullscreen(elements);
            elements.reproductor.classList.toggle('native-fullscreen', full);
            if (!full) elements.controls.classList.remove('native-controls-visible');
        };

        document.addEventListener('fullscreenchange', sync);
        document.addEventListener('webkitfullscreenchange', sync);

        blockOriginal(elements.fullscreen, () => {
            if (isFullscreen(elements)) exitFullscreen();
            else enterFullscreen(elements);
        });

        blockOriginal(elements.reproductor, event => {
            if (!isFullscreen(elements)) return;
            if (event.target.closest('.md-player__controls, .md-player__header')) return;

            elements.controls.classList.add('native-controls-visible');
            clearTimeout(elements._nativeHideTimer);
            elements._nativeHideTimer = setTimeout(() => {
                if (!video.paused && isFullscreen(elements)) {
                    elements.controls.classList.remove('native-controls-visible');
                }
            }, 2500);
        });

        video.addEventListener('play', () => {
            if (isFullscreen(elements)) elements.controls.classList.remove('native-controls-visible');
        });
    }

    function installFullscreenCss() {
        if (document.getElementById('mega-videostream-player-style')) return;
        const style = document.createElement('style');
        style.id = 'mega-videostream-player-style';
        style.textContent = `
.md-player.native-fullscreen { padding:0 !important; background:#000 !important; }
.md-player.native-fullscreen .md-player__window { width:100% !important; height:100% !important; max-height:none !important; border:0 !important; border-radius:0 !important; }
.md-player.native-fullscreen .md-player__area { flex:1 !important; min-height:0 !important; aspect-ratio:auto !important; }
.md-player.native-fullscreen .md-player__controls { display:none !important; }
.md-player.native-fullscreen .md-player__controls.native-controls-visible { display:block !important; position:absolute; left:0; right:0; bottom:0; z-index:10; }
.md-player.native-fullscreen .md-player__header { position:absolute; left:0; right:0; top:0; z-index:11; background:linear-gradient(rgba(0,0,0,.75),transparent); }
`;
        document.head.appendChild(style);
    }

    function wireControls(elements, video) {
        if (controlsWiredFor === video) return;
        controlsWiredFor = video;

        const seek = seconds => {
            const duration = Number(video.duration);
            if (!Number.isFinite(duration) || duration <= 0) return;
            video.currentTime = Math.max(0, Math.min(duration - 0.05, (Number(video.currentTime) || 0) + seconds));
            updateControls(elements, video);
        };

        blockOriginal(elements.play, () => {
            if (video.paused) video.play().catch(() => {});
            else video.pause();
        });
        blockOriginal(elements.retroceder, () => seek(-10));
        blockOriginal(elements.avanzar, () => seek(10));
        blockOriginal(elements.mute, () => {
            video.muted = !video.muted;
            updateControls(elements, video);
        });
        blockOriginal(elements.volume, () => {
            video.volume = Number(elements.volume.value);
            video.muted = video.volume === 0;
            updateControls(elements, video);
        });
        blockOriginal(elements.progress, () => {
            const duration = Number(video.duration);
            if (!Number.isFinite(duration) || duration <= 0) return;
            const target = duration * (Number(elements.progress.value) / 100);
            video.currentTime = Math.max(0, Math.min(duration - 0.05, target));
            updateControls(elements, video);
        });
        elements.progress.addEventListener('input', event => {
            event.stopImmediatePropagation();
            const duration = Number(video.duration);
            if (Number.isFinite(duration) && duration > 0) {
                const target = duration * (Number(elements.progress.value) / 100);
                elements.time.textContent = `${formatTime(target)} / ${formatTime(duration)}`;
            }
        }, true);

        blockOriginal(elements.cerrar, () => closePlayer(elements, video));

        ['loadedmetadata','durationchange','timeupdate','progress','playing','pause','seeked','waiting','stalled'].forEach(type => {
            video.addEventListener(type, () => updateControls(elements, video));
        });
        video.addEventListener('loadedmetadata', () => elements.loading.classList.add('is-hidden'));
        video.addEventListener('canplay', () => elements.loading.classList.add('is-hidden'));
        video.addEventListener('playing', () => elements.loading.classList.add('is-hidden'));
        video.addEventListener('waiting', () => {
            elements.loadingMessage.textContent = 'Cargando...';
            elements.loading.classList.remove('is-hidden');
        });
        video.addEventListener('error', () => {
            const code = video.error?.code || 0;
            elements.loadingMessage.textContent = `No se pudo reproducir el vídeo. Error ${code}.`;
            elements.loading.classList.remove('is-hidden');
            elements.status.textContent = `MEGA · ERROR ${code}`;
        });

        setupFullscreen(elements, video);
    }

    function closePlayer(elements, video) {
        clearTimeout(elements._nativeHideTimer);
        activeRun++;
        try { videoStream?.destroy?.(); } catch {}
        videoStream = null;
        megaFile = null;
        video.pause();
        exitFullscreen().finally(() => {
            try { video.removeAttribute('src'); video.load(); } catch {}
            elements.reproductor.classList.remove('native-fullscreen', 'is-open');
            elements.reproductor.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('video-player-open');
            if (window.playerState) {
                playerState.open = false;
                playerState.stopped = true;
                playerState.loading = false;
            }
        });
    }

    function installMegaVideoStreamShims() {
        if (typeof window.d === 'undefined') window.d = 0;
        if (typeof window.vsNT !== 'function') window.vsNT = fn => setTimeout(fn, 0);
        if (typeof window.queueMicrotask !== 'function') window.queueMicrotask = fn => Promise.resolve().then(fn);
    }

    const loadScript = src => new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`No se pudo cargar VideoStream desde ${src}`));
        document.head.appendChild(script);
    });

    async function loadVideoStream() {
        if (typeof window.videostream === 'function') {
            VideoStreamClass = window.videostream;
            return VideoStreamClass;
        }
        installMegaVideoStreamShims();
        try { await loadScript(VIDEOSTREAM_UMD_URL); }
        catch { await loadScript(VIDEOSTREAM_UMD_FALLBACK); }
        VideoStreamClass = window.videostream;
        if (typeof VideoStreamClass !== 'function') throw new Error('MEGA VideoStream no pudo inicializarse.');
        return VideoStreamClass;
    }

    async function loadMegaFile(url) {
        const { File } = await import(MEGAJS_URL);
        const file = File.fromURL(url);
        await file.loadAttributes();
        return file;
    }

    function makeFileAdapter(file, token) {
        return {
            filesize: Number(file.size || 0),
            size: Number(file.size || 0),
            name: file.name,
            createReadStream(options = {}) {
                if (token !== activeRun) throw new Error('Reproducción cancelada.');
                const start = Math.max(0, Number.isFinite(options.start) ? options.start : 0);
                const end = Number.isFinite(options.end) ? options.end : null;
                const megaOptions = { start };
                if (end !== null) megaOptions.end = end;
                return file.download(megaOptions);
            }
        };
    }

    async function startMegaVideoStream(drama) {
        const url = typeof drama?.video_url === 'string' ? drama.video_url.trim() : '';
        if (!url || !/^https:\/\/(?:www\.)?mega\.(?:nz|co\.nz)\//i.test(url)) return false;

        if (window.playerState?.open) {
            try { closePlayer(playerState.playerElements, playerState.playerElements.video); } catch {}
        }

        crearReproductor();
        installFullscreenCss();

        const elements = playerState.playerElements;
        const video = elements.video;
        const token = ++activeRun;

        playerState.open = true;
        playerState.loading = true;
        playerState.stopped = false;
        playerState.drama = drama;
        playerState.playbackStarted = false;

        elements.titulo.textContent = drama.title || '';
        elements.progress.value = '0';
        elements.time.textContent = '0:00 / 0:00';
        elements.status.textContent = 'MEGA · CONECTANDO';
        elements.loadingMessage.textContent = 'Conectando con MEGA...';
        elements.loading.classList.remove('is-hidden');
        elements.reproductor.classList.add('is-open');
        elements.reproductor.setAttribute('aria-hidden', 'false');
        document.body.classList.add('video-player-open');

        if (typeof registrarVista === 'function') {
            registrarVista(drama).then(resultado => {
                if (!resultado) return;
                drama.views = resultado.views;
                drama.period_views = resultado.period_views;
                drama.top_period_start = resultado.top_period_start;
                drama.top_period_views = resultado.top_period_views;
                if (typeof actualizarVistasTarjeta === 'function') actualizarVistasTarjeta(drama, resultado.views);
            }).catch(() => {});
        }

        video.crossOrigin = 'anonymous';
        video.preload = 'auto';
        video.controls = false;
        wireControls(elements, video);
        updateControls(elements, video);

        try {
            const VS = await loadVideoStream();
            if (token !== activeRun) return true;
            megaFile = await loadMegaFile(url);
            if (token !== activeRun) return true;

            const adapter = makeFileAdapter(megaFile, token);
            videoStream = new VS(adapter, video, {});
            video.load();

            elements.status.textContent = 'MEGA · LISTO';
            elements.loadingMessage.textContent = 'Listo para reproducir.';

            try {
                await video.play();
                playerState.playbackStarted = true;
                elements.loading.classList.add('is-hidden');
                updateControls(elements, video);
            } catch {
                elements.loading.classList.add('is-hidden');
                elements.status.textContent = 'MEGA · LISTO — pulsa PLAY';
                updateControls(elements, video);
            }

            console.log('[MEGA VIDEOSTREAM] Motor E activado:', drama.title);
            return true;
        } catch (error) {
            console.error('[MEGA VIDEOSTREAM] Error:', error);
            elements.status.textContent = 'MEGA · ERROR';
            elements.loadingMessage.textContent = `No se pudo reproducir el vídeo. ${error?.message || error}`;
            elements.loading.classList.remove('is-hidden');
            try { videoStream?.destroy?.(); } catch {}
            videoStream = null;
            megaFile = null;
            return false;
        }
    }

    window.__microDramasMegaVideoStream = {
        start: startMegaVideoStream,
        stop: () => {
            if (window.playerState?.playerElements) closePlayer(playerState.playerElements, playerState.playerElements.video);
        }
    };

    const original = window.reproducirDrama;
    if (typeof original === 'function') {
        window.reproducirDrama = async function (drama) {
            try {
                if (await startMegaVideoStream(drama)) return;
            } catch (error) {
                console.warn('[MEGA VIDEOSTREAM] Fallback al reproductor anterior:', error);
            }
            return original(drama);
        };
    }
})();
