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
  const cutoverEndpoint="/api/admin/r2-cutover";
  const d1={
    status:$("r2-d1-status"),legacy:$("r2-d1-legacy"),migrated:$("r2-d1-migrated"),
    unresolved:$("r2-d1-unresolved"),audit:$("r2-d1-audit"),backup:$("r2-d1-backup"),
    move:$("r2-d1-move"),activate:$("r2-activate"),
    activationStatus:$("r2-activation-status"),log:$("r2-d1-log")
  };
  let busy=false,connected=false,verified=0,copied=0;
  let auditState=null,backupDownloaded=false,r2VerifiedThisVisit=false;
  function print(message) {
    const line=new Date().toLocaleTimeString("es-PA")+"  "+message;
    elements.log.textContent+=(elements.log.textContent?"\n":"")+line;
    elements.log.scrollTop=elements.log.scrollHeight;
  }
  function status(message){elements.status.textContent=message;}
  function refreshButtons(){
    elements.copy.disabled=busy||!connected;
    elements.verify.disabled=busy||!connected;
    refreshCutoverButtons();
  }
  function refreshCutoverButtons(){
    const summary=auditState?.summary;
    d1.audit.disabled=busy;
    d1.backup.disabled=busy||!summary;
    d1.move.disabled=busy||!connected||!r2VerifiedThisVisit||!backupDownloaded||
      !summary||summary.legacy<1||summary.unresolved>0||auditState.backend==="r2";
    d1.activate.disabled=busy||!connected||!r2VerifiedThisVisit||!backupDownloaded||
      !summary||summary.legacy!==0||summary.unresolved>0||
      summary.migrated<1||auditState.backend==="r2";
  }
  function d1Log(message){
    d1.log.textContent+=(d1.log.textContent?"\n":"")+new Date().toLocaleTimeString("es-PA")+" · "+message;
    d1.log.scrollTop=d1.log.scrollHeight;
  }
  function showAudit(data){
    auditState=data;
    const summary=data.summary||{};
    d1.legacy.textContent=String(summary.legacy??"—");
    d1.migrated.textContent=String(summary.migrated??"—");
    d1.unresolved.textContent=String(summary.unresolved??"—");
    let message="D1: "+(summary.dramas??0)+" microdramas; "+
      (summary.legacy??0)+" referencias antiguas; "+
      (summary.migrated??0)+" referencias R2.";
    if(summary.unresolved>0)message+=" Hay "+summary.unresolved+" rutas que requieren revisión.";
    if(summary.external>0)message+=" También hay "+summary.external+" URLs externas que no se cambiarán.";
    d1.status.textContent=message;
    d1.activationStatus.textContent=data.backend==="r2"
      ?"R2 ACTIVADO: las portadas nuevas se subirán directamente a Cloudflare R2."
      :"Destino actual: GitHub. R2 se activará después del cambio completo y verificado.";
    if(data.unresolved?.length)
      data.unresolved.forEach(row=>d1Log("REVISAR #"+row.id+": "+row.cover_url+" — "+row.issue));
    refreshCutoverButtons();
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
    busy=true;r2VerifiedThisVisit=false;copied=0;elements.copied.textContent="0";elements.progress.value=0;refreshButtons();
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
    busy=true;r2VerifiedThisVisit=false;verified=0;elements.verified.textContent="0";elements.progress.value=0;refreshButtons();
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
        r2VerifiedThisVisit=true;
        status("¡94 de 94 verificadas! Las copias R2 son idénticas a las originales.");
        print("VERIFICACIÓN COMPLETA. No se han cambiado rutas D1 ni eliminado imágenes GitHub.");
      }
    }catch(error) {
      status("No se pudo completar la verificación. D1 sigue intacto.");
      print("ERROR: "+error.message);
    }finally{busy=false;refreshButtons();}
  }
  async function auditD1(){
    if(busy)return;
    busy=true;refreshButtons();
    try{
      const data=await request(cutoverEndpoint+"?mode=audit");
      showAudit(data);
      d1Log("Auditoría completada: "+data.summary.legacy+" pendientes; "+
        data.summary.unresolved+" para revisar. Destino: "+data.backend+".");
    }catch(error){
      d1.status.textContent="No se pudo auditar D1.";
      d1Log("ERROR DE AUDITORÍA: "+error.message);
    }finally{busy=false;refreshButtons();}
  }
  async function exportBackup(){
    if(busy||!auditState)return;
    busy=true;refreshButtons();
    try{
      const payload=await request(cutoverEndpoint+"?mode=backup");
      const json=JSON.stringify(payload,null,2);
      const file=new Blob([json],{type:"application/json"});
      const url=URL.createObjectURL(file);
      const anchor=document.createElement("a");
      anchor.href=url;
      anchor.download="microdramas-D1-cover-url-backup-"+new Date().toISOString().slice(0,10)+".json";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(()=>URL.revokeObjectURL(url),30000);
      backupDownloaded=true;
      d1Log("Respaldo descargado: "+payload.rows.length+" referencias. Conserva este JSON.");
    }catch(error){
      d1Log("ERROR al descargar respaldo: "+error.message);
    }finally{busy=false;refreshButtons();}
  }
  async function moveReferences(){
    if(busy||d1.move.disabled||!auditState)return;
    const text=window.prompt("Esta operación cambiará las rutas cover_url en Cloudflare D1 por lotes de cuatro. Se guardará una copia de cada URL original en D1.\n\nEscribe exactamente:\nMIGRAR RUTAS D1 A R2");
    if(text!=="MIGRAR RUTAS D1 A R2"){d1Log("Cambio D1 cancelado.");return;}
    busy=true;refreshButtons();
    try{
      for(let tries=0;tries<100;tries++){
        const result=await request(cutoverEndpoint,{
          method:"POST",
          headers:{"Content-Type":"application/json","X-MD-R2-Cutover":"confirmed"},
          body:JSON.stringify({action:"move",confirmation:text})
        });
        showAudit(result);
        d1Log("Lote D1: "+result.processed+" referencias cambiadas. Restantes: "+result.remaining+".");
        if(result.remaining===0){
          d1Log("Todas las rutas antiguas identificadas fueron actualizadas. R2 AÚN NO es el destino de nuevas subidas.");
          break;
        }
        if(result.processed<1)throw new Error("No se modificaron filas. Detenido para evitar un bucle.");
      }
      const fresh=await request(cutoverEndpoint+"?mode=audit");
      showAudit(fresh);
    }catch(error){
      d1Log("CAMBIO D1 DETENIDO: "+error.message+
        ". Usa Auditar D1 para revisar las filas restantes; los cambios anteriores tienen respaldo.");
    }finally{busy=false;refreshButtons();}
  }
  async function activateR2(){
    if(busy||d1.activate.disabled||!auditState)return;
    const text=window.prompt("Al activar R2, toda portada NUEVA cargada en el panel administrativo se guardará directamente en Cloudflare R2, no en GitHub.\n\nEscribe exactamente:\nACTIVAR SUBIDAS R2");
    if(text!=="ACTIVAR SUBIDAS R2"){d1Log("Activación cancelada.");return;}
    busy=true;refreshButtons();
    try{
      const data=await request(cutoverEndpoint,{
        method:"POST",
        headers:{"Content-Type":"application/json","X-MD-R2-Cutover":"confirmed"},
        body:JSON.stringify({action:"activate",confirmation:text})
      });
      showAudit(data);
      d1Log("R2 ACTIVADO PARA NUEVAS PORTADAS. Comprueba el panel administrativo y los tres clientes.");
    }catch(error){
      d1Log("ERROR DE ACTIVACIÓN: "+error.message);
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
  d1.audit.addEventListener("click",auditD1);
  d1.backup.addEventListener("click",exportBackup);
  d1.move.addEventListener("click",moveReferences);
  d1.activate.addEventListener("click",activateR2);
  init();
  auditD1();
})();