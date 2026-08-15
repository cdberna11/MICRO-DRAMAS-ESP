"use strict";

/*
 * MICRO-DRAMAS-ESP — GUARDIA DE OFFSET SEEK
 *
 * Corrige únicamente un caso anómalo detectado en MP4Box:
 * para un destino temprano del vídeo puede devolver un offset
 * de archivo desproporcionadamente lejano (por ejemplo 5.15 GB
 * para 05:30 de un vídeo de 01:18:54). Eso provoca que el SEEK
 * intente descargar casi todo el archivo restante.
 *
 * No modifica el streaming normal. Solo compara el offset que
 * devuelve MP4Box con una estimación proporcional y, cuando la
 * diferencia es claramente absurda, prueba la variante de SEEK
 * sin RAP y utiliza el resultado más razonable.
 */
(function instalarGuardiaOffsetSeek() {
    const MAX_DESVIACION = 4;
    const LIMITE_DIFERENCIA = 128 * 1024 * 1024;
    let envolviendo = false;

    function esOffsetRazonable(offset, tiempo) {
        const fileSize = Number(playerState?.fileSize || 0);
        const duration = Number(obtenerDuracionVideo?.() || 0);

        if (!Number.isFinite(offset) || offset < 0 || offset >= fileSize) {
            return false;
        }

        if (!Number.isFinite(duration) || duration <= 0 || fileSize <= 0) {
            return true;
        }

        const proporcionTiempo = Math.max(0, Math.min(1, Number(tiempo) / duration));
        const estimado = fileSize * proporcionTiempo;
        const diferencia = Math.abs(offset - estimado);

        if (diferencia <= LIMITE_DIFERENCIA) {
            return true;
        }

        if (estimado <= 0) {
            return offset <= LIMITE_DIFERENCIA;
        }

        return offset <= estimado * MAX_DESVIACION && offset >= estimado / MAX_DESVIACION;
    }

    function instalarEnMP4Box() {
        if (envolviendo || typeof crearNuevoMP4Box !== "function") {
            return;
        }

        const originalCrear = crearNuevoMP4Box;

        window.crearNuevoMP4Box = function crearNuevoMP4BoxConGuardia(...args) {
            const resultado = originalCrear.apply(this, args);
            const mp4box = playerState?.mp4box;

            if (!mp4box || mp4box.__seekOffsetGuardInstalled) {
                return resultado;
            }

            const seekOriginal = mp4box.seek.bind(mp4box);

            mp4box.seek = function seekConGuardia(tiempo, useRap) {
                const principal = seekOriginal(tiempo, useRap);
                const offsetPrincipal = obtenerOffsetSeek(principal);

                if (esOffsetRazonable(offsetPrincipal, tiempo)) {
                    return principal;
                }

                console.warn(
                    "[SEEK-GUARD] Offset MP4Box desproporcionado:",
                    offsetPrincipal,
                    "para",
                    tiempo,
                    "s. Probando SEEK alternativo."
                );

                let alternativo = null;
                let offsetAlternativo = NaN;

                try {
                    alternativo = seekOriginal(tiempo, false);
                    offsetAlternativo = obtenerOffsetSeek(alternativo);
                } catch (error) {
                    console.warn("[SEEK-GUARD] SEEK alternativo falló:", error);
                }

                if (Number.isFinite(offsetAlternativo) && esOffsetRazonable(offsetAlternativo, tiempo)) {
                    console.log(
                        "[SEEK-GUARD] ✓ Usando offset alternativo:",
                        offsetAlternativo
                    );
                    return alternativo;
                }

                /*
                 * Si ambas variantes son anómalas, no inventamos un
                 * offset. Conservamos el resultado de MP4Box para que
                 * la ruta existente pueda reportar el fallo de forma
                 * normal en lugar de descargar el archivo completo.
                 */
                console.warn(
                    "[SEEK-GUARD] No se encontró un offset alternativo confiable."
                );

                return principal;
            };

            mp4box.__seekOffsetGuardInstalled = true;
        };

        envolviendo = true;
        console.log("[SEEK-GUARD] ✓ Guardia de offset SEEK instalada.");
    }

    const intervalo = setInterval(() => {
        try {
            instalarEnMP4Box();
            if (envolviendo) {
                clearInterval(intervalo);
            }
        } catch (error) {
            console.warn("[SEEK-GUARD] Error instalando guardia:", error);
        }
    }, 100);

    setTimeout(() => clearInterval(intervalo), 15000);
})();
