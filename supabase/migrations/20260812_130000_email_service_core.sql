BEGIN;

-- Servicio central de correo: esquema nuevo e independiente.
-- No reutiliza tablas ni columnas JSON del sistema anterior.

CREATE TABLE IF NOT EXISTS public.tenant_email_migrations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'pending',
    feature_enabled boolean NOT NULL DEFAULT false,
    started_at timestamptz,
    domain_verified_at timestamptz,
    first_test_sent_at timestamptz,
    production_enabled_at timestamptz,
    validated_at timestamptz,
    blocked_at timestamptz,
    rollback_at timestamptz,
    last_error_code text,
    last_error_at timestamptz,
    migrated_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tenant_email_migrations_status_check CHECK (
        status IN ('pending', 'configuring', 'domain_verified', 'active', 'blocked', 'validated', 'rolled_back', 'migrated')
    ),
    CONSTRAINT tenant_email_migrations_dates_check CHECK (
        validated_at IS NULL OR production_enabled_at IS NULL OR validated_at >= production_enabled_at
    ),
    CONSTRAINT tenant_email_migrations_rollback_check CHECK (
        rollback_at IS NULL OR status = 'rolled_back'
    ),
    CONSTRAINT tenant_email_migrations_organizacion_unique UNIQUE (organizacion_id)
);

