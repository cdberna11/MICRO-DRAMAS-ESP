/* =========================================================
   MICRO-DRAMAS-ESP
   LABORATORIO MEGA + MEGAJS + MP4BOX + MEDIASOURCE

   OBJETIVO

   MEGA
      ↓
   MEGAJS
      ↓
   RANGOS DIRIGIDOS
      ↓
   MP4Box.js
      ↓
   MOOV / TRACKS
      ↓
   SEGMENTACIÓN
      ↓
   MediaSource
      ↓
   SourceBuffer
      ↓
   <video>

   IMPORTANTE

   El archivo NO se descarga completo.

   MP4Box indica mediante appendBuffer()
   qué posición necesita a continuación.

   Esta versión utiliza esa posición para
   solicitar rangos concretos de MEGA.

   LÍMITE DE SEGURIDAD:
   64 MB por prueba.
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
   VIDEOS DE PRUEBA
========================================================= */

const VIDEOS = {

    video1: {

        name:
            "EL OJO DE LA RIQUEZA",

        url:
            "https://mega.nz/file/ulBR1aaC#90sGdNoolQrZyf_1T9uTht2qB9kKjb7bQGV0ycxXSlg"

    },


    video2: {

        name:
            "DE LA TRAICIÓN AL TRONO",

        url:
            "https://mega.nz/file/PlRVAaqK#q6k9C9wVySYblyzsk9G8w0D4DyJTc04q47_oSBAd8LU"

    }

};


/* =========================================================
   CONFIGURACIÓN
========================================================= */

const INITIAL_RANGE_SIZE =
    4 * 1024 * 1024;


const DIRECTED_RANGE_SIZE =
    8 * 1024 * 1024;


/*
 * Seguridad:
 * nunca descargar más de 64 MB
 * automáticamente durante esta prueba.
 */

const MAX_TEST_BYTES =
    64 * 1024 * 1024;


const MAX_DIRECTED_REQUESTS =
    20;


const TEST_BLOCK_SIZE =
    1024 * 1024;


/*
 * Número de muestras aproximado por segmento.
 */

const SEGMENT_SAMPLES =
    30;


/* =========================================================
   ELEMENTOS HTML EXISTENTES
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
   VALIDACIÓN
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
   ESTADO GLOBAL
========================================================= */

let currentFile =
    null;


let currentVideo =
    null;


let fileSize =
    0;


let totalDownloaded =
    0;


let requestedRanges =
    new Set();


let activeOperation =
    null;


let operationId =
    0;


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


/* =========================================================
   MEDIASOURCE
========================================================= */

let mediaSource =
    null;


let mediaSourceUrl =
    null;


let videoElement =
    null;


let mediaSourceOpenPromise =
    null;


/* =========================================================
   SOURCEBUFFERS
========================================================= */

const sourceBuffers =
    new Map();


const sourceQueues =
    new Map();


const sourceBufferReady =
    new Map();


/* =========================================================
   REPRODUCTOR
========================================================= */

let playerStarted =
    false;


let playerStopped =
    false;


let playbackStarted =
    false;


let segmentationPrepared =
    false;


let totalSegments =
    0;


let playerInfoElement =
    null;


/* =========================================================
   BOTONES DEL REPRODUCTOR
========================================================= */

let startPlayerButton =
    null;


let stopPlayerButton =
    null;


/* =========================================================
   UTILIDAD ERROR
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
        typeof error.message ===
        "string"
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
   ESTADO
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
   RESET
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
   PROGRESO
========================================================= */

