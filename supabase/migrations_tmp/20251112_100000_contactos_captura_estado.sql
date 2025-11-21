BEGIN;

ALTER TABLE public.contactos
    ADD COLUMN IF NOT EXISTS captura_estado text NOT NULL DEFAULT 'incompleto';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name = 'contactos'
          AND constraint_name = 'contactos_captura_estado_check'
    ) THEN
        ALTER TABLE public.contactos
            ADD CONSTRAINT contactos_captura_estado_check
            CHECK (captura_estado = ANY (ARRAY['incompleto'::text, 'completo'::text]));
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._contacto_captura_estado(
    p_nombre text,
    p_correo text,
    p_telefono text,
    p_notes text,
    p_necesidad text
) RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN COALESCE(NULLIF(btrim(p_nombre), ''), NULL) IS NOT NULL
         AND COALESCE(NULLIF(btrim(p_correo), ''), NULL) IS NOT NULL
         AND COALESCE(NULLIF(btrim(p_telefono), ''), NULL) IS NOT NULL
         AND COALESCE(NULLIF(btrim(p_notes), ''), NULL) IS NOT NULL
         AND COALESCE(NULLIF(btrim(p_necesidad), ''), NULL) IS NOT NULL
        THEN 'completo'
        ELSE 'incompleto'
    END;
$$;

COMMENT ON FUNCTION public._contacto_captura_estado(text, text, text, text, text)
    IS 'Determina si un contacto tiene todos los campos de captura completados.';

UPDATE public.contactos
   SET captura_estado = public._contacto_captura_estado(
        nombre_completo,
        correo,
        telefono_e164,
        notes,
        necesidad_proposito
    );

CREATE OR REPLACE FUNCTION public.tg_contactos_captura_estado()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.captura_estado := public._contacto_captura_estado(
        NEW.nombre_completo,
        NEW.correo,
        NEW.telefono_e164,
        NEW.notes,
        NEW.necesidad_proposito
    );
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_contactos_captura_estado()
    IS 'Actualiza captura_estado en contactos al detectar cambios relevantes.';

DROP TRIGGER IF EXISTS contactos_captura_estado ON public.contactos;
CREATE TRIGGER contactos_captura_estado
    BEFORE INSERT OR UPDATE OF nombre_completo, correo, telefono_e164, notes, necesidad_proposito
    ON public.contactos
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_contactos_captura_estado();

COMMIT;
