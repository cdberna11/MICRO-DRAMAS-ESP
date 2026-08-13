"use strict";
const PORTADA_GENERICA =
"/portadas/generica/portada-generica.png";
const MEGAJS_URL =
"https://unpkg.com/megajs/dist/main.browser-es.mjs";
const MP4BOX_URL =
"https://cdn.jsdelivr.net/npm/mp4box@2.4.1/dist/mp4box.all.mjs";
const RANGO_INICIAL =
4 * 1024 * 1024;
const RANGO_MEDIA =
8 * 1024 * 1024;
const MUESTRAS_POR_SEGMENTO =
60;
const BUFFER_INICIAL =
4;
const BUFFER_OBJETIVO =
45;
const BUFFER_BAJO =
8;
const LIMITE_DESCARGA_SESION =
Number.POSITIVE_INFINITY;
const TIMEOUT_SOURCEBUFFER =
30000;
const SEEK_REINICIO_MAX =
16 * 1024 * 1024;

let detalleMovilActual =
null;
let reproductorActual =
null;

let playerState = {
open:
false,
loading:
false,
stopped:
false,
operationId:
0,
streamGeneration:
0,
drama:
null,
file:
null,
fileSize:
0,
megaLoaded:
false,
mp4box:
null,
mp4Info:
null,
mp4Ready:
false,
mp4Error:
false,
mediaSource:
null,
mediaSourceUrl:
null,
videoElement:
null,
sourceBuffers:
new Map(),
sourceQueues:
new Map(),
videoTrackId:
null,
audioTrackId:
null,
totalDownloaded:
0,
totalSegments:
0,
totalAppended:
0,
megaRequests:
0,
cursor:
0,
playbackStarted:
false,
streamStarted:
false,
metadataPromise:
null,
metadataResolve:
null,
metadataReject:
null,
playerElements:
null,
playAttempt:
false,
seekInProgress:
false,
seekToken:
0,
userSeeking:
false,
pendingSeekTime:
null,
allowAutoplay:
true,
bootstrapBuffers:
[],
bootstrapEnd:
0,
bootstrapReady:
false,
initSegments:
new Map()
};

let libreriasPromise =
null;
let MEGAFile =
null;
let MP4BoxAPI =
null;

function esVistaMovil() {
return window.matchMedia(
"(max-width: 600px)"
).matches;
}

async function cargarLibreriasReproductor() {
if (
libreriasPromise
) {
return libreriasPromise;
}
libreriasPromise =
(async () => {
console.log(
"[REPRODUCTOR] Cargando MEGAJS..."
);
const megaModule =
await import(
MEGAJS_URL
);
MEGAFile =
megaModule.File ||
megaModule.default?.File ||
megaModule.default;
if (
!MEGAFile ||
typeof MEGAFile.fromURL !==
"function"
) {
throw new Error(
"No se pudo inicializar MEGAJS."
);
}
console.log(
"[REPRODUCTOR] ✓ MEGAJS cargado."
);
console.log(
"[REPRODUCTOR] Cargando MP4Box.js..."
);
const mp4boxModule =
await import(
MP4BOX_URL
);
MP4BoxAPI =
mp4boxModule.default ||
mp4boxModule;
if (
!MP4BoxAPI ||
typeof MP4BoxAPI.createFile !==
"function"
) {
throw new Error(
"No se pudo inicializar MP4Box.js."
);
}
console.log(
"[REPRODUCTOR] ✓ MP4Box.js cargado."
);
return true;
})();
try {
await libreriasPromise;
} catch (
error
) {
libreriasPromise =
null;
throw error;
}
return true;
}

async function cargarDramas() {
const catalogo =
document.getElementById(
"catalogo"
);
if (
!catalogo
) {
console.error(
'No se encontró #catalogo.'
);
return;
}
try {
const respuesta =
await fetch(
"/api/dramas"
);
if (
!respuesta.ok
) {
throw new Error(
`Error API: ${respuesta.status}`
);
}
const datos =
await respuesta.json();
if (
!datos.success ||
!Array.isArray(
datos.dramas
)
) {
throw new Error(
"Respuesta inválida de /api/dramas."
);
}
catalogo.innerHTML =
"";
if (
datos.dramas.length ===
0
) {
catalogo.innerHTML =
`
<p class="mensaje-vacio">
No hay microdramas disponibles.
</p>
`;
return;
}
datos.dramas.forEach(
crearTarjetaDrama
);
} catch (
error
) {
console.error(
"Error al cargar catálogo:",
error
);
catalogo.innerHTML =
`
<p class="mensaje-error">
No se pudo cargar el catálogo.
</p>
`;
}
}

function esDramaBorrador(
drama
) {
if (
!drama
) {
return false;
}
const estado =
typeof drama.status ===
"string"
? drama.status
.trim()
.toLowerCase()
: "";
return (
estado === "borrador" ||
estado === "draft"
);
}

function esDramaNuevo(
createdAt
) {
if (
typeof createdAt !==
"string" ||
createdAt.trim() ===
""
) {
return false;
}
const valor =
createdAt
.trim()
.replace(
" ",
"T"
);
const fechaCreacion =
new Date(
valor.endsWith("Z")
? valor
: `${valor}Z`
);
if (
Number.isNaN(
fechaCreacion.getTime()
)
) {
return false;
}
const diferencia =
Date.now() -
fechaCreacion.getTime();
return (
diferencia >=
0 &&
diferencia <
72 *
60 *
60 *
1000
);
}

async function registrarVista(
drama
) {
if (
!drama ||
!Number.isInteger(
Number(
drama.id
)
)
) {
return null;
}
try {
const respuesta =
await fetch(
"/api/dramas/view",
{
method:
"POST",
headers: {
"Content-Type":
"application/json"
},
body:
JSON.stringify({
id:
Number(
drama.id
)
})
}
);
if (
!respuesta.ok
) {
throw new Error(
`Error al registrar vista: ${respuesta.status}`
);
}
const datos =
await respuesta.json();
if (
!datos.success
) {
throw new Error(
datos.error ||
"No se pudo registrar la vista."
);
}
return Number(
datos.views
) || 0;
} catch (
error
) {
console.error(
"No se pudo registrar la reproducción:",
error
);
return null;
}
}

function crearTarjetaDrama(
drama
) {
const catalogo =
document.getElementById(
"catalogo"
);
if (
!catalogo
) {
return;
}
const tarjeta =
document.createElement(
"article"
);
tarjeta.className =
"drama-card";
const esBorrador =
esDramaBorrador(
drama
);
if (
esBorrador
) {
const etiqueta =
document.createElement(
"div"
);
etiqueta.className =
"drama-card__upcoming";
etiqueta.textContent =
"PRÓXIMO ESTRENO";
tarjeta.appendChild(
etiqueta
);
} else if (
esDramaNuevo(
drama.created_at
)
) {
const etiqueta =
document.createElement(
"div"
);
etiqueta.className =
"drama-card__new";
etiqueta.textContent =
"RECIÉN AGREGADO";
tarjeta.appendChild(
etiqueta
);
}
if (
Number(
drama.views
) >=
3
) {
const top =
document.createElement(
"div"
);
top.className =
"drama-card__top";
top.innerHTML =
`
<span aria-hidden="true">
🔥
</span>
TOP
`;
tarjeta.appendChild(
top
);
}
const portada =
document.createElement(
"img"
);
portada.className =
"drama-card__cover";
const portadaUrl =
typeof drama.cover_url ===
"string" &&
drama.cover_url.trim() !==
""
? drama.cover_url.trim()
: PORTADA_GENERICA;
portada.src =
portadaUrl;
portada.alt =
`Portada de ${drama.title}`;
portada.loading =
"lazy";
portada.addEventListener(
"error",
() => {
if (
!portada.src.endsWith(
PORTADA_GENERICA
)
) {
portada.src =
PORTADA_GENERICA;
}
},
{
once:
true
}
);
const overlay =
document.createElement(
"div"
);
overlay.className =
"drama-card__overlay";
const titulo =
document.createElement(
"h2"
);
titulo.className =
"drama-card__title";
titulo.textContent =
drama.title;
const tipo =
document.createElement(
"p"
);
tipo.className =
"drama-card__type";
tipo.textContent =
"Microdrama doblado al español.";
const plataforma =
document.createElement(
"p"
);
plataforma.className =
"drama-card__platform";
const strong =
document.createElement(
"strong"
);
strong.textContent =
"Plataforma: ";
plataforma.appendChild(
strong
);
plataforma.appendChild(
document.createTextNode(
typeof drama.platform ===
"string" &&
drama.platform.trim() !==
""
? drama.platform.trim()
: "No especificada"
)
);
const controles =
document.createElement(
"div"
);
controles.className =
"drama-card__controls";
let botonVer =
null;
if (
!esBorrador
) {
botonVer =
document.createElement(
"button"
);
botonVer.type =
"button";
botonVer.className =
"drama-card__play";
botonVer.dataset.dramaId =
String(
drama.id
);
botonVer.innerHTML =
`
<span
class="drama-card__play-icon"
aria-hidden="true"
>
▶
</span>
<span>
Ver
</span>
`;
botonVer.addEventListener(
"click",
evento => {
evento.preventDefault();
evento.stopPropagation();
reproducirDrama(
drama
);
}
);
}
const botonMas =
document.createElement(
"button"
);
botonMas.type =
"button";
botonMas.className =
"drama-card__more";
botonMas.textContent =
"+";
botonMas.setAttribute(
"aria-label",
`Mostrar descripción de ${drama.title}`
);
botonMas.setAttribute(
"aria-expanded",
"false"
);
const descripcion =
document.createElement(
"div"
);
descripcion.className =
"drama-card__description";
const descripcionTexto =
typeof drama.video_description ===
"string" &&
drama.video_description.trim() !==
""
? drama.video_description.trim()
: (
typeof drama.description ===
"string"
? drama.description.trim()
: ""
);
descripcion.textContent =
descripcionTexto ||
"Sin descripción disponible.";
botonMas.addEventListener(
"click",
evento => {
evento.preventDefault();
evento.stopPropagation();
const abierta =
tarjeta.classList.toggle(
"is-description-open"
);
botonMas.textContent =
abierta
? "−"
: "+";
botonMas.setAttribute(
"aria-expanded",
abierta
? "true"
: "false"
);
}
);
const vistas =
document.createElement(
"span"
);
vistas.className =
"drama-card__views";
const cantidadVistas =
Number(
drama.views
) || 0;
vistas.innerHTML =
`
<span aria-hidden="true">
👁
</span>
${cantidadVistas}
${cantidadVistas === 1
? "vista"
: "vistas"}
`;
if (
botonVer
) {
controles.appendChild(
botonVer
);
}
controles.appendChild(
botonMas
);
controles.appendChild(
vistas
);
overlay.appendChild(
titulo
);
overlay.appendChild(
tipo
);
overlay.appendChild(
plataforma
);
overlay.appendChild(
controles
);
overlay.appendChild(
descripcion
);
tarjeta.appendChild(
portada
);
tarjeta.appendChild(
overlay
);
tarjeta.addEventListener(
"click",
evento => {
if (
!esVistaMovil()
) {
return;
}
if (
evento.target.closest(
"button"
)
) {
return;
}
abrirDetalleMovil(
drama
);
}
);
catalogo.appendChild(
tarjeta
);
}

