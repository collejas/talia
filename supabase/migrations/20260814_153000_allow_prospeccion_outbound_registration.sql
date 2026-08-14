-- Permite registrar un envío saliente aceptado por Meta sin exigir que el
-- worker cree previamente una conversación comercial. La RPC seguirá creando
-- la identidad/conversación técnica si hace falta; inbox_sync_conversation la
-- mantiene fuera de Inbox hasta que exista un mensaje entrante.
DO $patch$
DECLARE
  v_oid oid := to_regprocedure(
    'public.registrar_mensaje_whatsapp(text,text,text,text,jsonb,text,text,uuid,uuid,text,integer,integer,jsonb,jsonb,uuid)'
  );
  v_definition text;
  v_guard text := $guard$
    IF p_direction = 'saliente' AND p_conversation_id IS NULL THEN
        RAISE EXCEPTION 'conversation_id requerido para mensajes salientes';
    END IF;
$guard$;
BEGIN
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'registrar_mensaje_whatsapp signature not found';
  END IF;

  SELECT pg_get_functiondef(v_oid) INTO v_definition;
  IF position(v_guard IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected outbound conversation guard not found';
  END IF;

  v_definition := replace(
    v_definition,
    v_guard,
    '    -- Los envíos salientes aceptados por Meta pueden registrarse sin '
    'conversation_id previa; la RPC resolverá la conversación técnica y '
    'Inbox la ocultará hasta la primera respuesta entrante.'
  );
  EXECUTE v_definition;
END;
$patch$;