function updateProgress() {

    progressText.textContent =
        `${formatBytes(totalDownloaded)} descargados`;


    if (
        fileSize <= 0
    ) {

        progressPercent.textContent =
            "0%";


        progressBar.style.width =
            "0%";


        return;

    }


    /*
     * IMPORTANTE:
     *
     * Este porcentaje indica bytes descargados,
     * no posición del archivo.
     */

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
   CREAR INTERFAZ DEL REPRODUCTOR
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


    panel.style.boxSizing =
        "border-box";


    const title =
        document.createElement(
            "h3"
        );


    title.textContent =
        "Reproductor experimental MEGA";


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


    const buttonContainer =
        document.createElement(
            "div"
        );


    buttonContainer.style.display =
        "flex";


    buttonContainer.style.flexWrap =
        "wrap";


    buttonContainer.style.gap =
        "10px";


    startPlayerButton =
        document.createElement(
            "button"
        );


    startPlayerButton.type =
        "button";


    startPlayerButton.textContent =
        "Iniciar reproducción experimental";


    startPlayerButton.disabled =
        true;


    startPlayerButton.style.cursor =
        "pointer";


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


    stopPlayerButton.style.cursor =
        "pointer";


    buttonContainer.appendChild(
        startPlayerButton
    );


    buttonContainer.appendChild(
        stopPlayerButton
    );


    panel.appendChild(
        buttonContainer
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


    playerInfoElement.id =
        "mega-player-info";


    playerInfoElement.style.marginTop =
        "14px";


    playerInfoElement.style.fontFamily =
        "monospace";


    playerInfoElement.style.fontSize =
        "12px";


    playerInfoElement.style.lineHeight =
        "1.6";


    playerInfoElement.textContent =
        "Reproductor preparado. Esperando inicio.";


    panel.appendChild(
        playerInfoElement
    );


    /*
     * Insertar después del resultado.
     */

    resultBox.parentNode.insertBefore(
        panel,
        resultBox.nextSibling
    );


    /*
     * Eventos.
     */

    startPlayerButton.addEventListener(
        "click",
        startExperimentalPlayer
    );


    stopPlayerButton.addEventListener(
        "click",
        stopExperimentalPlayer
    );


    videoElement.addEventListener(
        "playing",
        () => {

            playbackStarted =
                true;


            log(
                "▶ EL VIDEO ESTÁ REPRODUCIENDO.",
                "success"
            );


            setStatus(
                "Reproduciendo",
                "success"
            );

        }
    );


    videoElement.addEventListener(
        "waiting",
        () => {

            log(
                "⏳ El vídeo está esperando más datos.",
                "info"
            );

        }
    );


    videoElement.addEventListener(
        "canplay",
        () => {

            log(
                "✓ El navegador indica que el vídeo puede comenzar.",
                "success"
            );

        }
    );


    videoElement.addEventListener(
        "loadedmetadata",
        () => {

            log(
                `✓ Metadata del <video> disponible. Duración: ${formatTime(videoElement.duration)}`,
                "success"
            );

        }
    );


    videoElement.addEventListener(
        "error",
        () => {

            const mediaError =
                videoElement.error;


            let message =
                "Error desconocido del elemento <video>.";


            if (
                mediaError
            ) {

                message =
                    `MediaError code=${mediaError.code}`;

            }


            log(
                `✗ ${message}`,
                "error"
            );

        }
    );

}


/* =========================================================
   CARGAR INFORMACIÓN MEGA
========================================================= */

async function loadFileInformation() {

    if (
        activeOperation
    ) {

        log(
            "⚠ Hay una operación activa.",
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


    resetInfo();


    currentFile =
        null;


    currentVideo =
        null;


    fileSize =
        0;


    totalDownloaded =
        0;


    requestedRanges.clear();


    resetPlayerState();


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


        const mainFile =
            MEGAFile.fromURL(
                selected.url
            );


        currentFile =
            mainFile;


        log(
            "✓ Enlace MEGA aceptado por MEGAJS.",
            "success"
        );


        log(
            "Solicitando atributos...",
            "info"
        );


        const loadedFile =
            await mainFile.loadAttributes();


        if (
            loadedFile
        ) {

            currentFile =
                loadedFile;

        }


        currentVideo =
            selected;


        fileSize =
            Number(
                currentFile.size ||
                0
            );


        const name =
            currentFile.name ||
            selected.name ||
            "Desconocido";


        const type =
            name
                .toLowerCase()
                .endsWith(
                    ".mp4"
                )
                ? "video/mp4"
                : "Desconocido";


        fileNameElement.textContent =
            name;


        fileSizeElement.textContent =
            formatBytes(
                fileSize
            );


        fileTypeElement.textContent =
            type;


        setStatus(
            "Archivo localizado",
            "success"
        );


        resultBox.className =
            "result-box result-success";


        resultBox.textContent =
            "✓ Archivo MEGA localizado correctamente.";


        log(
            `✓ Archivo: ${name}`,
            "success"
        );


        log(
            `✓ Tamaño: ${formatBytes(fileSize)}`,
            "success"
        );


        /*
         * Crear el reproductor.
         */

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
            `No se pudo leer el archivo: ${getErrorMessage(error)}`;


        log(
            `✗ Error: ${getErrorMessage(error)}`,
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
            "No existe archivo MEGA cargado."
        );

    }


    if (
        !Number.isFinite(start) ||
        !Number.isFinite(size)
    ) {

        throw new Error(
            "Inicio o tamaño de rango inválido."
        );

    }


    if (
        start < 0 ||
        start >= fileSize
    ) {

        throw new Error(
            `Posición fuera de rango: ${start}`
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
            `Rango duplicado: ${start} → ${end}`
        );

    }


    requestedRanges.add(
        rangeKey
    );


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
                1,

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
            "MEGAJS no devolvió un stream."
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


                    let array;


                    if (
                        chunk instanceof
                        Uint8Array
                    ) {

                        array =
                            chunk;

                    } else if (
                        chunk.buffer
                    ) {

                        array =
                            new Uint8Array(
                                chunk.buffer,
                                chunk.byteOffset ||
                                0,
                                chunk.byteLength
                            );

                    } else {

                        log(
                            "⚠ Bloque MEGAJS con formato desconocido.",
                            "error"
                        );


                        return;

                    }


                    const copy =
                        array.slice();


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
        const chunk of chunks
    ) {

        result.set(
            chunk,
            offset
        );


        offset +=
            chunk.byteLength;

    }


    const arrayBuffer =
        result.buffer;


    /*
     * CRÍTICO:
     *
     * MP4Box necesita esta propiedad.
     */

    arrayBuffer.fileStart =
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
            arrayBuffer,

        start:
            start,

        end:
            end,

        size:
            received

    };

}


