/* MICRO-DRAMAS-ESP — Home cinematográfico exclusivo de escritorio.
   Reutiliza crearTarjetaDrama() y sus eventos originales: NO altera el reproductor.
   La experiencia <= 600px permanece en app.js / mobile-bottom-nav.js. */
(function () {
  "use strict";

  const media = window.matchMedia("(min-width: 601px)");
  const catalog = document.getElementById("catalogo");
  if (!catalog) return;

  const COVER_FALLBACK = "portadas/generica/portada-generica.png";
  const LOGO = "assets/images/LOGO_MD-SIN FONDO.jpg";
  const icons = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    search: '<circle cx="10.8" cy="10.8" r="7"/><path d="m16 16 5 5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
    play: '<path d="m8 5 12 7-12 7z"/>',
    award: '<path d="M8 3h8v7a4 4 0 0 1-8 0zM8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4M12 14v4m-4 3h8"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    close: '<path d="M5 5 19 19M19 5 5 19"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    bookmark: '<path d="M6 4h12v17l-6-4-6 4z"/>',
    logout: '<path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M14 7l5 5-5 5M9 12h10"/>'
  };
  function svg(name) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (icons[name] || icons.grid) + '</svg>';
  }
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(text, className, click) {
    const item = el("button", className);
    item.type = "button";
    if (text) item.textContent = text;
    if (click) item.addEventListener("click", click);
    return item;
  }
  function safeCover(drama) {
    return (typeof drama.cover_url === "string" && drama.cover_url.trim()) || COVER_FALLBACK;
  }
  function isDraft(drama) {
    return String(drama.status || "").trim().toLowerCase() === "draft" ||
      String(drama.status || "").trim().toLowerCase() === "borrador";
  }
  function isRecent(drama) {
    if (isDraft(drama) || !drama.published_at) return false;
    const raw = String(drama.published_at).trim().replace(" ", "T");
    const parsed = Date.parse(/[zZ]$|[+-]\d\d:\d\d$/.test(raw) ? raw : raw + "Z");
    const elapsed = Date.now() - parsed;
    return Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 7 * 24 * 60 * 60 * 1000;
  }
  function publishedTime(drama) {
    if (!drama.published_at) return 0;
    const raw = String(drama.published_at).trim().replace(" ", "T");
    return Date.parse(/[zZ]$|[+-]\d\d:\d\d$/.test(raw) ? raw : raw + "Z") || 0;
  }
  function dramas() {
    return typeof dramasCatalogo !== "undefined" && Array.isArray(dramasCatalogo) ? dramasCatalogo : [];
  }
  function categories() {
    return typeof categoriasPortal !== "undefined" && Array.isArray(categoriasPortal) ? categoriasPortal : [];
  }
  function unique(list) {
    const ids = new Set();
    return list.filter(drama => {
      const key = Number(drama.id);
      if (ids.has(key)) return false;
      ids.add(key);
      return true;
    });
  }
  function orderedByViews(a, b) {
    return (Number(b.views) || 0) - (Number(a.views) || 0) ||
      (Number(b.period_views) || 0) - (Number(a.period_views) || 0) ||
      Number(b.id) - Number(a.id);
  }
  let mounted = false;
  let dock = null;
  let menu = null;
  let stage = null;
  let content = null;
  let search = null;
  let searchTerm = "";
  let chosenCategory = null;
  let featured = [];
  let featuredIndex = 0;
  let slideInterval = null;
  let myListMode = false;
  let myListReady = false;
  let myListKey = null;
  let myListIds = new Set();
  let authVersion = 0;
  const MY_LIST_PREFIX = "microdramas:desktop:my-list:v1:user:";


  function isSaved(drama) { return myListIds.has(Number(drama.id)); }
  function setSaveAppearance(node, drama) {
    const active = isSaved(drama);
    node.disabled = !myListReady;
    node.classList.toggle("is-saved", active);
    node.setAttribute("aria-pressed", String(active));
    node.setAttribute("aria-label", (active ? "Quitar de Mi lista: " : "Añadir a Mi lista: ") + (drama.title || "microdrama"));
    node.title = !myListReady ? "Cargando Mi lista" : active ? "Quitar de Mi lista" : "Añadir a Mi lista";
  }
  function refreshSaveAppearance() {
    if (!mounted) return;
    catalog.querySelectorAll(".md-desktop-item__save").forEach(node => {
      setSaveAppearance(node, { id: node.dataset.dramaId, title: node.dataset.dramaTitle });
    });
    const heroButton = stage?.querySelector(".md-desktop-hero__save");
    if (heroButton && featured.length) {
      const drama = featured[featuredIndex % featured.length];
      const active = isSaved(drama);
      heroButton.disabled = !myListReady;
      heroButton.classList.toggle("is-saved", active);
      heroButton.setAttribute("aria-pressed", String(active));
      heroButton.textContent = active ? "✓ En Mi lista" : "+ Mi lista";
    }
  }
  function toggleMyList(drama) {
    if (!myListReady || !myListKey) return;
    const id = Number(drama.id);
    if (!Number.isSafeInteger(id) || id <= 0) return;
    const already = myListIds.has(id);
    if (already) myListIds.delete(id); else myListIds.add(id);
    try {
      localStorage.setItem(myListKey, JSON.stringify([...myListIds]));
    } catch (error) {
      if (already) myListIds.add(id); else myListIds.delete(id);
      console.warn("[Mi lista] Error guardando favoritos:", error);
      window.alert("No se pudo guardar Mi lista: habilita el almacenamiento local de este navegador.");
    }
    if (myListMode) rebuildRows();
    else refreshSaveAppearance();
  }
  async function loadUserMyList() {
    const version = ++authVersion;
    myListReady = false;
    myListKey = null;
    myListIds.clear();
    refreshSaveAppearance();
    try {
      const res = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) throw Error("No hay sesión activa");
      const data = await res.json();
      if (!data.authenticated || data.user?.id == null) throw Error("Usuario no identificado");
      const key = MY_LIST_PREFIX + String(data.user.id);
      const saved = JSON.parse(localStorage.getItem(key) || "[]");
      if (!mounted || version !== authVersion) return;
      myListKey = key;
      myListIds = new Set((Array.isArray(saved) ? saved : []).map(Number).filter(id => Number.isSafeInteger(id) && id > 0));
      myListReady = true;
      const avatar = dock?.querySelector(".md-desktop-dock__avatar img");
      if (avatar) {
        const file = /^avatar-[1-8]\.png$/.test(data.user.avatar || "") ? data.user.avatar : "avatar-1.png";
        avatar.src = "/assets/" + file;
        avatar.alt = "Avatar de " + String(data.user.displayName || "usuario");
        avatar.parentElement.title = String(data.user.displayName || "Usuario");
      }
      if (myListMode) rebuildRows(); else refreshSaveAppearance();
    } catch (error) {
      if (!mounted || version !== authVersion) return;
      console.warn("[Mi lista] No se pudo cargar la sesión o los datos locales:", error);
      myListReady = false;
      myListKey = null;
      if (myListMode) rebuildRows(); else refreshSaveAppearance();
    }
  }
  function addExistingCard(drama, destination, rank) {
    crearTarjetaDrama(drama);
    const original = catalog.lastElementChild;
    if (!original?.classList.contains("drama-card")) return;
    const wrapper = el("div", "md-desktop-item");
    original.dataset.dramaId = String(drama.id);
    const image = original.querySelector(".drama-card__cover");
    if (image) image.draggable = false;
    if (rank) {
      wrapper.classList.add("md-desktop-item--ranked");
      wrapper.appendChild(el("span", "md-rank-number", String(rank)));
    }
    const ribbon = original.querySelector(".drama-card__new");
    if (ribbon) ribbon.textContent = "ESTRENO";
    wrapper.appendChild(original);
    const save = button("", "md-desktop-item__save", () => toggleMyList(drama));
    save.innerHTML = svg("bookmark");
    save.dataset.dramaId = String(drama.id);
    save.dataset.dramaTitle = String(drama.title || "Microdrama");
    setSaveAppearance(save, drama);
    wrapper.appendChild(save);
    wrapper.appendChild(el("p", "md-desktop-item__title", drama.title || "Microdrama"));
    destination.appendChild(wrapper);
  }



  function makeDraggable(rail) {
    let active = null, origin = 0, initialScroll = 0, dragged = false, swallowClick = false;
    rail.addEventListener("pointerdown", e => {
      if (e.pointerType !== "mouse" || e.button !== 0 || e.target.closest("button,a,input")) return;
      active = e.pointerId;
      origin = e.clientX;
      initialScroll = rail.scrollLeft;
      dragged = false;
      swallowClick = false;
    });
    rail.addEventListener("pointermove", e => {
      if (active !== e.pointerId) return;
      const delta = e.clientX - origin;
      if (!dragged && Math.abs(delta) > 6) {
        dragged = true;
        swallowClick = true;
        rail.classList.add("is-dragging");
        try { rail.setPointerCapture(e.pointerId); } catch (_) {}
      }
      if (dragged) {
        rail.scrollLeft = initialScroll - delta;
        e.preventDefault();
      }
    });
    function release(e) {
      if (active !== e.pointerId) return;
      active = null;
      dragged = false;
      rail.classList.remove("is-dragging");
      if (rail.hasPointerCapture?.(e.pointerId)) rail.releasePointerCapture(e.pointerId);
      window.setTimeout(() => { swallowClick = false; }, 0);
    }
    rail.addEventListener("pointerup", release);
    rail.addEventListener("pointercancel", release);
    rail.addEventListener("lostpointercapture", () => rail.classList.remove("is-dragging"));
    rail.addEventListener("dragstart", e => e.preventDefault());
    rail.addEventListener("click", e => {
      if (!swallowClick) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);
  }
  function createRow(title, list, id, ranked) {
    if (!list.length) return null;
    const section = el("section", "md-desktop-section" + (ranked ? " md-desktop-section--ranked" : ""));
    section.id = id;
    const heading = el("div", "md-desktop-section__heading");
    heading.appendChild(el("h2", "", title));
    section.appendChild(heading);
    const rail = el("div", "md-desktop-row");
    rail.setAttribute("aria-label", "Carrusel de " + title + ". Arrastra horizontalmente con el mouse para recorrerlo.");
    list.forEach((drama, i) => addExistingCard(drama, rail, ranked ? i + 1 : 0));
    makeDraggable(rail);
    section.appendChild(rail);
    content.appendChild(section);
    return section;
  }


  function createEmptyContinue() {
    const section = el("section", "md-desktop-section md-desktop-continue");
    section.id = "md-continuar";
    section.appendChild(el("h2", "md-desktop-section__solo-title", "Continuar viendo"));
    const empty = el("div", "md-desktop-continue__empty");
    empty.innerHTML = svg("clock");
    empty.appendChild(el("span", "", "Los microdramas pendientes aparecerán aquí cuando esté disponible el historial de reproducción."));
    section.appendChild(empty);
    content.appendChild(section);
  }

  function rebuildRows() {
    if (!mounted || !content) return;
    content.replaceChildren();
    const all = dramas();
    const available = all.filter(drama => !isDraft(drama));
    const upcoming = all.filter(isDraft);
    const premieres = available.filter(isRecent)
      .sort((a, b) => publishedTime(b) - publishedTime(a) || Number(b.id) - Number(a.id));
    const top = [...available].sort(orderedByViews).slice(0, 10);
    if (myListMode) {
      if (stage) stage.hidden = true;
      const savedDramas = all.filter(isSaved);
      if (savedDramas.length) createRow("Mi lista", savedDramas, "md-mi-lista", false);
      else content.appendChild(el("p", "md-desktop-message",
        myListReady ? "Tu lista está vacía. Usa el marcador de las tarjetas para guardar microdramas."
          : "No se pudo cargar Mi lista. Verifica tu sesión y el almacenamiento del navegador."));
      return;
    }

    if (searchTerm) {
      const normalize = str => String(str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const phrase = normalize(searchTerm);
      const matches = all.filter(drama =>
        normalize(drama.title).includes(phrase) ||
        normalize(drama.description).includes(phrase) ||
        normalize(drama.platform).includes(phrase)
      );
      createRow("Resultados para «" + searchTerm + "»", matches, "md-resultados", false);
      if (!matches.length) content.appendChild(el("p", "md-desktop-message", "No se encontraron microdramas con ese nombre."));
      if (stage) stage.hidden = true;
      return;
    }

    if (chosenCategory) {
      const category = categories().find(item => item.slug === chosenCategory);
      const ids = new Set((category?.drama_ids || []).map(Number));
      const matches = available.filter(drama => ids.has(Number(drama.id)));
      createRow(category?.name || "Categoría", matches, "md-categoria-activa", false);
      if (!matches.length) content.appendChild(el("p", "md-desktop-message", "Esta categoría todavía no tiene microdramas publicados."));
      if (stage) stage.hidden = true;
      return;
    }

    if (stage) stage.hidden = false;
    createEmptyContinue();
    createRow("Próximos estrenos", upcoming, "md-proximos", false);
    createRow("Estrenos", premieres, "md-estrenos", false);
    createRow("Top 10", top, "md-top10", true);
    categories().forEach(category => {
      const ids = new Set((category.drama_ids || []).map(Number));
      const sectionDramas = available.filter(drama => ids.has(Number(drama.id)));
      createRow(category.name, sectionDramas, "md-cat-" + category.slug, false);
    });
    if (!available.length && !upcoming.length) {
      content.appendChild(el("p", "md-desktop-message", "No hay microdramas disponibles."));
    }
  }


  function createHeader() {
    const header = el("header", "md-desktop-header");
    const brand = el("div", "md-desktop-brand");
    const image = el("img", "");
    image.src = LOGO;
    image.alt = "Micro Dramas";
    brand.appendChild(image);
    header.appendChild(brand);
    catalog.appendChild(header);
  }


  function featuredAnchor(drama) {
    const bin = catalog.querySelector(".md-desktop-anchors");
    if (!bin) return null;
    let card = Array.from(bin.children).find(node => node.dataset.dramaId === String(drama.id));
    if (!card) {
      crearTarjetaDrama(drama);
      card = catalog.lastElementChild;
      if (!card?.classList.contains("drama-card")) return null;
      card.dataset.dramaId = String(drama.id);
      bin.appendChild(card);
    }
    return card;
  }

  function showFeatured() {
    if (!mounted || !stage || stage.hidden || !featured.length) return;
    const drama = featured[featuredIndex % featured.length];
    const cover = stage.querySelector(".md-desktop-hero__image");
    cover.src = safeCover(drama);
    cover.alt = "";
    const blur = stage.querySelector(".md-desktop-hero__blur");
    blur.style.backgroundImage = 'url("' + encodeURI(safeCover(drama)).replace(/"/g, "%22") + '")';
    stage.querySelector(".md-desktop-hero__eyebrow").textContent = isDraft(drama) ? "PRÓXIMO ESTRENO" :
      isRecent(drama) ? "ESTRENO" : "DESTACADO";
    stage.querySelector(".md-desktop-hero__title").textContent = drama.title || "Microdrama";
    stage.querySelector(".md-desktop-hero__description").textContent =
      String(drama.video_description || drama.description || "Disfruta de esta historia en Micro Dramas.").trim().slice(0, 310);
    stage.querySelector(".md-desktop-hero__meta").textContent = "Microdrama  •  " +
      (isDraft(drama) ? "Próximamente" : "Disponible ahora") +
      (Number(drama.views) ? "  •  " + Number(drama.views).toLocaleString("es") + " vistas" : "");
    const play = stage.querySelector(".md-desktop-hero__play");
    play.hidden = isDraft(drama);
    play.onclick = () => featuredAnchor(drama)?.querySelector(".drama-card__play")?.click();
    const detail = stage.querySelector(".md-desktop-hero__detail");
    detail.onclick = () => featuredAnchor(drama)?.querySelector(".drama-card__cover")?.click();
    refreshSaveAppearance();
    const indicators = stage.querySelector(".md-desktop-hero__dots");
    indicators.replaceChildren();
    featured.forEach((_, index) => {
      const dot = button("", "md-desktop-hero__dot" + (index === featuredIndex ? " is-active" : ""), () => {
        featuredIndex = index;
        showFeatured();
      });
      dot.setAttribute("aria-label", "Ver destacado " + (index + 1));
      indicators.appendChild(dot);
    });
  }

  function createHero() {
    const published = dramas().filter(drama => !isDraft(drama));
    const recents = [...published].filter(isRecent).sort((a, b) => publishedTime(b) - publishedTime(a));
    const popular = [...published].sort(orderedByViews);
    const newest = [...published].sort((a, b) => publishedTime(b) - publishedTime(a));
    featured = unique([...recents.slice(0, 2), ...popular.slice(0, 2), ...newest.slice(0, 1),
      ...dramas().filter(isDraft).slice(0, 2)]).slice(0, 7);
    if (!featured.length) return;
    stage = el("section", "md-desktop-hero");
    stage.id = "md-destacados";
    const background = el("div", "md-desktop-hero__blur");
    stage.appendChild(background);
    const image = el("img", "md-desktop-hero__image");
    image.alt = "";
    stage.appendChild(image);
    stage.appendChild(el("div", "md-desktop-hero__veil"));
    const information = el("div", "md-desktop-hero__info");
    information.appendChild(el("p", "md-desktop-hero__eyebrow"));
    information.appendChild(el("h1", "md-desktop-hero__title"));
    information.appendChild(el("p", "md-desktop-hero__meta"));
    information.appendChild(el("p", "md-desktop-hero__description"));
    const actions = el("div", "md-desktop-hero__actions");
    const play = button("Reproducir", "md-desktop-hero__play");
    play.insertAdjacentHTML("afterbegin", svg("play"));
    actions.appendChild(play);
    const detail = button("Más información", "md-desktop-hero__detail");
    actions.appendChild(detail);
    const saveHero = button("+ Mi lista", "md-desktop-hero__save", () => {
      const drama = featured[featuredIndex % featured.length];
      if (drama) toggleMyList(drama);
    });
    actions.appendChild(saveHero);
    information.appendChild(actions);
    stage.appendChild(information);
    const controls = el("div", "md-desktop-hero__controls");
    const prev = button("", "md-desktop-hero__direction", () => {
      featuredIndex = (featuredIndex - 1 + featured.length) % featured.length;
      showFeatured();
    });
    prev.innerHTML = svg("chevron");
    prev.classList.add("md-desktop-hero__direction--prev");
    prev.setAttribute("aria-label", "Anterior destacado");
    const next = button("", "md-desktop-hero__direction", () => {
      featuredIndex = (featuredIndex + 1) % featured.length;
      showFeatured();
    });
    next.innerHTML = svg("chevron");
    next.setAttribute("aria-label", "Siguiente destacado");
    controls.append(prev, next);
    stage.appendChild(controls);
    stage.appendChild(el("div", "md-desktop-hero__dots"));
    catalog.appendChild(stage);
    showFeatured();
    if (slideInterval) window.clearInterval(slideInterval);
    slideInterval = window.setInterval(() => {
      if (media.matches && mounted && !document.hidden && !stage.hidden && !document.body.classList.contains("video-player-open")) {
        featuredIndex = (featuredIndex + 1) % featured.length;
        showFeatured();
      }
    }, 9000);
  }

  function scrollToSection(id) {
    resetFiltering();
    window.requestAnimationFrame(() => {
      const element = document.getElementById(id);
      if (element) element.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
  function resetFiltering() {
    chosenCategory = null;
    searchTerm = "";
    if (search) search.value = "";
    updateCategoryState();
    rebuildRows();
  }
  function updateCategoryState() {
    if (!menu) return;
    menu.querySelectorAll("[data-category-slug]").forEach(node => {
      const active = node.dataset.categorySlug === (chosenCategory || "todos");
      node.classList.toggle("is-active", active);
      node.setAttribute("aria-current", active ? "true" : "false");
    });
  }
  function closeMenu() {
    if (!menu) return;
    menu.classList.remove("is-open");
    menu.setAttribute("aria-hidden", "true");
    document.body.classList.remove("md-desktop-menu-open");
  }
  function openMenu() {
    if (!menu) return;
    menu.classList.add("is-open");
    menu.setAttribute("aria-hidden", "false");
    document.body.classList.add("md-desktop-menu-open");
    menu.querySelector(".md-desktop-menu__close")?.focus();
  }
  function createMenu() {
    menu = el("aside", "md-desktop-menu");
    menu.setAttribute("aria-hidden", "true");
    const backdrop = button("", "md-desktop-menu__backdrop", closeMenu);
    backdrop.setAttribute("aria-label", "Cerrar menú");
    const panel = el("div", "md-desktop-menu__panel");
    const heading = el("div", "md-desktop-menu__heading");
    heading.appendChild(el("h2", "", "CATEGORÍAS"));
    const close = button("", "md-desktop-menu__close", closeMenu);
    close.innerHTML = svg("close");
    close.setAttribute("aria-label", "Cerrar categorías");
    heading.prepend(close);
    panel.appendChild(heading);
    const list = el("nav", "md-desktop-menu__list");
    list.setAttribute("aria-label", "Filtrar por categoría");
    const opts = [{ name: "TODOS", slug: "todos" }, ...categories()];
    opts.forEach(category => {
      const item = button(category.name, "md-desktop-menu__item", () => {
        chosenCategory = category.slug === "todos" ? null : category.slug;
        searchTerm = "";
        if (search) search.value = "";
        updateCategoryState();
        rebuildRows();
        closeMenu();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      item.dataset.categorySlug = category.slug;
      list.appendChild(item);
    });
    panel.appendChild(list);
    menu.append(backdrop, panel);
    document.body.appendChild(menu);
    updateCategoryState();
  }

  function createDock() {
    dock = el("nav", "md-desktop-dock");
    dock.setAttribute("aria-label", "Navegación de escritorio");
    const avatar = el("div", "md-desktop-dock__avatar");
    avatar.title = "Avatar del usuario";
    const image = el("img", "");
    image.src = "/assets/avatar-1.png";
    image.alt = "Avatar del usuario";
    avatar.appendChild(image);
    dock.appendChild(avatar);
    dock.appendChild(el("div", "md-desktop-dock__separator"));
    function iconButton(icon, label, key, action) {
      const b = button("", "md-desktop-dock__item", action);
      b.innerHTML = svg(icon);
      b.title = label;
      b.setAttribute("aria-label", label);
      b.dataset.dockKey = key;
      dock.appendChild(b);
      return b;
    }
    iconButton("home", "Inicio", "home", () => {
      resetFiltering();
      window.scrollTo({ top:0, behavior:"smooth" });
    });

    const searchWrap = el("div", "md-desktop-dock__search");
    const searchButton = button("", "md-desktop-dock__item", () => search.focus());
    searchButton.innerHTML = svg("search");
    searchButton.title = "Buscar";
    searchButton.dataset.dockKey = "search";
    searchButton.setAttribute("aria-label", "Buscar microdramas");
    searchWrap.appendChild(searchButton);
    search = el("input", "md-desktop-dock__search-input");
    search.type = "search";
    search.autocomplete = "off";
    search.placeholder = "Buscar microdramas...";
    search.setAttribute("aria-label", "Buscar microdramas en el catálogo");
    search.addEventListener("input", () => {
      searchTerm = search.value.trim();
      chosenCategory = null;
      myListMode = false;
      rebuildRows();
      selectDock(searchTerm ? "search" : "home");
    });
    search.addEventListener("keydown", e => {
      if (e.key === "Escape") { search.blur(); searchButton.focus(); }
    });
    searchWrap.appendChild(search);
    dock.appendChild(searchWrap);

    iconButton("calendar", "Próximos estrenos", "upcoming", () => {
      scrollToSection("md-proximos");
      selectDock("upcoming");
    });
    iconButton("play", "Estrenos", "premieres", () => {
      scrollToSection("md-estrenos");
      selectDock("premieres");
    });
    iconButton("bookmark", "Mi lista", "mylist", () => {
      myListMode = true;
      chosenCategory = null;
      searchTerm = "";
      search.value = "";
      rebuildRows();
      selectDock("mylist");
      window.scrollTo({ top:0, behavior:"smooth" });
    });

    dock.appendChild(el("div", "md-desktop-dock__separator"));
    iconButton("logout", "Cerrar sesión", "logout", () => {
      window.location.href = "/api/session/logout";
    });
    document.body.appendChild(dock);
    selectDock("home");
  }
  function selectDock(key) {
    dock?.querySelectorAll("[data-dock-key]").forEach(node => {
      const selected = node.dataset.dockKey === key;
      node.classList.toggle("is-active", selected);
      if (selected) node.setAttribute("aria-current", "page");
      else node.removeAttribute("aria-current");
    });
  }


  function mount() {
    if (!media.matches || mounted || !dramas().length) return;
    mounted = true;
    chosenCategory = null;
    searchTerm = "";
    catalog.replaceChildren();
    catalog.classList.add("md-desktop-home");
    createDock();
    createHeader();
    const anchors = el("div", "md-desktop-anchors");
    anchors.setAttribute("aria-hidden", "true");
    catalog.appendChild(anchors);
    createHero();
    content = el("div", "md-desktop-content");
    catalog.appendChild(content);
    rebuildRows();
    loadUserMyList();
  }
  function unmount() {
    if (!mounted) return;
    mounted = false;
    if (slideInterval) window.clearInterval(slideInterval);
    slideInterval = null;
    closeMenu();
    dock?.remove();
    menu?.remove();
    dock = null;
    menu = null;
    stage = null;
    content = null;
    search = null;
    myListMode = false;
    myListReady = false;
    myListKey = null;
    authVersion++;
    catalog.classList.remove("md-desktop-home");
    catalog.replaceChildren();
    // En móvil se restaura exactamente el renderizado del app.js.
    if (typeof filtrarDramasPorCategoria === "function") filtrarDramasPorCategoria();
    else dramas().forEach(crearTarjetaDrama);
  }
  const observer = new MutationObserver(() => {
    if (!mounted && media.matches && catalog.querySelector(":scope > .drama-card")) {
      mount();
    }
  });
  observer.observe(catalog, { childList: true });
  if (media.matches && catalog.querySelector(":scope > .drama-card")) mount();
  media.addEventListener("change", () => {
    if (media.matches) {
      if (dramas().length) mount();
    } else {
      unmount();
    }
  });
  window.addEventListener("storage", event => {
    if (!mounted || !myListReady || event.key !== myListKey) return;
    try {
      const ids = JSON.parse(event.newValue || "[]");
      myListIds = new Set((Array.isArray(ids) ? ids : []).map(Number).filter(Number.isSafeInteger));
      if (myListMode) rebuildRows(); else refreshSaveAppearance();
    } catch (error) {
      console.warn("[Mi lista] Otra pestaña contiene datos inválidos:", error);
    }
  });
})();