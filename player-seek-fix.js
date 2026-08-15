"use strict";

/* =========================================================
   MICRO-DRAMAS-ESP — SEEK ROBUSTO v2

   OBJETIVO:
   - SEEK lejano desde la barra sin quedar atrapado en 8 MB.
   - SEEK +/-10 consecutivos sin usar currentTime obsoleto.
   - Descarga progresiva hasta que el tiempo solicitado exista
     realmente en SourceBuffer.
   - Mostrar progreso REAL de bytes descargados durante el SEEK.

   IMPORTANTE:
   RANGO_MEDIA (8 MB) es el tamaño de cada petición normal.
   NO es el tamaño máximo del vídeo ni el buffer disponible.
   Para SEEK lejano usamos bloques mayores y una espera mucho
   más amplia, porque un punto a 20+ minutos puede requerir
   decenas o cientos de MB dependiendo del bitrate del MP4.
========================================================= */

(function instalarSeekRobusto() {

    /*
     * Un SEEK remoto puede necesitar bastante más de 120 s en
     vídeos pesados. No usamos un timeout corto que confunda
     "todavía descargando" con "SEEK imposible".
     */
    const ESPERA_BUFFER = 10 * 60 * 1000;

    const TOLERANCIA_BUFFER = 4;

    /*
     * Tamaño dedicado para SEEK remoto.
     * 8 MB era correcto como bloque normal, pero demasiado
     * pequeño para saltos lejanos: genera demasiadas peticiones.
     */
    const RANGO_SEEK = 32 * 1024 * 1024;

    /* Máximo tiempo de espera para que MSE drene sus colas. */
    const TIMEOUT_COLA_SEEK = 8000;

    let ultimoDestinoSeek = null;


    function activo(operationId, generation, token) {
        return (
            !playerState.stopped &&
            operationId === playerState.operationId &&
            generation === playerState.streamGeneration &&
            token === playerState.seekToken
        );
    }


    function limpiarMediaSourceAnterior() {
        if (playerState.mp4box) {
            try {
                playerState.mp4box.stop();
            } catch {}
        }

        const mediaSource = playerState.mediaSource;
        const url = playerState.mediaSourceUrl;

        if (mediaSource && mediaSource.readyState === "open") {
            try {
                mediaSource.endOfStream();
            } catch {}
        }

        if (url) {
            try {
                URL.revokeObjectURL(url);
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


    function rangoContieneTiempo(tiempo) {
        const video = playerState.videoElement;

        if (!video?.buffered?.length) {
            return null;
        }

        let cercano = null;
        let menor = Infinity;

        for (let i = 0; i < video.buffered.length; i++) {
            const inicio = video.buffered.start(i);
            const fin = video.buffered.end(i);

            if (tiempo >= inicio && tiempo <= fin) {
                return { inicio, fin, exacto: true };
            }

            const distancia = Math.min(
                Math.abs(inicio - tiempo),
                Math.abs(fin - tiempo)
            );

            if (distancia <= TOLERANCIA_BUFFER && distancia < menor) {
                menor = distancia;
                cercano = { inicio, fin, exacto: false };
            }
        }

        return cercano;
    }


    async function esperarBufferSeek(tiempo, operationId, generation, token) {
        const inicio = Date.now();

        while (Date.now() - inicio < ESPERA_BUFFER) {
            if (!activo(operationId, generation, token)) {
                return null;
            }

            const rango = rangoContieneTiempo(tiempo);

            if (rango) {
                return rango;
            }

            await new Promise(resolve => setTimeout(resolve, 150));
        }

        return null;
    }


    async function esperarColasSeek(operationId, generation, token) {
        const inicio = Date.now();

        while (Date.now() - inicio < TIMEOUT_COLA_SEEK) {
            if (!activo(operationId, generation, token)) {
                return false;
            }

            let pendiente = false;

            for (const queue of playerState.sourceQueues.values()) {
                if (queue.length > 0) {
                    pendiente = true;
                    break;
                }
            }

            if (!pendiente) {
                for (const sourceBuffer of playerState.sourceBuffers.values()) {
                    if (sourceBuffer.updating) {
                        pendiente = true;
                        break;
                    }
                }
            }

            if (!pendiente) {
                return true;
            }

            await new Promise(resolve => setTimeout(resolve, 50));
        }

        console.warn("[SEEK] MSE tarda demasiado en drenar la cola; continuamos descargando.");
        return true;
    }


    function mostrarProgresoSeek(bytesSeek, destino, offsetActual) {
        const bytes = formatoBytes(bytesSeek);
        const offset = formatoBytes(offsetActual);

        const mensaje =
            `Descargando ${bytes} · destino ${formatoTiempo(destino)} · posición archivo ${offset}`;

        actualizarEstadoPlayer(mensaje);
        mostrarLoading(mensaje);
        actualizarDiagnostico();

        console.log(
            `[SEEK] ${mensaje}`
        );
    }


    /*
     * Streaming EXCLUSIVO del SEEK.
     *
     * No utiliza BUFFER_OBJETIVO (45 s), porque el vídeo está
     * pausado mientras buscamos. El único criterio para detener
     * la descarga es que el destino exista en SourceBuffer.
     */
    async function descargarHastaDestino(
        offsetInicial,
        destino,
        operationId,
        generation,
        token
    ) {
        const mp4box = playerState.mp4box;

        if (!mp4box) {
            throw new Error("MP4Box no disponible durante SEEK.");
        }

        let offset = Math.max(0, Math.floor(offsetInicial));
        const offsetInicio = offset;
        let bytesSeek = 0;
        let bloques = 0;

        playerState.cursor = offset;
        playerState.streamStarted = true;

        try {
            mp4box.start();
        } catch (error) {
            console.warn("[SEEK] mp4box.start():", error);
        }

        mostrarProgresoSeek(bytesSeek, destino, offset);

        while (
            activo(operationId, generation, token) &&
            !rangoContieneTiempo(destino) &&
            offset < playerState.fileSize
        ) {
            const size = Math.min(
                RANGO_SEEK,
                playerState.fileSize - offset
            );

            const bloque = await leerRangoMega(
                offset,
                size,
                false
            );

            if (!activo(operationId, generation, token)) {
                return;
            }

            bloques++;
            bytesSeek += bloque.size;

            mp4box.appendBuffer(bloque.buffer);

            offset = bloque.end + 1;
            playerState.cursor = offset;

            mostrarProgresoSeek(
                bytesSeek,
                destino,
                offset
            );

            /*
             * Dejamos que MSE procese los segmentos recién
             * generados. No imponemos el timeout global de 30 s
             * del streaming normal.
             */
            await esperarColasSeek(
                operationId,
                generation,
                token
            );

            if (rangoContieneTiempo(destino)) {
                console.log(
                    `[SEEK] ✓ Destino ${formatoTiempo(destino)} localizado tras ${bloques} bloque(s), ${formatoBytes(bytesSeek)} descargados.`
                );
                break;
            }

            await new Promise(resolve => setTimeout(resolve, 10));
        }

        if (
            !rangoContieneTiempo(destino) &&
            offset >= playerState.fileSize &&
            activo(operationId, generation, token)
        ) {
            try {
                mp4box.flush();
            } catch (error) {
                console.warn("[SEEK] flush:", error);
            }
        }

        console.log(
            `[SEEK] Fin descarga: inicio ${formatoBytes(offsetInicio)}, final ${formatoBytes(offset)}, bytes SEEK ${formatoBytes(bytesSeek)}`
        );
    }


    async function ejecutarSeekRealOptimizado(destino) {
        const video = playerState.videoElement;

        if (!video || playerState.stopped) {
            return;
        }

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

        if (!Number.isFinite(tiempo)) {
            return;
        }

        ultimoDestinoSeek = tiempo;

        /*
         * Si ya existe un SEEK, no iniciamos otro MSE.
         * Guardamos solamente el último destino solicitado.
         */
        if (playerState.seekInProgress) {
            playerState.pendingSeekTime = tiempo;
            console.log(
                `[SEEK] En cola → ${formatoTiempo(tiempo)}`
            );
            return;
        }

        /* SEEK local: si ya existe el tiempo en MSE, no hay que
           reconstruir el archivo. */
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

                setTimeout(() => {
                    if (
                        !playerState.stopped &&
                        !playerState.seekInProgress &&
                        Math.abs(Number(video.currentTime) - tiempo) > 0.75
                    ) {
                        ejecutarSeekRealOptimizado(tiempo);
                    }
                }, 200);

                return;
            } catch {
                /* Continuamos con SEEK remoto. */
            }
        }

        const token = ++playerState.seekToken;
        const operationId = playerState.operationId;
        const generation = ++playerState.streamGeneration;
        const estabaReproduciendo = !video.paused;

        playerState.seekInProgress = true;
        playerState.allowAutoplay = estabaReproduciendo;
        playerState.pendingSeekTime = null;

        try {
            console.log("==========================================");
            console.log(
                `[SEEK] REMOTO → ${formatoTiempo(tiempo)}`
            );

            mostrarLoading(`Buscando ${formatoTiempo(tiempo)}...`);
            actualizarEstadoPlayer(
                `Buscando ${formatoTiempo(tiempo)}...`
            );

            try {
                video.pause();
            } catch {}

            limpiarMediaSourceAnterior();

            crearNuevoMP4Box();

            if (!activo(operationId, generation, token)) {
                return;
            }

            actualizarEstadoPlayer(
                "Reconstruyendo estructura MP4..."
            );

            const encontrado = await localizarMOOV(
                operationId,
                false
            );

            if (!activo(operationId, generation, token)) {
                return;
            }

            if (!encontrado || !playerState.mp4Ready) {
                throw new Error(
                    "MP4Box no pudo reconstruir la estructura del vídeo."
                );
            }

            const nuevaDuracion = obtenerDuracionMP4(
                playerState.mp4Info
            );

            if (nuevaDuracion > 0) {
                playerState.duration = nuevaDuracion;
            }

            actualizarEstadoPlayer(
                `Calculando posición ${formatoTiempo(tiempo)}...`
            );

            let resultadoSeek;

            try {
                resultadoSeek = playerState.mp4box.seek(
                    tiempo,
                    true
                );
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
                !Number.isFinite(offsetMega) ||
                offsetMega < 0 ||
                offsetMega >= playerState.fileSize
            ) {
                throw new Error(`Offset MEGA inválido: ${offsetMega}`);
            }

            actualizarEstadoPlayer("Preparando nuevo buffer...");

            await crearSesionMedia(operationId);

            if (!activo(operationId, generation, token)) {
                return;
            }

            actualizarEstadoPlayer(
                `Cargando ${formatoTiempo(tiempo)}...`
            );

            await descargarHastaDestino(
                offsetMega,
                tiempo,
                operationId,
                generation,
                token
            );

            if (!activo(operationId, generation, token)) {
                return;
            }

            const rango = await esperarBufferSeek(
                tiempo,
                operationId,
                generation,
                token
            );

            if (!rango) {
                throw new Error(
                    `No se pudo localizar el punto ${formatoTiempo(tiempo)} en el buffer después de descargar ${formatoBytes(playerState.totalDownloaded)}.`
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

            await new Promise(resolve => setTimeout(resolve, 150));

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

            console.log("[SEEK] ✓ SEEK COMPLETADO");

        } catch (error) {
            console.error("[SEEK] ERROR ROBUSTO:", error);

            if (token === playerState.seekToken) {
                mostrarLoading(
                    error.message || "No se pudo realizar el salto."
                );
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
                    Math.abs(
                        siguiente - Number(video.currentTime)
                    ) > 0.75
                ) {
                    ultimoDestinoSeek = siguiente;

                    setTimeout(() => {
                        ejecutarSeekRealOptimizado(siguiente);
                    }, 50);
                } else {
                    ultimoDestinoSeek = null;
                }
            }
        }
    }


    ejecutarSaltoSegundos = function ejecutarSaltoSegundosRobusto(segundos) {
        const video = playerState.videoElement;

        if (!video) {
            return;
        }

        const duration = obtenerDuracionVideo();

        if (!Number.isFinite(duration) || duration <= 0) {
            actualizarEstadoPlayer(
                "La duración del vídeo todavía no está disponible."
            );
            return;
        }

        let base;

        if (playerState.seekInProgress) {
            base = Number.isFinite(ultimoDestinoSeek)
                ? ultimoDestinoSeek
                : Number(video.currentTime);
        } else {
            base = Number(video.currentTime);
        }

        if (!Number.isFinite(base)) {
            return;
        }

        const destino = Math.max(
            0,
            Math.min(
                duration - 0.05,
                base + Number(segundos)
            )
        );

        console.log(
            `[SEEK] Botón robusto ${segundos > 0 ? "+" : ""}${segundos}s → ${formatoTiempo(destino)}`
        );

        ultimoDestinoSeek = destino;
        ejecutarSeekRealOptimizado(destino);
    };


    ejecutarSeekReal = ejecutarSeekRealOptimizado;


    ejecutarSeekDesdeBarra = async function ejecutarSeekDesdeBarraRobusto() {
        const destino = Number(playerState.pendingSeekTime);

        playerState.userSeeking = false;
        playerState.pendingSeekTime = null;

        if (!Number.isFinite(destino)) {
            return;
        }

        ultimoDestinoSeek = destino;

        console.log(
            `[BARRA] SEEK robusto → ${formatoTiempo(destino)}`
        );

        await ejecutarSeekRealOptimizado(destino);
    };


    console.log(
        "[BARRA] ✓ Motor SEEK robusto v2 instalado."
    );


    /* Fullscreen se mantiene separado del motor de SEEK. */
    try {
        const script = document.createElement("script");
        script.src = "player-fullscreen-fix.js?v=3";
        script.async = false;
        document.head.appendChild(script);
    } catch (error) {
        console.warn(
            "[FULLSCREEN] No se pudo cargar la corrección:",
            error
        );
    }

})();
