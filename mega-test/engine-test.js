const MEGA_URLS = {
  video1: 'https://mega.nz/file/i4o11BTQ#-aSeSbRBjG878N5r5Q5te9SSvW-B19tjw5cfexOAdlQ',
  video2: 'https://mega.nz/file/2xIwkY6K#4Oe8Vuomh0NfMjjPKOFQIT0nEXnaA9ZcQGBLou5yj-E'
};

const MEGAJS_URL = 'https://unpkg.com/megajs/dist/main.browser-es.mjs';
const MP4BOX_URL = 'https://cdn.jsdelivr.net/npm/mp4box@2.4.1/dist/mp4box.all.mjs';
const INITIAL_RANGE = 16 * 1024 * 1024;
const MEDIA_RANGE = 8 * 1024 * 1024;
const MAX_BOOTSTRAP = 64 * 1024 * 1024;
const SEGMENT_SAMPLES = 60;

const $ = id => document.getElementById(id);
let megaFile = null;
let MP4BoxAPI = null;
let mediaSource = null;
let vidstackPlayer = null;
let mp4box = null;
let activeRun = 0;
let nextDownloadOffset = 0;
let downloadedBytes = 0;
let totalRanges = 0;
let sourceBuffers = new Map();
let sourceQueues = new Map();
let metadataReady = false;

function log(id, text) {
  const el = $(id);
  if (!el) return;
  el.textContent = `[${new Date().toLocaleTimeString()}] ${text}\n${el.textContent}`.slice(0, 18000);
}

function selectedUrl() { return MEGA_URLS[$('mega-source').value]; }
function selectedName() { return $('mega-source').value === 'video1' ? 'Vídeo MEGA 1' : 'Vídeo MEGA 2'; }
function setStatus(text) { $('mega-status').textContent = text; }
function updateSourceLabel() { $('source-label').textContent = selectedUrl(); }
function setState(text) { $('vidstack-state').textContent = text; }

function updateMetrics() {
  $('downloaded').textContent = `${(downloadedBytes / 1024 / 1024).toFixed(1)} MB`;
  $('ranges').textContent = String(totalRanges);
  try {
    const video = vidstackPlayer?.querySelector('video');
    if (video?.buffered?.length) {
      const end = video.buffered.end(video.buffered.length - 1);
      $('buffered').textContent = `${Math.max(0, end - video.currentTime).toFixed(1)} s`;
    }
  } catch {}
}

function toArrayBuffer(chunk) {
  if (chunk instanceof ArrayBuffer) return chunk;
  if (ArrayBuffer.isView(chunk)) return chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);
  return new Uint8Array(chunk).buffer;
}

function mimeForTrack(track) {
  const codec = track.codec || '';
  const kind = track.type === 'audio' || track.audio ? 'audio' : 'video';
  return `${kind}/mp4; codecs="${codec}"`;
}

function appendToSourceBuffer(trackId, buffer) {
  const sb = sourceBuffers.get(trackId);
  if (!sb) {
    sourceQueues.set(trackId, [...(sourceQueues.get(trackId) || []), buffer]);
    return;
  }
  const queue = sourceQueues.get(trackId) || [];
  queue.push(buffer);
  sourceQueues.set(trackId, queue);
  flushSourceBuffer(trackId);
}

function flushSourceBuffer(trackId) {
  const sb = sourceBuffers.get(trackId);
  const queue = sourceQueues.get(trackId) || [];
  if (!sb || sb.updating || !queue.length || mediaSource?.readyState !== 'open') return;
  const next = queue.shift();
  sourceQueues.set(trackId, queue);
  try { sb.appendBuffer(next); }
  catch (error) {
    queue.unshift(next);
    sourceQueues.set(trackId, queue);
    log('vidstack-log', `SourceBuffer ${trackId}: ${error.message || error}`);
  }
}

function createSourceBufferForTrack(track) {
  if (sourceBuffers.has(track.id)) return sourceBuffers.get(track.id);
  const mime = mimeForTrack(track);
  if (!MediaSource.isTypeSupported(mime)) throw new Error(`Codec no soportado por MSE: ${mime}`);
  const sb = mediaSource.addSourceBuffer(mime);
  sb.mode = 'segments';
  sb.addEventListener('updateend', () => flushSourceBuffer(track.id));
  sb.addEventListener('error', () => log('vidstack-log', `SourceBuffer error en track ${track.id}.`));
  sourceBuffers.set(track.id, sb);
  sourceQueues.set(track.id, []);
  log('vidstack-log', `SourceBuffer: ${mime}`);
  return sb;
}