/* =========================================================
   CREAR MEDIASOURCE
========================================================= */

async function createMediaSource() {

    if (
        !window.MediaSource
    ) {

        throw new Error(
            "Este navegador no soporta MediaSource Extensions."
        );

    }


    if (
        !videoElement
    ) {

        throw new Error(
            "El elemento <video> todavía no existe."
        );

    }


    /*
     * Liberar URL anterior.
     */

    if (
        mediaSourceUrl
    ) {

        try {

            URL.revokeObjectURL(
                mediaSourceUrl
            );

        } catch (
            error
        ) {

            console.warn(
                error
            );

        }


        mediaSourceUrl =
            null;

    }


    mediaSource =
        new MediaSource();


    mediaSourceUrl =
        URL.createObjectURL(
            mediaSource
        );


    videoElement.src =
        mediaSourceUrl;


    mediaSourceOpenPromise =
        new Promise(
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


    await mediaSourceOpenPromise;

}


/* =========================================================
   CREAR SOURCEBUFFER
========================================================= */

function createSourceBuffers(
    info
) {

    if (
        !mediaSource ||
        mediaSource.readyState !==
            "open"
    ) {

        throw new Error(
            "MediaSource no está abierto."
        );

    }


    sourceBuffers.clear();


    sourceQueues.clear();


    sourceBufferReady.clear();


    const tracks =
        info.tracks ||
        [];


    for (
        const track of
        tracks
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

            log(
                `⚠ Track ${track.id} no tiene MIME reconocible.`,
                "error"
            );


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
                `✗ El navegador NO soporta: ${mime}`,
                "error"
            );


            continue;

        }


        const sourceBuffer =
            mediaSource.addSourceBuffer(
                mime
            );


        /*
         * Mantener segmentos en orden.
         */

        sourceBuffer.mode =
            "segments";


        sourceBuffers.set(
            track.id,
            sourceBuffer
        );


        sourceQueues.set(
            track.id,
            []);


        sourceBufferReady.set(
            track.id,
            true
        );


        sourceBuffer.addEventListener(
            "updateend",
            () => {

                pumpSourceBuffer(
                    track.id
                );


                tryStartPlayback();

            }
        );


        sourceBuffer.addEventListener(
            "error",
            () => {

                log(
                    `✗ SourceBuffer track ${track.id} informó un error.`,
                    "error"
                );


                mp4Error =
                    true;

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
            "No se pudo crear ningún SourceBuffer compatible."
        );

    }

}


/* =========================================================
   AGREGAR A COLA
========================================================= */

function queueSourceBuffer(
    trackId,
    buffer
) {

    const queue =
        sourceQueues.get(
            trackId
        );


    if (
        !queue
    ) {

        log(
            `⚠ No existe cola para track ${trackId}.`,
            "error"
        );


        return;

    }


    queue.push(
        buffer
    );


    pumpSourceBuffer(
        trackId
    );

}


/* =========================================================
   PROCESAR COLA SOURCEBUFFER
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


    const buffer =
        queue.shift();


    try {

        sourceBuffer.appendBuffer(
            buffer
        );


    } catch (
        error
    ) {

        queue.unshift(
            buffer
        );


        log(
            `✗ Error appendBuffer track ${trackId}: ${getErrorMessage(error)}`,
            "error"
        );

    }

}


/* =========================================================
   PREPARAR SEGMENTACIÓN
========================================================= */

