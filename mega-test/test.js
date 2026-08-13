/* =========================================================
   MICRO-DRAMAS-ESP
   LABORATORIO FINAL
   MEGA + MEGAJS + MP4BOX + MEDIASOURCE

   OBJETIVO:

   Comprobar si podemos reproducir un MP4 almacenado
   en MEGA sin iframe y sin descargarlo mediante
   una URL directa.

   ARQUITECTURA:

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

   ESTA PÁGINA ES SOLO DE PRUEBA.

   NO modifica D1.
   NO modifica /admin.
   NO modifica el portal público.
========================================================= */


/* =========================================================
   IMPORTAR MEGAJS
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
   CONFIGURACIÓN DE LA PRUEBA
========================================================= */

/*
 * Primera lectura.
 *
 * 4 MB es suficiente para comenzar a analizar
 * el MP4 sin realizar una descarga grande.
 */

const INITIAL_RANGE_SIZE =
    4 * 1024 * 1024;


/*
 * Cuando MP4Box necesite más datos,
 * iremos solicitando otros rangos.
 */

const RANGE_SIZE =
    4 * 1024 * 1024;


/*
 * Número aproximado de muestras por segmento MSE.
 *
 * 60 suele representar aproximadamente 2 segundos
 * en vídeos de 30 fps.
 *
 * MP4Box ajustará según la pista real.
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
   ESTADO
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


let mediaSource =
    null;


let videoElement =
    null;


let sourceBuffers =
    new Map();


let sourceQueues =
    new Map();


let playerStarted =
    false;


let playerStopped =
    false;


let nextOffset =
    0;


let totalDownloaded =
    0;


let totalSegments =
    0;


let playbackStarted =
    false;


/* =========================================================
   DIAGNÓSTICO
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
   FORMATEAR BYTES
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
   FORMATEAR TIEMPO
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
        Math.floor(
            seconds
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
   OBTENER VIDEO SELECCIONADO
========================================================= */

function getSelectedVideo() {

    return VIDEOS[
        videoSelect.value
    ];

}


/* =========================================================
   LIMPIAR
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
   CARGAR ATRIBUTOS MEGA
========================================================= */

