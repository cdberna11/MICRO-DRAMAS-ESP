/* =========================================================
   MICRO-DRAMAS-ESP
   LABORATORIO MEGA + MP4BOX + MEDIASOURCE

   PRUEBA DE LECTURA DIRIGIDA POR RANGOS

   OBJETIVO:

   MEGA
      ↓
   MEGAJS
      ↓
   RANGOS ESPECÍFICOS
      ↓
   MP4Box.js
      ↓
   MOOV / TRACKS
      ↓
   SEGMENTACIÓN
      ↓
   MediaSource
      ↓
   <video>

   IMPORTANTE:

   Esta versión NO recorre automáticamente todo el MP4
   desde el byte 0.

   Se utiliza la posición devuelta por:

       mp4box.appendBuffer()

   para intentar saltar directamente al siguiente
   rango necesario.
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
 * Primera lectura.
 */

const INITIAL_RANGE_SIZE =
    4 * 1024 * 1024;


/*
 * Tamaño normal de los rangos.
 */

const RANGE_SIZE =
    4 * 1024 * 1024;


/*
 * Para una búsqueda dirigida podemos utilizar
 * un rango ligeramente mayor alrededor de una
 * posición importante.
 */

const DIRECTED_RANGE_SIZE =
    8 * 1024 * 1024;


/*
 * Máximo de solicitudes dirigidas antes de
 * considerar que el archivo necesita otro
 * método de análisis.
 *
 * Esto evita loops infinitos.
 */

const MAX_DIRECTED_REQUESTS =
    40;


/*
 * Máximo de bytes que permitimos descargar
 * durante el análisis inicial.
 *
 * 128 MB.
 *
 * Si MOOV no aparece después de esto,
 * NO seguimos descargando automáticamente.
 */

const MAX_ANALYSIS_BYTES =
    128 * 1024 * 1024;


/*
 * Número de muestras por segmento MSE.
 */

const SAMPLES_PER_SEGMENT =
    60;


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


/*
 * Instancia MP4Box utilizada por el reproductor.
 */

let mp4box =
    null;


/*
 * Información detectada del MP4.
 */

let mp4Info =
    null;


/*
 * true cuando MP4Box ejecuta onReady().
 */

let mp4Ready =
    false;


/*
 * true cuando MP4Box informa error.
 */

let mp4Error =
    false;


/*
 * MediaSource.
 */

let mediaSource =
    null;


/*
 * Elemento video.
 */

let videoElement =
    null;


/*
 * SourceBuffers por track.
 */

let sourceBuffers =
    new Map();


/*
 * Colas de SourceBuffer.
 */

let sourceQueues =
    new Map();


/*
 * Control del reproductor.
 */

let playerStarted =
    false;

let playerStopped =
    false;


/*
 * Control de lectura.
 */

let fetching =
    false;


/*
 * Posición que intentaremos solicitar
 * a continuación.
 */

let nextOffset =
    0;


/*
 * Total de bytes realmente descargados.
 */

let totalDownloaded =
    0;


/*
 * Número de segmentos generados.
 */

let totalSegments =
    0;


/*
 * Cantidad de solicitudes dirigidas.
 */

let directedRequests =
    0;


/*
 * Control de reproducción.
 */

let playbackStarted =
    false;


/*
 * Evita solicitudes duplicadas.
 */

let requestedRanges =
    new Set();


/*
 * Evita que análisis y reproductor
 * trabajen simultáneamente.
 */

let activeOperation =
    null;


/*
 * Control de generación para cancelar
 * operaciones anteriores.
 */

let operationId =
    0;


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
            total / 3600
        );

    const minutes =
        Math.floor(
            (
                total % 3600
            ) / 60
        );

    const secs =
        total % 60;

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
   RESET VISUAL
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

