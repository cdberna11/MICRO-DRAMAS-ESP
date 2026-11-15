<#
MIGRACIÓN DE PORTADAS A CLOUDFLARE R2
SOLO Windows PowerShell 5.1+ / PowerShell 7. NO ejecutar como administrador.
Plan (defecto): verifica copia local contra GitHub.
Subir: requiere Wrangler, autenticación y confirmación explícita.
Verificar: comprueba respuesta HEAD y tamaño de cada portada en Pages/R2.
GenerarSQL: verifica de nuevo las 94 portadas; escribe SQL, NUNCA lo ejecuta.
#>
[CmdletBinding()]
param(
 [ValidateSet('Plan','Subir','Verificar','GenerarSQL')]
 [string]$Modo='Plan',
 [ValidatePattern('^[a-z0-9][a-z0-9-]{2,62}$')]
 [string]$Bucket='microdramas-portadas',
 [ValidatePattern('^https://[^/]+$')]
 [string]$UrlBase='https://micro-dramas-esp.pages.dev'
)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$manifest=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'r2-portadas-manifest.json') -Raw -Encoding UTF8|ConvertFrom-Json
$items=@($manifest.files)
if($items.Count -ne [int]$manifest.count -or $items.Count -eq 0){
 throw 'El inventario de portadas no es válido.'
}
if(-not (Get-Command git -ErrorAction SilentlyContinue)){
 throw 'Git no está en PATH. Necesitamos verificar los checksums originales.'
}
[long]$bytes=0
foreach($item in $items){
 $relative=[string]$item.path
 if($relative -notmatch '^portadas/(?!avatares/|generica/)[a-z0-9-]+/[A-Za-z0-9._ -]+\.(jpg|jpeg|png|webp|gif)$' -or $relative.Contains('..')){
  throw "Ruta inesperada en inventario: $relative"
 }
 $full=Join-Path $root ($relative.Replace('/','\'))
 if(-not (Test-Path -LiteralPath $full -PathType Leaf)){
  throw "No se encontró $relative. No se modifica R2 ni D1."
 }
 $size=[long](Get-Item -LiteralPath $full).Length
 if($size -ne [long]$item.size){throw "Tamaño distinto en $relative"}
 $sha=(& git -C $root hash-object -- $full)
 if($LASTEXITCODE -ne 0 -or ([string]$sha).Trim() -ne [string]$item.blobSha){
  throw "Contenido Git diferente: $relative"
 }
 $bytes+=$size
}
if($bytes -ne [long]$manifest.bytes){throw 'Total de bytes no coincide con el inventario.'}
Write-Host ("Inventario válido: {0} portadas; {1} MiB" -f $items.Count,[math]::Round($bytes/1MB,2)) -ForegroundColor Green
$folder=Join-Path ([IO.Path]::GetTempPath()) 'microdramas-r2-migracion'
[IO.Directory]::CreateDirectory($folder)|Out-Null
if($Modo -eq 'Plan'){
 Write-Host "No se ejecutó ninguna operación remota. Bucket: $Bucket"
 Write-Host "Se excluyen avatares, portada genérica y logos."
 return
}
if($Modo -eq 'Subir'){
 if(-not (Get-Command npx -ErrorAction SilentlyContinue)){
  throw 'Instala Node.js para usar npx wrangler.'
 }
 Write-Host "Confirma que ejecutaste npx wrangler login y elegiste la cuenta Cloudflare correcta."
 Write-Host "Subirá $($items.Count) portadas al bucket remoto $Bucket." -ForegroundColor Yellow
 $approval=Read-Host 'Escribe exactamente SUBIR PORTADAS R2'
 if($approval -cne 'SUBIR PORTADAS R2'){throw 'Operación cancelada.'}
 foreach($item in $items){
  $key=[string]$item.path
  $full=Join-Path $root ($key.Replace('/','\'))
  $extension=[IO.Path]::GetExtension($full).TrimStart('.').ToLowerInvariant()
  $mime=switch($extension){
   'jpg' {'image/jpeg'} 'jpeg' {'image/jpeg'} 'png' {'image/png'}
   'webp' {'image/webp'} 'gif' {'image/gif'} default {throw "Extensión inesperada: $key"}
  }
  Write-Host "Copiando $key"
  & npx wrangler r2 object put "$Bucket/$key" "--file=$full" "--content-type=$mime" '--cache-control=public, max-age=3600' --remote
  if($LASTEXITCODE -ne 0){throw "Fallo la copia de $key. D1 permanece intacta; puedes repetir este comando."}
 }
 Write-Host "Copias enviadas. Ahora ejecuta -Modo Verificar." -ForegroundColor Green
 return
}
function Test-RemoteCovers {
 $results=@()
 foreach($item in $items){
  $key=[string]$item.path
  $encoded=($key.Split('/')|ForEach-Object{[Uri]::EscapeDataString($_)}) -join '/'
  $uri=$UrlBase.TrimEnd('/')+'/media/'+$encoded
  try {
   $res=Invoke-WebRequest -Uri $uri -Method Head -UseBasicParsing -TimeoutSec 25
   [long]$length=0
   $lengthHeader=[string]$res.Headers['Content-Length']
   $hasLength=[long]::TryParse($lengthHeader,[ref]$length)
   $headOK=([int]$res.StatusCode -eq 200 -and $hasLength -and $length -eq [long]$item.size)
   # HEAD confirma presencia/tamaño; GET + SHA256 confirma bytes idénticos.
   $full=Join-Path $root ($key.Replace('/','\'))
   $temp=Join-Path $folder ("verificar-"+[string]$item.blobSha+".tmp")
   try {
    Invoke-WebRequest -Uri $uri -Method Get -UseBasicParsing -OutFile $temp -TimeoutSec 60 | Out-Null
    $downloadSize=[long](Get-Item -LiteralPath $temp).Length
    $expectedSha=(Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash
    $downloadSha=(Get-FileHash -LiteralPath $temp -Algorithm SHA256).Hash
    $verified=($headOK -and $downloadSize -eq [long]$item.size -and $downloadSha -eq $expectedSha)
    $results+=[pscustomobject]@{
     key=$key;url=$uri;expected=[long]$item.size;actual=$downloadSize;
     sha256=$downloadSha;ok=$verified;
     reason=if($verified){'OK'}else{'HTTP, tamaño o SHA256 diferente'}
    }
   } finally {
    Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
   }
  } catch {
   $results+=[pscustomobject]@{
    key=$key;url=$uri;expected=[long]$item.size;actual=0;ok=$false;reason=$_.Exception.Message
   }
  }
 }
 return $results
}
$results=@(Test-RemoteCovers)
$report=Join-Path $folder 'r2-verificacion.json'
$results|ConvertTo-Json -Depth 4|Set-Content -LiteralPath $report -Encoding UTF8
$failures=@($results|Where-Object {-not $_.ok})
Write-Host "Verificación $($results.Count-$failures.Count)/$($results.Count) | $report"
if($failures.Count -gt 0){
 $failures|Select-Object -First 12 key,reason|Format-Table -AutoSize|Out-String|Write-Host
 throw "Hay $($failures.Count) portadas sin verificar. NO generar ni ejecutar migración D1."
}
if($Modo -eq 'Verificar'){
 Write-Host 'Todas las portadas verificadas. Aún no se ha modificado D1.' -ForegroundColor Green
 return
}
# El SQL sólo se genera con 100% de verificación y se deja pendiente de revisión.
$lines=New-Object System.Collections.Generic.List[string]
$lines.Add('-- NO EJECUTAR SIN UN RESPALDO VERIFICADO DE CLOUDFLARE D1')
$lines.Add('-- Todas las portadas tienen HTTP HEAD=200, tamaño correcto y SHA256 igual al archivo local.')
$lines.Add('-- Solo actualiza rutas exactas antiguas. No borra filas ni archivos.')
$lines.Add("SELECT id,slug,cover_url FROM dramas WHERE cover_url LIKE '/portadas/%';")
foreach($item in $items){
 $old=('/'+[string]$item.path).Replace("'","''")
 $new=('/media/'+[string]$item.path).Replace("'","''")
 $lines.Add("UPDATE dramas SET cover_url = '$new' WHERE cover_url = '$old';")
}
$lines.Add("SELECT id,slug,cover_url FROM dramas WHERE cover_url LIKE '/portadas/%';")
$destination=Join-Path $folder 'cutover-portadas-r2-REVISAR.sql'
[IO.File]::WriteAllLines($destination,$lines,[Text.UTF8Encoding]::new($false))
Write-Host "SQL generado SIN ejecutar: $destination" -ForegroundColor Green
Write-Host 'Antes de aplicarlo, exporta D1 y revisa todas las rutas cover_url.'
