/* =========================================================
   MICRO-DRAMAS-ESP
   LABORATORIO FINAL
   MEGA + MEGAJS + MP4BOX + MEDIASOURCE

   OBJETIVO:

   Reproducir experimentalmente un MP4 privado
   almacenado en MEGA utilizando:

       MEGA
         ↓
       MEGAJS
         ↓
       rangos de bytes
         ↓
       MP4Box.js
         ↓
       fragmentación
         ↓
       MediaSource
         ↓
       SourceBuffer
         ↓
       <video>

   ESTA PÁGINA ES SOLAMENTE DE LABORATORIO.

   NO modifica:
       - D1
       - /admin
       - portal público

   IMPORTANTE:

   Esta versión utiliza DOS FASES:

   FASE 1:
       Encontrar y analizar MOOV.

   FASE 2:
       MP4Box.seek(0, true)
       ↓
       volver al comienzo del Mdat
       ↓
       procesar muestras
       ↓
       generar segmentos MSE

   NO se descarga automáticamente
   el archivo completo.
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


/*
 * Primer bloque para localizar la estructura.
 *
 * 4 MB.
 */

const INITIAL_RANGE_SIZE =
    4 * 1024 * 1024;


/*
 * Tamaño de los rangos utilizados
 * para alimentar MP4Box.
 *
 * 8 MB permite trabajar cómodamente
 * sin generar demasiadas solicitudes.
 */

const MEDIA_RANGE_SIZE =
    8 * 1024 * 1024;


/*
 * Número de muestras aproximado
 * por segmento.

 * MP4Box ajustará el procesamiento
 * según cada pista.
 */

const SAMPLES_PER_SEGMENT =
    60;


/*
 * Objetivo inicial de buffer.

 * Queremos aproximadamente
 * 30 segundos antes de dejar
 * que el reproductor continúe.
 */

const INITIAL_BUFFER_SECONDS =
    30;


/*
 * Objetivo máximo de buffer.

 * Mientras el vídeo se reproduce,
 * intentaremos mantener hasta
 * aproximadamente 45 segundos.
 */

const TARGET_BUFFER_SECONDS =
    45;


/*
 * Cuando el buffer disponible
 * cae por debajo de este valor,
 * se solicitan más datos.
 */

const LOW_BUFFER_SECONDS =
    8;


/*
 * Máximo de datos que se permitirán
 * descargar durante esta prueba
 * antes de detenerla automáticamente.

 * Esto evita volver a consumir
 * varios GB si algo falla.
 *
 * 512 MB son suficientes para
 * comprobar el mecanismo.
 */

const MAX_TEST_DOWNLOAD =
    512 * 1024 * 1024;


/*
 * Tiempo máximo de espera para
 * encontrar MOOV durante la prueba.
 *
 * En nuestro archivo ya sabemos
 * que está aproximadamente en
 * 5.52 GB, por lo que la función
 * solicitará directamente esa posición
 * cuando MP4Box la indique.
 */

const MOOV_PROBE_SIZE =
    8 * 1024 * 1024;


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
   ESTADO GLOBAL
========================================================= */

let currentFile =
    null;


let currentVideo =
    null;


let fileSize =
    0;


/*
 * Instancia actual de MP4Box.
 */

let mp4box =
    null;


/*
 * Información obtenida del MP4.
 */

let mp4Info =
    null;


/*
 * MOOV encontrado.
 */

let mp4Ready =
    false;


/*
 * Error general de MP4Box.
 */

let mp4Error =
    false;


/*
 * Operación activa.
 */

let activeOperation =
    null;


/*
 * Identificador para evitar
 * operaciones antiguas.
 */

let operationId =
    0;


/*
 * MediaSource.
 */

let mediaSource =
    null;


/*
 * URL blob utilizada por el vídeo.
 */

let mediaSourceUrl =
    null;


/*
 * Elemento <video>.
 */

let videoElement =
    null;


/*
 * SourceBuffers por track.
 */

let sourceBuffers =
    new Map();


/*
 * Colas independientes
 * para cada SourceBuffer.
 */

let sourceQueues =
    new Map();


/*
 * Bytes descargados durante
 * esta ejecución.
 */

let totalDownloaded =
    0;


/*
 * Cantidad de segmentos recibidos.
 */

let totalSegments =
    0;


/*
 * Bytes de segmentos enviados
 * realmente a SourceBuffer.
 */

let totalAppendedBytes =
    0;


/*
 * Cursor actual de lectura MEGA.
 */

let megaCursor =
    0;


/*
 * Cantidad de solicitudes.
 */

let megaRequests =
    0;


/*
 * Reproducción iniciada.
 */

let playbackStarted =
    false;


/*
 * Usuario ha detenido el reproductor.
 */

let playerStopped =
    false;


/*
 * Estamos descargando datos multimedia.
 */

let mediaStreamingStarted =
    false;


/*
 * Último error del vídeo.
 */

let videoErrorCode =
    null;


/*
 * Datos de configuración
 * del reproductor.
 */

let videoTrackId =
    null;


let audioTrackId =
    null;


/*
 * Promesa que espera a que MP4Box
 * encuentre MOOV.
 */

let metadataReadyResolve =
    null;


let metadataReadyReject =
    null;


let metadataReadyPromise =
    null;


/*
 * Promesa que espera a que
 * MediaSource esté abierto.
 */

let mediaSourceReadyPromise =
    null;


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
   ERROR
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
   ESTADO VISUAL
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
   FORMATO BYTES
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
   FORMATO TIEMPO
========================================================= */