CREATE TABLE IF NOT EXISTS public.tenant_email_domains (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    domain_name text NOT NULL,
    external_domain_id bigint,
    status text NOT NULL DEFAULT 'pending_dns',
    dkim_host text,
    dkim_record_value text,
    return_path_domain text,
    return_path_cname_target text,
    dkim_verified_at timestamptz,
    return_path_verified_at timestamptz,
    verified_at timestamptz,
    blocked_at timestamptz,
    default_from_email text,
    default_from_name text,
    reply_to_email text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tenant_email_domains_status_check CHECK (
        status IN ('pending_dns', 'pending_verification', 'verified', 'blocked', 'removed')
    ),
    CONSTRAINT tenant_email_domains_name_check CHECK (
        domain_name = lower(btrim(domain_name))
        AND position('.' IN domain_name) > 1
        AND position(' ' IN domain_name) = 0
        AND position('@' IN domain_name) = 0
    ),
    CONSTRAINT tenant_email_domains_from_email_check CHECK (
        default_from_email IS NULL OR position('@' IN default_from_email) > 1
    ),
    CONSTRAINT tenant_email_domains_reply_to_check CHECK (
        reply_to_email IS NULL OR position('@' IN reply_to_email) > 1
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_email_domains_org_domain_uidx
    ON public.tenant_email_domains (organizacion_id, lower(domain_name));

CREATE TABLE IF NOT EXISTS public.tenant_email_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    plan_code text NOT NULL,
    status text NOT NULL DEFAULT 'active',
    period_unit text NOT NULL DEFAULT 'month',
    period_limit integer NOT NULL,
    daily_limit integer,
    overage_allowed boolean NOT NULL DEFAULT false,
    starts_at timestamptz NOT NULL DEFAULT now(),
    ends_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tenant_email_plans_status_check CHECK (status IN ('draft', 'active', 'paused', 'expired', 'cancelled')),
    CONSTRAINT tenant_email_plans_period_unit_check CHECK (period_unit IN ('day', 'month')),
    CONSTRAINT tenant_email_plans_period_limit_check CHECK (period_limit >= 0),
    CONSTRAINT tenant_email_plans_daily_limit_check CHECK (daily_limit IS NULL OR daily_limit >= 0),
    CONSTRAINT tenant_email_plans_dates_check CHECK (ends_at IS NULL OR ends_at > starts_at),
    CONSTRAINT tenant_email_plans_org_start_unique UNIQUE (organizacion_id, starts_at)
);

CREATE TABLE IF NOT EXISTS public.tenant_email_usage_periods (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    plan_id uuid NOT NULL REFERENCES public.tenant_email_plans(id) ON DELETE RESTRICT,
    period_start timestamptz NOT NULL,
    period_end timestamptz NOT NULL,
    reserved_recipients integer NOT NULL DEFAULT 0,
    accepted_recipients integer NOT NULL DEFAULT 0,
    failed_recipients integer NOT NULL DEFAULT 0,
    delivered_recipients integer NOT NULL DEFAULT 0,
    bounced_recipients integer NOT NULL DEFAULT 0,
    complained_recipients integer NOT NULL DEFAULT 0,
    released_recipients integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tenant_email_usage_periods_dates_check CHECK (period_end > period_start),
    CONSTRAINT tenant_email_usage_periods_counts_check CHECK (
        reserved_recipients >= 0
        AND accepted_recipients >= 0
        AND failed_recipients >= 0
        AND delivered_recipients >= 0
        AND bounced_recipients >= 0
        AND complained_recipients >= 0
        AND released_recipients >= 0
    ),
    CONSTRAINT tenant_email_usage_periods_unique UNIQUE (organizacion_id, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS public.tenant_email_usage_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    usage_period_id uuid NOT NULL REFERENCES public.tenant_email_usage_periods(id) ON DELETE CASCADE,
    message_id uuid,
    event_type text NOT NULL,
    recipient_count integer NOT NULL,
    reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tenant_email_usage_events_type_check CHECK (
        event_type IN ('reserved', 'released', 'accepted', 'failed', 'delivered', 'bounced', 'complained', 'adjusted')
    ),
    CONSTRAINT tenant_email_usage_events_count_check CHECK (recipient_count > 0)
);

CREATE TABLE IF NOT EXISTS public.tenant_email_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    slug text NOT NULL,
    name text NOT NULL,
    version integer NOT NULL DEFAULT 1,
    message_kind text NOT NULL,
    subject text NOT NULL,
    html_body text,
    text_body text,
    allowed_variables text[] NOT NULL DEFAULT '{}'::text[],
    active boolean NOT NULL DEFAULT true,
    created_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tenant_email_templates_kind_check CHECK (message_kind IN ('transactional', 'broadcast')),
    CONSTRAINT tenant_email_templates_content_check CHECK (html_body IS NOT NULL OR text_body IS NOT NULL),
    CONSTRAINT tenant_email_templates_version_check CHECK (version > 0),
    CONSTRAINT tenant_email_templates_slug_check CHECK (slug = lower(btrim(slug)) AND length(slug) BETWEEN 1 AND 120),
    CONSTRAINT tenant_email_templates_unique UNIQUE (organizacion_id, slug, version)
);

CREATE TABLE IF NOT EXISTS public.tenant_email_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    migration_id uuid NOT NULL REFERENCES public.tenant_email_migrations(id) ON DELETE RESTRICT,
    domain_id uuid NOT NULL REFERENCES public.tenant_email_domains(id) ON DELETE RESTRICT,
    plan_id uuid REFERENCES public.tenant_email_plans(id) ON DELETE SET NULL,
    usage_period_id uuid REFERENCES public.tenant_email_usage_periods(id) ON DELETE SET NULL,
    template_id uuid REFERENCES public.tenant_email_templates(id) ON DELETE SET NULL,
    template_version integer,
    message_kind text NOT NULL,
    stream_name text NOT NULL,
    idempotency_key text NOT NULL,
    external_message_id uuid,
    from_email text NOT NULL,
    from_name text,
    reply_to_email text,
    to_email text NOT NULL,
    subject text NOT NULL,
    status text NOT NULL DEFAULT 'queued',
    attempt_count integer NOT NULL DEFAULT 0,
    max_attempts integer NOT NULL DEFAULT 3,
    queued_at timestamptz NOT NULL DEFAULT now(),
    submitted_at timestamptz,
    delivered_at timestamptz,
    opened_at timestamptz,
    clicked_at timestamptz,
    bounced_at timestamptz,
    complained_at timestamptz,
    failed_at timestamptz,
    cancelled_at timestamptz,
    last_error_code text,
    last_error_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tenant_email_messages_kind_check CHECK (message_kind IN ('transactional', 'broadcast')),
    CONSTRAINT tenant_email_messages_status_check CHECK (
        status IN ('queued', 'submitted', 'delivered', 'failed', 'bounced', 'complained', 'suppressed', 'opened', 'clicked', 'cancelled')
    ),
    CONSTRAINT tenant_email_messages_attempts_check CHECK (attempt_count >= 0 AND max_attempts BETWEEN 0 AND 20),
    CONSTRAINT tenant_email_messages_email_check CHECK (position('@' IN from_email) > 1 AND position('@' IN to_email) > 1),
    CONSTRAINT tenant_email_messages_idempotency_unique UNIQUE (organizacion_id, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_email_messages_external_id_uidx
    ON public.tenant_email_messages (external_message_id)
    WHERE external_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.tenant_email_message_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    message_id uuid NOT NULL REFERENCES public.tenant_email_messages(id) ON DELETE CASCADE,
    attempt_number integer NOT NULL,
    status text NOT NULL,
    external_message_id uuid,
    error_code text,
    error_message text,
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    CONSTRAINT tenant_email_message_attempts_status_check CHECK (status IN ('started', 'accepted', 'failed')),
    CONSTRAINT tenant_email_message_attempts_number_check CHECK (attempt_number > 0),
    CONSTRAINT tenant_email_message_attempts_unique UNIQUE (message_id, attempt_number)
);

CREATE TABLE IF NOT EXISTS public.tenant_email_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    message_id uuid NOT NULL REFERENCES public.tenant_email_messages(id) ON DELETE CASCADE,
    external_message_id uuid,
    event_type text NOT NULL,
    event_status text,
    recipient_email text NOT NULL,
    event_at timestamptz NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    error_code text,
    error_description text,
    bounce_type text,
    source text NOT NULL DEFAULT 'webhook',
    CONSTRAINT tenant_email_events_source_check CHECK (source IN ('webhook', 'polling', 'manual')),
    CONSTRAINT tenant_email_events_unique UNIQUE (message_id, event_type, event_at)
);

