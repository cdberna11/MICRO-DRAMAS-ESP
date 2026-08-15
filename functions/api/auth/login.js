export async function onRequest() { return new Response(JSON.stringify({ok:false,error:"Temporalmente no disponible"}), {status:500, headers:{"Content-Type":"application/json"}}); }
