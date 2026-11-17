/*
 * Compatibilidad temporal para referencias antiguas a la portada genérica.
 * El fichero original ya reside en Cloudflare R2 y se sirve por /media/.
 * La redirección no mueve ni duplica imágenes y no afecta a otras carpetas.
 */
const TARGET="/media/portadas/generica/portada-generica.png";
function legacyGenericCover(context) {
  const path=new URL(context.request.url).pathname;
  if(path!=="/portadas/generica/portada-generica.png")
    return context.next();
  return new Response(null,{
    status:308,
    headers:{
      "Location":TARGET,
      "Cache-Control":"public, max-age=3600",
      "X-Content-Type-Options":"nosniff"
    }
  });
}
export async function onRequestGet(context) {return legacyGenericCover(context);}
export async function onRequestHead(context) {return legacyGenericCover(context);}