function actualizarVistasTarjeta(
drama,
views
) {
const tarjetas =
document.querySelectorAll(
".drama-card"
);
tarjetas.forEach(
tarjeta => {
const boton =
tarjeta.querySelector(
".drama-card__play"
);
if (
!boton
) {
return;
}
if (
boton.dataset.dramaId !==
String(
drama.id
)
) {
return;
}
const vistas =
tarjeta.querySelector(
".drama-card__views"
);
if (
vistas
) {
vistas.innerHTML =
`
<span aria-hidden="true">
👁
</span>
${Number(views) || 0}
${
Number(views) === 1
? "vista"
: "vistas"
}
`;
}
}
);
actualizarTOPTarjeta(
drama,
views
);
}

function actualizarTOPTarjeta(
drama,
views
) {
if (
Number(
views
) <
3
) {
return;
}
const tarjetas =
document.querySelectorAll(
".drama-card"
);
tarjetas.forEach(
tarjeta => {
const boton =
tarjeta.querySelector(
".drama-card__play"
);
if (
!boton
) {
return;
}
if (
boton.dataset.dramaId !==
String(
drama.id
)
) {
return;
}
if (
tarjeta.querySelector(
".drama-card__top"
)
) {
return;
}
const top =
document.createElement(
"div"
);
top.className =
"drama-card__top";
top.innerHTML =
`
<span aria-hidden="true">
🔥
</span>
TOP
`;
tarjeta.appendChild(
top
);
}
);
}

function crearDetalleMovil() {
if (
document.getElementById(
"detalle-movil"
)
) {
return;
}
const detalle =
document.createElement(
"div"
);
detalle.id =
"detalle-movil";
detalle.className =
"mobile-detail";
detalle.setAttribute(
"aria-hidden",
"true"
);
const fondo =
document.createElement(
"div"
);
fondo.className =
"mobile-detail__backdrop";
const panel =
document.createElement(
"div"
);
panel.className =
"mobile-detail__panel";
panel.setAttribute(
"role",
"dialog"
);
panel.setAttribute(
"aria-modal",
"true"
);
const cerrar =
document.createElement(
"button"
);
cerrar.type =
"button";
cerrar.className =
"mobile-detail__close";
cerrar.textContent =
"×";
cerrar.setAttribute(
"aria-label",
"Cerrar"
);
const imagen =
document.createElement(
"img"
);
imagen.className =
"mobile-detail__image";
const contenido =
document.createElement(
"div"
);
contenido.className =
"mobile-detail__content";
const titulo =
document.createElement(
"h2"
);
titulo.className =
"mobile-detail__title";
const tipo =
document.createElement(
"p"
);
tipo.className =
"mobile-detail__type";
tipo.textContent =
"Microdrama doblado al español.";
const plataforma =
document.createElement(
"p"
);
plataforma.className =
"mobile-detail__platform";
const vistas =
document.createElement(
"p"
);
vistas.className =
"mobile-detail__views";
const descripcionTitulo =
document.createElement(
"h3"
);
descripcionTitulo.className =
"mobile-detail__description-title";
descripcionTitulo.textContent =
"Descripción";
const descripcion =
document.createElement(
"p"
);
descripcion.className =
"mobile-detail__description";
const acciones =
document.createElement(
"div"
);
acciones.className =
"mobile-detail__actions";
const botonVer =
document.createElement(
"button"
);
botonVer.type =
"button";
botonVer.className =
"mobile-detail__play";
botonVer.innerHTML =
`
<span
class="mobile-detail__play-icon"
aria-hidden="true"
>
▶
</span>
<span>
Ver
</span>
`;
botonVer.addEventListener(
"click",
evento => {
evento.preventDefault();
if (
detalleMovilActual
) {
reproducirDrama(
detalleMovilActual
);
}
}
);
acciones.appendChild(
botonVer
);
contenido.appendChild(
titulo
);
contenido.appendChild(
tipo
);
contenido.appendChild(
plataforma
);
contenido.appendChild(
vistas
);
contenido.appendChild(
acciones
);
contenido.appendChild(
descripcionTitulo
);
contenido.appendChild(
descripcion
);
panel.appendChild(
cerrar
);
panel.appendChild(
imagen
);
panel.appendChild(
contenido
);
detalle.appendChild(
fondo
);
detalle.appendChild(
panel
);
document.body.appendChild(
detalle
);
cerrar.addEventListener(
"click",
cerrarDetalleMovil
);
fondo.addEventListener(
"click",
cerrarDetalleMovil
);
}

function abrirDetalleMovil(
drama
) {
crearDetalleMovil();
const detalle =
document.getElementById(
"detalle-movil"
);
if (
!detalle
) {
return;
}
const imagen =
detalle.querySelector(
".mobile-detail__image"
);
const titulo =
detalle.querySelector(
".mobile-detail__title"
);
const plataforma =
detalle.querySelector(
".mobile-detail__platform"
);
const vistas =
detalle.querySelector(
".mobile-detail__views"
);
const descripcion =
detalle.querySelector(
".mobile-detail__description"
);
const botonVer =
detalle.querySelector(
".mobile-detail__play"
);
const portadaUrl =
typeof drama.cover_url ===
"string" &&
drama.cover_url.trim() !==
""
? drama.cover_url.trim()
: PORTADA_GENERICA;
imagen.src =
portadaUrl;
imagen.alt =
`Portada de ${drama.title}`;
imagen.onerror =
() => {
if (
!imagen.src.endsWith(
PORTADA_GENERICA
)
) {
imagen.src =
PORTADA_GENERICA;
}
};
titulo.textContent =
drama.title;
plataforma.textContent =
`Plataforma: ${
typeof drama.platform ===
"string" &&
drama.platform.trim() !==
""
? drama.platform.trim()
: "No especificada"
}`;
const numeroVistas =
Number(
drama.views
) || 0;
vistas.innerHTML =
`
👁
${numeroVistas}
${
numeroVistas === 1
? "vista"
: "vistas"
}
`;
const descripcionTexto =
typeof drama.video_description ===
"string" &&
drama.video_description.trim() !==
""
? drama.video_description.trim()
: (
typeof drama.description ===
"string"
? drama.description.trim()
: ""
);
descripcion.textContent =
descripcionTexto ||
"Sin descripción disponible.";
botonVer.hidden =
esDramaBorrador(
drama
);
detalleMovilActual =
drama;
detalle.classList.add(
"is-open"
);
detalle.setAttribute(
"aria-hidden",
"false"
);
document.body.classList.add(
"mobile-detail-open"
);
}

