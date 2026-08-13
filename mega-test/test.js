/* =========================================================
   MICRO-DRAMAS-ESP
   LABORATORIO MEGA + MEGAJS + MP4BOX + MEDIASOURCE

   STREAMING CONTINUO ADAPTATIVO

   Flujo:

   MEGA
      ↓
   MEGAJS
      ↓
   rangos del archivo
      ↓
   MP4Box
      ↓
   segmentos MP4
      ↓
   MediaSource
      ↓
   SourceBuffer vídeo/audio
      ↓
   <video>

   IMPORTANTE:

   Reproduciendo:
      objetivo = 30 s
      máximo  = 45 s

   Pausado:
      objetivo = 120 s
      máximo  = 120 s
========================================================= */


/* =========================================================
   IMPORTACIONES
========================================================= */

import {
    File as MEGAFile
} from "https://unpkg.com/megajs/dist/main.browser-es.mjs";

import * as MP4Box
from "https://cdn.jsdelivr.net/npm/mp4box@2.4.1/dist/mp4box.all.mjs";


/* =========================================================
   VIDEOS
========================================================= */

const VIDEOS = {

    video1: {
        name: "EL OJO DE LA RIQUEZA",
        url: "https://mega.nz/file/ulBR1aaC#90sGdNoolQrZyf_1T9uTht2qB9kKjb7bQGV0ycxXSlg"
    },

    video2: {
        name: "DE LA TRAICIÓN AL TRONO",
        url: "https://mega.nz/file/PlRVAaqK#q6k9C9wVySYblyzsk9G8w0D4DyJTc04q47_oSBAd8LU"
    }

};


/* =========================================================
   CONFIGURACIÓN
========================================================= */

const INITIAL_RANGE_SIZE =
    4 * 1024 * 1024;


/*
 * Rango utilizado para alimentar MP4Box.
 *
 * 8 MB por solicitud.
 */

const MEDIA_RANGE_SIZE =
    8 * 1024 * 1024;


/*
 * Buffer normal.
 */

const PLAYING_TARGET_BUFFER =
    30;

const PLAYING_MAX_BUFFER =
    45;


/*
 * Buffer durante pausa.
 */

const PAUSED_TARGET_BUFFER =
    120;

const PAUSED_MAX_BUFFER =
    120;


/*
 * Buffer considerado bajo.
 */

const LOW_BUFFER =
    8;


/*
 * Intervalo del loop.
 */

const BUFFER_CHECK_INTERVAL =
    500;


/*
 * Número de muestras por segmento.
 */

const SEGMENT_SAMPLES =
    30;


/*
 * Una conexión MEGA a la vez.
 */

const MAX_PARALLEL_REQUESTS =
    1;


/*
 * Tiempo máximo buscando MOOV.
 */

const MOOV_TIMEOUT =
    30000;


/*
 * Máximo de solicitudes de streaming.
 */

const MAX_STREAM_REQUESTS =
    5000;


/*
 * Límite de datos para el análisis dirigido.
 */

const DIRECTED_ANALYSIS_LIMIT =
    64 *
    1024 *
    1024;


/* =========================================================
   ELEMENTOS HTML
========================================================= */

const videoSelect =
    document.getElementById(
        "video-select"
    );

const btnInfo =
    document.getElementById(
        "btn-info"
    );

const btnChunk =
    document.getElementById(
        "btn-chunk"
    );

const statusElement =
    document.getElementById(
        "status"
    );

const fileNameElement =
    document.getElementById(
        "file-name"
    );

const fileSizeElement =
    document.getElementById(
        "file-size"
    );

const fileTypeElement =
    document.getElementById(
        "file-type"
    );

const progressBar =
    document.getElementById(
        "progress-bar"
    );

const progressText =
    document.getElementById(
        "progress-text"
    );

const progressPercent =
    document.getElementById(
        "progress-percent"
    );

const resultBox =
    document.getElementById(
        "result-box"
    );

const diagnosticLog =
    document.getElementById(
        "diagnostic-log"
    );


/* =========================================================
   VALIDACIÓN HTML
========================================================= */

if (
    !videoSelect ||
    !btnInfo ||
    !btnChunk ||
    !statusElement ||
    !fileNameElement ||
    !fileSizeElement ||
    !fileTypeElement ||
    !progressBar ||
    !progressText ||
    !progressPercent ||
    !resultBox ||
    !diagnosticLog
) {

    throw new Error(
        "Faltan elementos HTML necesarios en la página de prueba."
    );

}


/* =========================================================
   ESTADO GENERAL
========================================================= */

let currentFile =
    null;

let currentVideo =
    null;

let fileSize =
    0;


/* =========================================================
   OPERACIÓN
========================================================= */

let activeOperation =
    null;

let operationId =
    0;


/* =========================================================
   MEGA
========================================================= */

let totalDownloaded =
    0;

let totalRequests =
    0;

let requestedRanges =
    new Set();


/* =========================================================
   MP4BOX
========================================================= */

let mp4box =
    null;

let mp4Ready =
    false;

let mp4Error =
    false;

let mp4Info =
    null;


/*
 * Posición que MP4Box informa.

 * IMPORTANTE:
 * NO controla el cursor MEGA.
 */

let mp4SuggestedPosition =
    null;


/* =========================================================
   MEDIASOURCE
========================================================= */

let mediaSource =
    null;

let mediaSourceUrl =
    null;


/* =========================================================
   VIDEO
========================================================= */

let videoElement =
    null;


/* =========================================================
   SOURCEBUFFERS
========================================================= */

const sourceBuffers =
    new Map();

const sourceQueues =
    new Map();


/* =========================================================
   SEGMENTACIÓN
========================================================= */

let totalSegments =
    0;

let totalAppendedBytes =
    0;


/* =========================================================
   STREAMING
========================================================= */

let streamingActive =
    false;

let streamingStopped =
    false;

let streamingLoopRunning =
    false;

let fetchingRange =
    false;


/*
 * Cursor físico real del archivo.

 * Este es el que controla las solicitudes MEGA.
 */

let mediaCursor =
    null;


/*
 * Último rango realmente enviado a MP4Box.
 */

let lastAppendedStart =
    -1;

let lastAppendedEnd =
    -1;


/*
 * Primer rango de datos multimedia.

 * El primer bloque ya fue enviado a MP4Box.
 */

let firstMediaEnd =
    -1;


/* =========================================================
   REPRODUCCIÓN
========================================================= */

let playbackStarted =
    false;

let playbackRequested =
    false;

let userPaused =
    false;


/* =========================================================
   INTERFAZ
========================================================= */

let startPlayerButton =
    null;

let stopPlayerButton =
    null;

let playerInfoElement =
    null;


/* =========================================================
   UTILIDADES
========================================================= */

function getErrorMessage(
    error
) {

    if (
        error instanceof Error
    ) {

        return error.message;

    }

    if (
        error &&
        typeof error.message === "string"
    ) {

        return error.message;

    }

    return String(
        error
    );

}


/* =========================================================
   LOG
========================================================= */

function log(
    message,
    type = "info"
) {

    const line =
        document.createElement(
            "div"
        );

    line.className =
        `log-line log-${type}`;


    const time =
        new Date().toLocaleTimeString();


    line.textContent =
        `[${time}] ${message}`;


    diagnosticLog.appendChild(
        line
    );


    diagnosticLog.scrollTop =
        diagnosticLog.scrollHeight;

}


/* =========================================================
   STATUS
========================================================= */

function setStatus(
    text,
    type = "idle"
) {

    statusElement.textContent =
        text;

    statusElement.className =
        `status status-${type}`;

}


/* =========================================================
   BYTES
========================================================= */

