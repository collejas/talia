BEGIN;

CREATE TABLE IF NOT EXISTS public.cliente_portal_tokens (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    token text NOT NULL UNIQUE,
    expira_en timestamptz,
    ultimo_acceso_en timestamptz,
    ultimo_acceso_ip inet,
    usos integer NOT NULL DEFAULT 0,
    revocado boolean NOT NULL DEFAULT false,
    nota text,
    creado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cliente_portal_tokens IS 'Tokens firmados para que los clientes completen su onboarding en un portal dedicado.';
COMMENT ON COLUMN public.cliente_portal_tokens.token IS 'Se comparte una sola vez; funciona como llave del portal.';
COMMENT ON COLUMN public.cliente_portal_tokens.expira_en IS 'Fecha límite para reutilizar el enlace.';
COMMENT ON COLUMN public.cliente_portal_tokens.ultimo_acceso_ip IS 'IP más reciente registrada al abrir el portal.';

CREATE INDEX IF NOT EXISTS cliente_portal_tokens_cliente_idx ON public.cliente_portal_tokens (cliente_id);
CREATE INDEX IF NOT EXISTS cliente_portal_tokens_expira_idx ON public.cliente_portal_tokens (expira_en) WHERE revocado = false;
CREATE INDEX IF NOT EXISTS cliente_portal_tokens_token_idx ON public.cliente_portal_tokens (token);

ALTER TABLE public.cliente_portal_tokens REPLICA IDENTITY FULL;

DROP TRIGGER IF EXISTS cliente_portal_tokens_touch_updated_at ON public.cliente_portal_tokens;
CREATE TRIGGER cliente_portal_tokens_touch_updated_at
    BEFORE UPDATE ON public.cliente_portal_tokens
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

ALTER TABLE public.cliente_portal_tokens ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cliente_portal_tokens TO postgres, service_role;
GRANT SELECT ON public.cliente_portal_tokens TO authenticated;

DROP POLICY IF EXISTS cliente_portal_tokens_admin_all ON public.cliente_portal_tokens;
CREATE POLICY cliente_portal_tokens_admin_all ON public.cliente_portal_tokens
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1
              FROM public.clientes c
             WHERE c.id = cliente_id
               AND public.puede_ver_lead(c.lead_tarjeta_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
              FROM public.clientes c
             WHERE c.id = cliente_id
               AND public.puede_ver_lead(c.lead_tarjeta_id)
        )
    );

COMMIT;