function configureMP4Box(info, token) {
  if (token !== activeRun) return;
  const tracks = [...(info.videoTracks || []), ...(info.audioTracks || [])];
  if (!tracks.length) throw new Error('MP4Box no encontró pistas de audio/vídeo.');

  const duration = Number(info.duration || 0) / Number(info.timescale || 1);
  $('duration').textContent = `${duration.toFixed(1)} s`;
  log('vidstack-log', `MP4Box encontró ${tracks.length} pista(s), duración ${duration.toFixed(1)} s.`);

  tracks.forEach(track => {
    createSourceBufferForTrack(track);
    mp4box.setSegmentOptions(track.id, null, { nbSamples: SEGMENT_SAMPLES, rapAlignment: true });
  });

  const initSegments = mp4box.initializeSegmentation();
  for (const init of initSegments || []) appendToSourceBuffer(init.track_id, toArrayBuffer(init.buffer));

  metadataReady = true;
  log('vidstack-log', `Init segments preparados: ${(initSegments || []).length}.`);
  mp4box.start();
}

async function downloadRange(file, start, end, token) {
  if (token !== activeRun) throw new Error('Prueba cancelada.');
  const expected = end - start;
  const stream = file.download({ start, end });
  let received = 0;
  return new Promise((resolve, reject) => {
    stream.on('data', chunk => {
      if (token !== activeRun) return;
      const ab = toArrayBuffer(chunk);
      const fileStart = start + received;
      received += ab.byteLength;
      downloadedBytes += ab.byteLength;
      ab.fileStart = fileStart;
      try { mp4box.appendBuffer(ab); }
      catch (error) { reject(error); }
      updateMetrics();
    });
    stream.on('error', reject);
    stream.on('end', () => {
      if (received !== expected) log('vidstack-log', `Aviso: esperado ${expected} B, recibido ${received} B.`);
      resolve(received);
    });
  });
}

async function bootstrapMP4(file, token) {
  let offset = 0;
  let rangeSize = INITIAL_RANGE;
  while (!metadataReady && offset < MAX_BOOTSTRAP) {
    const end = Math.min(Number(file.size), offset + rangeSize);
    totalRanges++;
    log('vidstack-log', `Leyendo rango ${offset}-${end - 1} (${((end - offset) / 1024 / 1024).toFixed(1)} MB)…`);
    await downloadRange(file, offset, end, token);
    offset = end;
    nextDownloadOffset = offset;
    if (!metadataReady) rangeSize = Math.min(32 * 1024 * 1024, rangeSize * 2);
  }

  if (!metadataReady) {
    const size = Number(file.size || 0);
    const tailStart = Math.max(0, size - 16 * 1024 * 1024);
    log('vidstack-log', `Estructura no encontrada al inicio. Leyendo cola ${tailStart}-${size - 1}…`);
    totalRanges++;
    await downloadRange(file, tailStart, size, token);
  }
  if (!metadataReady) throw new Error('MP4Box no encontró la estructura MP4 en los rangos iniciales.');
}

async function continueStreaming(file, token) {
  let offset = nextDownloadOffset;
  const size = Number(file.size || 0);
  while (token === activeRun && offset < size) {
    const end = Math.min(size, offset + MEDIA_RANGE);
    totalRanges++;
    await downloadRange(file, offset, end, token);
    offset = end;
    nextDownloadOffset = offset;
  }
}

async function openMegaAttributes() {
  setStatus('Abriendo MEGAJS y leyendo atributos…');
  const { File } = await import(MEGAJS_URL);
  megaFile = File.fromURL(selectedUrl());
  await megaFile.loadAttributes();
  const gb = (Number(megaFile.size || 0) / 1024 ** 3).toFixed(2);
  setStatus(`MEGA OK · ${megaFile.name || selectedName()} · ${gb} GB · streaming por rangos.`);
  return megaFile;
}

async function loadLibraries() {
  if (!MP4BoxAPI) {
    const module = await import(MP4BOX_URL);
    MP4BoxAPI = module.default || module;
  }
  if (!MP4BoxAPI?.createFile) throw new Error('MP4Box.js no pudo inicializarse.');
}