function formatBytes(
    bytes
) {

    if (
        !Number.isFinite(bytes) ||
        bytes <= 0
    ) {

        return "0 B";

    }


    const units = [
        "B",
        "KB",
        "MB",
        "GB",
        "TB"
    ];


    const exponent =
        Math.min(
            Math.floor(
                Math.log(bytes) /
                Math.log(1024)
            ),
            units.length - 1
        );


    const value =
        bytes /
        Math.pow(
            1024,
            exponent
        );


    return (
        value.toFixed(
            exponent === 0
                ? 0
                : 2
        ) +
        " " +
        units[exponent]
    );

}


/* =========================================================
   TIEMPO
========================================================= */

function formatTime(
    seconds
) {

    if (
        !Number.isFinite(seconds)
    ) {

        return "—";

    }


    const total =
        Math.max(
            0,
            Math.floor(
                seconds
            )
        );


    const hours =
        Math.floor(
            total /
            3600
        );


    const minutes =
        Math.floor(
            (
                total %
                3600
            ) /
            60
        );


    const secs =
        total %
        60;


    if (
        hours > 0
    ) {

        return (
            `${hours}:` +
            `${String(minutes).padStart(2, "0")}:` +
            `${String(secs).padStart(2, "0")}`
        );

    }


    return (
        `${minutes}:` +
        `${String(secs).padStart(2, "0")}`
    );

}


/* =========================================================
   VIDEO SELECCIONADO
========================================================= */

function getSelectedVideo() {

    return VIDEOS[
        videoSelect.value
    ];

}


/* =========================================================
   PROGRESO
========================================================= */

function updateProgress() {

    progressText.textContent =
        `${formatBytes(totalDownloaded)} recibidos`;


    if (
        fileSize <= 0
    ) {

        progressPercent.textContent =
            "0%";

        progressBar.style.width =
            "0%";

        return;

    }


    const percent =
        Math.min(
            100,
            (
                totalDownloaded /
                fileSize
            ) *
            100
        );


    progressPercent.textContent =
        `${percent.toFixed(2)}%`;


    progressBar.style.width =
        `${percent}%`;

}


/* =========================================================
   BUFFER DEL VIDEO
========================================================= */

function getBufferState() {

    if (
        !videoElement
    ) {

        return {
            start: 0,
            end: 0,
            ahead: 0,
            total: 0
        };

    }


    const currentTime =
        Number.isFinite(
            videoElement.currentTime
        )
            ? videoElement.currentTime
            : 0;


    const ranges =
        videoElement.buffered;


    if (
        !ranges ||
        ranges.length === 0
    ) {

        return {
            start: 0,
            end: 0,
            ahead: 0,
            total: 0
        };

    }


    let activeStart =
        null;

    let activeEnd =
        null;


    for (
        let i = 0;
        i < ranges.length;
        i++
    ) {

        const start =
            ranges.start(i);

        const end =
            ranges.end(i);


        if (
            currentTime >= start &&
            currentTime <= end
        ) {

            activeStart =
                start;

            activeEnd =
                end;

            break;

        }

    }


    if (
        activeStart === null &&
        currentTime <
            ranges.start(0)
    ) {

        activeStart =
            ranges.start(0);

        activeEnd =
            ranges.end(0);

    }


    if (
        activeStart === null
    ) {

        return {
            start: 0,
            end: 0,
            ahead: 0,
            total: 0
        };

    }


    const ahead =
        Math.max(
            0,
            activeEnd -
            currentTime
        );


    let total =
        0;


    for (
        let i = 0;
        i < ranges.length;
        i++
    ) {

        total +=
            Math.max(
                0,
                ranges.end(i) -
                ranges.start(i)
            );

    }


    return {
        start:
            activeStart,

        end:
            activeEnd,

        ahead:
            ahead,

        total:
            total
    };

}


/* =========================================================
   INFORMACIÓN DEL REPRODUCTOR
========================================================= */

function updatePlayerInfo() {

    if (
        !playerInfoElement
    ) {

        return;

    }


    const buffer =
        getBufferState();


    const current =
        videoElement
            ? videoElement.currentTime
            : 0;


    const duration =
        videoElement &&
        Number.isFinite(
            videoElement.duration
        )
            ? videoElement.duration
            : 0;


    let mode =
        "ESPERA";


    if (
        streamingActive
    ) {

        if (
            videoElement &&
            videoElement.paused
        ) {

            mode =
                "PRECARGA EN PAUSA";

        } else {

            mode =
                "STREAMING ACTIVO";

        }

    }


    playerInfoElement.textContent =
        [
            `Modo: ${mode}`,

            `Posición: ${formatTime(current)}`,

            `Duración: ${formatTime(duration)}`,

            `Buffer: ${buffer.ahead.toFixed(1)} s`,

            `Buffer total: ${buffer.total.toFixed(1)} s`,

            `MEGA: ${formatBytes(totalDownloaded)}`,

            `Solicitudes: ${totalRequests}`,

            `Segmentos: ${totalSegments}`,

            `Segmentos append: ${formatBytes(totalAppendedBytes)}`,

            `Cursor MEGA: ${
                Number.isFinite(mediaCursor)
                    ? mediaCursor.toLocaleString()
                    : "—"
            }`,

            `MP4Box: ${
                Number.isFinite(mp4SuggestedPosition)
                    ? mp4SuggestedPosition.toLocaleString()
                    : "—"
            }`

        ].join(
            " | "
        );

}


/* =========================================================
   CREAR INTERFAZ
========================================================= */

