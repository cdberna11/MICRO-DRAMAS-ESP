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
            "https://mega.nz/file/ulBR1aaC#90sGdNoolQrZyf_1T9uTht2qB9Kjb7bQGV0ycxXSlg"
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
   PRUEBA DE LECTURA DE 1 MB
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
        "0 B / 1 MB";


    progressPercent.textContent =
        "0%";


    setStatus(
        "Solicitando datos...",
        "loading"
    );


    resultBox.className =
        "result-box";


    resultBox.textContent =
        "Solicitando una pequeña porción del archivo. No se descargará el vídeo completo.";


    log(
        "Iniciando prueba de lectura de 1 MB...",
        "info"
    );


    log(
        "La prueba utiliza start=0 y end=1 MB.",
        "info"
    );


    let totalReceived =
        0;


    let streamEnded =
        false;


    try {

        /*
         * Pedimos únicamente los primeros
         * 1 MB del archivo.
         *
         * Esto NO pretende todavía alimentar
         * el reproductor.
         *
         * Solo queremos comprobar que
         * MEGAJS puede entregar datos.
         */

        const stream =
            currentFile.download({

                start:
                    0,

                end:
                    TEST_SIZE

            });


        if (!stream) {

            throw new Error(
                "MEGAJS no devolvió un stream."
            );
        }


        log(
            "✓ Stream creado correctamente.",
            "success"
        );


        /*
         * Evento de progreso de MEGAJS.
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


                    const total =
                        Math.min(
                            Number(
                                info?.bytesTotal ||
                                TEST_SIZE
                            ),
                            TEST_SIZE
                        );


                    const percent =
                        Math.min(
                            100,
                            (
                                loaded /
                                total
                            ) *
                            100
                        );


                    progressBar.style.width =
                        `${percent}%`;


                    progressText.textContent =
                        `${formatBytes(loaded)} / ${formatBytes(total)}`;


                    progressPercent.textContent =
                        `${percent.toFixed(1)}%`;

                }
            );


            stream.on(
                "data",
                chunk => {

                    /*
                     * En la implementación de
                     * navegador el chunk puede ser
                     * un Buffer/Uint8Array.
                     */

                    if (chunk) {

                        if (
                            typeof chunk.length ===
                            "number"
                        ) {

                            totalReceived +=
                                chunk.length;

                        } else if (
                            chunk.byteLength
                        ) {

                            totalReceived +=
                                chunk.byteLength;
                        }

                    }


                    const percent =
                        Math.min(
                            100,
                            (
                                totalReceived /
                                TEST_SIZE
                            ) *
                            100
                        );


                    progressBar.style.width =
                        `${percent}%`;


                    progressText.textContent =
                        `${formatBytes(totalReceived)} / ${formatBytes(TEST_SIZE)}`;


                    progressPercent.textContent =
                        `${percent.toFixed(1)}%`;

                }
            );


            stream.on(
                "error",
                error => {

                    console.error(
                        error
                    );


                    if (
                        streamEnded
                    ) {

                        return;
                    }


                    streamEnded =
                        true;


                    setStatus(
                        "Error durante la lectura",
                        "error"
                    );


                    resultBox.className =
                        "result-box result-error";


                    resultBox.textContent =
                        `La conexión falló durante la lectura: ${getErrorMessage(error)}`;


                    log(
                        `✗ Error del stream: ${getErrorMessage(error)}`,
                        "error"
                    );


                    btnInfo.disabled =
                        false;


                    btnChunk.disabled =
                        false;

                }
            );


            stream.on(
                "end",
                () => {

                    if (
                        streamEnded
                    ) {

                        return;
                    }


                    streamEnded =
                        true;


                    progressBar.style.width =
                        "100%";


                    progressText.textContent =
                        `${formatBytes(totalReceived)} / ${formatBytes(TEST_SIZE)}`;


                    progressPercent.textContent =
                        "100%";


                    setStatus(
                        "Lectura completada",
                        "success"
                    );


                    resultBox.className =
                        "result-box result-success";


                    resultBox.textContent =
                        `✓ MEGAJS entregó ${formatBytes(totalReceived)} de datos correctamente.`;


                    log(
                        `✓ Lectura completada: ${formatBytes(totalReceived)}.`,
                        "success"
                    );


                    log(
                        "✓ El archivo puede ser leído mediante stream.",
                        "success"
                    );


                    log(
                        "Siguiente etapa: probar cómo alimentar el elemento <video>.",
                        "success"
                    );


                    btnInfo.disabled =
                        false;

                    btnChunk.disabled =
                        false;

                }
            );

        } else {

            throw new Error(
                "El stream no expone el método on()."
            );

        }


    } catch (error) {

        console.error(
            error
        );


        setStatus(
            "Error",
            "error"
        );


        resultBox.className =
            "result-box result-error";


        resultBox.textContent =
            `No se pudo iniciar la lectura: ${getErrorMessage(error)}`;


        log(
            `✗ Error: ${getErrorMessage(error)}`,
            "error"
        );


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