async function loadFileInformation() {

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
                currentFile.size || 0
            );


        const name =
            currentFile.name ||
            selected.name ||
            "Desconocido";


        let type =
            "Desconocido";


        if (
            name
                .toLowerCase()
                .endsWith(
                    ".mp4"
                )
        ) {

            type =
                "video/mp4";

        }


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


    } catch (error) {

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
   CREAR INTERFAZ DEL REPRODUCTOR
========================================================= */

function createPlayerInterface() {

    let panel =
        document.getElementById(
            "mega-player-panel"
        );


    if (panel) {

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
                    "▶ REPRODUCCIÓN INICIADA.",
                    "success"
                );


                log(
                    `✓ Datos descargados hasta el inicio de reproducción: ${formatBytes(totalDownloaded)}`,
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
                "⏳ El reproductor está esperando más datos.",
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
   LEER RANGO DE MEGA
========================================================= */

async function readMegaRange(
    start,
    size
) {

    if (
        start >= fileSize
    ) {

        throw new Error(
            "El rango solicitado comienza fuera del archivo."
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
        `MEGA → ${start.toLocaleString()} → ${end.toLocaleString()} (${formatBytes(expected)})`,
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
                                chunk.byteOffset || 0,
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

                    if (finished) {

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

                    if (finished) {

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
     * CRÍTICO PARA MP4BOX:
     *
     * Indica la posición real del buffer
     * dentro del archivo original.
     */

    arrayBuffer.fileStart =
        start;


    totalDownloaded +=
        received;


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
   ANALIZAR MP4
========================================================= */

async function analyzeMP4() {

    if (!currentFile) {

        return;

    }


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


        let resolved =
            false;


        parser.onMoovStart =
            () => {

                log(
                    "✓ MP4Box encontró el comienzo de MOOV.",
                    "success"
                );

            };


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
         * Comenzamos por el principio.
         */

        let offset =
            0;


        const first =
            await readMegaRange(
                0,
                Math.min(
                    INITIAL_RANGE_SIZE,
                    fileSize
                )
            );


        parser.appendBuffer(
            first.buffer
        );


        offset =
            first.end +
            1;


        /*
         * Seguimos solicitando rangos
         * hasta encontrar MOOV.
         *
         * No descargamos todo el archivo.
         */

        while (
            !resolved &&
            offset <
            fileSize
        ) {

            const size =
                Math.min(
                    RANGE_SIZE,
                    fileSize -
                    offset
                );


            const block =
                await readMegaRange(
                    offset,
                    size
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
                    `MP4Box indica siguiente posición esperada: ${expected.toLocaleString()}`,
                    "info"
                );

            }


            /*
             * Protección.
             *
             * Si MP4Box ya encontró MOOV,
             * onReady habrá cambiado resolved.
             */

            if (
                resolved
            ) {

                break;

            }

        }


        if (
            !resolved
        ) {

            log(
                "⚠ MP4Box no encontró MOOV antes de llegar al final.",
                "error"
            );


            setStatus(
                "No se pudo analizar el MP4",
                "error"
            );


            return;

        }


    } catch (error) {

        console.error(
            error
        );


        setStatus(
            "Error",
            "error"
        );


        log(
            `✗ Error analizando MP4: ${getErrorMessage(error)}`,
            "error"
        );

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


    if (!infoElement) {

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
                ` — ${track.audio.sample_rate} Hz / ${track.audio.channel_count} canales`;

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
        info.tracks || []
    ) {

        if (
            !track.codec
        ) {

            continue;

        }


        let mime;


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

        } else {

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
                `✗ El navegador NO soporta: ${mime}`,
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


        sourceBuffer.addEventListener(
            "updateend",
            () => {

                pumpSourceBuffer(
                    track.id
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
   ENCOLAR DATOS
========================================================= */

function queueSourceBuffer(
    trackId,
    buffer
) {

    const queue =
        sourceQueues.get(
            trackId
        );


    if (!queue) {

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
   ENVIAR DATOS AL SOURCEBUFFER
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
        queue.length === 0
    ) {

        return;

    }


    const buffer =
        queue.shift();


    try {

        sourceBuffer.appendBuffer(
            buffer
        );


    } catch (error) {

        log(
            `✗ appendBuffer track ${trackId}: ${getErrorMessage(error)}`,
            "error"
        );


        mp4Error =
            true;

    }

}


/* =========================================================
   CONFIGURAR SEGMENTACIÓN
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
   EVENTOS MP4BOX
========================================================= */

function configureMP4Box() {

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


            log(
                "✓ MP4Box terminó de analizar MOOV.",
                "success"
            );


            showMP4Info(
                info
            );


            try {

                prepareSegmentation(
                    info
                );


            } catch (error) {

                mp4Error =
                    true;


                log(
                    `✗ Error preparando MSE: ${getErrorMessage(error)}`,
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


            let foundTrackId =
                null;


            for (
                const [
                    id,
                    sourceBuffer
                ] of sourceBuffers.entries()
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
                    `⚠ Segmento track ${trackId} sin SourceBuffer asociado.`,
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


            /*
             * Intentar comenzar reproducción
             * cuando ya exista contenido.
             */

            tryStartPlayback();


            if (
                last
            ) {

                log(
                    `✓ Último segmento del track ${trackId}.`,
                    "success"
                );

            }

        };

}


/* =========================================================
   INTENTAR REPRODUCCIÓN
========================================================= */

async function tryStartPlayback() {

    if (
        playbackStarted ||
        !videoElement
    ) {

        return;

    }


    /*
     * Esperar hasta que el elemento tenga
     * datos suficientes.
     */

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
            `✓ Datos descargados hasta reproducción: ${formatBytes(totalDownloaded)}`,
            "success"
        );


        setStatus(
            "Reproduciendo",
            "success"
        );


    } catch (error) {

        /*
         * En móviles y algunos navegadores
         * autoplay puede estar bloqueado.
         *
         * No consideramos esto un fallo
         * del streaming.
         */

        log(
            "ℹ El navegador no permitió autoplay.",
            "info"
        );


        log(
            "ℹ Pulsa PLAY manualmente en el vídeo.",
            "info"
        );

    }

}


/* =========================================================
   INICIAR REPRODUCTOR
========================================================= */

async function startExperimentalPlayer() {

    if (!currentFile) {

        return;

    }


    if (
        playerStarted
    ) {

        log(
            "El reproductor ya está iniciado.",
            "info"
        );


        return;

    }


    playerStarted =
        true;


    playerStopped =
        false;


    mp4Ready =
        false;


    mp4Error =
        false;


    playbackStarted =
        false;


    totalDownloaded =
        0;


    totalSegments =
        0;


    nextOffset =
        0;


    setStatus(
        "Preparando reproductor...",
        "loading"
    );


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


    try {

        


        mp4box =
            MP4Box.createFile();


        configureMP4Box();


        /*
         * Crear MediaSource.
         */

        await createMediaSource();


        /*
         * Descargar secuencialmente desde
         * el comienzo.
         *
         * No descargaremos todo a ciegas:
         * cuando MP4Box consiga MOOV podremos
         * empezar a generar segmentos.
         */

        nextOffset =
            0;


        while (
            nextOffset <
            fileSize &&
            !playerStopped &&
            !mp4Error
        ) {

            const size =
                Math.min(
                    RANGE_SIZE,
                    fileSize -
                    nextOffset
                );


            const block =
                await readMegaRange(
                    nextOffset,
                    size
                );


            const expectedNext =
                mp4box.appendBuffer(
                    block.buffer
                );


            nextOffset =
                block.end +
                1;


            /*
             * Mostrar progreso real de lectura.
             */

            const percent =
                Math.min(
                    100,
                    (
                        nextOffset /
                        fileSize
                    ) *
                    100
                );


            progressBar.style.width =
                `${percent}%`;


            progressPercent.textContent =
                `${percent.toFixed(1)}%`;


            progressText.textContent =
                `${formatBytes(nextOffset)} / ${formatBytes(fileSize)}`;


            /*
             * Información devuelta por MP4Box.
             */

            if (
                Number.isFinite(
                    expectedNext
                ) &&
                expectedNext !==
                nextOffset
            ) {

                log(
                    `MP4Box espera posición ${expectedNext.toLocaleString()}`,
                    "info"
                );

            }


            /*
             * Si ya empezó la reproducción,
             * dejamos que el usuario pueda
             * observar el comportamiento.
             */

            if (
                playbackStarted
            ) {

                setStatus(
                    "Reproduciendo / cargando",
                    "success"
                );

            }

        }


        if (
            nextOffset >=
            fileSize &&
            !mp4Error
        ) {

            log(
                "✓ Se proporcionó todo el archivo a MP4Box.",
                "success"
            );


            try {

                mp4box.flush();

            } catch (error) {

                log(
                    `⚠ Error en flush: ${getErrorMessage(error)}`,
                    "error"
                );

            }


            progressBar.style.width =
                "100%";


            progressPercent.textContent =
                "100%";


            setStatus(
                playbackStarted
                    ? "Reproducción completa"
                    : "Carga completa",
                "success"
            );


            log(
                `✓ Total descargado: ${formatBytes(totalDownloaded)}`,
                "success"
            );


            log(
                `✓ Segmentos generados: ${totalSegments}`,
                "success"
            );

        }


    } catch (error) {

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
            `✗ Error: ${getErrorMessage(error)}`,
            "error"
        );

    }

}


/* =========================================================
   DETENER
========================================================= */

function stopExperimentalPlayer() {

    playerStopped =
        true;


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


    setStatus(
        "Reproductor detenido",
        "idle"
    );


    log(
        "Reproductor detenido por el usuario.",
        "info"
    );

}

/* =========================================================
   OBTENER MENSAJE DE ERROR
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
   CAMBIO DE VIDEO
========================================================= */

videoSelect.addEventListener(
    "change",
    () => {

        currentFile =
            null;


        currentVideo =
            null;


        playerStarted =
            false;


        playerStopped =
            true;


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


/*
 * Conservamos el botón de bloques.
 *
 * Sirve como prueba independiente de MEGAJS.
 */

btnChunk.addEventListener(
    "click",
    async () => {

        if (!currentFile) {

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


        for (
            let i = 0;
            i < positions.length;
            i++
        ) {

            const block =
                await readMegaRange(
                    positions[i],
                    BLOCK_SIZE
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

    }
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
    "Laboratorio MEGA + MP4Box + MediaSource preparado.",
    "success"
);


log(
    "Selecciona un vídeo y pulsa 'Leer información del archivo'.",
    "info"
);
