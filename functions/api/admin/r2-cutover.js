/* Corte controlado de portadas a R2 sin equipo local.
 * /api/admin/r2-cutover está protegido por _middleware (admin D1).
 *
 * GET audit   -> solo lectura de D1, clasifica rutas.
 * GET backup  -> exportación previa de IDs/URLs originales.
 * POST move   -> verifica bytes R2, guarda respaldo original y mueve <=4 filas en transacción D1.
 * POST activate -> activa R2 para SUBIDAS FUTURAS solo después del cambio del catálogo.
 *
 * No borra archivos R2/GitHub, no modifica reproductores ni perfiles.
 */
import {activeCoverBackend,validCoverKey,coverJson} from "../../lib/cover-storage.js";

const MANIFEST_URL="/scripts/r2-portadas-manifest.json";
const MAX_MOVE=4;
const MOVE_CONFIRM="MIGRAR RUTAS D1 A R2";
const ACTIVATE_CONFIRM="ACTIVAR SUBIDAS R2";
const BACKUP_TABLE="md_r2_cover_backups";

function isSameOrigin(request){
  const origin=request.headers.get("Origin");
  if(!origin)return false;
  try{return new URL(origin).origin===new URL(request.url).origin;}
  catch{return false;}
}
async function manifestFor(context){
  const source=context.env.ASSETS;
  if(!source?.fetch)throw new Error("ASSETS no disponible en este despliegue.");
  const response=await source.fetch(new Request(new URL(MANIFEST_URL,context.request.url),{method:"GET"}));
  if(!response.ok)throw new Error("No se encontró el inventario de portadas.");
  const doc=await response.json();
  if(doc?.count!==94||doc.files?.length!==94)throw new Error("El inventario de 94 portadas cambió.");
  const map=new Map();
  for(const file of doc.files){
    if(!validCoverKey(file.path)||!Number.isSafeInteger(file.size)||file.size<=0||
       !/^[a-f0-9]{40}$/i.test(file.blobSha)||map.has(file.path))
      throw new Error("El inventario de portadas está incompleto o contiene duplicados.");
    map.set(file.path,file);
  }
  return map;
}
async function dbRows(context){
  const db=context.env.DB;
  if(!db)throw new Error("El binding D1 DB no está disponible.");
  const result=await db.prepare(
    "SELECT id,slug,title,status,cover_url FROM dramas ORDER BY id"
  ).all();
  if(!Array.isArray(result?.results))throw new Error("No se pudieron leer las portadas de D1.");
  return result.results;
}
function normalizedKey(value,site){
  const original=String(value??"").trim();
  if(!original)return {kind:"empty"};
  let raw=original;
  if(/^https?:\/\//i.test(raw)){
    try{
      const u=new URL(raw);
      if(u.origin!==site) {
        // No hacemos cambios a enlaces externos. Un raw de GitHub debe
        // revisarse antes de eliminar las imágenes del repositorio.
        const isGitHub=/github(?:usercontent)?\.com$/i.test(u.hostname) ||
          /github\.io$/i.test(u.hostname);
        const pointsToCovers=/\/portadas\//i.test(u.pathname);
        return {kind:isGitHub&&pointsToCovers?"unresolved":"external"};
      }
      raw=u.pathname;
    }catch{return {kind:"unresolved"};}
  }
  if(raw.startsWith("//"))return {kind:"unresolved"};
  const path=raw.startsWith("/")?raw.slice(1):raw;
  let decoded;
  try{decoded=decodeURIComponent(path);}
  catch{return {kind:"unresolved"};}
  if(decoded.startsWith("portadas/generica/")||decoded.startsWith("portadas/avatares/"))
    return {kind:"system"};
  if(decoded.startsWith("media/portadas/")){
    const key=decoded.slice("media/".length);
    return validCoverKey(key)?{kind:"r2",key}:{kind:"unresolved"};
  }
  if(decoded.startsWith("portadas/")){
    return validCoverKey(decoded)?{kind:"legacy",key:decoded}:{kind:"unresolved"};
  }
  return {kind:"external"};
}
function audit(rows,manifest,site){
  const report={total:rows.length,legacy:[],migrated:[],unresolved:[],
    external:[],system:[],empty:[],preview:[]};
  for(const row of rows){
    const info=normalizedKey(row.cover_url,site);
    const item={id:Number(row.id),title:String(row.title||""),slug:String(row.slug||""),
      status:String(row.status||""),cover_url:String(row.cover_url||""),
      key:info.key||null};
    if(info.kind==="legacy"){
      if(!manifest.has(info.key))report.unresolved.push({...item,issue:"Portada fuera del inventario R2"});
      else report.legacy.push({...item,to:"/media/"+info.key});
    }else if(info.kind==="r2")report.migrated.push(item);
    else report[info.kind]?.push(item);
  }
  report.preview=report.legacy.slice(0,12);
  report.summary={
    dramas:report.total,legacy:report.legacy.length,migrated:report.migrated.length,
    unresolved:report.unresolved.length,external:report.external.length,
    system:report.system.length,empty:report.empty.length,
    manifest:manifest.size
  };
  return report;
}
async function contextAudit(context){
  const [manifest,rows,backend]=await Promise.all([
    manifestFor(context),dbRows(context),activeCoverBackend(context.env)
  ]);
  return {manifest,rows,backend,report:audit(rows,manifest,new URL(context.request.url).origin)};
}
async function checkR2(context,items){
  const bucket=context.env.COVERS_BUCKET;
  if(!bucket)throw new Error("No está conectado R2 COVERS_BUCKET.");
  const seen=new Set();
  for(const item of items){
    if(seen.has(item.key))continue;
    seen.add(item.key);
    const object=await bucket.get(item.key);
    if(!object)throw new Error("Falta la portada R2: "+item.key);
    if(object.size!==item.size)
      throw new Error("La portada R2 no tiene el tamaño original: "+item.key);
    const buffer=new Uint8Array(await object.arrayBuffer());
    const prefix=new TextEncoder().encode("blob "+buffer.byteLength+"\0");
    const joined=new Uint8Array(prefix.length+buffer.byteLength);
    joined.set(prefix);joined.set(buffer,prefix.length);
    const digest=await crypto.subtle.digest("SHA-1",joined);
    const sha=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,"0")).join("");
    if(sha!==item.blobSha.toLowerCase())
      throw new Error("El contenido R2 no coincide con GitHub: "+item.key);
  }
}
async function backupTable(db){
  await db.prepare(
    "CREATE TABLE IF NOT EXISTS md_r2_cover_backups ("+
    "drama_id INTEGER PRIMARY KEY, original_url TEXT NOT NULL, "+
    "r2_url TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ).run();
}
function finalResponse(state){
  const {summary}=state.report;
  return {success:true,backend:state.backend,summary,
    readyForMove:summary.legacy>0&&summary.unresolved===0,
    readyForActivate:summary.legacy===0&&summary.unresolved===0&&summary.migrated>0};
}
export async function onRequestGet(context){
  try{
    const state=await contextAudit(context);
    const mode=new URL(context.request.url).searchParams.get("mode")||"audit";
    if(mode==="audit"){
      return coverJson({...finalResponse(state),
        preview:state.report.preview,unresolved:state.report.unresolved.slice(0,80),
        external:state.report.external.slice(0,30)});
    }
    if(mode==="backup"){
      return coverJson({...finalResponse(state),
        exportedAt:new Date().toISOString(),
        note:"Respaldo de cover_url ANTES de migrar D1. Conservar este JSON fuera de Cloudflare.",
        rows:state.rows.map(row=>({
          id:row.id,slug:row.slug,title:row.title,status:row.status,cover_url:row.cover_url
        }))});
    }
    return coverJson({success:false,error:"Modo de auditoría desconocido."},400);
  }catch(error){
    console.error("[Corte R2] Error de auditoría",error);
    return coverJson({success:false,error:"No fue posible leer el catálogo, su inventario o el almacenamiento activo."},503);
  }
}
export async function onRequestPost(context){
  if(!isSameOrigin(context.request))
    return coverJson({success:false,error:"Origen de solicitud no autorizado."},403);
  if(!String(context.request.headers.get("Content-Type")||"").toLowerCase().startsWith("application/json")||
     context.request.headers.get("X-MD-R2-Cutover")!=="confirmed")
    return coverJson({success:false,error:"Confirmación o formato inválido."},403);
  try{
    const input=await context.request.json();
    const action=input?.action;
    if(action!=="move"&&action!=="activate")
      return coverJson({success:false,error:"Acción desconocida."},400);
    if(input?.confirmation!==(action==="move"?MOVE_CONFIRM:ACTIVATE_CONFIRM))
      return coverJson({success:false,error:"La confirmación no coincide."},400);
    const state=await contextAudit(context);
    const db=context.env.DB,report=state.report;
    if(!context.env.COVERS_BUCKET)
      return coverJson({success:false,error:"El bucket R2 no está conectado."},503);
    if(report.unresolved.length)
      return coverJson({success:false,error:"Existen "+report.unresolved.length+
        " portadas antiguas que no están en el inventario. Resolver antes de continuar."},409);

    if(action==="move"){
      if(state.backend==="r2"&&report.legacy.length)
        return coverJson({success:false,error:"R2 ya está activo, pero aún quedan rutas antiguas en D1."},409);
      const chosen=report.legacy.slice(0,MAX_MOVE);
      if(!chosen.length)return coverJson({...finalResponse(state),processed:0,remaining:0});
      await checkR2(context,chosen.map(item=>state.manifest.get(item.key)));
      await backupTable(db);

      // Las mismas filas jamás se sobrescriben si un respaldo anterior cambió.
      const previous=await db.prepare(
        "SELECT drama_id,original_url,r2_url FROM md_r2_cover_backups WHERE drama_id IN ("+
        chosen.map(()=>"?").join(",")+")"
      ).bind(...chosen.map(x=>x.id)).all();
      const saved=new Map((previous.results||[]).map(x=>[Number(x.drama_id),x]));
      for(const row of chosen){
        const existing=saved.get(row.id);
        if(existing&&(existing.original_url!==row.cover_url||existing.r2_url!==row.to))
          return coverJson({success:false,error:"Existe un respaldo previo diferente para el microdrama "+row.id},409);
      }
      const stmts=[];
      for(const row of chosen){
        stmts.push(db.prepare(
          "INSERT OR IGNORE INTO md_r2_cover_backups (drama_id,original_url,r2_url) VALUES (?,?,?)"
        ).bind(row.id,row.cover_url,row.to));
        stmts.push(db.prepare(
          "UPDATE dramas SET cover_url=? WHERE id=? AND cover_url=? RETURNING id"
        ).bind(row.to,row.id,row.cover_url));
      }
      const results=await db.batch(stmts);
      if(results.some((result,index)=>index%2===1&&result?.results?.length!==1))
        return coverJson({success:false,error:"El catálogo cambió durante la migración; vuelve a auditar D1."},409);
      const newState=await contextAudit(context);
      return coverJson({...finalResponse(newState),processed:chosen.length,
        remaining:newState.report.summary.legacy,
        message:"Se migraron "+chosen.length+" referencias; los originales siguen en GitHub."});
    }

    if(report.legacy.length||!report.migrated.length)
      return coverJson({success:false,error:"Primero deben migrarse todas las portadas antiguas."},409);
    if(String(context.env.COVERS_STORAGE_BACKEND||"").toLowerCase()==="github")
      return coverJson({success:false,error:"Cloudflare tiene COVERS_STORAGE_BACKEND=github. Retira ese override antes del corte."},409);
    // Exige que las rutas de D1 tengan un objeto R2 existente.
    const keys=[...new Set(report.migrated.map(x=>x.key))];
    for(let start=0;start<keys.length;start+=8){
      const part=keys.slice(start,start+8);
      const objects=await Promise.all(part.map(key=>context.env.COVERS_BUCKET.head(key)));
      const missing=part.find((key,index)=>!objects[index]);
      if(missing)return coverJson({success:false,error:"Falta un objeto de catálogo en R2: "+missing},409);
    }
    await db.prepare(
      "CREATE TABLE IF NOT EXISTS md_cover_storage_control ("+
      "id INTEGER PRIMARY KEY CHECK(id=1),backend TEXT NOT NULL CHECK(backend IN ('github','r2')),"+
      "updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
    ).run();
    await db.prepare(
      "INSERT INTO md_cover_storage_control (id,backend,updated_at) VALUES (1,'r2',CURRENT_TIMESTAMP) "+
      "ON CONFLICT(id) DO UPDATE SET backend='r2',updated_at=CURRENT_TIMESTAMP"
    ).run();
    const after=await contextAudit(context);
    return coverJson({...finalResponse(after),
      message:"R2 activado para nuevas subidas. No se eliminaron archivos de GitHub."});
  }catch(error){
    console.error("[Corte R2] Error de actualización",error);
    return coverJson({success:false,error:"No se pudo completar el cambio de portadas. "+
      "El respaldo y las imágenes originales permanecen disponibles; revisa el estado D1."},500);
  }
}
