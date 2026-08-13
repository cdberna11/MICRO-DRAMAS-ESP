/* =========================================================
   MICRO-DRAMAS-ESP
   LABORATORIO MEGA + MEGAJS + MP4BOX

   PRUEBA DE LECTURA DIRIGIDA POR RANGOS

   OBJETIVO DE ESTA FASE:

   MEGA
      ↓
   MEGAJS
      ↓
   rango inicial
      ↓
   MP4Box
      ↓
   posición solicitada por MP4Box
      ↓
   MEGAJS salta directamente a esa posición

   IMPORTANTE:

   Esta versión NO recorre automáticamente todo el archivo.

   Primero queremos demostrar que podemos seguir las
   posiciones que MP4Box solicita.

   MediaSource / <video> se deja para la siguiente fase,
   después de confirmar esta prueba.
========================================================= */


/* =========================================================
   IMPORTAR MEGAJS
========================================================= */

import {
    File as MEGAFile
} from "https://unpkg.com/megajs/dist/main.browser-es.mjs";


/* =========================================================
   IMPORTAR MP4BOX.JS
========================================================= */

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
 * Primer rango.
 */

const INITIAL_RANGE_SIZE =
    4 * 1024 * 1024;


/*
 * Rangos dirigidos posteriores.
 */

const DIRECTED_RANGE_SIZE =
    8 * 1024 * 1024;


/*
 * Límite de seguridad.

 * Si después de 64 MB MP4Box todavía no
 * entrega MOOV, detenemos la prueba.

 * NO queremos volver a descargar varios GB.
 */

const MAX_ANALYSIS_BYTES =
    64 * 1024 * 1024;


/*
 * Máximo de solicitudes.

 * Protección contra loops.
 */

const MAX_REQUESTS =
    20;


/*
 * Bloques para la prueba independiente.
 */

const TEST_BLOCK_SIZE =
    1024 * 1024;


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


let mp4box =
    null;


let mp4Ready =
    false;


let mp4Error =
    false;


let activeOperation =
    null;


let operationId =
    0;


let totalDownloaded =
    0;


let requestedRanges =
    new Set();


let lastRequestedPosition =
    null;


/* =========================================================
   MENSAJE DE ERROR
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
     * Este porcentaje representa bytes descargados,
     * NO la posición del archivo.
     *
     * Es importante porque ahora podemos saltar
     * de 0 MB a 5.5 GB sin descargar lo intermedio.
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
   CARGAR INFORMACIÓN DE MEGA
========================================================= */

