-- INVENTARIO PREVIO / ROLLBACK · SOLO LECTURA (Cloudflare D1)
-- Guardar resultados y respaldar la base antes de hacer cualquier UPDATE.
SELECT COUNT(*) AS total_dramas FROM dramas;
SELECT COUNT(*) AS portadas_en_github FROM dramas WHERE cover_url LIKE '/portadas/%';
SELECT COUNT(*) AS portadas_en_r2 FROM dramas WHERE cover_url LIKE '/media/portadas/%';
SELECT id,slug,title,platform,status,cover_url FROM dramas WHERE cover_url LIKE '/portadas/%' ORDER BY id;
SELECT id,slug,title,platform,status,cover_url FROM dramas WHERE cover_url LIKE '/media/portadas/%' ORDER BY id;
SELECT id,slug,cover_url FROM dramas WHERE cover_url NOT LIKE '/portadas/%' AND cover_url NOT LIKE '/media/portadas/%' ORDER BY id;
