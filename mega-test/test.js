const MEGAJS_URL = 'https://unpkg.com/megajs@1.3.10/dist/main.browser-es.mjs';

const VIDEOS = {
  video1: {
    title: 'Vídeo de prueba 1',
    url: 'https://mega.nz/file/i4o11BTQ#-aSeSbRBjG878N5r5Q5te9SSvW-B19tjw5cfexOAdlQ'
  },
  video2: {
    title: 'Vídeo de prueba 2',
    url: 'https://mega.nz/file/2xIwkY6K#4Oe8Vuomh0NfMjjPKOFQIT0nEXnaA9ZcQGBLou5yj-E'
  }
};

const $ = id => document.getElementById(id);
const select = $('video-select');
const mode = $('mode-select');
const video = $('video');
const frame = $('mega-frame');
const placeholder = $('video-placeholder');
const status = $('status');
const logBox = $('log');
const loading = $('loading');
const loadingTitle = $('loading-title');
const loadingDetail = $('loading-detail');
const downloadProgress = $('download-progress');
const title = $('video-title');
const meta = $('video-meta');
const cacheState = $('cache-state');
const currentTime = $('current-time');
const savedTime = $('saved-time');

let MEGAFile = window.mega?.File || null;
let currentFile = null;
let currentBlobUrl = null;
let loadToken = 0;

function log(...args) {
  const line = `[${new Date().toLocaleTimeString()}] ${args.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')}`;
  console.log(line);
  if (logBox) logBox.textContent = `${line}\n${logBox.textContent}`.slice(0, 16000);
}

