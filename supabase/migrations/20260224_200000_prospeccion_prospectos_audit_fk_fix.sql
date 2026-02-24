-- Fix: deleting prospectos fails because audit trigger writes DELETE rows
-- while prospeccion_prospectos_audit has an FK to prospeccion_prospectos.
-- The FK makes DELETE auditing impossible (23503) for AFTER DELETE trigger inserts.
-- We keep tenant FK and indexes, and drop only the prospecto FK.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'prospeccion_prospectos_audit_prospecto_org_fkey'
      AND conrelid = 'public.prospeccion_prospectos_audit'::regclass
  ) THEN
    ALTER TABLE public.prospeccion_prospectos_audit
      DROP CONSTRAINT prospeccion_prospectos_audit_prospecto_org_fkey;
  END IF;
END;
$$;

