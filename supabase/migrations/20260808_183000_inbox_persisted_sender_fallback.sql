BEGIN;

-- La primera versión de la proyección sólo mostraba datos de personas. Los
-- correos todavía no vinculados a una persona deben conservar el remitente que
-- ya vive en columnas explícitas de conversaciones.
DO $migration$
DECLARE
  function_sql text;
  old_fragment text := E'  p.nombre_completo,\n  coalesce(p.correo_principal, p.correo),\n  coalesce(p.telefono_principal_e164, p.telefono_movil_1_e164, p.telefono_secundario_e164),';
  new_fragment text := E'  coalesce(p.nombre_completo, nullif(c.nombre_remitente, ''''), nullif(c.correo_remitente, ''''), ''Visitante''),\n  coalesce(p.correo_principal, p.correo, nullif(c.correo_remitente, '''')),\n  coalesce(\n    p.telefono_principal_e164,\n    p.telefono_movil_1_e164,\n    p.telefono_secundario_e164,\n    nullif(c.inbox_context->>''contacto_telefono'', '''')\n  ),';
BEGIN
  SELECT pg_get_functiondef(
    'public.panel_inbox_threads_persisted(text,uuid,integer,integer,integer,text,text,uuid,uuid,timestamptz,timestamptz)'::regprocedure
  ) INTO function_sql;

  IF strpos(function_sql, old_fragment) > 0 THEN
    EXECUTE replace(function_sql, old_fragment, new_fragment);
  ELSIF strpos(function_sql, new_fragment) = 0 THEN
    RAISE EXCEPTION 'No se encontró el contrato anterior de remitente en panel_inbox_threads_persisted';
  END IF;
END;
$migration$;

COMMIT;