function cerrarDetalleMovil() {
const detalle =
document.getElementById(
"detalle-movil"
);
if (
!detalle
) {
return;
}
detalle.classList.remove(
"is-open"
);
detalle.setAttribute(
"aria-hidden",
"true"
);
document.body.classList.remove(
"mobile-detail-open"
);
detalleMovilActual =
null;
}

function insertarEstilosReproductor() {
if (
document.getElementById(
"micro-dramas-player-style"
)
) {
return;
}
const style =
document.createElement(
"style"
);
style.id =
"micro-dramas-player-style";
style.textContent =
`
.md-player {
position:
fixed;
inset:
0;
z-index:
999999;
display:
none;
align-items:
center;
justify-content:
center;
background:
rgba(0,0,0,0.94);
padding:
20px;
box-sizing:
border-box;
}
.md-player.is-open {
display:
flex;
}
.md-player__window {
width:
min(1200px,100%);
max-height:
95vh;
display:
flex;
flex-direction:
column;
background:
#080808;
border:
1px solid
rgba(255,255,255,0.12);
border-radius:
12px;
overflow:
hidden;
box-shadow:
0 25px 80px
rgba(0,0,0,0.65);
}
.md-player__header {
min-height:
54px;
display:
flex;
align-items:
center;
justify-content:
space-between;
gap:
15px;
padding:
0 16px;
background:
#111;
color:
#fff;
}
.md-player__title {
margin:
0;
font-size:
17px;
font-weight:
600;
overflow:
hidden;
text-overflow:
ellipsis;
white-space:
nowrap;
}
.md-player__close {
width:
38px;
height:
38px;
border:
0;
border-radius:
50%;
background:
rgba(255,255,255,0.10);
color:
#fff;
font-size:
26px;
cursor:
pointer;
}
.md-player__area {
position:
relative;
width:
100%;
aspect-ratio:
16 / 9;
background:
#000;
overflow:
hidden;
}
.md-player__video {
display:
block;
width:
100%;
height:
100%;
background:
#000;
object-fit:
contain;
}
.md-player__loading {
position:
absolute;
inset:
0;
z-index:
3;
display:
flex;
align-items:
center;
justify-content:
center;
flex-direction:
column;
gap:
12px;
background:
rgba(0,0,0,0.72);
color:
#fff;
text-align:
center;
pointer-events:
none;
opacity:
1;
transition:
opacity .2s ease;
}
.md-player__loading.is-hidden {
opacity:
0;
}
.md-player__spinner {
width:
38px;
height:
38px;
border:
3px solid
rgba(255,255,255,0.25);
border-top-color:
#fff;
border-radius:
50%;
animation:
mdPlayerSpin
.8s linear infinite;
}
@keyframes mdPlayerSpin {
to {
transform:
rotate(360deg);
}
}
.md-player__message {
max-width:
90%;
font-size:
14px;
}
.md-player__controls {
padding:
10px 12px 12px;
background:
#111;
color:
#fff;
}
.md-player__progress {
width:
100%;
height:
5px;
appearance:
none;
cursor:
pointer;
background:
#444;
border-radius:
999px;
margin:
0 0 10px;
}
.md-player__progress::-webkit-slider-thumb {
appearance:
none;
width:
14px;
height:
14px;
border-radius:
50%;
background:
#fff;
cursor:
pointer;
}
.md-player__progress::-moz-range-thumb {
width:
14px;
height:
14px;
border:
0;
border-radius:
50%;
background:
#fff;
cursor:
pointer;
}
.md-player__buttons {
display:
flex;
align-items:
center;
gap:
7px;
}
.md-player__button {
min-width:
36px;
height:
36px;
padding:
0 9px;
border:
0;
border-radius:
7px;
background:
rgba(255,255,255,0.10);
color:
#fff;
cursor:
pointer;
font-size:
14px;
}
.md-player__button:hover {
background:
rgba(255,255,255,0.18);
}
.md-player__volume {
width:
85px;
}
.md-player__time {
margin-left:
auto;
font-size:
12px;
white-space:
nowrap;
}
.md-player__status {
margin-top:
8px;
min-height:
16px;
font-family:
monospace;
font-size:
10px;
color:
rgba(255,255,255,0.55);
overflow:
hidden;
text-overflow:
ellipsis;
white-space:
nowrap;
}
@media (
max-width:700px
) {
.md-player {
padding:
0;
}
.md-player__window {
width:
100%;
height:
100vh;
max-height:
100vh;
border-radius:
0;
}
.md-player__area {
flex:
1;
min-height:
0;
aspect-ratio:
auto;
}
}
`;
document.head.appendChild(
style
);
}

function crearReproductor() {
insertarEstilosReproductor();
if (
document.getElementById(
"md-player"
)
) {
return;
}
const reproductor =
document.createElement(
"div"
);
reproductor.id =
"md-player";
reproductor.className =
"md-player";
reproductor.setAttribute(
"aria-hidden",
"true"
);
const ventana =
document.createElement(
"div"
);
ventana.className =
"md-player__window";
ventana.setAttribute(
"role",
"dialog"
);
ventana.setAttribute(
"aria-modal",
"true"
);
const header =
document.createElement(
"div"
);
header.className =
"md-player__header";
const titulo =
document.createElement(
"h2"
);
titulo.className =
"md-player__title";
const cerrar =
document.createElement(
"button"
);
cerrar.type =
"button";
cerrar.className =
"md-player__close";
cerrar.textContent =
"×";
const area =
document.createElement(
"div"
);
area.className =
"md-player__area";
const video =
document.createElement(
"video"
);
video.className =
"md-player__video";
video.setAttribute(
"playsinline",
""
);
video.preload =
"auto";
video.controls =
false;
video.volume =
1;
const loading =
document.createElement(
"div"
);
loading.className =
"md-player__loading";
const spinner =
document.createElement(
"div"
);
spinner.className =
"md-player__spinner";
const loadingMessage =
document.createElement(
"div"
);
loadingMessage.className =
"md-player__message";
loadingMessage.textContent =
"Preparando vídeo...";
loading.appendChild(
spinner
);
loading.appendChild(
loadingMessage
);
area.appendChild(
video
);
area.appendChild(
loading
);
const controls =
document.createElement(
"div"
);
controls.className =
"md-player__controls";
const progress =
document.createElement(
"input"
);
progress.type =
"range";
progress.className =
"md-player__progress";
progress.min =
"0";
progress.max =
"100";
progress.step =
"0.01";
progress.value =
"0";
const buttons =
document.createElement(
"div"
);
buttons.className =
"md-player__buttons";
const play =
document.createElement(
"button"
);
play.type =
"button";
play.className =
"md-player__button";
play.textContent =
"▶";
const retroceder =
document.createElement(
"button"
);
retroceder.type =
"button";
retroceder.className =
"md-player__button";
retroceder.textContent =
"↶ 10";
const avanzar =
document.createElement(
"button"
);
avanzar.type =
"button";
avanzar.className =
"md-player__button";
avanzar.textContent =
"10 ↷";
const mute =
document.createElement(
"button"
);
mute.type =
"button";
mute.className =
"md-player__button";
mute.textContent =
"🔊";
const volume =
document.createElement(
"input"
);
volume.type =
"range";
volume.className =
"md-player__volume";
volume.min =
"0";
volume.max =
"1";
volume.step =
"0.01";
volume.value =
"1";
const fullscreen =
document.createElement(
"button"
);
fullscreen.type =
"button";
fullscreen.className =
"md-player__button";
fullscreen.textContent =
"⛶";
const time =
document.createElement(
"span"
);
time.className =
"md-player__time";
time.textContent =
"0:00 / 0:00";
const status =
document.createElement(
"div"
);
status.className =
"md-player__status";
status.textContent =
"Preparando";
header.appendChild(
titulo
);
header.appendChild(
cerrar
);
buttons.appendChild(
play
);
buttons.appendChild(
retroceder
);
buttons.appendChild(
avanzar
);
buttons.appendChild(
mute
);
buttons.appendChild(
volume
);
buttons.appendChild(
fullscreen
);
buttons.appendChild(
time
);
controls.appendChild(
progress
);
controls.appendChild(
buttons
);
controls.appendChild(
status
);
ventana.appendChild(
header
);
ventana.appendChild(
area
);
ventana.appendChild(
controls
);
reproductor.appendChild(
ventana
);
document.body.appendChild(
reproductor
);
playerState.videoElement =
video;
playerState.playerElements = {
reproductor:
reproductor,
ventana:
ventana,
titulo:
titulo,
cerrar:
cerrar,
area:
area,
video:
video,
loading:
loading,
loadingMessage:
loadingMessage,
play:
play,
retroceder:
retroceder,
avanzar:
avanzar,
mute:
mute,
volume:
volume,
fullscreen:
fullscreen,
progress:
progress,
time:
time,
status:
status
};
cerrar.addEventListener(
"click",
cerrarReproductor
);
play.addEventListener(
"click",
async () => {
if (
!video.paused
) {
playerState.allowAutoplay =
false;
video.pause();
return;
}
playerState.allowAutoplay =
true;
try {
await video.play();
} catch {
actualizarEstadoPlayer(
"Pulsa PLAY para iniciar."
);
}
}
);
retroceder.addEventListener(
"click",
evento => {
evento.preventDefault();
evento.stopPropagation();
ejecutarSaltoSegundos(
-10
);
}
);
avanzar.addEventListener(
"click",
evento => {
evento.preventDefault();
evento.stopPropagation();
ejecutarSaltoSegundos(
10
);
}
);
mute.addEventListener(
"click",
() => {
video.muted =
!video.muted;
actualizarIconoVolumen();
}
);
volume.addEventListener(
"input",
() => {
video.volume =
Number(
volume.value
);
video.muted =
video.volume ===
0;
actualizarIconoVolumen();
}
);
fullscreen.addEventListener(
"click",
alternarPantallaCompleta
);
progress.addEventListener(
"pointerdown",
() => {
playerState.userSeeking =
true;
playerState.pendingSeekTime =
null;
}
);
progress.addEventListener(
"input",
() => {
const duration =
Number(
video.duration
);
if (
!Number.isFinite(
duration
) ||
duration <=
0
) {
return;
}
const destino =
duration *
(
Number(
progress.value
) /
100
);
playerState.pendingSeekTime =
destino;
time.textContent =
`${formatoTiempo(destino)} / ${formatoTiempo(duration)}`;
}
);
progress.addEventListener(
"change",
() => {
ejecutarSeekDesdeBarra();
}
);
video.addEventListener(
"play",
() => {
actualizarBotonPlay();
actualizarEstadoPlayer(
"Reproduciendo"
);
}
);
video.addEventListener(
"pause",
() => {
actualizarBotonPlay();
if (
!playerState.seekInProgress &&
!playerState.stopped
) {
actualizarEstadoPlayer(
"Pausado"
);
}
}
);
video.addEventListener(
"waiting",
() => {
if (
!playerState.seekInProgress
) {
mostrarLoading(
"Cargando más vídeo..."
);
}
}
);
video.addEventListener(
"playing",
() => {
playerState.playbackStarted =
true;
ocultarLoading();
actualizarBotonPlay();
actualizarEstadoPlayer(
"Reproduciendo"
);
}
);
video.addEventListener(
"seeking",
() => {
console.log(
`[SEEK] Evento seeking → ${video.currentTime.toFixed(2)}`
);
}
);
video.addEventListener(
"seeked",
() => {
console.log(
`[SEEK] Evento seeked → ${video.currentTime.toFixed(2)}`
);
actualizarControlesVideo();
}
);
video.addEventListener(
"timeupdate",
actualizarControlesVideo
);
video.addEventListener(
"durationchange",
actualizarControlesVideo
);
video.addEventListener(
"progress",
actualizarControlesVideo
);
video.addEventListener(
"ended",
() => {
actualizarBotonPlay();
actualizarEstadoPlayer(
"Vídeo finalizado"
);
}
);
video.addEventListener(
"error",
() => {
if (
playerState.seekInProgress
) {
return;
}
const error =
video.error;
console.error(
"[REPRODUCTOR] MediaError:",
error
);
}
);
document.addEventListener(
"keydown",
manejarTecladoPlayer
);
}