function prepareSegmentation(
    info
) {

    if (
        segmentationPrepared
    ) {

        return;

    }


    if (
        !mp4box
    ) {

        throw new Error(
            "MP4Box no está disponible."
        );

    }


    if (
        !mediaSource ||
        mediaSource.readyState !==
            "open"
    ) {

        throw new Error(
            "MediaSource todavía no está abierto."
        );

    }


    /*
     * Crear SourceBuffers.
     */

    createSourceBuffers(
        info
    );


    /*
     * onSegment debe existir antes
     * de inicializar la segmentación.
     */

    mp4box.onSegment =
        (
            trackId,
            user,
            buffer,
            sampleNumber,
            last
        ) => {

            totalSegments++;


            const targetSourceBuffer =
                sourceBuffers.get(
                    trackId
                );


            if (
                !targetSourceBuffer
            ) {

                log(
                    `⚠ Segmento track ${trackId}, pero no existe SourceBuffer.`,
                    "error"
                );


                return;

            }


            queueSourceBuffer(
                trackId,
                buffer
            );


            log(
                `✓ Segmento #${totalSegments} track ${trackId}: ${formatBytes(buffer.byteLength)}`,
                "success"
            );


            if (
                Number.isFinite(
                    sampleNumber
                )
            ) {

                log(
                    `  Próxima muestra: ${sampleNumber}`,
                    "info"
                );

            }


            if (
                last
            ) {

                log(
                    `✓ Último segmento del track ${trackId}.`,
                    "success"
                );

            }


            tryStartPlayback();

        };


    /*
     * Configurar todos los tracks.
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
            sourceBuffers.get(
                track.id
            ),
            {
                nbSamples:
                    SEGMENT_SAMPLES,

                rapAlignement:
                    true,

                normalizeAudioSampleEntriesForMSE:
                    true

            }
        );


        log(
            `✓ Segmentación configurada para track ${track.id}.`,
            "success"
        );

    }


    /*
     * Crear initialization segments.
     *
     * Usamos per-track para que cada
     * SourceBuffer reciba su propio init.
     */

    const initSegments =
        mp4box.initializeSegmentation(
            "per-track"
        );


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
                init.buffer
            );


            log(
                `✓ Initialization segment track ${init.id}: ${formatBytes(init.buffer.byteLength)}`,
                "success"
            );

        }

    }


    segmentationPrepared =
        true;


    /*
     * Comenzar procesamiento.
     */

    mp4box.start();


    log(
        "✓ MP4Box inició procesamiento de muestras.",
        "success"
    );

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


            /*
             * En este punto MOOV está disponible.
             *
             * La preparación de MSE se hace
             * inmediatamente si MediaSource ya
             * está abierto.
             */

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

        let message =
            `Track ${track.id}: codec=${track.codec || "desconocido"}`;


        if (
            track.video
        ) {

            message +=
                ` | vídeo ${track.video.width}x${track.video.height}`;

        }


        if (
            track.audio
        ) {

            message +=
                ` | audio ${track.audio.sample_rate || "—"} Hz`;

        }


        log(
            message,
            "success"
        );

    }


    if (
        playerInfoElement
    ) {

        playerInfoElement.textContent =
            `MP4: ${formatTime(duration)} | ` +
            `Tracks: ${tracks.length} | ` +
            `Datos descargados: ${formatBytes(totalDownloaded)}`;

    }

}


/* =========================================================
   INTENTAR REPRODUCCIÓN
========================================================= */

async function tryStartPlayback() {

    if (
        !videoElement
    ) {

        return;

    }


    if (
        playbackStarted
    ) {

        return;

    }


    /*
     * Necesitamos al menos algún rango
     * temporal disponible.
     */

    if (
        videoElement.readyState <
        1
    ) {

        return;

    }


    try {

        await videoElement.play();


        playbackStarted =
            true;


        log(
            "▶ El navegador aceptó la reproducción.",
            "success"
        );


        setStatus(
            "Reproduciendo",
            "success"
        );


    } catch (
        error
    ) {

        /*
         * No es necesariamente un error.
         *
         * Los navegadores pueden bloquear autoplay.
         */

        log(
            "ℹ El navegador no inició autoplay. Pulsa PLAY en el vídeo.",
            "info"
        );

    }

}


/* =========================================================
   SIGUIENTE POSICIÓN MP4BOX
========================================================= */

