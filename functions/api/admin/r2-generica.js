/* Migración independiente de portada genérica Pages -> R2.
 * Requiere sesión admin (functions/_middleware.js), confirmación de mismo origen.
 * No acepta nombres/rutas de objetos proporcionadas por el cliente.
 */
import {coverJson,fileMime} from "../../lib/cover-storage.js";
const KEY="portadas/generica/portada-generica.png";
const OLD="/"+KEY,NEW="/media/"+KEY,SIZE=2362043;
const GIT_SHA="575987a7dfaa1e2b0c47161ab919f74da88c7b1";
const OLD_VARIANTS=[OLD,KEY,"https://micro-dramas-esp.pages.dev"+OLD];
const REQUIRED_CONFIRM="MIGRAR PORTADA GENERICA R2";

function sameOrigin(req){
  try{return new URL(req.headers.get("Origin")).origin===new URL(req.url).origin;}
  catch{return false;}
}
async function hashes(bytes){
  const prefix=new TextEncoder().encode("blob "+bytes.length+"\0");
  const input=new Uint8Array(prefix.length+bytes.length);
  input.set(prefix);input.set(bytes,prefix.length);
  const [git,sum]=await Promise.all([
    crypto.subtle.digest("SHA-1",input),
    crypto.subtle.digest("SHA-256",bytes)
  ]);
  const hex=buffer=>Array.from(new Uint8Array(buffer),v=>v.toString(16).padStart(2,"0")).join("");
  return {git:hex(git),sha256:hex(sum)};
}
async function verifyR2(bucket){
  const existing=await bucket.get(KEY);
  if(!existing)return {verified:false,reason:"No existe todavía en R2."};
  if(existing.size!==SIZE)return {verified:false,reason:"Tamaño incorrecto."};
  const bytes=new Uint8Array(await existing.arrayBuffer());
  if(fileMime(bytes)!=="image/png")return {verified:false,reason:"No es PNG válido."};
  const sum=await hashes(bytes);
  if(sum.git!==GIT_SHA)return {verified:false,reason:"El checksum no coincide con GitHub."};
  return {verified:true,size:bytes.length,sha256:sum.sha256};
}
async function readOriginal(context){
  if(!context.env.ASSETS?.fetch)throw Error("Binding ASSETS no disponible.");
  const url=new URL(OLD,context.request.url);
  const res=await context.env.ASSETS.fetch(new Request(url,{method:"GET"}));
  if(!res.ok)throw Error("No se puede leer la portada genérica original.");
  const bytes=new Uint8Array(await res.arrayBuffer());
  if(bytes.length!==SIZE||fileMime(bytes)!=="image/png")
    throw Error("El archivo original cambió de formato o tamaño.");
  const hash=await hashes(bytes);
  if(hash.git!==GIT_SHA)throw Error("El original no coincide con el SHA aprobado.");
  return {bytes,hash};
}
async function oldRows(db){
  const result=await db.prepare(
    "SELECT id,cover_url FROM dramas WHERE cover_url IN (?,?,?) ORDER BY id"
  ).bind(...OLD_VARIANTS).all();
  return result.results||[];
}
export async function onRequestGet(context){
  try{
    const db=context.env.DB,bucket=context.env.COVERS_BUCKET;
    if(!db||!bucket)return coverJson({success:false,error:"Falta el binding D1 o R2."},503);
    const [verified,rows]=await Promise.all([verifyR2(bucket),oldRows(db)]);
    return coverJson({success:true,source:OLD,destination:NEW,expectedBytes:SIZE,
      shaGit:GIT_SHA,oldD1References:rows.length,...verified});
  }catch(error){
    console.error("[Migración genérica] Estado:",error);
    return coverJson({success:false,error:"No se pudo consultar R2 o D1."},503);
  }
}
export async function onRequestPost(context){
  const req=context.request;
  if(!sameOrigin(req)||req.headers.get("X-MD-R2-Generic")!=="copy"||
     !String(req.headers.get("Content-Type")||"").toLowerCase().startsWith("application/json"))
    return coverJson({success:false,error:"Solicitud no autorizada."},403);
  try{
    const data=await req.json();
    if(data?.confirmation!==REQUIRED_CONFIRM)
      return coverJson({success:false,error:"Confirmación incorrecta."},400);
    const db=context.env.DB,bucket=context.env.COVERS_BUCKET;
    if(!db||!bucket)return coverJson({success:false,error:"Falta conexión R2 o D1."},503);
    let state=await verifyR2(bucket),copied=false;
    if(!state.verified){
      // Nunca sobrescribir objetos preexistentes que no coincidan con GitHub.
      if(await bucket.head(KEY))
        return coverJson({success:false,error:"Ya existe una imagen diferente en R2; no se sobrescribió."},409);
      const {bytes,hash}=await readOriginal(context);
      const put=await bucket.put(KEY,bytes,{
        httpMetadata:{contentType:"image/png",contentDisposition:"inline",cacheControl:"public, max-age=3600"},
        customMetadata:{gitBlobSha:GIT_SHA,sha256:hash.sha256}
      });
      if(!put||put.size!==SIZE)throw Error("No se confirmó la carga completa en R2.");
      copied=true;
      state=await verifyR2(bucket);
      if(!state.verified)throw Error("La verificación posterior de R2 no coincidió.");
    }
    // Solo cambiar referencias genéricas antiguas y respaldarlas por ID.
    const rows=await oldRows(db);
    if(rows.length){
      await db.prepare(
        "CREATE TABLE IF NOT EXISTS md_r2_generic_cover_backups ("+
        "drama_id INTEGER PRIMARY KEY,original_url TEXT NOT NULL,"+
        "r2_url TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
      ).run();
      const previous=await db.prepare(
        "SELECT drama_id,original_url,r2_url FROM md_r2_generic_cover_backups WHERE drama_id IN ("+
        rows.map(()=>"?").join(",")+")"
      ).bind(...rows.map(x=>x.id)).all();
      const saved=new Map((previous.results||[]).map(row=>[Number(row.drama_id),row]));
      for(const row of rows){
        const old=saved.get(Number(row.id));
        if(old&&(old.original_url!==row.cover_url||old.r2_url!==NEW))
          return coverJson({success:false,error:"Existe un respaldo D1 distinto; no se cambiaron registros."},409);
      }
      const stmts=[];
      for(const row of rows){
        stmts.push(db.prepare(
          "INSERT OR IGNORE INTO md_r2_generic_cover_backups (drama_id,original_url,r2_url) VALUES (?,?,?)"
        ).bind(row.id,row.cover_url,NEW));
        stmts.push(db.prepare(
          "UPDATE dramas SET cover_url=? WHERE id=? AND cover_url=? RETURNING id"
        ).bind(NEW,row.id,row.cover_url));
      }
      const results=await db.batch(stmts);
      if(results.some((x,i)=>i%2===1&&x?.results?.length!==1))
        throw Error("D1 cambió durante la migración. Vuelve a auditar.");
    }
    const remain=await oldRows(db);
    return coverJson({success:true,copied,verified:true,
      path:NEW,size:SIZE,updatedD1:rows.length,oldD1References:remain.length,
      message:"R2 verificado; referencias genéricas de D1 procesadas."});
  }catch(error){
    console.error("[Migración genérica] Falló:",error);
    return coverJson({success:false,error:"Falló la migración. La portada original sigue disponible en GitHub."},500);
  }
}