function mostrarLoading(
mensaje
) {
const elementos =
playerState.playerElements;
if (
!elementos
) {
return;
}
elementos.loadingMessage.textContent =
mensaje ||
"Preparando vídeo...";
elementos.loading.classList.remove(
"is-hidden"
);
}

function ocultarLoading() {
const elementos =
playerState.playerElements;
if (
!elementos
) {
return;
}
elementos.loading.classList.add(
"is-hidden"
);
}

function actualizarEstadoPlayer(
mensaje
) {
const elementos =
playerState.playerElements;
if (
!elementos
) {
return;
}
elementos.status.textContent =
mensaje;
}

function actualizarIconoVolumen() {
const elementos =
playerState.playerElements;
const video =
playerState.videoElement;
if (
!elementos ||
!video
) {
return;
}
if (
video.muted ||
video.volume ===
0
) {
elementos.mute.textContent =
"🔇";
return;
}
if (
video.volume <
0.5
) {
elementos.mute.textContent =
"🔉";
return;
}
elementos.mute.textContent =
"🔊";
}

function actualizarBotonPlay() {
const elementos =
playerState.playerElements;
const video =
playerState.videoElement;
if (
!elementos ||
!video
) {
return;
}
elementos.play.textContent =
video.paused
? "▶"
: "❚❚";
}

function formatoTiempo(
segundos
) {
if (
!Number.isFinite(
segundos
) ||
segundos <
0
) {
return "0:00";
}
const total =
Math.floor(
segundos
);
const horas =
Math.floor(
total /
3600
);
const minutos =
Math.floor(
(
total %
3600
) /
60
);
const segundosRestantes =
total %
60;
if (
horas >
0
) {
return (
`${horas}:` +
`${String(
minutos
).padStart(
2,
"0"
)}:` +
`${String(
segundosRestantes
).padStart(
2,
"0"
)}`
);
}
return (
`${minutos}:` +
`${String(
segundosRestantes
).padStart(
2,
"0"
)}`
);
}

function formatoBytes(
bytes
) {
if (
!Number.isFinite(
bytes
) ||
bytes <=
0
) {
return "0 B";
}
const unidades =
[
"B",
"KB",
"MB",
"GB",
"TB"
];
const indice =
Math.min(
Math.floor(
Math.log(
bytes
) /
Math.log(
1024
)
),
unidades.length -
1
);
const valor =
bytes /
Math.pow(
1024,
indice
);
return (
valor.toFixed(
indice ===
0
? 0
: 2
) +
" " +
unidades[indice]
);
}

function actualizarControlesVideo() {
const elementos =
playerState.playerElements;
const video =
playerState.videoElement;
if (
!elementos ||
!video
) {
return;
}
const duration =
Number(
video.duration
);
const current =
Number(
video.currentTime
);
if (
Number.isFinite(
duration
) &&
duration >
0 &&
!playerState.userSeeking &&
!playerState.seekInProgress
) {
elementos.progress.value =
String(
(
current /
duration
) *
100
);
}
elementos.time.textContent =
`${formatoTiempo(current)} / ${formatoTiempo(duration)}`;
actualizarEstadoBuffer();
}

function obtenerBufferAdelante() {
const video =
playerState.videoElement;
if (
!video ||
!video.buffered ||
video.buffered.length ===
0
) {
return 0;
}
const current =
Number(
video.currentTime
);
for (
let i = 0;
i <
video.buffered.length;
i++
) {
const inicio =
video.buffered.start(
i
);
const fin =
video.buffered.end(
i
);
if (
current >=
inicio &&
current <=
fin
) {
return Math.max(
0,
fin -
current
);
}
}
return 0;
}

function estaEnBuffer(
tiempo
) {
const video =
playerState.videoElement;
if (
!video ||
!video.buffered
) {
return false;
}
for (
let i = 0;
i <
video.buffered.length;
i++
) {
if (
tiempo >=
video.buffered.start(
i
) &&
tiempo <=
video.buffered.end(
i
)
) {
return true;
}
}
return false;
}

function actualizarEstadoBuffer() {
if (
!playerState.streamStarted ||
!playerState.videoElement
) {
return;
}
const buffer =
obtenerBufferAdelante();
if (
!playerState.videoElement.paused &&
buffer <
BUFFER_BAJO &&
!playerState.seekInProgress
) {
actualizarEstadoPlayer(
`Cargando... buffer ${buffer.toFixed(1)} s`
);
}
}