function createPlayerInterface() {

    let panel =
        document.getElementById(
            "mega-player-panel"
        );


    if (
        panel
    ) {

        return;

    }


    panel =
        document.createElement(
            "section"
        );


    panel.id =
        "mega-player-panel";


    panel.style.marginTop =
        "24px";


    panel.style.padding =
        "18px";


    panel.style.border =
        "1px solid #30303a";


    panel.style.borderRadius =
        "12px";


    panel.style.background =
        "#17171d";


    const title =
        document.createElement(
            "h3"
        );


    title.textContent =
        "Reproductor experimental — Streaming adaptativo";


    title.style.margin =
        "0 0 8px 0";


    panel.appendChild(
        title
    );


    const subtitle =
        document.createElement(
            "div"
        );


    subtitle.textContent =
        "MEGAJS → MP4Box.js → MediaSource → <video>";


    subtitle.style.opacity =
        "0.7";


    subtitle.style.fontSize =
        "13px";


    subtitle.style.marginBottom =
        "16px";


    panel.appendChild(
        subtitle
    );


    const buttons =
        document.createElement(
            "div"
        );


    buttons.style.display =
        "flex";


    buttons.style.flexWrap =
        "wrap";


    buttons.style.gap =
        "10px";


    startPlayerButton =
        document.createElement(
            "button"
        );


    startPlayerButton.type =
        "button";


    startPlayerButton.textContent =
        "Iniciar streaming continuo";


    startPlayerButton.disabled =
        true;


    stopPlayerButton =
        document.createElement(
            "button"
        );


    stopPlayerButton.type =
        "button";


    stopPlayerButton.textContent =
        "Detener";


    stopPlayerButton.disabled =
        true;


    buttons.appendChild(
        startPlayerButton
    );


    buttons.appendChild(
        stopPlayerButton
    );


    panel.appendChild(
        buttons
    );


    videoElement =
        document.createElement(
            "video"
        );


    videoElement.id =
        "mega-video";


    videoElement.controls =
        true;


    videoElement.playsInline =
        true;


    videoElement.preload =
        "metadata";


    videoElement.style.width =
        "100%";


    videoElement.style.display =
        "block";


    videoElement.style.marginTop =
        "18px";


    videoElement.style.background =
        "#000";


    videoElement.style.borderRadius =
        "8px";


    videoElement.style.minHeight =
        "180px";


    panel.appendChild(
        videoElement
    );


    playerInfoElement =
        document.createElement(
            "div"
        );


    playerInfoElement.style.marginTop =
        "14px";


    playerInfoElement.style.fontFamily =
        "monospace";


    playerInfoElement.style.fontSize =
        "12px";


    playerInfoElement.style.lineHeight =
        "1.7";


    playerInfoElement.textContent =
        "Reproductor preparado.";


    panel.appendChild(
        playerInfoElement
    );


    resultBox.parentNode.insertBefore(
        panel,
        resultBox.nextSibling
    );


    /* =====================================================
       PLAY
    ===================================================== */

    videoElement.addEventListener(
        "play",
        () => {

            userPaused =
                false;


            playbackRequested =
                true;


            log(
                "▶ Usuario inició/reanudó la reproducción.",
                "info"
            );


            updatePlayerInfo();

        }
    );


    /* =====================================================
       PAUSE
    ===================================================== */

    videoElement.addEventListener(
        "pause",
        () => {

            if (
                videoElement.ended
            ) {

                return;

            }


            if (
                streamingActive
            ) {

                userPaused =
                    true;


                playbackRequested =
                    false;


                log(
                    "⏸ Usuario pausó el vídeo.",
                    "info"
                );


                log(
                    `⏳ PRE-CARGA ACTIVADA → objetivo ${PAUSED_TARGET_BUFFER} s.`,
                    "success"
                );

            }


            updatePlayerInfo();

        }
    );


    /* =====================================================
       PLAYING
    ===================================================== */

    videoElement.addEventListener(
        "playing",
        () => {

            playbackStarted =
                true;


            userPaused =
                false;


            log(
                "✓ VIDEO REPRODUCIENDO.",
                "success"
            );


            setStatus(
                "Reproduciendo",
                "success"
            );


            updatePlayerInfo();

        }
    );


    /* =====================================================
       WAITING
    ===================================================== */

    videoElement.addEventListener(
        "waiting",
        () => {

            log(
                "⏳ BUFFERING: el vídeo necesita más datos.",
                "info"
            );

        }
    );


    /* =====================================================
       CANPLAY
    ===================================================== */

    videoElement.addEventListener(
        "canplay",
        () => {

            log(
                "✓ El navegador indica que puede reproducir.",
                "success"
            );

        }
    );


    /* =====================================================
       LOADED METADATA
    ===================================================== */

    videoElement.addEventListener(
        "loadedmetadata",
        () => {

            log(
                `✓ Metadata disponible. Duración: ${formatTime(videoElement.duration)}`,
                "success"
            );


            updatePlayerInfo();

        }
    );


    /* =====================================================
       TIMEUPDATE
    ===================================================== */

    videoElement.addEventListener(
        "timeupdate",
        updatePlayerInfo
    );


    /* =====================================================
       PROGRESS
    ===================================================== */

    videoElement.addEventListener(
        "progress",
        updatePlayerInfo
    );


    /* =====================================================
       ENDED
    ===================================================== */

    videoElement.addEventListener(
        "ended",
        () => {

            streamingActive =
                false;


            setStatus(
                "Finalizado",
                "success"
            );


            log(
                "✓ El vídeo llegó al final.",
                "success"
            );


            updatePlayerInfo();

        }
    );


    /* =====================================================
       ERROR
    ===================================================== */

    videoElement.addEventListener(
        "error",
        () => {

            const error =
                videoElement.error;


            const code =
                error
                    ? error.code
                    : "desconocido";


            log(
                `✗ MediaError del vídeo: ${code}`,
                "error"
            );

        }
    );


    startPlayerButton.addEventListener(
        "click",
        startAdaptiveStreaming
    );


    stopPlayerButton.addEventListener(
        "click",
        stopAdaptiveStreaming
    );

}


/* =========================================================
   INFORMACIÓN DEL ARCHIVO
========================================================= */

async function loadFileInformation() {

    if (
        activeOperation
    ) {

        log(
            "⚠ Ya existe una operación activa.",
            "error"
        );

        return;

    }


    const selected =
        getSelectedVideo();


    if (
        !selected
    ) {

        return;

    }


    btnInfo.disabled =
        true;


    btnChunk.disabled =
        true;


    resetStreamingState();


    currentFile =
        null;


    currentVideo =
        null;


    fileSize =
        0;


    totalDownloaded =
        0;


    resetInfo();


    setStatus(
        "Conectando con MEGA...",
        "loading"
    );


    log(
        `Seleccionado: ${selected.name}`,
        "info"
    );


    try {

        log(
            "Creando objeto File.fromURL()...",
            "info"
        );


        const file =
            MEGAFile.fromURL(
                selected.url
            );


        currentFile =
            file;


        log(
            "✓ Enlace MEGA aceptado por MEGAJS.",
            "success"
        );


        log(
            "Solicitando atributos...",
            "info"
        );


        const loaded =
            await file.loadAttributes();


        if (
            loaded
        ) {

            currentFile =
                loaded;

        }


        currentVideo =
            selected;


        fileSize =
            Number(
                currentFile.size ||
                0
            );


        fileNameElement.textContent =
            currentFile.name ||
            selected.name;


        fileSizeElement.textContent =
            formatBytes(
                fileSize
            );


        fileTypeElement.textContent =
            "video/mp4";


        setStatus(
            "Archivo localizado",
            "success"
        );


        resultBox.className =
            "result-box result-success";


        resultBox.textContent =
            "✓ Archivo MEGA localizado correctamente.";


        log(
            `✓ Archivo: ${currentFile.name}`,
            "success"
        );


        log(
            `✓ Tamaño: ${formatBytes(fileSize)}`,
            "success"
        );


        createPlayerInterface();


        startPlayerButton.disabled =
            false;


        stopPlayerButton.disabled =
            true;


        btnChunk.disabled =
            false;


    } catch (
        error
    ) {

        currentFile =
            null;


        setStatus(
            "Error",
            "error"
        );


        resultBox.className =
            "result-box result-error";


        resultBox.textContent =
            `Error: ${getErrorMessage(error)}`;


        log(
            `✗ ${getErrorMessage(error)}`,
            "error"
        );

    } finally {

        btnInfo.disabled =
            false;

    }

}


/* =========================================================
   LEER RANGO MEGA
========================================================= */

