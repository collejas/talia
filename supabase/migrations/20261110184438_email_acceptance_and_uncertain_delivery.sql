BEGIN;
ALTER TABLE public.tenant_email_messages DROP CONSTRAINT tenant_email_messages_status_check;
ALTER TABLE public.tenant_email_messages ADD CONSTRAINT tenant_email_messages_status_check
CHECK (status IN ('queued','processing','verifying','submitted','delivered','failed',
 'bounced','complained','suppressed','opened','clicked','cancelled'));

-- Change only the known deployed definitions; fail closed on drift.
DO $migration$
DECLARE d text;
BEGIN
 d := pg_get_functiondef('public.tenant_email_start_attempt(uuid,uuid)'::regprocedure);
 IF position('submitted_at = COALESCE(submitted_at, now()),' in d)=0 THEN
  RAISE EXCEPTION 'start_attempt_definition_drift';
 END IF;
 -- Hold before dispatch: a process crash or lost finish response must never
 -- make the stale-lease reclaimer resend a potentially accepted message.
 d := replace(d, 'status = ''submitted'',', 'status = ''verifying'',');
 d := replace(d, 'submitted_at = COALESCE(submitted_at, now()),', 'submitted_at = submitted_at,');
 d := replace(d, 'IF v_message.status = ''cancelled''', 'IF v_message.status IN (''cancelled'', ''verifying'')');
 EXECUTE d;
 d := pg_get_functiondef('public.tenant_email_finish_attempt(uuid,uuid,uuid,boolean,uuid,text,text)'::regprocedure);
 IF position('SET status = ''submitted'', external_message_id = p_external_message_id,' in d)=0 THEN
  RAISE EXCEPTION 'finish_attempt_definition_drift';
 END IF;
 d := replace(d, 'IF p_accepted THEN',
  'IF p_accepted AND p_external_message_id IS NULL THEN RAISE EXCEPTION ''accepted_message_id_required''; END IF; IF p_accepted THEN');
 d := replace(d, 'SET status = ''submitted'', external_message_id = p_external_message_id,',
  'SET status = ''submitted'', submitted_at = COALESCE(submitted_at, now()), external_message_id = p_external_message_id,');
 EXECUTE d;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.tenant_email_hold_uncertain_attempt(
 p_organizacion_id uuid, p_message_id uuid, p_attempt_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM 1 FROM public.tenant_email_message_attempts
 WHERE id=p_attempt_id AND message_id=p_message_id
 AND organizacion_id=p_organizacion_id AND status='started' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'uncertain_attempt_not_started'; END IF;
 UPDATE public.tenant_email_messages SET status='verifying',
 last_error_code='delivery_uncertain', updated_at=now()
 WHERE id=p_message_id AND organizacion_id=p_organizacion_id
 AND external_message_id IS NULL AND status IN ('processing','verifying');
END;
$$;
REVOKE ALL ON FUNCTION public.tenant_email_hold_uncertain_attempt(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_email_hold_uncertain_attempt(uuid,uuid,uuid) TO service_role;
COMMIT;
