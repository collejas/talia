-- Las campañas salientes no deben crear una entrada visible en Inbox hasta
-- que exista un mensaje entrante del prospecto.
CREATE OR REPLACE FUNCTION public.inbox_sync_conversation(p_conversation_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_channel text;
  v_phone text;
  v_group_key text;
  v_thread_id uuid;
  v_old_thread_id uuid;
BEGIN
  SELECT c.organizacion_id,
         lower(c.canal),
         public.inbox_normalize_phone(coalesce(
           p.telefono_principal_e164,
           p.telefono_movil_1_e164,
           p.telefono_secundario_e164,
           c.inbox_context->>'contacto_telefono'
         ))
    INTO v_org, v_channel, v_phone
    FROM public.conversaciones c
    LEFT JOIN public.personas p ON p.id = coalesce(c.persona_id, c.contacto_id)
   WHERE c.id = p_conversation_id;

  IF v_org IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_channel = 'whatsapp'
     AND NOT EXISTS (
       SELECT 1
       FROM public.mensajes m
       WHERE m.conversacion_id = p_conversation_id
         AND m.direccion = 'entrante'
     ) THEN
    SELECT inbox_thread_id INTO v_old_thread_id
    FROM public.inbox_thread_conversations
    WHERE conversacion_id = p_conversation_id;

    DELETE FROM public.inbox_thread_conversations
    WHERE conversacion_id = p_conversation_id;

    IF v_old_thread_id IS NOT NULL THEN
      PERFORM public.inbox_recompute_thread(v_old_thread_id);
    END IF;
    RETURN NULL;
  END IF;

  v_group_key := CASE
    WHEN v_channel = 'whatsapp' AND v_phone IS NOT NULL THEN 'whatsapp:' || v_phone
    ELSE 'conversation:' || p_conversation_id::text
  END;

  SELECT inbox_thread_id INTO v_old_thread_id
  FROM public.inbox_thread_conversations
  WHERE conversacion_id = p_conversation_id;

  INSERT INTO public.inbox_threads (
    organizacion_id, group_key, canal, telefono_normalizado,
    conversacion_canonica_id, iniciada_en
  )
  SELECT c.organizacion_id, v_group_key, v_channel, v_phone, c.id, c.iniciada_en
  FROM public.conversaciones c WHERE c.id = p_conversation_id
  ON CONFLICT (organizacion_id, group_key) DO UPDATE
    SET telefono_normalizado = excluded.telefono_normalizado,
        actualizado_en = now()
  RETURNING id INTO v_thread_id;

  INSERT INTO public.inbox_thread_conversations (
    organizacion_id, inbox_thread_id, conversacion_id
  )
  VALUES (v_org, v_thread_id, p_conversation_id)
  ON CONFLICT (conversacion_id) DO UPDATE
    SET organizacion_id = excluded.organizacion_id,
        inbox_thread_id = excluded.inbox_thread_id;

  PERFORM public.inbox_recompute_thread(v_thread_id);
  IF v_old_thread_id IS NOT NULL AND v_old_thread_id <> v_thread_id THEN
    PERFORM public.inbox_recompute_thread(v_old_thread_id);
  END IF;
  RETURN v_thread_id;
END;
$$;
