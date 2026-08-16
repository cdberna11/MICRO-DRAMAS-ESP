const MEGA_URLS={video1:'https://mega.nz/file/i4o11BTQ#-aSeSbRBjG878N5r5Q5te9SSvW-B19tjw5cfexOAdlQ',video2:'https://mega.nz/file/2xIwkY6K#4Oe8Vuomh0NfMjjPKOFQIT0nEXnaA9ZcQGBLou5yj-E'};
const MEGAJS_URL='https://unpkg.com/megajs/dist/main.browser-es.mjs';
const MP4BOX_URL='https://cdn.jsdelivr.net/npm/mp4box@2.4.1/dist/mp4box.all.mjs';
const INITIAL_RANGE=16*1024*1024,MEDIA_RANGE=8*1024*1024,MAX_BOOTSTRAP=64*1024*1024,SEGMENT_SAMPLES=60;
const $=id=>document.getElementById(id);
let megaFile=null,MP4BoxAPI=null,mediaSource=null,vidstackPlayer=null,mp4box=null,activeRun=0,nextDownloadOffset=0,downloadedBytes=0,totalRanges=0,sourceBuffers=new Map(),sourceQueues=new Map(),metadataReady=false;

function log(id,text){const el=$(id);if(!el)return;el.textContent=`[${new Date().toLocaleTimeString()}] ${text}\n${el.textContent}`.slice(0,18000)}
function selectedUrl(){return MEGA_URLS[$('mega-source').value]}
function selectedName(){return $('mega-source').value==='video1'?'Vídeo MEGA 1':'Vídeo MEGA 2'}
function setStatus(text){$('mega-status').textContent=text}
function updateSourceLabel(){$('source-label').textContent=selectedUrl()}
function setState(text){$('vidstack-state').textContent=text}
function updateMetrics(){
  $('downloaded').textContent=`${(downloadedBytes/1048576).toFixed(1)} MB`;
  $('ranges').textContent=String(totalRanges);
  try{const v=vidstackPlayer?.querySelector('video');if(v?.buffered?.length){const e=v.buffered.end(v.buffered.length-1);$('buffered').textContent=`${Math.max(0,e-v.currentTime).toFixed(1)} s`}}catch{}
}
function toArrayBuffer(chunk){if(chunk instanceof ArrayBuffer)return chunk;if(ArrayBuffer.isView(chunk))return chunk.buffer.slice(chunk.byteOffset,chunk.byteOffset+chunk.byteLength);return new Uint8Array(chunk).buffer}
function waitForSourceOpen(token){return new Promise((resolve,reject)=>{if(token!==activeRun)return reject(new Error('Prueba cancelada.'));if(mediaSource?.readyState==='open')return resolve();const ok=()=>{clean();token===activeRun?resolve():reject(new Error('Prueba cancelada.'))};const fail=()=>{clean();reject(new Error('MediaSource no pudo abrirse.'))};const clean=()=>{mediaSource?.removeEventListener('sourceopen',ok);mediaSource?.removeEventListener('error',fail)};mediaSource?.addEventListener('sourceopen',ok,{once:true});mediaSource?.addEventListener('error',fail,{once:true})})}
function mimeForTrack(track,kind){const codec=track.codec||'';return `${kind}/mp4; codecs="${codec}"`}
function appendToSourceBuffer(id,buffer){const sb=sourceBuffers.get(id);const q=sourceQueues.get(id)||[];q.push(buffer);sourceQueues.set(id,q);if(sb)flushSourceBuffer(id)}
function flushSourceBuffer(id){const sb=sourceBuffers.get(id),q=sourceQueues.get(id)||[];if(!sb||sb.updating||!q.length||mediaSource?.readyState!=='open')return;const b=q.shift();sourceQueues.set(id,q);try{sb.appendBuffer(b)}catch(e){q.unshift(b);sourceQueues.set(id,q);log('vidstack-log',`SourceBuffer ${id}: ${e.message||e}`)}}
function createSourceBuffer(track,kind){if(sourceBuffers.has(track.id))return sourceBuffers.get(track.id);const mime=mimeForTrack(track,kind);if(!MediaSource.isTypeSupported(mime))throw new Error(`Codec no soportado por MSE: ${mime}`);const sb=mediaSource.addSourceBuffer(mime);sb.mode='segments';sb.addEventListener('updateend',()=>flushSourceBuffer(track.id));sb.addEventListener('error',()=>log('vidstack-log',`SourceBuffer error en track ${track.id}`));sourceBuffers.set(track.id,sb);sourceQueues.set(track.id,[]);log('vidstack-log',`SourceBuffer ${kind}: ${mime}`);return sb}
function configureMP4Box(info,token){
  if(token!==activeRun)return;
  const videoTracks=(info.videoTracks||[]).map(t=>({...t,__kind:'video'})),audioTracks=(info.audioTracks||[]).map(t=>({...t,__kind:'audio'})),tracks=[...videoTracks,...audioTracks];
  if(!tracks.length)throw new Error('MP4Box no encontró pistas de audio/vídeo.');
  const duration=Number(info.duration||0)/Number(info.timescale||1);$('duration').textContent=`${duration.toFixed(1)} s`;log('vidstack-log',`MP4Box encontró ${tracks.length} pista(s), duración ${duration.toFixed(1)} s.`);
  tracks.forEach(t=>{createSourceBuffer(t,t.__kind);mp4box.setSegmentOptions(t.id,null,{nbSamples:SEGMENT_SAMPLES,rapAlignment:true})});
  const initSegments=mp4box.initializeSegmentation()||[];for(const init of initSegments)appendToSourceBuffer(init.track_id,toArrayBuffer(init.buffer));
  metadataReady=true;log('vidstack-log',`Init segments preparados: ${initSegments.length}.`);mp4box.start()
}
async function downloadRange(file,start,end,token){
  if(token!==activeRun)throw new Error('Prueba cancelada.');
  const expected=end-start,stream=file.download({start,end});let received=0;
  return new Promise((resolve,reject)=>{stream.on('data',chunk=>{if(token!==activeRun)return;const ab=toArrayBuffer(chunk),fileStart=start+received;received+=ab.byteLength;downloadedBytes+=ab.byteLength;ab.fileStart=fileStart;try{mp4box.appendBuffer(ab)}catch(e){reject(e)}updateMetrics()});stream.on('error',reject);stream.on('end',()=>{if(received!==expected)log('vidstack-log',`Aviso: esperado ${expected} B, recibido ${received} B.`);resolve(received)})})
}
async function bootstrapMP4(file,token){let offset=0,rangeSize=INITIAL_RANGE;while(!metadataReady&&offset<MAX_BOOTSTRAP){const end=Math.min(Number(file.size),offset+rangeSize);totalRanges++;log('vidstack-log',`Leyendo rango ${offset}-${end-1} (${((end-offset)/1048576).toFixed(1)} MB)…`);await downloadRange(file,offset,end,token);offset=end;nextDownloadOffset=offset;if(!metadataReady)rangeSize=Math.min(32*1048576,rangeSize*2)}if(!metadataReady){const size=Number(file.size||0),tailStart=Math.max(0,size-16*1048576);log('vidstack-log',`Estructura no encontrada al inicio. Leyendo cola ${tailStart}-${size-1}…`);totalRanges++;await downloadRange(file,tailStart,size,token)}if(!metadataReady)throw new Error('MP4Box no encontró la estructura MP4 en los rangos iniciales.')}
async function continueStreaming(file,token){let offset=nextDownloadOffset,size=Number(file.size||0);while(token===activeRun&&offset<size){const end=Math.min(size,offset+MEDIA_RANGE);totalRanges++;await downloadRange(file,offset,end,token);offset=end;nextDownloadOffset=offset}}
async function openMegaAttributes(){setStatus('Abriendo MEGAJS y leyendo atributos…');const{File}=await import(MEGAJS_URL);megaFile=File.fromURL(selectedUrl());await megaFile.loadAttributes();const gb=(Number(megaFile.size||0)/2**30).toFixed(2);setStatus(`MEGA OK · ${megaFile.name||selectedName()} · ${gb} GB · streaming por rangos.`);return megaFile}
async function loadLibraries(){if(!MP4BoxAPI){const m=await import(MP4BOX_URL);MP4BoxAPI=m.default||m}if(!MP4BoxAPI?.createFile)throw new Error('MP4Box.js no pudo inicializarse.')}
async function runVidstack(){
  const token=++activeRun;await stopVidstack(false);activeRun=token;setState('INICIANDO');downloadedBytes=0;totalRanges=0;nextDownloadOffset=0;sourceBuffers=new Map();sourceQueues=new Map();metadataReady=false;log('vidstack-log',`Fuente: ${selectedName()}`);
  try{
    await customElements.whenDefined('media-player');vidstackPlayer=$('vidstack-player');const file=await openMegaAttributes();await loadLibraries();if(!window.MediaSource)throw new Error('Este navegador no expone MediaSource.');
    mediaSource=new MediaSource();mediaSource.addEventListener('sourceopen',()=>log('vidstack-log','MediaSource: sourceopen.'),{once:true});vidstackPlayer.src={src:mediaSource,type:'video/object'};
    await waitForSourceOpen(token);
    mp4box=MP4BoxAPI.createFile();mp4box.onError=e=>log('vidstack-log',`MP4Box ERROR: ${e}`);mp4box.onReady=info=>{try{configureMP4Box(info,token);setState('MSE LISTO');setStatus('Vidstack conectado al MediaSource. Pulsa PLAY.')}catch(e){setState('ERROR');log('vidstack-log',`Configuración MP4Box: ${e.message||e}`)}};mp4box.onSegment=(id,user,buffer)=>{if(token!==activeRun)return;appendToSourceBuffer(id,toArrayBuffer(buffer));updateMetrics()};
    const video=vidstackPlayer.querySelector('video');if(video){video.addEventListener('loadedmetadata',()=>{$('duration').textContent=`${video.duration.toFixed(1)} s`;log('vidstack-log',`HTML5 metadata: ${video.duration.toFixed(1)} s.`)},{once:true});video.addEventListener('playing',()=>log('vidstack-log',`▶ Reproduciendo en ${video.currentTime.toFixed(1)} s.`));video.addEventListener('waiting',()=>log('vidstack-log',`Buffering en ${video.currentTime.toFixed(1)} s…`));video.addEventListener('progress',updateMetrics);video.addEventListener('error',()=>log('vidstack-log',`HTML5 error: ${video.error?.code||'desconocido'}`))}
    await bootstrapMP4(file,token);log('vidstack-log',`Bootstrap listo: ${(downloadedBytes/1048576).toFixed(1)} MB descargados.`);setState('CARGANDO RANGOS');continueStreaming(file,token).catch(e=>{if(token===activeRun)log('vidstack-log',`Streaming detenido/error: ${e.message||e}`)});
  }catch(e){setState('ERROR');setStatus(`ERROR · ${e?.message||e}`);log('vidstack-log',`ERROR: ${e?.stack||e}`)}
}
async function stopVidstack(clearLog=true){activeRun++;try{mp4box?.stop?.()}catch{}mp4box=null;sourceBuffers.clear();sourceQueues.clear();if(vidstackPlayer)try{vidstackPlayer.src=''}catch{}if(mediaSource?.readyState==='open')try{mediaSource.endOfStream()}catch{}mediaSource=null;megaFile=null;if(clearLog)log('vidstack-log','Motor detenido.');setState('DETENIDO')}
async function probeMegaRange(){try{const file=await openMegaAttributes(),end=Math.min(Number(file.size),4*1048576);log('vidstack-log',`Prueba independiente: rango 0-${end-1}…`);let bytes=0;const stream=file.download({start:0,end});await new Promise((resolve,reject)=>{stream.on('data',c=>bytes+=toArrayBuffer(c).byteLength);stream.on('error',reject);stream.on('end',resolve)});setStatus(`MEGA + RANGO OK · ${file.name} · ${(Number(file.size)/2**30).toFixed(2)} GB · recibidos ${(bytes/1048576).toFixed(1)} MB.`);log('vidstack-log',`Rango independiente recibido: ${(bytes/1048576).toFixed(1)} MB.`)}catch(e){setStatus(`MEGA ERROR · ${e?.message||e}`);log('vidstack-log',`MEGA ERROR: ${e?.message||e}`)}}
async function runShaka(){ $('shaka-state').textContent='ANALIZANDO';log('shaka-log',`Fuente: ${selectedName()}`);try{const file=await openMegaAttributes();log('shaka-log',`Archivo MEGA: ${(Number(file.size||0)/2**30).toFixed(2)} GB.`);log('shaka-log','Shaka no acepta directamente mega.nz/file como manifest DASH/HLS.');log('shaka-log','Se mantiene como segundo candidato para un adaptador segmentado.');$('shaka-state').textContent='ADAPTADOR PENDIENTE'}catch(e){$('shaka-state').textContent='ERROR';log('shaka-log',`ERROR: ${e?.message||e}`)}}
$('mega-source').addEventListener('change',async()=>{await stopVidstack(false);updateSourceLabel();setStatus('Vídeo cambiado. Ejecuta nuevamente el motor.')});$('probe-mega').addEventListener('click',probeMegaRange);$('run-vidstack').addEventListener('click',runVidstack);$('stop-vidstack').addEventListener('click',()=>stopVidstack(true));$('run-shaka').addEventListener('click',runShaka);updateSourceLabel();log('vidstack-log','Laboratorio listo: Motor C1 real preparado.');log('shaka-log','Shaka queda como segundo candidato.');
