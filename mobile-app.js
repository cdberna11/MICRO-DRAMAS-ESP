/* MICRO-DRAMAS-ESP · Web móvil con el lenguaje visual de la APK Compose.
   La reproducción, tarjetas, sesiones y favoritos siguen usando sus APIs originales.
   No se ejecuta en escritorio (>600px). */
(function () {
  "use strict";
  const media = window.matchMedia("(max-width: 600px)");
  const catalog = document.getElementById("catalogo");
  if (!catalog) return;
  const api = window.MDUserMedia;
  const logo = "assets/images/LOGO_APK-MICRO_DRAMA.png";
  const coverFallback = "portadas/generica/portada-generica.png";
  const glyphs = {
    home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
    list:'<path d="M5 4h14v16l-7-4-7 4z"/>',
    person:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3-7 8-7s8 3 8 7"/>',
    bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9M10 21h4"/>',
    play:'<path d="m8 5 12 7-12 7z"/>',
    arrow:'<path d="m9 18 6-6-6-6"/>'
  };
  function svg(name) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'+glyphs[name]+'</svg>';
  }
  function el(tag, klass, text) {
    const node=document.createElement(tag);
    if(klass)node.className=klass;
    if(text!==undefined)node.textContent=String(text);
    return node;
  }
  function btn(text, klass, fn) {
    const node=el("button",klass,text);
    node.type="button";
    if(fn)node.addEventListener("click",fn);
    return node;
  }
  function data() {
    return typeof dramasCatalogo!=="undefined"&&Array.isArray(dramasCatalogo)?dramasCatalogo:[];
  }
  function categories() {
    return typeof categoriasPortal!=="undefined"&&Array.isArray(categoriasPortal)?categoriasPortal:[];
  }
  function draft(drama) { return ["draft","borrador"].includes(String(drama.status||"").toLowerCase()); }
  function published(drama) { return String(drama.status||"").toLowerCase()==="published"; }
  function playable(drama) { return published(drama)&&Boolean(String(drama.video_url||"").trim()); }
  function dateTime(raw) {
    if(!raw)return 0;
    const str=String(raw).trim().replace(" ","T");
    const stamp=Date.parse(/[zZ]$|[+-]\d\d:\d\d$/.test(str)?str:str+"Z");
    return Number.isFinite(stamp)?stamp:0;
  }
  function recent(drama) {
    const ts=dateTime(drama.published_at);
    return published(drama)&&ts>0&&Date.now()>=ts&&Date.now()-ts<7*86400000;
  }
  function ranking(a,b) {
    return Number(b.views||0)-Number(a.views||0)||Number(b.period_views||0)-Number(a.period_views||0)||Number(b.id)-Number(a.id);
  }
  const state={mounted:false,tab:"home",featured:null,mediaState:api?.snapshot?.()||{ready:false,progress:[],watchlist:[],notifications:[],unreadCount:0},user:null,search:"",noticesOpen:false};
  let nav=null,unsubscribe=null,bodyObserver=null,rebuildPending=false;
  const hasSaved=id=>state.mediaState.watchlist?.some(x=>Number(x)===Number(id));
  function safeCover(drama){return String(drama?.cover_url||"").trim()||coverFallback;}
  function closeNotices() {
    document.querySelector(".md-mobile-notices")?.remove();
    state.noticesOpen=false;
  }
  function play(drama) {
    if(!playable(drama))return;
    if(typeof reproducirDrama==="function")reproducirDrama(drama);
  }
  function openDetail(drama,card){
    // Una pulsación sobre la portada usa exactamente el detalle móvil original.
    card?.querySelector(".drama-card__cover")?.click();
  }
  function originalCard(drama,parent,rank,progress) {
    crearTarjetaDrama(drama);
    const card=catalog.lastElementChild;
    if(!card?.classList.contains("drama-card"))return;
    const wrapper=el("div","md-mobile-item"+(rank?" md-mobile-item--ranked":""));
    wrapper.dataset.id=String(drama.id);
    if(rank){
      const number=el("span","md-mobile-rank",rank);
      wrapper.appendChild(number);
      if(rank===10)wrapper.classList.add("md-mobile-item--ten");
    }
    wrapper.appendChild(card);
    if(progress){
      const track=el("div","md-mobile-progress");
      const fill=el("span","md-mobile-progress__fill");
      fill.style.width=Math.min(100,Math.max(0,100*progress.positionMs/progress.durationMs))+"%";
      track.appendChild(fill);
      wrapper.appendChild(track);
    }
    wrapper.appendChild(el("p","md-mobile-item__title",drama.title||"Microdrama"));
    parent.appendChild(wrapper);
  }
  function row(title,dramas,id,ranked=false,progressMap=null){
    if(!dramas.length)return;
    const section=el("section","md-mobile-section");
    section.id=id;
    section.appendChild(el("h2","md-mobile-section__title",title));
    const rail=el("div","md-mobile-rail"+(ranked?" md-mobile-rail--ranked":""));
    rail.setAttribute("aria-label","Carrusel "+title);
    dramas.forEach((drama,i)=>originalCard(drama,rail,ranked?i+1:0,progressMap?.get(Number(drama.id))));
    section.appendChild(rail);
    catalog.appendChild(section);
  }
  function hero(drama){
    if(!drama)return;
    const section=el("section","md-mobile-hero");
    const picture=el("img","md-mobile-hero__cover");
    picture.src=safeCover(drama);
    picture.alt="Portada de "+(drama.title||"microdrama");
    picture.loading="eager";
    section.appendChild(picture);
    section.appendChild(el("div","md-mobile-hero__shade"));
    const body=el("div","md-mobile-hero__content");
    body.appendChild(el("div","md-mobile-hero__label",recent(drama)?"RECIÉN AGREGADO":"DESTACADO"));
    body.appendChild(el("h1","md-mobile-hero__title",drama.title));
    const catList=categories().filter(cat=>(cat.drama_ids||[]).map(Number).includes(Number(drama.id))).map(cat=>cat.name).slice(0,3);
    if(catList.length)body.appendChild(el("p","md-mobile-hero__categories",catList.join("  •  ")));
    const actions=el("div","md-mobile-hero__actions");
    const playButton=btn("Reproducir","md-mobile-hero__play",()=>play(drama));
    playButton.insertAdjacentHTML("afterbegin",svg("play"));
    const listButton=btn(hasSaved(drama.id)?"✓ Mi lista":"+ Mi lista","md-mobile-hero__list",async()=>{
      if(!api||!state.mediaState.ready)return;
      await api.toggleSaved(drama.id);
    });
    listButton.disabled=!state.mediaState.ready;
    actions.append(playButton,listButton);
    body.appendChild(actions);
    section.appendChild(body);
    catalog.appendChild(section);
  }
  function header(title="Inicio"){
    const head=el("header","md-mobile-header");
    const brand=el("div","md-mobile-header__brand");
    const icon=el("img","md-mobile-header__logo");
    icon.src=logo;icon.alt="";icon.draggable=false;
    brand.append(icon,el("strong","",title));
    head.appendChild(brand);
    const bell=btn("","md-mobile-bell",()=>toggleNotices(bell));
    bell.innerHTML=svg("bell");
    bell.setAttribute("aria-label","Notificaciones");
    if(state.mediaState.unreadCount>0){
      bell.appendChild(el("span","md-mobile-bell__count",Math.min(99,state.mediaState.unreadCount)));
    }
    head.appendChild(bell);
    catalog.appendChild(head);
  }
  function toggleNotices(bell){
    if(state.noticesOpen){closeNotices();return;}
    state.noticesOpen=true;
    const panel=el("section","md-mobile-notices");
    panel.setAttribute("role","dialog");
    panel.setAttribute("aria-label","Notificaciones");
    const title=el("div","md-mobile-notices__head");
    title.appendChild(el("strong","","Notificaciones"));
    title.appendChild(btn("Cerrar","",closeNotices));
    panel.appendChild(title);
    const notices=state.mediaState.notifications||[];
    if(!state.mediaState.ready)panel.appendChild(el("p","md-mobile-notices__empty","No fue posible cargar tus avisos todavía."));
    else if(!notices.length)panel.appendChild(el("p","md-mobile-notices__empty","No tienes avisos nuevos."));
    else notices.slice(0,30).forEach(notice=>{
      const item=el("div","md-mobile-notice"+(notice.read?"":" is-unread"));
      item.appendChild(el("small","",notice.type==="upcoming"?"PRÓXIMO ESTRENO":"ESTRENO"));
      item.appendChild(el("strong","",notice.title));
      const actions=el("div","md-mobile-notice__actions");
      actions.appendChild(btn(notice.type==="upcoming"?"Añadir a Mi lista":"Ver estreno","",async()=>{
        if(!notice.read)await api?.markRead?.([notice.key]);
        const drama=data().find(x=>Number(x.id)===Number(notice.dramaId));
        if(notice.type==="upcoming"){
          if(drama&&!hasSaved(drama.id))await api?.toggleSaved?.(drama.id);
        }else if(drama)play(drama);
        closeNotices();
      }));
      if(!notice.read)actions.appendChild(btn("Leído","",async()=>{await api?.markRead?.([notice.key]);closeNotices();}));
      item.appendChild(actions);
      panel.appendChild(item);
    });
    document.body.appendChild(panel);
  }
  function home(){
    header("Inicio");
    const all=data();
    const available=all.filter(published);
    const upcoming=all.filter(draft);
    const fresh=available.filter(recent).sort((a,b)=>dateTime(b.published_at)-dateTime(a.published_at));
    const top=available.filter(playable).sort(ranking).slice(0,10);
    hero(state.featured);
    const progress=(state.mediaState.progress||[]).filter(p=>
      !p.completed&&Number(p.positionMs)>=5000&&Number(p.durationMs)>Number(p.positionMs)+4000
    ).sort((a,b)=>String(b.updatedAt||"").localeCompare(String(a.updatedAt||"")));
    const byId=new Map(available.map(x=>[Number(x.id),x]));
    const progressMap=new Map(progress.map(x=>[Number(x.dramaId),x]));
    const inProgress=progress.map(x=>byId.get(Number(x.dramaId))).filter(Boolean);
    row("Continuar viendo",inProgress,"md-mob-continuar",false,progressMap);
    row("Próximos estrenos",upcoming,"md-mob-proximos");
    row("Recién agregados",fresh,"md-mob-recientes");
    row("Top 10",top,"md-mob-top",true);
    categories().forEach(category=>{
      const ids=new Set((category.drama_ids||[]).map(Number));
      row(category.name,available.filter(d=>ids.has(Number(d.id))),"md-mob-cat-"+category.slug);
    });
  }
  function search(){
    header("Buscar");
    const wrap=el("section","md-mobile-search-page");
    const input=el("input","md-mobile-search-page__input");
    input.type="search";input.placeholder="Buscar microdramas...";
    input.setAttribute("aria-label","Buscar microdramas");
    input.value=state.search;
    const results=el("div","md-mobile-search-page__results");
    const draw=()=>{
      results.replaceChildren();
      const normalize=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
      const needle=normalize(state.search.trim());
      const matched=data().filter(d=>!needle||normalize(d.title).includes(needle)||normalize(d.description).includes(needle));
      if(!matched.length)results.appendChild(el("p","md-mobile-empty","No hay resultados."));
      matched.forEach(d=>originalCard(d,results));
    };
    input.addEventListener("input",()=>{state.search=input.value;draw();});
    wrap.append(input,results);catalog.appendChild(wrap);draw();
  }
  function myList(){
    header("Mi lista");
    const ids=new Set((state.mediaState.watchlist||[]).map(Number));
    const saved=data().filter(x=>ids.has(Number(x.id)));
    if(saved.length)row("Guardados para después",saved,"md-mob-lista");
    else catalog.appendChild(el("p","md-mobile-empty",
      state.mediaState.ready?"Todavía no has guardado microdramas. Añádelos desde la portada destacada.":"Conectando Mi lista con tu cuenta..."));
  }
  function profile(){
    header("Perfil");
    const section=el("section","md-mobile-profile");
    const avatar=el("img","md-mobile-profile__avatar");
    const file=/^avatar-[1-8]\.png$/.test(state.user?.avatar||"")?state.user.avatar:"avatar-1.png";
    avatar.src="/assets/"+file;
    avatar.alt="Avatar del usuario";
    section.appendChild(avatar);
    section.appendChild(el("h2","",state.user?.displayName||"Mi perfil"));
    section.appendChild(el("p","",state.mediaState.ready?"Mi lista y progreso se guardan en tu cuenta.":"Sincronización de perfil no disponible en este momento."));
    section.appendChild(btn("Cerrar sesión","md-mobile-profile__logout",()=>{
      window.location.href="/api/session/logout";
    }));
    catalog.appendChild(section);
  }
  function render(){
    if(!state.mounted||!media.matches)return;
    closeNotices();
    catalog.replaceChildren();
    catalog.classList.add("md-mobile-app");
    if(state.tab==="search")search();
    else if(state.tab==="mylist")myList();
    else if(state.tab==="profile")profile();
    else home();
    nav?.querySelectorAll("[data-tab]").forEach(button=>{
      const selected=button.dataset.tab===state.tab;
      button.classList.toggle("is-active",selected);
      button.setAttribute("aria-current",selected?"page":"false");
    });
  }
  function navigate(tab){
    if(!["home","search","mylist","profile"].includes(tab))tab="home";
    state.tab=tab;
    state.search=tab==="search"?state.search:"";
    render();
    window.scrollTo({top:0,behavior:"smooth"});
  }
  function createNav(){
    nav=el("nav","md-mobile-bottom-bar");
    nav.setAttribute("aria-label","Navegación móvil");
    const items=[["home","Inicio","home"],["search","Buscar","search"],["list","Mi lista","mylist"],["person","Perfil","profile"]];
    items.forEach(([icon,label,tab])=>{
      const item=btn("","md-mobile-bottom-bar__button",()=>navigate(tab));
      item.dataset.tab=tab;
      item.innerHTML=svg(icon)+'<span>'+label+'</span>';
      item.setAttribute("aria-label",label);
      nav.appendChild(item);
    });
    const light=el("span","md-mobile-bottom-bar__light");
    nav.appendChild(light);
    nav.addEventListener("click",event=>{
      const button=event.target.closest("[data-tab]");
      if(button)light.style.setProperty("--active-index",String([...nav.querySelectorAll("[data-tab]")].indexOf(button)));
    });
    document.body.appendChild(nav);
  }
  async function readUser(){
    try{
      const res=await fetch("/api/auth/me",{credentials:"same-origin",cache:"no-store"});
      if(!res.ok)return;
      const json=await res.json();
      if(!state.mounted)return;
      if(json?.authenticated&&json.user)state.user=json.user;
      if(state.tab==="profile")render();
    }catch(error){console.warn("[Web móvil] Perfil:",error);}
  }
  function mount(){
    if(state.mounted||!media.matches||!data().length)return;
    state.mounted=true;
    const publishedDramas=data().filter(playable);
    const suggested=publishedDramas.filter(recent);
    state.featured=(suggested.length?suggested:publishedDramas).sort(ranking)[0]||null;
    createNav();
    render();
    unsubscribe=api?.subscribe?.(snapshot=>{
      const old=state.mediaState;
      state.mediaState=snapshot;
      const changed=old.ready!==snapshot.ready||
        JSON.stringify(old.watchlist)!==JSON.stringify(snapshot.watchlist)||
        JSON.stringify(old.progress)!==JSON.stringify(snapshot.progress)||
        JSON.stringify(old.notifications)!==JSON.stringify(snapshot.notifications);
      if(changed){
        if(document.body.classList.contains("video-player-open"))rebuildPending=true;
        else render();
      }
    });
    bodyObserver=new MutationObserver(()=>{
      if(rebuildPending&&!document.body.classList.contains("video-player-open")){
        rebuildPending=false;render();
      }
    });
    bodyObserver.observe(document.body,{attributes:true,attributeFilter:["class"]});
    readUser();
    installBackNavigation();
  }
  let backInstalled=false;
  function installBackNavigation(){
    if(backInstalled)return;
    backInstalled=true;
    const key="mdMobileCatalogV2";
    try {
      history.replaceState({...history.state,[key]:"base"},"",location.href);
      history.pushState({...history.state,[key]:"catalog"},"",location.href);
    }catch{}
    window.addEventListener("popstate",()=>{
      if(!media.matches||history.state?.[key]!=="base")return;
      const portal=document.querySelector("#mega-videostream-portal-player.is-open");
      if(portal)window.__microDramasMegaVideoStream?.stop?.();
      else if(document.body.classList.contains("mobile-detail-open"))
        window.cerrarDetalleMovil?.();
      else navigate("home");
      try{history.pushState({...history.state,[key]:"catalog"},"",location.href);}catch{}
    });
  }
  function unmount(){
    if(!state.mounted)return;
    state.mounted=false;
    closeNotices();
    unsubscribe?.();unsubscribe=null;
    bodyObserver?.disconnect();bodyObserver=null;
    nav?.remove();nav=null;
    catalog.classList.remove("md-mobile-app");
    catalog.replaceChildren();
    // Desktop puede recuperar su propio home sin tocar el reproductor.
    if(typeof filtrarDramasPorCategoria==="function")filtrarDramasPorCategoria();
    else data().forEach(crearTarjetaDrama);
  }
  const observer=new MutationObserver(()=>{
    if(!state.mounted&&media.matches&&catalog.querySelector(":scope > .drama-card"))mount();
  });
  observer.observe(catalog,{childList:true});
  if(media.matches&&catalog.querySelector(":scope > .drama-card"))mount();
  media.addEventListener("change",()=>{if(media.matches)mount();else unmount();});
  window.MDMobileHome={navigate,refresh:()=>{if(state.mounted)render();}};
})();