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
  function detachPlayback(session) {
    for (const [name, handler] of session.listeners) {
      session.video.removeEventListener(name, handler);
    }
    session.listeners = [];
  }

  function finiteDuration(session) {
    const videoDuration = Number(session.video.duration);
    if (Number.isFinite(videoDuration) && videoDuration > 0) return videoDuration;
    const mp4Duration = Number(session.durationReader?.());
    return Number.isFinite(mp4Duration) && mp4Duration > 0 ? mp4Duration : 0;
  }

  function previousPosition(session) {
    const item = getProgress(session.id);
    if (!item || item.completed) return 0;
    const seconds = Number(item.positionMs) / 1000;
    const duration = finiteDuration(session);
    if (!Number.isFinite(seconds) || seconds < 5 || duration <= 0 ||
        seconds >= duration - 5) return 0;
    return Math.min(seconds, duration - 0.5);
  }

  function saveProgress(session, ended = false, force = false) {
    // Nunca se sobrescribe una reanudación pendiente con un comienzo en 0:00.
    if (!session || !state.ready || !session.played || !session.resumeDecided ||
        session.resuming || session.restoreFailed) return;
    const duration = finiteDuration(session);
    if (duration <= 0) return;
    const current = Number(session.video.currentTime);
    const seconds = Number.isFinite(current) && current >= 0 ?
      current : session.lastValidTime;
    if (!Number.isFinite(seconds) || seconds < 0) return;

    // No registrar microsegundos iniciales como progreso válido.
    const completed = Boolean(ended || session.video.ended);
    if (seconds < 2 && !completed) return;
    const now = Date.now();
    if (!force && now - session.lastSave < 10000) return;
    const eventMs = Math.max(now, (session.lastEventMs || 0) + 1);
    session.lastEventMs = eventMs;
    session.lastSave = now;
    session.lastValidTime = seconds;
    const payload = {
      dramaId: session.id,
      positionMs: Math.round(Math.min(seconds, duration) * 1000),
      durationMs: Math.round(duration * 1000),
      eventMs,
      completed
    };
    if (!Number.isSafeInteger(payload.positionMs) ||
        !Number.isSafeInteger(payload.durationMs) ||
        payload.durationMs <= 0) return;

    // El cierre y la salida de página usan keepalive, sin desmontar los controles.
    fetch("/api/user/progress", {
      method: "PUT",
      credentials: "same-origin",
      cache: "no-store",
      keepalive: force,
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload)
    }).then(async response => {
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      if (!data.success) throw new Error(data.error || "D1 rechazó el progreso");
      const previous = getProgress(session.id);
      if (previous?.clientEventMs && payload.eventMs < previous.clientEventMs) return;
      const next = {
        dramaId: session.id,
        positionMs: payload.positionMs,
        durationMs: payload.durationMs,
        completed: Boolean(data.completed),
        updatedAt: new Date(payload.eventMs).toISOString(),
        clientEventMs: payload.eventMs
      };
      state.progress = [next, ...state.progress.filter(item => Number(item.dramaId) !== session.id)];
      notify();
    }).catch(error => {
      console.warn("[Continuar viendo] No se confirmó el progreso en Cloudflare D1:", error);
    });
  }

  function onPlaybackOpen(drama, video, validSeek, durationReader) {
    if (!drama || !video || typeof validSeek !== "function") return;
    if (active) onPlaybackClose(active.drama, active.video);
    const session = {
      id: Number(drama.id), drama, video, validSeek, durationReader,
      listeners: [], played: false, resumeDecided: false,
      resuming: false, restoreFailed: false, lastSave: 0,
      lastEventMs: 0, lastValidTime: 0
    };
    active = session;

    function listen(type, handler) {
      video.addEventListener(type, handler);
      session.listeners.push([type, handler]);
    }

    function attemptResume() {
      if (active !== session || !state.ready || !session.played ||
          session.resumeDecided || session.resuming) return;
      const progress = getProgress(session.id);
      const duration = finiteDuration(session);
      if (progress && !progress.completed && duration <= 0) return;

      const target = previousPosition(session);
      session.resumeDecided = true;
      if (!target) return;

      session.resuming = true;
      console.info("[Continuar viendo] Recuperando posición:", target.toFixed(1), "s");
      // Usa el mismo SEEK remoto/local del reproductor MEGA ya validado.
      Promise.resolve().then(() => session.validSeek(target)).then(() => {
        if (active !== session) return;
        const actual = Number(video.currentTime);
        if (!Number.isFinite(actual) || Math.abs(actual - target) > 8) {
          session.restoreFailed = true;
          console.warn("[Continuar viendo] No se pudo confirmar el salto a", target);
          return;
        }
        session.lastValidTime = actual;
        session.lastSave = Date.now();
        console.info("[Continuar viendo] Reanudado en", actual.toFixed(1), "s");
      }).catch(error => {
        if (active === session) session.restoreFailed = true;
        console.warn("[Continuar viendo] Error reanudando:", error);
      }).finally(() => {
        session.resuming = false;
      });
    }

    listen("playing", () => {
      session.played = true;
      attemptResume();
    });
    listen("loadedmetadata", attemptResume);
    listen("durationchange", attemptResume);
    listen("timeupdate", () => {
      if (active !== session) return;
      if (!video.paused) session.played = true;
      attemptResume();
      if (!session.resuming && session.resumeDecided) {
        const current = Number(video.currentTime);
        if (Number.isFinite(current) && current >= 0) session.lastValidTime = current;
        if (!video.paused) saveProgress(session);
      }
    });
    listen("seeked", () => {
      if (session.resuming) return;
      const current = Number(video.currentTime);
      if (Number.isFinite(current) && current >= 0) session.lastValidTime = current;
      saveProgress(session, false, true);
    });
    listen("pause", () => saveProgress(session, false, true));
    listen("ended", () => saveProgress(session, true, true));

    // Si la API D1 todavía está cargando, se difiere el guardado y la
    // restauración hasta conocer la posición anterior.
    ready.then(() => { if (active === session) attemptResume(); });
    if (!state.ready) refresh().then(() => {
      if (active === session) attemptResume();
    });
  }

  function onPlaybackClose() {
    if (!active) return;
    const session = active;
    // Capture antes de que app.js revoque MediaSource y reinicie la duración.
    saveProgress(session, session.video.ended, true);
    active = null;
    detachPlayback(session);
  }

  window.addEventListener("pagehide", () => {
    if (active) saveProgress(active, active.video.ended, true);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && active)
      saveProgress(active, active.video.ended, true);
  });
  window.addEventListener("focus", () => {
    if (Date.now() - lastFocusRefresh > 90000) {
      lastFocusRefresh = Date.now();
      if (!active) refresh();
    }
  });
  let lastFocusRefresh = Date.now();
  window.setInterval(() => {
    if (document.visibilityState === "visible" && !active) refresh();
  }, 180000);
  window.MDUserMedia={
    ready,subscribe,snapshot,refresh,toggleSaved,markRead,getProgress,
    onPlaybackOpen,onPlaybackClose
  };
})();