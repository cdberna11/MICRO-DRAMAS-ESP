/* =========================================================
   MICRO-DRAMAS-ESP — MOTOR E OFICIAL

   Basado directamente en /mega-test/mega-videostream-test.js.
   El portal usa el mismo VideoStream oficial + MEGAJS + adapter
   createReadStream(start,end), y el mismo <video> HTML5 con
   controles nativos.
========================================================= */
(function () {
    'use strict';

    const MEGAJS_URL = 'https://unpkg.com/megajs/dist/main.browser-es.mjs';
    const VIDEOSTREAM_UMD_URL = 'https://cdn.jsdelivr.net/gh/meganz/videostream@dd8ced8/dist/index.js';
    const VIDEOSTREAM_UMD_FALLBACK = 'https://raw.githubusercontent.com/meganz/videostream/dd8ced8/dist/index.js';

    let VideoStreamClass = null;
    let megaFile = null;
    let videoStream = null;
    let activeRun = 0;
    let player = null;

    function log(...args) {
        console.log('[MOTOR E]', ...args);
    }

    function installMegaVideoStreamShims() {
        if (typeof window.d === 'undefined') window.d = 0;
        if (typeof window.vsNT !== 'function') window.vsNT = fn => setTimeout(fn, 0);
        if (typeof window.queueMicrotask !== 'function') {
            window.queueMicrotask = fn => Promise.resolve().then(fn);
        }
    }

    const loadScript = src => new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`No se pudo cargar VideoStream desde ${src}`));
        document.head.appendChild(script);
    });

    async function loadVideoStream() {
        if (typeof window.videostream === 'function') {
            VideoStreamClass = window.videostream;
            return VideoStreamClass;
        }

        installMegaVideoStreamShims();
        log('Cargando MEGA VideoStream 5.7.0 desde jsDelivr…');

        try {
            await loadScript(VIDEOSTREAM_UMD_URL);
        } catch (error) {
            log('CDN principal falló. Probando GitHub Raw…', error);
            await loadScript(VIDEOSTREAM_UMD_FALLBACK);
        }

        VideoStreamClass = window.videostream;

        if (typeof VideoStreamClass !== 'function') {
            throw new Error('El bundle oficial cargó, pero window.videostream no es una función/clase.');
        }

        log('MEGA VideoStream 5.7.0 cargado correctamente.');
        return VideoStreamClass;
    }

    async function loadMega(url) {
        const { File } = await import(MEGAJS_URL);
        const file = File.fromURL(url);
        await file.loadAttributes();
        log(`MEGA: ${file.name || 'Vídeo'} · ${(Number(file.size || 0) / 2 ** 30).toFixed(2)} GB.`);
        return file;
    }

    function makeFileAdapter(file, token) {
        return {
            filesize: Number(file.size || 0),
            size: Number(file.size || 0),
            name: file.name,
            createReadStream(opts = {}) {
                if (token !== activeRun) throw new Error('Prueba cancelada.');

                const start = Math.max(0, Number.isFinite(opts.start) ? opts.start : 0);
                const end = Number.isFinite(opts.end) ? opts.end : null;
                const megaOptions = { start };
                if (end !== null) megaOptions.end = end;

                log(`MEGA RANGE: ${start.toLocaleString()} → ${end === null ? 'EOF' : end.toLocaleString()}.`);
                const stream = file.download(megaOptions);
                log(`Stream MEGA: pipe=${typeof stream.pipe}, constructor=${stream?.constructor?.name || typeof stream}.`);
                return stream;
            }
        };
    }

    function createPortalPlayer() {
        if (player) return player;

        const overlay = document.createElement('div');
        overlay.id = 'mega-videostream-portal-player';
        overlay.setAttribute('aria-hidden', 'true');

        overlay.innerHTML = `
            <div class="mega-videostream-portal__backdrop"></div>
            <div class="mega-videostream-portal__window" role="dialog" aria-modal="true" aria-label="Reproductor de vídeo">
                <div class="mega-videostream-portal__topbar">
                    <div class="mega-videostream-portal__title"></div>
                    <button type="button" class="mega-videostream-portal__close" aria-label="Cerrar reproductor">×</button>
                </div>
                <video class="mega-videostream-portal__video" controls playsinline preload="auto"></video>
            </div>
        `;

        const style = document.createElement('style');
        style.id = 'mega-videostream-portal-style';
        style.textContent = `
#mega-videostream-portal-player {
    position: fixed;
    inset: 0;
    z-index: 1000000;
    display: none;
    align-items: center;
    justify-content: center;
    background: rgba(0,0,0,.94);
    padding: 20px;
    box-sizing: border-box;
}
#mega-videostream-portal-player.is-open { display: flex; }
.mega-videostream-portal__window {
    width: min(1200px,100%);
    max-height: 95vh;
    display: flex;
    flex-direction: column;
    background: #000;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 25px 80px rgba(0,0,0,.65);
}
.mega-videostream-portal__topbar {
    min-height: 50px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 14px;
    background: #111;
    color: #fff;
}
.mega-videostream-portal__title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 16px;
    font-weight: 600;
}
.mega-videostream-portal__close {
    width: 38px;
    height: 38px;
    flex: 0 0 38px;
    border: 0;
    border-radius: 50%;
    background: rgba(255,255,255,.10);
    color: #fff;
    font-size: 26px;
    line-height: 1;
    cursor: pointer;
}
.mega-videostream-portal__video {
    display: block;
    width: 100%;
    max-height: calc(95vh - 50px);
    aspect-ratio: 16 / 9;
    background: #000;
    object-fit: contain;
}
@media (max-width:700px) {
    #mega-videostream-portal-player { padding:0; }
    .mega-videostream-portal__window {
        width:100%; height:100%; max-height:100%; border-radius:0;
    }
    .mega-videostream-portal__video {
        flex:1; min-height:0; max-height:none; aspect-ratio:auto;
        height:calc(100% - 50px);
    }
}
`;

        document.head.appendChild(style);
        document.body.appendChild(overlay);

        const video = overlay.querySelector('.mega-videostream-portal__video');
        const title = overlay.querySelector('.mega-videostream-portal__title');
        const close = overlay.querySelector('.mega-videostream-portal__close');
        const backdrop = overlay.querySelector('.mega-videostream-portal__backdrop');

        close.addEventListener('click', stop);
        backdrop.addEventListener('click', stop);

        player = { overlay, video, title };
        return player;
    }

    async function stop() {
        activeRun++;

        try { videoStream?.destroy?.(); } catch (error) { log('Destroy:', error); }
        videoStream = null;
        megaFile = null;

        if (player?.video) {
            try {
                player.video.pause();
                player.video.removeAttribute('src');
                player.video.load();
            } catch {}
        }

        if (player?.overlay) {
            player.overlay.classList.remove('is-open');
            player.overlay.setAttribute('aria-hidden', 'true');
        }

        document.body.classList.remove('video-player-open');
    }

    async function start(drama) {
        const url = typeof drama?.video_url === 'string' ? drama.video_url.trim() : '';
        if (!url || !/^https:\/\/(?:www\.)?mega\.(?:nz|co\.nz)\//i.test(url)) return false;

        const token = ++activeRun;
        await stop();
        activeRun = token;

        const current = createPortalPlayer();
        current.title.textContent = drama.title || '';
        current.overlay.classList.add('is-open');
        current.overlay.setAttribute('aria-hidden', 'false');
        document.body.classList.add('video-player-open');

        const v = current.video;
        v.controls = true;
        v.playsInline = true;
        v.preload = 'auto';

        if (typeof registrarVista === 'function') {
            registrarVista(drama).then(resultado => {
                if (!resultado) return;
                drama.views = resultado.views;
                drama.period_views = resultado.period_views;
                drama.top_period_start = resultado.top_period_start;
                drama.top_period_views = resultado.top_period_views;
                if (typeof actualizarVistasTarjeta === 'function') {
                    actualizarVistasTarjeta(drama, resultado.views);
                }
            }).catch(() => {});
        }

        try {
            log('Cargando MEGA VideoStream…');
            const VS = await loadVideoStream();
            if (token !== activeRun) return true;

            megaFile = await loadMega(url);
            if (token !== activeRun) return true;

            const adapter = makeFileAdapter(megaFile, token);
            log('Creando VideoStream(adapter, HTMLMediaElement, opts={})…');
            videoStream = new VS(adapter, v, {});

            v.load();
            log('VideoStream creado correctamente. No se usa Blob ni iframe.');

            try { await v.play(); } catch {}
            return true;
        } catch (error) {
            console.error('[MOTOR E] ERROR DE INICIALIZACIÓN:', error);
            if (token === activeRun) {
                try { v.pause(); v.removeAttribute('src'); v.load(); } catch {}
                const message = document.createElement('div');
                message.style.cssText = 'position:absolute;inset:50px 0 0;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;color:#fff;text-align:center;background:#000;z-index:2;';
                message.textContent = `No se pudo iniciar el vídeo: ${error?.message || error}`;
                current.overlay.querySelector('.mega-videostream-portal__window').appendChild(message);
            }
            return true;
        }
    }

    window.__microDramasMegaVideoStream = { start, stop };

    /* Reemplazo completo: jamás se llama al reproductor anterior. */
    window.reproducirDrama = async function (drama) {
        try {
            const handled = await start(drama);
            if (handled) return;
        } catch (error) {
            console.error('[MOTOR E] Error:', error);
        }
    };

    window.detenerReproductor = stop;
})();