function updateProgress() {

    if (
        !fileSize
    ) {

        return;

    }

    /*
     * Para una lectura dirigida,
     * este porcentaje representa la cantidad
     * de bytes descargados respecto al archivo,
     * no necesariamente una posición secuencial.
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

    progressBar.style.width =
        `${percent}%`;

    progressPercent.textContent =
        `${percent.toFixed(2)}%`;

    progressText.textContent =
        `${formatBytes(totalDownloaded)} descargados`;

}


/* =========================================================
   CREAR / OBTENER PANEL DEL REPRODUCTOR
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
        "MEGAJS → rangos dirigidos → MP4Box.js → MediaSource → <video>";

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

            playbackStarted =
                true;

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
        "error",
        () => {

            log(
                "✗ El elemento <video> informó un error.",
                "error"
            );

        }
    );

}


/* =========================================================
   CARGAR ATRIBUTOS DE MEGA
========================================================= */

async function loadFileInformation() {

    if (
        activeOperation
    ) {

        log(
            "⚠ Hay una operación activa. Deténla antes de cambiar de prueba.",
            "error"
        );

        return;

    }


    const selected =
        getSelectedVideo();


    if (!selected) {

        return;

    }


    btnInfo.disabled =
        true;

    btnChunk.disabled =
        true;


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
            loadedFile &&
            loadedFile.name
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


        createPlayerInterface();


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
    label = "RANGO"
) {

    if (
        !currentFile
    ) {

        throw new Error(
            "No existe archivo MEGA activo."
        );

    }


    if (
        start < 0
    ) {

        start =
            0;

    }


    if (
        start >= fileSize
    ) {

        throw new Error(
            `El rango ${start} comienza fuera del archivo.`
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


    /*
     * Evitar duplicados.
     */

    if (
        requestedRanges.has(
            rangeKey
        )
    ) {

        throw new Error(
            `El rango ya fue solicitado: ${rangeKey}`
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
                128 * 1024,

            chunkSizeIncrement:
                128 * 1024,

            maxChunkSize:
                1024 * 1024

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
     *
     * MP4Box necesita saber la posición
     * real del buffer dentro del archivo.
     */

    arrayBuffer.fileStart =
        start;


    totalDownloaded +=
        received;


    updateProgress();


    log(
        `✓ Recibidos ${formatBytes(received)} desde ${start.toLocaleString()}.`,
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
   CALCULAR SIGUIENTE POSICIÓN
========================================================= */

function calculateNextPosition(
    returnedPosition,
    blockStart,
    blockEnd
) {

    /*
     * Si MP4Box devuelve una posición válida
     * fuera del rango actual, esa posición tiene
     * prioridad.
     */

    if (
        Number.isFinite(
            returnedPosition
        )
    ) {

        const position =
            Number(
                returnedPosition
            );


        if (
            position >
            blockEnd &&
            position <
            fileSize
        ) {

            return position;

        }


        /*
         * Si devuelve una posición que ya está
         * dentro del bloque, continuamos desde
         * el final del bloque para evitar repetirlo.
         */

        if (
            position >=
            blockStart &&
            position <=
            blockEnd
        ) {

            return (
                blockEnd +
                1
            );

        }

    }


    /*
     * Fallback secuencial.
     */

    return (
        blockEnd +
        1
    );

}


/* =========================================================
   ANALIZAR MP4 — MODO DIRIGIDO
========================================================= */

async function analyzeMP4() {

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


    const startButton =
        document.getElementById(
            "btn-start-player"
        );


    const analyzeButton =
        document.getElementById(
            "btn-analyze-mp4"
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
        analyzeButton
    ) {

        analyzeButton.disabled =
            true;

    }


    if (
        stopButton
    ) {

        stopButton.disabled =
            false;

    }


    /*
     * Estado limpio.
     */

    mp4Ready =
        false;


    mp4Error =
        false;


    mp4Info =
        null;


    totalDownloaded =
        0;


    directedRequests =
        0;


    requestedRanges.clear();


    setStatus(
        "Analizando estructura MP4...",
        "loading"
    );


    log(
        "=================================================",
        "info"
    );


    log(
        "ANÁLISIS DIRIGIDO DEL MP4",
        "info"
    );


    log(
        "=================================================",
        "info"
    );


    log(
        "✓ Se utilizará la posición devuelta por MP4Box.",
        "success"
    );


    log(
        "✓ No se recorrerá automáticamente todo el archivo.",
        "success"
    );


    try {

        mp4box =
            MP4Box.createFile();


        let readyResolve;
        let readyReject;


        const readyPromise =
            new Promise(
                (
                    resolve,
                    reject
                ) => {

                    readyResolve =
                        resolve;

                    readyReject =
                        reject;

                }
            );


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


                readyResolve(
                    info
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


                readyReject(
                    new Error(
                        String(
                            error
                        )
                    )
                );

            };


        /*
         * PRIMER RANGO:
         *
         * Siempre empezamos por 0.
         */

        let nextPosition =
            0;


        let lastReturnedPosition =
            null;


        while (
            !mp4Ready &&
            !mp4Error &&
            thisOperation ===
                operationId &&
            directedRequests <
                MAX_DIRECTED_REQUESTS &&
            totalDownloaded <
                MAX_ANALYSIS_BYTES &&
            nextPosition <
                fileSize
        ) {

            directedRequests++;


            const remainingBudget =
                MAX_ANALYSIS_BYTES -
                totalDownloaded;


            const requestedSize =
                Math.min(
                    directedRequests === 1
                        ? INITIAL_RANGE_SIZE
                        : DIRECTED_RANGE_SIZE,

                    remainingBudget,

                    fileSize -
                    nextPosition
                );


            if (
                requestedSize <=
                0
            ) {

                break;

            }


            const block =
                await readMegaRange(
                    nextPosition,
                    requestedSize,
                    directedRequests === 1
                        ? "INICIO"
                        : "RANGO DIRIGIDO"
                );


            /*
             * IMPORTANTE:
             *
             * appendBuffer devuelve la posición
             * que MP4Box espera a continuación.
             */

            const returnedPosition =
                mp4box.appendBuffer(
                    block.buffer
                );


            if (
                Number.isFinite(
                    returnedPosition
                )
            ) {

                log(
                    `MP4Box indica siguiente posición: ${Number(returnedPosition).toLocaleString()}`,
                    "info"
                );

            }


            /*
             * Si onReady se ejecutó mientras
             * appendBuffer trabajaba, salimos.
             */

            if (
                mp4Ready
            ) {

                break;

            }


            const calculated =
                calculateNextPosition(
                    returnedPosition,
                    block.start,
                    block.end
                );


            if (
                calculated ===
                lastReturnedPosition
            ) {

                /*
                 * MP4Box sigue indicando exactamente
                 * la misma posición.
                 *
                 * Si todavía no está lista la estructura,
                 * no queremos entrar en un loop.
                 */

                log(
                    `⚠ MP4Box repite la posición ${calculated.toLocaleString()}.`,
                    "info"
                );


                /*
                 * Si la posición está fuera del
                 * rango actual, la probamos una vez.
                 * Después, si sigue igual, detenemos.
                 */

                const repeatKey =
                    `repeat:${calculated}`;


                if (
                    requestedRanges.has(
                        repeatKey
                    )
                ) {

                    log(
                        "⚠ La misma posición ya fue procesada.",
                        "error"
                    );


                    break;

                }


                requestedRanges.add(
                    repeatKey
                );

            }


            lastReturnedPosition =
                calculated;


            nextPosition =
                calculated;


            log(
                `→ Próximo rango seleccionado: ${nextPosition.toLocaleString()}`,
                "success"
            );

        }


        /*
         * Esperamos brevemente por onReady
         * si appendBuffer lo desencadenó
         * de forma asíncrona.
         */

        if (
            !mp4Ready &&
            !mp4Error
        ) {

            await Promise.race(
                [
                    readyPromise,

                    new Promise(
                        resolve =>
                            setTimeout(
                                resolve,
                                500
                            )
                    )
                ]
            );

        }


        if (
            mp4Ready
        ) {

            resultBox.className =
                "result-box result-success";


            resultBox.textContent =
                `✓ MP4 analizado correctamente utilizando ${formatBytes(totalDownloaded)} de ${formatBytes(fileSize)}.`;


            setStatus(
                "MP4 analizado",
                "success"
            );


            log(
                `✓ Total descargado para localizar estructura: ${formatBytes(totalDownloaded)}`,
                "success"
            );


            log(
                `✓ Solicitudes realizadas: ${directedRequests}`,
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
                `No se encontró MOOV dentro del límite de ${formatBytes(MAX_ANALYSIS_BYTES)}.`;


            log(
                `⚠ Análisis detenido después de ${formatBytes(totalDownloaded)}.`,
                "error"
            );


            log(
                "⚠ No se continuará descargando automáticamente.",
                "error"
            );

        }


    } catch (
        error
    ) {

        setStatus(
            "Error de análisis",
            "error"
        );


        log(
            `✗ Error analizando MP4: ${getErrorMessage(error)}`,
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
            analyzeButton
        ) {

            analyzeButton.disabled =
                false;

        }


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

    }

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
        "<br><strong>PISTAS</strong><br>";


    for (
        const track of
        info.tracks || []
    ) {

        html +=
            `Track ${track.id}: ${track.codec || "sin codec"}`;


        if (
            track.video
        ) {

            html +=
                ` — ${track.video.width}x${track.video.height}`;

        }


        if (
            track.audio
        ) {

            html +=
                ` — ${track.audio.sample_rate || "—"} Hz / ${track.audio.channel_count || "—"} canales`;

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
        `Duración: ${formatTime(duration)}`,
        "success"
    );


    log(
        `Fragmentado: ${info.isFragmented ? "Sí" : "No"}`,
        "info"
    );


    log(
        `Progresivo: ${info.isProgressive ? "Sí" : "No"}`,
        "info"
    );

}


/* =========================================================
   MEDIASOURCE
========================================================= */

function createMediaSource() {

    if (
        !window.MediaSource
    ) {

        throw new Error(
            "Este navegador no soporta MediaSource."
        );

    }


    mediaSource =
        new MediaSource();


    videoElement.src =
        URL.createObjectURL(
            mediaSource
        );


    return new Promise(
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
        info.tracks || []
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
            `Comprobando compatibilidad: ${mime}`,
            "info"
        );


        if (
            !MediaSource.isTypeSupported(
                mime
            )
        ) {

            log(
                `✗ NO compatible: ${mime}`,
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
            [];


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

                mp4Error =
                    true;


                log(
                    `✗ SourceBuffer track ${track.id} informó un error.`,
                    "error"
                );

            }
        );


        log(
            `✓ SourceBuffer creado: track ${track.id}`,
            "success"
        );

    }


    if (
        sourceBuffers.size ===
        0
    ) {

        throw new Error(
            "Ninguna pista del MP4 es compatible con MediaSource."
        );

    }

}


/* =========================================================
   COLA SOURCEBUFFER
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
            `✗ appendBuffer track ${trackId}: ${getErrorMessage(error)}`,
            "error"
        );


        mp4Error =
            true;

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
        info.tracks || []
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

    }


    /*
     * onSegment debe estar configurado
     * antes de iniciar la segmentación.
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


            let foundTrackId =
                null;


            for (
                const [
                    id,
                    sourceBuffer
                ] of
                sourceBuffers.entries()
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

                log(
                    `⚠ Segmento track ${trackId} sin SourceBuffer.`,
                    "error"
                );


                return;

            }


            queueSourceBuffer(
                foundTrackId,
                buffer
            );


            log(
                `✓ Segmento ${totalSegments} — track ${trackId} — ${formatBytes(buffer.byteLength)}`,
                "success"
            );


            tryStartPlayback();


            if (
                last
            ) {

                log(
                    `✓ Último segmento track ${trackId}.`,
                    "success"
                );

            }

        };


    /*
     * Inicialización.
     */

    const initSegments =
        mp4box.initializeSegmentation(
            "per-track"
        );


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


    mp4box.start();


    log(
        "✓ MP4Box comenzó la segmentación.",
        "success"
    );

}


/* =========================================================
   INTENTAR REPRODUCIR
========================================================= */

async function tryStartPlayback() {

    if (
        playbackStarted ||
        !videoElement
    ) {

        return;

    }


    if (
        videoElement.readyState <
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

        log(
            "ℹ Autoplay bloqueado por el navegador.",
            "info"
        );


        log(
            "ℹ Pulsa PLAY manualmente.",
            "info"
        );

    }

}


/* =========================================================
   INICIAR REPRODUCTOR
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
            "⚠ Hay otra operación activa. Espera a que termine.",
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


    totalDownloaded =
        0;


    totalSegments =
        0;


    directedRequests =
        0;


    requestedRanges.clear();


    nextOffset =
        0;


    const startButton =
        document.getElementById(
            "btn-start-player"
        );


    const analyzeButton =
        document.getElementById(
            "btn-analyze-mp4"
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
        analyzeButton
    ) {

        analyzeButton.disabled =
            true;

    }


    if (
        stopButton
    ) {

        stopButton.disabled =
            false;

    }


    setStatus(
        "Preparando reproductor...",
        "loading"
    );


    log(
        "=================================================",
        "info"
    );


    log(
        "INICIANDO REPRODUCTOR DIRIGIDO",
        "info"
    );


    log(
        "=================================================",
        "info"
    );


    try {

        mp4box =
            MP4Box.createFile();


        configurePlayerMP4Box();


        await createMediaSource();


        /*
         * PRIMER RANGO.
         */

        let nextPosition =
            0;


        let lastPosition =
            null;


        while (
            !playerStopped &&
            !mp4Error &&
            thisOperation ===
                operationId &&
            directedRequests <
                MAX_DIRECTED_REQUESTS &&
            nextPosition <
                fileSize
        ) {

            directedRequests++;


            /*
             * Antes de encontrar MOOV utilizamos
             * 4 MB.
             *
             * Después utilizamos 8 MB.
             */

            const size =
                mp4Ready
                    ? Math.min(
                        DIRECTED_RANGE_SIZE,
                        fileSize -
                        nextPosition
                    )
                    : Math.min(
                        INITIAL_RANGE_SIZE,
                        fileSize -
                        nextPosition
                    );


            const block =
                await readMegaRange(
                    nextPosition,
                    size,
                    mp4Ready
                        ? "DATOS DIRIGIDOS"
                        : "ESTRUCTURA"
                );


            const returnedPosition =
                mp4box.appendBuffer(
                    block.buffer
                );


            if (
                Number.isFinite(
                    returnedPosition
                )
            ) {

                log(
                    `MP4Box indica siguiente posición: ${Number(returnedPosition).toLocaleString()}`,
                    "info"
                );

            }


            /*
             * Si MOOV fue encontrado,
             * onReady ya pudo haber preparado
             * la segmentación.
             */

            if (
                mp4Ready
            ) {

                /*
                 * A partir de este punto,
                 * seguimos la posición de MP4Box.
                 */

                nextPosition =
                    calculateNextPosition(
                        returnedPosition,
                        block.start,
                        block.end
                    );

            } else {

                nextPosition =
                    calculateNextPosition(
                        returnedPosition,
                        block.start,
                        block.end
                    );

            }


            /*
             * Evitar repetir eternamente
             * la misma posición.
             */

            if (
                nextPosition ===
                lastPosition
            ) {

                log(
                    `⚠ MP4Box repite posición ${nextPosition.toLocaleString()}.`,
                    "info"
                );


                /*
                 * Si ya no podemos avanzar,
                 * terminamos la prueba en lugar
                 * de descargar indefinidamente.
                 */

                break;

            }


            lastPosition =
                nextPosition;


            log(
                `→ Próximo rango: ${nextPosition.toLocaleString()}`,
                "success"
            );


            /*
             * Dar oportunidad al navegador
             * de procesar MSE.
             */

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
                playbackStarted
                    ? "Reproduciendo"
                    : "MP4 listo para reproducción",
                "success"
            );


            resultBox.className =
                "result-box result-success";


            resultBox.textContent =
                `✓ Estructura detectada usando ${formatBytes(totalDownloaded)}.`;

        } else {

            setStatus(
                "No se encontró MOOV",
                "error"
            );


            resultBox.className =
                "result-box result-error";


            resultBox.textContent =
                `No se encontró MOOV dentro de ${formatBytes(totalDownloaded)} descargados.`;

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
            `El reproductor experimental falló: ${getErrorMessage(error)}`;


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


        if (
            startButton
        ) {

            startButton.disabled =
                false;

        }


        if (
            analyzeButton
        ) {

            analyzeButton.disabled =
                false;

        }


        if (
            stopButton
        ) {

            stopButton.disabled =
                true;

        }


        playerStarted =
            false;

    }

}


/* =========================================================
   CONFIGURAR MP4BOX DEL REPRODUCTOR
========================================================= */

function configurePlayerMP4Box() {

    mp4box.onMoovStart =
        () => {

            log(
                "✓ MP4Box encontró MOOV.",
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
                "✓ MP4BOX ENCONTRÓ MOOV / ESTRUCTURA",
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


                log(
                    "✓ Segmentación preparada.",
                    "success"
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

}


/* =========================================================
   DETENER
========================================================= */

function stopExperimentalPlayer() {

    operationId++;


    playerStopped =
        true;


    playerStarted =
        false;


    fetching =
        false;


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


    activeOperation =
        null;


    const startButton =
        document.getElementById(
            "btn-start-player"
        );


    const analyzeButton =
        document.getElementById(
            "btn-analyze-mp4"
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
        analyzeButton
    ) {

        analyzeButton.disabled =
            false;

    }


    if (
        stopButton
    ) {

        stopButton.disabled =
            true;

    }


    setStatus(
        "Prueba detenida",
        "idle"
    );


    log(
        "⏹ Operación detenida por el usuario.",
        "info"
    );

}


/* =========================================================
   PRUEBA INDEPENDIENTE DE BLOQUES MEGA
========================================================= */

async function testMegaBlocks() {

    if (
        !currentFile
    ) {

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


    try {

        const BLOCK_SIZE =
            1024 *
            1024;


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
                BLOCK_SIZE
            )

        ];


        let correct =
            0;


        let total =
            0;


        requestedRanges.clear();


        totalDownloaded =
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
                    BLOCK_SIZE,
                    `BLOQUE ${i + 1}`
                );


            total +=
                block.size;


            if (
                block.size ===
                BLOCK_SIZE
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

    } finally {

        activeOperation =
            null;

    }

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
                "⚠ Hay una prueba activa. Deténla antes de cambiar de vídeo.",
                "error"
            );


            return;

        }


        operationId++;


        currentFile =
            null;


        currentVideo =
            null;


        mp4box =
            null;


        mp4Info =
            null;


        mp4Ready =
            false;


        mp4Error =
            false;


        totalDownloaded =
            0;


        totalSegments =
            0;


        directedRequests =
            0;


        nextOffset =
            0;


        requestedRanges.clear();


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
   EVENTOS
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
    "MP4Box.js 2.4.1 importado como ES Module.",
    "success"
);


log(
    "✓ Laboratorio MEGA + MP4Box + MediaSource preparado.",
    "success"
);


log(
    "✓ Modo de lectura DIRIGIDA activado.",
    "success"
);


log(
    "✓ MP4Box podrá indicar el siguiente rango.",
    "success"
);


log(
    "Selecciona un vídeo y pulsa 'Leer información del archivo'.",
    "info"
);
