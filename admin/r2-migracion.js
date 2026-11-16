/* Panel administrativo seguro para copiar 94 portadas directamente en Cloudflare. */
"use strict";
(() => {
  const endpoint="/api/admin/r2-migrar";
  const $=id=>document.getElementById(id);
  const elements={
    status:$("r2-status"),total:$("r2-total"),copied:$("r2-copied"),verified:$("r2-verified"),
    progress:$("r2-progress"),copy:$("r2-copy"),verify:$("r2-verify"),log:$("r2-log")
  };
  const totalExpected=94,batchSize=3;
  let busy=false,connected=false,verified=0,copied=0;
  function print(message) {
    const line=new Date().toLocaleTimeString("es-PA")+"  "+message;
    elements.log.textContent+=(elements.log.textContent?"\n":"")+line;
    elements.log.scrollTop=elements.log.scrollHeight;
  }
  function status(message){elements.status.textContent=message;}
  function refreshButtons(){
    elements.copy.disabled=busy||!connected;
    elements.verify.disabled=busy||!connected;
  }
  async function request(url,options={}) {
    const response=await fetch(url,{credentials:"same-origin",cache:"no-store",
      headers:{"Accept":"application/json",...options.headers},...options});
    const result=await response.json().catch(()=>({}));
    if(!response.ok||!result.success){
      const details=Array.isArray(result.files)?result.files.filter(x=>x.status==="error").map(x=>x.path+": "+x.error).join("; "):"";
      throw new Error(details||result.error||result.message||"Error HTTP "+response.status);
    }
    return result;
  }
  async function copyAll(){
    if(busy||!connected)return;
    const typed=window.prompt("Para copiar las 94 portadas a R2 sin modificar D1, escribe exactamente:\nMIGRAR PORTADAS A R2");
    if(typed!=="MIGRAR PORTADAS A R2"){print("Copia cancelada: no se confirmó la operación.");return;}
    busy=true;copied=0;elements.copied.textContent="0";elements.progress.value=0;refreshButtons();
    try{
      for(let offset=0;offset<totalExpected;offset+=batchSize) {
        const result=await request(endpoint,{
          method:"POST",
          headers:{"Content-Type":"application/json","X-MD-R2-Migration":"copy"},
          body:JSON.stringify({confirmation:typed,offset,limit:batchSize})
        });
        copied+=result.files.length;
        elements.copied.textContent=String(copied);
        elements.progress.value=copied;
        print("Copiadas o existentes "+copied+"/"+totalExpected+
          " · último: "+result.files.at(-1)?.path);
      }
      status("Copia por lotes completada. Ejecuta «Verificar todas las copias» antes de continuar.");
      print("Finalizó la copia; D1 y GitHub NO fueron modificados.");
    }catch(error){
      status("La copia se detuvo. Puedes repetir la operación para reanudar sin duplicar archivos.");
      print("ERROR: "+error.message);
    }finally{busy=false;refreshButtons();}
  }
  async function verifyAll() {
    if(busy||!connected)return;
    busy=true;verified=0;elements.verified.textContent="0";elements.progress.value=0;refreshButtons();
    try{
      let errors=0;
      for(let offset=0;offset<totalExpected;offset+=batchSize) {
        const result=await request(endpoint+"?mode=verify&offset="+offset+"&limit="+batchSize);
        verified+=result.files.filter(file=>file.ok).length;
        errors+=result.files.filter(file=>!file.ok).length;
        elements.verified.textContent=String(verified);
        elements.progress.value=offset+result.files.length;
        for(const file of result.files)if(!file.ok)print("FALLA: "+file.path+" · "+file.reason);
      }
      if(errors){
        status("Faltan "+errors+" portadas o sus checksums son diferentes. No cambiar rutas D1.");
        print("Verificadas "+verified+"/"+totalExpected+". Puedes volver a copiar y verificar.");
      }else{
        status("¡94 de 94 verificadas! Las copias R2 son idénticas a las originales.");
        print("VERIFICACIÓN COMPLETA. No se han cambiado rutas D1 ni eliminado imágenes GitHub.");
      }
    }catch(error) {
      status("No se pudo completar la verificación. D1 sigue intacto.");
      print("ERROR: "+error.message);
    }finally{busy=false;refreshButtons();}
  }
  async function init() {
    try{
      const data=await request(endpoint+"?mode=status");
      if(data.total!==totalExpected)throw new Error("El manifiesto no contiene las 94 portadas esperadas.");
      elements.total.textContent=String(data.total);
      connected=Boolean(data.bucketConnected&&data.ready);
      status(connected?"Bucket R2 conectado. Listo para copiar las portadas desde Pages.":"El bucket no está disponible. Comprueba COVERS_BUCKET en Cloudflare Pages y vuelve a desplegar.");
      print(data.message||"Comprobación completada.");
    }catch(error){
      status("No se pudo comprobar el estado de R2.");
      print("ERROR: "+error.message);
    }
    refreshButtons();
  }
  elements.copy.addEventListener("click",copyAll);
  elements.verify.addEventListener("click",verifyAll);
  init();
})();