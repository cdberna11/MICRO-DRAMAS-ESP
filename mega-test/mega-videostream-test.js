const MEGA_URLS={
  video1:'https://mega.nz/file/i4o11BTQ#-aSeSbRBjG878N5r5Q5te9SSvW-B19tjw5cfexOAdlQ',
  video2:'https://mega.nz/file/2xIwkY6K#4Oe8Vuomh0NfMjjPKOFQIT0nEXnaA9ZcQGBLou5yj-E'
};

const MEGAJS_URL='https://unpkg.com/megajs/dist/main.browser-es.mjs';
const VIDEOSTREAM_URL='https://esm.sh/videostream@5.7.0?bundle';
const $=id=>document.getElementById(id);

let VideoStreamClass=null;
let megaFile=null;
let videoStream=null;
let activeRun=0;
let downloadedBytes=0;
let requestCount=0;

function log(text){$('log').textContent=`[${new Date().toLocaleTimeString()}] ${text}\n${$('log').textContent}`.slice(0,22000)}
function url(){return MEGA_URLS[$('source').value]}
function name(){return $('source').value==='video1'?'EL PROXIMO SOLSTICIO.mp4':'Vídeo MEGA 2'}
function status(text){$('status').textContent=text}
function formatTime(s){if(!Number.isFinite(s)||s<0)return '0:00';const n=Math.floor(s),h=Math.floor(n/3600),m=Math.floor(n%3600/60),sec=n%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`:`${m}:${String(sec).padStart(2,'0')}`}
function formatBytes(n){if(!Number.isFinite(n))return '0 MB';return `${(n/1048576).toFixed(1)} MB`}
function updateMetrics(){const v=$('video');$('position').textContent=formatTime(v.currentTime);$('duration').textContent=Number.isFinite(v.duration)?formatTime(v.duration):'—';$('downloaded').textContent=formatBytes(downloadedBytes);if(v.buffered?.length){let b='';for(let i=0;i<v.buffered.length;i++)b+=`${i?' | ':''}${formatTime(v.buffered.start(i))}–${formatTime(v.buffered.end(i))}`;$('buffer').textContent=b}else $('buffer').textContent='—'}
function updateUrl(){$('source-url').textContent=url()}

async function loadVideoStream(){
  if(VideoStreamClass)return VideoStreamClass;
  log('Cargando MEGA VideoStream 5.7.0 desde npm/ESM…');
  const mod=await import(VIDEOSTREAM_URL);
  VideoStreamClass=mod.default||mod.VideoStream||mod;
  if(typeof VideoStreamClass!=='function')throw new Error('No se pudo obtener la clase VideoStream 5.7.0.');
  log('VideoStream 5.7.0 cargado correctamente.');
  return VideoStreamClass;
}

async function loadMega(){
  const {File}=await import(MEGAJS_URL);
  const file=File.fromURL(url());
  await file.loadAttributes();
  const size=Number(file.size||0);
  status(`MEGA OK · ${file.name||name()} · ${(size/2**30).toFixed(2)} GB · listo para lectura por rangos.`);
  log(`MEGA: ${file.name||name()} · ${(size/2**30).toFixed(2)} GB.`);
  return file;
}

function makeFileAdapter(file,token){
  const adapter={
    filesize:Number(file.size||0),
    size:Number(file.size||0),
    name:file.name,
    createReadStream(opts={}){
      if(token!==activeRun)throw new Error('Prueba cancelada.');
      const start=Math.max(0,Number.isFinite(opts.start)?opts.start:0);
      const endInclusive=Number.isFinite(opts.end)?opts.end:null;
      const megaOptions={start};
      if(endInclusive!==null)megaOptions.end=endInclusive+1;
      requestCount++;
      log(`MEGA RANGE #${requestCount}: ${start.toLocaleString()} → ${(endInclusive===null?'EOF':endInclusive.toLocaleString())} (${endInclusive===null?'abierto':formatBytes(endInclusive-start+1)}).`);
      const stream=file.download(megaOptions);
      stream.on('data',chunk=>{downloadedBytes+=chunk?.byteLength||chunk?.length||0;updateMetrics()});
      stream.on('end',()=>log(`Rango #${requestCount} finalizado. Total recibido: ${formatBytes(downloadedBytes)}.`));
      stream.on('error',err=>log(`Rango #${requestCount} ERROR: ${err?.message||err}`));
      return stream;
    }
  };
  return adapter;
}