async function leerRangoMega(
start,
size,
actualizarUI =
true
) {
const file =
playerState.file;
if (
!file
) {
throw new Error(
"No existe archivo MEGA."
);
}
if (
start <
0 ||
start >=
playerState.fileSize
) {
throw new Error(
`Rango MEGA inválido: ${start}`
);
}
const end =
Math.min(
start +
size -
1,
playerState.fileSize -
1
);
const esperado =
end -
start +
1;
playerState.megaRequests++;
if (
actualizarUI
) {
actualizarEstadoPlayer(
`Descargando ${formatoBytes(esperado)}...`
);
}
const stream =
file.download({
start:
start,
end:
end,
maxConnections:
1,
initialChunkSize:
128 *
1024,
chunkSizeIncrement:
128 *
1024,
maxChunkSize:
1024 *
1024
});
if (
!stream
) {
throw new Error(
"MEGAJS no devolvió stream."
);
}
const chunks =
[];
let recibido =
0;
await new Promise(
(
resolve,
reject
) => {
let terminado =
false;
stream.on(
"data",
chunk => {
if (
!chunk
) {
return;
}
let array;
if (
chunk instanceof
Uint8Array
) {
array =
chunk;
} else if (
chunk.buffer
) {
array =
new Uint8Array(
chunk.buffer,
chunk.byteOffset ||
0,
chunk.byteLength
);
} else {
return;
}
const copia =
array.slice();
chunks.push(
copia
);
recibido +=
copia.byteLength;
}
);
stream.on(
"error",
error => {
if (
terminado
) {
return;
}
terminado =
true;
reject(
error
);
}
);
stream.on(
"end",
() => {
if (
terminado
) {
return;
}
terminado =
true;
resolve();
}
);
}
);
if (
recibido !==
esperado
) {
throw new Error(
`MEGAJS entregó ${recibido} bytes; esperábamos ${esperado}.`
);
}
const resultado =
new Uint8Array(
recibido
);
let posicion =
0;
for (
const chunk
of
chunks
) {
resultado.set(
chunk,
posicion
);
posicion +=
chunk.byteLength;
}
const buffer =
resultado.buffer;
buffer.fileStart =
start;
playerState.totalDownloaded +=
recibido;
playerState.cursor =
end +
1;
return {
buffer:
buffer,
start:
start,
end:
end,
size:
recibido
};
}

function crearPromesaMetadata() {
playerState.metadataPromise =
new Promise(
(
resolve,
reject
) => {
playerState.metadataResolve =
resolve;
playerState.metadataReject =
reject;
}
);
return playerState.metadataPromise;
}

function configurarMP4Box(
mp4box
) {
mp4box.onMoovStart =
() => {
console.log(
"[REPRODUCTOR] ✓ MP4Box detectó MOOV."
);
};
mp4box.onError =
error => {
playerState.mp4Error =
true;
console.error(
"[REPRODUCTOR] MP4Box:",
error
);
if (
playerState.metadataReject
) {
playerState.metadataReject(
new Error(
String(
error
)
)
);
}
};
mp4box.onReady =
info => {
console.log(
"[REPRODUCTOR] ✓ MP4Box listo.",
info
);
playerState.mp4Ready =
true;
playerState.mp4Info =
info;
if (
playerState.metadataResolve
) {
playerState.metadataResolve(
info
);
}
};
mp4box.onSegment =
(
trackId,
user,
buffer,
sampleNumber,
last
) => {
playerState.totalSegments++;
let foundTrackId =
null;
for (
const [
id,
sourceBuffer
]
of
playerState.sourceBuffers.entries()
) {
if (
sourceBuffer ===
user
) {
foundTrackId =
id;
break;
}
}
if (
foundTrackId ===
null &&
playerState.sourceBuffers.has(
trackId
)
) {
foundTrackId =
trackId;
}
if (
foundTrackId ===
null
) {
console.warn(
"[REPRODUCTOR] Segmento sin SourceBuffer:",
trackId
);
return;
}
encolarSourceBuffer(
foundTrackId,
buffer
);
actualizarDiagnostico();
};
}

function crearMediaSource() {
if (
!window.MediaSource
) {
throw new Error(
"El navegador no soporta MediaSource."
);
}
const video =
playerState.videoElement;
if (
!video
) {
throw new Error(
"No existe el elemento video."
);
}
const mediaSource =
new MediaSource();
playerState.mediaSource =
mediaSource;
const url =
URL.createObjectURL(
mediaSource
);
playerState.mediaSourceUrl =
url;
video.src =
url;
return new Promise(
(
resolve,
reject
) => {
const timeout =
setTimeout(
() => {
reject(
new Error(
"Timeout esperando MediaSource."
)
);
},
10000
);
mediaSource.addEventListener(
"sourceopen",
() => {
clearTimeout(
timeout
);
resolve();
},
{
once:
true
}
);
mediaSource.addEventListener(
"error",
() => {
clearTimeout(
timeout
);
reject(
new Error(
"MediaSource informó un error."
)
);
},
{
once:
true
}
);
}
);
}

function crearSourceBuffers(
info
) {
const mediaSource =
playerState.mediaSource;
if (
!mediaSource ||
mediaSource.readyState !==
"open"
) {
throw new Error(
"MediaSource no está abierto."
);
}
playerState.sourceBuffers =
new Map();
playerState.sourceQueues =
new Map();
playerState.videoTrackId =
null;
playerState.audioTrackId =
null;
for (
const track
of
info.tracks ||
[]
) {
if (
!track.codec
) {
continue;
}
let mime =
null;
if (
track.video
) {
mime =
`video/mp4; codecs="${track.codec}"`;
} else if (
track.audio
) {
mime =
`audio/mp4; codecs="${track.codec}"`;
}
if (
!mime ||
!MediaSource.isTypeSupported(
mime
)
) {
console.warn(
"[REPRODUCTOR] MSE no soporta:",
mime
);
continue;
}
const sourceBuffer =
mediaSource.addSourceBuffer(
mime
);
sourceBuffer.mode =
"segments";
playerState.sourceBuffers.set(
track.id,
sourceBuffer
);
playerState.sourceQueues.set(
track.id,
[]
);
if (
track.video
) {
playerState.videoTrackId =
track.id;
}
if (
track.audio
) {
playerState.audioTrackId =
track.id;
}
sourceBuffer.addEventListener(
"updateend",
() => {
bombearSourceBuffer(
track.id
);
actualizarDiagnostico();
}
);
sourceBuffer.addEventListener(
"error",
() => {
console.error(
"[REPRODUCTOR] SourceBuffer error:",
track.id
);
}
);
}
if (
playerState.videoTrackId ===
null
) {
throw new Error(
"No se pudo crear SourceBuffer de vídeo."
);
}
}

function configurarSegmentacion(
mp4box,
info
) {
playerState.initSegments =
new Map();
for (
const track
of
info.tracks ||
[]
) {
const sourceBuffer =
playerState.sourceBuffers.get(
track.id
);
if (
!sourceBuffer
) {
continue;
}
mp4box.setSegmentOptions(
track.id,
sourceBuffer,
{
nbSamples:
MUESTRAS_POR_SEGMENTO,
rapAlignement:
true,
normalizeAudioSampleEntriesForMSE:
true
}
);
}
const initSegments =
mp4box.initializeSegmentation(
"per-track"
);
if (
!Array.isArray(
initSegments
)
) {
throw new Error(
"MP4Box no devolvió init segments."
);
}
for (
const init
of
initSegments
) {
if (
!init ||
!init.buffer
) {
continue;
}
const copia =
init.buffer.slice(
0
);
playerState.initSegments.set(
init.id,
copia
);
encolarSourceBuffer(
init.id,
copia
);
}
console.log(
"[REPRODUCTOR] ✓ Segmentación preparada."
);
}

function encolarSourceBuffer(
trackId,
buffer
) {
const queue =
playerState.sourceQueues.get(
trackId
);
if (
!queue
) {
return;
}
let copia;
try {
copia =
buffer.slice(
0
);
} catch {
copia =
buffer;
}
queue.push(
copia
);
bombearSourceBuffer(
trackId
);
}

function bombearSourceBuffer(
trackId
) {
const sourceBuffer =
playerState.sourceBuffers.get(
trackId
);
const queue =
playerState.sourceQueues.get(
trackId
);
if (
!sourceBuffer ||
!queue ||
sourceBuffer.updating ||
queue.length ===
0
) {
return;
}
const mediaSource =
playerState.mediaSource;
if (
!mediaSource ||
mediaSource.readyState !==
"open"
) {
return;
}
const buffer =
queue.shift();
try {
sourceBuffer.appendBuffer(
buffer
);
playerState.totalAppended +=
buffer.byteLength;
} catch (
error
) {
queue.unshift(
buffer
);
console.error(
"[REPRODUCTOR] appendBuffer:",
error
);
}
}

function esperarColas() {
return new Promise(
resolve => {
const inicio =
Date.now();
const revisar =
() => {
let pendiente =
false;
for (
const queue
of
playerState.sourceQueues.values()
) {
if (
queue.length >
0
) {
pendiente =
true;
break;
}
}
if (
!pendiente
) {
for (
const sourceBuffer
of
playerState.sourceBuffers.values()
) {
if (
sourceBuffer.updating
) {
pendiente =
true;
break;
}
}
}
if (
!pendiente
) {
resolve();
return;
}
if (
Date.now() -
inicio >
TIMEOUT_SOURCEBUFFER
) {
resolve();
return;
}
setTimeout(
revisar,
50
);
};
revisar();
}
);
}

