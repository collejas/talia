BEGIN;

-- Preserve the tenant when a notification target is deleted. PostgreSQL's
-- default composite SET NULL would otherwise null organizacion_id too.
ALTER TABLE public.ui_notificaciones
    DROP CONSTRAINT IF EXISTS ui_notificaciones_actividad_org_fkey,
    DROP CONSTRAINT IF EXISTS ui_notificaciones_contacto_org_fkey,
    DROP CONSTRAINT IF EXISTS ui_notificaciones_cuenta_org_fkey,
    DROP CONSTRAINT IF EXISTS ui_notificaciones_oportunidad_org_fkey,
    DROP CONSTRAINT IF EXISTS ui_notificaciones_persona_org_fkey;

ALTER TABLE public.ui_notificaciones
    ADD CONSTRAINT ui_notificaciones_actividad_org_fkey
        FOREIGN KEY (organizacion_id, actividad_id)
        REFERENCES public.actividades (organizacion_id, id)
        ON DELETE SET NULL (actividad_id),
    ADD CONSTRAINT ui_notificaciones_contacto_org_fkey
        FOREIGN KEY (organizacion_id, contacto_id)
        REFERENCES public.contactos (organizacion_id, id)
        ON DELETE SET NULL (contacto_id),
    ADD CONSTRAINT ui_notificaciones_cuenta_org_fkey
        FOREIGN KEY (organizacion_id, cuenta_id)
        REFERENCES public.cuentas (organizacion_id, id)
        ON DELETE SET NULL (cuenta_id),
    ADD CONSTRAINT ui_notificaciones_oportunidad_org_fkey
        FOREIGN KEY (organizacion_id, oportunidad_id)
        REFERENCES public.oportunidades (organizacion_id, id)
        ON DELETE SET NULL (oportunidad_id),
    ADD CONSTRAINT ui_notificaciones_persona_org_fkey
        FOREIGN KEY (organizacion_id, persona_id)
        REFERENCES public.personas (organizacion_id, id)
        ON DELETE SET NULL (persona_id);

COMMIT;