function calculateNextPosition(
    returnedPosition,
    block
) {

    if (
        Number.isFinite(
            returnedPosition
        )
    ) {

        const requested =
            Number(
                returnedPosition
            );


        /*
         * Esta es la situación importante:
         *
         * MP4Box pide una posición posterior
         * al bloque actual.
         */

        if (
            requested >
            block.end &&
            requested <
            fileSize
        ) {

            return requested;

        }


        /*
         * Si pide algo dentro del bloque,
         * continuar al final evita repetir.
         */

        if (
            requested >=
            block.start &&
            requested <=
            block.end
        ) {

            return (
                block.end +
                1
            );

        }


        /*
         * No retroceder automáticamente.
         */

        if (
            requested <
            block.start
        ) {

            return (
                block.end +
                1
            );

        }

    }


    return (
        block.end +
        1
    );

}


/* =========================================================
   INICIAR REPRODUCTOR EXPERIMENTAL
========================================================= */

async function startExperimentalPlayer() {

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
        activeOperation
    ) {

        log(
            "⚠ Ya existe una operación activa.",
            "error"
        );


        return;

    }


    activeOperation =
        "player";


    const thisOperation =
        ++operationId;


    playerStarted =
        true;


    playerStopped =
        false;


    playbackStarted =
        false;


    mp4Ready =
        false;


    mp4Error =
        false;


    mp4Info =
        null;


    segmentationPrepared =
        false;


    totalSegments =
        0;


    totalDownloaded =
        0;


    requestedRanges.clear();


    sourceBuffers.clear();


    sourceQueues.clear();


    sourceBufferReady.clear();


    startPlayerButton.disabled =
        true;


    stopPlayerButton.disabled =
        false;


    btnInfo.disabled =
        true;


    btnChunk.disabled =
        true;


    setStatus(
        "Preparando reproductor...",
        "loading"
    );


    resultBox.className =
        "result-box";


    resultBox.textContent =
        "Preparando reproducción experimental...";


    log(
        "=================================================",
        "info"
    );


    log(
        "INICIANDO REPRODUCTOR EXPERIMENTAL",
        "info"
    );


    log(
        "=================================================",
        "info"
    );


    log(
        `✓ Límite de seguridad: ${formatBytes(MAX_TEST_BYTES)}`,
        "info"
    );


    try {

        /*
         * Crear MediaSource primero.
         */

        await createMediaSource();


        /*
         * Crear MP4Box.
         */

        mp4box =
            MP4Box.createFile();


        configureMP4Box();


        /*
         * =================================================
         * PRIMER RANGO
         * =================================================
         */

        const firstSize =
            Math.min(
                INITIAL_RANGE_SIZE,
                fileSize
            );


        const firstBlock =
            await readMegaRange(
                0,
                firstSize,
                "MEGA"
            );


        /*
         * Entregar primeros 4 MB.
         */

        let nextPosition =
            mp4box.appendBuffer(
                firstBlock.buffer
            );


        if (
            Number.isFinite(
                nextPosition
            )
        ) {

            log(
                `MP4Box indica siguiente posición: ${Number(nextPosition).toLocaleString()}`,
                "success"
            );

        }


        /*
         * =================================================
         * LECTURA DIRIGIDA
         * =================================================
         */

        let previousPosition =
            null;


        let requests =
            1;


        while (
            !mp4Ready &&
            !mp4Error &&
            !playerStopped &&
            thisOperation ===
                operationId &&
            requests <
                MAX_DIRECTED_REQUESTS &&
            totalDownloaded <
                MAX_TEST_BYTES
        ) {

            /*
             * Si MP4Box no indicó una posición,
             * continuar después del bloque.
             */

            nextPosition =
                calculateNextPosition(
                    nextPosition,
                    firstBlock
                );


            if (
                previousPosition ===
                nextPosition
            ) {

                log(
                    `⚠ MP4Box repitió posición ${nextPosition.toLocaleString()}.`,
                    "error"
                );


                break;

            }


            previousPosition =
                nextPosition;


            if (
                nextPosition >=
                fileSize
            ) {

                log(
                    "⚠ MP4Box llegó al final del archivo.",
                    "error"
                );


                break;

            }


            const remaining =
                MAX_TEST_BYTES -
                totalDownloaded;


            const size =
                Math.min(
                    DIRECTED_RANGE_SIZE,
                    remaining,
                    fileSize -
                    nextPosition
                );


            if (
                size <=
                0
            ) {

                break;

            }


            requests++;


            const block =
                await readMegaRange(
                    nextPosition,
                    size,
                    "MEGA DIRIGIDO"
                );


            /*
             * Enviar a MP4Box.
             */

            nextPosition =
                mp4box.appendBuffer(
                    block.buffer
                );


            if (
                Number.isFinite(
                    nextPosition
                )
            ) {

                log(
                    `MP4Box indica siguiente posición: ${Number(nextPosition).toLocaleString()}`,
                    "success"
                );

            }


            /*
             * Si MOOV ya fue encontrado,
             * onReady habrá preparado MSE.
             */

            if (
                mp4Ready
            ) {

                break;

            }


            /*
             * Protección contra loop.
             */

            if (
                nextPosition ===
                block.start
            ) {

                log(
                    "⚠ MP4Box está solicitando nuevamente el inicio del mismo rango.",
                    "error"
                );


                break;

            }


            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        0
                    )
            );

        }


        /*
         * =================================================
         * SI MOOV FUE ENCONTRADO
         * =================================================
         */

        if (
            mp4Ready
        ) {

            log(
                "✓ MOOV disponible.",
                "success"
            );


            /*
             * Continuar solicitando datos dirigidos
             * para que MP4Box pueda generar segmentos.
             */

            let mediaRequests =
                0;


            let lastMediaPosition =
                null;


            while (
                !playerStopped &&
                !mp4Error &&
                thisOperation ===
                    operationId &&
                mediaRequests <
                    MAX_DIRECTED_REQUESTS &&
                totalDownloaded <
                    MAX_TEST_BYTES
            ) {

                /*
                 * Si MP4Box no devuelve una posición,
                 * necesitamos observar si ya generó
                 * segmentos.
                 */

                if (
                    !Number.isFinite(
                        nextPosition
                    )
                ) {

                    log(
                        "ℹ MP4Box no solicita otro rango en este momento.",
                        "info"
                    );


                    break;

                }


                if (
                    nextPosition >=
                    fileSize
                ) {

                    log(
                        "⚠ No quedan posiciones disponibles.",
                        "info"
                    );


                    break;

                }


                if (
                    lastMediaPosition ===
                    nextPosition
                ) {

                    log(
                        `⚠ MP4Box repite posición ${nextPosition.toLocaleString()}.`,
                        "info"
                    );


                    break;

                }


                lastMediaPosition =
                    nextPosition;


                const remaining =
                    MAX_TEST_BYTES -
                    totalDownloaded;


                const size =
                    Math.min(
                        DIRECTED_RANGE_SIZE,
                        remaining,
                        fileSize -
                        nextPosition
                    );


                if (
                    size <=
                    0
                ) {

                    break;

                }


                mediaRequests++;


                const block =
                    await readMegaRange(
                        nextPosition,
                        size,
                        "DATOS MEDIA"
                    );


                nextPosition =
                    mp4box.appendBuffer(
                        block.buffer
                    );


                if (
                    Number.isFinite(
                        nextPosition
                    )
                ) {

                    log(
                        `MP4Box solicita siguiente posición: ${Number(nextPosition).toLocaleString()}`,
                        "success"
                    );

                }


                /*
                 * Intentar reproducción después
                 * de cada bloque.
                 */

                await tryStartPlayback();


                await new Promise(
                    resolve =>
                        setTimeout(
                            resolve,
                            0
                        )
                );

            }


            /*
             * Último intento de reproducción.
             */

            await tryStartPlayback();


            setStatus(
                playbackStarted
                    ? "Reproduciendo"
                    : "MP4 preparado / esperando datos",
                "success"
            );


            resultBox.className =
                "result-box result-success";


            resultBox.textContent =
                `✓ Reproductor preparado. Datos MEGA utilizados: ${formatBytes(totalDownloaded)} de ${formatBytes(fileSize)}.`;


        } else {

            setStatus(
                "No se pudo preparar el MP4",
                "error"
            );


            resultBox.className =
                "result-box result-error";


            resultBox.textContent =
                `MP4Box no encontró la estructura dentro del límite de ${formatBytes(MAX_TEST_BYTES)}.`;


            log(
                "⚠ El reproductor no continuará descargando automáticamente.",
                "error"
            );

        }


    } catch (
        error
    ) {

        mp4Error =
            true;


        setStatus(
            "Error del reproductor",
            "error"
        );


        resultBox.className =
            "result-box result-error";


        resultBox.textContent =
            `Error del reproductor: ${getErrorMessage(error)}`;


        log(
            `✗ Error del reproductor: ${getErrorMessage(error)}`,
            "error"
        );

    } finally {

        if (
            thisOperation ===
            operationId
        ) {

            activeOperation =
                null;

        }


        playerStarted =
            false;


        btnInfo.disabled =
            false;


        btnChunk.disabled =
            false;


        if (
            startPlayerButton
        ) {

            startPlayerButton.disabled =
                !currentFile;

        }


        if (
            stopPlayerButton
        ) {

            stopPlayerButton.disabled =
                true;

        }

    }

}


