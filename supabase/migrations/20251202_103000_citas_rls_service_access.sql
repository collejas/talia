BEGIN;

-- ============================================================================
-- Habilitar acceso de service_role para operaciones programáticas (workers/webhooks)
-- ============================================================================

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.citas TO service_role;

-- Mantener la lógica RLS: se requiere una política explícita para service_role.
DROP POLICY IF EXISTS citas_service_manage ON public.citas;
CREATE POLICY citas_service_manage
    ON public.citas
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

COMMENT ON POLICY citas_service_manage ON public.citas IS
    'Permite a service_role (workers / integraciones internas) gestionar citas sin restricciones adicionales.';

COMMIT;
