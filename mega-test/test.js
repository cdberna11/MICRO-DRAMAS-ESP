/* =========================================================
   MICRO-DRAMAS-ESP
   PRUEBA DE ACCESO A MEGA MEDIANTE MEGAJS

   Esta versión NO intenta reproducir todavía el vídeo.

   Objetivo:
   1. Abrir enlace MEGA /file/
   2. Leer atributos
   3. Obtener nombre y tamaño
   4. Probar lectura de una pequeña porción
   5. Medir datos recibidos

   NO modifica D1.
   NO modifica los microdramas.
   NO utiliza iframe MEGA.
========================================================= */


/* =========================================================
   IMPORTAR MEGAJS PARA NAVEGADOR
========================================================= */

import {
    File as MEGAFile
} from "https://unpkg.com/megajs/dist/main.browser-es.mjs";


/* =========================================================
   ENLACES DE PRUEBA
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
   CONSTANTES
========================================================= */

const TEST_SIZE =
    1024 * 1024;


/* =========================================================
   ELEMENTOS
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
   ESTADO INTERNO
========================================================= */

let currentFile =
    null;


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
        "0 B / 1 MB";

    progressPercent.textContent =
        "0%";

    resultBox.className =
        "result-box";

    resultBox.textContent =
        "Todavía no se ha realizado ninguna prueba.";

}


/* =========================================================
   OBTENER VIDEO SELECCIONADO
========================================================= */

function getSelectedVideo() {

    const key =
        videoSelect.value;

    return VIDEOS[key];

}


