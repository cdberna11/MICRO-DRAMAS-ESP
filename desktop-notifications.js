/* Campana de avisos de MICRO-DRAMAS-ESP — solo escritorio.
   Los eventos se derivan de fechas/estados del catálogo; lecturas en Cloudflare D1. */
(function () {
  "use strict";
  const media=window.matchMedia("(min-width: 601px)");
  const catalog=document.getElementById("catalogo");
  const api=window.MDUserMedia;
  if(!catalog||!api)return;
  let trigger=null,panel=null;
  let state=api.snapshot();
  const bell='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9M10 21h4"/></svg>';
  function el(tag,name,text) {
    const node=document.createElement(tag);
    if(name)node.className=name;
    if(text!==undefined)node.textContent=text;
    return node;
  }
  function close() {
    if(!trigger||!panel)return;
    panel.hidden=true;
    trigger.setAttribute("aria-expanded","false");
  }
  function open() {
    if(!trigger||!panel)return;
    panel.hidden=false;
    trigger.setAttribute("aria-expanded","true");
    render();
  }
  function findDrama(id) {
    if(typeof dramasCatalogo==="undefined"||!Array.isArray(dramasCatalogo))return null;
    return dramasCatalogo.find(x=>Number(x.id)===Number(id))||null;
  }
  function render() {
    if(!trigger||!panel)return;
    const badge=trigger.querySelector(".md-notice-badge");
    if(badge) {
      badge.textContent=state.unreadCount>99?"99+":String(state.unreadCount||"");
      badge.hidden=!(state.unreadCount>0);
    }
    const list=panel.querySelector(".md-notice-list");
    if(!list)return;
    list.replaceChildren();
    const notices=state.notifications||[];
    if(!state.ready) {
      list.appendChild(el("p","md-notice-empty","Conectando avisos de tu cuenta..."));
      return;
    }
    if(!notices.length) {
      list.appendChild(el("p","md-notice-empty","Todavía no hay novedades para mostrar."));
      return;
    }
    notices.forEach(item=>{
      const row=el("article","md-notice-item"+(item.read?"":" is-unread"));
      const thumb=el("img","md-notice-cover");
      thumb.src=item.coverUrl||"portadas/generica/portada-generica.png";
      thumb.alt="";
      thumb.loading="lazy";
      row.appendChild(thumb);
      const details=el("div","md-notice-copy");
      details.appendChild(el("span","md-notice-tag",item.type==="premiere"?"ESTRENO":"PRÓXIMO ESTRENO"));
      details.appendChild(el("strong","md-notice-title",item.title));
      details.appendChild(el("p","md-notice-subtitle",
        item.type==="premiere"?"Disponible para reproducir.":"Añádelo a Mi lista para verlo cuando se publique."));
      const actions=el("div","md-notice-actions");
      const action=el("button","md-notice-action",
        item.type==="premiere"?"▶ Ver ahora":
          state.watchlist.includes(item.dramaId)?"✓ En Mi lista":"+ Mi lista");
      action.type="button";
      action.addEventListener("click",async()=>{
        if(!item.read)await api.markRead([item.key]);
        if(item.type==="upcoming") {
          await api.toggleSaved(item.dramaId);
        } else {
          const drama=findDrama(item.dramaId);
          if(drama&&typeof reproducirDrama==="function") {
            close();
            reproducirDrama(drama);
          }
        }
      });
      actions.appendChild(action);
      if(!item.read) {
        const mark=el("button","md-notice-read","Marcar leído");
        mark.type="button";
        mark.addEventListener("click",()=>api.markRead([item.key]));
        actions.appendChild(mark);
      }
      details.appendChild(actions);
      row.appendChild(details);
      list.appendChild(row);
    });
  }
  function mount() {
    if(!media.matches)return;
    const header=catalog.querySelector(".md-desktop-header");
    if(!header)return;
    if(trigger&&header.contains(trigger))return;
    trigger=el("button","md-desktop-notice-button");
    trigger.type="button";
    trigger.setAttribute("aria-label","Abrir notificaciones");
    trigger.setAttribute("aria-expanded","false");
    trigger.setAttribute("aria-haspopup","dialog");
    trigger.innerHTML=bell;
    const badge=el("span","md-notice-badge");
    badge.hidden=true;
    trigger.appendChild(badge);
    trigger.addEventListener("click",()=>panel.hidden?open():close());
    panel=el("section","md-desktop-notice-panel");
    panel.hidden=true;
    panel.setAttribute("role","dialog");
    panel.setAttribute("aria-label","Notificaciones de microdramas");
    const heading=el("div","md-notice-heading");
    heading.appendChild(el("h2","","Notificaciones"));
    const readAll=el("button","md-notice-read-all","Marcar todas como leídas");
    readAll.type="button";
    readAll.addEventListener("click",()=>api.markRead((state.notifications||[]).filter(n=>!n.read).map(n=>n.key)));
    heading.appendChild(readAll);
    const dismiss=el("button","md-notice-close","×");
    dismiss.type="button";
    dismiss.setAttribute("aria-label","Cerrar notificaciones");
    dismiss.addEventListener("click",close);
    heading.appendChild(dismiss);
    panel.appendChild(heading);
    panel.appendChild(el("div","md-notice-list"));
    header.append(trigger,panel);
    render();
  }
  const observer=new MutationObserver(mount);
  observer.observe(catalog,{childList:true,subtree:false});
  const unsubscribe=api.subscribe(next=>{state=next;render();});
  if(media.matches)mount();
  media.addEventListener("change",()=>{
    if(media.matches)mount();
    else close();
  });
  document.addEventListener("pointerdown",event=>{
    if(panel&&!panel.hidden&&!panel.contains(event.target)&&!trigger?.contains(event.target))close();
  });
  document.addEventListener("keydown",event=>{if(event.key==="Escape")close();});
})();