CREATE TABLE IF NOT EXISTS public.tenant_email_webhook_receipts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    message_id uuid REFERENCES public.tenant_email_messages(id) ON DELETE SET NULL,
    external_message_id uuid,
    event_type text NOT NULL,
    external_event_id text,
    received_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz,
    processing_status text NOT NULL DEFAULT 'received',
    error_code text,
    CONSTRAINT tenant_email_webhook_receipts_status_check CHECK (processing_status IN ('received', 'processed', 'failed', 'ignored')),
    CONSTRAINT tenant_email_webhook_receipts_unique UNIQUE (external_message_id, event_type, external_event_id)
);

CREATE TABLE IF NOT EXISTS public.tenant_email_suppressions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    email_address text NOT NULL,
    suppression_type text NOT NULL,
    reason text,
    source text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    suppressed_at timestamptz NOT NULL DEFAULT now(),
    reactivated_at timestamptz,
    CONSTRAINT tenant_email_suppressions_type_check CHECK (suppression_type IN ('bounce', 'spam_complaint', 'unsubscribe', 'manual')),
    CONSTRAINT tenant_email_suppressions_source_check CHECK (source IN ('webhook', 'manual', 'imported', 'system')),
    CONSTRAINT tenant_email_suppressions_email_check CHECK (position('@' IN email_address) > 1)
);

-- Claves compuestas para impedir referencias cross-tenant aunque se conozca un UUID.
ALTER TABLE public.tenant_email_migrations
    ADD CONSTRAINT tenant_email_migrations_org_id_unique UNIQUE (organizacion_id, id);
ALTER TABLE public.tenant_email_domains
    ADD CONSTRAINT tenant_email_domains_org_id_unique UNIQUE (organizacion_id, id);
ALTER TABLE public.tenant_email_plans
    ADD CONSTRAINT tenant_email_plans_org_id_unique UNIQUE (organizacion_id, id);
ALTER TABLE public.tenant_email_usage_periods
    ADD CONSTRAINT tenant_email_usage_periods_org_id_unique UNIQUE (organizacion_id, id);
ALTER TABLE public.tenant_email_templates
    ADD CONSTRAINT tenant_email_templates_org_id_unique UNIQUE (organizacion_id, id);
ALTER TABLE public.tenant_email_messages
    ADD CONSTRAINT tenant_email_messages_org_id_unique UNIQUE (organizacion_id, id);

