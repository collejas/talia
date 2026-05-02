BEGIN;

DROP INDEX IF EXISTS public.prospeccion_prospectos_org_phone_e164_unique;

CREATE UNIQUE INDEX IF NOT EXISTS prospeccion_prospectos_org_phone_e164_unique
    ON public.prospeccion_prospectos (organizacion_id, phone_e164)
    WHERE phone_e164 IS NOT NULL
      AND btrim(phone_e164) <> ''
      AND (email IS NULL OR btrim(email) = '');

COMMIT;
