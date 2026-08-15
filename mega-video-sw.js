/* MICRO-DRAMAS-ESP — MEGA native HTTP Range bridge */
importScripts('https://unpkg.com/megajs@1.3.10/dist/main.browser-umd.js');

const VERSION = 'mega-range-v1';
const MAX_OPEN_RANGE = 16 * 1024 * 1024;
const files = new Map();

self.addEventListener('install', event => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim());
});

function validMegaUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && (
            url.hostname === 'mega.nz' ||
            url.hostname === 'mega.co.nz' ||
            url.hostname.endsWith('.mega.nz') ||
            url.hostname.endsWith('.mega.co.nz')
        );
    } catch {
        return false;
    }
}

async function getFile(url) {
    let file = files.get(url);
    if (file) return file;

    if (!self.mega || !self.mega.File) {
        throw new Error('MEGAJS no está disponible en el Service Worker.');
    }

    file = self.mega.File.fromURL(url);
    await file.loadAttributes();
    files.set(url, file);
    return file;
}

function parseRange(header, size) {
    if (!header) {
        return { start: 0, end: size - 1, partial: false };
    }

    const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
    if (!match) return null;

    let start;
    let end;

    if (match[1] === '') {
        const suffix = Number(match[2]);
        if (!Number.isFinite(suffix) || suffix <= 0) return null;
        start = Math.max(0, size - suffix);
        end = size - 1;
    } else {
        start = Number(match[1]);
        if (!Number.isFinite(start) || start < 0 || start >= size) return null;
        end = match[2] === ''
            ? Math.min(size - 1, start + MAX_OPEN_RANGE - 1)
            : Number(match[2]);
        if (!Number.isFinite(end) || end < start) return null;
        end = Math.min(end, size - 1);
    }

    return { start, end, partial: true };
}

function asUint8Array(chunk) {
    if (chunk instanceof Uint8Array) return chunk;
    if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk);
    if (chunk && chunk.buffer) {
        return new Uint8Array(
            chunk.buffer,
            chunk.byteOffset || 0,
            chunk.byteLength
        );
    }
    return null;
}

function streamFromMega(stream) {
    return new ReadableStream({
        start(controller) {
            let closed = false;

            stream.on('data', chunk => {
                if (closed) return;
                const bytes = asUint8Array(chunk);
                if (bytes) controller.enqueue(bytes.slice());
            });

            stream.on('end', () => {
                if (closed) return;
                closed = true;
                controller.close();
            });

            stream.on('error', error => {
                if (closed) return;
                closed = true;
                controller.error(error);
            });
        },
        cancel() {
            try {
                stream.destroy?.();
                stream.emit?.('close');
            } catch {}
        }
    });
}

async function handleMedia(request) {
    const requestUrl = new URL(request.url);
    const megaUrl = requestUrl.searchParams.get('url');

    if (!megaUrl || !validMegaUrl(megaUrl)) {
        return new Response('MEGA URL inválida.', { status: 400 });
    }

    const file = await getFile(megaUrl);
    const size = Number(file.size || 0);

    if (!size) {
        throw new Error('MEGA no devolvió el tamaño del archivo.');
    }

    const range = parseRange(
        request.headers.get('range'),
        size
    );

    if (!range) {
        return new Response(null, {
            status: 416,
            headers: {
                'Content-Range': `bytes */${size}`,
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'no-store'
            }
        });
    }

    const length = range.end - range.start + 1;

    const megaStream = file.download({
        start: range.start,
        end: range.end,
        maxConnections: 4,
        initialChunkSize: 256 * 1024,
        chunkSizeIncrement: 256 * 1024,
        maxChunkSize: 1024 * 1024,
        forceHttps: true
    });

    const headers = new Headers({
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Content-Length': String(length),
        'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
        'Access-Control-Allow-Origin': '*',
        'X-MEGA-Stream': VERSION
    });

    return new Response(
        streamFromMega(megaStream),
        {
            status: range.partial ? 206 : 200,
            headers
        }
    );
}

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    if (url.pathname !== '/api/mega-video') {
        return;
    }

    if (event.request.method !== 'GET') {
        event.respondWith(
            new Response('Method Not Allowed', { status: 405 })
        );
        return;
    }

    event.respondWith(
        handleMedia(event.request).catch(error => {
            console.error('[MEGA SW]', error);

            return new Response(
                `Error de streaming MEGA: ${error?.message || error}`,
                {
                    status: 502,
                    headers: {
                        'Content-Type': 'text/plain; charset=utf-8',
                        'Cache-Control': 'no-store'
                    }
                }
            );
        })
    );
});