async function localizarMOOV(
operationId,
guardarBootstrap =
true
) {
const mp4box =
playerState.mp4box;
let offset =
0;
const bootstrap =
[];
const primerBloque =
await leerRangoMega(
0,
Math.min(
RANGO_INICIAL,
playerState.fileSize
),
false
);
if (
playerState.stopped ||
operationId !==
playerState.operationId
) {
return false;
}
if (
guardarBootstrap
) {
bootstrap.push(
primerBloque.buffer.slice(
0
)
);
}
let siguiente =
mp4box.appendBuffer(
primerBloque.buffer
);
offset =
primerBloque.end +
1;
if (
Number.isFinite(
siguiente
) &&
siguiente >=
0 &&
siguiente <
playerState.fileSize &&
siguiente >
offset
) {
offset =
siguiente;
}
while (
!playerState.mp4Ready &&
!playerState.mp4Error &&
!playerState.stopped &&
operationId ===
playerState.operationId &&
offset <
playerState.fileSize
) {
const size =
Math.min(
RANGO_MEDIA,
playerState.fileSize -
offset
);
const bloque =
await leerRangoMega(
offset,
size,
false
);
if (
playerState.stopped ||
operationId !==
playerState.operationId
) {
return false;
}
if (
guardarBootstrap &&
playerState.bootstrapEnd <
SEEK_REINICIO_MAX
) {
bootstrap.push(
bloque.buffer.slice(
0
)
);
}
siguiente =
mp4box.appendBuffer(
bloque.buffer
);
offset =
bloque.end +
1;
if (
Number.isFinite(
siguiente
) &&
siguiente >=
0 &&
siguiente <
playerState.fileSize &&
Math.abs(
siguiente -
offset
) >
1024
) {
offset =
siguiente;
}
playerState.bootstrapEnd =
offset;
}
if (
guardarBootstrap
) {
playerState.bootstrapBuffers =
bootstrap;
playerState.bootstrapEnd =
offset;
playerState.bootstrapReady =
true;
}
return (
playerState.mp4Ready
);
}

async function crearSesionMedia(
operationId
) {
await crearMediaSource();
if (
playerState.stopped ||
operationId !==
playerState.operationId
) {
return;
}
crearSourceBuffers(
playerState.mp4Info
);
configurarSegmentacion(
playerState.mp4box,
playerState.mp4Info
);
await esperarColas();
}

function crearNuevoMP4Box() {
const mp4box =
MP4BoxAPI.createFile();
playerState.mp4box =
mp4box;
playerState.mp4Ready =
false;
playerState.mp4Error =
false;
crearPromesaMetadata();
configurarMP4Box(
mp4box
);
return mp4box;
}

async function inicializarSesionInicial(
operationId
) {
crearNuevoMP4Box();
mostrarLoading(
"Analizando estructura del vídeo..."
);
actualizarEstadoPlayer(
"Buscando estructura MP4..."
);
const encontrado =
await localizarMOOV(
operationId,
true
);
if (
!encontrado
) {
throw new Error(
"No se pudo localizar MOOV."
);
}
if (
playerState.mp4Error
) {
throw new Error(
"MP4Box informó un error."
);
}
await crearSesionMedia(
operationId
);
let resultadoSeek =
0;
try {
resultadoSeek =
playerState.mp4box.seek(
0,
true
);
} catch (
error
) {
console.warn(
"[REPRODUCTOR] seek inicial:",
error
);
}
const offset =
obtenerOffsetSeek(
resultadoSeek
);
console.log(
`[REPRODUCTOR] ✓ Inicio multimedia: ${offset.toLocaleString()}`
);
iniciarStreamingMedia(
offset,
operationId,
playerState.streamGeneration
).catch(
error => {
if (
!playerState.stopped
) {
console.error(
"[REPRODUCTOR] Streaming:",
error
);
}
}
);
}

async function iniciarStreamingMedia(
offsetInicial,
operationId,
generation
) {
const mp4box =
playerState.mp4box;
if (
!mp4box
) {
throw new Error(
"MP4Box no disponible."
);
}
let offset =
Math.max(
0,
Math.floor(
offsetInicial
)
);
playerState.cursor =
offset;
try {
mp4box.start();
} catch (
error
) {
console.warn(
"[REPRODUCTOR] mp4box.start():",
error
);
}
playerState.streamStarted =
true;
while (
!playerState.stopped &&
!playerState.mp4Error &&
operationId ===
playerState.operationId &&
generation ===
playerState.streamGeneration &&
offset <
playerState.fileSize
) {
const buffer =
obtenerBufferAdelante();
if (
buffer >=
BUFFER_OBJETIVO
) {
await esperarBufferBajo(
operationId,
generation
);
continue;
}
const size =
Math.min(
RANGO_MEDIA,
playerState.fileSize -
offset
);
const bloque =
await leerRangoMega(
offset,
size
);
if (
playerState.stopped ||
operationId !==
playerState.operationId ||
generation !==
playerState.streamGeneration
) {
break;
}
mp4box.appendBuffer(
bloque.buffer
);
offset =
bloque.end +
1;
playerState.cursor =
offset;
actualizarDiagnostico();
await intentarReproduccion();
await new Promise(
resolve =>
setTimeout(
resolve,
10
)
);
}
if (
offset >=
playerState.fileSize &&
!playerState.stopped &&
operationId ===
playerState.operationId &&
generation ===
playerState.streamGeneration
) {
try {
mp4box.flush();
} catch (
error
) {
console.warn(
"[REPRODUCTOR] flush:",
error
);
}
}
}

function esperarBufferBajo(
operationId,
generation
) {
return new Promise(
resolve => {
const revisar =
() => {
if (
playerState.stopped ||
operationId !==
playerState.operationId ||
generation !==
playerState.streamGeneration
) {
resolve();
return;
}
if (
obtenerBufferAdelante() <=
BUFFER_BAJO
) {
resolve();
return;
}
setTimeout(
revisar,
500
);
};
revisar();
}
);
}

async function intentarReproduccion() {
const video =
playerState.videoElement;
if (
!video ||
playerState.playbackStarted ||
playerState.stopped ||
playerState.seekInProgress ||
!playerState.allowAutoplay
) {
return;
}
if (
obtenerBufferAdelante() <
BUFFER_INICIAL
) {
return;
}
if (
playerState.playAttempt
) {
return;
}
playerState.playAttempt =
true;
try {
await video.play();
playerState.playbackStarted =
true;
ocultarLoading();
actualizarBotonPlay();
actualizarEstadoPlayer(
"Reproduciendo"
);
} catch {
ocultarLoading();
actualizarEstadoPlayer(
"Vídeo listo — pulsa PLAY."
);
} finally {
playerState.playAttempt =
false;
}
}

async function prepararArchivoMega(
drama
) {
const url =
typeof drama.embed_url ===
"string"
? drama.embed_url.trim()
: "";
if (
!url
) {
throw new Error(
"Este microdrama no tiene vídeo."
);
}
if (
!MEGAFile
) {
throw new Error(
"MEGAJS no está cargado."
);
}
const megaUrl =
url.replace(
"https://mega.nz/embed/",
"https://mega.nz/file/"
);
const file =
MEGAFile.fromURL(
megaUrl
);
if (
!file
) {
throw new Error(
"MEGAJS no pudo crear el archivo."
);
}
const loaded =
await file.loadAttributes();
playerState.file =
loaded ||
file;
playerState.fileSize =
Number(
playerState.file.size ||
0
);
if (
!playerState.fileSize
) {
throw new Error(
"MEGAJS no devolvió tamaño."
);
}
playerState.megaLoaded =
true;
console.log(
`[REPRODUCTOR] ✓ Archivo: ${
playerState.file.name ||
"sin nombre"
}`
);
console.log(
`[REPRODUCTOR] ✓ Tamaño: ${
formatoBytes(
playerState.fileSize
)
}`
);
return playerState.file;
}