ALTER TABLE public.tenant_email_messages
    ADD CONSTRAINT tenant_email_messages_migration_org_fkey
        FOREIGN KEY (organizacion_id, migration_id)
        REFERENCES public.tenant_email_migrations (organizacion_id, id)
        ON DELETE RESTRICT,
    ADD CONSTRAINT tenant_email_messages_domain_org_fkey
        FOREIGN KEY (organizacion_id, domain_id)
        REFERENCES public.tenant_email_domains (organizacion_id, id)
        ON DELETE RESTRICT,
    ADD CONSTRAINT tenant_email_messages_plan_org_fkey
        FOREIGN KEY (organizacion_id, plan_id)
        REFERENCES public.tenant_email_plans (organizacion_id, id)
        ON DELETE SET NULL,
    ADD CONSTRAINT tenant_email_messages_usage_org_fkey
        FOREIGN KEY (organizacion_id, usage_period_id)
        REFERENCES public.tenant_email_usage_periods (organizacion_id, id)
        ON DELETE SET NULL,
    ADD CONSTRAINT tenant_email_messages_template_org_fkey
        FOREIGN KEY (organizacion_id, template_id)
        REFERENCES public.tenant_email_templates (organizacion_id, id)
        ON DELETE SET NULL;

ALTER TABLE public.tenant_email_usage_events
    ADD CONSTRAINT tenant_email_usage_events_message_org_fkey
        FOREIGN KEY (organizacion_id, message_id)
        REFERENCES public.tenant_email_messages (organizacion_id, id)
        ON DELETE SET NULL;

ALTER TABLE public.tenant_email_usage_periods
    ADD CONSTRAINT tenant_email_usage_periods_plan_org_fkey
        FOREIGN KEY (organizacion_id, plan_id)
        REFERENCES public.tenant_email_plans (organizacion_id, id)
        ON DELETE RESTRICT;

ALTER TABLE public.tenant_email_usage_events
    ADD CONSTRAINT tenant_email_usage_events_period_org_fkey
        FOREIGN KEY (organizacion_id, usage_period_id)
        REFERENCES public.tenant_email_usage_periods (organizacion_id, id)
        ON DELETE CASCADE;

ALTER TABLE public.tenant_email_message_attempts
    ADD CONSTRAINT tenant_email_message_attempts_message_org_fkey
        FOREIGN KEY (organizacion_id, message_id)
        REFERENCES public.tenant_email_messages (organizacion_id, id)
        ON DELETE CASCADE;

ALTER TABLE public.tenant_email_events
    ADD CONSTRAINT tenant_email_events_message_org_fkey
        FOREIGN KEY (organizacion_id, message_id)
        REFERENCES public.tenant_email_messages (organizacion_id, id)
        ON DELETE CASCADE;

ALTER TABLE public.tenant_email_webhook_receipts
    ADD CONSTRAINT tenant_email_webhook_receipts_message_org_fkey
        FOREIGN KEY (organizacion_id, message_id)
        REFERENCES public.tenant_email_messages (organizacion_id, id)
        ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_email_suppressions_active_uidx
    ON public.tenant_email_suppressions (organizacion_id, lower(email_address), suppression_type)
    WHERE active;

CREATE INDEX IF NOT EXISTS tenant_email_migrations_status_idx
    ON public.tenant_email_migrations (organizacion_id, status, feature_enabled);
