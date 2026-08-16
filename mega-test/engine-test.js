const MEGA_URLS = {
  video1: 'https://mega.nz/file/i4o11BTQ#-aSeSbRBjG878N5r5Q5te9SSvW-B19tjw5cfexOAdlQ',
  video2: 'https://mega.nz/file/2xIwkY6K#4Oe8Vuomh0NfMjjPKOFQIT0nEXnaA9ZcQGBLou5yj-E'
};

const $ = id => document.getElementById(id);
let megaFile = null;
let shakaPlayer = null;
let activeVideo = null;

function log(id, text) {
  const el = $(id);
  if (!el) return;
  el.textContent = `[${new Date().toLocaleTimeString()}] ${text}\n${el.textContent}`.slice(0, 14000);
}

function selectedUrl() {
  return MEGA_URLS[$('mega-source').value];
}

function selectedName() {
  return $('mega-source').value === 'video1' ? 'Vídeo MEGA 1' : 'Vídeo MEGA 2';
}

function setStatus(text) {
  $('mega-status').textContent = text;
}

function updateSourceLabel() {
  $('source-label').textContent = selectedUrl();
}

async function openMegaAttributes() {
  setStatus('Abriendo MEGAJS y leyendo atributos…');
  try {
    const { File } = await import('https://unpkg.com/megajs/dist/main.browser-es.mjs');
    megaFile = File.fromURL(selectedUrl());
    await megaFile.loadAttributes();
    const gb = (Number(megaFile.size || 0) / 1024 ** 3).toFixed(2);
    setStatus(`MEGA OK · ${megaFile.name || selectedName()} · ${gb} GB · todavía no se ha descargado el archivo.`);
    return megaFile;
  } catch (error) {
    setStatus(`MEGA ERROR · ${error?.message || error}`);
    throw error;
  }
}

/*
 * Este adaptador es deliberadamente conservador: no intenta convertir un
 * enlace MEGA en un MP4 completo. Primero obtiene metadatos y demuestra que
 * MEGAJS permite solicitar rangos. El siguiente paso será conectar esos
 * rangos a MP4Box/MSE, reutilizando la lógica que ya funciona en producción.
 */
async function probeMegaRange(file) {
  const size = Number(file.size || 0);
  const end = Math.min(size, 4 * 1024 * 1024);
  log('vidstack-log', `Solicitando rango experimental 0-${end - 1} (${(end / 1024 / 1024).toFixed(1)} MB)…`);
  const stream = file.download({ start: 0, end });
  let bytes = 0;
  return new Promise((resolve, reject) => {
    stream.on('data', chunk => {
      bytes += chunk.byteLength || chunk.length || 0;
      if (bytes >= end) log('vidstack-log', `Rango recibido: ${(bytes / 1024 / 1024).toFixed(1)} MB.`);
    });
    stream.on('error', reject);
    stream.on('end', () => resolve(bytes));
  });
}

async function runVidstack() {
  $('vidstack-state').textContent = 'ANALIZANDO MEGA';
  log('vidstack-log', `Fuente: ${selectedName()}`);
  try {
    const file = await openMegaAttributes();
    await probeMegaRange(file);
    $('vidstack-state').textContent = 'MEGA + RANGO OK';
    log('vidstack-log', 'MEGAJS puede abrir el archivo y entregar un rango sin descargarlo completo.');
    log('vidstack-log', 'Siguiente fase necesaria: MEGAJS → MP4Box → MSE → <video> de Vidstack.');
  } catch (error) {
    $('vidstack-state').textContent = 'ERROR';
    log('vidstack-log', `ERROR: ${error?.message || error}`);
  }
}

async function runShaka() {
  $('shaka-state').textContent = 'ANALIZANDO MEGA';
  log('shaka-log', `Fuente: ${selectedName()}`);
  try {
    const file = await openMegaAttributes();
    const size = Number(file.size || 0);
    log('shaka-log', `Archivo MEGA: ${(size / 1024 ** 3).toFixed(2)} GB.`);
    log('shaka-log', 'Shaka no acepta directamente mega.nz/file como manifest DASH/HLS.');
    log('shaka-log', 'Se necesita un adaptador de manifest/red o una representación segmentada compatible con Shaka.');
    $('shaka-state').textContent = 'ADAPTADOR PENDIENTE';
  } catch (error) {
    $('shaka-state').textContent = 'ERROR';
    log('shaka-log', `ERROR: ${error?.message || error}`);
  }
}

$('mega-source').addEventListener('change', () => {
  updateSourceLabel();
  setStatus('Vídeo cambiado. Ejecuta nuevamente el motor que quieras probar.');
});
$('run-vidstack').addEventListener('click', runVidstack);
$('run-shaka').addEventListener('click', runShaka);

updateSourceLabel();
log('vidstack-log', 'Laboratorio listo.');
log('shaka-log', 'Laboratorio listo.');