async function reproducirDrama(
drama
) {
if (
!drama
) {
return;
}
if (
esDramaBorrador(
drama
)
) {
return;
}
const embedUrl =
typeof drama.embed_url ===
"string"
? drama.embed_url.trim()
: "";
if (
!embedUrl
) {
mostrarMensajeSinVideo(
drama.title
);
return;
}
if (
playerState.open
) {
detenerReproductor();
}
crearReproductor();
const elementos =
playerState.playerElements;
const operationId =
++playerState.operationId;
playerState.open =
true;
playerState.loading =
true;
playerState.stopped =
false;
playerState.drama =
drama;
playerState.file =
null;
playerState.fileSize =
0;
playerState.mp4box =
null;
playerState.mp4Info =
null;
playerState.mp4Ready =
false;
playerState.mp4Error =
false;
playerState.mediaSource =
null;
playerState.mediaSourceUrl =
null;
playerState.sourceBuffers =
new Map();
playerState.sourceQueues =
new Map();
playerState.totalDownloaded =
0;
playerState.totalSegments =
0;
playerState.totalAppended =
0;
playerState.megaRequests =
0;
playerState.cursor =
0;
playerState.playbackStarted =
false;
playerState.streamStarted =
false;
playerState.seekInProgress =
false;
playerState.seekToken =
0;
playerState.userSeeking =
false;
playerState.pendingSeekTime =
null;
playerState.allowAutoplay =
true;
playerState.streamGeneration =
0;
playerState.bootstrapBuffers =
[];
playerState.bootstrapEnd =
0;
playerState.bootstrapReady =
false;
reproductorActual =
drama;
elementos.titulo.textContent =
drama.title;
elementos.video.removeAttribute(
"src"
);
elementos.video.load();
elementos.progress.value =
"0";
elementos.time.textContent =
"0:00 / 0:00";
mostrarLoading(
"Cargando reproductor..."
);
actualizarEstadoPlayer(
"Cargando MEGAJS y MP4Box..."
);
elementos.reproductor.classList.add(
"is-open"
);
elementos.reproductor.setAttribute(
"aria-hidden",
"false"
);
document.body.classList.add(
"video-player-open"
);
registrarVista(
drama
).then(
views => {
if (
views ===
null
) {
return;
}
drama.views =
views;
actualizarVistasTarjeta(
drama,
views
);
}
);
try {
await cargarLibreriasReproductor();
if (
operationId !==
playerState.operationId ||
playerState.stopped
) {
return;
}
actualizarEstadoPlayer(
"Conectando con MEGA..."
);
await prepararArchivoMega(
drama
);
await inicializarSesionInicial(
operationId
);
playerState.loading =
false;
actualizarDiagnostico();
} catch (
error
) {
console.error(
"[REPRODUCTOR] Error:",
error
);
if (
operationId !==
playerState.operationId
) {
return;
}
playerState.mp4Error =
true;
playerState.loading =
false;
mostrarLoading(
error.message ||
"No se pudo reproducir el vídeo."
);
actualizarEstadoPlayer(
`Error: ${
error.message ||
error
}`
);
}
}

async function ejecutarSeekDesdeBarra() {
const destino =
Number(
playerState.pendingSeekTime
);
playerState.userSeeking =
false;
playerState.pendingSeekTime =
null;
if (
!Number.isFinite(
destino
)
) {
return;
}
await ejecutarSeekReal(
destino
);
}

function ejecutarSaltoSegundos(
segundos
) {
const video =
playerState.videoElement;
if (
!video
) {
console.warn(
"[SEEK] No existe elemento video."
);
return;
}
const actual =
Number(
video.currentTime
);
const duracion =
Number(
video.duration
);
console.log(
"[SEEK] Botón:",
segundos,
"Actual:",
actual,
"Duración:",
duracion
);
if (
!Number.isFinite(
actual
)
) {
actualizarEstadoPlayer(
"El tiempo actual todavía no está disponible."
);
return;
}
if (
!Number.isFinite(
duracion
) ||
duracion <=
0
) {
actualizarEstadoPlayer(
"El vídeo todavía está preparando la duración."
);
return;
}
const destino =
Math.max(
0,
Math.min(
duracion -
0.05,
actual +
Number(segundos)
)
);
ejecutarSeekReal(
destino
);
}

async function ejecutarSeekReal(
destino
) {
const video =
playerState.videoElement;
if (
!video ||
playerState.stopped
) {
return;
}
const duration =
Number(
video.duration
);
if (
!Number.isFinite(
duration
) ||
duration <=
0
) {
console.warn(
"[SEEK] duration no disponible."
);
return;
}
const tiempo =
Math.max(
0,
Math.min(
duration -
0.05,
Number(destino)
)
);
if (
!Number.isFinite(
tiempo
)
) {
return;
}
if (
playerState.seekInProgress
) {
playerState.pendingSeekTime =
tiempo;
console.log(
`[SEEK] Hay otro SEEK en curso. Nuevo destino guardado: ${formatoTiempo(tiempo)}`
);
return;
}
if (
estaEnBuffer(
tiempo
)
) {
console.log(
`[SEEK] LOCAL ${formatoTiempo(video.currentTime)} → ${formatoTiempo(tiempo)}`
);
const anterior =
video.currentTime;
try {
if (
typeof video.fastSeek ===
"function"
) {
try {
video.fastSeek(
tiempo
);
} catch {
video.currentTime =
tiempo;
}
} else {
video.currentTime =
tiempo;
}
} catch (
error
) {
console.error(
"[SEEK] Error SEEK local:",
error
);
await ejecutarSeekRemoto(
tiempo
);
return;
}
actualizarControlesVideo();
setTimeout(
() => {
if (
playerState.stopped ||
playerState.seekInProgress
) {
return;
}
const actual =
Number(
video.currentTime
);
console.log(
`[SEEK] Verificación local: ${formatoTiempo(anterior)} → ${formatoTiempo(actual)}`
);
if (
Math.abs(
actual -
tiempo
) >
0.75
) {
console.log(
"[SEEK] El navegador no aplicó el SEEK local. Se inicia SEEK remoto."
);
ejecutarSeekRemoto(
tiempo
);
}
},
150
);
return;
}
await ejecutarSeekRemoto(
tiempo
);
}

async function ejecutarSeekRemoto(
tiempo
) {
const video =
playerState.videoElement;
if (
!video ||
playerState.stopped
) {
return;
}
if (
playerState.seekInProgress
) {
playerState.pendingSeekTime =
tiempo;
return;
}
const token =
++playerState.seekToken;
const operationId =
playerState.operationId;
const estabaReproduciendo =
!video.paused;
playerState.seekInProgress =
true;
playerState.allowAutoplay =
estabaReproduciendo;
const generation =
++playerState.streamGeneration;
try {
console.log(
"================================================"
);
console.log(
`[SEEK] REMOTO → ${formatoTiempo(tiempo)}`
);
actualizarEstadoPlayer(
`Buscando ${formatoTiempo(tiempo)}...`
);
mostrarLoading(
`Buscando ${formatoTiempo(tiempo)}...`
);
try {
video.pause();
} catch {}
if (
playerState.mp4box
) {
try {
playerState.mp4box.stop();
} catch {}
}
const mediaSourceAnterior =
playerState.mediaSource;
const mediaSourceUrlAnterior =
playerState.mediaSourceUrl;
if (
mediaSourceAnterior &&
mediaSourceAnterior.readyState ===
"open"
) {
try {
mediaSourceAnterior.endOfStream();
} catch {}
}
if (
mediaSourceUrlAnterior
) {
try {
URL.revokeObjectURL(
mediaSourceUrlAnterior
);
} catch {}
}
playerState.mediaSource =
null;
playerState.mediaSourceUrl =
null;
playerState.sourceBuffers =
new Map();
playerState.sourceQueues =
new Map();
playerState.initSegments =
new Map();
playerState.streamStarted =
false;
playerState.playbackStarted =
false;
playerState.mp4Ready =
false;
playerState.mp4Error =
false;
const mp4box =
crearNuevoMP4Box();
if (
token !==
playerState.seekToken ||
operationId !==
playerState.operationId ||
playerState.stopped
) {
return;
}
actualizarEstadoPlayer(
"Reconstruyendo estructura MP4..."
);
const encontrado =
await localizarMOOV(
operationId,
false
);
if (
token !==
playerState.seekToken ||
operationId !==
playerState.operationId ||
playerState.stopped
) {
return;
}
if (
!encontrado ||
!playerState.mp4Ready ||
!playerState.mp4Info
) {
throw new Error(
"No se pudo reconstruir la estructura MP4."
);
}
actualizarEstadoPlayer(
`Calculando posición ${formatoTiempo(tiempo)}...`
);
let resultadoSeek;
try {
resultadoSeek =
mp4box.seek(
tiempo,
true
);
} catch (
error
) {
throw new Error(
`MP4Box no pudo realizar SEEK: ${
error.message ||
error
}`
);
}
const offsetMega =
obtenerOffsetSeek(
resultadoSeek
);
console.log(
"[SEEK] mp4box.seek():",
resultadoSeek
);
console.log(
`[SEEK] Offset MEGA: ${
Number(
offsetMega
).toLocaleString()
}`
);
if (
!Number.isFinite(
offsetMega
) ||
offsetMega <
0 ||
offsetMega >=
playerState.fileSize
) {
throw new Error(
`Offset MEGA inválido: ${offsetMega}`
);
}
actualizarEstadoPlayer(
"Preparando nuevo buffer..."
);
await crearSesionMedia(
operationId
);
if (
token !==
playerState.seekToken ||
operationId !==
playerState.operationId ||
playerState.stopped
) {
return;
}
actualizarEstadoPlayer(
`Cargando ${formatoTiempo(tiempo)}...`
);
iniciarStreamingMedia(
offsetMega,
operationId,
generation
).catch(
error => {
if (
token ===
playerState.seekToken &&
!playerState.stopped
) {
console.error(
"[SEEK] Error streaming remoto:",
error
);
}
}
);
const disponible =
await esperarBufferEnPunto(
tiempo,
token,
30000
);
if (
token !==
playerState.seekToken ||
operationId !==
playerState.operationId ||
playerState.stopped
) {
return;
}
if (
!disponible
) {
throw new Error(
`El punto ${formatoTiempo(tiempo)} no llegó al buffer después de 30 segundos.`
);
}
try {
video.currentTime =
tiempo;
} catch {}
await new Promise(
resolve =>
setTimeout(
resolve,
100
)
);
const diferencia =
Math.abs(
Number(
video.currentTime
) -
tiempo
);
if (
diferencia >
1
) {
console.warn(
`[SEEK] El navegador ajustó el punto. Solicitado ${tiempo.toFixed(2)}, actual ${video.currentTime.toFixed(2)}`
);
}
ocultarLoading();
actualizarControlesVideo();
if (
estabaReproduciendo
) {
playerState.allowAutoplay =
true;
try {
await video.play();
playerState.playbackStarted =
true;
actualizarBotonPlay();
actualizarEstadoPlayer(
`Reproduciendo desde ${formatoTiempo(tiempo)}`
);
} catch {
actualizarBotonPlay();
actualizarEstadoPlayer(
`Listo en ${formatoTiempo(tiempo)} — pulsa PLAY`
);
}
} else {
playerState.allowAutoplay =
false;
actualizarBotonPlay();
actualizarEstadoPlayer(
`Pausado en ${formatoTiempo(tiempo)}`
);
}
console.log(
`[SEEK] ✓ COMPLETADO → ${formatoTiempo(tiempo)}`
);
} catch (
error
) {
console.error(
"[SEEK] ERROR:",
error
);
if (
token ===
playerState.seekToken
) {
mostrarLoading(
error.message ||
"No se pudo realizar el salto."
);
actualizarEstadoPlayer(
`Error SEEK: ${
error.message ||
error
}`
);
}
} finally {
if (
token ===
playerState.seekToken
) {
playerState.seekInProgress =
false;
const siguiente =
playerState.pendingSeekTime;
playerState.pendingSeekTime =
null;
if (
Number.isFinite(
siguiente
) &&
Math.abs(
siguiente -
Number(
video.currentTime
)
) >
0.75
) {
setTimeout(
() => {
ejecutarSeekReal(
siguiente
);
},
50
);
}
}
}
}

