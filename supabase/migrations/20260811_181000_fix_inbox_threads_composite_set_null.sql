BEGIN;

-- Keep the tenant key when an inbox target is removed. Only the target ID
-- becomes NULL; organizacion_id remains mandatory for tenant isolation.
ALTER TABLE public.inbox_threads
    DROP CONSTRAINT IF EXISTS inbox_threads_asignado_org_fkey,
    DROP CONSTRAINT IF EXISTS inbox_threads_conversation_org_fkey,
    DROP CONSTRAINT IF EXISTS inbox_threads_cuenta_org_fkey,
    DROP CONSTRAINT IF EXISTS inbox_threads_message_org_fkey,
    DROP CONSTRAINT IF EXISTS inbox_threads_persona_org_fkey;

ALTER TABLE public.inbox_threads
    ADD CONSTRAINT inbox_threads_asignado_org_fkey
        FOREIGN KEY (organizacion_id, asignado_a_usuario_id)
        REFERENCES public.usuarios (organizacion_id, id)
        ON DELETE SET NULL (asignado_a_usuario_id),
    ADD CONSTRAINT inbox_threads_conversation_org_fkey
        FOREIGN KEY (organizacion_id, conversacion_canonica_id)
        REFERENCES public.conversaciones (organizacion_id, id)
        ON DELETE SET NULL (conversacion_canonica_id)
        DEFERRABLE INITIALLY DEFERRED,
    ADD CONSTRAINT inbox_threads_cuenta_org_fkey
        FOREIGN KEY (organizacion_id, cuenta_id)
        REFERENCES public.cuentas (organizacion_id, id)
        ON DELETE SET NULL (cuenta_id),
    ADD CONSTRAINT inbox_threads_message_org_fkey
        FOREIGN KEY (organizacion_id, ultimo_mensaje_id)
        REFERENCES public.mensajes (organizacion_id, id)
        ON DELETE SET NULL (ultimo_mensaje_id)
        DEFERRABLE INITIALLY DEFERRED,
    ADD CONSTRAINT inbox_threads_persona_org_fkey
        FOREIGN KEY (organizacion_id, persona_id)
        REFERENCES public.personas (organizacion_id, id)
        ON DELETE SET NULL (persona_id);

COMMIT;
