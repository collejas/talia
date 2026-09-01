-- Publicación atómica de una versión de plantilla dentro del tenant autenticado.

BEGIN;

CREATE OR REPLACE FUNCTION public.publicar_prospeccion_plantilla_version(
    p_organizacion_id uuid,
    p_template_id uuid,
    p_version_id uuid
)
RETURNS public.prospeccion_plantilla_versiones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    selected_version public.prospeccion_plantilla_versiones;
BEGIN
    IF public.usuario_organizacion_id(auth.uid()) IS DISTINCT FROM p_organizacion_id THEN
        RAISE EXCEPTION 'template_version_organization_forbidden';
    END IF;

    SELECT * INTO selected_version
    FROM public.prospeccion_plantilla_versiones
    WHERE id = p_version_id
      AND organizacion_id = p_organizacion_id
      AND template_id = p_template_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'template_version_not_found';
    END IF;

    UPDATE public.prospeccion_plantilla_versiones
    SET estado = 'archivada', actualizado_en = now()
    WHERE organizacion_id = p_organizacion_id
      AND template_id = p_template_id
      AND estado = 'publicada'
      AND id <> p_version_id;

    UPDATE public.prospeccion_plantilla_versiones
    SET estado = 'publicada', publicado_por = auth.uid(), publicado_en = now(), actualizado_en = now()
    WHERE id = p_version_id
      AND organizacion_id = p_organizacion_id;

    UPDATE public.prospeccion_contacto_templates
    SET version_activa_id = p_version_id,
        asunto = selected_version.asunto,
        cuerpo_texto = selected_version.cuerpo_texto,
        cuerpo_html = selected_version.cuerpo_html,
        email_creation_mode = CASE
            WHEN canal = 'correo' THEN selected_version.metodo_creacion
            ELSE email_creation_mode
        END,
        actualizado_en = now()
    WHERE id = p_template_id
      AND organizacion_id = p_organizacion_id;

    SELECT * INTO selected_version
    FROM public.prospeccion_plantilla_versiones
    WHERE id = p_version_id;
    RETURN selected_version;
END;
$$;

REVOKE ALL ON FUNCTION public.publicar_prospeccion_plantilla_version(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publicar_prospeccion_plantilla_version(uuid, uuid, uuid) TO authenticated;

COMMIT;