function setStatus(text) {
  status.textContent = text;
  log(text);
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i ? 2 : 0)} ${units[i]}`;
}

function getDrama() { return VIDEOS[select.value]; }
function resumeKey(drama) { return `micro-dramas-mega-test-resume-v2:${drama.url}`; }

function getSavedPosition(drama) {
  const value = Number(localStorage.getItem(resumeKey(drama)) || 0);
  return Number.isFinite(value) && value > 3 ? value : 0;
}

function savePosition() {
  const drama = getDrama();
  if (!drama || mode.value !== 'native' || !video.src) return;
  const position = Number(video.currentTime);
  if (!Number.isFinite(position) || position < 0) return;
  localStorage.setItem(resumeKey(drama), String(position));
  savedTime.textContent = formatTime(position);
}

function clearPosition() {
  const drama = getDrama();
  if (!drama) return;
  localStorage.removeItem(resumeKey(drama));
  savedTime.textContent = 'No guardada';
  setStatus('Posición guardada eliminada.');
}

function showLoading(show, main = 'Preparando vídeo...', detail = '') {
  loading.classList.toggle('hidden', !show);
  loadingTitle.textContent = main;
  loadingDetail.textContent = detail;
}

function showNativeVideo() {
  placeholder.style.display = 'none';
  video.style.display = 'block';
  frame.style.display = 'none';
}

function showPlaceholder() {
  placeholder.style.display = 'flex';
  video.style.display = 'none';
  frame.style.display = 'none';
}

function destroyBlobUrl() {
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }
}

async function loadMegaLibrary() {
  if (MEGAFile?.fromURL) return MEGAFile;
  setStatus('Cargando MEGAJS…');
  const module = await import(MEGAJS_URL);
  MEGAFile = module.File || module.default?.File || module.default;
  if (!MEGAFile?.fromURL) throw new Error('No se pudo inicializar MEGAJS.');
  return MEGAFile;
}

async function loadNative(drama, token) {
  destroyBlobUrl();
  showNativeVideo();
  frame.src = 'about:blank';
  video.removeAttribute('src');
  video.load();
  cacheState.textContent = 'CARGANDO';
  showLoading(true, 'Conectando con MEGA…', 'Obteniendo información del archivo.');

  const File = await loadMegaLibrary();
  if (token !== loadToken) return;

  currentFile = File.fromURL(drama.url);
  await currentFile.loadAttributes();
  if (token !== loadToken) return;

  const total = Number(currentFile.size || 0);
  meta.textContent = `${currentFile.name || drama.title} · ${formatBytes(total)}`;
  log(`MEGA metadata OK: ${currentFile.name || drama.title} / ${formatBytes(total)}`);

  showLoading(true, 'Descargando vídeo desde MEGA…', `0% · 0 B / ${formatBytes(total)}`);
  cacheState.textContent = '0%';

  const stream = currentFile.download({ maxConnections: 4 });
  stream.on('progress', info => {
    if (token !== loadToken) return;
    const loaded = Number(info.bytesLoaded || 0);
    const bytesTotal = Number(info.bytesTotal || total || 0);
    const pct = bytesTotal ? Math.min(100, loaded / bytesTotal * 100) : 0;
    downloadProgress.value = pct;
    loadingDetail.textContent = `${pct.toFixed(1)}% · ${formatBytes(loaded)} / ${formatBytes(bytesTotal)}`;
    cacheState.textContent = `${pct.toFixed(0)}%`;
  });

  const chunks = [];
  stream.on('data', chunk => {
    if (token === loadToken) chunks.push(chunk);
  });

  const data = await new Promise((resolve, reject) => {
    stream.on('error', reject);
    stream.on('end', () => resolve(chunks));
  });

  if (token !== loadToken) return;

  const parts = data.map(chunk => chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
  const blob = new Blob(parts, { type: 'video/mp4' });
  currentBlobUrl = URL.createObjectURL(blob);
  video.src = currentBlobUrl;
  video.load();
  cacheState.textContent = `LISTO · ${formatBytes(blob.size)}`;
  showLoading(false);
  setStatus('Motor A listo. Ahora puedes probar SEEK con la barra nativa.');
}

function loadMegaPlayer(drama) {
  destroyBlobUrl();
  video.pause();
  video.removeAttribute('src');
  video.load();
  placeholder.style.display = 'none';
  video.style.display = 'none';
  frame.style.display = 'block';
  frame.src = drama.url.replace('https://mega.nz/file/', 'https://mega.nz/embed/');
  cacheState.textContent = 'MEGA PLAYER';
  meta.textContent = 'Reproductor oficial de MEGA';
  showLoading(false);
  setStatus('Motor B cargado. Usa su barra de progreso para comparar el SEEK.');
}

async function openVideo() {
  const drama = getDrama();
  const token = ++loadToken;
  title.textContent = drama.title;
  savedTime.textContent = getSavedPosition(drama) ? formatTime(getSavedPosition(drama)) : 'No guardada';
  meta.textContent = 'Preparando…';
  try {
    if (mode.value === 'mega') loadMegaPlayer(drama);
    else await loadNative(drama, token);
  } catch (error) {
    console.error(error);
    cacheState.textContent = 'ERROR';
    showLoading(false);
    setStatus(`ERROR: ${error?.message || error}`);
  }
}

function closeVideo() {
  ++loadToken;
  savePosition();
  video.pause();
  video.removeAttribute('src');
  video.load();
  frame.src = 'about:blank';
  destroyBlobUrl();
  currentFile = null;
  cacheState.textContent = 'CERRADO';
  meta.textContent = 'Selecciona un vídeo para comenzar';
  currentTime.textContent = '0:00 / 0:00';
  showLoading(false);
  showPlaceholder();
  setStatus('Reproductor cerrado.');
}

function updateTime() {
  if (mode.value !== 'native' || !Number.isFinite(video.duration)) return;
  currentTime.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
}

function quickSeek(delta) {
  if (mode.value !== 'native' || !video.src || !Number.isFinite(video.duration)) {
    setStatus('Primero carga el vídeo con Motor A.');
    return;
  }
  const target = Math.max(0, Math.min(video.duration - 0.05, video.currentTime + delta));
  log(`SEEK rápido → ${formatTime(target)}`);
  video.currentTime = target;
  updateTime();
}

$('btn-open').addEventListener('click', openVideo);
$('btn-stop').addEventListener('click', closeVideo);
$('btn-clear-resume').addEventListener('click', clearPosition);
select.addEventListener('change', () => {
  const drama = getDrama();
  savedTime.textContent = getSavedPosition(drama) ? formatTime(getSavedPosition(drama)) : 'No guardada';
});
mode.addEventListener('change', () => setStatus(`Método seleccionado: ${mode.options[mode.selectedIndex].text}`));
document.querySelectorAll('[data-seek]').forEach(button => button.addEventListener('click', () => quickSeek(Number(button.dataset.seek))));

video.addEventListener('loadedmetadata', () => {
  const drama = getDrama();
  const saved = getSavedPosition(drama);
  savedTime.textContent = saved ? formatTime(saved) : 'No guardada';
  updateTime();
  if (saved > 0 && saved < video.duration - 1) {
    video.currentTime = saved;
    setStatus(`Reanudación preparada en ${formatTime(saved)}.`);
  }
});
video.addEventListener('timeupdate', () => { updateTime(); });
video.addEventListener('pause', savePosition);
video.addEventListener('ended', () => { savePosition(); setStatus('Vídeo terminado.'); });
video.addEventListener('error', () => {
  const error = video.error;
  if (error) log(`HTML5 video error: code=${error?.code || 'desconocido'}`);
});
window.addEventListener('beforeunload', savePosition);

showPlaceholder();
log(`MEGAJS global: ${MEGAFile?.fromURL ? 'OK' : 'NO DISPONIBLE'}`);
setStatus('PASO 1: selecciona el vídeo y pulsa «CARGAR VÍDEO».');
