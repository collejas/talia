-- Keep prospect auditing tenant-scoped for service workers that have no
-- auth.uid(). The tenant is copied from the prospect row being audited.
CREATE OR REPLACE FUNCTION public.tg_prospeccion_prospectos_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor uuid;
    v_payload jsonb;
    v_prospecto_id uuid;
    v_organizacion_id uuid;
BEGIN
    IF TG_OP = 'UPDATE' AND
       (to_jsonb(NEW) - ARRAY[
           'ultimo_envio_correo_en',
           'ultimo_envio_whatsapp_en',
           'ultimo_envio_voz_en',
           'actualizado_en',
           'updated_at'
       ]) =
       (to_jsonb(OLD) - ARRAY[
           'ultimo_envio_correo_en',
           'ultimo_envio_whatsapp_en',
           'ultimo_envio_voz_en',
           'actualizado_en',
           'updated_at'
       ]) THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        v_payload := to_jsonb(NEW);
        v_prospecto_id := NEW.id;
        v_organizacion_id := NEW.organizacion_id;
        v_actor := COALESCE(auth.uid(), NEW.creado_por);
    ELSIF TG_OP = 'UPDATE' THEN
        v_payload := jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW));
        v_prospecto_id := NEW.id;
        v_organizacion_id := COALESCE(NEW.organizacion_id, OLD.organizacion_id);
        v_actor := COALESCE(auth.uid(), NEW.actualizado_por, OLD.actualizado_por, OLD.creado_por);
    ELSE
        v_payload := to_jsonb(OLD);
        v_prospecto_id := OLD.id;
        v_organizacion_id := OLD.organizacion_id;
        v_actor := COALESCE(auth.uid(), OLD.actualizado_por, OLD.creado_por);
    END IF;

    IF v_organizacion_id IS NULL THEN
        RAISE EXCEPTION 'organizacion_id requerido para auditar prospecto %', v_prospecto_id
            USING ERRCODE = '23502';
    END IF;

    INSERT INTO public.prospeccion_prospectos_audit (
        prospecto_id,
        accion,
        cambios,
        realizado_por,
        organizacion_id
    )
    VALUES (
        v_prospecto_id,
        lower(TG_OP),
        v_payload,
        v_actor,
        v_organizacion_id
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;
