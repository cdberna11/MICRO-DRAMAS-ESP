/* Migración R2 directamente desde el despliegue Cloudflare Pages.
 * Protegido por _middleware (sesión administrativa D1).
 * Importa únicamente los objetos del manifiesto Git versionado.
 * No modifica D1, no borra portadas y nunca consulta una URL arbitraria.
 */
import {validCoverKey,coverMime,fileMime,coverJson} from "../../lib/cover-storage.js";

const MANIFEST="/scripts/r2-portadas-manifest.json";
const MAX_BATCH=3;
const CONFIRMATION="MIGRAR PORTADAS A R2";

async function inventory(context) {
  if (!context.env.ASSETS?.fetch)
    throw new Error("El binding ASSETS de Cloudflare Pages no está disponible.");
  const response=await context.env.ASSETS.fetch(new Request(new URL(MANIFEST,context.request.url),{
    method:"GET",
    headers:{"Accept":"application/json"}
  }));
  if (!response.ok) throw new Error("No se pudo leer el manifiesto desde el despliegue: HTTP "+response.status);
  const doc=await response.json();
  if (!doc || doc.schema!==1 || doc.count!==94 || !Array.isArray(doc.files) ||
      doc.files.length!==94 || !Number.isSafeInteger(doc.bytes) || doc.bytes<=0)
    throw new Error("El inventario de portadas no es el esperado.");
  let sum=0;
  const seen=new Set();
  for(const file of doc.files){
    if (!validCoverKey(file.path)||!file.path.startsWith("portadas/")||
        /^(portadas\/(?:avatares|generica)\/)/.test(file.path) ||
        !Number.isSafeInteger(file.size)||file.size<=0||file.size>10*1024*1024||
        !/^[a-f0-9]{40}$/i.test(file.blobSha)||seen.has(file.path))
      throw new Error("Manifiesto inválido o repetido: "+String(file.path));
    sum+=file.size;seen.add(file.path);
  }
  if (sum!==doc.bytes) throw new Error("El total del inventario no coincide con los archivos.");
  return doc;
}
function sliceOptions(url,manifest) {
  const offset=Number(url.searchParams.get("offset")||0);
  const limit=Number(url.searchParams.get("limit")||MAX_BATCH);
  if (!Number.isSafeInteger(offset)||offset<0||offset>=manifest.files.length||
      !Number.isSafeInteger(limit)||limit<1||limit>MAX_BATCH)
    return null;
  return {offset,limit,files:manifest.files.slice(offset,offset+limit)};
}
async function digests(bytes) {
  const header=new TextEncoder().encode("blob "+bytes.byteLength+"\0");
  const gitInput=new Uint8Array(header.length+bytes.byteLength);
  gitInput.set(header);
  gitInput.set(bytes,header.length);
  const [gitDigest,shaDigest]=await Promise.all([
    crypto.subtle.digest("SHA-1",gitInput),
    crypto.subtle.digest("SHA-256",bytes)
  ]);
  const hex=buf=>Array.from(new Uint8Array(buf),n=>n.toString(16).padStart(2,"0")).join("");
  return {git:hex(gitDigest),sha256:hex(shaDigest)};
}
async function verifyObject(bucket,file) {
  const object=await bucket.get(file.path);
  if(!object)return {ok:false,reason:"No existe en R2"};
  if(object.size!==file.size)return {ok:false,reason:"Tamaño diferente en R2"};
  const bytes=new Uint8Array(await object.arrayBuffer());
  const digest=await digests(bytes);
  if(digest.git!==file.blobSha.toLowerCase())
    return {ok:false,reason:"Checksum diferente en R2"};
  return {ok:true,size:bytes.byteLength,sha256:digest.sha256};
}
async function sourceBytes(context,file) {
  const path="/"+file.path.split("/").map(encodeURIComponent).join("/");
  const resp=await context.env.ASSETS.fetch(new Request(new URL(path,context.request.url),{
    method:"GET"
  }));
  if(!resp.ok)throw new Error("Origen estático no disponible: HTTP "+resp.status);
  const buffer=new Uint8Array(await resp.arrayBuffer());
  if(buffer.byteLength!==file.size)throw new Error("Tamaño de origen diferente al inventario");
  const mime=coverMime(file.path);
  if(fileMime(buffer)!==mime)
    throw new Error("El contenido de origen no coincide con el formato de imagen esperado");
  const digest=await digests(buffer);
  if(digest.git!==file.blobSha.toLowerCase())
    throw new Error("El checksum del origen no coincide con GitHub");
  return {buffer,digest,mime};
}
async function transfer(context,file) {
  const bucket=context.env.COVERS_BUCKET;
  const existing=await bucket.head(file.path);
  if(existing){
    const verified=await verifyObject(bucket,file);
    if(!verified.ok) throw new Error("Objeto existente conflictivo: "+verified.reason);
    return {path:file.path,status:"already",bytes:file.size};
  }
  const {buffer,digest,mime}=await sourceBytes(context,file);
  const written=await bucket.put(file.path,buffer,{
    httpMetadata:{contentType:mime,contentDisposition:"inline",cacheControl:"public, max-age=3600"},
    customMetadata:{gitBlobSha:file.blobSha,sha256:digest.sha256}
  });
  if(!written||written.size!==file.size)throw new Error("R2 no confirmó el tamaño después de subir");
  const checked=await verifyObject(bucket,file);
  if(!checked.ok)throw new Error("Falló la verificación R2 posterior a la copia: "+checked.reason);
  return {path:file.path,status:"copied",bytes:file.size};
}
function sameOrigin(request) {
  const origin=request.headers.get("Origin");
  if(!origin)return false;
  try{return new URL(origin).origin===new URL(request.url).origin;}
  catch{return false;}
}

