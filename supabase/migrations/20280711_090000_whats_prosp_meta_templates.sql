-- Whats-Prosp: cortar dependencia de Twilio en prospección y preparar plantillas Meta nativas en BD.
-- Esta migración solo agrega estructura explícita. No migra todavía datos legacy desde metadata/config.

-- 1. Normalizar plantillas de prospección para soportar Whats-Prosp Meta-only
ALTER TABLE public.prospeccion_contacto_templates
    ADD COLUMN IF NOT EXISTS provider text,
    ADD COLUMN IF NOT EXISTS usage_scope text,
    ADD COLUMN IF NOT EXISTS template_name text,
    ADD COLUMN IF NOT EXISTS language_code text,
    ADD COLUMN IF NOT EXISTS meta_category text,
    ADD COLUMN IF NOT EXISTS template_status text;

CREATE UNIQUE INDEX IF NOT EXISTS prospeccion_contacto_templates_org_id_key
    ON public.prospeccion_contacto_templates (organizacion_id, id);

ALTER TABLE public.prospeccion_contacto_templates
    DROP CONSTRAINT IF EXISTS prospeccion_contacto_templates_provider_check;

ALTER TABLE public.prospeccion_contacto_templates
    ADD CONSTRAINT prospeccion_contacto_templates_provider_check
    CHECK (
        provider IS NULL
        OR provider IN ('meta')
    );

ALTER TABLE public.prospeccion_contacto_templates
    DROP CONSTRAINT IF EXISTS prospeccion_contacto_templates_usage_scope_check;

ALTER TABLE public.prospeccion_contacto_templates
    ADD CONSTRAINT prospeccion_contacto_templates_usage_scope_check
    CHECK (
        usage_scope IS NULL
        OR usage_scope IN ('whats_prosp')
    );

ALTER TABLE public.prospeccion_contacto_templates
    DROP CONSTRAINT IF EXISTS prospeccion_contacto_templates_meta_category_check;

ALTER TABLE public.prospeccion_contacto_templates
    ADD CONSTRAINT prospeccion_contacto_templates_meta_category_check
    CHECK (
        meta_category IS NULL
        OR meta_category IN ('marketing', 'utility', 'authentication')
    );

ALTER TABLE public.prospeccion_contacto_templates
    DROP CONSTRAINT IF EXISTS prospeccion_contacto_templates_template_status_check;

ALTER TABLE public.prospeccion_contacto_templates
    ADD CONSTRAINT prospeccion_contacto_templates_template_status_check
    CHECK (
        template_status IS NULL
        OR template_status IN ('draft', 'approved', 'rejected', 'archived')
    );

ALTER TABLE public.prospeccion_contacto_templates
    DROP CONSTRAINT IF EXISTS prospeccion_contacto_templates_whats_prosp_meta_check;

ALTER TABLE public.prospeccion_contacto_templates
    ADD CONSTRAINT prospeccion_contacto_templates_whats_prosp_meta_check
    CHECK (
        canal <> 'whatsapp'
        OR usage_scope IS DISTINCT FROM 'whats_prosp'
        OR (
            provider = 'meta'
            AND template_name IS NOT NULL
            AND btrim(template_name) <> ''
            AND language_code IS NOT NULL
            AND btrim(language_code) <> ''
            AND meta_category IS NOT NULL
            AND btrim(meta_category) <> ''
        )
    );

CREATE UNIQUE INDEX IF NOT EXISTS prospeccion_contacto_templates_whats_prosp_meta_unique
    ON public.prospeccion_contacto_templates (
        organizacion_id,
        canal,
        usage_scope,
        lower(template_name),
        lower(language_code)
    )
    WHERE canal = 'whatsapp'
      AND usage_scope = 'whats_prosp'
      AND provider = 'meta'
      AND template_name IS NOT NULL
      AND language_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS prospeccion_contacto_templates_org_canal_scope_idx
    ON public.prospeccion_contacto_templates (organizacion_id, canal, usage_scope, activo);

CREATE INDEX IF NOT EXISTS prospeccion_contacto_templates_org_meta_category_idx
    ON public.prospeccion_contacto_templates (organizacion_id, meta_category, activo)
    WHERE canal = 'whatsapp' AND usage_scope = 'whats_prosp';

CREATE INDEX IF NOT EXISTS prospeccion_contacto_templates_org_template_status_idx
    ON public.prospeccion_contacto_templates (organizacion_id, template_status, activo)
    WHERE canal = 'whatsapp' AND usage_scope = 'whats_prosp';

COMMENT ON COLUMN public.prospeccion_contacto_templates.provider IS
    'Proveedor operativo de la plantilla. En Whats-Prosp esta fase solo permite Meta.';
COMMENT ON COLUMN public.prospeccion_contacto_templates.usage_scope IS
    'Alcance funcional de la plantilla dentro del producto. Para esta fase: whats_prosp.';
COMMENT ON COLUMN public.prospeccion_contacto_templates.template_name IS
    'Nombre oficial de plantilla Meta usado por Whats-Prosp.';
