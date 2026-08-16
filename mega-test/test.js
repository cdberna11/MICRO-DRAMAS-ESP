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
const frame = $('mega-frame');
const placeholder = $('video-placeholder');
const status = $('status');
const logBox = $('log');
const title = $('video-title');
const meta = $('video-meta');
const cacheState = $('cache-state');

function log(...args) {
  const line = `[${new Date().toLocaleTimeString()}] ${args.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')}`;
  console.log(line);
  if (logBox) logBox.textContent = `${line}\n${logBox.textContent}`.slice(0, 12000);
}

function setStatus(text) {
  status.textContent = text;
  log(text);
}

function getDrama() {
  return VIDEOS[select.value];
}

function getMegaEmbedUrl(drama) {
  return drama.url.replace('https://mega.nz/file/', 'https://mega.nz/embed/');
}

function loadMegaPlayer(drama) {
  placeholder.style.display = 'none';
  frame.style.display = 'block';
  frame.src = getMegaEmbedUrl(drama);
  title.textContent = drama.title;
  meta.textContent = 'Reproductor oficial de MEGA · streaming directo';
  cacheState.textContent = 'MEGA PLAYER';
  setStatus('Player MEGA cargado. Usa su barra para hacer SEEK hacia delante y atrás.');
}

function openVideo() {
  const drama = getDrama();
  try {
    loadMegaPlayer(drama);
  } catch (error) {
    cacheState.textContent = 'ERROR';
    setStatus(`ERROR: ${error?.message || error}`);
  }
}

function closeVideo() {
  frame.src = 'about:blank';
  frame.style.display = 'none';
  placeholder.style.display = 'flex';
  title.textContent = 'Ningún vídeo cargado';
  meta.textContent = 'Selecciona un vídeo para comenzar';
  cacheState.textContent = 'CERRADO';
  setStatus('Reproductor cerrado.');
}

$('btn-open').addEventListener('click', openVideo);
$('btn-stop').addEventListener('click', closeVideo);
select.addEventListener('change', () => {
  if (frame.src && frame.src !== 'about:blank') {
    loadMegaPlayer(getDrama());
  }
});

showPlaceholder();
log('MEGA-TEST iniciado en modo exclusivo Player MEGA.');
setStatus('Selecciona un vídeo y pulsa «CARGAR VÍDEO».');