function obtenerFileStartBootstrap(
buffer,
buffers
) {
if (
!Array.isArray(
buffers
)
) {
return 0;
}
let offset =
0;
for (
const actual
of
buffers
) {
if (
actual ===
buffer
) {
return offset;
}
offset +=
actual.byteLength;
}
return 0;
}

function esperarBufferEnPunto(
tiempo,
token,
timeout =
30000
) {
return new Promise(
resolve => {
const inicio =
Date.now();
const revisar =
() => {
if (
playerState.stopped ||
token !==
playerState.seekToken
) {
resolve(
false
);
return;
}
if (
estaEnBuffer(
tiempo
)
) {
resolve(
true
);
return;
}
if (
Date.now() -
inicio >=
timeout
) {
resolve(
false
);
return;
}
setTimeout(
revisar,
100
);
};
revisar();
}
);
}

function obtenerOffsetSeek(
resultado
) {
if (
Number.isFinite(
resultado
)
) {
return resultado;
}
if (
resultado &&
Number.isFinite(
resultado.offset
)
) {
return resultado.offset;
}
return 0;
}

async function alternarPantallaCompleta() {
const elementos =
playerState.playerElements;
if (
!elementos
) {
return;
}
try {
if (
document.fullscreenElement
) {
await document.exitFullscreen();
return;
}
if (
elementos.ventana.requestFullscreen
) {
await elementos.ventana.requestFullscreen();
}
} catch (
error
) {
console.warn(
"[REPRODUCTOR] Fullscreen:",
error
);
}
}

function manejarTecladoPlayer(
evento
) {
const reproductor =
document.getElementById(
"md-player"
);
if (
!reproductor ||
!reproductor.classList.contains(
"is-open"
)
) {
return;
}
const video =
playerState.videoElement;
if (
!video
) {
return;
}
const tag =
evento.target?.tagName;
if (
tag ===
"INPUT" ||
tag ===
"TEXTAREA"
) {
return;
}
switch (
evento.key.toLowerCase()
) {
case " ":
case "k":
evento.preventDefault();
if (
video.paused
) {
playerState.allowAutoplay =
true;
video.play().catch(
() => {}
);
} else {
playerState.allowAutoplay =
false;
video.pause();
}
break;
case "arrowleft":
evento.preventDefault();
ejecutarSeekReal(
Math.max(
0,
video.currentTime -
5
)
);
break;
case "arrowright":
evento.preventDefault();
if (
Number.isFinite(
video.duration
)
) {
ejecutarSeekReal(
Math.min(
video.duration -
0.05,
video.currentTime +
5
)
);
}
break;
case "m":
evento.preventDefault();
video.muted =
!video.muted;
actualizarIconoVolumen();
break;
case "f":
evento.preventDefault();
alternarPantallaCompleta();
break;
}
}

function actualizarDiagnostico() {
const video =
playerState.videoElement;
const elementos =
playerState.playerElements;
if (
!video ||
!elementos
) {
return;
}
const buffer =
obtenerBufferAdelante();
const estado =
playerState.mp4Error
? "ERROR"
: playerState.seekInProgress
? "SEEK"
: playerState.playbackStarted
? "REPRODUCIENDO"
: playerState.streamStarted
? "CARGANDO"
: "PREPARANDO";
elementos.status.textContent =
`${estado} · Buffer ${buffer.toFixed(1)}s · ${formatoBytes(playerState.totalDownloaded)} · Seg ${playerState.totalSegments}`;
}

function detenerReproductor() {
playerState.stopped =
true;
playerState.open =
false;
playerState.loading =
false;
playerState.operationId++;
playerState.seekToken++;
playerState.streamGeneration++;
if (
playerState.mp4box
) {
try {
playerState.mp4box.stop();
} catch {}
}
const video =
playerState.videoElement;
if (
video
) {
try {
video.pause();
} catch {}
video.removeAttribute(
"src"
);
video.load();
}
if (
playerState.mediaSource &&
playerState.mediaSource.readyState ===
"open"
) {
try {
playerState.mediaSource.endOfStream();
} catch {}
}
if (
playerState.mediaSourceUrl
) {
try {
URL.revokeObjectURL(
playerState.mediaSourceUrl
);
} catch {}
}
playerState.mediaSource =
null;
playerState.mediaSourceUrl =
null;
playerState.mp4box =
null;
playerState.sourceBuffers =
new Map();
playerState.sourceQueues =
new Map();
playerState.initSegments =
new Map();
playerState.streamStarted =
false;
playerState.playbackStarted =
false;
playerState.seekInProgress =
false;
reproductorActual =
null;
}

function cerrarReproductor() {
const reproductor =
document.getElementById(
"md-player"
);
if (
!reproductor
) {
return;
}
detenerReproductor();
reproductor.classList.remove(
"is-open"
);
reproductor.setAttribute(
"aria-hidden",
"true"
);
document.body.classList.remove(
"video-player-open"
);
}

function mostrarMensajeSinVideo(
tituloDrama
) {
const mensaje =
document.createElement(
"div"
);
mensaje.className =
"video-missing-message";
mensaje.innerHTML =
`
<div class="video-missing-message__box">
<h2>
Video no disponible
</h2>
<p>
El microdrama
<strong></strong>
todavía no tiene un vídeo configurado.
</p>
<button
type="button"
class="video-missing-message__close"
>
Cerrar
</button>
</div>
`;
mensaje.querySelector(
"strong"
).textContent =
tituloDrama;
mensaje.querySelector(
".video-missing-message__close"
).addEventListener(
"click",
() => {
mensaje.remove();
}
);
document.body.appendChild(
mensaje
);
}

document.addEventListener(
"keydown",
evento => {
if (
evento.key !==
"Escape"
) {
return;
}
const reproductor =
document.getElementById(
"md-player"
);
if (
reproductor &&
reproductor.classList.contains(
"is-open"
)
) {
if (
document.fullscreenElement
) {
document.exitFullscreen()
.catch(
() => {}
);
return;
}
cerrarReproductor();
return;
}
cerrarDetalleMovil();
}
);

window.addEventListener(
"resize",
() => {
if (
!esVistaMovil()
) {
cerrarDetalleMovil();
}
}
);

function inicializarReproductor() {
crearReproductor();
}

inicializarReproductor();

cargarDramas();
