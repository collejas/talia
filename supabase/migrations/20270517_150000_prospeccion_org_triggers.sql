BEGIN;

-- Función genérica para poblar organizacion_id basándose en auth.uid()
CREATE OR REPLACE FUNCTION public.tg_set_organizacion_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org uuid;
BEGIN
    IF NEW.organizacion_id IS NOT NULL AND NEW.organizacion_id <> '00000000-0000-0000-0000-000000000001'::uuid THEN
        RETURN NEW;
    END IF;
    BEGIN
        v_org := public.usuario_organizacion_id(auth.uid());
    EXCEPTION
        WHEN others THEN
            v_org := NULL;
    END;
    IF v_org IS NOT NULL THEN
        NEW.organizacion_id := v_org;
    ELSIF NEW.organizacion_id IS NULL THEN
        NEW.organizacion_id := '00000000-0000-0000-0000-000000000001'::uuid;
    END IF;
    RETURN NEW;
END;
$$;

-- Helper para crear triggers si no existen
DO $$
DECLARE
    rec record;
    tables text[] := ARRAY[
        'busquedas',
        'resultados',
        'prospeccion_prospectos',
        'prospeccion_contactos_log',
        'prospeccion_contacto_batch',
        'prospeccion_contacto_envio',
        'prospeccion_prospectos_audit',
        'prospeccion_contacto_templates',
        'prospeccion_buscador_jobs',
        'prospeccion_buscador_resultados'
    ];
    tbl text;
    trigger_name text;
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        trigger_name := format('t_%s_set_org', tbl);
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trigger_name, tbl);
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_set_organizacion_id()',
            trigger_name,
            tbl
        );
    END LOOP;
END;
$$;

COMMIT;
