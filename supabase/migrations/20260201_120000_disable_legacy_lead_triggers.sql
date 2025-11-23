-- Desactiva los triggers legacy de lead_tarjetas/contactos ahora que el embudo usa oportunidades.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'lead_tarjetas'
          AND t.tgname = 'lead_tarjetas_before_write'
    ) THEN
        EXECUTE 'ALTER TABLE public.lead_tarjetas DISABLE TRIGGER lead_tarjetas_before_write';
    END IF;
END;
$$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'lead_tarjetas'
          AND t.tgname = 'lead_tarjetas_after_write'
    ) THEN
        EXECUTE 'ALTER TABLE public.lead_tarjetas DISABLE TRIGGER lead_tarjetas_after_write';
    END IF;
END;
$$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'lead_tarjetas'
          AND t.tgname = 'lead_tarjetas_auto_precalificado'
    ) THEN
        EXECUTE 'ALTER TABLE public.lead_tarjetas DISABLE TRIGGER lead_tarjetas_auto_precalificado';
    END IF;
END;
$$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'contactos'
          AND t.tgname = 'contactos_auto_precalificado'
    ) THEN
        EXECUTE 'ALTER TABLE public.contactos DISABLE TRIGGER contactos_auto_precalificado';
    END IF;
END;
$$;

COMMENT ON TABLE public.lead_tarjetas IS
    'Tabla legacy (solo lectura) - triggers de normalización/auto-precalificación deshabilitados tras migrar a oportunidades.';
COMMENT ON TABLE public.contactos IS
    'Los triggers legacy que sincronizaban lead_tarjetas fueron deshabilitados; la captura se maneja desde el backend CRM.';