/* =========================================================
   DETENER REPRODUCTOR
========================================================= */

function stopExperimentalPlayer() {

    operationId++;


    playerStopped =
        true;


    playerStarted =
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
        ) {

            console.warn(
                error
            );

        }

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
        ) {

            console.warn(
                error
            );

        }

    }


    if (
        startPlayerButton
    ) {

        startPlayerButton.disabled =
            !currentFile;

    }


    if (
        stopPlayerButton
    ) {

        stopPlayerButton.disabled =
            true;

    }


    btnInfo.disabled =
        false;


    btnChunk.disabled =
        false;


    setStatus(
        "Prueba detenida",
        "idle"
    );


    log(
        "⏹ Reproductor experimental detenido.",
        "info"
    );

}


/* =========================================================
   RESET REPRODUCTOR
========================================================= */

function resetPlayerState() {

    operationId++;


    playerStarted =
        false;


    playerStopped =
        true;


    playbackStarted =
        false;


    mp4Ready =
        false;


    mp4Error =
        false;


    mp4Info =
        null;


    segmentationPrepared =
        false;


    totalSegments =
        0;


    if (
        mp4box
    ) {

        try {

            mp4box.stop();

        } catch (
            error
        ) {

            console.warn(
                error
            );

        }

    }


    mp4box =
        null;


    sourceBuffers.clear();


    sourceQueues.clear();


    sourceBufferReady.clear();


    if (
        mediaSource &&
        mediaSource.readyState ===
            "open"
    ) {

        try {

            mediaSource.endOfStream();

        } catch (
            error
        ) {

            console.warn(
                error
            );

        }

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
        ) {

            console.warn(
                error
            );

        }


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
        ) {

            console.warn(
                error
            );

        }

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
   PRUEBA INDEPENDIENTE DE BLOQUES
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
            "⚠ Ya existe una operación activa.",
            "error"
        );


        return;

    }


    activeOperation =
        "blocks";


    const thisOperation =
        ++operationId;


    requestedRanges.clear();


    totalDownloaded =
        0;


    let correct =
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
            TEST_BLOCK_SIZE
        )

    ];


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
                thisOperation !==
                operationId
            ) {

                break;

            }


            const block =
                await readMegaRange(
                    positions[i],
                    TEST_BLOCK_SIZE,
                    `BLOQUE ${i + 1}`
                );


            if (
                block.size ===
                TEST_BLOCK_SIZE
            ) {

                correct++;


                log(
                    `✓ Bloque ${i + 1}: 1 MB correcto.`,
                    "success"
                );

            }

        }


        log(
            `✓ Resultado: ${correct}/${positions.length} bloques correctos.`,
            "success"
        );


        log(
            `✓ Datos recibidos: ${formatBytes(totalDownloaded)}`,
            "success"
        );


    } catch (
        error
    ) {

        log(
            `✗ Error en prueba de bloques: ${getErrorMessage(error)}`,
            "error"
        );

    } finally {

        activeOperation =
            null;

    }

}


