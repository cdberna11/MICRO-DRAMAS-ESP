/* Portadas externas — transición segura de GitHub a Cloudflare R2.
 * COVERS_STORAGE_BACKEND=github (por defecto) mantiene el flujo existente.
 * COVERS_STORAGE_BACKEND=r2 activa exclusivamente el bucket COVERS_BUCKET.
 * Ninguna función crea/borrra registros de dramas en D1.
 */
const TYPE_BY_EXTENSION = Object.freeze({
  jpg: "image/jpeg", jpeg: "image/jpeg",
  png: "image/png", webp: "image/webp", gif: "image/gif"
});
const CACHE_IMMUTABLE = "public, max-age=31536000, immutable";

/* Solo estas siete plataformas tienen carpeta propia en R2.
 * El nombre de cualquier plataforma adicional se conserva en D1, pero
 * su portada se guarda en portadas/variados/ para evitar carpetas nuevas.
 */
const OFFICIAL_COVER_FOLDERS = new Set([
  "dramabox","dramawave","goodshort","flickreel",
  "melolo","netshort","reelshort"
]);

export function coverStorageFolder(platform) {
  const normalized = coverSegment(platform,80);
  if (!normalized) return null;
  return OFFICIAL_COVER_FOLDERS.has(normalized) ? normalized : "variados";
}


export function coverStorageMode(env) {
  return String(env?.COVERS_STORAGE_BACKEND || "").toLowerCase() === "r2" ? "r2" : "github";
}

/* En producción la migración puede activar R2 desde D1, sin tocar
 * variables del panel Cloudflare. Una variable explícita tiene prioridad
 * para permitir reversión de emergencia. Si D1 falla, NO subir a GitHub
 * silenciosamente después de activar R2.
 */
export async function activeCoverBackend(env) {
  const override=String(env?.COVERS_STORAGE_BACKEND||"").trim().toLowerCase();
  if(override==="r2"||override==="github")return override;
  if(!env?.DB)throw new Error("No está conectado D1 para determinar el almacenamiento de portadas.");
  try {
    const setting=await env.DB.prepare(
      "SELECT backend FROM md_cover_storage_control WHERE id=1"
    ).first();
    return setting?.backend==="r2"?"r2":"github";
  }catch(error){
    if(/no such table:\s*md_cover_storage_control/i.test(String(error?.message||error)))
      return "github";
    throw error;
  }
}

export function coverSegment(value, maxLength = 80) {
  const text = String(value ?? "").trim().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return text.slice(0, maxLength).replace(/-+$/g, "");
}
export function validCoverKey(key) {
  if (typeof key !== "string" || key.length > 280 || key.includes("..")) return false;
  const segments = key.split("/");
  return segments.length === 3 && segments[0] === "portadas" &&
    /^[a-z0-9][a-z0-9-]{0,79}$/.test(segments[1]) &&
    /^[A-Za-z0-9][A-Za-z0-9._ -]{0,239}\.(?:jpg|jpeg|png|webp|gif)$/i.test(segments[2]);
}

export function coverMime(key) {
  return TYPE_BY_EXTENSION[String(key).split(".").pop().toLowerCase()] || null;
}

export function fileMime(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 &&
      bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10)
    return "image/png";
  if (bytes.length >= 12 &&
      [82,73,70,70].every((n,i)=>bytes[i]===n) &&
      [87,69,66,80].every((n,i)=>bytes[i+8]===n))
    return "image/webp";
  if (bytes.length >= 6 &&
      [71,73,70,56].every((n,i)=>bytes[i]===n) &&
      (bytes[4] === 55 || bytes[4] === 57) && bytes[5] === 97)
    return "image/gif";
  return null;
}

export function coverJson(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export async function storeCoverR2(context) {
  const bucket = context.env.COVERS_BUCKET;
  if (!bucket) return coverJson({
    success:false,
    error:"No está conectado el bucket R2 COVERS_BUCKET. La carga no se realizó."
  },503);

  const contentType = context.request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("multipart/form-data"))
    return coverJson({success:false,error:"La portada debe enviarse como multipart/form-data."},415);

  const form = await context.request.formData();
  const file = form.get("file");
  const platform = String(form.get("platform") || "").trim();
  const slug = coverSegment(form.get("slug"), 100);
  if (!(file instanceof File))
    return coverJson({success:false,error:"No se recibió ninguna imagen."},400);
  if (!platform || !slug)
    return coverJson({success:false,error:"Debes indicar la plataforma y el título del microdrama."},400);
  if (file.size < 1 || file.size > 10*1024*1024)
    return coverJson({success:false,error:"La portada debe pesar entre 1 byte y 10 MB."},400);

  const ext = String(file.name).split(".").pop().toLowerCase();
  const expectedMime = TYPE_BY_EXTENSION[ext];
  const platformSlug = coverSegment(platform,80);
  const folder = coverStorageFolder(platform);
  if (!expectedMime || !platformSlug || !folder ||
      !/^[a-z0-9][a-z0-9-]{0,79}$/.test(platformSlug) ||
      String(file.type).toLowerCase() !== expectedMime) {
    return coverJson({success:false,error:"Formato o plataforma no admitidos. Utiliza JPG, PNG, WEBP o GIF."},400);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (fileMime(bytes) !== expectedMime)
    return coverJson({success:false,error:"El contenido real de la imagen no coincide con su extensión."},400);

  const digest = await crypto.subtle.digest("SHA-256",bytes);
  const checksum = [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,"0")).join("");
  // Identificador por contenido: cambiar una portada no rompe la versión cacheada.
  // En «variados» se antepone la plataforma para distinguir títulos de
  // proveedores distintos sin cambiar el nombre registrado en D1.
  const filename = (folder==="variados" ? platformSlug+"-" : "")+
    slug+"-"+checksum.slice(0,16)+"."+ext;
  const key = "portadas/"+folder+"/"+filename;
  if (!validCoverKey(key))
    return coverJson({success:false,error:"La ruta de la portada no es válida."},400);

  let previous = await bucket.head(key);
  if (previous && previous.size !== bytes.byteLength)
    return coverJson({success:false,error:"El objeto existente no coincide con el tamaño del archivo."},409);

  if (!previous) {
    const stored = await bucket.put(key,bytes,{
      httpMetadata:{
        contentType:expectedMime,
        contentDisposition:"inline",
        cacheControl:CACHE_IMMUTABLE
      },
      customMetadata:{sha256:checksum}
    });
    if (!stored || stored.size !== bytes.byteLength)
      return coverJson({success:false,error:"R2 no confirmó correctamente la carga."},502);
    previous = stored;
  }
  // La ruta de la portada se guarda en D1 únicamente cuando el admin
  // confirma el alta/edición del drama. Nunca tocar D1 aquí.
  return coverJson({
    success:true,
    storage:"r2",
    path:"/media/"+key,
    filename,
    platform,
    key,
    size:previous.size,
    cache:"immutable"
  });
}