export async function onRequestGet(context) {
  try{
    const manifest=await inventory(context);
    const bucket=context.env.COVERS_BUCKET;
    if(!bucket)return coverJson({
      success:true,bucketConnected:false,ready:false,
      total:manifest.count,bytes:manifest.bytes,
      message:"No está conectado el bucket COVERS_BUCKET en este despliegue."
    });
    const mode=new URL(context.request.url).searchParams.get("mode")||"status";
    if(mode==="status"){
      // No exigir variable r2: el switch de carga administrativa debe seguir en GitHub.
      const first=await bucket.list({limit:1});
      return coverJson({
        success:true,bucketConnected:true,ready:true,
        total:manifest.count,bytes:manifest.bytes,
        existingObjects:Boolean(first?.objects?.length),
        message:"R2 conectado; el catálogo y D1 no cambiarán durante la copia."
      });
    }
    if(mode!=="verify")return coverJson({success:false,error:"Modo desconocido."},400);
    const options=sliceOptions(new URL(context.request.url),manifest);
    if(!options)return coverJson({success:false,error:"Rango fuera del inventario."},400);
    const files=[];
    for(const file of options.files){
      try{const result=await verifyObject(bucket,file);
        files.push({path:file.path,...result});
      }catch(error){
        console.error("[Migración R2] No se pudo verificar:",file.path,error);
        files.push({path:file.path,ok:false,reason:"Error de lectura R2"});
      }
    }
    return coverJson({success:true,total:manifest.count,offset:options.offset,
      processed:files.length,files,complete:options.offset+files.length>=manifest.count});
  }catch(error){
    console.error("[Migración R2 GET]",error);
    return coverJson({success:false,error:"No fue posible comprobar el inventario o el bucket R2."},503);
  }
}

export async function onRequestPost(context) {
  if(!sameOrigin(context.request))return coverJson({success:false,error:"Origen de solicitud no autorizado."},403);
  if(!String(context.request.headers.get("Content-Type")||"").toLowerCase().startsWith("application/json"))
    return coverJson({success:false,error:"Se requiere application/json."},415);
  if(context.request.headers.get("X-MD-R2-Migration")!=="copy")
    return coverJson({success:false,error:"Confirmación de migración ausente."},403);
  try{
    const body=await context.request.json();
    if(body?.confirmation!==CONFIRMATION)
      return coverJson({success:false,error:"Debes confirmar explícitamente la copia."},400);
    if(!context.env.COVERS_BUCKET)
      return coverJson({success:false,error:"R2 no está vinculado a este despliegue."},503);
    const manifest=await inventory(context);
    const url=new URL(context.request.url);
    url.searchParams.set("offset",String(body.offset));
    url.searchParams.set("limit",String(body.limit??MAX_BATCH));
    const options=sliceOptions(url,manifest);
    if(!options)return coverJson({success:false,error:"Rango no válido."},400);
    const files=[];
    for(const file of options.files) {
      try{
        files.push(await transfer(context,file));
      }catch(error){
        console.error("[Migración R2] Falló",file.path,error);
        files.push({path:file.path,status:"error",error:String(error?.message||"Error de migración").slice(0,220)});
        // Detener el lote para evitar continuar si una imagen está dañada.
        break;
      }
    }
    const ok=files.every(x=>x.status!=="error");
    return coverJson({success:ok,total:manifest.count,offset:options.offset,
      processed:files.length,files,complete:ok&&options.offset+files.length>=manifest.count,
      message:ok?"Copia verificada en R2; D1 no se ha modificado.":"La copia se detuvo. Revisa el error y reintenta."},
      ok?200:409);
  }catch(error){
    console.error("[Migración R2 POST]",error);
    return coverJson({success:false,error:"No se pudo completar esta operación de migración."},500);
  }
}
