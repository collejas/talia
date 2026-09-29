BEGIN;

-- Corrige únicamente envíos de tenants Postmark que fueron re-fechados por
-- la sincronización histórica Brevo. No elimina eventos ni altera contadores.
-- La sincronización histórica incorrecta actualizó procesado_en=now(); para
-- esos registros usamos la fecha original local del envío como fallback.
SET LOCAL session_replication_role = replica;

WITH afectados AS (
    SELECT DISTINCT e.id
    FROM public.prospeccion_contacto_envio AS e
    JOIN public.prospeccion_correo_eventos AS ce
      ON ce.envio_id = e.id
     AND ce.proveedor = 'brevo'
     AND ce.ocurrido_en < ce.recibido_en - interval '5 minutes'
    JOIN public.tenant_email_servers AS tes
      ON tes.organizacion_id = e.organizacion_id
     AND tes.server_status <> 'retired'
)
UPDATE public.prospeccion_contacto_envio AS e
SET procesado_en = COALESCE(e.creado_en, e.programado_en)
FROM afectados AS a
WHERE e.id = a.id
  AND COALESCE(e.creado_en, e.programado_en) IS NOT NULL;

COMMIT;
