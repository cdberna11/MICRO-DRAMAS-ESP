"use strict";

/* =========================================================
   MICRO-DRAMAS-ESP
   CORRECCIÓN DEL SEEK DE LA BARRA

   Mantiene intacto el motor de reproducción actual.
   Sustituye únicamente la ruta de SEEK remoto para que:
   1. MP4Box calcule el offset antes de crear la sesión MSE.
   2. La segmentación se inicialice después del seek.
   3. El streaming comience desde el offset RAP correcto.
   4. El reproductor pueda posicionarse mientras el buffer
      remoto todavía está llegando.
========================================================= */

(function instalarSeekRemotoOptimizado() {

    /*
     * 30 segundos era demasiado agresivo para un SEEK remoto
     * en móvil. El reproductor puede estar descargando un bloque
     * de 8 MB cuando todavía no aparece el rango objetivo.
     */
    const ESPERA_BUFFER = 120000;
    const TOLERANCIA_RAP = 6;

    function numeroValido(valor) {
        return Number.isFinite(Number(valor));
    }

    function limpiarMediaSourceAnterior() {
        if (playerState.mp4box) {
            try {
                playerState.mp4box.stop();
            } catch {}
        }

        const mediaSourceAnterior = playerState.mediaSource;
        const urlAnterior = playerState.mediaSourceUrl;

        if (
            mediaSourceAnterior &&
            mediaSourceAnterior.readyState === "open"
        ) {
            try {
                mediaSourceAnterior.endOfStream();
            } catch {}
        }

        if (urlAnterior) {
            try {
                URL.revokeObjectURL(urlAnterior);
            } catch {}
        }

        playerState.mediaSource = null;
        playerState.mediaSourceUrl = null;
        playerState.sourceBuffers = new Map();
        playerState.sourceQueues = new Map();
        playerState.initSegments = new Map();
        playerState.mp4Ready = false;
        playerState.mp4Error = false;
        playerState.streamStarted = false;
        playerState.playbackStarted = false;
    }

    function obtenerRangoBufferObjetivo(tiempo) {
        const video = playerState.videoElement;

        if (
            !video ||
            !video.buffered ||
            video.buffered.length === 0
        ) {
            return null;
        }

        let mejor = null;
        let distancia = Infinity;

        for (let i = 0; i < video.buffered.length; i++) {
            const inicio = video.buffered.start(i);
            const fin = video.buffered.end(i);

            if (tiempo >= inicio && tiempo <= fin) {
                return { inicio, fin, exacto: true };
            }

            const distanciaInicio = Math.abs(inicio - tiempo);

            if (
                distanciaInicio <= TOLERANCIA_RAP &&
                distanciaInicio < distancia
            ) {
                distancia = distanciaInicio;
                mejor = { inicio, fin, exacto: false };
            }
        }

        return mejor;
    }

    function esperarBufferSeek(tiempo, token, operationId, generation) {
        return new Promise(resolve => {
            const inicio = Date.now();

            const revisar = () => {
                if (
                    playerState.stopped ||
                    token !== playerState.seekToken ||
                    operationId !== playerState.operationId ||
                    generation !== playerState.streamGeneration
                ) {
                    resolve(null);
                    return;
                }

                const rango = obtenerRangoBufferObjetivo(tiempo);

                if (rango) {
                    resolve(rango);
                    return;
                }

                if (Date.now() - inicio >= ESPERA_BUFFER) {
                    resolve(null);
                    return;
                }

                setTimeout(revisar, 100);
            };

            revisar();
        });
    }

    async function ejecutarSeekRealOptimizado(destino) {
        const video = playerState.videoElement;

        if (!video || playerState.stopped) return;

        const duration = obtenerDuracionVideo();

        if (!Number.isFinite(duration) || duration <= 0) {
            actualizarEstadoPlayer(
                "La duración del vídeo todavía no está disponible."
            );
            return;
        }

        const tiempo = Math.max(
            0,
            Math.min(duration - 0.05, Number(destino))
        );

        if (!Number.isFinite(tiempo)) return;

        if (playerState.seekInProgress) {
            playerState.pendingSeekTime = tiempo;
            return;
        }

        /* SEEK local: no reconstruimos nada si ya está cargado. */
        if (estaEnBuffer(tiempo)) {
            try {
                if (typeof video.fastSeek === "function") {
                    try {
                        video.fastSeek(tiempo);
                    } catch {
                        video.currentTime = tiempo;
                    }
                } else {
                    video.currentTime = tiempo;
                }

                actualizarControlesVideo();
                return;
            } catch {
                /* Si falla, continuamos con SEEK remoto. */
            }
        }

        const token = ++playerState.seekToken;
        const operationId = playerState.operationId;
        const estabaReproduciendo = !video.paused;
        const generation = ++playerState.streamGeneration;

        playerState.seekInProgress = true;
        playerState.allowAutoplay = estabaReproduciendo;

        try {
            console.log("==========================================");
            console.log(`[SEEK] REMOTO OPTIMIZADO → ${formatoTiempo(tiempo)}`);

            mostrarLoading(`Buscando ${formatoTiempo(tiempo)}...`);
            actualizarEstadoPlayer(`Buscando ${formatoTiempo(tiempo)}...`);

            try {
                video.pause();
            } catch {}

            limpiarMediaSourceAnterior();

            const mp4box = crearNuevoMP4Box();

            if (
                token !== playerState.seekToken ||
                operationId !== playerState.operationId
            ) {
                return;
            }

            actualizarEstadoPlayer("Reconstruyendo estructura MP4...");

            const encontrado = await localizarMOOV(operationId, false);

            if (
                token !== playerState.seekToken ||
                operationId !== playerState.operationId ||
                generation !== playerState.streamGeneration ||
                playerState.stopped
            ) {
                return;
            }

            if (!encontrado || !playerState.mp4Ready) {
                throw new Error(
                    "MP4Box no pudo reconstruir la estructura del vídeo."
                );
            }

            let resultadoSeek;

            try {
                resultadoSeek = mp4box.seek(tiempo, true);
            } catch (error) {
                throw new Error(
                    `MP4Box no pudo realizar SEEK: ${error.message || error}`
                );
            }

            const offsetMega = obtenerOffsetSeek(resultadoSeek);

            console.log("[SEEK] mp4box.seek():", resultadoSeek);
            console.log(
                `[SEEK] Offset MEGA RAP: ${Number(offsetMega).toLocaleString()}`
            );

            if (
                !numeroValido(offsetMega) ||
                offsetMega < 0 ||
                offsetMega >= playerState.fileSize
            ) {
                throw new Error(`Offset MEGA inválido: ${offsetMega}`);
            }

            if (
                token !== playerState.seekToken ||
                operationId !== playerState.operationId
            ) {
                return;
            }

            actualizarEstadoPlayer("Preparando nuevo buffer...");

            await crearSesionMedia(operationId);

            if (
                token !== playerState.seekToken ||
                operationId !== playerState.operationId ||
                generation !== playerState.streamGeneration ||
                playerState.stopped
            ) {
                return;
            }

            playerState.streamStarted = true;
            actualizarEstadoPlayer(`Cargando ${formatoTiempo(tiempo)}...`);

            /*
             * Posicionamos el elemento inmediatamente. El navegador
             * puede quedar esperando al rango MSE mientras nosotros
             * seguimos alimentando el buffer desde el RAP correcto.
             */
            try {
                video.currentTime = tiempo;
            } catch {}

            iniciarStreamingMedia(
                offsetMega,
                operationId,
                generation
            ).catch(error => {
                if (
                    token === playerState.seekToken &&
                    !playerState.stopped
                ) {
                    console.error("[SEEK] Streaming remoto optimizado:", error);
                }
            });

            const rango = await esperarBufferSeek(
                tiempo,
                token,
                operationId,
                generation
            );

            if (
                token !== playerState.seekToken ||
                playerState.stopped
            ) {
                return;
            }

            if (!rango) {
                throw new Error(
                    `No se pudo cargar el punto ${formatoTiempo(tiempo)}.`
                );
            }

            let posicionFinal = tiempo;

            if (!estaEnBuffer(tiempo)) {
                posicionFinal = rango.inicio;
            }

            posicionFinal = Math.max(
                0,
                Math.min(duration - 0.05, posicionFinal)
            );

            video.currentTime = posicionFinal;

            await new Promise(resolve => setTimeout(resolve, 100));

            console.log(
                `[SEEK] Resultado → solicitado ${formatoTiempo(tiempo)} / actual ${formatoTiempo(video.currentTime)}`
            );

            ocultarLoading();
            actualizarControlesVideo();

            if (estabaReproduciendo) {
                playerState.allowAutoplay = true;

                try {
                    await video.play();
                    playerState.playbackStarted = true;
                    actualizarBotonPlay();
                    actualizarEstadoPlayer(
                        `Reproduciendo desde ${formatoTiempo(tiempo)}`
                    );
                } catch {
                    actualizarBotonPlay();
                    actualizarEstadoPlayer(
                        `Listo en ${formatoTiempo(tiempo)} — pulsa PLAY`
                    );
                }
            } else {
                playerState.allowAutoplay = false;
                actualizarBotonPlay();
                actualizarEstadoPlayer(
                    `Pausado en ${formatoTiempo(tiempo)}`
                );
            }

            console.log("[SEEK] ✓ SEEK REMOTO COMPLETADO");

        } catch (error) {
            console.error("[SEEK] ERROR OPTIMIZADO:", error);

            if (token === playerState.seekToken) {
                mostrarLoading(error.message || "No se pudo realizar el salto.");
                actualizarEstadoPlayer(
                    `Error SEEK: ${error.message || error}`
                );
            }

        } finally {
            if (token === playerState.seekToken) {
                playerState.seekInProgress = false;

                const siguiente = playerState.pendingSeekTime;
                playerState.pendingSeekTime = null;

                if (
                    Number.isFinite(siguiente) &&
                    Math.abs(siguiente - Number(video.currentTime)) > 0.75
                ) {
                    setTimeout(() => {
                        ejecutarSeekRealOptimizado(siguiente);
                    }, 50);
                }
            }
        }
    }

    ejecutarSeekReal = ejecutarSeekRealOptimizado;

    ejecutarSeekDesdeBarra = async function ejecutarSeekDesdeBarraOptimizado() {
        const destino = Number(playerState.pendingSeekTime);

        playerState.userSeeking = false;
        playerState.pendingSeekTime = null;

        if (!Number.isFinite(destino)) return;

        console.log(`[BARRA] SEEK optimizado → ${formatoTiempo(destino)}`);
        await ejecutarSeekRealOptimizado(destino);
    };

    console.log("[BARRA] ✓ SEEK remoto optimizado instalado.");

    /*
     * Cargar la corrección de fullscreen después del reproductor.
     * Se mantiene separada para no tocar app.js.
     */
    try {
        const script = document.createElement("script");
        script.src = "player-fullscreen-fix.js?v=1";
        script.async = false;
        document.head.appendChild(script);
    } catch (error) {
        console.warn("[FULLSCREEN] No se pudo cargar la corrección:", error);
    }

})();
