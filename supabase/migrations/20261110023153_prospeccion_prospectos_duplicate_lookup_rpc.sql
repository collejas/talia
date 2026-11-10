-- La deduplicación del importador no debe construir filtros OR gigantes en la
-- URL de PostgREST. Este RPC recibe los valores como arrays JSON y mantiene
-- el alcance por organización dentro de la base de datos.
CREATE OR REPLACE FUNCTION public.prospeccion_prospectos_buscar_contactos(
    p_organizacion_id uuid DEFAULT NULL,
    p_emails text[] DEFAULT '{}'::text[],
    p_phones text[] DEFAULT '{}'::text[]
)
RETURNS TABLE (
    id uuid,
    email text,
    correo_principal text,
    correo_secundario text,
    phone text,
    phone_e164 text,
    telefono_principal_e164 text,
    telefono_movil_1_e164 text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
    v_organizacion_id uuid;
    v_usuario_organizacion_id uuid;
BEGIN
    v_usuario_organizacion_id := public.usuario_organizacion_id(auth.uid());
    v_organizacion_id := COALESCE(p_organizacion_id, v_usuario_organizacion_id);

    IF v_organizacion_id IS NULL THEN
        RAISE EXCEPTION 'organization_scope_required'
            USING ERRCODE = '42501';
    END IF;

    IF v_usuario_organizacion_id IS NOT NULL
       AND v_organizacion_id IS DISTINCT FROM v_usuario_organizacion_id THEN
        RAISE EXCEPTION 'organization_scope_denied'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        p.email,
        p.correo_principal,
        p.correo_secundario,
        p.phone,
        p.phone_e164,
        p.telefono_principal_e164,
        p.telefono_movil_1_e164
    FROM public.prospeccion_prospectos AS p
    WHERE p.organizacion_id = v_organizacion_id
      AND (
          (
              cardinality(COALESCE(p_emails, '{}'::text[])) > 0
              AND (
                  lower(btrim(p.email)) = ANY (p_emails)
                  OR lower(btrim(p.correo_principal)) = ANY (p_emails)
                  OR lower(btrim(p.correo_secundario)) = ANY (p_emails)
              )
          )
          OR (
              cardinality(COALESCE(p_phones, '{}'::text[])) > 0
              AND (
                  p.phone = ANY (p_phones)
                  OR p.phone_e164 = ANY (p_phones)
                  OR p.telefono_principal_e164 = ANY (p_phones)
                  OR p.telefono_movil_1_e164 = ANY (p_phones)
              )
          )
      );
END;
$function$;

COMMENT ON FUNCTION public.prospeccion_prospectos_buscar_contactos(uuid, text[], text[])
IS 'Busca coincidencias de correo o telefono de prospectos dentro del tenant autenticado sin filtros OR extensos en PostgREST.';

REVOKE ALL ON FUNCTION public.prospeccion_prospectos_buscar_contactos(uuid, text[], text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prospeccion_prospectos_buscar_contactos(uuid, text[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prospeccion_prospectos_buscar_contactos(uuid, text[], text[]) TO service_role;

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_org_email_lookup_idx
    ON public.prospeccion_prospectos (organizacion_id, lower(btrim(email)))
    WHERE email IS NOT NULL AND btrim(email) <> '';

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_org_correo_principal_lookup_idx
    ON public.prospeccion_prospectos (organizacion_id, lower(btrim(correo_principal)))
    WHERE correo_principal IS NOT NULL AND btrim(correo_principal) <> '';

CREATE INDEX IF NOT EXISTS prospeccion_prospectos_org_correo_secundario_lookup_idx
    ON public.prospeccion_prospectos (organizacion_id, lower(btrim(correo_secundario)))
    WHERE correo_secundario IS NOT NULL AND btrim(correo_secundario) <> '';

ANALYZE public.prospeccion_prospectos;
