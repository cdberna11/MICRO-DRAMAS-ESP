import { getUserByIdentifier } from "./_helpers.js";

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "POST") return new Response(JSON.stringify({ ok:false, error:"Método no permitido." }), { status:405, headers:{"Content-Type":"application/json"} });
  try {
    const body = await request.json();
    const identifier = String(body?.identifier ?? body?.email ?? body?.phone ?? "").trim();
    const pin = String(body?.pin ?? "").trim();
    if (!identifier || !/^\d{4}$/.test(pin)) return new Response(JSON.stringify({ok:false,error:"Datos de acceso inválidos."}), {status:400,headers:{"Content-Type":"application/json"}});
    const user = await getUserByIdentifier(env.DB, identifier);
    if (!user) return new Response(JSON.stringify({ok:false,error:"Cuenta no encontrada."}), {status:401,headers:{"Content-Type":"application/json"}});
    const valid = user.password_hash === pin || user.password_hash === `PIN:${pin}`;
    if (!valid) return new Response(JSON.stringify({ok:false,error:"PIN incorrecto."}), {status:401,headers:{"Content-Type":"application/json"}});
    const sessionId = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO user_sessions (id,user_id,expires_at) VALUES (?,?,datetime('now','+30 days'))`).bind(sessionId,user.id).run();
    return new Response(JSON.stringify({ok:true,user}), {status:200,headers:{"Content-Type":"application/json","Set-Cookie":`session_id=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`}});
  } catch(e) { console.error(e); return new Response(JSON.stringify({ok:false,error:"No se pudo iniciar sesión."}),{status:500,headers:{"Content-Type":"application/json"}}); }
}