function formatTime(
    seconds
) {

    if (
        !Number.isFinite(
            seconds
        )
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
   LIMPIAR INFORMACIÓN
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
   ACTUALIZAR PROGRESO
========================================================= */

function updateDownloadProgress() {

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
     * Este porcentaje representa
     * bytes realmente descargados.

     * NO representa la posición del
     * cursor dentro del archivo.

     * Esto es importante porque
     * podemos saltar directamente
     * al MOOV.
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
   ACTUALIZAR DIAGNÓSTICO DEL REPRODUCTOR
========================================================= */

function updatePlayerDiagnostics() {

    const info =
        document.getElementById(
            "mega-player-diagnostics"
        );


    if (!info) {

        return;

    }


    let currentTime =
        0;


    let duration =
        0;


    let bufferSeconds =
        0;


    let bufferTotal =
        0;


    if (
        videoElement
    ) {

        currentTime =
            Number(
                videoElement.currentTime ||
                0
            );


        duration =
            Number(
                videoElement.duration ||
                0
            );


        const buffered =
            videoElement.buffered;


        if (
            buffered &&
            buffered.length > 0
        ) {

            bufferTotal =
                buffered.end(
                    buffered.length - 1
                );


            if (
                currentTime >=
                buffered.start(0) &&
                currentTime <=
                bufferTotal
            ) {

                bufferSeconds =
                    bufferTotal -
                    currentTime;

            }

        }

    }


    info.textContent =
        [
            `Estado: ${statusElement.textContent || "—"}`,
            `Posición: ${formatTime(currentTime)}`,
            `Duración: ${formatTime(duration)}`,
            `Buffer disponible: ${bufferSeconds.toFixed(1)} s`,
            `Buffer total: ${bufferTotal.toFixed(1)} s`,
            `MEGA descargado: ${formatBytes(totalDownloaded)}`,
            `Solicitudes MEGA: ${megaRequests}`,
            `Segmentos: ${totalSegments}`,
            `Segmentos append: ${formatBytes(totalAppendedBytes)}`,
            `Cursor MEGA: ${megaCursor.toLocaleString()}`,
            `MP4Box listo: ${mp4Ready ? "Sí" : "No"}`,
            `Reproducción: ${playbackStarted ? "Sí" : "No"}`
        ].join(
            " | "
        );

}


/* =========================================================
   ACTUALIZACIÓN PERIÓDICA
========================================================= */

let diagnosticsTimer =
    null;


function startDiagnosticsTimer() {

    if (
        diagnosticsTimer
    ) {

        clearInterval(
            diagnosticsTimer
        );

    }


    diagnosticsTimer =
        setInterval(
            updatePlayerDiagnostics,
            500
        );

}


function stopDiagnosticsTimer() {

    if (
        diagnosticsTimer
    ) {

        clearInterval(
            diagnosticsTimer
        );


        diagnosticsTimer =
            null;

    }

}


/* =========================================================
   CARGAR INFORMACIÓN MEGA
========================================================= */

async function loadFileInformation() {

    if (
        activeOperation
    ) {

        log(
            "⚠ Hay una operación activa. Detén el reproductor antes de cambiar.",
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


    megaCursor =
        0;


    megaRequests =
        0;


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
            "Solicitando atributos del archivo...",
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
            "No existe un archivo MEGA cargado."
        );

    }


    if (
        start < 0
    ) {

        throw new Error(
            "La posición inicial no puede ser negativa."
        );

    }


    if (
        start >= fileSize
    ) {

        throw new Error(
            `El rango comienza fuera del archivo: ${start}`
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


    log(
        `${label} → ${start.toLocaleString()} → ${end.toLocaleString()} (${formatBytes(expected)})`,
        "info"
    );


    megaRequests++;


    const stream =
        currentFile.download({

            start:
                start,

            end:
                end,

            maxConnections:
                1,

            initialChunkSize:
                128 * 1024,

            chunkSizeIncrement:
                128 * 1024,

            maxChunkSize:
                1024 * 1024

        });


    if (!stream) {

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

                    if (!chunk) {

                        return;

                    }


                    let array;


                    if (
                        chunk instanceof Uint8Array
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


    const buffer =
        new Uint8Array(
            received
        );


    let offset =
        0;


    for (
        const chunk of chunks
    ) {

        buffer.set(
            chunk,
            offset
        );


        offset +=
            chunk.byteLength;

    }


    const arrayBuffer =
        buffer.buffer;


    /*
     * CRÍTICO:

     * MP4Box necesita saber
     * la posición real del bloque
     * dentro del archivo original.
     */

    arrayBuffer.fileStart =
        start;


    totalDownloaded +=
        received;


    updateDownloadProgress();


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


    const title =
        document.createElement(
            "h3"
        );


    title.textContent =
        "Reproductor experimental MEGA";


    title.style.marginTop =
        "0";


    panel.appendChild(
        title
    );


    const architecture =
        document.createElement(
            "div"
        );


    architecture.textContent =
        "MEGAJS → MP4Box.js → MediaSource → <video>";


    architecture.style.opacity =
        "0.75";


    architecture.style.marginBottom =
        "15px";


    panel.appendChild(
        architecture
    );


    const buttonRow =
        document.createElement(
            "div"
        );


    buttonRow.style.display =
        "flex";


    buttonRow.style.flexWrap =
        "wrap";


    buttonRow.style.gap =
        "10px";


    const analyzeButton =
        document.createElement(
            "button"
        );


    analyzeButton.id =
        "btn-analyze-mp4";


    analyzeButton.textContent =
        "Analizar MP4";


    const startButton =
        document.createElement(
            "button"
        );


    startButton.id =
        "btn-start-player";


    startButton.textContent =
        "Iniciar reproductor";


    const stopButton =
        document.createElement(
            "button"
        );


    stopButton.id =
        "btn-stop-player";


    stopButton.textContent =
        "Detener";


    stopButton.disabled =
        true;


    buttonRow.appendChild(
        analyzeButton
    );


    buttonRow.appendChild(
        startButton
    );


    buttonRow.appendChild(
        stopButton
    );


    panel.appendChild(
        buttonRow
    );


    const video =
        document.createElement(
            "video"
        );


    video.id =
        "mega-video";


    video.controls =
        true;


    video.playsInline =
        true;


    video.preload =
        "metadata";


    video.style.display =
        "block";


    video.style.width =
        "100%";


    video.style.marginTop =
        "18px";


    video.style.background =
        "#000";


    video.style.borderRadius =
        "8px";


    panel.appendChild(
        video
    );


    const info =
        document.createElement(
            "div"
        );


    info.id =
        "mega-player-info";


    info.style.marginTop =
        "14px";


    info.style.fontFamily =
        "monospace";


    info.style.fontSize =
        "13px";


    info.style.lineHeight =
        "1.6";


    panel.appendChild(
        info
    );


    const diagnostics =
        document.createElement(
            "div"
        );


    diagnostics.id =
        "mega-player-diagnostics";


    diagnostics.style.marginTop =
        "14px";


    diagnostics.style.padding =
        "10px";


    diagnostics.style.fontFamily =
        "monospace";


    diagnostics.style.fontSize =
        "12px";


    diagnostics.style.lineHeight =
        "1.5";


    diagnostics.style.overflowX =
        "auto";


    diagnostics.style.background =
        "#0d0d12";


    diagnostics.style.borderRadius =
        "8px";


    diagnostics.textContent =
        "Diagnóstico esperando reproductor...";


    panel.appendChild(
        diagnostics
    );


    resultBox.parentNode.insertBefore(
        panel,
        resultBox.nextSibling
    );


    videoElement =
        video;


    analyzeButton.addEventListener(
        "click",
        analyzeMP4
    );


    startButton.addEventListener(
        "click",
        startExperimentalPlayer
    );


    stopButton.addEventListener(
        "click",
        stopExperimentalPlayer
    );


    videoElement.addEventListener(
        "playing",
        () => {

            if (
                !playbackStarted
            ) {

                playbackStarted =
                    true;


                log(
                    "===============================================",
                    "success"
                );


                log(
                    "▶ REPRODUCCIÓN INICIADA.",
                    "success"
                );


                log(
                    `✓ Datos descargados hasta reproducción: ${formatBytes(totalDownloaded)}`,
                    "success"
                );


                setStatus(
                    "Reproduciendo",
                    "success"
                );

            }

        }
    );


    videoElement.addEventListener(
        "waiting",
        () => {

            log(
                "⏳ El vídeo necesita más datos.",
                "info"
            );

        }
    );


    videoElement.addEventListener(
        "pause",
        () => {

            if (
                playerStopped
            ) {

                return;

            }


            log(
                "⏸ Vídeo pausado. La precarga puede continuar.",
                "info"
            );

        }
    );


    videoElement.addEventListener(
        "error",
        () => {

            const mediaError =
                videoElement.error;


            videoErrorCode =
                mediaError
                    ? mediaError.code
                    : null;


            log(
                `✗ <video> error. Código: ${videoErrorCode || "desconocido"}`,
                "error"
            );


            if (
                mediaError
            ) {

                log(
                    `✗ MediaError: ${mediaError.message || "sin mensaje"}`,
                    "error"
                );

            }

        }
    );


    videoElement.addEventListener(
        "loadedmetadata",
        () => {

            log(
                `✓ Metadata del elemento <video>: ${formatTime(videoElement.duration)}`,
                "success"
            );

        }
    );


    videoElement.addEventListener(
        "timeupdate",
        updatePlayerDiagnostics
    );

}


/* =========================================================
   CREAR MEDIASOURCE
========================================================= */

function createMediaSource() {

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
            "No existe el elemento <video>."
        );

    }


    mediaSource =
        new MediaSource();


    mediaSourceUrl =
        URL.createObjectURL(
            mediaSource
        );


    videoElement.src =
        mediaSourceUrl;


    mediaSourceReadyPromise =
        new Promise(
            (
                resolve,
                reject
            ) => {

                const onOpen =
                    () => {

                        mediaSource.removeEventListener(
                            "error",
                            onError
                        );


                        log(
                            "✓ MediaSource abierto.",
                            "success"
                        );


                        resolve();

                    };


                const onError =
                    () => {

                        mediaSource.removeEventListener(
                            "sourceopen",
                            onOpen
                        );


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


    return mediaSourceReadyPromise;

}


/* =========================================================
   CREAR SOURCEBUFFERS
========================================================= */

function createSourceBuffers(
    info
) {

    sourceBuffers.clear();


    sourceQueues.clear();


    videoTrackId =
        null;


    audioTrackId =
        null;


    for (
        const track of
        info.tracks ||
        []
    ) {

        if (
            !track.codec
        ) {

            continue;

        }


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
                `✗ MSE NO soporta: ${mime}`,
                "error"
            );


            continue;

        }


        const sourceBuffer =
            mediaSource.addSourceBuffer(
                mime
            );


        sourceBuffers.set(
            track.id,
            sourceBuffer
        );


        sourceQueues.set(
            track.id,
            []
        );


        if (
            track.video
        ) {

            videoTrackId =
                track.id;

        }


        if (
            track.audio
        ) {

            audioTrackId =
                track.id;

        }


        sourceBuffer.addEventListener(
            "updateend",
            () => {

                pumpSourceBuffer(
                    track.id
                );


                updatePlayerDiagnostics();

            }
        );


        sourceBuffer.addEventListener(
            "error",
            () => {

                log(
                    `✗ SourceBuffer error en track ${track.id}.`,
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
        videoTrackId ===
        null
    ) {

        throw new Error(
            "No se pudo crear el SourceBuffer de vídeo."
        );

    }


    log(
        `✓ Track de vídeo seleccionado: ${videoTrackId}`,
        "success"
    );


    if (
        audioTrackId !==
        null
    ) {

        log(
            `✓ Track de audio seleccionado: ${audioTrackId}`,
            "success"
        );

    }

}


/* =========================================================
   ENCOLAR SOURCEBUFFER
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
            `✗ No existe cola para track ${trackId}.`,
            "error"
        );


        return;

    }


    /*
     * Hacemos una copia del ArrayBuffer
     * para evitar problemas de reutilización
     * de memoria por MP4Box.
     */

    let safeBuffer;


    try {

        safeBuffer =
            buffer.slice(
                0
            );

    } catch {

        safeBuffer =
            buffer;

    }


    queue.push(
        safeBuffer
    );


    pumpSourceBuffer(
        trackId
    );

}


/* =========================================================
   APPEND SOURCEBUFFER
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
        !queue ||
        sourceBuffer.updating ||
        queue.length ===
        0
    ) {

        return;

    }


    if (
        !mediaSource ||
        mediaSource.readyState !==
        "open"
    ) {

        return;

    }


    const buffer =
        queue.shift();


    try {

        sourceBuffer.appendBuffer(
            buffer
        );


        totalAppendedBytes +=
            buffer.byteLength;


        updatePlayerDiagnostics();


    } catch (
        error
    ) {

        /*
         * Si el buffer está ocupado,
         * devolvemos el elemento a la cola.
         */

        queue.unshift(
            buffer
        );


        log(
            `✗ appendBuffer track ${trackId}: ${getErrorMessage(error)}`,
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

    createSourceBuffers(
        info
    );


    for (
        const track of
        info.tracks ||
        []
    ) {

        const sourceBuffer =
            sourceBuffers.get(
                track.id
            );


        if (
            !sourceBuffer
        ) {

            continue;

        }


        mp4box.setSegmentOptions(
            track.id,
            sourceBuffer,
            {
                nbSamples:
                    SAMPLES_PER_SEGMENT,

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
     * Inicialización por pista.

     * Esto genera fMP4 init segments
     * para los SourceBuffers.
     */

    const initSegments =
        mp4box.initializeSegmentation(
            "per-track"
        );


    if (
        !Array.isArray(
            initSegments
        )
    ) {

        throw new Error(
            "MP4Box no devolvió segmentos de inicialización."
        );

    }


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


        const trackId =
            init.id;


        queueSourceBuffer(
            trackId,
            init.buffer
        );


        log(
            `✓ Initialization segment track ${trackId}: ${formatBytes(init.buffer.byteLength)}`,
            "success"
        );

    }


    log(
        `✓ Inicialización MSE preparada. Tracks: ${initSegments.length}`,
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


    mp4box.onError =
        error => {

            mp4Error =
                true;


            log(
                `✗ MP4Box: ${error}`,
                "error"
            );


            if (
                metadataReadyReject
            ) {

                metadataReadyReject(
                    new Error(
                        String(
                            error
                        )
                    )
                );

            }

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
                    `✗ Error preparando MSE: ${getErrorMessage(error)}`,
                    "error"
                );


                if (
                    metadataReadyReject
                ) {

                    metadataReadyReject(
                        error
                    );

                }


                return;

            }


            if (
                metadataReadyResolve
            ) {

                metadataReadyResolve(
                    info
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


            /*
             * El parámetro user es precisamente
             * el SourceBuffer que entregamos
             * a setSegmentOptions().
             *
             * Lo utilizamos directamente.
             */

            let foundTrackId =
                null;


            for (
                const [
                    id,
                    sourceBuffer
                ]
                of sourceBuffers.entries()
            ) {

                if (
                    sourceBuffer ===
                    user
                ) {

                    foundTrackId =
                        id;

                    break;

                }

            }


            if (
                foundTrackId ===
                null
            ) {

                /*
                 * Compatibilidad adicional:
                 * si user no coincide,
                 * utilizamos trackId.
                 */

                if (
                    sourceBuffers.has(
                        trackId
                    )
                ) {

                    foundTrackId =
                        trackId;

                }

            }


            if (
                foundTrackId ===
                null
            ) {

                log(
                    `✗ Segmento track ${trackId} sin SourceBuffer.`,
                    "error"
                );


                return;

            }


            queueSourceBuffer(
                foundTrackId,
                buffer
            );


            log(
                `✓ Segmento ${totalSegments} — track ${trackId} — ${formatBytes(buffer.byteLength)} — muestra ${sampleNumber}${last ? " — FINAL" : ""}`,
                "success"
            );


            updatePlayerDiagnostics();

        };

}


/* =========================================================
   MOSTRAR INFORMACIÓN MP4
========================================================= */

function showMP4Info(
    info
) {

    const infoElement =
        document.getElementById(
            "mega-player-info"
        );


    if (
        !infoElement
    ) {

        return;

    }


    const duration =
        info.timescale
            ? info.duration /
              info.timescale
            : 0;


    let html =
        "";


    html +=
        "<strong>INFORMACIÓN DEL MP4</strong><br>";


    html +=
        `Duración: ${formatTime(duration)}<br>`;


    html +=
        `Timescale: ${info.timescale || "—"}<br>`;


    html +=
        `Fragmentado: ${info.isFragmented ? "Sí" : "No"}<br>`;


    html +=
        `Progresivo: ${info.isProgressive ? "Sí" : "No"}<br>`;


    html +=
        `Brands: ${(info.brands || []).join(", ") || "—"}<br>`;


    html +=
        `<br><strong>PISTAS</strong><br>`;


    for (
        const track of
        info.tracks ||
        []
    ) {

        html +=
            `Track ${track.id}: ${track.codec || "sin codec"}`;


        if (
            track.video
        ) {

            html +=
                ` — vídeo ${track.video.width}x${track.video.height}`;

        }


        if (
            track.audio
        ) {

            html +=
                ` — audio ${track.audio.sample_rate} Hz / ${track.audio.channel_count} canales`;

        }


        html +=
            "<br>";


        log(
            `Track ${track.id}: codec=${track.codec || "desconocido"}`,
            "success"
        );

    }


    infoElement.innerHTML =
        html;


    log(
        `✓ Duración: ${formatTime(duration)}`,
        "success"
    );


    log(
        `✓ Fragmentado: ${info.isFragmented ? "Sí" : "No"}`,
        "info"
    );


    log(
        `✓ Progresivo: ${info.isProgressive ? "Sí" : "No"}`,
        "info"
    );

}


/* =========================================================
   CREAR PROMESA DE METADATA
========================================================= */

function createMetadataPromise() {

    metadataReadyPromise =
        new Promise(
            (
                resolve,
                reject
            ) => {

                metadataReadyResolve =
                    resolve;


                metadataReadyReject =
                    reject;

            }
        );


    return metadataReadyPromise;

}


/* =========================================================
   OBTENER OFFSET DE SEEK
========================================================= */

function getSeekOffset(
    result
) {

    if (
        Number.isFinite(
            result
        )
    ) {

        return result;

    }


    if (
        result &&
        Number.isFinite(
            result.offset
        )
    ) {

        return result.offset;

    }


    return null;

}


/* =========================================================
   ANALIZAR MP4
========================================================= */

async function analyzeMP4() {

    if (
        !currentFile
    ) {

        log(
            "⚠ Primero carga la información del archivo MEGA.",
            "error"
        );


        return;

    }


    if (
        activeOperation
    ) {

        log(
            "⚠ Hay una operación activa.",
            "error"
        );


        return;

    }


    const localOperation =
        ++operationId;


    activeOperation =
        "analysis";


    try {

        setStatus(
            "Analizando MP4...",
            "loading"
        );


        log(
            "=================================================",
            "info"
        );


        log(
            "ANÁLISIS DEL MP4",
            "info"
        );


        log(
            "=================================================",
            "info"
        );


        const parser =
            MP4Box.createFile();


        parser.onMoovStart =
            () => {

                log(
                    "✓ MP4Box encontró el comienzo de MOOV.",
                    "success"
                );

            };


        let resolved =
            false;


        parser.onReady =
            info => {

                if (
                    resolved
                ) {

                    return;

                }


                resolved =
                    true;


                showMP4Info(
                    info
                );


                log(
                    "✓ MP4Box pudo analizar el MP4.",
                    "success"
                );


                setStatus(
                    "MP4 analizado",
                    "success"
                );

            };


        parser.onError =
            error => {

                log(
                    `✗ MP4Box: ${error}`,
                    "error"
                );

            };


        /*
         * -------------------------------------------------
         * BLOQUE INICIAL
         * -------------------------------------------------
         */

        const first =
            await readMegaRange(
                0,
                Math.min(
                    INITIAL_RANGE_SIZE,
                    fileSize
                ),
                "MEGA ANÁLISIS"
            );


        parser.appendBuffer(
            first.buffer
        );


        let offset =
            first.end +
            1;


        /*
         * -------------------------------------------------
         * BUSCAR MOOV
         * -------------------------------------------------
         *
         * MP4Box devuelve la posición
         * que necesita cuando el MOOV
         * no está al principio.
         */

        while (
            !resolved &&
            offset <
            fileSize &&
            localOperation ===
            operationId
        ) {

            const size =
                Math.min(
                    MOOV_PROBE_SIZE,
                    fileSize -
                    offset
                );


            const block =
                await readMegaRange(
                    offset,
                    size,
                    "MEGA MOOV"
                );


            const expected =
                parser.appendBuffer(
                    block.buffer
                );


            offset =
                block.end +
                1;


            if (
                Number.isFinite(
                    expected
                ) &&
                expected !==
                offset
            ) {

                log(
                    `MP4Box indica posición: ${expected.toLocaleString()}`,
                    "info"
                );

            }

        }


        if (
            !resolved
        ) {

            throw new Error(
                "MP4Box no encontró MOOV."
            );

        }


    } catch (
        error
    ) {

        setStatus(
            "Error",
            "error"
        );


        resultBox.className =
            "result-box result-error";


        resultBox.textContent =
            `Error analizando MP4: ${getErrorMessage(error)}`;


        log(
            `✗ Error analizando MP4: ${getErrorMessage(error)}`,
            "error"
        );

    } finally {

        activeOperation =
            null;

    }

}


/* =========================================================
   OBTENER BUFFER DISPONIBLE
========================================================= */

function getBufferedAhead() {

    if (
        !videoElement
    ) {

        return 0;

    }


    const currentTime =
        Number(
            videoElement.currentTime ||
            0
        );


    const buffered =
        videoElement.buffered;


    if (
        !buffered ||
        buffered.length ===
        0
    ) {

        return 0;

    }


    for (
        let i = 0;
        i < buffered.length;
        i++
    ) {

        const start =
            buffered.start(
                i
            );


        const end =
            buffered.end(
                i
            );


        if (
            currentTime >=
            start &&
            currentTime <=
            end
        ) {

            return Math.max(
                0,
                end -
                currentTime
            );

        }

    }


    return 0;

}


/* =========================================================
   INTENTAR REPRODUCCIÓN
========================================================= */

async function tryStartPlayback() {

    if (
        playbackStarted ||
        !videoElement ||
        playerStopped
    ) {

        return;

    }


    const bufferedAhead =
        getBufferedAhead();


    /*
     * Esperamos hasta tener
     * un mínimo razonable de buffer.
     */

    if (
        bufferedAhead <
        2
    ) {

        return;

    }


    try {

        await videoElement.play();


        playbackStarted =
            true;


        log(
            "===============================================",
            "success"
        );


        log(
            "▶ REPRODUCCIÓN INICIADA",
            "success"
        );


        log(
            `✓ Buffer disponible: ${bufferedAhead.toFixed(1)} segundos`,
            "success"
        );


        log(
            `✓ Datos descargados: ${formatBytes(totalDownloaded)}`,
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
         * No consideramos autoplay
         * bloqueado como fallo.
         */

        log(
            "ℹ El navegador no permitió iniciar automáticamente.",
            "info"
        );


        log(
            "ℹ Pulsa PLAY manualmente en el vídeo.",
            "info"
        );

    }

}


/* =========================================================
   ESPERAR A QUE SOURCEBUFFER TERMINE
========================================================= */

function waitForQueuesToDrain() {

    return new Promise(
        resolve => {

            const check =
                () => {

                    let pending =
                        false;


                    for (
                        const queue
                        of sourceQueues.values()
                    ) {

                        if (
                            queue.length >
                            0
                        ) {

                            pending =
                                true;

                            break;

                        }

                    }


                    for (
                        const sourceBuffer
                        of sourceBuffers.values()
                    ) {

                        if (
                            sourceBuffer.updating
                        ) {

                            pending =
                                true;

                            break;

                        }

                    }


                    if (
                        !pending
                    ) {

                        resolve();

                        return;

                    }


                    setTimeout(
                        check,
                        50
                    );

                };


            check();

        }
    );

}


/* =========================================================
   ALIMENTAR MP4BOX DESDE SEEK
========================================================= */

async function streamMediaFromOffset(
    startOffset,
    localOperation
) {

    let offset =
        Math.max(
            0,
            Math.floor(
                startOffset
            )
        );


    megaCursor =
        offset;


    log(
        "=================================================",
        "success"
    );


    log(
        "FASE 2 — PROCESAMIENTO DE MUESTRAS",
        "success"
    );


    log(
        "=================================================",
        "success"
    );


    log(
        `✓ MP4Box.seek() solicita posición: ${offset.toLocaleString()}`,
        "success"
    );


    log(
        "✓ El cursor MEGA volverá directamente a esa posición.",
        "success"
    );


    /*
     * MUY IMPORTANTE:

     * start() se ejecuta DESPUÉS
     * de configurar la segmentación.
     *
     * MP4Box puede procesar datos
     * que ya haya recibido y los nuevos
     * buffers que agreguemos.
     */

    mp4box.start();


    log(
        "✓ MP4Box inició procesamiento de muestras.",
        "success"
    );


    mediaStreamingStarted =
        true;


    while (
        !playerStopped &&
        !mp4Error &&
        localOperation ===
        operationId &&
        offset <
        fileSize
    ) {

        /*
         * -------------------------------------------------
         * PROTECCIÓN DE DATOS
         * -------------------------------------------------
         *
         * No queremos volver a descargar
         * cientos de MB sin necesidad.
         */

        if (
            totalDownloaded >=
            MAX_TEST_DOWNLOAD
        ) {

            log(
                `⚠ Límite de laboratorio alcanzado: ${formatBytes(MAX_TEST_DOWNLOAD)}.`,
                "info"
            );


            log(
                "ℹ Deteniendo la descarga automática para proteger la prueba.",
                "info"
            );


            break;

        }


        /*
         * -------------------------------------------------
         * CONTROL DEL BUFFER
         * -------------------------------------------------
         */

        const bufferedAhead =
            getBufferedAhead();


        updatePlayerDiagnostics();


        /*
         * Si ya tenemos suficiente buffer,
         * esperamos a que el vídeo consuma
         * parte del contenido.
         *
         * Mientras tanto el reproductor
         * puede seguir reproduciéndose.
         */

        if (
            bufferedAhead >=
            TARGET_BUFFER_SECONDS
        ) {

            setStatus(
                "Reproduciendo / buffer suficiente",
                "success"
            );


            await waitForBufferToDrop(
                LOW_BUFFER_SECONDS,
                localOperation
            );


            continue;

        }


        /*
         * -------------------------------------------------
         * SOLICITAR SIGUIENTE RANGO
         * -------------------------------------------------
         */

        const size =
            Math.min(
                MEDIA_RANGE_SIZE,
                fileSize -
                offset
            );


        const block =
            await readMegaRange(
                offset,
                size,
                "MEGA MEDIA"
            );


        if (
            playerStopped ||
            localOperation !==
            operationId
        ) {

            break;

        }


        /*
         * -------------------------------------------------
         * ENVIAR A MP4BOX
         * -------------------------------------------------
         */

        const expected =
            mp4box.appendBuffer(
                block.buffer
            );


        megaCursor =
            block.end +
            1;


        offset =
            block.end +
            1;


        /*
         * La posición devuelta por MP4Box
         * se registra, pero NO se utiliza
         * como cursor directo de MEGA.

         * El cursor de MEGA debe avanzar
         * secuencialmente desde el offset
         * obtenido por seek().
         */

        if (
            Number.isFinite(
                expected
            ) &&
            expected !==
            offset
        ) {

            log(
                `ℹ MP4Box indica siguiente posición interna: ${expected.toLocaleString()}`,
                "info"
            );

        }


        log(
            `✓ MP4Box recibió ${formatBytes(block.size)} desde ${block.start.toLocaleString()}.`,
            "success"
        );


        updatePlayerDiagnostics();


        /*
         * Intentamos iniciar reproducción
         * cuando haya buffer.
         */

        await tryStartPlayback();


        /*
         * Damos un pequeño margen al navegador
         * para procesar updateend.
         */

        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    10
                )
        );

    }


    /*
     * -----------------------------------------------------
     * FINALIZAR
     * -----------------------------------------------------
     */

    if (
        !playerStopped &&
        !mp4Error
    ) {

        log(
            "✓ El flujo de laboratorio alcanzó el final del archivo.",
            "success"
        );


        try {

            mp4box.flush();

        } catch (
            error
        ) {

            log(
                `⚠ Error durante flush: ${getErrorMessage(error)}`,
                "error"
            );

        }

    }


    updatePlayerDiagnostics();

}


/* =========================================================
   ESPERAR BUFFER
========================================================= */

function waitForBufferToDrop(
    threshold,
    localOperation
) {

    return new Promise(
        resolve => {

            const startedAt =
                Date.now();


            const check =
                () => {

                    if (
                        playerStopped ||
                        localOperation !==
                        operationId
                    ) {

                        resolve();

                        return;

                    }


                    const bufferedAhead =
                        getBufferedAhead();


                    updatePlayerDiagnostics();


                    /*
                     * Si el usuario pausó el vídeo,
                     * no queremos bloquear indefinidamente
                     * la precarga.

                     * Después de 2 segundos de pausa
                     * volvemos a comprobar el buffer.
                     */

                    if (
                        bufferedAhead <=
                        threshold
                    ) {

                        resolve();

                        return;

                    }


                    /*
                     * Si el vídeo está pausado,
                     * dejamos pasar un pequeño intervalo
                     * y volvemos a revisar.

                     * La lógica principal seguirá
                     * manteniendo el buffer.
                     */

                    if (
                        videoElement &&
                        videoElement.paused
                    ) {

                        setTimeout(
                            check,
                            1000
                        );


                        return;

                    }


                    /*
                     * Protección contra espera
                     * infinita.
                     */

                    if (
                        Date.now() -
                        startedAt >
                        15000
                    ) {

                        resolve();

                        return;

                    }


                    setTimeout(
                        check,
                        500
                    );

                };


            check();

        }
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
            "⚠ Primero carga la información del archivo MEGA.",
            "error"
        );


        return;

    }


    if (
        activeOperation
    ) {

        log(
            "⚠ El reproductor ya está ejecutándose.",
            "info"
        );


        return;

    }


    const localOperation =
        ++operationId;


    activeOperation =
        "player";


    playerStopped =
        false;


    mp4Ready =
        false;


    mp4Error =
        false;


    playbackStarted =
        false;


    mediaStreamingStarted =
        false;


    totalDownloaded =
        0;


    totalSegments =
        0;


    totalAppendedBytes =
        0;


    megaCursor =
        0;


    megaRequests =
        0;


    videoErrorCode =
        null;


    mp4Info =
        null;


    sourceBuffers.clear();


    sourceQueues.clear();


    metadataReadyResolve =
        null;


    metadataReadyReject =
        null;


    setStatus(
        "Preparando reproductor...",
        "loading"
    );


    const startButton =
        document.getElementById(
            "btn-start-player"
        );


    const stopButton =
        document.getElementById(
            "btn-stop-player"
        );


    if (
        startButton
    ) {

        startButton.disabled =
            true;

    }


    if (
        stopButton
    ) {

        stopButton.disabled =
            false;

    }


    log(
        "=================================================",
        "info"
    );


    log(
        "INICIANDO STREAMING CONTINUO EXPERIMENTAL",
        "info"
    );


    log(
        "=================================================",
        "info"
    );


    log(
        `✓ Buffer inicial objetivo: ${INITIAL_BUFFER_SECONDS} s`,
        "success"
    );


    log(
        `✓ Buffer máximo objetivo: ${TARGET_BUFFER_SECONDS} s`,
        "success"
    );


    log(
        `✓ Buffer bajo: ${LOW_BUFFER_SECONDS} s`,
        "success"
    );


    log(
        `✓ Rango MEGA multimedia: ${formatBytes(MEDIA_RANGE_SIZE)}`,
        "success"
    );


    log(
        `✓ Límite de seguridad: ${formatBytes(MAX_TEST_DOWNLOAD)}`,
        "success"
    );


    try {

        /*
         * -------------------------------------------------
         * CREAR MP4BOX
         * -------------------------------------------------
         */

        mp4box =
            MP4Box.createFile();


        configureMP4Box();


        /*
         * -------------------------------------------------
         * MEDIA SOURCE
         * -------------------------------------------------
         */

        await createMediaSource();


        /*
         * -------------------------------------------------
         * PROMESA DE METADATA
         * -------------------------------------------------
         */

        createMetadataPromise();


        /*
         * -------------------------------------------------
         * FASE 1
         * -------------------------------------------------
         *
         * Primero necesitamos MOOV.
         *
         * Comenzamos por 4 MB.
         */

        const first =
            await readMegaRange(
                0,
                Math.min(
                    INITIAL_RANGE_SIZE,
                    fileSize
                ),
                "MEGA INICIO"
            );


        mp4box.appendBuffer(
            first.buffer
        );


        let analysisOffset =
            first.end +
            1;


        /*
         * -------------------------------------------------
         * BUSCAR MOOV
         * -------------------------------------------------
         */

        while (
            !mp4Ready &&
            !mp4Error &&
            !playerStopped &&
            analysisOffset <
            fileSize &&
            localOperation ===
            operationId
        ) {

            /*
             * MP4Box nos puede indicar
             * una posición específica.

             * Para este laboratorio
             * utilizaremos el valor cuando
             * esté lejos del cursor actual
             * y dentro del archivo.

             * Esto permite saltar directamente
             * al MOOV que conocemos que está
             * aproximadamente al final.
             */

            let requestOffset =
                analysisOffset;


            /*
             * En el primer bloque normalmente
             * MP4Box devuelve el offset
             * del MOOV.
             *
             * Pero necesitamos obtener ese
             * valor mediante appendBuffer().
             *
             * Por eso hacemos una lectura
             * secuencial hasta que MP4Box
             * nos entregue el dato.
             */

            const size =
                Math.min(
                    MOOV_PROBE_SIZE,
                    fileSize -
                    requestOffset
                );


            const block =
                await readMegaRange(
                    requestOffset,
                    size,
                    "MEGA ANÁLISIS"
                );


            const expected =
                mp4box.appendBuffer(
                    block.buffer
                );


            analysisOffset =
                block.end +
                1;


            if (
                Number.isFinite(
                    expected
                ) &&
                expected !==
                analysisOffset
            ) {

                log(
                    `MP4Box indica siguiente posición: ${expected.toLocaleString()}`,
                    "info"
                );


                /*
                 * Si MP4Box indica una posición
                 * muy alejada del cursor actual,
                 * la tratamos como una solicitud
                 * dirigida.

                 * Esto es exactamente lo que
                 * necesitamos para encontrar MOOV
                 * al final del archivo.
                 */

                if (
                    expected >=
                    0 &&
                    expected <
                    fileSize &&
                    expected >
                    analysisOffset
                ) {

                    const directedEnd =
                        Math.min(
                            expected +
                            MOOV_PROBE_SIZE -
                            1,
                            fileSize -
                            1
                        );


                    log(
                        `✓ Saltando directamente al rango solicitado por MP4Box: ${expected.toLocaleString()} → ${directedEnd.toLocaleString()}`,
                        "success"
                    );


                    const moovBlock =
                        await readMegaRange(
                            expected,
                            directedEnd -
                            expected +
                            1,
                            "MEGA MOOV"
                        );


                    mp4box.appendBuffer(
                        moovBlock.buffer
                    );

                }

            }

        }


        /*
         * Esperar por si onReady
         * todavía está terminando.
         */

        if (
            !mp4Ready &&
            !mp4Error
        ) {

            try {

                await Promise.race(
                    [
                        metadataReadyPromise,

                        new Promise(
                            (
                                resolve
                            ) => {

                                setTimeout(
                                    resolve,
                                    5000
                                );

                            }
                        )

                    ]
                );

            } catch {

                /* El error se registra
                   mediante mp4Error. */

            }

        }


        if (
            mp4Error
        ) {

            throw new Error(
                "MP4Box informó un error."
            );

        }


        if (
            !mp4Ready
        ) {

            /*
             * Si no se encontró MOOV,
             * hacemos una búsqueda específica
             * utilizando la posición que ya
             * conocemos del archivo de prueba.
             */

            const knownMoovOffset =
                5522583660;


            if (
                knownMoovOffset <
                fileSize
            ) {

                log(
                    `⚠ MP4Box no terminó de detectar MOOV durante la secuencia inicial.`,
                    "info"
                );


                log(
                    `ℹ Intentando lectura dirigida al MOOV conocido: ${knownMoovOffset.toLocaleString()}`,
                    "info"
                );


                const moovBlock =
                    await readMegaRange(
                        knownMoovOffset,
                        Math.min(
                            MOOV_PROBE_SIZE,
                            fileSize -
                            knownMoovOffset
                        ),
                        "MEGA MOOV DIRECTO"
                    );


                mp4box.appendBuffer(
                    moovBlock.buffer
                );


                if (
                    metadataReadyPromise
                ) {

                    await Promise.race(
                        [
                            metadataReadyPromise,

                            new Promise(
                                resolve =>
                                    setTimeout(
                                        resolve,
                                        5000
                                    )
                            )

                        ]
                    );

                }

            }

        }


        if (
            !mp4Ready
        ) {

            throw new Error(
                "No se pudo obtener la estructura MOOV del MP4."
            );

        }


        /*
         * -------------------------------------------------
         * FASE 2
         * -------------------------------------------------
         *
         * AHORA está la corrección importante.
         *
         * MP4Box ya conoce las tablas
         * de muestras.

         * En lugar de continuar desde
         * el cursor que estaba leyendo MOOV,
         * utilizamos seek(0, true).
         */

        let seekResult =
            null;


        try {

            seekResult =
                mp4box.seek(
                    0,
                    true
                );

        } catch (
            error
        ) {

            log(
                `⚠ MP4Box.seek() produjo un error: ${getErrorMessage(error)}`,
                "error"
            );

        }


        let mediaStartOffset =
            getSeekOffset(
                seekResult
            );


        /*
         * Si MP4Box no devuelve offset,
         * utilizamos el inicio del archivo
         * como fallback seguro.
         */

        if (
            !Number.isFinite(
                mediaStartOffset
            )
        ) {

            mediaStartOffset =
                0;

        }


        log(
            `✓ MP4Box.seek(0, true) → offset ${mediaStartOffset.toLocaleString()}`,
            "success"
        );


        /*
         * Arrancar el procesamiento
         * de muestras.
         */

        await streamMediaFromOffset(
            mediaStartOffset,
            localOperation
        );


        /*
         * Esperar a que SourceBuffers
         * terminen sus operaciones pendientes.
         */

        await waitForQueuesToDrain();


        updatePlayerDiagnostics();


        if (
            !playerStopped &&
            !mp4Error
        ) {

            if (
                playbackStarted
            ) {

                setStatus(
                    "Reproductor activo",
                    "success"
                );

            } else if (
                totalSegments >
                0
            ) {

                setStatus(
                    "Segmentos disponibles — pulsa PLAY",
                    "success"
                );

            } else {

                setStatus(
                    "Sin segmentos",
                    "error"
                );

            }

        }


    } catch (
        error
    ) {

        console.error(
            error
        );


        mp4Error =
            true;


        setStatus(
            "Error del reproductor",
            "error"
        );


        resultBox.className =
            "result-box result-error";


        resultBox.textContent =
            `El reproductor experimental falló: ${getErrorMessage(error)}`;


        log(
            `✗ Error del reproductor: ${getErrorMessage(error)}`,
            "error"
        );

    } finally {

        activeOperation =
            null;


        const startButton =
            document.getElementById(
                "btn-start-player"
            );


        const stopButton =
            document.getElementById(
                "btn-stop-player"
            );


        if (
            startButton
        ) {

            startButton.disabled =
                false;

        }


        if (
            stopButton
        ) {

            stopButton.disabled =
                true;

        }


        updatePlayerDiagnostics();

    }

}


/* =========================================================
   DETENER REPRODUCTOR
========================================================= */

function stopExperimentalPlayer() {

    playerStopped =
        true;


    ++operationId;


    activeOperation =
        null;


    mediaStreamingStarted =
        false;


    /*
     * Detener MP4Box.
     */

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


    /*
     * Finalizar MediaSource.
     */

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


    /*
     * No destruimos inmediatamente
     * el <video>, porque queremos
     * conservar el diagnóstico.
     */

    setStatus(
        "Reproductor detenido",
        "idle"
    );


    log(
        "⏹ Reproductor experimental detenido.",
        "info"
    );


    log(
        `✓ Datos descargados: ${formatBytes(totalDownloaded)}`,
        "info"
    );


    log(
        `✓ Segmentos generados: ${totalSegments}`,
        "info"
    );


    log(
        `✓ Bytes enviados a SourceBuffer: ${formatBytes(totalAppendedBytes)}`,
        "info"
    );


    const startButton =
        document.getElementById(
            "btn-start-player"
        );


    const stopButton =
        document.getElementById(
            "btn-stop-player"
        );


    if (
        startButton
    ) {

        startButton.disabled =
            false;

    }


    if (
        stopButton
    ) {

        stopButton.disabled =
            true;

    }


    updatePlayerDiagnostics();

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
                "⚠ Detén primero el reproductor actual.",
                "error"
            );


            return;

        }


        currentFile =
            null;


        currentVideo =
            null;


        resetInfo();


        btnChunk.disabled =
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
   BOTÓN INFORMACIÓN
========================================================= */

btnInfo.addEventListener(
    "click",
    loadFileInformation
);


/* =========================================================
   BOTÓN BLOQUES
========================================================= */

btnChunk.addEventListener(
    "click",
    async () => {

        if (
            !currentFile
        ) {

            return;

        }


        if (
            activeOperation
        ) {

            log(
                "⚠ Hay una operación activa.",
                "error"
            );


            return;

        }


        const BLOCK_SIZE =
            1024 * 1024;


        const positions = [

            0,

            10 * 1024 * 1024,

            100 * 1024 * 1024,

            500 * 1024 * 1024,

            Math.max(
                0,
                fileSize -
                BLOCK_SIZE
            )

        ];


        let correct =
            0;


        let total =
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

                const block =
                    await readMegaRange(
                        positions[i],
                        Math.min(
                            BLOCK_SIZE,
                            fileSize -
                            positions[i]
                        ),
                        "MEGA BLOQUE"
                    );


                total +=
                    block.size;


                if (
                    block.size ===
                    Math.min(
                        BLOCK_SIZE,
                        fileSize -
                        positions[i]
                    )
                ) {

                    correct++;


                    log(
                        `✓ Bloque ${i + 1}: correcto.`,
                        "success"
                    );

                }

            }


            log(
                `✓ Resultado: ${correct}/${positions.length} bloques correctos.`,
                "success"
            );


            log(
                `✓ Datos recibidos: ${formatBytes(total)}`,
                "success"
            );

        } catch (
            error
        ) {

            log(
                `✗ Error en prueba de bloques: ${getErrorMessage(error)}`,
                "error"
            );

        }

    }
);


/* =========================================================
   INICIALIZACIÓN
========================================================= */

createPlayerInterface();


startDiagnosticsTimer();


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
    "✓ Arquitectura corregida: análisis MOOV → seek() → procesamiento de muestras.",
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
