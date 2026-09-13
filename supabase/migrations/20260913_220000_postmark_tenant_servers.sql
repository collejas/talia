BEGIN;

-- Un servidor Postmark por tenant. El token nunca se almacena aquí: solo se
-- guarda la referencia a la clave cifrada en public.secretos.
CREATE TABLE IF NOT EXISTS public.tenant_email_servers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    postmark_server_id bigint,
    server_name text NOT NULL,
    server_status text NOT NULL DEFAULT 'pending',
    transactional_stream text NOT NULL DEFAULT 'outbound',
    broadcast_stream text NOT NULL DEFAULT 'broadcast',
    inbound_stream text NOT NULL DEFAULT 'inbound',
    server_token_secret_key text NOT NULL DEFAULT 'postmark.server_token',
    provisioning_error_code text,
    provisioning_error_message text,
    provisioned_at timestamptz,
    retired_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tenant_email_servers_status_check CHECK (
        server_status IN ('pending', 'provisioning', 'active', 'blocked', 'failed', 'retired')
    ),
    CONSTRAINT tenant_email_servers_name_check CHECK (length(btrim(server_name)) BETWEEN 1 AND 120),
    CONSTRAINT tenant_email_servers_secret_key_check CHECK (server_token_secret_key = lower(btrim(server_token_secret_key))),
    CONSTRAINT tenant_email_servers_org_unique UNIQUE (organizacion_id),
    CONSTRAINT tenant_email_servers_external_unique UNIQUE (postmark_server_id)
);

ALTER TABLE public.tenant_email_domains
    ADD COLUMN IF NOT EXISTS server_id uuid;
ALTER TABLE public.tenant_email_messages
    ADD COLUMN IF NOT EXISTS server_id uuid;

ALTER TABLE public.tenant_email_domains
    DROP CONSTRAINT IF EXISTS tenant_email_domains_server_fkey;
ALTER TABLE public.tenant_email_domains
    ADD CONSTRAINT tenant_email_domains_server_fkey
    FOREIGN KEY (server_id) REFERENCES public.tenant_email_servers(id) ON DELETE RESTRICT;

ALTER TABLE public.tenant_email_messages
    DROP CONSTRAINT IF EXISTS tenant_email_messages_server_fkey;
ALTER TABLE public.tenant_email_messages
    ADD CONSTRAINT tenant_email_messages_server_fkey
    FOREIGN KEY (server_id) REFERENCES public.tenant_email_servers(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_email_servers_org_active_uidx
    ON public.tenant_email_servers (organizacion_id)
    WHERE server_status IN ('pending', 'provisioning', 'active', 'blocked', 'failed');
CREATE INDEX IF NOT EXISTS tenant_email_servers_status_idx
    ON public.tenant_email_servers (server_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS tenant_email_domains_server_idx
    ON public.tenant_email_domains (server_id, status);
CREATE INDEX IF NOT EXISTS tenant_email_messages_server_idx
    ON public.tenant_email_messages (server_id, created_at DESC);

ALTER TABLE public.tenant_email_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_email_servers FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_email_servers FROM anon;
GRANT SELECT ON public.tenant_email_servers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_email_servers TO service_role;
DROP POLICY IF EXISTS tenant_email_servers_member_select ON public.tenant_email_servers;
CREATE POLICY tenant_email_servers_member_select ON public.tenant_email_servers
    FOR SELECT TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));

DROP TRIGGER IF EXISTS tenant_email_servers_touch_updated_at ON public.tenant_email_servers;
CREATE TRIGGER tenant_email_servers_touch_updated_at
    BEFORE UPDATE ON public.tenant_email_servers
    FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- Las altas nuevas quedan listas para que el backend llame a Postmark. La
-- provisión externa es deliberadamente responsabilidad del servicio, no de SQL.
CREATE OR REPLACE FUNCTION public.tg_provision_tenant_email_service()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_period_start timestamptz := date_trunc('month', now());
    v_period_end timestamptz := date_trunc('month', now()) + interval '1 month';
    v_plan_id uuid;
BEGIN
    INSERT INTO public.tenant_email_servers (organizacion_id, server_name)
    VALUES (NEW.id, left('Talia - ' || coalesce(nullif(btrim(NEW.nombre), ''), NEW.id::text), 120))
    ON CONFLICT (organizacion_id) DO NOTHING;

    INSERT INTO public.tenant_email_migrations (organizacion_id, status, feature_enabled)
    VALUES (NEW.id, 'pending', false)
    ON CONFLICT (organizacion_id) DO NOTHING;

    INSERT INTO public.tenant_email_plans (
        organizacion_id, plan_code, status, period_unit, period_limit,
        daily_limit, overage_allowed, starts_at
    ) VALUES (
        NEW.id, 'included_10000', 'active', 'month', 10000,
        NULL, false, v_period_start
    ) ON CONFLICT (organizacion_id, starts_at) DO NOTHING;

    SELECT id INTO v_plan_id
    FROM public.tenant_email_plans
    WHERE organizacion_id = NEW.id AND starts_at = v_period_start
    LIMIT 1;
    IF v_plan_id IS NULL THEN
        RAISE EXCEPTION 'tenant_email_plan_provision_failed:%', NEW.id;
    END IF;

    INSERT INTO public.tenant_email_usage_periods (
        organizacion_id, plan_id, period_start, period_end
    ) VALUES (NEW.id, v_plan_id, v_period_start, v_period_end)
    ON CONFLICT (organizacion_id, period_start, period_end) DO NOTHING;
    RETURN NEW;
END;
$function$;

-- Compatibilidad para tenants existentes: crea únicamente la ficha interna
-- pendiente. El backend debe reconciliarla con un servidor externo antes de
-- activar envíos.
INSERT INTO public.tenant_email_servers (organizacion_id, server_name)
SELECT o.id, left('Talia - ' || coalesce(nullif(btrim(o.nombre), ''), o.id::text), 120)
FROM public.organizaciones AS o
ON CONFLICT (organizacion_id) DO NOTHING;

-- Si el dominio ya tiene servidor asignado, el mensaje conserva esa misma
-- referencia aun cuando la cola se escriba mediante la RPC existente.
CREATE OR REPLACE FUNCTION public.tg_set_tenant_email_message_server()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
    IF NEW.server_id IS NULL THEN
        SELECT d.server_id INTO NEW.server_id
        FROM public.tenant_email_domains AS d
        WHERE d.id = NEW.domain_id AND d.organizacion_id = NEW.organizacion_id;
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tenant_email_messages_set_server ON public.tenant_email_messages;
CREATE TRIGGER tenant_email_messages_set_server
    BEFORE INSERT ON public.tenant_email_messages
    FOR EACH ROW EXECUTE FUNCTION public.tg_set_tenant_email_message_server();

COMMENT ON TABLE public.tenant_email_servers IS
    'Servidor Postmark aislado por tenant; el token vive cifrado en public.secretos.';
COMMENT ON COLUMN public.tenant_email_servers.server_token_secret_key IS
    'Clave lógica de public.secretos; nunca contiene el token del proveedor.';

COMMIT;
