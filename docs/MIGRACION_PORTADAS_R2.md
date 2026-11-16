# Portadas en R2 — Guía de activación y migración (sin afectar producción)

## Alternativa sin repositorio local: migración desde el panel Cloudflare (RECOMENDADA)

Para este proyecto NO es necesario clonar GitHub ni usar PowerShell. Se incluye una herramienta protegida en:

**https://micro-dramas-esp.pages.dev/admin/r2-migracion.html**

1. Asegura que el bucket privado `microdramas-portadas` está vinculado a la producción de Pages como `COVERS_BUCKET`.
2. Abre la dirección anterior tras iniciar sesión de administrador de escritorio.
3. Confirma que el panel indica "Bucket R2 conectado".
4. Pulsa **Copiar portadas a R2** y escribe `MIGRAR PORTADAS A R2`.
5. La API lee los archivos estáticos de la versión desplegada de Cloudflare Pages usando el binding interno `ASSETS`, valida el SHA de Git original, los copia a R2 por lotes de tres y verifica cada archivo.
6. Después, pulsa **Verificar todas las copias**. Debe indicar **94 de 94 verificadas**.
7. **Detente y comparte el resultado**. No se ha actualizado D1, ni se ha activado la subida administrativa a R2, ni se han retirado las portadas antiguas de GitHub. La actualización de rutas D1 se hará únicamente tras auditar las referencias reales y probar la web y la APK.

La operación es idempotente: al ejecutarla de nuevo verifica y reutiliza las copias correctas que ya existan. Si detecta un objeto distinto o una portada de origen inesperada, se detiene y no lo sobrescribe.

**Seguridad:** solo el administrador autenticado puede llamar a la API, la copia POST requiere mismo origen y una confirmación explícita; no acepta URLs arbitrarias ni escribe en D1.

---



Estado: código listo, R2 no activo hasta configurarlo en Cloudflare. NO borrar archivos ni cambiar D1 antes de pruebas.

## 6. Corte final de D1 y de futuras subidas sin computadora local (NOVIEMBRE 2026)

La pantalla protegida `/admin/r2-migracion.html` contiene ahora cuatro etapas. La copia de 94 portadas a R2 se completó y el usuario informó **94 de 94 verificadas**; el código de GitHub no equivale por sí solo a comprobar la migración de rutas D1.

1. **Auditar D1:** pulsa *Auditar D1*. El endpoint `/api/admin/r2-cutover?mode=audit` clasifica cada `dramas.cover_url` como ruta antigua, R2, externa, genérica o sin imagen. **No modifica D1**.
2. **Descargar respaldo:** pulsa *Descargar respaldo D1* y guarda el JSON de IDs y URLs originales en un lugar seguro. Debe hacerse **antes** del corte.
3. **Reverificar R2:** pulsa *Verificar todas las copias* hasta obtener 94/94. Esto verifica bytes y SHA de Git sobre R2.
4. **Actualizar rutas D1 → R2:** con cero rutas sin resolver, pulsa el botón correspondiente y escribe `MIGRAR RUTAS D1 A R2`. La API verifica los contenidos de cada portada R2 por SHA-1 de blob Git, guarda `original_url`/ `r2_url` en `md_r2_cover_backups` y actualiza D1 en transacciones de máximo cuatro registros por lote. Si algo falla, conserva el estado existente y permite revisar / reanudar. El reproductor, las cuentas y las categorías no se modifican.
5. **Activar R2 para subir portadas:** cuando la auditoría indique cero rutas antiguas y cero sin resolver, presiona *Activar subidas futuras en R2* y confirma con `ACTIVAR SUBIDAS R2`. La API comprueba los objetos R2 usados por D1 y guarda `backend=r2` en la tabla D1 `md_cover_storage_control`. **No es necesario definir manualmente COVERS_STORAGE_BACKEND**, salvo si se desea un override de emergencia. La API anterior `/api/admin/upload-cover` detectará el nuevo destino y devolverá `/media/portadas/...-HASH.ext`.
6. **Validar tres clientes:** crear un borrador de prueba con portada recién subida, confirmar el campo `cover_url` y comprobar portadas viejas/nuevas en web escritorio, web móvil y APK.
7. **Eliminar duplicados:** cuando todo esté aprobado y verificado, crear commit GitHub eliminando *solo las 94 portadas históricas* bajo `portadas/{plataforma}/`. Conservar avatares, logo y carpeta generica. El manifiesto se conserva para auditoría. Los commits anteriores de GitHub no se reescriben.

### Recuperación / reversión

El respaldo JSON descargado antes del corte es externo a D1. La tabla `md_r2_cover_backups` dentro de D1 conserva, por cada ID migrado, la URL original y su equivalente en R2. Las actualizaciones verifican que el valor antiguo coincida exactamente para evitar sobrescribir ediciones concurrentes. Los archivos originales permanecen en GitHub durante todas las pruebas.

Si ocurre una incidencia, **no elimines las portadas de GitHub**. Una reversión supervisada puede recuperar las URL antiguas solo en filas que sigan apuntando a la URL R2 guardada, utilizando los respaldos y las herramientas D1 oficiales. No modifiques automáticamente microdramas nuevos cuya única portada haya sido creada en R2.

### Condiciones de seguridad

- La API `/api/admin/r2-cutover` está cubierta por el middleware de administradores y exige solicitud POST del mismo origen, cabecera de confirmación y frase de autorización.
- No acepta URLs personalizadas que indiquen dónde copiar archivos; solo las claves del inventario de 94 portadas.
- No actualiza rutas que estén fuera del inventario ni elimina portadas de GitHub/R2.
- En un fallo de lectura de D1, no cambia silenciosamente el destino de nuevas subidas a GitHub.
- Si una variable `COVERS_STORAGE_BACKEND` se define explícitamente en Cloudflare, tiene prioridad sobre el valor D1. Para el flujo automático recomendado debe permanecer sin definir.

---

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

El método recomendado ahora es activar R2 desde la **Etapa 3** del panel de migración. El valor D1 evita modificar manualmente las variables de Pages.
- Opcional (solo intervención de emergencia): Cloudflare Pages → Settings → Variables and Secrets: COVERS_STORAGE_BACKEND = r2.
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
