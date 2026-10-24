-- La jerarquia geografica debe ser acumulativa: una persona con estado mexicano
-- pertenece a Mexico aunque el campo pais este vacio.
do $migration$
declare
    v_oid oid;
    v_def text;
    v_old text := $$or lower(btrim(coalesce(b.pais, ''))) in ('mexico', 'méxico') then 'MX'$$;
    v_new text := $$or lower(btrim(coalesce(b.pais, ''))) in ('mexico', 'méxico')
              or regexp_replace(btrim(coalesce(b.clave_entidad, '')), '\D', '', 'g') ~ '^(0[1-9]|[12][0-9]|3[0-2])$' then 'MX'$$;
begin
    select p.oid into v_oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'panel_conversion_conversation_geo_resumen_v1'
    order by p.oid desc
    limit 1;

    if v_oid is null then
        raise exception 'panel_conversion_conversation_geo_resumen_v1_not_found';
    end if;

    v_def := pg_get_functiondef(v_oid);
    if position(v_old in v_def) = 0 then
        raise exception 'country_rollup_pattern_not_found';
    end if;
    v_def := replace(v_def, v_old, v_new);
    execute v_def;
end;
$migration$;
