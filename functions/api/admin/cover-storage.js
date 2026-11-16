/* Consulta protegida por middleware /api/admin/*.
 * Devuelve el almacén activo, sin publicar secretos ni claves.
 */
import {activeCoverBackend,coverJson} from "../../lib/cover-storage.js";
export async function onRequestGet(context){
  const backend=await activeCoverBackend(context.env);
  if (backend !== "r2")
    return coverJson({success:true,backend:"github",ready:Boolean(context.env.GITHUB_TOKEN),
      message:"GitHub sigue activo hasta completar el cambio controlado de D1 a R2."});
  if (!context.env.COVERS_BUCKET)
    return coverJson({success:true,backend:"r2",ready:false,
      message:"Falta el binding R2 COVERS_BUCKET. No se cargarán portadas."});
  try {
    await context.env.COVERS_BUCKET.list({limit:1});
    return coverJson({success:true,backend:"r2",ready:true,
      message:"Bucket R2 conectado y disponible."});
  }catch(error){
    console.error("[R2] Error al consultar estado del bucket",error);
    return coverJson({success:true,backend:"r2",ready:false,
      message:"El bucket R2 existe como binding, pero no responde correctamente."});
  }
}