/* =========================================================
   ANÁLISIS DIRIGIDO
========================================================= */

async function analyzeMP4Directed() {

    if (
        !currentFile
    ) {

        log(
            "⚠ Primero debes cargar un archivo MEGA.",
            "error"
        );


        return;

    }


    if (
        activeOperation
    ) {

        log(
            "⚠ Ya existe una operación activa.",
            "error"
        );


        return;

    }


    activeOperation =
        "analysis";


    const thisOperation =
        ++operationId;


    btnInfo.disabled =
        true;


    btnChunk.disabled =
        true;


    if (
        startPlayerButton
    ) {

        startPlayerButton.disabled =
            true;

    }


    requestedRanges.clear();


    totalDownloaded =
        0;


    mp4Ready =
        false;


    mp4Error =
        false;


    setStatus(
        "Analizando MP4 por rangos...",
        "loading"
    );


    resultBox.className =
        "result-box";


    resultBox.textContent =
        "Analizando estructura del MP4...";


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


        const firstSize =
            Math.min(
                INITIAL_RANGE_SIZE,
                fileSize
            );


        const firstBlock =
            await readMegaRange(
                0,
                firstSize,
                "INICIO"
            );


        let nextPosition =
            mp4box.appendBuffer(
                firstBlock.buffer
            );


        if (
            Number.isFinite(
                nextPosition
            )
        ) {

            log(
                `MP4Box indica siguiente posición: ${Number(nextPosition).toLocaleString()}`,
                "success"
            );

        }


        let previousPosition =
            null;


        let requests =
            1;


        while (
            !mp4Ready &&
            !mp4Error &&
            thisOperation ===
                operationId &&
            requests <
                MAX_DIRECTED_REQUESTS &&
            totalDownloaded <
                MAX_TEST_BYTES
        ) {

            nextPosition =
                calculateNextPosition(
                    nextPosition,
                    firstBlock
                );


            if (
                nextPosition >=
                fileSize
            ) {

                break;

            }


            if (
                previousPosition ===
                nextPosition
            ) {

                log(
                    `⚠ Posición repetida: ${nextPosition.toLocaleString()}`,
                    "error"
                );


                break;

            }


            previousPosition =
                nextPosition;


            const remaining =
                MAX_TEST_BYTES -
                totalDownloaded;


            const size =
                Math.min(
                    DIRECTED_RANGE_SIZE,
                    remaining,
                    fileSize -
                    nextPosition
                );


            requests++;


            const block =
                await readMegaRange(
                    nextPosition,
                    size,
                    "RANGO DIRIGIDO"
                );


            nextPosition =
                mp4box.appendBuffer(
                    block.buffer
                );


            if (
                Number.isFinite(
                    nextPosition
                )
            ) {

                log(
                    `MP4Box indica siguiente posición: ${Number(nextPosition).toLocaleString()}`,
                    "success"
                );

            }


            if (
                mp4Ready
            ) {

                break;

            }


            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        0
                    )
            );

        }


        if (
            mp4Ready
        ) {

            setStatus(
                "MP4 analizado correctamente",
                "success"
            );


            resultBox.className =
                "result-box result-success";


            resultBox.textContent =
                `✓ MP4Box encontró la estructura utilizando ${formatBytes(totalDownloaded)} de ${formatBytes(fileSize)}.`;


            log(
                "✓ PRUEBA DIRIGIDA COMPLETADA.",
                "success"
            );


        } else {

            setStatus(
                "Estructura no localizada",
                "error"
            );


            resultBox.className =
                "result-box result-error";


            resultBox.textContent =
                `MOOV no fue localizado dentro del límite de ${formatBytes(MAX_TEST_BYTES)}.`;

        }


    } catch (
        error
    ) {

        setStatus(
            "Error de análisis",
            "error"
        );


        resultBox.className =
            "result-box result-error";


        resultBox.textContent =
            `Error: ${getErrorMessage(error)}`;


        log(
            `✗ Error: ${getErrorMessage(error)}`,
            "error"
        );

    } finally {

        if (
            thisOperation ===
            operationId
        ) {

            activeOperation =
                null;

        }


        btnInfo.disabled =
            false;


        btnChunk.disabled =
            false;


        if (
            startPlayerButton
        ) {

            startPlayerButton.disabled =
                !currentFile;

        }

    }

}