async function readMegaRange(
    start,
    size,
    label = "MEGA"
) {

    if (
        !currentFile
    ) {

        throw new Error(
            "No existe archivo MEGA."
        );

    }


    if (
        !Number.isFinite(start) ||
        !Number.isFinite(size) ||
        start < 0 ||
        size <= 0 ||
        start >= fileSize
    ) {

        throw new Error(
            `Rango MEGA inválido: ${start} / ${size}`
        );

    }


    const end =
        Math.min(
            start +
            size -
            1,
            fileSize -
            1
        );


    const expected =
        end -
        start +
        1;


    const rangeKey =
        `${start}:${end}`;


    if (
        requestedRanges.has(
            rangeKey
        )
    ) {

        throw new Error(
            `Rango MEGA duplicado: ${start} → ${end}`
        );

    }


    requestedRanges.add(
        rangeKey
    );


    totalRequests++;


    if (
        totalRequests >
        MAX_STREAM_REQUESTS
    ) {

        throw new Error(
            "Se alcanzó el límite de seguridad de solicitudes."
        );

    }


    log(
        `${label} → ${start.toLocaleString()} → ${end.toLocaleString()} (${formatBytes(expected)})`,
        "info"
    );


    const stream =
        currentFile.download({

            start:
                start,

            end:
                end,

            maxConnections:
                MAX_PARALLEL_REQUESTS,

            initialChunkSize:
                128 *
                1024,

            chunkSizeIncrement:
                128 *
                1024,

            maxChunkSize:
                1024 *
                1024

        });


    if (
        !stream
    ) {

        throw new Error(
            "MEGAJS no devolvió el stream."
        );

    }


    const chunks =
        [];


    let received =
        0;


    await new Promise(
        (
            resolve,
            reject
        ) => {

            let finished =
                false;


            stream.on(
                "data",
                chunk => {

                    if (
                        !chunk
                    ) {

                        return;

                    }


                    let bytes;


                    if (
                        chunk instanceof
                        Uint8Array
                    ) {

                        bytes =
                            chunk;

                    } else if (
                        chunk.buffer
                    ) {

                        bytes =
                            new Uint8Array(
                                chunk.buffer,
                                chunk.byteOffset ||
                                0,
                                chunk.byteLength
                            );

                    } else {

                        reject(
                            new Error(
                                "MEGAJS devolvió un bloque desconocido."
                            )
                        );

                        return;

                    }


                    const copy =
                        bytes.slice();


                    chunks.push(
                        copy
                    );


                    received +=
                        copy.byteLength;

                }
            );


            stream.on(
                "error",
                error => {

                    if (
                        finished
                    ) {

                        return;

                    }


                    finished =
                        true;


                    reject(
                        error
                    );

                }
            );


            stream.on(
                "end",
                () => {

                    if (
                        finished
                    ) {

                        return;

                    }


                    finished =
                        true;


                    resolve();

                }
            );

        }
    );


    if (
        received !==
        expected
    ) {

        throw new Error(
            `MEGAJS entregó ${received} bytes; esperábamos ${expected}.`
        );

    }


    const result =
        new Uint8Array(
            received
        );


    let offset =
        0;


    for (
        const chunk of
        chunks
    ) {

        result.set(
            chunk,
            offset
        );


        offset +=
            chunk.byteLength;

    }


    const buffer =
        result.buffer;


    /*
     * CRÍTICO:
     *
     * MP4Box necesita conocer la posición
     * absoluta de este bloque.
     */

    buffer.fileStart =
        start;


    totalDownloaded +=
        received;


    updateProgress();


    log(
        `✓ Recibidos ${formatBytes(received)}.`,
        "success"
    );


    return {

        buffer:
            buffer,

        start:
            start,

        end:
            end,

        size:
            received

    };

}


/* =========================================================
   MEDIASOURCE
========================================================= */

async function createMediaSource() {

    if (
        !window.MediaSource
    ) {

        throw new Error(
            "Este navegador no soporta MediaSource."
        );

    }


    if (
        !videoElement
    ) {

        throw new Error(
            "No existe el elemento video."
        );

    }


    if (
        mediaSourceUrl
    ) {

        try {

            URL.revokeObjectURL(
                mediaSourceUrl
            );

        } catch (
            error
        ) {}

    }


    mediaSource =
        new MediaSource();


    mediaSourceUrl =
        URL.createObjectURL(
            mediaSource
        );


    videoElement.src =
        mediaSourceUrl;


    await new Promise(
        (
            resolve,
            reject
        ) => {

            const onOpen =
                () => {

                    log(
                        "✓ MediaSource abierto.",
                        "success"
                    );


                    resolve();

                };


            const onError =
                () => {

                    reject(
                        new Error(
                            "MediaSource informó un error."
                        )
                    );

                };


            mediaSource.addEventListener(
                "sourceopen",
                onOpen,
                {
                    once:
                        true
                }
            );


            mediaSource.addEventListener(
                "error",
                onError,
                {
                    once:
                        true
                }
            );

        }
    );

}


/* =========================================================
   CREAR SOURCEBUFFERS
========================================================= */

function createSourceBuffers(
    info
) {

    sourceBuffers.clear();

    sourceQueues.clear();


    for (
        const track of
        info.tracks ||
        []
    ) {

        let mime =
            null;


        if (
            track.video
        ) {

            mime =
                `video/mp4; codecs="${track.codec}"`;

        } else if (
            track.audio
        ) {

            mime =
                `audio/mp4; codecs="${track.codec}"`;

        }


        if (
            !mime
        ) {

            continue;

        }


        log(
            `Comprobando MSE: ${mime}`,
            "info"
        );


        if (
            !MediaSource.isTypeSupported(
                mime
            )
        ) {

            log(
                `✗ Codec no soportado: ${mime}`,
                "error"
            );


            continue;

        }


        const sourceBuffer =
            mediaSource.addSourceBuffer(
                mime
            );


        sourceBuffer.mode =
            "segments";


        sourceBuffers.set(
            track.id,
            sourceBuffer
        );


        sourceQueues.set(
            track.id,
            []);


        sourceBuffer.addEventListener(
            "updateend",
            () => {

                pumpSourceBuffer(
                    track.id
                );


                updatePlayerInfo();

            }
        );


        sourceBuffer.addEventListener(
            "error",
            () => {

                log(
                    `✗ SourceBuffer track ${track.id} informó error.`,
                    "error"
                );

            }
        );


        log(
            `✓ SourceBuffer creado para track ${track.id}: ${mime}`,
            "success"
        );

    }


    if (
        sourceBuffers.size ===
        0
    ) {

        throw new Error(
            "No se pudo crear ningún SourceBuffer."
        );

    }

}


/* =========================================================
   SOURCEBUFFER QUEUE
========================================================= */

function queueSourceBuffer(
    trackId,
    buffer,
    kind = "segment"
) {

    const queue =
        sourceQueues.get(
            trackId
        );


    if (
        !queue
    ) {

        return;

    }


    queue.push({

        buffer:
            buffer,

        kind:
            kind

    });


    pumpSourceBuffer(
        trackId
    );

}


/* =========================================================
   PUMP SOURCEBUFFER
========================================================= */

function pumpSourceBuffer(
    trackId
) {

    const sourceBuffer =
        sourceBuffers.get(
            trackId
        );


    const queue =
        sourceQueues.get(
            trackId
        );


    if (
        !sourceBuffer ||
        !queue
    ) {

        return;

    }


    if (
        sourceBuffer.updating
    ) {

        return;

    }


    if (
        queue.length ===
        0
    ) {

        return;

    }


    const item =
        queue.shift();


    try {

        sourceBuffer.appendBuffer(
            item.buffer
        );


        totalAppendedBytes +=
            item.buffer.byteLength;


        log(
            `✓ SourceBuffer track ${trackId}: ${formatBytes(item.buffer.byteLength)} añadido (${item.kind}).`,
            "success"
        );


    } catch (
        error
    ) {

        queue.unshift(
            item
        );


        if (
            error.name ===
            "QuotaExceededError"
        ) {

            log(
                `⚠ SourceBuffer track ${trackId} lleno; esperando para continuar.`,
                "info"
            );


            return;

        }


        log(
            `✗ appendBuffer track ${trackId}: ${getErrorMessage(error)}`,
            "error"
        );

    }

}


/* =========================================================
   CONFIGURAR MP4BOX
========================================================= */

