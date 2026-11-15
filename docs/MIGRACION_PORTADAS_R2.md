# Portadas en R2 — Guía de activación y migración (sin afectar producción)

Estado: código listo, R2 no activo hasta configurarlo en Cloudflare. NO borrar archivos ni cambiar D1 antes de pruebas.

## 1. Configurar Cloudflare

1. Verificar en la cuenta que Cloudflare R2 permite Standard Storage en Free y revisar requisitos de facturación.
2. Crear bucket PRIVADO microdramas-portadas en Cloudflare R2. No habilitar r2.dev para producción.
3. Cloudflare → Workers & Pages → micro-dramas-esp → Settings → Bindings → Add R2 bucket.
4. Binding: COVERS_BUCKET; bucket: microdramas-portadas. Guardar en producción y hacer redeploy.
5. Dejar la variable COVERS_STORAGE_BACKEND ausente (equivale a github). El admin seguirá guardando en GitHub.
6. El endpoint público /media/portadas/plataforma/imagen.jpg servirá imágenes únicamente desde ese bucket.

## 2. Preparar la PC Windows — PowerShell SIN privilegios de administrador

Ejecutar desde la copia local (GitHub → PC):

    cd "C:\Desarrollo - GitHub\micro-drama-esp"
    git switch main
    git pull --ff-only origin main
    .\scripts\migrar-portadas-r2.ps1
    npx wrangler login
    npx wrangler r2 bucket info microdramas-portadas
    .\scripts\migrar-portadas-r2.ps1 -Modo Subir

El modo Plan comprueba 94 archivos de GitHub por tamaño y SHA del blob; Subir solicita aprobación y sólo COPIA a R2, no toca D1.

## 3. Verificación externa y propuesta de cambio D1

    .\scripts\migrar-portadas-r2.ps1 -Modo Verificar
    .\scripts\migrar-portadas-r2.ps1 -Modo GenerarSQL

El script consulta por HTTP HEAD las rutas públicas /media/portadas/, comprueba el Content-Length y descarga cada archivo para comparar su SHA256 con el original local.
Con cualquier fallo se niega a generar el SQL. El reporte y el SQL propuesto se guardan en la carpeta temporal microdramas-r2-migracion.

Antes de ejecutar el SQL generado:
- Exportar respaldo COMPLETO de la base de datos D1 real.
- Consultar SELECT id, slug, cover_url FROM dramas WHERE cover_url LIKE '/portadas/%';
- Comparar los cover_url usados por D1 contra el manifiesto, incluyendo portadas con espacios.
- Confirmar que las imágenes se ven en la web de escritorio, web móvil y APK Android.
- Revisar el archivo SQL; NO se ejecuta automáticamente. Sólo cambia rutas antiguas EXACTAS.
- Si falta alguna portada, conservar su ruta antigua y revisar antes de continuar.

## 4. Cambiar carga administrativa a R2

Cuando las pruebas de lectura estén superadas:
- Cloudflare Pages → Settings → Variables and Secrets: COVERS_STORAGE_BACKEND = r2.
- Redeploy. El indicador de admin debe mostrar Cloudflare R2: Conectado.
- Probar alta de un microdrama en Borrador. La API /api/admin/upload-cover devuelve /media/portadas/.../slug-HASH.ext.
- Guardar y comprobar cover_url en D1, panel admin, web escritorio, móvil y APK.
- Si el bucket deja de responder en modo r2, la subida FALLA explícitamente; no regresará a GitHub silenciosamente.

## 5. Limpieza (NO HACER TODAVÍA)

Una vez validadas todas las rutas, retirar del árbol main sólo imágenes portadas/{plataforma}/.
Conservar avatares, portada genérica, logos y un respaldo local; mantener los commits Git históricos.
Eliminar archivos de la rama no elimina por sí solo objetos de commits anteriores ni reescribe el historial Git.

## Riesgos y costos

- Standard Free R2: 10 GB-mes, 1 millón clase A y 10 millones clase B al mes.
- Las solicitudes a /media/portadas/ ejecutan Pages Functions y cuentan contra el límite de Workers Free.
- Cache-Control reduce repeticiones de una misma imagen por navegador, no equivale a CDN global directa de R2.
- Revisar uso y alertas antes de superar cuotas; los excesos pueden generar facturación.
- Evitar r2.dev como origen permanente de producción, pues está limitado.

Documentación oficial:
https://developers.cloudflare.com/pages/functions/bindings/
https://developers.cloudflare.com/r2/pricing/
https://developers.cloudflare.com/workers/wrangler/commands/r2/