async function loadFileInformation() {

    if (
        activeOperation
    ) {

        log(
            "⚠ Hay una prueba activa. Deténla antes de cambiar.",
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
   LEER RANGO DE MEGA
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
        !Number.isFinite(start) ||
        !Number.isFinite(size)
    ) {

        throw new Error(
            "Inicio o tamaño de rango inválido."
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
            `La posición ${start} está fuera del archivo.`
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
     * Protección contra rangos duplicados.
     */

    if (
        requestedRanges.has(
            rangeKey
        )
    ) {

        throw new Error(
            `El rango ya fue solicitado: ${start.toLocaleString()} → ${end.toLocaleString()}`
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
                            "⚠ MEGAJS entregó un bloque con formato desconocido.",
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
     * MP4Box necesita saber en qué posición
     * del archivo original se encuentra este
     * ArrayBuffer.
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
   CALCULAR SIGUIENTE POSICIÓN
========================================================= */

function calculateNextPosition(
    returnedPosition,
    block
) {

    /*
     * MP4Box puede devolver undefined.
     *
     * En ese caso no tenemos una solicitud
     * dirigida y utilizamos el siguiente byte
     * después del bloque actual.
     */

    if (
        !Number.isFinite(
            returnedPosition
        )
    ) {

        return (
            block.end +
            1
        );

    }


    const requested =
        Number(
            returnedPosition
        );


    /*
     * Si MP4Box pide una posición válida
     * posterior al bloque actual, esa es
     * la posición que queremos probar.
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
     * Si la posición está dentro del bloque,
     * continuar después del bloque evita repetir
     * exactamente los mismos datos.
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
     * Si MP4Box devuelve una posición anterior,
     * no retrocedemos automáticamente.
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


    /*
     * Fallback.
     */

    return (
        block.end +
        1
    );

}


/* =========================================================
   CREAR MP4BOX
========================================================= */

function createMP4BoxParser() {

    const parser =
        MP4Box.createFile();


    parser.onMoovStart =
        () => {

            log(
                "✓ MP4Box detectó el comienzo de MOOV.",
                "success"
            );

        };


    parser.onReady =
        info => {

            if (
                mp4Ready
            ) {

                return;

            }


            mp4Ready =
                true;


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

        };


    parser.onError =
        error => {

            mp4Error =
                true;


            log(
                `✗ MP4Box informó un error: ${error}`,
                "error"
            );

        };


    return parser;

}


/* =========================================================
   MOSTRAR INFORMACIÓN DE MP4BOX
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

        let details =
            `Track ${track.id}: codec=${track.codec || "desconocido"}`;


        if (
            track.video
        ) {

            details +=
                ` | vídeo ${track.video.width}x${track.video.height}`;

        }


        if (
            track.audio
        ) {

            details +=
                ` | audio ${track.audio.sample_rate || "—"} Hz`;

        }


        log(
            details,
            "success"
        );

    }


    resultBox.className =
        "result-box result-success";


    resultBox.textContent =
        `✓ MP4Box encontró la estructura utilizando ${formatBytes(totalDownloaded)} de ${formatBytes(fileSize)}.`;

}


/* =========================================================
   PRUEBA PRINCIPAL DE LECTURA DIRIGIDA
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
        "directed-analysis";


    const thisOperation =
        ++operationId;


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


    lastRequestedPosition =
        null;


    setStatus(
        "Analizando MP4 por rangos dirigidos...",
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


    log(
        `✓ Límite de seguridad: ${formatBytes(MAX_ANALYSIS_BYTES)}`,
        "info"
    );


    log(
        `✓ Máximo de solicitudes: ${MAX_REQUESTS}`,
        "info"
    );


    try {

        mp4box =
            createMP4BoxParser();


        /*
         * =================================================
         * RANGO 1
         * =================================================
         *
         * Siempre empezamos desde el byte 0.
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
                "INICIO"
            );


        /*
         * Enviar a MP4Box.
         */

        let returnedPosition =
            mp4box.appendBuffer(
                firstBlock.buffer
            );


        if (
            Number.isFinite(
                returnedPosition
            )
        ) {

            log(
                `MP4Box indica siguiente posición: ${Number(returnedPosition).toLocaleString()}`,
                "success"
            );

        } else {

            log(
                "MP4Box no devolvió una posición en el primer bloque.",
                "info"
            );

        }


        /*
         * =================================================
         * BUCLE DIRIGIDO
         * =================================================
         */

        let nextPosition =
            calculateNextPosition(
                returnedPosition,
                firstBlock
            );


        let previousPosition =
            null;


        while (
            !mp4Ready &&
            !mp4Error &&
            activeOperation ===
                "directed-analysis" &&
            thisOperation ===
                operationId &&
            totalDownloaded <
                MAX_ANALYSIS_BYTES &&
            requestedRanges.size <
                MAX_REQUESTS
        ) {

            /*
             * Si la posición llegó al final,
             * no podemos solicitar más.
             */

            if (
                nextPosition >=
                fileSize
            ) {

                log(
                    "⚠ La siguiente posición está en el final del archivo.",
                    "error"
                );


                break;

            }


            /*
             * Evitar retrocesos infinitos.
             */

            if (
                previousPosition ===
                nextPosition
            ) {

                log(
                    `⚠ MP4Box repitió la misma posición: ${nextPosition.toLocaleString()}`,
                    "error"
                );


                break;

            }


            previousPosition =
                nextPosition;


            /*
             * Guardar posición para diagnóstico.
             */

            lastRequestedPosition =
                nextPosition;


            /*
             * Tamaño del rango.
             */

            const remainingBudget =
                MAX_ANALYSIS_BYTES -
                totalDownloaded;


            const requestSize =
                Math.min(
                    DIRECTED_RANGE_SIZE,
                    remainingBudget,
                    fileSize -
                    nextPosition
                );


            if (
                requestSize <=
                0
            ) {

                break;

            }


            /*
             * Solicitar directamente la posición
             * indicada por MP4Box.
             */

            const block =
                await readMegaRange(
                    nextPosition,
                    requestSize,
                    "RANGO DIRIGIDO"
                );


            /*
             * Enviar bloque a MP4Box.
             */

            returnedPosition =
                mp4box.appendBuffer(
                    block.buffer
                );


            /*
             * Si onReady ya se ejecutó,
             * hemos conseguido nuestro objetivo.
             */

            if (
                mp4Ready
            ) {

                break;

            }


            /*
             * Mostrar respuesta de MP4Box.
             */

            if (
                Number.isFinite(
                    returnedPosition
                )
            ) {

                log(
                    `MP4Box indica siguiente posición: ${Number(returnedPosition).toLocaleString()}`,
                    "success"
                );

            } else {

                log(
                    "MP4Box no indicó una nueva posición.",
                    "info"
                );

            }


            /*
             * Calcular siguiente rango.
             */

            nextPosition =
                calculateNextPosition(
                    returnedPosition,
                    block
                );


            /*
             * Mostrar la decisión.
             */

            if (
                nextPosition <
                fileSize
            ) {

                log(
                    `→ Próximo rango dirigido: ${nextPosition.toLocaleString()}`,
                    "success"
                );

            }


            /*
             * Pequeña pausa para permitir que
             * los eventos de MP4Box terminen.
             */

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
         * RESULTADO
         * =================================================
         */

        if (
            mp4Ready
        ) {

            setStatus(
                "MP4 analizado correctamente",
                "success"
            );


            log(
                "=================================================",
                "success"
            );


            log(
                "✓ PRUEBA DIRIGIDA COMPLETADA",
                "success"
            );


            log(
                "=================================================",
                "success"
            );


            log(
                `✓ Datos descargados: ${formatBytes(totalDownloaded)}`,
                "success"
            );


            log(
                `✓ Solicitudes realizadas: ${requestedRanges.size}`,
                "success"
            );


            log(
                "✓ MP4Box encontró la estructura sin recorrer necesariamente todo el archivo.",
                "success"
            );


        } else if (
            mp4Error
        ) {

            setStatus(
                "MP4Box informó un error",
                "error"
            );


            resultBox.className =
                "result-box result-error";


            resultBox.textContent =
                "MP4Box informó un error durante la lectura dirigida.";


        } else {

            setStatus(
                "Prueba detenida por límite de seguridad",
                "error"
            );


            resultBox.className =
                "result-box result-error";


            resultBox.textContent =
                `MOOV no fue localizado dentro del límite de ${formatBytes(MAX_ANALYSIS_BYTES)}.`;


            log(
                "⚠ No se continuará automáticamente.",
                "error"
            );


            log(
                `✓ Datos descargados antes de detener: ${formatBytes(totalDownloaded)}`,
                "info"
            );

        }


    } catch (
        error
    ) {

        setStatus(
            "Error en prueba dirigida",
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

    }

}


/* =========================================================
   PRUEBA INDEPENDIENTE DE BLOQUES MEGA
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
   CAMBIO DE VIDEO
========================================================= */

videoSelect.addEventListener(
    "change",
    () => {

        if (
            activeOperation
        ) {

            log(
                "⚠ Hay una operación activa. No cambies de vídeo hasta que termine.",
                "error"
            );


            return;

        }


        operationId++;


        currentFile =
            null;


        currentVideo =
            null;


        fileSize =
            0;


        mp4box =
            null;


        mp4Ready =
            false;


        mp4Error =
            false;


        totalDownloaded =
            0;


        requestedRanges.clear();


        lastRequestedPosition =
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
   CREAR BOTÓN DE ANÁLISIS DIRIGIDO
========================================================= */

function createDirectedButton() {

    const existing =
        document.getElementById(
            "btn-directed-analysis"
        );


    if (
        existing
    ) {

        return existing;

    }


    const button =
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
   ACTIVAR BOTÓN CUANDO MEGA ESTÁ LISTO
========================================================= */

const directedButton =
    createDirectedButton();


const originalLoad =
    loadFileInformation;


/*
 * No reemplazamos la función original.
 *
 * Observamos el estado del botón de bloques.
 */

const observer =
    new MutationObserver(
        () => {

            if (
                currentFile
            ) {

                directedButton.disabled =
                    false;

            } else {

                directedButton.disabled =
                    true;

            }

        }
    );


observer.observe(
    btnChunk,
    {
        attributes:
            true
    }
);


/*
 * También hacemos una comprobación periódica
 * muy ligera para actualizar el estado del botón.
 */

setInterval(
    () => {

        directedButton.disabled =
            !currentFile ||
            Boolean(
                activeOperation
            );

    },
    250
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
    "Laboratorio MEGA + MP4Box preparado.",
    "success"
);


log(
    "✓ Modo de lectura DIRIGIDA activado.",
    "success"
);


log(
    `✓ Límite de seguridad: ${formatBytes(MAX_ANALYSIS_BYTES)}.`,
    "info"
);


log(
    "Selecciona un vídeo y pulsa 'Leer información del archivo'.",
    "info"
);