function configureMP4Box() {

    mp4box.onMoovStart =
        () => {

            log(
                "✓ MP4Box detectó el comienzo de MOOV.",
                "success"
            );

        };


    mp4box.onReady =
        info => {

            if (
                mp4Ready
            ) {

                return;

            }


            mp4Ready =
                true;


            mp4Info =
                info;


            log(
                "=================================================",
                "success"
            );


            log(
                "✓ MP4BOX ENCONTRÓ LA ESTRUCTURA DEL MP4",
                "success"
            );


            log(
                "=================================================",
                "success"
            );


            showMP4Info(
                info
            );


            try {

                prepareSegmentation(
                    info
                );

            } catch (
                error
            ) {

                mp4Error =
                    true;


                log(
                    `✗ Error preparando segmentación: ${getErrorMessage(error)}`,
                    "error"
                );

            }

        };


    mp4box.onSegment =
        (
            trackId,
            user,
            buffer,
            sampleNumber,
            last
        ) => {

            totalSegments++;


            queueSourceBuffer(
                trackId,
                buffer,
                "media"
            );


            log(
                `✓ MP4Box GENERÓ SEGMENTO #${totalSegments} | track=${trackId} | ${formatBytes(buffer.byteLength)}`,
                "success"
            );


            if (
                Number.isFinite(
                    sampleNumber
                )
            ) {

                log(
                    `   Muestra: ${sampleNumber}`,
                    "info"
                );

            }


            if (
                last
            ) {

                log(
                    `✓ MP4Box marcó último segmento del track ${trackId}.`,
                    "success"
                );

            }


            updatePlayerInfo();

        };


    mp4box.onError =
        error => {

            mp4Error =
                true;


            log(
                `✗ MP4Box: ${error}`,
                "error"
            );

        };

}


/* =========================================================
   PREPARAR SEGMENTACIÓN
========================================================= */

function prepareSegmentation(
    info
) {

    createSourceBuffers(
        info
    );


    /*
     * Registrar opciones de segmentación
     * antes de initializeSegmentation().
     */

    for (
        const track of
        info.tracks ||
        []
    ) {

        if (
            !sourceBuffers.has(
                track.id
            )
        ) {

            continue;

        }


        mp4box.setSegmentOptions(
            track.id,
            null,
            {

                nbSamples:
                    SEGMENT_SAMPLES,

                rapAlignement:
                    true,

                forceLargeBox:
                    false,

                segmenterOptions:
                    {}

            }
        );


        log(
            `✓ Segmentación configurada para track ${track.id}.`,
            "success"
        );

    }


    /*
     * Crear segmentos iniciales.
     */

    const initSegments =
        mp4box.initializeSegmentation();


    if (
        Array.isArray(
            initSegments
        )
    ) {

        for (
            const init of
            initSegments
        ) {

            if (
                !init ||
                !init.buffer
            ) {

                continue;

            }


            queueSourceBuffer(
                init.id,
                init.buffer,
                "init"
            );


            log(
                `✓ Initialization segment track ${init.id}: ${formatBytes(init.buffer.byteLength)}`,
                "success"
            );

        }

    }


    /*
     * IMPORTANTE:
     *
     * Después de initializeSegmentation()
     * comenzamos a alimentar MP4Box con
     * el mdat secuencial.
     */

    mp4box.start();


    log(
        "✓ MP4Box inició procesamiento.",
        "success"
    );

}


/* =========================================================
   INFORMACIÓN MP4
========================================================= */

function showMP4Info(
    info
) {

    const duration =
        info &&
        info.timescale
            ? info.duration /
              info.timescale
            : 0;


    log(
        `✓ Duración: ${formatTime(duration)}`,
        "success"
    );


    log(
        `✓ Timescale: ${info.timescale || "—"}`,
        "info"
    );


    log(
        `✓ Fragmentado: ${info.isFragmented ? "Sí" : "No"}`,
        "info"
    );


    log(
        `✓ Progresivo: ${info.isProgressive ? "Sí" : "No"}`,
        "info"
    );


    const tracks =
        info.tracks ||
        [];


    log(
        `✓ Tracks detectados: ${tracks.length}`,
        "success"
    );


    for (
        const track of
        tracks
    ) {

        let text =
            `Track ${track.id}: codec=${track.codec || "desconocido"}`;


        if (
            track.video
        ) {

            text +=
                ` | vídeo ${track.video.width}x${track.video.height}`;

        }


        if (
            track.audio
        ) {

            text +=
                ` | audio ${track.audio.sample_rate || "—"} Hz`;

        }


        log(
            text,
            "success"
        );

    }

}


/* =========================================================
   ESPERAR MP4 READY
========================================================= */

function waitForMP4Ready(
    currentOperation
) {

    return new Promise(
        (
            resolve,
            reject
        ) => {

            const started =
                Date.now();


            const timer =
                setInterval(
                    () => {

                        if (
                            currentOperation !==
                            operationId
                        ) {

                            clearInterval(
                                timer
                            );


                            reject(
                                new Error(
                                    "Operación cancelada."
                                )
                            );


                            return;

                        }


                        if (
                            mp4Error
                        ) {

                            clearInterval(
                                timer
                            );


                            reject(
                                new Error(
                                    "MP4Box informó un error."
                                )
                            );


                            return;

                        }


                        if (
                            mp4Ready
                        ) {

                            clearInterval(
                                timer
                            );


                            resolve();


                            return;

                        }


                        if (
                            Date.now() -
                            started >
                            MOOV_TIMEOUT
                        ) {

                            clearInterval(
                                timer
                            );


                            reject(
                                new Error(
                                    "Tiempo agotado esperando MOOV."
                                )
                            );

                        }

                    },
                    100
                );

        }
    );

}


/* =========================================================
   INICIAR STREAMING
========================================================= */

