BEGIN;

-- ============================================================================
-- Invitaciones de acceso y verificacion de correo para alta de tenant
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tenant_access_invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    email text NOT NULL,
    flow_kind text NOT NULL,
    status text NOT NULL,
    verification_token_hash text NOT NULL,
    verification_sent_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    verified_at timestamptz,
    invited_at timestamptz,
    invited_user_id uuid,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tenant_access_invitations_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    CONSTRAINT tenant_access_invitations_verification_token_uidx UNIQUE (verification_token_hash),
    CONSTRAINT tenant_access_invitations_email_not_empty_chk CHECK (length(btrim(email)) > 0),
    CONSTRAINT tenant_access_invitations_flow_kind_chk CHECK (flow_kind IN ('admin', 'stripe', 'public_signup')),
    CONSTRAINT tenant_access_invitations_status_chk CHECK (
        status IN ('pending_verification', 'email_verified', 'invite_sent', 'completed', 'failed', 'expired')
    ),
    CONSTRAINT tenant_access_invitations_token_hash_not_empty_chk CHECK (length(btrim(verification_token_hash)) > 0)
);

COMMENT ON TABLE public.tenant_access_invitations IS 'Estado intermedio de verificacion de correo e invitacion de acceso por tenant.';
COMMENT ON COLUMN public.tenant_access_invitations.flow_kind IS 'Origen del flujo: admin, stripe o public_signup.';
COMMENT ON COLUMN public.tenant_access_invitations.status IS 'Estado del onboarding de acceso.';
COMMENT ON COLUMN public.tenant_access_invitations.verification_token_hash IS 'Hash del token de verificacion de correo.';
COMMENT ON COLUMN public.tenant_access_invitations.expires_at IS 'Fecha limite para usar el token de verificacion.';

CREATE INDEX IF NOT EXISTS tenant_access_invitations_tenant_status_idx
    ON public.tenant_access_invitations (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS tenant_access_invitations_email_idx
    ON public.tenant_access_invitations (email);

DROP TRIGGER IF EXISTS tenant_access_invitations_touch_updated_at ON public.tenant_access_invitations;
CREATE TRIGGER tenant_access_invitations_touch_updated_at
    BEFORE UPDATE ON public.tenant_access_invitations
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

DO $$
DECLARE
    policy_name text := 'tenant_access_invitations_service_role_all';
BEGIN
    EXECUTE 'ALTER TABLE public.tenant_access_invitations ENABLE ROW LEVEL SECURITY';
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.tenant_access_invitations', policy_name);
    EXECUTE format(
        'CREATE POLICY %I ON public.tenant_access_invitations FOR ALL TO service_role USING (true) WITH CHECK (true)',
        policy_name
    );
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenant_access_invitations TO service_role';
END
$$;

COMMIT;