/* =========================================================
   LEER INFORMACIÓN DEL ARCHIVO
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


    log(
        "Creando objeto File.fromURL()...",
        "info"
    );


    try {

        /*
         * File.fromURL reconoce el enlace
         * público /file/ de MEGA.
         */

        const mainFile =
            MEGAFile.fromURL(
                selected.url
            );


        /*
         * Guardamos el objeto para
         * la siguiente prueba.
         */

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


        /*
         * Los enlaces compartidos no cargan
         * nombre y tamaño automáticamente.
         *
         * loadAttributes() los obtiene.
         */

        const loadedFile =
            await mainFile.loadAttributes();


        /*
         * En enlaces directos normalmente
         * loadedFile es el propio archivo.
         *
         * En caso de que MEGA devuelva otro
         * objeto, usamos el que corresponda.
         */

        if (
            loadedFile &&
            loadedFile.name
        ) {

            currentFile =
                loadedFile;
        }


        const name =
            currentFile.name ||
            selected.name ||
            "Desconocido";


        const size =
            Number(
                currentFile.size || 0
            );


        /*
         * Intentamos detectar el tipo
         * desde el nombre del archivo.
         */

        let type =
            "Desconocido";


        const lowerName =
            name.toLowerCase();


        if (
            lowerName.endsWith(
                ".mp4"
            )
        ) {

            type =
                "video/mp4";

        } else if (
            lowerName.endsWith(
                ".mkv"
            )
        ) {

            type =
                "video/x-matroska";

        } else if (
            lowerName.endsWith(
                ".webm"
            )
        ) {

            type =
                "video/webm";
        }


        fileNameElement.textContent =
            name;


        fileSizeElement.textContent =
            formatBytes(size);


        fileTypeElement.textContent =
            type;


        setStatus(
            "Archivo localizado",
            "success"
        );


        resultBox.className =
            "result-box result-success";


        resultBox.textContent =
            "✓ MEGAJS pudo localizar el archivo y obtener sus atributos correctamente.";


        log(
            `✓ Archivo: ${name}`,
            "success"
        );


        log(
            `✓ Tamaño: ${formatBytes(size)}`,
            "success"
        );


        log(
            "✓ MEGAJS está listo para la prueba de lectura.",
            "success"
        );


        btnChunk.disabled =
            false;


    } catch (error) {

        console.error(
            error
        );


        currentFile =
            null;


        setStatus(
            "Error",
            "error"
        );


        resultBox.className =
            "result-box result-error";


        resultBox.textContent =
            "No se pudo leer el archivo de MEGA. Revisa el diagnóstico y la consola del navegador.";


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
   PRUEBA DE LECTURA POR BLOQUES
========================================================= */

async function testFirstMegabyte() {

    if (!currentFile) {

        resultBox.className =
            "result-box result-error";

        resultBox.textContent =
            "Primero debes leer la información del archivo.";

        return;
    }


    btnChunk.disabled =
        true;

    btnInfo.disabled =
        true;


    progressBar.style.width =
        "0%";


    progressText.textContent =
        "Preparando prueba...";


    progressPercent.textContent =
        "0%";


    setStatus(
        "Probando bloques...",
        "loading"
    );


    resultBox.className =
        "result-box";


    resultBox.textContent =
        "Se probarán varios bloques independientes del archivo. No se descargará el vídeo completo.";


    log(
        "=================================================",
        "info"
    );


    log(
        "INICIANDO PRUEBA DE LECTURA POR BLOQUES",
        "info"
    );


    log(
        "=================================================",
        "info"
    );


    const fileSize =
        Number(
            currentFile.size || 0
        );


    if (
        !Number.isFinite(fileSize) ||
        fileSize <= 0
    ) {

        throw new Error(
            "No se pudo determinar el tamaño del archivo."
        );
    }


    /*
     * Tamaño de cada bloque de prueba.
     *
     * 1 MB = 1,048,576 bytes.
     */

    const BLOCK_SIZE =
        1024 * 1024;


    /*
     * Posiciones que queremos probar.
     *
     * El último bloque se calcula
     * dinámicamente para adaptarse
     * al tamaño real del archivo.
     */

    const positions = [

        0,

        10 * 1024 * 1024,

        100 * 1024 * 1024,

        500 * 1024 * 1024

    ];


    /*
     * Añadimos un bloque cerca del final.
     */

    const lastPosition =
        Math.max(
            0,
            fileSize - BLOCK_SIZE
        );


    positions.push(
        lastPosition
    );


    /*
     * Eliminamos posiciones repetidas.
     */

    const uniquePositions =
        [
            ...new Set(
                positions
            )
        ];


    let totalReceived =
        0;


    let successfulBlocks =
        0;


    let failedBlocks =
        0;


    /* =========================================================
   FUNCIÓN PARA LEER UN BLOQUE
========================================================= */

function readBlock(
    blockNumber,
    start
) {

    return new Promise(
        (
            resolve,
            reject
        ) => {

            /*
             * IMPORTANTE:
             *
             * MEGAJS utiliza END como posición
             * final INCLUSIVA.
             *
             * Por eso, para obtener exactamente
             * 1 MB:
             *
             * start = 0
             *
             * end = 1,048,575
             *
             * Cantidad:
             *
             * 1,048,575 - 0 + 1
             * = 1,048,576 bytes
             */

            const end =
                Math.min(
                    start + BLOCK_SIZE - 1,
                    fileSize - 1
                );


            /*
             * Tamaño exacto esperado.
             */

            const expectedBytes =
                end -
                start +
                1;


            let received =
                0;


            let finished =
                false;


            log(
                `Bloque ${blockNumber}: ${start.toLocaleString()} → ${end.toLocaleString()}`,
                "info"
            );


            log(
                `Solicitando exactamente ${expectedBytes.toLocaleString()} bytes (${formatBytes(expectedBytes)})...`,
                "info"
            );


            let stream;


            try {

                stream =
                    currentFile.download({

                        start:
                            start,

                        end:
                            end,

                        /*
                         * Una sola conexión.
                         *
                         * Queremos observar claramente
                         * cada solicitud durante la prueba.
                         */

                        maxConnections:
                            1,

                        /*
                         * Tamaño inicial de los chunks
                         * internos de MEGAJS.
                         */

                        initialChunkSize:
                            128 * 1024,

                        chunkSizeIncrement:
                            128 * 1024,

                        maxChunkSize:
                            1024 * 1024

                    });

            } catch (error) {

                reject(
                    error
                );

                return;

            }


            if (!stream) {

                reject(
                    new Error(
                        "MEGAJS no devolvió un stream."
                    )
                );

                return;

            }


            if (
                typeof stream.on !==
                "function"
            ) {

                reject(
                    new Error(
                        "El stream de MEGAJS no expone el método on()."
                    )
                );

                return;

            }


            /*
             * =================================================
             * DATOS RECIBIDOS
             * =================================================
             */

            stream.on(
                "data",
                chunk => {

                    if (!chunk) {

                        return;

                    }


                    if (
                        typeof chunk.length ===
                        "number"
                    ) {

                        received +=
                            chunk.length;

                    } else if (
                        typeof chunk.byteLength ===
                        "number"
                    ) {

                        received +=
                            chunk.byteLength;

                    }

                }
            );


            /*
             * =================================================
             * PROGRESO
             * =================================================
             */

            stream.on(
                "progress",
                info => {

                    const loaded =
                        Number(
                            info?.bytesLoaded || 0
                        );


                    const percent =
                        expectedBytes > 0
                            ? Math.min(
                                100,
                                (
                                    loaded /
                                    expectedBytes
                                ) *
                                100
                            )
                            : 0;


                    progressBar.style.width =
                        `${percent}%`;


                    progressText.textContent =
                        `Bloque ${blockNumber}: ${loaded.toLocaleString()} / ${expectedBytes.toLocaleString()} bytes`;


                    progressPercent.textContent =
                        `${percent.toFixed(1)}%`;

                }
            );


            /*
             * =================================================
             * ERROR
             * =================================================
             */

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


            /*
             * =================================================
             * FIN DEL BLOQUE
             * =================================================
             */

            stream.on(
                "end",
                () => {

                    if (finished) {

                        return;

                    }


                    finished =
                        true;


                    log(
                        `Bloque ${blockNumber}: recibidos exactamente ${received.toLocaleString()} bytes (${formatBytes(received)}).`,
                        "info"
                    );


                    /*
                     * COMPARACIÓN EXACTA
                     */

                    if (
                        received ===
                        expectedBytes
                    ) {

                        log(
                            `✓ Bloque ${blockNumber} CORRECTO.`,
                            "success"
                        );

                    } else {

                        log(
                            `✗ Bloque ${blockNumber} DIFERENTE.`,
                            "error"
                        );


                        log(
                            `Esperados: ${expectedBytes.toLocaleString()} bytes.`,
                            "error"
                        );


                        log(
                            `Recibidos: ${received.toLocaleString()} bytes.`,
                            "error"
                        );


                        log(
                            `Diferencia: ${(received - expectedBytes).toLocaleString()} bytes.`,
                            "error"
                        );

                    }


                    resolve({

                        start:
                            start,

                        end:
                            end,

                        expected:
                            expectedBytes,

                        received:
                            received,

                        success:
                            received ===
                            expectedBytes

                    });

                }
            );

        }
    );

}
     


    /*
     * -----------------------------------------------------
     * EJECUTAR BLOQUES
     * -----------------------------------------------------
     */

    try {

        for (
            let i = 0;
            i < uniquePositions.length;
            i++
        ) {

            const start =
                uniquePositions[i];


            await readBlock(
                i + 1,
                start
            );


            /*
             * Pausa pequeña entre bloques.
             *
             * Esto evita lanzar varias solicitudes
             * simultáneamente durante la prueba.
             */

            if (
                i <
                uniquePositions.length - 1
            ) {

                await new Promise(
                    resolve =>
                        setTimeout(
                            resolve,
                            500
                        )
                );

            }

        }


        /*
         * -------------------------------------------------
         * RESULTADO FINAL
         * -------------------------------------------------
         */

        progressBar.style.width =
            "100%";


        progressPercent.textContent =
            "100%";


        progressText.textContent =
            `${formatBytes(totalReceived)} recibidos`;


        if (
            failedBlocks === 0 &&
            successfulBlocks ===
            uniquePositions.length
        ) {

            setStatus(
                "Bloques leídos correctamente",
                "success"
            );


            resultBox.className =
                "result-box result-success";


            resultBox.textContent =
                `✓ Los ${successfulBlocks} bloques fueron leídos correctamente desde diferentes posiciones del archivo. Total recibido: ${formatBytes(totalReceived)}.`;


            log(
                "=================================================",
                "success"
            );


            log(
                "✓ PRUEBA DE BLOQUES COMPLETADA",
                "success"
            );


            log(
                `✓ Bloques correctos: ${successfulBlocks}`,
                "success"
            );


            log(
                `✓ Bloques con diferencias: ${failedBlocks}`,
                "success"
            );


            log(
                `✓ Datos recibidos: ${formatBytes(totalReceived)}`,
                "success"
            );


            log(
                "✓ MEGAJS permite solicitar diferentes rangos del archivo.",
                "success"
            );


            log(
                "Siguiente etapa: investigar cómo convertir estos bloques en una fuente reproducible para <video>.",
                "success"
            );


        } else {

            setStatus(
                "Prueba completada con diferencias",
                "error"
            );


            resultBox.className =
                "result-box result-error";


            resultBox.textContent =
                `La prueba terminó, pero ${failedBlocks} bloque(s) no entregaron exactamente el tamaño esperado. Revisa el diagnóstico.`;


            log(
                `⚠ Bloques correctos: ${successfulBlocks}`,
                "info"
            );


            log(
                `⚠ Bloques con diferencias: ${failedBlocks}`,
                "error"
            );

        }


    } catch (error) {

        console.error(
            error
        );


        setStatus(
            "Error durante la prueba",
            "error"
        );


        resultBox.className =
            "result-box result-error";


        resultBox.textContent =
            `La prueba de bloques falló: ${getErrorMessage(error)}`;


        log(
            `✗ Error: ${getErrorMessage(error)}`,
            "error"
        );

    } finally {

        btnInfo.disabled =
            false;

        btnChunk.disabled =
            false;

    }

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

        resetInfo();

        btnChunk.disabled =
            true;

        setStatus(
            "Esperando prueba...",
            "idle"
        );

        resultBox.textContent =
            "Selecciona 'Leer información del archivo' para comenzar.";

        resultBox.className =
            "result-box";

        log(
            `Vídeo seleccionado: ${getSelectedVideo().name}`,
            "info"
        );

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
    testFirstMegabyte
);


/* =========================================================
   INICIO
========================================================= */

log(
    "Página de prueba cargada.",
    "success"
);


log(
    "MEGAJS importado desde la versión browser.",
    "success"
);


log(
    "Selecciona un vídeo y pulsa 'Leer información del archivo'.",
    "info"
);