async function startAdaptiveStreaming() {

    if (
        !currentFile
    ) {

        log(
            "⚠ Primero carga un archivo MEGA.",
            "error"
        );


        return;

    }


    if (
        streamingActive
    ) {

        log(
            "⚠ El streaming ya está activo.",
            "info"
        );


        return;

    }


    activeOperation =
        "streaming";


    const currentOperation =
        ++operationId;


    streamingActive =
        true;


    streamingStopped =
        false;


    streamingLoopRunning =
        false;


    fetchingRange =
        false;


    playbackStarted =
        false;


    playbackRequested =
        false;


    userPaused =
        false;


    mp4Ready =
        false;


    mp4Error =
        false;


    mp4Info =
        null;


    mp4SuggestedPosition =
        null;


    mediaCursor =
        null;


    firstMediaEnd =
        -1;


    lastAppendedStart =
        -1;


    lastAppendedEnd =
        -1;


    totalDownloaded =
        0;


    totalRequests =
        0;


    totalSegments =
        0;


    totalAppendedBytes =
        0;


    requestedRanges.clear();


    sourceBuffers.clear();

    sourceQueues.clear();


    startPlayerButton.disabled =
        true;


    stopPlayerButton.disabled =
        false;


    btnInfo.disabled =
        true;


    btnChunk.disabled =
        true;


    setStatus(
        "Preparando streaming...",
        "loading"
    );


    resultBox.className =
        "result-box";


    resultBox.textContent =
        "Preparando streaming continuo adaptativo...";


    log(
        "=================================================",
        "info"
    );


    log(
        "INICIANDO STREAMING CONTINUO ADAPTATIVO",
        "info"
    );


    log(
        "=================================================",
        "info"
    );


    log(
        `✓ Buffer reproducción: ${PLAYING_TARGET_BUFFER}–${PLAYING_MAX_BUFFER} s`,
        "info"
    );


    log(
        `✓ Buffer pausa: hasta ${PAUSED_TARGET_BUFFER} s`,
        "info"
    );


    log(
        `✓ Buffer bajo: ${LOW_BUFFER} s`,
        "info"
    );


    log(
        `✓ Rango MEGA: ${formatBytes(MEDIA_RANGE_SIZE)}`,
        "info"
    );


    log(
        "✓ Precarga durante pausa activada.",
        "success"
    );


    try {

        /* =================================================
           MEDIASOURCE
        ================================================= */

        await createMediaSource();


        /* =================================================
           CREAR MP4BOX
        ================================================= */

        mp4box =
            MP4Box.createFile();


        configureMP4Box();


        /* =================================================
           PRIMER RANGO
        ================================================= */

        const firstSize =
            Math.min(
                INITIAL_RANGE_SIZE,
                fileSize
            );


        const first =
            await readMegaRange(
                0,
                firstSize,
                "MEGA INICIO"
            );


        /*
         * El primer bloque YA forma parte
         * del flujo multimedia.
         */

        firstMediaEnd =
            first.end;


        mediaCursor =
            first.end +
            1;


        lastAppendedStart =
            first.start;


        lastAppendedEnd =
            first.end;


        /*
         * Entregar a MP4Box.
         */

        mp4SuggestedPosition =
            mp4box.appendBuffer(
                first.buffer
            );


        log(
            `MP4Box indica siguiente posición: ${
                Number.isFinite(mp4SuggestedPosition)
                    ? mp4SuggestedPosition.toLocaleString()
                    : "—"
            }`,
            "success"
        );


        /* =================================================
           LOCALIZAR MOOV
        ================================================= */

        if (
            Number.isFinite(
                mp4SuggestedPosition
            ) &&
            mp4SuggestedPosition >
                first.end
        ) {

            const moovPosition =
                mp4SuggestedPosition;


            const moovSize =
                Math.min(
                    MEDIA_RANGE_SIZE,
                    fileSize -
                    moovPosition
                );


            if (
                moovSize >
                0
            ) {

                log(
                    `MEGA MOOV → ${moovPosition.toLocaleString()} → ${
                        (
                            moovPosition +
                            moovSize -
                            1
                        ).toLocaleString()
                    } (${formatBytes(moovSize)})`,
                    "info"
                );


                /*
                 * Leemos MOOV para que MP4Box
                 * conozca la estructura.
                 *
                 * Este rango NO cambia mediaCursor.
                 */

                const moovBlock =
                    await readMegaRange(
                        moovPosition,
                        moovSize,
                        "MEGA MOOV"
                    );


                mp4SuggestedPosition =
                    mp4box.appendBuffer(
                        moovBlock.buffer
                    );


                log(
                    `MP4Box después de MOOV indica: ${
                        Number.isFinite(mp4SuggestedPosition)
                            ? mp4SuggestedPosition.toLocaleString()
                            : "—"
                    }`,
                    "success"
                );


                log(
                    `✓ Cursor multimedia permanece en ${mediaCursor.toLocaleString()}.`,
                    "success"
                );

            }

        }


        /* =================================================
           ESPERAR MOOV / ONREADY
        ================================================= */

        await waitForMP4Ready(
            currentOperation
        );


        if (
            !mp4Ready
        ) {

            throw new Error(
                "MP4Box no pudo encontrar la estructura del MP4."
            );

        }


        /* =================================================
           LOOP
        ================================================= */

        streamingLoopRunning =
            true;


        await adaptiveStreamingLoop(
            currentOperation
        );


        if (
            currentOperation !==
            operationId
        ) {

            return;

        }


        resultBox.className =
            "result-box result-success";


        resultBox.textContent =
            `✓ Streaming adaptativo activo. MEGA solicitado: ${formatBytes(totalDownloaded)}.`;


    } catch (
        error
    ) {

        if (
            currentOperation !==
            operationId
        ) {

            return;

        }


        streamingActive =
            false;


        setStatus(
            "Error de streaming",
            "error"
        );


        resultBox.className =
            "result-box result-error";


        resultBox.textContent =
            `Error de streaming: ${getErrorMessage(error)}`;


        log(
            `✗ Error de streaming: ${getErrorMessage(error)}`,
            "error"
        );

    } finally {

        if (
            currentOperation ===
            operationId
        ) {

            activeOperation =
                null;


            streamingLoopRunning =
                false;


            btnInfo.disabled =
                false;


            btnChunk.disabled =
                false;


            startPlayerButton.disabled =
                !currentFile;


            stopPlayerButton.disabled =
                true;

        }

    }

}


/* =========================================================
   LOOP ADAPTATIVO
========================================================= */

async function adaptiveStreamingLoop(
    currentOperation
) {

    while (
        streamingActive &&
        !streamingStopped &&
        !mp4Error &&
        currentOperation ===
            operationId
    ) {

        updatePlayerInfo();


        const buffer =
            getBufferState();


        const paused =
            videoElement &&
            videoElement.paused;


        const targetBuffer =
            paused
                ? PAUSED_TARGET_BUFFER
                : PLAYING_TARGET_BUFFER;


        const maximumBuffer =
            paused
                ? PAUSED_MAX_BUFFER
                : PLAYING_MAX_BUFFER;


        /*
         * =================================================
         * PAUSA
         * =================================================
         */

        if (
            paused &&
            !userPaused &&
            playbackStarted
        ) {

            userPaused =
                true;


            playbackRequested =
                false;


            log(
                `⏸ Pausa detectada → precarga hasta ${PAUSED_TARGET_BUFFER} s.`,
                "info"
            );

        }


        /*
         * =================================================
         * BUFFER MÁXIMO
         * =================================================
         */

        if (
            buffer.ahead >=
            maximumBuffer
        ) {

            await sleep(
                BUFFER_CHECK_INTERVAL
            );


            continue;

        }


        /*
         * =================================================
         * ARCHIVO TERMINADO
         * =================================================
         */

        if (
            Number.isFinite(
                mediaCursor
            ) &&
            mediaCursor >=
                fileSize
        ) {

            log(
                "✓ Se alcanzó el final físico del archivo.",
                "success"
            );


            break;

        }


        /*
         * =================================================
         * SOLICITAR DATOS
         * =================================================
         */

        if (
            buffer.ahead <
            targetBuffer
        ) {

            if (
                !fetchingRange
            ) {

                await fetchNextMediaRange(
                    currentOperation
                );

            }

        }


        /*
         * =================================================
         * REPRODUCCIÓN
         * =================================================
         */

        await tryStartPlaybackOnce();


        await sleep(
            BUFFER_CHECK_INTERVAL
        );

    }


    streamingLoopRunning =
        false;


    updatePlayerInfo();

}


/* =========================================================
   SIGUIENTE RANGO
========================================================= */