async function runVidstack() {
  const token = ++activeRun;
  await stopVidstack(false);
  activeRun = token;
  setState('INICIANDO');
  downloadedBytes = 0;
  totalRanges = 0;
  nextDownloadOffset = 0;
  sourceBuffers = new Map();
  sourceQueues = new Map();
  metadataReady = false;
  log('vidstack-log', `Fuente: ${selectedName()}`);

  try {
    await customElements.whenDefined('media-player');
    vidstackPlayer = $('vidstack-player');
    const file = await openMegaAttributes();
    await loadLibraries();
    if (!window.MediaSource) throw new Error('Este navegador no expone MediaSource.');

    mediaSource = new MediaSource();
    mediaSource.addEventListener('sourceopen', () => log('vidstack-log', 'MediaSource: sourceopen.'), { once: true });
    vidstackPlayer.src = { src: mediaSource, type: 'video/object' };

    mp4box = MP4BoxAPI.createFile();
    mp4box.onError = error => log('vidstack-log', `MP4Box ERROR: ${error}`);
    mp4box.onReady = info => {
      try {
        configureMP4Box(info, token);
        setState('MSE LISTO');
        setStatus('Vidstack conectado al MediaSource. Pulsa PLAY.');
      } catch (error) {
        setState('ERROR');
        log('vidstack-log', `Configuración MP4Box: ${error.message || error}`);
      }
    };
    mp4box.onSegment = (id, user, buffer) => {
      if (token !== activeRun) return;
      appendToSourceBuffer(id, toArrayBuffer(buffer));
      updateMetrics();
    };

    const video = vidstackPlayer.querySelector('video');
    if (video) {
      video.addEventListener('loadedmetadata', () => {
        $('duration').textContent = `${video.duration.toFixed(1)} s`;
        log('vidstack-log', `HTML5 metadata: ${video.duration.toFixed(1)} s.`);
      }, { once: true });
      video.addEventListener('playing', () => log('vidstack-log', `▶ Reproduciendo en ${video.currentTime.toFixed(1)} s.`));
      video.addEventListener('waiting', () => log('vidstack-log', `Buffering en ${video.currentTime.toFixed(1)} s…`));
      video.addEventListener('progress', updateMetrics);
      video.addEventListener('error', () => log('vidstack-log', `HTML5 error: ${video.error?.code || 'desconocido'}`));
    }

    await bootstrapMP4(file, token);
    log('vidstack-log', `Bootstrap listo: ${(downloadedBytes / 1024 / 1024).toFixed(1)} MB descargados.`);
    setState('CARGANDO RANGOS');
    continueStreaming(file, token).catch(error => {
      if (token === activeRun) log('vidstack-log', `Streaming detenido/error: ${error.message || error}`);
    });
  } catch (error) {
    setState('ERROR');
    setStatus(`ERROR · ${error?.message || error}`);
    log('vidstack-log', `ERROR: ${error?.stack || error}`);
  }
}

async function stopVidstack(clearLog = true) {
  activeRun++;
  try { mp4box?.stop?.(); } catch {}
  mp4box = null;
  sourceBuffers.clear();
  sourceQueues.clear();
  if (vidstackPlayer) { try { vidstackPlayer.src = ''; } catch {} }
  if (mediaSource?.readyState === 'open') { try { mediaSource.endOfStream(); } catch {} }
  mediaSource = null;
  megaFile = null;
  if (clearLog) log('vidstack-log', 'Motor detenido.');
  setState('DETENIDO');
}

async function probeMegaRange() {
  try {
    const file = await openMegaAttributes();
    const end = Math.min(Number(file.size), 4 * 1024 * 1024);
    log('vidstack-log', `Prueba independiente: rango 0-${end - 1}…`);
    let bytes = 0;
    const stream = file.download({ start: 0, end });
    await new Promise((resolve, reject) => {
      stream.on('data', chunk => bytes += toArrayBuffer(chunk).byteLength);
      stream.on('error', reject);
      stream.on('end', resolve);
    });
    setStatus(`MEGA + RANGO OK · ${file.name} · ${(Number(file.size) / 1024 ** 3).toFixed(2)} GB · recibidos ${(bytes / 1024 / 1024).toFixed(1)} MB.`);
    log('vidstack-log', `Rango independiente recibido: ${(bytes / 1024 / 1024).toFixed(1)} MB.`);
  } catch (error) {
    setStatus(`MEGA ERROR · ${error?.message || error}`);
    log('vidstack-log', `MEGA ERROR: ${error?.message || error}`);
  }
}

async function runShaka() {
  $('shaka-state').textContent = 'ANALIZANDO';
  log('shaka-log', `Fuente: ${selectedName()}`);
  try {
    const file = await openMegaAttributes();
    log('shaka-log', `Archivo MEGA: ${(Number(file.size || 0) / 1024 ** 3).toFixed(2)} GB.`);
    log('shaka-log', 'Shaka no acepta directamente mega.nz/file como manifest DASH/HLS.');
    log('shaka-log', 'Se mantiene como segundo candidato para un adaptador segmentado.');
    $('shaka-state').textContent = 'ADAPTADOR PENDIENTE';
  } catch (error) {
    $('shaka-state').textContent = 'ERROR';
    log('shaka-log', `ERROR: ${error?.message || error}`);
  }
}

$('mega-source').addEventListener('change', async () => {
  await stopVidstack(false);
  updateSourceLabel();
  setStatus('Vídeo cambiado. Ejecuta nuevamente el motor.');
});
$('probe-mega').addEventListener('click', probeMegaRange);
$('run-vidstack').addEventListener('click', runVidstack);
$('stop-vidstack').addEventListener('click', () => stopVidstack(true));
$('run-shaka').addEventListener('click', runShaka);
updateSourceLabel();
log('vidstack-log', 'Laboratorio listo: Motor C1 real preparado.');
log('shaka-log', 'Shaka queda como segundo candidato.');
