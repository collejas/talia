BEGIN;

-- ============================================================================
-- Soporte de archivo y merge para personas y cuentas
-- ============================================================================

ALTER TABLE public.personas
    ADD COLUMN IF NOT EXISTS archived_at timestamptz,
    ADD COLUMN IF NOT EXISTS merged_into_persona_id uuid,
    ADD COLUMN IF NOT EXISTS merge_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.cuentas
    ADD COLUMN IF NOT EXISTS archived_at timestamptz,
    ADD COLUMN IF NOT EXISTS merged_into_cuenta_id uuid,
    ADD COLUMN IF NOT EXISTS merge_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.personas
    DROP CONSTRAINT IF EXISTS personas_estado_chk;

ALTER TABLE public.personas
    ADD CONSTRAINT personas_estado_chk
    CHECK (estado = ANY (ARRAY['lead'::text, 'activo'::text, 'inactivo'::text, 'bloqueado'::text, 'fusionado'::text]));

ALTER TABLE public.personas
    DROP CONSTRAINT IF EXISTS personas_merged_into_persona_id_fkey;

ALTER TABLE public.personas
    ADD CONSTRAINT personas_merged_into_persona_id_fkey
    FOREIGN KEY (merged_into_persona_id)
    REFERENCES public.personas (id)
    ON DELETE SET NULL;

ALTER TABLE public.cuentas
    DROP CONSTRAINT IF EXISTS cuentas_merged_into_cuenta_id_fkey;

ALTER TABLE public.cuentas
    ADD CONSTRAINT cuentas_merged_into_cuenta_id_fkey
    FOREIGN KEY (merged_into_cuenta_id)
    REFERENCES public.cuentas (id)
    ON DELETE SET NULL;

ALTER TABLE public.personas
    ADD CONSTRAINT personas_merge_self_reference_chk
    CHECK (merged_into_persona_id IS NULL OR merged_into_persona_id <> id);

ALTER TABLE public.cuentas
    ADD CONSTRAINT cuentas_merge_self_reference_chk
    CHECK (merged_into_cuenta_id IS NULL OR merged_into_cuenta_id <> id);

CREATE INDEX IF NOT EXISTS personas_archived_at_idx
    ON public.personas (archived_at)
    WHERE archived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS personas_merged_into_persona_id_idx
    ON public.personas (merged_into_persona_id)
    WHERE merged_into_persona_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cuentas_archived_at_idx
    ON public.cuentas (archived_at)
    WHERE archived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS cuentas_merged_into_cuenta_id_idx
    ON public.cuentas (merged_into_cuenta_id)
    WHERE merged_into_cuenta_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tg_personas_merge_archive_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.merged_into_persona_id IS NOT NULL OR NEW.estado = 'fusionado' THEN
        NEW.archived_at := COALESCE(NEW.archived_at, now());
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_personas_merge_archive_state()
    IS 'Marca como archivadas las personas fusionadas y conserva trazabilidad de merge.';

DROP TRIGGER IF EXISTS personas_merge_archive_state ON public.personas;
CREATE TRIGGER personas_merge_archive_state
    BEFORE INSERT OR UPDATE ON public.personas
    FOR EACH ROW EXECUTE FUNCTION public.tg_personas_merge_archive_state();

COMMENT ON COLUMN public.personas.archived_at IS
    'Marca de archivo para personas fusionadas o retiradas del flujo operativo.';

COMMENT ON COLUMN public.personas.merged_into_persona_id IS
    'Apunta a la persona destino cuando este registro se fusiona.';

COMMENT ON COLUMN public.personas.merge_metadata IS
    'Metadatos de trazabilidad del merge de la persona.';

COMMENT ON COLUMN public.cuentas.archived_at IS
    'Marca de archivo para cuentas fusionadas o retiradas del flujo operativo.';

COMMENT ON COLUMN public.cuentas.merged_into_cuenta_id IS
    'Apunta a la cuenta destino cuando este registro se fusiona.';

COMMENT ON COLUMN public.cuentas.merge_metadata IS
    'Metadatos de trazabilidad del merge de la cuenta.';

COMMIT;
