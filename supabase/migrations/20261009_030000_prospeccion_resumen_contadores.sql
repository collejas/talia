BEGIN;

CREATE TABLE IF NOT EXISTS public.prospeccion_prospectos_resumen (
    organizacion_id uuid PRIMARY KEY,
    total_prospectos bigint NOT NULL DEFAULT 0,
    correos_validos bigint NOT NULL DEFAULT 0,
    correos_pendientes bigint NOT NULL DEFAULT 0,
    correos_invalidos bigint NOT NULL DEFAULT 0,
    correos_dudosos bigint NOT NULL DEFAULT 0,
    correos_errores bigint NOT NULL DEFAULT 0,
    correos_sin_email bigint NOT NULL DEFAULT 0,
    correos_suprimidos bigint NOT NULL DEFAULT 0,
    correos_disponibles bigint NOT NULL DEFAULT 0,
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prospeccion_prospectos_resumen ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.prospeccion_prospectos_resumen FROM anon, authenticated;

-- Reconstrucción idempotente utilizada al desplegar y por reconciliación.
CREATE OR REPLACE FUNCTION public.prospeccion_prospectos_resumen_rebuild(
    p_organizacion_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_count integer;
BEGIN
    INSERT INTO public.prospeccion_prospectos_resumen (
        organizacion_id, total_prospectos, correos_validos,
        correos_pendientes, correos_invalidos, correos_dudosos,
        correos_errores, correos_sin_email, correos_suprimidos,
        correos_disponibles, actualizado_en
    )
    SELECT
        p.organizacion_id,
        count(*)::bigint,
        count(*) FILTER (WHERE btrim(coalesce(p.email, '')) <> '' AND coalesce(nullif(btrim(p.email_lookup_status), ''), 'pendiente') = 'valido'),
        count(*) FILTER (WHERE btrim(coalesce(p.email, '')) <> '' AND coalesce(nullif(btrim(p.email_lookup_status), ''), 'pendiente') = 'pendiente'),
        count(*) FILTER (WHERE btrim(coalesce(p.email, '')) <> '' AND p.email_lookup_status = 'invalido'),
        count(*) FILTER (WHERE btrim(coalesce(p.email, '')) <> '' AND p.email_lookup_status = 'dudoso'),
        count(*) FILTER (WHERE btrim(coalesce(p.email, '')) <> '' AND p.email_lookup_status = 'error'),
        count(*) FILTER (WHERE btrim(coalesce(p.email, '')) = ''),
        count(*) FILTER (WHERE p.correo_suprimido_activo),
        count(*) FILTER (WHERE btrim(coalesce(p.email, '')) <> '' AND p.email_lookup_status = 'valido' AND NOT p.correo_suprimido_activo AND coalesce(p.envios_correo_intentos_total, 0) = 0),
        now()
    FROM public.prospeccion_prospectos p
    WHERE p_organizacion_id IS NULL OR p.organizacion_id = p_organizacion_id
    GROUP BY p.organizacion_id
    ON CONFLICT (organizacion_id) DO UPDATE SET
        total_prospectos = excluded.total_prospectos,
        correos_validos = excluded.correos_validos,
        correos_pendientes = excluded.correos_pendientes,
        correos_invalidos = excluded.correos_invalidos,
        correos_dudosos = excluded.correos_dudosos,
        correos_errores = excluded.correos_errores,
        correos_sin_email = excluded.correos_sin_email,
        correos_suprimidos = excluded.correos_suprimidos,
        correos_disponibles = excluded.correos_disponibles,
        actualizado_en = now();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prospeccion_prospectos_resumen_rapido()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
SELECT to_jsonb(r) - 'organizacion_id' - 'actualizado_en'
FROM public.prospeccion_prospectos_resumen r
WHERE r.organizacion_id = public.usuario_organizacion_id(auth.uid());
$function$;

-- El trigger actualiza sólo deltas del prospecto modificado; no hay scans por
-- cada INSERT/UPDATE y los filtros operativos leen una fila por tenant.
CREATE OR REPLACE FUNCTION public.tg_prospeccion_prospectos_resumen_delta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_org uuid;
    v_sign integer;
    v_row public.prospeccion_prospectos;
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        v_row := OLD;
        v_org := OLD.organizacion_id;
        v_sign := -1;
        PERFORM public.prospeccion_prospectos_resumen_apply_delta(v_org, v_sign, v_row);
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        v_row := NEW;
        v_org := NEW.organizacion_id;
        v_sign := 1;
        PERFORM public.prospeccion_prospectos_resumen_apply_delta(v_org, v_sign, v_row);
    END IF;
    RETURN coalesce(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.prospeccion_prospectos_resumen_apply_delta(
    p_organizacion_id uuid,
    p_sign integer,
    p_row public.prospeccion_prospectos
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
    INSERT INTO public.prospeccion_prospectos_resumen (organizacion_id)
    VALUES (p_organizacion_id)
    ON CONFLICT (organizacion_id) DO NOTHING;

    UPDATE public.prospeccion_prospectos_resumen r
    SET total_prospectos = r.total_prospectos + p_sign,
        correos_validos = r.correos_validos + p_sign * (CASE WHEN btrim(coalesce(p_row.email, '')) <> '' AND coalesce(nullif(btrim(p_row.email_lookup_status), ''), 'pendiente') = 'valido' THEN 1 ELSE 0 END),
        correos_pendientes = r.correos_pendientes + p_sign * (CASE WHEN btrim(coalesce(p_row.email, '')) <> '' AND coalesce(nullif(btrim(p_row.email_lookup_status), ''), 'pendiente') = 'pendiente' THEN 1 ELSE 0 END),
        correos_invalidos = r.correos_invalidos + p_sign * (CASE WHEN btrim(coalesce(p_row.email, '')) <> '' AND p_row.email_lookup_status = 'invalido' THEN 1 ELSE 0 END),
        correos_dudosos = r.correos_dudosos + p_sign * (CASE WHEN btrim(coalesce(p_row.email, '')) <> '' AND p_row.email_lookup_status = 'dudoso' THEN 1 ELSE 0 END),
        correos_errores = r.correos_errores + p_sign * (CASE WHEN btrim(coalesce(p_row.email, '')) <> '' AND p_row.email_lookup_status = 'error' THEN 1 ELSE 0 END),
        correos_sin_email = r.correos_sin_email + p_sign * (CASE WHEN btrim(coalesce(p_row.email, '')) = '' THEN 1 ELSE 0 END),
        correos_suprimidos = r.correos_suprimidos + p_sign * (CASE WHEN p_row.correo_suprimido_activo THEN 1 ELSE 0 END),
        correos_disponibles = r.correos_disponibles + p_sign * (CASE WHEN btrim(coalesce(p_row.email, '')) <> '' AND p_row.email_lookup_status = 'valido' AND NOT p_row.correo_suprimido_activo AND coalesce(p_row.envios_correo_intentos_total, 0) = 0 THEN 1 ELSE 0 END),
        actualizado_en = now()
    WHERE r.organizacion_id = p_organizacion_id;
END;
$function$;

DROP TRIGGER IF EXISTS trg_prospeccion_prospectos_resumen_delta ON public.prospeccion_prospectos;
CREATE TRIGGER trg_prospeccion_prospectos_resumen_delta
AFTER INSERT OR DELETE OR UPDATE ON public.prospeccion_prospectos
FOR EACH ROW EXECUTE FUNCTION public.tg_prospeccion_prospectos_resumen_delta();

SELECT public.prospeccion_prospectos_resumen_rebuild(NULL);

REVOKE ALL ON FUNCTION public.prospeccion_prospectos_resumen_rebuild(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prospeccion_prospectos_resumen_rebuild(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.prospeccion_prospectos_resumen_rapido() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prospeccion_prospectos_resumen_rapido() TO authenticated, service_role;

COMMIT;
