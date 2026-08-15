"use strict";

/* =========================================================
   MICRO-DRAMAS-ESP — SEEK ROBUSTO

   Corrige únicamente el SEEK del reproductor.

   PRINCIPIO IMPORTANTE:
   Durante un SEEK remoto el vídeo queda pausado. El motor
   normal de streaming deja de descargar cuando alcanza
   BUFFER_OBJETIVO (45 s), por lo que nunca podía alcanzar
   un destino lejano como 7:41.

   Este módulo utiliza una ruta especial de SEEK que continúa
   descargando y alimentando MP4Box hasta que el punto pedido
   realmente aparece en el buffer.
========================================================= */

(function instalarSeekRobusto() {

    const ESPERA_BUFFER = 120000;
    const TOLERANCIA_BUFFER = 4;
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

            const distancia = Math.abs(inicio - tiempo);

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

            await new Promise(resolve => setTimeout(resolve, 100));
        }

        return null;
    }

    /*
     * Streaming exclusivo del SEEK.
     * No utiliza BUFFER_OBJETIVO ni espera a que el vídeo avance.
     * Continúa leyendo bloques hasta alcanzar el tiempo solicitado.
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
        playerState.cursor = offset;
        playerState.streamStarted = true;

        try {
            mp4box.start();
        } catch (error) {
            console.warn("[SEEK] mp4box.start():", error);
        }

        while (
            activo(operationId, generation, token) &&
            !rangoContieneTiempo(destino) &&
            offset < playerState.fileSize
        ) {
            const size = Math.min(
                RANGO_MEDIA,
                playerState.fileSize - offset
            );

            const bloque = await leerRangoMega(
                offset,
                size,
                true
            );

            if (!activo(operationId, generation, token)) {
                return;
            }

            mp4box.appendBuffer(bloque.buffer);

            offset = bloque.end + 1;
            playerState.cursor = offset;

            /* Garantiza que los segmentos recién generados
               hayan pasado a los SourceBuffers antes de revisar. */
            await esperarColas();

            actualizarDiagnostico();

            if (rangoContieneTiempo(destino)) {
                break;
            }

            await new Promise(resolve => setTimeout(resolve, 10));
        }

        if (
            offset >= playerState.fileSize &&
            activo(operationId, generation, token)
        ) {
            try {
                mp4box.flush();
            } catch (error) {
                console.warn("[SEEK] flush:", error);
            }
        }
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

        /* SEEK local: conserva la ruta rápida existente. */
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
                `[SEEK] REMOTO ROBUSTO → ${formatoTiempo(tiempo)}`
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

            /*
             * AQUÍ está la corrección principal:
             * no usamos iniciarStreamingMedia(), porque ese motor
             * se detiene al alcanzar 45 s de buffer mientras el
             * vídeo está pausado. El SEEK necesita seguir leyendo
             * hasta alcanzar el destino.
             */
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
                    `No se pudo localizar el punto ${formatoTiempo(tiempo)} en el buffer.`
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

    /*
     * Sobrescribe el salto ±10 sin modificar app.js.
     * Si el primer salto remoto sigue en curso, el segundo
     * se calcula sobre el último destino pedido, no sobre el
     * currentTime antiguo del elemento video.
     */
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
        "[BARRA] ✓ Motor SEEK robusto instalado."
    );

    /* Fullscreen se mantiene separado del motor de SEEK. */
    try {
        const script = document.createElement("script");
        script.src = "player-fullscreen-fix.js?v=2";
        script.async = false;
        document.head.appendChild(script);
    } catch (error) {
        console.warn(
            "[FULLSCREEN] No se pudo cargar la corrección:",
            error
        );
    }

})();
