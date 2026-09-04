BEGIN;

ALTER TABLE public.prospeccion_contacto_envio
    ADD COLUMN IF NOT EXISTS version_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'prospeccion_contacto_envio_version_org_fkey'
          AND conrelid = 'public.prospeccion_contacto_envio'::regclass
    ) THEN
        ALTER TABLE public.prospeccion_contacto_envio
            ADD CONSTRAINT prospeccion_contacto_envio_version_org_fkey
            FOREIGN KEY (organizacion_id, version_id)
            REFERENCES public.prospeccion_plantilla_versiones (organizacion_id, id)
            ON DELETE RESTRICT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS prospeccion_contacto_envio_org_version_idx
    ON public.prospeccion_contacto_envio (organizacion_id, version_id)
    WHERE version_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.eliminar_prospeccion_plantilla_version(
    p_organizacion_id uuid,
    p_template_id uuid,
    p_version_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    selected_version public.prospeccion_plantilla_versiones;
    template_active_version uuid;
    has_versioned_sends boolean;
    has_legacy_sends boolean;
BEGIN
    IF public.usuario_organizacion_id(auth.uid()) IS DISTINCT FROM p_organizacion_id THEN
        RAISE EXCEPTION 'template_version_organization_forbidden';
    END IF;

    SELECT version_activa_id
    INTO template_active_version
    FROM public.prospeccion_contacto_templates
    WHERE id = p_template_id
      AND organizacion_id = p_organizacion_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'contact_template_not_found';
    END IF;

    SELECT *
    INTO selected_version
    FROM public.prospeccion_plantilla_versiones
    WHERE id = p_version_id
      AND organizacion_id = p_organizacion_id
      AND template_id = p_template_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'template_version_not_found';
    END IF;

    IF template_active_version = p_version_id OR selected_version.estado = 'publicada' THEN
        RAISE EXCEPTION 'template_version_active_or_published';
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM public.prospeccion_contacto_envio e
        WHERE e.organizacion_id = p_organizacion_id
          AND e.version_id = p_version_id
    ) INTO has_versioned_sends;

    IF has_versioned_sends THEN
        RAISE EXCEPTION 'template_version_has_real_sends';
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM public.prospeccion_contacto_envio e
        WHERE e.organizacion_id = p_organizacion_id
          AND e.version_id IS NULL
          AND (
              e.payload ->> 'template_id' = p_template_id::text
              OR e.payload -> 'metadata' ->> 'template_id' = p_template_id::text
              OR e.payload -> 'metadata' ->> 'template_id_snapshot' = p_template_id::text
          )
    ) INTO has_legacy_sends;

    IF has_legacy_sends THEN
        RAISE EXCEPTION 'template_version_send_history_unknown';
    END IF;

    DELETE FROM public.prospeccion_plantilla_versiones
    WHERE id = p_version_id
      AND organizacion_id = p_organizacion_id
      AND template_id = p_template_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'template_version_not_found';
    END IF;

    RETURN p_version_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.eliminar_prospeccion_plantilla_version(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.eliminar_prospeccion_plantilla_version(uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.eliminar_prospeccion_plantilla_version(uuid, uuid, uuid) TO authenticated;

COMMIT;