CREATE INDEX IF NOT EXISTS tenant_email_domains_status_idx
    ON public.tenant_email_domains (organizacion_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS tenant_email_plans_status_idx
    ON public.tenant_email_plans (organizacion_id, status, starts_at DESC);
CREATE INDEX IF NOT EXISTS tenant_email_usage_periods_lookup_idx
    ON public.tenant_email_usage_periods (organizacion_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS tenant_email_usage_events_period_idx
    ON public.tenant_email_usage_events (organizacion_id, usage_period_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tenant_email_usage_events_message_idx
    ON public.tenant_email_usage_events (organizacion_id, message_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tenant_email_messages_queue_idx
    ON public.tenant_email_messages (organizacion_id, status, queued_at);
CREATE INDEX IF NOT EXISTS tenant_email_messages_campaign_lookup_idx
    ON public.tenant_email_messages (organizacion_id, message_kind, created_at DESC);
CREATE INDEX IF NOT EXISTS tenant_email_message_attempts_message_idx
    ON public.tenant_email_message_attempts (organizacion_id, message_id, attempt_number DESC);
CREATE INDEX IF NOT EXISTS tenant_email_events_message_idx
    ON public.tenant_email_events (organizacion_id, message_id, event_at DESC);
CREATE INDEX IF NOT EXISTS tenant_email_webhook_receipts_processing_idx
    ON public.tenant_email_webhook_receipts (processing_status, received_at);
CREATE INDEX IF NOT EXISTS tenant_email_suppressions_lookup_idx
    ON public.tenant_email_suppressions (organizacion_id, lower(email_address), active);

DO $$
DECLARE
    table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'tenant_email_migrations',
        'tenant_email_domains',
        'tenant_email_plans',
        'tenant_email_usage_periods',
        'tenant_email_usage_events',
        'tenant_email_templates',
        'tenant_email_messages',
        'tenant_email_message_attempts',
        'tenant_email_events',
        'tenant_email_webhook_receipts',
        'tenant_email_suppressions'
    ] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
        EXECUTE format('REVOKE ALL ON public.%I FROM anon', table_name);
        EXECUTE format('GRANT SELECT ON public.%I TO authenticated', table_name);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', table_name);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())))',
            table_name || '_member_select', table_name
        );
    END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS tenant_email_migrations_touch_updated_at ON public.tenant_email_migrations;
CREATE TRIGGER tenant_email_migrations_touch_updated_at
    BEFORE UPDATE ON public.tenant_email_migrations
    FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

DROP TRIGGER IF EXISTS tenant_email_domains_touch_updated_at ON public.tenant_email_domains;
CREATE TRIGGER tenant_email_domains_touch_updated_at
    BEFORE UPDATE ON public.tenant_email_domains
    FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

DROP TRIGGER IF EXISTS tenant_email_plans_touch_updated_at ON public.tenant_email_plans;
CREATE TRIGGER tenant_email_plans_touch_updated_at
    BEFORE UPDATE ON public.tenant_email_plans
    FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

DROP TRIGGER IF EXISTS tenant_email_usage_periods_touch_updated_at ON public.tenant_email_usage_periods;
CREATE TRIGGER tenant_email_usage_periods_touch_updated_at
    BEFORE UPDATE ON public.tenant_email_usage_periods
    FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

DROP TRIGGER IF EXISTS tenant_email_templates_touch_updated_at ON public.tenant_email_templates;
CREATE TRIGGER tenant_email_templates_touch_updated_at
    BEFORE UPDATE ON public.tenant_email_templates
    FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

DROP TRIGGER IF EXISTS tenant_email_messages_touch_updated_at ON public.tenant_email_messages;
CREATE TRIGGER tenant_email_messages_touch_updated_at
    BEFORE UPDATE ON public.tenant_email_messages
    FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- El tenant maestro es el único que se habilita inicialmente.
INSERT INTO public.tenant_email_migrations (organizacion_id, status, feature_enabled)
VALUES ('00000000-0000-0000-0000-000000000001', 'pending', false)
ON CONFLICT (organizacion_id) DO NOTHING;

COMMENT ON TABLE public.tenant_email_migrations IS 'Estado de migracion del servicio central de correo por tenant.';
COMMENT ON TABLE public.tenant_email_domains IS 'Dominios y remitentes autorizados por tenant.';
COMMENT ON TABLE public.tenant_email_plans IS 'Planes y limites de correo por tenant.';
COMMENT ON TABLE public.tenant_email_usage_periods IS 'Contadores de cuota por tenant y periodo.';
COMMENT ON TABLE public.tenant_email_usage_events IS 'Ledger inmutable de reservas, liberaciones y consumo de cuota.';
COMMENT ON TABLE public.tenant_email_templates IS 'Catalogo propio de plantillas del servicio central de correo.';
COMMENT ON TABLE public.tenant_email_messages IS 'Un registro por destinatario y mensaje enviado.';
COMMENT ON TABLE public.tenant_email_events IS 'Eventos normalizados de entrega y engagement.';
COMMENT ON TABLE public.tenant_email_webhook_receipts IS 'Recepciones idempotentes de webhooks del servicio de correo.';
COMMENT ON TABLE public.tenant_email_suppressions IS 'Destinatarios bloqueados por rebote, queja, baja o accion manual.';

COMMIT;
