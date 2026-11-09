/* Datos de perfil en Cloudflare D1: lista, progreso y novedades.
   Compatible con el reproductor MP4/Mega existente: usa el SEEK validado. */
(function () {
  "use strict";
  const state = {
    ready:false, error:null, userId:null,
    watchlist:[], progress:[], notifications:[], unreadCount:0
  };
  const subs = new Set();
  const busy = new Set();
  let active = null;
  let lastRequest = 0;
  let authDone = false;
  function notify() {
    subs.forEach(callback => { try { callback(snapshot()); } catch(e) { console.warn("[perfil]",e); } });
  }
  function snapshot() {
    return {
      ready:state.ready, error:state.error, userId:state.userId,
      watchlist:[...state.watchlist],progress:state.progress.map(x=>({...x})),
      notifications:state.notifications.map(x=>({...x})),unreadCount:state.unreadCount
    };
  }
  async function request(path, options={}) {
    const res=await fetch(path,{
      credentials:"same-origin",cache:"no-store",
      headers:{Accept:"application/json",...(options.body?{"Content-Type":"application/json"}:{})},
      ...options
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok || !data.success) throw Error(data.error||("HTTP "+res.status));
    return data;
  }
  async function refresh() {
    const version=++lastRequest;
    try {
      const data=await request("/api/user/state");
      if(version!==lastRequest) return snapshot();
      state.ready=true;state.error=null;state.userId=data.userId;
      state.watchlist=Array.isArray(data.watchlist)?data.watchlist.map(Number):[];
      state.progress=Array.isArray(data.progress)?data.progress:[];
      state.notifications=Array.isArray(data.notifications)?data.notifications:[];
      state.unreadCount=Number(data.unreadCount)||0;
      notify();
      return snapshot();
    } catch(error) {
      if(version!==lastRequest)return snapshot();
      console.warn("[perfil] No se pudo sincronizar D1:",error);
      state.ready=false;state.error=error.message;notify();
      return snapshot();
    }
  }
  async function migrateLocalList() {
    if(!state.ready || !state.userId) return;
    const key="microdramas:desktop:my-list:v1:user:"+String(state.userId);
    let local;
    try{local=JSON.parse(localStorage.getItem(key)||"[]");}catch{return;}
    if(!Array.isArray(local)||!local.length)return;
    let allSaved=true,changed=false;
    for(const id of new Set(local.map(Number).filter(x=>Number.isSafeInteger(x)&&x>0))){
      if(state.watchlist.includes(id))continue;
      try {
        await request("/api/user/list",{method:"POST",body:JSON.stringify({dramaId:id})});
        changed=true;
      }catch(error){allSaved=false;console.warn("[perfil] Migración de favorito",id,error);}
    }
    if(changed)await refresh();
    if(allSaved){try{localStorage.removeItem(key);}catch{}}
  }
  const ready=refresh().then(async()=>{if(!authDone){authDone=true;await migrateLocalList();}return snapshot();});
  function subscribe(callback) {
    if(typeof callback!=="function")return()=>{};
    subs.add(callback);
    callback(snapshot());
    return()=>subs.delete(callback);
  }
  async function toggleSaved(id) {
    id=Number(id);
    if(!state.ready||!Number.isSafeInteger(id)||id<=0||busy.has(id))return false;
    busy.add(id);
    const saved=state.watchlist.includes(id);
    try{
      await request("/api/user/list",{
        method:saved?"DELETE":"POST",
        body:JSON.stringify({dramaId:id})
      });
      if(saved)state.watchlist=state.watchlist.filter(x=>x!==id);
      else state.watchlist=[id,...state.watchlist];
      notify();
      return true;
    }catch(error) {
      console.error("[Mi lista]",error);
      window.alert("No se pudo actualizar Mi lista. Comprueba tu conexión e inténtalo nuevamente.");
      return false;
    }finally{busy.delete(id);}
  }
  async function markRead(keys) {
    const selected=[...new Set((Array.isArray(keys)?keys:[]).filter(x=>typeof x==="string"))];
    if(!state.ready||!selected.length)return;
    try {
      const data=await request("/api/user/notifications",{
        method:"POST",body:JSON.stringify({keys:selected.slice(0,100)})
      });
      const set=new Set(data.readKeys||[]);
      state.notifications=state.notifications.map(x=>set.has(x.key)?{...x,read:true}:x);
      state.unreadCount=state.notifications.filter(x=>!x.read).length;
      notify();
    }catch(error){console.warn("[Avisos] No se pudo marcar como leído:",error);}
  }
  function getProgress(id) {
    return state.progress.find(p=>Number(p.dramaId)===Number(id))||null;
  }
  function detachPlayback(session){
    for(const [name,handler] of session.listeners)
      session.video.removeEventListener(name,handler);
    session.listeners=[];
  }
  function saveProgress(session,ended=false,force=false){
    if(!state.ready||!session||session!==active||!session.played)return;
    const video=session.video;
    const seconds=Number(video.currentTime);
    const duration=Number.isFinite(video.duration) && video.duration>0
      ? Number(video.duration) : Number(session.durationReader?.());
    if(session.resuming || !Number.isFinite(seconds)||seconds<0||!Number.isFinite(duration)||duration<=0)return;
    const now=Date.now();
    if(!force&&now-session.lastSave<15000)return;
    session.lastSave=now;
    const completed=ended||video.ended;
    const payload={
      dramaId:session.id,
      positionMs:Math.round(Math.min(seconds,duration)*1000),
      durationMs:Math.round(duration*1000),
      eventMs:now,
      completed
    };
    if(payload.durationMs<=0)return;
    // El guardado no altera el estado ni los controles del reproductor.
    fetch("/api/user/progress",{
      method:"PUT",credentials:"same-origin",keepalive:force,
      headers:{"Content-Type":"application/json",Accept:"application/json"},
      body:JSON.stringify(payload)
    }).then(async res=>{
      if(!res.ok)return;
      const data=await res.json().catch(()=>({}));
      if(!data.success)return;
      const previous=getProgress(session.id);
      const isNewer=!previous||!previous.clientEventMs||payload.eventMs>=previous.clientEventMs;
      if(!isNewer)return;
      const next={dramaId:session.id,positionMs:payload.positionMs,durationMs:payload.durationMs,
        completed:Boolean(data.completed),updatedAt:new Date(now).toISOString(),clientEventMs:payload.eventMs};
      state.progress=[next,...state.progress.filter(p=>Number(p.dramaId)!==session.id)];
      notify();
    }).catch(error=>console.warn("[Progreso] Sin conexión:",error));
  }
  function onPlaybackOpen(drama, video, validSeek, durationReader) {
    if(!drama||!video||typeof validSeek!=="function")return;
    if(active)onPlaybackClose(active.drama,active.video);
    const session={
      id:Number(drama.id),drama,video,validSeek,durationReader,listeners:[],
      played:false,lastSave:0,resumeTried:false,resuming:false,createdAt:Date.now()
    };
    active=session;
    function listen(type,fn) {
      video.addEventListener(type,fn);session.listeners.push([type,fn]);
    }
    function resumeIfReady() {
      if(active!==session||session.resumeTried||!state.ready)return;
      const progress=getProgress(session.id);
      if(!progress||progress.completed){
        session.resumeTried=true;return;
      }
      const duration=Number.isFinite(video.duration) && video.duration>0
        ? Number(video.duration) : Number(session.durationReader?.());
      if(!Number.isFinite(duration)||duration<=0)return;
      const target=Number(progress.positionMs)/1000;
      if(!Number.isFinite(target)||target<5||target>=duration-5){
        session.resumeTried=true;return;
      }
      session.resumeTried=true;
      session.resuming=true;
      // La búsqueda utiliza exclusivamente la implementación validada de MP4Box/MEGA.
      Promise.resolve(session.validSeek(Math.min(target,duration-.5)))
        .catch(error=>console.warn("[Continuar viendo] Seek no disponible:",error))
        .finally(()=>{session.resuming=false;});
    }
    listen("playing",()=>{session.played=true;resumeIfReady();});
    listen("durationchange",()=>{if(!video.paused)resumeIfReady();});
    listen("loadedmetadata",()=>{if(!video.paused)resumeIfReady();});
    listen("timeupdate",()=>{
      if(!video.paused){session.played=true;resumeIfReady();saveProgress(session,false,false);}
    });
    listen("pause",()=>saveProgress(session,false,true));
    listen("ended",()=>saveProgress(session,true,true));
    // El estado de D1 puede terminar de cargar después que el video.
    ready.then(()=>{
      if(active===session&&session.played)resumeIfReady();
    });
  }
  function onPlaybackClose(drama,video) {
    if(!active)return;
    const session=active;
    // Forzar el último guardado antes que detenerReproductor() borre src/duración.
    saveProgress(session,session.video.ended,true);
    active=null;
    detachPlayback(session);
  }
  window.addEventListener("pagehide",()=>{
    if(active)saveProgress(active,active.video.ended,true);
  });
  window.addEventListener("focus",()=>{
    if(Date.now()-lastFocusRefresh>90000){
      lastFocusRefresh=Date.now();refresh();
    }
  });
  let lastFocusRefresh=Date.now();
  window.setInterval(()=>{
    if(document.visibilityState==="visible"&&!active)refresh();
  },180000);
  window.MDUserMedia={
    ready,subscribe,snapshot,refresh,toggleSaved,markRead,getProgress,
    onPlaybackOpen,onPlaybackClose
  };
})();