async function fetchNextMediaRange(
    currentOperation
) {

    if (
        fetchingRange
    ) {

        return;

    }


    if (
        currentOperation !==
        operationId
    ) {

        return;

    }


    if (
        !streamingActive ||
        streamingStopped
    ) {

        return;

    }


    fetchingRange =
        true;


    try {

        /*
         * =================================================
         * CURSOR REAL
         * =================================================
         *
         * IMPORTANTE:
         *
         * NO utilizamos mp4SuggestedPosition.
         *
         * El cursor MEGA es exclusivamente secuencial.
         */

        const position =
            Number(
                mediaCursor
            );


        if (
            !Number.isFinite(
                position
            )
        ) {

            throw new Error(
                "Cursor multimedia inválido."
            );

        }


        if (
            position >=
            fileSize
        ) {

            return;

        }


        const size =
            Math.min(
                MEDIA_RANGE_SIZE,
                fileSize -
                position
            );


        /*
         * Seguridad contra duplicados.
         */

        const rangeKey =
            `${position}:${
                position +
                size -
                1
            }`;


        if (
            requestedRanges.has(
                rangeKey
            )
        ) {

            throw new Error(
                `El rango ya fue solicitado: ${rangeKey}`
            );

        }


        /*
         * =================================================
         * MEGA
         * ================================================= */

        const block =
            await readMegaRange(
                position,
                size,
                "MEGA STREAM"
            );


        /*
         * =================================================
         * COMPROBAR CONTINUIDAD
         * ================================================= */

        if (
            block.start !==
            position
        ) {

            throw new Error(
                `Rango inesperado: ${block.start}; esperábamos ${position}.`
            );

        }


        /*
         * =================================================
         * MP4BOX
         * ================================================= */

        const previousEnd =
            lastAppendedEnd;


        mp4SuggestedPosition =
            mp4box.appendBuffer(
                block.buffer
            );


        /*
         * =================================================
         * ACTUALIZAR CURSOR
         * ================================================= */

        mediaCursor =
            block.end +
            1;


        lastAppendedStart =
            block.start;


        lastAppendedEnd =
            block.end;


        log(
            `✓ MP4Box recibió ${formatBytes(block.size)} de ${block.start.toLocaleString()} → ${block.end.toLocaleString()}.`,
            "success"
        );


        log(
            `✓ Cursor MEGA avanza: ${position.toLocaleString()} → ${mediaCursor.toLocaleString()}`,
            "success"
        );


        /*
         * MP4Box puede decir algo diferente.

         * NO importa para el cursor.
         */

        if (
            Number.isFinite(
                mp4SuggestedPosition
            )
        ) {

            log(
                `ℹ MP4Box sugiere posición ${mp4SuggestedPosition.toLocaleString()} (solo informativa).`,
                "info"
            );

        }


        /*
         * Si por alguna razón el rango no avanzó,
         * detener inmediatamente.
         */

        if (
            mediaCursor <=
            position
        ) {

            throw new Error(
                `MP4Box/MEGA no avanzó el cursor: ${mediaCursor}`
            );

        }


        /*
         * Verificación adicional de continuidad.
         */

        if (
            previousEnd >= 0 &&
            block.start !==
                previousEnd +
                1
        ) {

            log(
                `⚠ Salto detectado entre rangos: anterior=${previousEnd.toLocaleString()}, nuevo=${block.start.toLocaleString()}.`,
                "error"
            );

        }


    } finally {

        fetchingRange =
            false;

    }

}


/* =========================================================
   INTENTAR PLAY
========================================================= */

async function tryStartPlaybackOnce() {

    if (
        !videoElement
    ) {

        return;

    }


    if (
        playbackRequested
    ) {

        return;

    }


    /*
     * Si el usuario pausó,
     * respetamos la pausa.
     */

    if (
        userPaused
    ) {

        return;

    }


    /*
     * Todavía no existe metadata.
     */

    if (
        videoElement.readyState <
        1
    ) {

        return;

    }


    const buffer =
        getBufferState();


    /*
     * No reproducir sin buffer.
     */

    if (
        buffer.ahead <=
        0
    ) {

        return;

    }


    playbackRequested =
        true;


    try {

        await videoElement.play();


        playbackStarted =
            true;


        log(
            "▶ Reproducción iniciada correctamente.",
            "success"
        );


        setStatus(
            "Reproduciendo",
            "success"
        );


    } catch (
        error
    ) {

        playbackRequested =
            false;


        log(
            "ℹ Autoplay bloqueado. Pulsa PLAY manualmente.",
            "info"
        );

    }

}


/* =========================================================
   DETENER
========================================================= */

function stopAdaptiveStreaming() {

    operationId++;


    streamingActive =
        false;


    streamingStopped =
        true;


    streamingLoopRunning =
        false;


    fetchingRange =
        false;


    activeOperation =
        null;


    if (
        mp4box
    ) {

        try {

            mp4box.stop();

        } catch (
            error
        ) {}

    }


    if (
        videoElement
    ) {

        try {

            videoElement.pause();

        } catch (
            error
        ) {}

    }


    if (
        mediaSource &&
        mediaSource.readyState ===
            "open"
    ) {

        try {

            mediaSource.endOfStream();

        } catch (
            error
        ) {}

    }


    startPlayerButton.disabled =
        !currentFile;


    stopPlayerButton.disabled =
        true;


    btnInfo.disabled =
        false;


    btnChunk.disabled =
        false;


    setStatus(
        "Streaming detenido",
        "idle"
    );


    log(
        "⏹ Streaming adaptativo detenido.",
        "info"
    );


    updatePlayerInfo();

}


/* =========================================================
   RESET
========================================================= */

function resetStreamingState() {

    operationId++;


    streamingActive =
        false;


    streamingStopped =
        true;


    streamingLoopRunning =
        false;


    fetchingRange =
        false;


    playbackStarted =
        false;


    playbackRequested =
        false;


    userPaused =
        false;


    mp4Ready =
        false;


    mp4Error =
        false;


    mp4Info =
        null;


    mp4SuggestedPosition =
        null;


    mediaCursor =
        null;


    firstMediaEnd =
        -1;


    lastAppendedStart =
        -1;


    lastAppendedEnd =
        -1;


    totalRequests =
        0;


    totalSegments =
        0;


    totalAppendedBytes =
        0;


    requestedRanges.clear();


    if (
        mp4box
    ) {

        try {

            mp4box.stop();

        } catch (
            error
        ) {}

    }


    mp4box =
        null;


    sourceBuffers.clear();

    sourceQueues.clear();


    if (
        mediaSource &&
        mediaSource.readyState ===
            "open"
    ) {

        try {

            mediaSource.endOfStream();

        } catch (
            error
        ) {}

    }


    mediaSource =
        null;


    if (
        mediaSourceUrl
    ) {

        try {

            URL.revokeObjectURL(
                mediaSourceUrl
            );

        } catch (
            error
        ) {}


        mediaSourceUrl =
            null;

    }


    if (
        videoElement
    ) {

        try {

            videoElement.pause();

            videoElement.removeAttribute(
                "src"
            );

            videoElement.load();

        } catch (
            error
        ) {}

    }


    if (
        startPlayerButton
    ) {

        startPlayerButton.disabled =
            true;

    }


    if (
        stopPlayerButton
    ) {

        stopPlayerButton.disabled =
            true;

    }

}


/* =========================================================
   PRUEBA DE BLOQUES
========================================================= */

async function testMegaBlocks() {

    if (
        !currentFile
    ) {

        log(
            "⚠ Primero carga un vídeo.",
            "error"
        );


        return;

    }


    if (
        activeOperation
    ) {

        log(
            "⚠ Existe una operación activa.",
            "error"
        );


        return;

    }


    activeOperation =
        "blocks";


    const currentOperation =
        ++operationId;


    requestedRanges.clear();


    totalDownloaded =
        0;


    const positions = [

        0,

        10 *
        1024 *
        1024,

        100 *
        1024 *
        1024,

        500 *
        1024 *
        1024,

        Math.max(
            0,
            fileSize -
            1024 *
            1024
        )

    ];


    let correct =
        0;


    log(
        "=================================================",
        "info"
    );


    log(
        "PRUEBA INDEPENDIENTE DE BLOQUES MEGA",
        "info"
    );


    log(
        "=================================================",
        "info"
    );


    try {

        for (
            let i = 0;
            i < positions.length;
            i++
        ) {

            if (
                currentOperation !==
                operationId
            ) {

                break;

            }


            const block =
                await readMegaRange(
                    positions[i],
                    1024 *
                    1024,
                    `BLOQUE ${i + 1}`
                );


            if (
                block.size ===
                1024 *
                1024
            ) {

                correct++;


                log(
                    `✓ Bloque ${i + 1} correcto.`,
                    "success"
                );

            }

        }


        log(
            `✓ Resultado: ${correct}/${positions.length} bloques correctos.`,
            "success"
        );


    } catch (
        error
    ) {

        log(
            `✗ Error: ${getErrorMessage(error)}`,
            "error"
        );

    } finally {

        activeOperation =
            null;

    }

}


