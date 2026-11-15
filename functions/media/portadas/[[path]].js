/* GET/HEAD público para imágenes de R2. No publica el bucket ni permite listar/borrar.
 * URL: /media/portadas/{plataforma}/{archivo}.ext
 */
import {validCoverKey,coverMime} from "../../lib/cover-storage.js";

async function getCover(context,headOnly) {
  const parts = context.params.path;
  if (!Array.isArray(parts) || parts.length!==2) return new Response("Ruta no válida",{status:400});
  const key = "portadas/"+parts.join("/");
  if (!validCoverKey(key)) return new Response("Ruta no válida",{status:400});
  const bucket=context.env.COVERS_BUCKET;
  if (!bucket) return new Response("Almacenamiento R2 no configurado",{status:503,headers:{"Cache-Control":"no-store"}});

  const obj=await bucket.get(key);
  if (!obj) return new Response("Portada no encontrada",{status:404,headers:{"Cache-Control":"no-store"}});
  const versioned = /-[a-f0-9]{16}\.(jpg|jpeg|png|webp|gif)$/i.test(key);
  const headers=new Headers();
  headers.set("Content-Type",coverMime(key));
  headers.set("Content-Disposition","inline");
  headers.set("Content-Length",String(obj.size));
  headers.set("Cache-Control",versioned?"public, max-age=31536000, immutable":"public, max-age=3600");
  headers.set("X-Content-Type-Options","nosniff");
  headers.set("Cross-Origin-Resource-Policy","cross-origin");
  headers.set("ETag",obj.httpEtag);
  if (obj.uploaded) headers.set("Last-Modified",new Date(obj.uploaded).toUTCString());

  const incoming=context.request.headers.get("if-none-match");
  if (incoming && incoming.split(",").some(tag=>tag.trim()===obj.httpEtag || tag.trim()==="*")) {
    headers.delete("Content-Length");
    return new Response(null,{status:304,headers});
  }
  return new Response(headOnly?null:obj.body,{status:200,headers});
}
export async function onRequestGet(context){return getCover(context,false);}
export async function onRequestHead(context){return getCover(context,true);}
