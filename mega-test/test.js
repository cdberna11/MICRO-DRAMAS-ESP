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


//* =========================================================
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


    /*
     * -----------------------------------------------------
     * FUNCIÓN PARA LEER UN BLOQUE
     * -----------------------------------------------------
     */

    async function readBlock(
        blockNumber,
        start
    ) {

        /*
         * No permitir posiciones
         * fuera del archivo.
         */

        if (
            start >= fileSize
        ) {

            throw new Error(
                `El bloque comienza fuera del archivo: ${start}`
            );
        }


        /*
         * Calculamos el final solicitado.
         *
         * Usamos end como límite del bloque.
         */

        const end =
            Math.min(
                start + BLOCK_SIZE,
                fileSize
            );


        const expectedBytes =
            end - start;


        log(
            `Bloque ${blockNumber}: ${formatBytes(start)} → ${formatBytes(end)}`,
            "info"
        );


        log(
            `Solicitando ${formatBytes(expectedBytes)}...`,
            "info"
        );


        let received =
            0;


        let ended =
            false;


        /*
         * MEGAJS devuelve un stream.
         *
         * start/end permiten solicitar
         * solamente la sección indicada.
         */

        const stream =
            currentFile.download({

                start:
                    start,

                end:
                    end,

                /*
                 * Para esta prueba utilizamos
                 * una sola conexión.
                 *
                 * Esto facilita saber exactamente
                 * qué está ocurriendo.
                 */

                maxConnections:
                    1,

                /*
                 * Bloques internos de hasta 1 MB.
                 */

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


        /*
         * Promise que se resuelve cuando
         * termina el bloque.
         */

        await new Promise(
            (
                resolve,
                reject
            ) => {

                /*
                 * PROGRESO
                 */

                if (
                    typeof stream.on ===
                    "function"
                ) {

                    stream.on(
                        "progress",
                        info => {

                            const loaded =
                                Number(
                                    info?.bytesLoaded || 0
                                );


                            /*
                             * Progreso global
                             * de la prueba.
                             */

                            const completedBefore =
                                totalReceived;


                            const currentTotal =
                                completedBefore +
                                Math.min(
                                    loaded,
                                    expectedBytes
                                );


                            const overallTotal =
                                BLOCK_SIZE *
                                uniquePositions.length;


                            const percent =
                                Math.min(
                                    100,
                                    (
                                        currentTotal /
                                        overallTotal
                                    ) *
                                    100
                                );


                            progressBar.style.width =
                                `${percent}%`;


                            progressText.textContent =
                                `${formatBytes(currentTotal)} recibidos`;


                            progressPercent.textContent =
                                `${percent.toFixed(1)}%`;

                        }
                    );


                    /*
                     * DATOS
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
                     * ERROR
                     */

                    stream.on(
                        "error",
                        error => {

                            if (
                                ended
                            ) {

                                return;
                            }


                            ended =
                                true;


                            reject(
                                error
                            );

                        }
                    );


                    /*
                     * FIN DEL BLOQUE
                     */

                    stream.on(
                        "end",
                        () => {

                            if (
                                ended
                            ) {

                                return;
                            }


                            ended =
                                true;


                            resolve();

                        }
                    );

                } else {

                    reject(
                        new Error(
                            "El stream no expone el método on()."
                        )
                    );

                }

            }
        );


        /*
         * Validamos cuánto recibimos.
         */

        log(
            `Bloque ${blockNumber}: recibidos ${formatBytes(received)}`,
            "info"
        );


        /*
         * Permitimos una pequeña diferencia
         * para investigar posteriormente si
         * MEGAJS interpreta end como inclusivo.
         *
         * No damos por correcto todavía un
         * tamaño diferente al esperado.
         */

        if (
            received === expectedBytes
        ) {

            log(
                `✓ Bloque ${blockNumber} correcto.`,
                "success"
            );


            successfulBlocks++;

        } else {

            log(
                `⚠ Bloque ${blockNumber}: esperado ${formatBytes(expectedBytes)}, recibido ${formatBytes(received)}.`,
                "error"
            );


            failedBlocks++;

        }


        totalReceived +=
            received;

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
