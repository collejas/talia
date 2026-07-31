BEGIN;

-- La calidad del lote la decide cada usuario mediante los filtros DENUE.
-- La política persistida queda como una protección técnica única: cualquier
-- registro guardado debe tener al menos correo o teléfono.
UPDATE public.tenant_prospeccion_policies
SET required_contact_mode = 'any',
    effective_from = clock_timestamp(),
    updated_at = clock_timestamp()
WHERE required_contact_mode <> 'any';

ALTER TABLE public.tenant_prospeccion_policies
    DROP CONSTRAINT tenant_prospeccion_policies_contact_mode_chk;
ALTER TABLE public.tenant_prospeccion_policies
    ADD CONSTRAINT tenant_prospeccion_policies_contact_mode_chk
    CHECK (required_contact_mode = 'any');

COMMENT ON COLUMN public.tenant_prospeccion_policies.required_contact_mode IS
    'Proteccion tecnica fija: correo o telefono. La calidad del lote la define el usuario con filtros DENUE.';

COMMIT;
