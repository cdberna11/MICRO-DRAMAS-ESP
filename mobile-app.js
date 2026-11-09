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
  // La selección se genera una sola vez al entrar/cargar la página.
  // Dos títulos antiguos se reservan antes que los populares para evitar
  // que el ranking consuma todas las opciones de sugeridos.
  function chooseRandomDistinct(items,count) {
    const shuffled=[...items];
    for(let i=shuffled.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];
    }
    return shuffled.slice(0,count);
  }
  function buildFeaturedSelection() {
    const all=data(),available=all.filter(playable);
    const now=Date.now();
    const old=available.filter(drama=>{
      const timestamp=dateTime(drama.published_at)||dateTime(drama.created_at);
      return timestamp>0&&now-timestamp>=7*86400000;
    });
    const oldChosen=chooseRandomDistinct(old,2);
    const selected=new Set(oldChosen.map(drama=>Number(drama.id)));
    function takeGroup(items,type,count) {
      const output=[];
      for(const drama of items){
        const id=Number(drama.id);
        if(!Number.isSafeInteger(id)||selected.has(id))continue;
        selected.add(id);
        output.push({drama,type});
        if(output.length>=count)break;
      }
      return output;
    }
    const recently=takeGroup(
      available.filter(recent).sort((a,b)=>dateTime(b.published_at)-dateTime(a.published_at)||Number(b.id)-Number(a.id)),
      "recent",2
    );
    const upcoming=takeGroup(
      all.filter(draft).sort((a,b)=>dateTime(b.created_at)-dateTime(a.created_at)||Number(b.id)-Number(a.id)),
      "upcoming",2
    );
    const popular=takeGroup([...available].sort(ranking),"popular",2);
    const suggested=oldChosen.map(drama=>({drama,type:"suggested"}));
    const selectedItems=[...recently,...upcoming,...popular,...suggested];
    // Catálogo pequeño: mantener una portada válida sin duplicar títulos.
    if(!selectedItems.length&&available.length)
      selectedItems.push({drama:[...available].sort(ranking)[0],type:"popular"});
    state.featuredItems=selectedItems;
    state.featuredIndex=0;
  }
  const labels={
    recent:"RECIÉN AGREGADO",
    upcoming:"PRÓXIMAMENTE",
    popular:"DESTACADOS",
    suggested:"SUGERIDOS"
  };
  function setFeaturedIndex(index) {
    const count=state.featuredItems.length;
    if(!count)return;
    state.featuredIndex=(index+count)%count;
    heroUpdater?.();
  }
  function startFeaturedRotation() {
    if(heroTimer!==null)window.clearInterval(heroTimer);
    heroTimer=null;
    if(state.featuredItems.length<2)return;
    heroTimer=window.setInterval(()=>{
      if(!state.mounted||state.tab!=="home"||document.visibilityState!=="visible"||
         document.body.classList.contains("video-player-open")||
         document.body.classList.contains("mobile-detail-open"))return;
      setFeaturedIndex(state.featuredIndex+1);
    },8500);
  }
  const state={mounted:false,tab:"home",featuredItems:[],featuredIndex:0,mediaState:api?.snapshot?.()||{ready:false,progress:[],watchlist:[],notifications:[],unreadCount:0},user:null,search:"",noticesOpen:false};
  let nav=null,unsubscribe=null,bodyObserver=null,rebuildPending=false;
  let heroUpdater=null,heroTimer=null;
  const hasSaved=id=>state.mediaState.watchlist?.some(x=>Number(x)===Number(id));
  function safeCover(drama){return String(drama?.cover_url||"").trim()||coverFallback;}
  function closeNotices() {
    document.querySelector(".md-mobile-notices")?.remove();
    state.noticesOpen=false;
  }
  function play(drama) {
    if(!playable(drama))return;
    pushScreen("player");
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
    // Crear la entrada ANTES de que app.js abra el detalle (fase capture).
    // Así Atrás vuelve a este carrusel, no a la pestaña Inicio.
    wrapper.addEventListener("click",event=>{
      if(event.target.closest("button,a"))return;
      if(!document.body.classList.contains("mobile-detail-open"))
        pushScreen("detail");
    },true);
    // Marcador en cada portada: Mi lista real por cuenta, incluso en próximos estrenos.
    const mark=btn("","md-mobile-item__save",async event=>{
      event.stopPropagation();
      if(state.mediaState.ready)await api?.toggleSaved?.(drama.id);
    });
    mark.innerHTML=svg("list");
    mark.setAttribute("aria-label",(hasSaved(drama.id)?"Quitar de Mi lista: ":"Añadir a Mi lista: ")+drama.title);
    mark.setAttribute("aria-pressed",String(Boolean(hasSaved(drama.id))));
    mark.classList.toggle("is-saved",Boolean(hasSaved(drama.id)));
    mark.disabled=!state.mediaState.ready;
    wrapper.appendChild(mark);
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
  function hero(){
    if(!state.featuredItems.length)return;
    const section=el("section","md-mobile-hero");
    section.setAttribute("aria-label","Microdramas sugeridos");
    section.setAttribute("aria-roledescription","carrusel");
    const picture=el("img","md-mobile-hero__cover");
    picture.loading="eager";
    section.appendChild(picture);
    section.appendChild(el("div","md-mobile-hero__shade"));
    const body=el("div","md-mobile-hero__content");
    const badge=el("div","md-mobile-hero__label");
    const title=el("h1","md-mobile-hero__title");
    const categoryText=el("p","md-mobile-hero__categories");
    body.append(badge,title,categoryText);
    const actions=el("div","md-mobile-hero__actions");
    const playButton=btn("Reproducir","md-mobile-hero__play",()=>{
      const current=state.featuredItems[state.featuredIndex];
      if(current&&current.type!=="upcoming")play(current.drama);
    });
    playButton.insertAdjacentHTML("afterbegin",svg("play"));
    const listButton=btn("+ Mi lista","md-mobile-hero__list",async()=>{
      const current=state.featuredItems[state.featuredIndex];
      if(current&&api&&state.mediaState.ready)await api.toggleSaved(current.drama.id);
    });
    actions.append(playButton,listButton);
    body.appendChild(actions);
    section.appendChild(body);

    const dots=el("div","md-mobile-hero__dots");
    const dotButtons=state.featuredItems.map((item,index)=>{
      const dot=btn("","md-mobile-hero__dot",()=>setFeaturedIndex(index));
      dot.setAttribute("aria-label","Mostrar sugerencia "+(index+1)+": "+item.drama.title);
      dots.appendChild(dot);
      return dot;
    });
    if(dotButtons.length>1)section.appendChild(dots);
    catalog.appendChild(section);

    // Cambiar solo el póster: no reconstruir las filas mientras se exploran.
    heroUpdater=()=>{
      if(!state.mounted||state.tab!=="home")return;
      const current=state.featuredItems[state.featuredIndex];
      if(!current)return;
      const drama=current.drama;
      picture.src=safeCover(drama);
      picture.alt="Portada de "+(drama.title||"microdrama");
      badge.textContent=labels[current.type]||"DESTACADOS";
      badge.dataset.kind=current.type;
      title.textContent=drama.title||"Microdrama";
      const catNames=categories().filter(cat=>(cat.drama_ids||[]).map(Number).includes(Number(drama.id)))
        .map(cat=>cat.name).slice(0,3);
      categoryText.textContent=catNames.join("  •  ");
      categoryText.hidden=!catNames.length;
      const coming=current.type==="upcoming"||draft(drama);
      playButton.hidden=coming;
      playButton.disabled=coming;
      listButton.disabled=!state.mediaState.ready;
      listButton.textContent=hasSaved(drama.id)?"✓ Mi lista":"+ Mi lista";
      listButton.setAttribute("aria-label",
        (hasSaved(drama.id)?"Quitar de Mi lista: ":"Añadir a Mi lista: ")+drama.title);
      dotButtons.forEach((dot,index)=>{
        dot.classList.toggle("is-active",index===state.featuredIndex);
        dot.setAttribute("aria-current",index===state.featuredIndex?"true":"false");
      });
    };
    let startX=0,startY=0;
    section.addEventListener("touchstart",event=>{
      if(event.target.closest("button"))return;
      const touch=event.touches?.[0];
      if(!touch)return;
      startX=touch.clientX;startY=touch.clientY;
    },{passive:true});
    section.addEventListener("touchend",event=>{
      if(!startX||state.featuredItems.length<2)return;
      const touch=event.changedTouches?.[0];
      if(!touch)return;
      const dx=touch.clientX-startX,dy=touch.clientY-startY;
      startX=0;startY=0;
      if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.25)
        setFeaturedIndex(state.featuredIndex+(dx<0?1:-1));
    },{passive:true});
    heroUpdater();
  }

  function header(title="Inicio"){
    const head=el("header","md-mobile-header");
    const brand=el("div","md-mobile-header__brand");
    const icon=el("img","md-mobile-header__logo");
    icon.src=logo;icon.alt="";icon.draggable=false;
    if(title==="MICRODRAMAS EN ESPAÑOL"){
      const name=el("strong","md-mobile-header__brand-name");
      name.setAttribute("aria-label","MICRODRAMAS EN ESPAÑOL");
      name.append(el("span","","MICRODRAMAS"),el("span","","EN ESPAÑOL"));
      brand.append(icon,name);
    } else {
      brand.append(icon,el("strong","",title));
    }
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
    header("MICRODRAMAS EN ESPAÑOL");
    const all=data();
    const available=all.filter(published);
    const upcoming=all.filter(draft);
    const fresh=available.filter(recent).sort((a,b)=>dateTime(b.published_at)-dateTime(a.published_at));
    const top=available.filter(playable).sort(ranking).slice(0,10);
    hero();
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
    heroUpdater=null;
    catalog.replaceChildren();
    catalog.classList.add("md-mobile-app");
    if(state.tab==="search")search();
    else if(state.tab==="mylist")myList();
    else if(state.tab==="profile")profile();
    else home();
    nav?.querySelectorAll("[data-tab]").forEach((button,index)=>{
      const selected=button.dataset.tab===state.tab;
      button.classList.toggle("is-active",selected);
      button.setAttribute("aria-current",selected?"page":"false");
      if(selected)nav.style.setProperty("--active-index",String(index));
    });
  }
  function navigate(tab,options={}) {
    if(!["home","search","mylist","profile"].includes(tab))tab="home";
    const change=state.tab!==tab;
    if(change&&!options.fromHistory)rememberCurrentScreen();
    state.tab=tab;
    // La búsqueda se conserva al cambiar de pestaña o volver desde un detalle.
    render();
    if(options.fromHistory)return;
    window.scrollTo({top:0,behavior:"smooth"});
    if(change&&historyActive){
      const next=snapshotScreen("catalog");
      next.scrollY=0;
      next.rails=[];
      try{history.pushState({...history.state,[NAV_KEY]:next},"",location.href);}
      catch(error){console.warn("[Navegación móvil] No se pudo guardar la pestaña:",error);}
    }else rememberCurrentScreen();
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
      if(state.tab==="profile")renderKeepingPosition();
    }catch(error){console.warn("[Web móvil] Perfil:",error);}
  }

  // Se conserva la renovación de sesión que ya existía en la web móvil.
  // Importante para no perder la autenticación durante reproducciones largas.
  let keepAliveInstalled=false;
  function installSessionKeepAlive(){
    if(keepAliveInstalled)return;
    keepAliveInstalled=true;
    let last=Date.now(),running=false;
    async function renew(){
      if(!media.matches||document.visibilityState!=="visible"||running||
        Date.now()-last<20*60*1000)return;
      running=true;
      try{
        const response=await fetch("/api/auth/me",{
          credentials:"same-origin",cache:"no-store",
          headers:{Accept:"application/json"}
        });
        if(response.ok)last=Date.now();
      }catch(error){console.warn("[Web móvil] Renovación de sesión:",error);}
      finally{running=false;}
    }
    window.setInterval(renew,20*60*1000);
    window.addEventListener("pageshow",renew);
    document.addEventListener("visibilitychange",renew);
  }

  function mount(){
    if(state.mounted||!media.matches||!data().length)return;
    state.mounted=true;
    buildFeaturedSelection();
    createNav();
    startFeaturedRotation();
    installSessionKeepAlive();
    render();
    unsubscribe=api?.subscribe?.(snapshot=>{
      const old=state.mediaState;
      state.mediaState=snapshot;
      const changed=old.ready!==snapshot.ready||
        JSON.stringify(old.watchlist)!==JSON.stringify(snapshot.watchlist)||
        JSON.stringify(old.progress)!==JSON.stringify(snapshot.progress)||
        JSON.stringify(old.notifications)!==JSON.stringify(snapshot.notifications);
      if(changed){
        if(overlayOpen())rebuildPending=true;
        else renderKeepingPosition();
      }
    });
    bodyObserver=new MutationObserver(()=>{
      // También observa aperturas programáticas del detalle o del Motor E.
      if(!historyRestoring && historyActive){
        const layer=history.state?.[NAV_KEY]?.layer;
        if(playerVisible()&&layer!=="player")pushScreen("player");
        else if(detailVisible()&&!playerVisible()&&layer==="catalog")pushScreen("detail");
        else if(layer==="player"&&!playerVisible()&&!detailVisible())history.back();
        else if(layer==="detail"&&!detailVisible()&&!playerVisible())history.back();
      }
      if(rebuildPending&&!overlayOpen()){
        rebuildPending=false;
        renderKeepingPosition();
      }
    });
    bodyObserver.observe(document.body,{attributes:true,attributeFilter:["class"]});
    readUser();
    installBackNavigation();
  }
  /* Android Atrás usa el historial REAL de pantallas:
     catálogo/pestaña -> detalle -> reproductor.
     No se crean entradas falsas para enviar siempre a Inicio. */
  const NAV_KEY="mdMobileNavigationV4";
  let backInstalled=false,historyActive=false,historyRestoring=false;

  function playerVisible() {
    return Boolean(document.querySelector(
      "#mega-videostream-portal-player.is-open, #md-player.is-open"
    ));
  }
  function detailVisible() {
    return Boolean(document.querySelector("#detalle-movil.is-open"));
  }
  function overlayOpen() {
    return document.body.classList.contains("video-player-open")||
      document.body.classList.contains("mobile-detail-open")||
      playerVisible()||detailVisible();
  }
  function snapshotScreen(layer) {
    return {
      layer,
      tab:state.tab,
      search:state.search,
      featuredIndex:state.featuredIndex,
      scrollY:Math.max(0,Number(window.scrollY||window.pageYOffset)||0),
      rails:Array.from(catalog.querySelectorAll(".md-mobile-section")).map(section=>({
        id:section.id,
        left:Number(section.querySelector(".md-mobile-rail")?.scrollLeft)||0
      })),
      detailScroll:Number(document.querySelector("#detalle-movil .mobile-detail__panel")?.scrollTop)||0
    };
  }
  function restoreScreen(screen) {
    if(!screen)return;
    const restore=()=>{
      if(!state.mounted||!media.matches)return;
      if(Array.isArray(screen.rails)){
        screen.rails.forEach(item=>{
          const section=Array.from(catalog.querySelectorAll(".md-mobile-section"))
            .find(node=>node.id===item.id);
          const rail=section?.querySelector(".md-mobile-rail");
          if(rail)rail.scrollLeft=Math.max(0,Number(item.left)||0);
        });
      }
      if(detailVisible()){
        const panel=document.querySelector("#detalle-movil .mobile-detail__panel");
        if(panel)panel.scrollTop=Math.max(0,Number(screen.detailScroll)||0);
      }
      window.scrollTo({top:Math.max(0,Number(screen.scrollY)||0),left:0,behavior:"instant"});
    };
    window.requestAnimationFrame(()=>{
      restore();
      window.requestAnimationFrame(restore);
    });
  }
  function renderKeepingPosition() {
    if(!state.mounted)return;
    const current=snapshotScreen(history.state?.[NAV_KEY]?.layer||"catalog");
    render();
    restoreScreen(current);
  }
  function rememberCurrentScreen() {
    if(!historyActive)return;
    const previous=history.state?.[NAV_KEY];
    if(!previous)return;
    try{
      history.replaceState({...history.state,[NAV_KEY]:snapshotScreen(previous.layer)},"",location.href);
    }catch(error){console.warn("[Navegación móvil] No se pudo registrar la posición:",error);}
  }
  function pushScreen(layer) {
    if(!state.mounted||!media.matches||!historyActive||historyRestoring)return;
    if(history.state?.[NAV_KEY]?.layer===layer)return;
    rememberCurrentScreen();
    try{
      history.pushState({...history.state,[NAV_KEY]:snapshotScreen(layer)},"",location.href);
    }catch(error){console.warn("[Navegación móvil] No se pudo abrir historial:",error);}
  }
  function closeMobileDetail() {
    if(typeof window.cerrarDetalleMovil==="function"){
      window.cerrarDetalleMovil();
      return;
    }
    const detail=document.getElementById("detalle-movil");
    if(detail){
      detail.classList.remove("is-open");
      detail.setAttribute("aria-hidden","true");
    }
    document.body.classList.remove("mobile-detail-open");
  }
  function closeActivePlayer() {
    const player=window.__microDramasMegaVideoStream;
    if(player?.stop)player.stop();
    else if(typeof window.detenerReproductor==="function")window.detenerReproductor();
    if(document.fullscreenElement)
      document.exitFullscreen?.().catch(()=>{});
  }
  function installBackNavigation() {
    if(backInstalled)return;
    backInstalled=true;
    try{
      const previous=history.state&&typeof history.state==="object"?{...history.state}:{};
      // Limpiar la marca obsoleta sin fabricar una entrada extra.
      delete previous.mdMobileCatalogV2;
      history.replaceState({...previous,[NAV_KEY]:snapshotScreen("catalog")},"",location.href);
      historyActive=true;
    }catch(error){
      console.warn("[Navegación móvil] Historial no disponible:",error);
      return;
    }

    // Los botones × hacen exactamente lo mismo que el gesto/botón Atrás.
    // Capturar antes de que app.js/Motor E cierren sin actualizar history.
    document.addEventListener("click",event=>{
      if(!state.mounted||!media.matches)return;
      const target=event.target;
      const layer=history.state?.[NAV_KEY]?.layer;
      const closePlayer=target.closest(
        ".mega-videostream-portal__close, .mega-videostream-portal__backdrop, .md-player__close"
      );
      const closeDetail=target.closest(".mobile-detail__close, .mobile-detail__backdrop");
      if((closePlayer&&layer==="player")||(closeDetail&&layer==="detail")){
        event.preventDefault();
        event.stopImmediatePropagation();
        history.back();
        return;
      }
      // El botón Ver pertenece a app.js y abre el Motor E directamente.
      if(target.closest(".mobile-detail__play")&&detailVisible())pushScreen("player");
    },true);

    window.addEventListener("popstate",event=>{
      if(!state.mounted||!media.matches)return;
      const screen=event.state?.[NAV_KEY];
      if(!screen)return; // Atrás desde la raíz: historial normal del navegador.
      historyRestoring=true;
      if(playerVisible())closeActivePlayer();
      if(screen.layer==="catalog"&&detailVisible())closeMobileDetail();
      const newTab=["home","search","mylist","profile"].includes(screen.tab)?screen.tab:"home";
      const nextSearch=String(screen.search||"");
      const needsRender=state.tab!==newTab||state.search!==nextSearch;
      state.tab=newTab;
      state.search=nextSearch;
      if(Number.isSafeInteger(screen.featuredIndex))state.featuredIndex=screen.featuredIndex;
      if(needsRender)render();
      else heroUpdater?.();
      restoreScreen(screen);
      window.requestAnimationFrame(()=>{historyRestoring=false;});
    });
  }

  function unmount(){
    if(!state.mounted)return;
    state.mounted=false;
    if(heroTimer!==null)window.clearInterval(heroTimer);
    heroTimer=null;
    heroUpdater=null;
    state.featuredItems=[];
    state.featuredIndex=0;
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