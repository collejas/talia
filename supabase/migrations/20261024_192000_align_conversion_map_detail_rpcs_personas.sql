-- Align the deferred detail tables used by mapa-de-conversion.
do $migration$
declare
    v_oid oid;
    v_def text;
    v_phone_expr text := 'coalesce(c.telefono_principal_e164, c.telefono_secundario_e164, c.telefono_movil_1_e164, c.telefono_movil_2_e164)';
begin
    select p.oid into v_oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'panel_webchat_conversaciones_detalle'
    order by p.oid desc limit 1;

    if v_oid is not null then
        v_def := pg_get_functiondef(v_oid);
        v_def := replace(v_def, 'public.contactos c', 'public.personas c');
        v_def := replace(v_def, '        c.contacto_id,', '        coalesce(c.persona_id, c.contacto_id) AS contacto_id,');
        v_def := replace(v_def, '        c.contacto_id::text AS contacto_id_text,', '        coalesce(c.persona_id, c.contacto_id)::text AS contacto_id_text,');
        v_def := replace(v_def, 'c.id = r.contacto_id', 'c.id = r.contacto_id');
        v_def := replace(v_def, 'c.telefono_e164', v_phone_expr);
        v_def := replace(v_def, '        ' || v_phone_expr || ',', '        ' || v_phone_expr || ' AS telefono_e164,');
        execute v_def;
    end if;

    select p.oid into v_oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'panel_webchat_visitas_detalle'
    order by p.oid desc limit 1;

    if v_oid is not null then
        v_def := pg_get_functiondef(v_oid);
        v_def := replace(
            v_def,
            'COALESCE(w.contacto_id, ic.contacto_id) AS contacto_id',
            'COALESCE(w.persona_id, ic.persona_id, w.contacto_id, ic.contacto_id) AS contacto_id'
        );
        execute v_def;
    end if;
end;
$migration$;