async function start(){
  const token=++activeRun;
  await stop(false);
  activeRun=token;
  downloadedBytes=0;requestCount=0;$('state').textContent='INICIANDO';$('log').textContent='';
  const v=$('video');
  try{
    status('Cargando MEGA VideoStream…');
    const [VS,file]=await Promise.all([loadVideoStream(),loadMega()]);
    if(token!==activeRun)return;
    megaFile=file;
    const adapter=makeFileAdapter(file,token);
    const mode=$('stream-mode').value;
    const opts={};
    if(mode==='video-only')opts.videoOnly=true;
    videoStream=new VS(adapter,v,opts);
    v.preload='auto';
    v.load();
    $('state').textContent='LISTO';
    status('VideoStream conectado. Pulsa PLAY; los rangos aparecerán en el diagnóstico.');
    log('VideoStream creado sobre un adaptador MEGAJS. No se usa Blob ni se descarga el archivo completo.');
    try{await v.play();log('Solicitud de reproducción iniciada desde el botón del laboratorio.')}catch(e){log(`Autoplay bloqueado: ${e.message||e}. Pulsa PLAY en el reproductor.`)}
  }catch(e){$('state').textContent='ERROR';status(`ERROR · ${e?.message||e}`);log(`ERROR: ${e?.stack||e}`)}
}

async function stop(clear=true){
  activeRun++;
  try{videoStream?.destroy?.()}catch(e){log(`Destroy: ${e.message||e}`)}
  videoStream=null;megaFile=null;
  const v=$('video');
  try{v.pause();v.removeAttribute('src');v.load()}catch{}
  $('state').textContent='DETENIDO';
  if(clear){status('Motor detenido.');log('VideoStream detenido.')}
}

async function probe(){
  try{
    const file=await loadMega();
    const end=Math.min(Number(file.size||0),4*1048576);
    let bytes=0;
    const stream=file.download({start:0,end});
    await new Promise((resolve,reject)=>{stream.on('data',c=>bytes+=c?.byteLength||c?.length||0);stream.on('error',reject);stream.on('end',resolve)});
    status(`MEGA + rango OK · ${formatBytes(bytes)} recibidos sin descargar el archivo completo.`);
    log(`Prueba de rango independiente: 0 → ${end-1}; recibidos ${formatBytes(bytes)}.`);
  }catch(e){status(`MEGA ERROR · ${e.message||e}`);log(`Probe ERROR: ${e?.stack||e}`)}
}

$('start').addEventListener('click',start);
$('stop').addEventListener('click',()=>stop(true));
$('probe').addEventListener('click',probe);
$('source').addEventListener('change',async()=>{await stop(false);updateUrl();status('Vídeo cambiado. Pulsa Iniciar VideoStream.')});
$('stream-mode').addEventListener('change',async()=>{await stop(false);status('Modo cambiado. Pulsa Iniciar VideoStream.')});

document.querySelectorAll('[data-seek]').forEach(btn=>btn.addEventListener('click',()=>{
  const v=$('video');
  if(!Number.isFinite(v.duration)){log('SEEK: todavía no hay duración disponible.');return}
  const target=Math.max(0,Math.min(v.duration-0.1,v.currentTime+Number(btn.dataset.seek)));
  log(`SEEK solicitado: ${formatTime(v.currentTime)} → ${formatTime(target)}.`);
  v.currentTime=target;
  updateMetrics();
}));

$('video').addEventListener('loadedmetadata',()=>{updateMetrics();log(`HTML5 metadata: duración ${formatTime($('video').duration)}.`)});
$('video').addEventListener('durationchange',updateMetrics);
$('video').addEventListener('timeupdate',updateMetrics);
$('video').addEventListener('progress',updateMetrics);
$('video').addEventListener('waiting',()=>log(`BUFFERING: ${formatTime($('video').currentTime)}.`));
$('video').addEventListener('playing',()=>log(`▶ PLAYING: ${formatTime($('video').currentTime)}.`));
$('video').addEventListener('seeking',()=>log(`SEEKING: ${formatTime($('video').currentTime)}.`));
$('video').addEventListener('seeked',()=>log(`SEEKED: ${formatTime($('video').currentTime)}.`));
$('video').addEventListener('error',()=>{const e=$('video').error;log(`HTML5 ERROR: code=${e?.code||'?'}, message=${e?.message||'sin detalle'}`)});
updateUrl();log('Laboratorio Motor E listo. Fuente real: MEGA + VideoStream 5.7.0.');
