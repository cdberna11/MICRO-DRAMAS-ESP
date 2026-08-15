import { getUserByIdentifier } from "./helpers.js";

export async function onRequest(context) {
  const { request, env } = context;
  const json=(d,s=200,h={})=>new Response(JSON.stringify(d),{status:s,headers:{"Content-Type":"application/json",...h}});
  if(request.method!=="POST") return json({ok:false,error:"Método no permitido."},405);
  try{
    const b=await request.json(); const identifier=String(b?.identifier??b?.email??b?.phone??"").trim(); const pin=String(b?.pin??"").trim();
    if(!identifier||!/^[0-9]{4}$/.test(pin)) return json({ok:false,error:"Datos de acceso inválidos."},400);
    const u=await env.DB.prepare(`SELECT * FROM users WHERE lower(email)=lower(?) OR phone=? LIMIT 1`).bind(identifier,identifier).first();
    if(!u) return json({ok:false,error:"Cuenta no encontrada."},401);
    const valid=u.password_hash===pin||u.password_hash===`PIN:${pin}`;
    if(!valid) return json({ok:false,error:"PIN incorrecto."},401);
    const sid=crypto.randomUUID(); await env.DB.prepare(`INSERT INTO user_sessions (id,user_id,expires_at) VALUES (?,?,datetime('now','+30 days'))`).bind(sid,u.id).run();
    const safe={id:u.id,email:u.email,phone:u.phone,display_name:u.display_name,avatar:u.avatar,auth_method:u.auth_method,auth_provider:u.auth_provider};
    return json({ok:true,user:safe},200,{"Set-Cookie":`session_id=${encodeURIComponent(sid)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`});
  }catch(e){console.error("LOGIN_ERROR",e);return json({ok:false,error:"No se pudo iniciar sesión."},500)}
}