/* =========================================================
   CREAR BOTÓN DE ANÁLISIS DIRIGIDO
========================================================= */

function createDirectedButton() {

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


    button.style.marginLeft =
        "8px";


    btnChunk.parentNode.insertBefore(
        button,
        btnChunk.nextSibling
    );


    button.addEventListener(
        "click",
        analyzeMP4Directed
    );


    return button;

}


/* =========================================================
   BOTÓN ANÁLISIS DIRIGIDO
========================================================= */

const directedButton =
    createDirectedButton();


/* =========================================================
   OBSERVADOR
========================================================= */

const buttonObserver =
    new MutationObserver(
        () => {

            directedButton.disabled =
                !currentFile ||
                Boolean(
                    activeOperation
                );

        }
    );


buttonObserver.observe(
    btnChunk,
    {
        attributes:
            true
    }
);


/* =========================================================
   ACTUALIZACIÓN DEL BOTÓN DIRIGIDO
========================================================= */

setInterval(
    () => {

        if (
            !directedButton
        ) {

            return;

        }


        directedButton.disabled =
            !currentFile ||
            Boolean(
                activeOperation
            );

    },
    250
);


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
                "⚠ Hay una operación activa. Deténla primero.",
                "error"
            );


            return;

        }


        resetPlayerState();


        currentFile =
            null;


        currentVideo =
            null;


        fileSize =
            0;


        totalDownloaded =
            0;


        requestedRanges.clear();


        mp4box =
            null;


        resetInfo();


        btnChunk.disabled =
            true;


        directedButton.disabled =
            true;


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
   EVENTOS PRINCIPALES
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
    "✓ Lectura dirigida activada.",
    "success"
);


log(
    `✓ Límite de seguridad: ${formatBytes(MAX_TEST_BYTES)}.`,
    "info"
);


log(
    "✓ Reproductor experimental disponible al cargar un archivo.",
    "success"
);


log(
    "Selecciona un vídeo y pulsa 'Leer información del archivo'.",
    "info"
);
