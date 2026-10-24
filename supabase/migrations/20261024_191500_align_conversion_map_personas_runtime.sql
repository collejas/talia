-- Keep every conversion-map runtime read on the personas model.
-- contacto_id remains only as a compatibility fallback for old conversation rows.
do $migration$
declare
    v_oid oid;
    v_def text;
    v_phone_expr text := 'coalesce(ct.telefono_principal_e164, ct.telefono_secundario_e164, ct.telefono_movil_1_e164, ct.telefono_movil_2_e164)';
begin
    select p.oid
      into v_oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'panel_visitantes_geo_resumen_v2'
       and pg_get_function_identity_arguments(p.oid) =
           'p_nivel text, p_from timestamp with time zone, p_to timestamp with time zone, p_estado text, p_source_class text, p_utm_source text, p_utm_medium text, p_utm_campaign text, p_cid uuid, p_tid uuid, p_campaign_type text, p_wa_canal_publicitario text, p_wa_campana_publicitaria text, p_wa_regla_id uuid';

    if v_oid is null then
        raise exception 'No existe public.panel_visitantes_geo_resumen_v2 con la firma esperada';
    end if;

    v_def := pg_get_functiondef(v_oid);
    v_def := replace(v_def, 'public.contactos ct', 'public.personas ct');
    v_def := replace(v_def, 'ct.id = conv.contacto_id', 'ct.id = coalesce(conv.persona_id, conv.contacto_id)');
    v_def := replace(v_def, 'public.puede_ver_contacto', 'public.puede_ver_persona');
    v_def := replace(v_def, 'ct.telefono_e164', v_phone_expr);
    v_def := replace(
        v_def,
        '        ' || v_phone_expr || ',',
        '        ' || v_phone_expr || ' AS telefono_e164,'
    );
    execute v_def;

    select p.oid
      into v_oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'panel_visitantes_geo_resumen_ext'
       and pg_get_function_identity_arguments(p.oid) =
           'p_nivel text, p_from timestamp with time zone, p_to timestamp with time zone';

    if v_oid is not null then
        v_def := pg_get_functiondef(v_oid);
        v_def := replace(v_def, 'ct.id = conv.contacto_id', 'ct.id = coalesce(conv.persona_id, conv.contacto_id)');
        execute v_def;
    end if;
end;
$migration$;
