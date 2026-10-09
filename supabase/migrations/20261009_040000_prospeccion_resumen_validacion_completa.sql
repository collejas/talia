BEGIN;

ALTER TABLE public.prospeccion_prospectos_resumen
    ADD COLUMN IF NOT EXISTS telefonos_verificados bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS telefonos_pendientes bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS telefonos_errores bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS telefonos_sin_numero bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sitios_web_validos bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sitios_web_pendientes bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sitios_web_invalidos bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sitios_web_dudosos bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sitios_web_errores bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sitios_web_sin_sitio bigint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.prospeccion_prospectos_resumen_rebuild(p_organizacion_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE v_count integer;
BEGIN
    INSERT INTO public.prospeccion_prospectos_resumen (
        organizacion_id, total_prospectos,
        telefonos_verificados, telefonos_pendientes, telefonos_errores, telefonos_sin_numero,
        correos_validos, correos_pendientes, correos_invalidos, correos_dudosos, correos_errores, correos_sin_email,
        sitios_web_validos, sitios_web_pendientes, sitios_web_invalidos, sitios_web_dudosos, sitios_web_errores, sitios_web_sin_sitio,
        correos_suprimidos, correos_disponibles, actualizado_en
    )
    SELECT p.organizacion_id, count(*)::bigint,
        count(*) FILTER (WHERE btrim(coalesce(p.phone,'')) <> '' AND coalesce(nullif(btrim(p.lookup_status),''),'pendiente')='verificado'),
        count(*) FILTER (WHERE btrim(coalesce(p.phone,'')) <> '' AND coalesce(nullif(btrim(p.lookup_status),''),'pendiente')='pendiente'),
        count(*) FILTER (WHERE btrim(coalesce(p.phone,'')) <> '' AND p.lookup_status='error'),
        count(*) FILTER (WHERE btrim(coalesce(p.phone,'')) = ''),
        count(*) FILTER (WHERE btrim(coalesce(p.email,'')) <> '' AND coalesce(nullif(btrim(p.email_lookup_status),''),'pendiente')='valido'),
        count(*) FILTER (WHERE btrim(coalesce(p.email,'')) <> '' AND coalesce(nullif(btrim(p.email_lookup_status),''),'pendiente')='pendiente'),
        count(*) FILTER (WHERE btrim(coalesce(p.email,'')) <> '' AND p.email_lookup_status='invalido'),
        count(*) FILTER (WHERE btrim(coalesce(p.email,'')) <> '' AND p.email_lookup_status='dudoso'),
        count(*) FILTER (WHERE btrim(coalesce(p.email,'')) <> '' AND p.email_lookup_status='error'),
        count(*) FILTER (WHERE btrim(coalesce(p.email,'')) = ''),
        count(*) FILTER (WHERE btrim(coalesce(p.website,'')) <> '' AND coalesce(nullif(btrim(p.website_lookup_status),''),'pendiente')='valido'),
        count(*) FILTER (WHERE btrim(coalesce(p.website,'')) <> '' AND coalesce(nullif(btrim(p.website_lookup_status),''),'pendiente')='pendiente'),
        count(*) FILTER (WHERE btrim(coalesce(p.website,'')) <> '' AND p.website_lookup_status='invalido'),
        count(*) FILTER (WHERE btrim(coalesce(p.website,'')) <> '' AND p.website_lookup_status='dudoso'),
        count(*) FILTER (WHERE btrim(coalesce(p.website,'')) <> '' AND p.website_lookup_status='error'),
        count(*) FILTER (WHERE btrim(coalesce(p.website,'')) = ''),
        count(*) FILTER (WHERE p.correo_suprimido_activo),
        count(*) FILTER (WHERE btrim(coalesce(p.email,'')) <> '' AND p.email_lookup_status='valido' AND NOT p.correo_suprimido_activo AND coalesce(p.envios_correo_intentos_total,0)=0),
        now()
    FROM public.prospeccion_prospectos p
    WHERE p_organizacion_id IS NULL OR p.organizacion_id=p_organizacion_id
    GROUP BY p.organizacion_id
    ON CONFLICT (organizacion_id) DO UPDATE SET
        total_prospectos=excluded.total_prospectos,
        telefonos_verificados=excluded.telefonos_verificados, telefonos_pendientes=excluded.telefonos_pendientes,
        telefonos_errores=excluded.telefonos_errores, telefonos_sin_numero=excluded.telefonos_sin_numero,
        correos_validos=excluded.correos_validos, correos_pendientes=excluded.correos_pendientes,
        correos_invalidos=excluded.correos_invalidos, correos_dudosos=excluded.correos_dudosos,
        correos_errores=excluded.correos_errores, correos_sin_email=excluded.correos_sin_email,
        sitios_web_validos=excluded.sitios_web_validos, sitios_web_pendientes=excluded.sitios_web_pendientes,
        sitios_web_invalidos=excluded.sitios_web_invalidos, sitios_web_dudosos=excluded.sitios_web_dudosos,
        sitios_web_errores=excluded.sitios_web_errores, sitios_web_sin_sitio=excluded.sitios_web_sin_sitio,
        correos_suprimidos=excluded.correos_suprimidos, correos_disponibles=excluded.correos_disponibles,
        actualizado_en=now();
    GET DIAGNOSTICS v_count=ROW_COUNT; RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prospeccion_prospectos_resumen_rapido()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $function$
SELECT to_jsonb(r) - 'organizacion_id' - 'actualizado_en'
FROM public.prospeccion_prospectos_resumen r
WHERE r.organizacion_id=public.usuario_organizacion_id(auth.uid());
$function$;

CREATE OR REPLACE FUNCTION public.prospeccion_prospectos_resumen_apply_delta(
    p_organizacion_id uuid, p_sign integer, p_row public.prospeccion_prospectos
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public, pg_temp AS $function$
BEGIN
    INSERT INTO public.prospeccion_prospectos_resumen(organizacion_id) VALUES(p_organizacion_id) ON CONFLICT DO NOTHING;
    UPDATE public.prospeccion_prospectos_resumen r SET
        total_prospectos=r.total_prospectos+p_sign,
        telefonos_verificados=r.telefonos_verificados+p_sign*(CASE WHEN btrim(coalesce(p_row.phone,''))<>'' AND coalesce(nullif(btrim(p_row.lookup_status),''),'pendiente')='verificado' THEN 1 ELSE 0 END),
        telefonos_pendientes=r.telefonos_pendientes+p_sign*(CASE WHEN btrim(coalesce(p_row.phone,''))<>'' AND coalesce(nullif(btrim(p_row.lookup_status),''),'pendiente')='pendiente' THEN 1 ELSE 0 END),
        telefonos_errores=r.telefonos_errores+p_sign*(CASE WHEN btrim(coalesce(p_row.phone,''))<>'' AND p_row.lookup_status='error' THEN 1 ELSE 0 END),
        telefonos_sin_numero=r.telefonos_sin_numero+p_sign*(CASE WHEN btrim(coalesce(p_row.phone,''))='' THEN 1 ELSE 0 END),
        correos_validos=r.correos_validos+p_sign*(CASE WHEN btrim(coalesce(p_row.email,''))<>'' AND coalesce(nullif(btrim(p_row.email_lookup_status),''),'pendiente')='valido' THEN 1 ELSE 0 END),
        correos_pendientes=r.correos_pendientes+p_sign*(CASE WHEN btrim(coalesce(p_row.email,''))<>'' AND coalesce(nullif(btrim(p_row.email_lookup_status),''),'pendiente')='pendiente' THEN 1 ELSE 0 END),
        correos_invalidos=r.correos_invalidos+p_sign*(CASE WHEN btrim(coalesce(p_row.email,''))<>'' AND p_row.email_lookup_status='invalido' THEN 1 ELSE 0 END),
        correos_dudosos=r.correos_dudosos+p_sign*(CASE WHEN btrim(coalesce(p_row.email,''))<>'' AND p_row.email_lookup_status='dudoso' THEN 1 ELSE 0 END),
        correos_errores=r.correos_errores+p_sign*(CASE WHEN btrim(coalesce(p_row.email,''))<>'' AND p_row.email_lookup_status='error' THEN 1 ELSE 0 END),
        correos_sin_email=r.correos_sin_email+p_sign*(CASE WHEN btrim(coalesce(p_row.email,''))='' THEN 1 ELSE 0 END),
        sitios_web_validos=r.sitios_web_validos+p_sign*(CASE WHEN btrim(coalesce(p_row.website,''))<>'' AND coalesce(nullif(btrim(p_row.website_lookup_status),''),'pendiente')='valido' THEN 1 ELSE 0 END),
        sitios_web_pendientes=r.sitios_web_pendientes+p_sign*(CASE WHEN btrim(coalesce(p_row.website,''))<>'' AND coalesce(nullif(btrim(p_row.website_lookup_status),''),'pendiente')='pendiente' THEN 1 ELSE 0 END),
        sitios_web_invalidos=r.sitios_web_invalidos+p_sign*(CASE WHEN btrim(coalesce(p_row.website,''))<>'' AND p_row.website_lookup_status='invalido' THEN 1 ELSE 0 END),
        sitios_web_dudosos=r.sitios_web_dudosos+p_sign*(CASE WHEN btrim(coalesce(p_row.website,''))<>'' AND p_row.website_lookup_status='dudoso' THEN 1 ELSE 0 END),
        sitios_web_errores=r.sitios_web_errores+p_sign*(CASE WHEN btrim(coalesce(p_row.website,''))<>'' AND p_row.website_lookup_status='error' THEN 1 ELSE 0 END),
        sitios_web_sin_sitio=r.sitios_web_sin_sitio+p_sign*(CASE WHEN btrim(coalesce(p_row.website,''))='' THEN 1 ELSE 0 END),
        correos_suprimidos=r.correos_suprimidos+p_sign*(CASE WHEN p_row.correo_suprimido_activo THEN 1 ELSE 0 END),
        correos_disponibles=r.correos_disponibles+p_sign*(CASE WHEN btrim(coalesce(p_row.email,''))<>'' AND p_row.email_lookup_status='valido' AND NOT p_row.correo_suprimido_activo AND coalesce(p_row.envios_correo_intentos_total,0)=0 THEN 1 ELSE 0 END),
        actualizado_en=now()
    WHERE r.organizacion_id=p_organizacion_id;
END;
$function$;

SELECT public.prospeccion_prospectos_resumen_rebuild(NULL);
COMMIT;
