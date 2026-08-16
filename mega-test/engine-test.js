const MEGA_URLS = {
  video1: 'https://mega.nz/file/i4o11BTQ#-aSeSbRBjG878N5r5Q5te9SSvW-B19tjw5cfexOAdlQ',
  video2: 'https://mega.nz/file/2xIwkY6K#4Oe8Vuomh0NfMjjPKOFQIT0nEXnaA9ZcQGBLou5yj-E'
};

const VIDSTACK_TEST_MP4 = 'https://files.vidstack.io/sprite-fight/720p.mp4';
const SHAKA_TEST_MPD = 'https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd';

const $ = id => document.getElementById(id);
const megaStatus = $('mega-status');
const megaSource = $('mega-source');

function write(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function appendLog(id, text) {
  const el = $(id);
  if (!el) return;
  el.textContent = `[${new Date().toLocaleTimeString()}] ${text}\n${el.textContent}`.slice(0, 10000);
}

async function probeMega() {
  const url = MEGA_URLS[megaSource.value];
  megaStatus.textContent = 'Abriendo MEGAJS y leyendo atributos…';
  try {
    const { File } = await import('https://unpkg.com/megajs/dist/main.browser-es.mjs');
    const file = File.fromURL(url);
    await file.loadAttributes();
    megaStatus.textContent = `OK · ${file.name || 'archivo'} · ${(Number(file.size || 0) / 1024 / 1024 / 1024).toFixed(2)} GB · sin descargar el archivo completo.`;
  } catch (error) {
    megaStatus.textContent = `ERROR MEGAJS: ${error?.message || error}`;
  }
}

async function runVidstack() {
  const state = $('vidstack-state');
  state.textContent = 'CARGANDO';
  appendLog('vidstack-log', 'Cargando fuente MP4 de referencia…');
  try {
    const player = $('vidstack-player');
    player.src = { src: VIDSTACK_TEST_MP4, type: 'video/mp4' };
    await customElements.whenDefined('media-player');
    player.addEventListener('media-loaded-metadata', () => appendLog('vidstack-log', `metadata: duración ${player.state.duration.toFixed(2)} s`), { once: true });
    player.addEventListener('media-error', event => appendLog('vidstack-log', `error: ${event.detail?.message || 'desconocido'}`));
    player.addEventListener('media-can-play', () => appendLog('vidstack-log', 'can-play recibido. Prueba PLAY y SEEK.'));
    state.textContent = 'LISTO';
    appendLog('vidstack-log', 'Vidstack inicializado. El SEEK se puede probar con su barra nativa/layout.');
  } catch (error) {
    state.textContent = 'ERROR';
    appendLog('vidstack-log', `ERROR: ${error?.message || error}`);
  }
}

let shakaPlayer = null;

async function runShaka() {
  const state = $('shaka-state');
  state.textContent = 'CARGANDO';
  appendLog('shaka-log', 'Inicializando Shaka Player…');
  try {
    shaka.polyfill.installAll();
    if (!shaka.Player.isBrowserSupported()) throw new Error('El navegador no soporta las APIs requeridas por Shaka.');
    const video = $('shaka-video');
    if (shakaPlayer) await shakaPlayer.destroy();
    shakaPlayer = new shaka.Player(video);
    shakaPlayer.addEventListener('error', event => {
      const detail = event.detail || {};
      appendLog('shaka-log', `ERROR ${detail.code || ''}: ${detail.message || 'Shaka error'}`);
    });
    await shakaPlayer.load(SHAKA_TEST_MPD);
    state.textContent = 'LISTO';
    appendLog('shaka-log', 'DASH cargado correctamente. Prueba PLAY, SEEK adelante/atrás y buffering.');
  } catch (error) {
    state.textContent = 'ERROR';
    appendLog('shaka-log', `ERROR: ${error?.message || error}`);
  }
}

$('probe-mega').addEventListener('click', probeMega);
$('run-vidstack').addEventListener('click', runVidstack);
$('run-shaka').addEventListener('click', runShaka);

appendLog('vidstack-log', `Fuente de prueba: ${VIDSTACK_TEST_MP4}`);
appendLog('shaka-log', `Manifiesto de prueba: ${SHAKA_TEST_MPD}`);
