BEGIN;

-- La columna server_id se incorporó después de que algunos mensajes y dominios
-- ya existían. Completa únicamente referencias que pueden resolverse de forma
-- inequívoca dentro del mismo tenant.
UPDATE public.tenant_email_domains AS d
SET server_id = s.id
FROM public.tenant_email_servers AS s
WHERE d.server_id IS NULL
  AND s.organizacion_id = d.organizacion_id
  AND s.server_status <> 'retired';

UPDATE public.tenant_email_messages AS m
SET server_id = d.server_id
FROM public.tenant_email_domains AS d
WHERE m.server_id IS NULL
  AND d.id = m.domain_id
  AND d.organizacion_id = m.organizacion_id
  AND d.server_id IS NOT NULL;

COMMIT;
