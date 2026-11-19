CREATE OR REPLACE FUNCTION public.tg_prospeccion_prospectos_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor uuid; v_payload jsonb; v_prospecto_id uuid;
BEGIN
    IF TG_OP='UPDATE' AND
       (to_jsonb(NEW)-ARRAY['ultimo_envio_correo_en','ultimo_envio_whatsapp_en','ultimo_envio_voz_en','actualizado_en','updated_at']) =
       (to_jsonb(OLD)-ARRAY['ultimo_envio_correo_en','ultimo_envio_whatsapp_en','ultimo_envio_voz_en','actualizado_en','updated_at']) THEN
        RETURN NEW;
    END IF;
    IF TG_OP='INSERT' THEN v_payload:=to_jsonb(NEW); v_prospecto_id:=NEW.id;
    ELSIF TG_OP='UPDATE' THEN v_payload:=jsonb_build_object('before',to_jsonb(OLD),'after',to_jsonb(NEW)); v_prospecto_id:=NEW.id;
    ELSE v_payload:=to_jsonb(OLD); v_prospecto_id:=OLD.id; END IF;
    v_actor:=auth.uid();
    IF v_actor IS NULL THEN
      IF TG_OP='INSERT' THEN v_actor:=NEW.creado_por;
      ELSIF TG_OP='UPDATE' THEN v_actor:=COALESCE(NEW.actualizado_por,OLD.actualizado_por,OLD.creado_por);
      ELSE v_actor:=COALESCE(OLD.actualizado_por,OLD.creado_por); END IF;
    END IF;
    INSERT INTO public.prospeccion_prospectos_audit(prospecto_id,accion,cambios,realizado_por) VALUES(v_prospecto_id,lower(TG_OP),v_payload,v_actor);
    IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
