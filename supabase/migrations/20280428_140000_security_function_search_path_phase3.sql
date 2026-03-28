-- Fase 3: fijar search_path en funciones/procedimientos críticos de aplicación
-- Objetivo: resolver lint `function_search_path_mutable` en objetos expuestos
-- sin tocar objetos internos de extensiones (PostGIS/vector/etc).

begin;

do $$
declare
  fn record;
  obj_type text;
begin
  for fn in
    select n.nspname as schema_name,
           p.proname,
           p.prokind,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'denue_resultados_bounds',
        'catalog_document_embeddings_delete_missing',
        'prospeccion_envio_sesiones_utm',
        'touch_tenant_bootstrap_catalog_updated_at',
        'tg_prospeccion_contacto_suppressions_normalize',
        'denue_resultados_map',
        'prospeccion_campana_template_atribucion_rango',
        'producto_metadata_schemes_updated_at_trg',
        'denue_resultados_list',
        'prospeccion_conversion_fuente',
        'tg_prospeccion_whatsapp_atribucion_reglas_normalize',
        'catalog_document_embeddings_search',
        'prospeccion_brevo_eventos_resumen',
        'google_resultados_map',
        'denue_resultados_actividades',
        'tg_prospecto_normalize_email',
        'crm_propiedades_geojson',
        'scian_clase_embeddings_search',
        'scian_clase_embeddings_delete_missing',
        'google_resultados_bounds',
        'prospeccion_campana_template_atribucion',
        'purge_denue_busquedas_org_0001',
        'tg_prospeccion_whatsapp_atribucion_eventos_normalize',
        'crm_propiedad_hierarquia',
        'tg_prospecto_set_actor'
      )
  loop
    obj_type := case when fn.prokind = 'p' then 'procedure' else 'function' end;

    execute format(
      'alter %s %I.%I(%s) set search_path = public, extensions, pg_temp',
      obj_type,
      fn.schema_name,
      fn.proname,
      fn.args
    );
  end loop;
end $$;

commit;