/* =========================================================
   BOTÓN ANÁLISIS DIRIGIDO
========================================================= */

function createAnalysisButton() {

    let button =
        document.getElementById(
            "btn-directed-analysis"
        );


    if (
        button
    ) {

        return button;

    }


    button =
        document.createElement(
            "button"
        );


    button.id =
        "btn-directed-analysis";


    button.type =
        "button";


    button.textContent =
        "Analizar MP4 por rangos";


    button.disabled =
        true;


    btnChunk.parentNode.insertBefore(
        button,
        btnChunk.nextSibling
    );


    button.addEventListener(
        "click",
        runDirectedAnalysis
    );


    return button;

}


/* =========================================================
   ANÁLISIS DIRIGIDO
========================================================= */

async function runDirectedAnalysis() {

    if (
        !currentFile
    ) {

        return;

    }


    if (
        activeOperation
    ) {

        return;

    }


    activeOperation =
        "analysis";


    const currentOperation =
        ++operationId;


    const button =
        document.getElementById(
            "btn-directed-analysis"
        );


    button.disabled =
        true;


    btnInfo.disabled =
        true;


    btnChunk.disabled =
        true;


    requestedRanges.clear();


    totalDownloaded =
        0;


    mp4Ready =
        false;


    mp4Error =
        false;


    setStatus(
        "Analizando MP4...",
        "loading"
    );


    log(
        "=================================================",
        "info"
    );


    log(
        "PRUEBA DE LECTURA DIRIGIDA MEGA + MP4BOX",
        "info"
    );


    log(
        "=================================================",
        "info"
    );


    try {

        mp4box =
            MP4Box.createFile();


        configureMP4Box();


        let next =
            0;


        while (
            !mp4Ready &&
            !mp4Error &&
            currentOperation ===
                operationId &&
            totalDownloaded <
                DIRECTED_ANALYSIS_LIMIT
        ) {

            const remaining =
                fileSize -
                next;


            if (
                remaining <=
                0
            ) {

                break;

            }


            const size =
                Math.min(
                    MEDIA_RANGE_SIZE,
                    remaining
                );


            const block =
                await readMegaRange(
                    next,
                    size,
                    next === 0
                        ? "INICIO"
                        : "RANGO DIRIGIDO"
                );


            next =
                block.end +
                1;


            mp4SuggestedPosition =
                mp4box.appendBuffer(
                    block.buffer
                );


            if (
                Number.isFinite(
                    mp4SuggestedPosition
                )
            ) {

                /*
                 * Si MP4Box devuelve una posición
                 * que está mucho más adelante, hacemos
                 * una lectura dirigida adicional.
                 */

                if (
                    mp4SuggestedPosition >
                    next
                ) {

                    const directedStart =
                        mp4SuggestedPosition;


                    const directedRemaining =
                        fileSize -
                        directedStart;


                    if (
                        directedRemaining >
                        0 &&
                        totalDownloaded <
                            DIRECTED_ANALYSIS_LIMIT
                    ) {

                        const directedSize =
                            Math.min(
                                MEDIA_RANGE_SIZE,
                                directedRemaining
                            );


                        log(
                            `MP4Box solicita análisis dirigido → ${directedStart.toLocaleString()} → ${
                                (
                                    directedStart +
                                    directedSize -
                                    1
                                ).toLocaleString()
                            }`,
                            "info"
                        );


                        const directedBlock =
                            await readMegaRange(
                                directedStart,
                                directedSize,
                                "RANGO DIRIGIDO"
                            );


                        mp4box.appendBuffer(
                            directedBlock.buffer
                        );

                    }

                }

            }


            await sleep(
                0
            );

        }


        if (
            mp4Ready
        ) {

            setStatus(
                "MP4 analizado",
                "success"
            );


            resultBox.className =
                "result-box result-success";


            resultBox.textContent =
                `✓ MP4Box encontró la estructura utilizando ${formatBytes(totalDownloaded)}.`;


        } else {

            throw new Error(
                "MOOV no localizado dentro del límite de análisis."
            );

        }


    } catch (
        error
    ) {

        log(
            `✗ ${getErrorMessage(error)}`,
            "error"
        );


        resultBox.className =
            "result-box result-error";


        resultBox.textContent =
            `Error: ${getErrorMessage(error)}`;

    } finally {

        activeOperation =
            null;


        btnInfo.disabled =
            false;


        btnChunk.disabled =
            false;


        button.disabled =
            !currentFile;

    }

}


/* =========================================================
   SLEEP
========================================================= */

function sleep(
    milliseconds
) {

    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                milliseconds
            )
    );

}


/* =========================================================
   RESET INFORMACIÓN
========================================================= */

function resetInfo() {

    fileNameElement.textContent =
        "—";


    fileSizeElement.textContent =
        "—";


    fileTypeElement.textContent =
        "—";


    progressBar.style.width =
        "0%";


    progressText.textContent =
        "0 B";


    progressPercent.textContent =
        "0%";


    resultBox.className =
        "result-box";


    resultBox.textContent =
        "Todavía no se ha realizado ninguna prueba.";

}


/* =========================================================
   CAMBIO DE VIDEO
========================================================= */

videoSelect.addEventListener(
    "change",
    () => {

        if (
            activeOperation
        ) {

            log(
                "⚠ Detén la operación actual antes de cambiar de vídeo.",
                "error"
            );


            return;

        }


        resetStreamingState();


        currentFile =
            null;


        currentVideo =
            null;


        fileSize =
            0;


        totalDownloaded =
            0;


        resetInfo();


        btnChunk.disabled =
            true;


        const analysisButton =
            document.getElementById(
                "btn-directed-analysis"
            );


        if (
            analysisButton
        ) {

            analysisButton.disabled =
                true;

        }


        setStatus(
            "Esperando prueba...",
            "idle"
        );


        const selected =
            getSelectedVideo();


        if (
            selected
        ) {

            log(
                `Vídeo seleccionado: ${selected.name}`,
                "info"
            );

        }

    }
);


/* =========================================================
   BOTONES
========================================================= */

btnInfo.addEventListener(
    "click",
    loadFileInformation
);


btnChunk.addEventListener(
    "click",
    testMegaBlocks
);


/* =========================================================
   BOTÓN ANÁLISIS
========================================================= */

const analysisButton =
    createAnalysisButton();


/* =========================================================
   ACTUALIZACIÓN DE UI
========================================================= */

setInterval(
    () => {

        if (
            analysisButton
        ) {

            analysisButton.disabled =
                !currentFile ||
                Boolean(
                    activeOperation
                );

        }


        updatePlayerInfo();

    },
    500
);


/* =========================================================
   INICIO
========================================================= */

log(
    "Página de prueba cargada.",
    "success"
);


log(
    "MEGAJS importado correctamente.",
    "success"
);


log(
    "MP4Box.js 2.4.1 importado correctamente.",
    "success"
);


log(
    "Laboratorio MEGA + MP4Box + MediaSource preparado.",
    "success"
);


log(
    "✓ STREAMING CONTINUO ADAPTATIVO activado.",
    "success"
);


log(
    `✓ Buffer reproducción: ${PLAYING_TARGET_BUFFER}–${PLAYING_MAX_BUFFER} s.`,
    "info"
);


log(
    `✓ Buffer pausa: hasta ${PAUSED_TARGET_BUFFER} s.`,
    "info"
);


log(
    "✓ La precarga continuará durante una pausa.",
    "success"
);


log(
    "✓ El cursor MEGA es independiente de la posición sugerida por MP4Box.",
    "success"
);


log(
    "✓ No se descargará automáticamente el archivo completo.",
    "success"
);


log(
    "Selecciona un vídeo y pulsa 'Leer información del archivo'.",
    "info"
);