COMMENT ON COLUMN public.prospeccion_contacto_templates.language_code IS
    'Idioma oficial de plantilla Meta, por ejemplo es_MX.';
COMMENT ON COLUMN public.prospeccion_contacto_templates.meta_category IS
    'Categoria oficial de Meta: marketing, utility o authentication.';
COMMENT ON COLUMN public.prospeccion_contacto_templates.template_status IS
    'Estado operativo/aprobación de la plantilla en el flujo interno.';

-- 2. Relación canónica y snapshot en batch para Whats-Prosp
ALTER TABLE public.prospeccion_contacto_batch
    ADD COLUMN IF NOT EXISTS whatsapp_template_id uuid,
    ADD COLUMN IF NOT EXISTS whatsapp_template_name_snapshot text,
    ADD COLUMN IF NOT EXISTS whatsapp_language_code_snapshot text,
    ADD COLUMN IF NOT EXISTS whatsapp_meta_category_snapshot text,
    ADD COLUMN IF NOT EXISTS whatsapp_template_display_name_snapshot text;

ALTER TABLE public.prospeccion_contacto_batch
    DROP CONSTRAINT IF EXISTS prospeccion_contacto_batch_whatsapp_template_org_fkey;

ALTER TABLE public.prospeccion_contacto_batch
    ADD CONSTRAINT prospeccion_contacto_batch_whatsapp_template_org_fkey
    FOREIGN KEY (organizacion_id, whatsapp_template_id)
    REFERENCES public.prospeccion_contacto_templates (organizacion_id, id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS prospeccion_contacto_batch_org_whatsapp_template_idx
    ON public.prospeccion_contacto_batch (organizacion_id, whatsapp_template_id, creado_en DESC)
    WHERE whatsapp_template_id IS NOT NULL;

COMMENT ON COLUMN public.prospeccion_contacto_batch.whatsapp_template_id IS
    'Referencia canónica a la plantilla Meta seleccionada para Whats-Prosp.';
COMMENT ON COLUMN public.prospeccion_contacto_batch.whatsapp_template_name_snapshot IS
    'Snapshot del template_name Meta usado al crear el batch.';
COMMENT ON COLUMN public.prospeccion_contacto_batch.whatsapp_language_code_snapshot IS
    'Snapshot del language_code Meta usado al crear el batch.';
COMMENT ON COLUMN public.prospeccion_contacto_batch.whatsapp_meta_category_snapshot IS
    'Snapshot de la categoría Meta usada al crear el batch.';
COMMENT ON COLUMN public.prospeccion_contacto_batch.whatsapp_template_display_name_snapshot IS
    'Snapshot del nombre visible de la plantilla usada al crear el batch.';

-- 3. Relación canónica y snapshot en envío para trazabilidad histórica
ALTER TABLE public.prospeccion_contacto_envio
    ADD COLUMN IF NOT EXISTS whatsapp_template_id uuid,
    ADD COLUMN IF NOT EXISTS whatsapp_template_name_snapshot text,
    ADD COLUMN IF NOT EXISTS whatsapp_language_code_snapshot text,
    ADD COLUMN IF NOT EXISTS whatsapp_meta_category_snapshot text,
    ADD COLUMN IF NOT EXISTS whatsapp_template_display_name_snapshot text;

ALTER TABLE public.prospeccion_contacto_envio
    DROP CONSTRAINT IF EXISTS prospeccion_contacto_envio_whatsapp_template_org_fkey;

ALTER TABLE public.prospeccion_contacto_envio
    ADD CONSTRAINT prospeccion_contacto_envio_whatsapp_template_org_fkey
    FOREIGN KEY (organizacion_id, whatsapp_template_id)
    REFERENCES public.prospeccion_contacto_templates (organizacion_id, id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS prospeccion_contacto_envio_org_whatsapp_template_idx
    ON public.prospeccion_contacto_envio (organizacion_id, whatsapp_template_id, creado_en DESC)
    WHERE canal = 'whatsapp' AND whatsapp_template_id IS NOT NULL;

COMMENT ON COLUMN public.prospeccion_contacto_envio.whatsapp_template_id IS
    'Referencia canónica a la plantilla Meta usada por el envío de Whats-Prosp.';
COMMENT ON COLUMN public.prospeccion_contacto_envio.whatsapp_template_name_snapshot IS
    'Snapshot del template_name Meta usado en el envío.';
COMMENT ON COLUMN public.prospeccion_contacto_envio.whatsapp_language_code_snapshot IS
    'Snapshot del language_code Meta usado en el envío.';
COMMENT ON COLUMN public.prospeccion_contacto_envio.whatsapp_meta_category_snapshot IS
    'Snapshot de la categoría Meta usada en el envío.';
COMMENT ON COLUMN public.prospeccion_contacto_envio.whatsapp_template_display_name_snapshot IS
    'Snapshot del nombre visible de la plantilla usada en el envío.';
