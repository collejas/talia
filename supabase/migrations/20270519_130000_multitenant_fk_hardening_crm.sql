BEGIN;

-- Endurecimiento adicional: muchas tablas ya tienen `organizacion_id`, pero aún tenían FKs a `(id)` sin tenant.
-- Esto evita referencias cross-tenant incluso con service-role o bugs de aplicación.

-- 1) Índices únicos necesarios para FKs compuestas (organizacion_id, id)
CREATE UNIQUE INDEX IF NOT EXISTS cuentas_org_id_id_key ON public.cuentas (organizacion_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS oportunidades_org_id_id_key ON public.oportunidades (organizacion_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS clientes_org_id_id_key ON public.clientes (organizacion_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS tickets_org_id_id_key ON public.tickets (organizacion_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS tags_org_id_id_key ON public.tags (organizacion_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS etapas_pipeline_org_id_id_key ON public.etapas_pipeline (organizacion_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS campanas_org_id_id_key ON public.campanas (organizacion_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS busquedas_org_id_id_key ON public.busquedas (organizacion_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS resultados_org_id_id_key ON public.resultados (organizacion_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS prompt_versions_org_id_id_key ON public.prompt_versions (organizacion_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS prospeccion_buscador_jobs_org_id_id_key
    ON public.prospeccion_buscador_jobs (organizacion_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS prospeccion_contacto_listas_org_id_id_key
    ON public.prospeccion_contacto_listas (organizacion_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS prospeccion_contacto_batch_org_id_id_key
    ON public.prospeccion_contacto_batch (organizacion_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS prospeccion_contacto_envio_org_id_id_key
    ON public.prospeccion_contacto_envio (organizacion_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS prospeccion_prospectos_org_id_id_key
    ON public.prospeccion_prospectos (organizacion_id, id);

-- 2) CRM / Tickets: reemplazo de FKs simples por compuestas

-- contactos
ALTER TABLE public.contactos DROP CONSTRAINT IF EXISTS contactos_cuenta_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='contactos_cuenta_org_fkey'
    ) THEN
        ALTER TABLE public.contactos
            ADD CONSTRAINT contactos_cuenta_org_fkey
            FOREIGN KEY (organizacion_id, cuenta_id)
            REFERENCES public.cuentas (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

ALTER TABLE public.contactos DROP CONSTRAINT IF EXISTS contacts_owner_user_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='contactos_propietario_usuario_org_fkey'
    ) THEN
        ALTER TABLE public.contactos
            ADD CONSTRAINT contactos_propietario_usuario_org_fkey
            FOREIGN KEY (organizacion_id, propietario_usuario_id)
            REFERENCES public.usuarios (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

-- cuentas
ALTER TABLE public.cuentas DROP CONSTRAINT IF EXISTS cuentas_propietario_usuario_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace='public'::regnamespace
          AND conname='cuentas_propietario_usuario_org_fkey'
    ) THEN
        ALTER TABLE public.cuentas
            ADD CONSTRAINT cuentas_propietario_usuario_org_fkey
            FOREIGN KEY (organizacion_id, propietario_usuario_id)
            REFERENCES public.usuarios (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

-- oportunidades
ALTER TABLE public.oportunidades DROP CONSTRAINT IF EXISTS oportunidades_propietario_usuario_id_fkey;
ALTER TABLE public.oportunidades DROP CONSTRAINT IF EXISTS oportunidades_asignado_a_usuario_id_fkey;
ALTER TABLE public.oportunidades DROP CONSTRAINT IF EXISTS oportunidades_contacto_principal_id_fkey;
ALTER TABLE public.oportunidades DROP CONSTRAINT IF EXISTS oportunidades_cuenta_id_fkey;
ALTER TABLE public.oportunidades DROP CONSTRAINT IF EXISTS oportunidades_etapa_id_fkey;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='oportunidades_propietario_usuario_org_fkey') THEN
        ALTER TABLE public.oportunidades
            ADD CONSTRAINT oportunidades_propietario_usuario_org_fkey
            FOREIGN KEY (organizacion_id, propietario_usuario_id)
            REFERENCES public.usuarios (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='oportunidades_asignado_usuario_org_fkey') THEN
        ALTER TABLE public.oportunidades
            ADD CONSTRAINT oportunidades_asignado_usuario_org_fkey
            FOREIGN KEY (organizacion_id, asignado_a_usuario_id)
            REFERENCES public.usuarios (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='oportunidades_contacto_principal_org_fkey') THEN
        ALTER TABLE public.oportunidades
            ADD CONSTRAINT oportunidades_contacto_principal_org_fkey
            FOREIGN KEY (organizacion_id, contacto_principal_id)
            REFERENCES public.contactos (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='oportunidades_cuenta_org_fkey') THEN
        ALTER TABLE public.oportunidades
            ADD CONSTRAINT oportunidades_cuenta_org_fkey
            FOREIGN KEY (organizacion_id, cuenta_id)
            REFERENCES public.cuentas (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='oportunidades_etapa_org_fkey') THEN
        ALTER TABLE public.oportunidades
            ADD CONSTRAINT oportunidades_etapa_org_fkey
            FOREIGN KEY (organizacion_id, etapa_id)
            REFERENCES public.etapas_pipeline (organizacion_id, id)
            ON DELETE RESTRICT;
    END IF;
END
$$;

-- oportunidad_etapas_historial
ALTER TABLE public.oportunidad_etapas_historial DROP CONSTRAINT IF EXISTS oportunidad_etapas_historial_cambiado_por_usuario_id_fkey;
ALTER TABLE public.oportunidad_etapas_historial DROP CONSTRAINT IF EXISTS oportunidad_etapas_historial_etapa_destino_id_fkey;
ALTER TABLE public.oportunidad_etapas_historial DROP CONSTRAINT IF EXISTS oportunidad_etapas_historial_etapa_origen_id_fkey;
ALTER TABLE public.oportunidad_etapas_historial DROP CONSTRAINT IF EXISTS oportunidad_etapas_historial_oportunidad_id_fkey;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='oportunidad_historial_cambiado_por_usuario_org_fkey') THEN
        ALTER TABLE public.oportunidad_etapas_historial
            ADD CONSTRAINT oportunidad_historial_cambiado_por_usuario_org_fkey
            FOREIGN KEY (organizacion_id, cambiado_por_usuario_id)
            REFERENCES public.usuarios (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='oportunidad_historial_etapa_destino_org_fkey') THEN
        ALTER TABLE public.oportunidad_etapas_historial
            ADD CONSTRAINT oportunidad_historial_etapa_destino_org_fkey
            FOREIGN KEY (organizacion_id, etapa_destino_id)
            REFERENCES public.etapas_pipeline (organizacion_id, id)
            ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='oportunidad_historial_etapa_origen_org_fkey') THEN
        ALTER TABLE public.oportunidad_etapas_historial
            ADD CONSTRAINT oportunidad_historial_etapa_origen_org_fkey
            FOREIGN KEY (organizacion_id, etapa_origen_id)
            REFERENCES public.etapas_pipeline (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='oportunidad_historial_oportunidad_org_fkey') THEN
        ALTER TABLE public.oportunidad_etapas_historial
            ADD CONSTRAINT oportunidad_historial_oportunidad_org_fkey
            FOREIGN KEY (organizacion_id, oportunidad_id)
            REFERENCES public.oportunidades (organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;

-- actividades
ALTER TABLE public.actividades DROP CONSTRAINT IF EXISTS actividades_asignado_a_usuario_id_fkey;
ALTER TABLE public.actividades DROP CONSTRAINT IF EXISTS actividades_creado_por_usuario_id_fkey;
ALTER TABLE public.actividades DROP CONSTRAINT IF EXISTS actividades_contacto_id_fkey;
ALTER TABLE public.actividades DROP CONSTRAINT IF EXISTS actividades_cuenta_id_fkey;
ALTER TABLE public.actividades DROP CONSTRAINT IF EXISTS actividades_oportunidad_id_fkey;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='actividades_asignado_usuario_org_fkey') THEN
        ALTER TABLE public.actividades
            ADD CONSTRAINT actividades_asignado_usuario_org_fkey
            FOREIGN KEY (organizacion_id, asignado_a_usuario_id)
            REFERENCES public.usuarios (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='actividades_creado_por_usuario_org_fkey') THEN
        ALTER TABLE public.actividades
            ADD CONSTRAINT actividades_creado_por_usuario_org_fkey
            FOREIGN KEY (organizacion_id, creado_por_usuario_id)
            REFERENCES public.usuarios (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='actividades_contacto_org_fkey') THEN
        ALTER TABLE public.actividades
            ADD CONSTRAINT actividades_contacto_org_fkey
            FOREIGN KEY (organizacion_id, contacto_id)
            REFERENCES public.contactos (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='actividades_cuenta_org_fkey') THEN
        ALTER TABLE public.actividades
            ADD CONSTRAINT actividades_cuenta_org_fkey
            FOREIGN KEY (organizacion_id, cuenta_id)
            REFERENCES public.cuentas (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='actividades_oportunidad_org_fkey') THEN
        ALTER TABLE public.actividades
            ADD CONSTRAINT actividades_oportunidad_org_fkey
            FOREIGN KEY (organizacion_id, oportunidad_id)
            REFERENCES public.oportunidades (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

-- clientes
ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_contacto_id_fkey;
ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_cuenta_id_fkey;
ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_oportunidad_id_fkey;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='clientes_contacto_org_fkey') THEN
        ALTER TABLE public.clientes
            ADD CONSTRAINT clientes_contacto_org_fkey
            FOREIGN KEY (organizacion_id, contacto_id)
            REFERENCES public.contactos (organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='clientes_cuenta_org_fkey') THEN
        ALTER TABLE public.clientes
            ADD CONSTRAINT clientes_cuenta_org_fkey
            FOREIGN KEY (organizacion_id, cuenta_id)
            REFERENCES public.cuentas (organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='clientes_oportunidad_org_fkey') THEN
        ALTER TABLE public.clientes
            ADD CONSTRAINT clientes_oportunidad_org_fkey
            FOREIGN KEY (organizacion_id, oportunidad_id)
            REFERENCES public.oportunidades (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

-- cliente_documentos
ALTER TABLE public.cliente_documentos DROP CONSTRAINT IF EXISTS cliente_documentos_cargado_por_fkey;
ALTER TABLE public.cliente_documentos DROP CONSTRAINT IF EXISTS cliente_documentos_validado_por_fkey;
ALTER TABLE public.cliente_documentos DROP CONSTRAINT IF EXISTS cliente_documentos_cliente_id_fkey;
ALTER TABLE public.cliente_documentos DROP CONSTRAINT IF EXISTS cliente_documentos_cuenta_id_fkey;
ALTER TABLE public.cliente_documentos DROP CONSTRAINT IF EXISTS cliente_documentos_oportunidad_id_fkey;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='cliente_documentos_cargado_por_org_fkey') THEN
        ALTER TABLE public.cliente_documentos
            ADD CONSTRAINT cliente_documentos_cargado_por_org_fkey
            FOREIGN KEY (organizacion_id, cargado_por)
            REFERENCES public.usuarios (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='cliente_documentos_validado_por_org_fkey') THEN
        ALTER TABLE public.cliente_documentos
            ADD CONSTRAINT cliente_documentos_validado_por_org_fkey
            FOREIGN KEY (organizacion_id, validado_por)
            REFERENCES public.usuarios (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='cliente_documentos_cliente_org_fkey') THEN
        ALTER TABLE public.cliente_documentos
            ADD CONSTRAINT cliente_documentos_cliente_org_fkey
            FOREIGN KEY (organizacion_id, cliente_id)
            REFERENCES public.clientes (organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='cliente_documentos_cuenta_org_fkey') THEN
        ALTER TABLE public.cliente_documentos
            ADD CONSTRAINT cliente_documentos_cuenta_org_fkey
            FOREIGN KEY (organizacion_id, cuenta_id)
            REFERENCES public.cuentas (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='cliente_documentos_oportunidad_org_fkey') THEN
        ALTER TABLE public.cliente_documentos
            ADD CONSTRAINT cliente_documentos_oportunidad_org_fkey
            FOREIGN KEY (organizacion_id, oportunidad_id)
            REFERENCES public.oportunidades (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

-- cliente_portal_tokens
ALTER TABLE public.cliente_portal_tokens DROP CONSTRAINT IF EXISTS cliente_portal_tokens_creado_por_fkey;
ALTER TABLE public.cliente_portal_tokens DROP CONSTRAINT IF EXISTS cliente_portal_tokens_cliente_id_fkey;
ALTER TABLE public.cliente_portal_tokens DROP CONSTRAINT IF EXISTS cliente_portal_tokens_cuenta_id_fkey;
ALTER TABLE public.cliente_portal_tokens DROP CONSTRAINT IF EXISTS cliente_portal_tokens_oportunidad_id_fkey;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='cliente_portal_tokens_creado_por_org_fkey') THEN
        ALTER TABLE public.cliente_portal_tokens
            ADD CONSTRAINT cliente_portal_tokens_creado_por_org_fkey
            FOREIGN KEY (organizacion_id, creado_por)
            REFERENCES public.usuarios (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='cliente_portal_tokens_cliente_org_fkey') THEN
        ALTER TABLE public.cliente_portal_tokens
            ADD CONSTRAINT cliente_portal_tokens_cliente_org_fkey
            FOREIGN KEY (organizacion_id, cliente_id)
            REFERENCES public.clientes (organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='cliente_portal_tokens_cuenta_org_fkey') THEN
        ALTER TABLE public.cliente_portal_tokens
            ADD CONSTRAINT cliente_portal_tokens_cuenta_org_fkey
            FOREIGN KEY (organizacion_id, cuenta_id)
            REFERENCES public.cuentas (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='cliente_portal_tokens_oportunidad_org_fkey') THEN
        ALTER TABLE public.cliente_portal_tokens
            ADD CONSTRAINT cliente_portal_tokens_oportunidad_org_fkey
            FOREIGN KEY (organizacion_id, oportunidad_id)
            REFERENCES public.oportunidades (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

-- cliente_responsables
ALTER TABLE public.cliente_responsables DROP CONSTRAINT IF EXISTS cliente_responsables_cliente_id_fkey;
ALTER TABLE public.cliente_responsables DROP CONSTRAINT IF EXISTS cliente_responsables_cuenta_id_fkey;
ALTER TABLE public.cliente_responsables DROP CONSTRAINT IF EXISTS cliente_responsables_oportunidad_id_fkey;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='cliente_responsables_cliente_org_fkey') THEN
        ALTER TABLE public.cliente_responsables
            ADD CONSTRAINT cliente_responsables_cliente_org_fkey
            FOREIGN KEY (organizacion_id, cliente_id)
            REFERENCES public.clientes (organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='cliente_responsables_cuenta_org_fkey') THEN
        ALTER TABLE public.cliente_responsables
            ADD CONSTRAINT cliente_responsables_cuenta_org_fkey
            FOREIGN KEY (organizacion_id, cuenta_id)
            REFERENCES public.cuentas (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='cliente_responsables_oportunidad_org_fkey') THEN
        ALTER TABLE public.cliente_responsables
            ADD CONSTRAINT cliente_responsables_oportunidad_org_fkey
            FOREIGN KEY (organizacion_id, oportunidad_id)
            REFERENCES public.oportunidades (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

-- cotizaciones
ALTER TABLE public.cotizaciones DROP CONSTRAINT IF EXISTS cotizaciones_contacto_id_fkey;
ALTER TABLE public.cotizaciones DROP CONSTRAINT IF EXISTS cotizaciones_creada_por_usuario_id_fkey;
ALTER TABLE public.cotizaciones DROP CONSTRAINT IF EXISTS cotizaciones_cuenta_id_fkey;
ALTER TABLE public.cotizaciones DROP CONSTRAINT IF EXISTS cotizaciones_oportunidad_id_fkey;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='cotizaciones_contacto_org_fkey') THEN
        ALTER TABLE public.cotizaciones
            ADD CONSTRAINT cotizaciones_contacto_org_fkey
            FOREIGN KEY (organizacion_id, contacto_id)
            REFERENCES public.contactos (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='cotizaciones_creada_por_usuario_org_fkey') THEN
        ALTER TABLE public.cotizaciones
            ADD CONSTRAINT cotizaciones_creada_por_usuario_org_fkey
            FOREIGN KEY (organizacion_id, creada_por_usuario_id)
            REFERENCES public.usuarios (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='cotizaciones_cuenta_org_fkey') THEN
        ALTER TABLE public.cotizaciones
            ADD CONSTRAINT cotizaciones_cuenta_org_fkey
            FOREIGN KEY (organizacion_id, cuenta_id)
            REFERENCES public.cuentas (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='cotizaciones_oportunidad_org_fkey') THEN
        ALTER TABLE public.cotizaciones
            ADD CONSTRAINT cotizaciones_oportunidad_org_fkey
            FOREIGN KEY (organizacion_id, oportunidad_id)
            REFERENCES public.oportunidades (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

-- leads
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_campana_id_fkey;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_contacto_id_fkey;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_convertido_a_contacto_id_fkey;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_cuenta_id_fkey;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_convertido_a_cuenta_id_fkey;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='leads_campana_org_fkey') THEN
        ALTER TABLE public.leads
            ADD CONSTRAINT leads_campana_org_fkey
            FOREIGN KEY (organizacion_id, campana_id)
            REFERENCES public.campanas (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='leads_contacto_org_fkey') THEN
        ALTER TABLE public.leads
            ADD CONSTRAINT leads_contacto_org_fkey
            FOREIGN KEY (organizacion_id, contacto_id)
            REFERENCES public.contactos (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='leads_convertido_contacto_org_fkey') THEN
        ALTER TABLE public.leads
            ADD CONSTRAINT leads_convertido_contacto_org_fkey
            FOREIGN KEY (organizacion_id, convertido_a_contacto_id)
            REFERENCES public.contactos (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='leads_cuenta_org_fkey') THEN
        ALTER TABLE public.leads
            ADD CONSTRAINT leads_cuenta_org_fkey
            FOREIGN KEY (organizacion_id, cuenta_id)
            REFERENCES public.cuentas (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='leads_convertido_cuenta_org_fkey') THEN
        ALTER TABLE public.leads
            ADD CONSTRAINT leads_convertido_cuenta_org_fkey
            FOREIGN KEY (organizacion_id, convertido_a_cuenta_id)
            REFERENCES public.cuentas (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

-- tickets
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_asignado_a_usuario_id_fkey;
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_contacto_id_fkey;
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_cuenta_id_fkey;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='tickets_asignado_usuario_org_fkey') THEN
        ALTER TABLE public.tickets
            ADD CONSTRAINT tickets_asignado_usuario_org_fkey
            FOREIGN KEY (organizacion_id, asignado_a_usuario_id)
            REFERENCES public.usuarios (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='tickets_contacto_org_fkey') THEN
        ALTER TABLE public.tickets
            ADD CONSTRAINT tickets_contacto_org_fkey
            FOREIGN KEY (organizacion_id, contacto_id)
            REFERENCES public.contactos (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='tickets_cuenta_org_fkey') THEN
        ALTER TABLE public.tickets
            ADD CONSTRAINT tickets_cuenta_org_fkey
            FOREIGN KEY (organizacion_id, cuenta_id)
            REFERENCES public.cuentas (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

-- ticket_comentarios
ALTER TABLE public.ticket_comentarios DROP CONSTRAINT IF EXISTS ticket_comentarios_autor_cliente_id_fkey;
ALTER TABLE public.ticket_comentarios DROP CONSTRAINT IF EXISTS ticket_comentarios_autor_usuario_id_fkey;
ALTER TABLE public.ticket_comentarios DROP CONSTRAINT IF EXISTS ticket_comentarios_ticket_id_fkey;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='ticket_comentarios_autor_cliente_org_fkey') THEN
        ALTER TABLE public.ticket_comentarios
            ADD CONSTRAINT ticket_comentarios_autor_cliente_org_fkey
            FOREIGN KEY (organizacion_id, autor_cliente_id)
            REFERENCES public.contactos (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='ticket_comentarios_autor_usuario_org_fkey') THEN
        ALTER TABLE public.ticket_comentarios
            ADD CONSTRAINT ticket_comentarios_autor_usuario_org_fkey
            FOREIGN KEY (organizacion_id, autor_usuario_id)
            REFERENCES public.usuarios (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='ticket_comentarios_ticket_org_fkey') THEN
        ALTER TABLE public.ticket_comentarios
            ADD CONSTRAINT ticket_comentarios_ticket_org_fkey
            FOREIGN KEY (organizacion_id, ticket_id)
            REFERENCES public.tickets (organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;

-- tags / taggings
ALTER TABLE public.taggings DROP CONSTRAINT IF EXISTS taggings_tag_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='taggings_tag_org_fkey') THEN
        ALTER TABLE public.taggings
            ADD CONSTRAINT taggings_tag_org_fkey
            FOREIGN KEY (organizacion_id, tag_id)
            REFERENCES public.tags (organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;

-- 3) Prospección / búsquedas: FKs compuestas

-- resultados -> busquedas
ALTER TABLE public.resultados DROP CONSTRAINT IF EXISTS resultados_busqueda_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='resultados_busqueda_org_fkey') THEN
        ALTER TABLE public.resultados
            ADD CONSTRAINT resultados_busqueda_org_fkey
            FOREIGN KEY (organizacion_id, busqueda_id)
            REFERENCES public.busquedas (organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;

-- prospeccion_prospectos -> busquedas / resultados
ALTER TABLE public.prospeccion_prospectos DROP CONSTRAINT IF EXISTS prospeccion_prospectos_busqueda_id_fkey;
ALTER TABLE public.prospeccion_prospectos DROP CONSTRAINT IF EXISTS prospeccion_prospectos_resultado_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='prospeccion_prospectos_busqueda_org_fkey') THEN
        ALTER TABLE public.prospeccion_prospectos
            ADD CONSTRAINT prospeccion_prospectos_busqueda_org_fkey
            FOREIGN KEY (organizacion_id, busqueda_id)
            REFERENCES public.busquedas (organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='prospeccion_prospectos_resultado_org_fkey') THEN
        ALTER TABLE public.prospeccion_prospectos
            ADD CONSTRAINT prospeccion_prospectos_resultado_org_fkey
            FOREIGN KEY (organizacion_id, resultado_id)
            REFERENCES public.resultados (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

-- prospeccion_contacto_batch -> campanas / listas
ALTER TABLE public.prospeccion_contacto_batch DROP CONSTRAINT IF EXISTS prospeccion_contacto_batch_campana_id_fkey;
ALTER TABLE public.prospeccion_contacto_batch DROP CONSTRAINT IF EXISTS prospeccion_contacto_batch_lista_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='prospeccion_contacto_batch_campana_org_fkey') THEN
        ALTER TABLE public.prospeccion_contacto_batch
            ADD CONSTRAINT prospeccion_contacto_batch_campana_org_fkey
            FOREIGN KEY (organizacion_id, campana_id)
            REFERENCES public.campanas (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='prospeccion_contacto_batch_lista_org_fkey') THEN
        ALTER TABLE public.prospeccion_contacto_batch
            ADD CONSTRAINT prospeccion_contacto_batch_lista_org_fkey
            FOREIGN KEY (organizacion_id, lista_id)
            REFERENCES public.prospeccion_contacto_listas (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

-- prospeccion_contacto_envio -> batch / prospecto
ALTER TABLE public.prospeccion_contacto_envio DROP CONSTRAINT IF EXISTS prospeccion_contacto_envio_batch_id_fkey;
ALTER TABLE public.prospeccion_contacto_envio DROP CONSTRAINT IF EXISTS prospeccion_contacto_envio_prospecto_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='prospeccion_contacto_envio_batch_org_fkey') THEN
        ALTER TABLE public.prospeccion_contacto_envio
            ADD CONSTRAINT prospeccion_contacto_envio_batch_org_fkey
            FOREIGN KEY (organizacion_id, batch_id)
            REFERENCES public.prospeccion_contacto_batch (organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='prospeccion_contacto_envio_prospecto_org_fkey') THEN
        ALTER TABLE public.prospeccion_contacto_envio
            ADD CONSTRAINT prospeccion_contacto_envio_prospecto_org_fkey
            FOREIGN KEY (organizacion_id, prospecto_id)
            REFERENCES public.prospeccion_prospectos (organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;

-- prospeccion_contactos_log -> batch / envio / prospecto
ALTER TABLE public.prospeccion_contactos_log DROP CONSTRAINT IF EXISTS prospeccion_contactos_log_batch_id_fkey;
ALTER TABLE public.prospeccion_contactos_log DROP CONSTRAINT IF EXISTS prospeccion_contactos_log_envio_id_fkey;
ALTER TABLE public.prospeccion_contactos_log DROP CONSTRAINT IF EXISTS prospeccion_contactos_log_prospecto_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='prospeccion_contactos_log_batch_org_fkey') THEN
        ALTER TABLE public.prospeccion_contactos_log
            ADD CONSTRAINT prospeccion_contactos_log_batch_org_fkey
            FOREIGN KEY (organizacion_id, batch_id)
            REFERENCES public.prospeccion_contacto_batch (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='prospeccion_contactos_log_envio_org_fkey') THEN
        ALTER TABLE public.prospeccion_contactos_log
            ADD CONSTRAINT prospeccion_contactos_log_envio_org_fkey
            FOREIGN KEY (organizacion_id, envio_id)
            REFERENCES public.prospeccion_contacto_envio (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='prospeccion_contactos_log_prospecto_org_fkey') THEN
        ALTER TABLE public.prospeccion_contactos_log
            ADD CONSTRAINT prospeccion_contactos_log_prospecto_org_fkey
            FOREIGN KEY (organizacion_id, prospecto_id)
            REFERENCES public.prospeccion_prospectos (organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;

-- prospeccion_prospectos_audit -> prospectos
ALTER TABLE public.prospeccion_prospectos_audit DROP CONSTRAINT IF EXISTS prospeccion_prospectos_audit_prospecto_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='prospeccion_prospectos_audit_prospecto_org_fkey') THEN
        ALTER TABLE public.prospeccion_prospectos_audit
            ADD CONSTRAINT prospeccion_prospectos_audit_prospecto_org_fkey
            FOREIGN KEY (organizacion_id, prospecto_id)
            REFERENCES public.prospeccion_prospectos (organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;

-- prospeccion_buscador_resultados -> jobs
ALTER TABLE public.prospeccion_buscador_resultados DROP CONSTRAINT IF EXISTS prospeccion_buscador_resultados_job_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='prospeccion_buscador_resultados_job_org_fkey') THEN
        ALTER TABLE public.prospeccion_buscador_resultados
            ADD CONSTRAINT prospeccion_buscador_resultados_job_org_fkey
            FOREIGN KEY (organizacion_id, job_id)
            REFERENCES public.prospeccion_buscador_jobs (organizacion_id, id)
            ON DELETE CASCADE;
    END IF;
END
$$;

-- 4) Otros: auditoría / agentes / utilitarios

-- eventos_auditoria.actor_usuario_id
ALTER TABLE public.eventos_auditoria DROP CONSTRAINT IF EXISTS events_audit_actor_user_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='eventos_auditoria_actor_usuario_org_fkey') THEN
        ALTER TABLE public.eventos_auditoria
            ADD CONSTRAINT eventos_auditoria_actor_usuario_org_fkey
            FOREIGN KEY (organizacion_id, actor_usuario_id)
            REFERENCES public.usuarios (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

-- notas.creado_por_usuario_id
ALTER TABLE public.notas DROP CONSTRAINT IF EXISTS notas_creado_por_usuario_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='notas_creado_por_usuario_org_fkey') THEN
        ALTER TABLE public.notas
            ADD CONSTRAINT notas_creado_por_usuario_org_fkey
            FOREIGN KEY (organizacion_id, creado_por_usuario_id)
            REFERENCES public.usuarios (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

-- archivos.subido_por_usuario_id
ALTER TABLE public.archivos DROP CONSTRAINT IF EXISTS archivos_subido_por_usuario_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='archivos_subido_por_usuario_org_fkey') THEN
        ALTER TABLE public.archivos
            ADD CONSTRAINT archivos_subido_por_usuario_org_fkey
            FOREIGN KEY (organizacion_id, subido_por_usuario_id)
            REFERENCES public.usuarios (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

-- audit_logs.usuario_id
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_usuario_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='audit_logs_usuario_org_fkey') THEN
        ALTER TABLE public.audit_logs
            ADD CONSTRAINT audit_logs_usuario_org_fkey
            FOREIGN KEY (organizacion_id, usuario_id)
            REFERENCES public.usuarios (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

-- prompt_bindings.version_id -> prompt_versions
ALTER TABLE public.prompt_bindings DROP CONSTRAINT IF EXISTS prompt_bindings_version_id_fkey;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='prompt_bindings_version_org_fkey') THEN
        ALTER TABLE public.prompt_bindings
            ADD CONSTRAINT prompt_bindings_version_org_fkey
            FOREIGN KEY (organizacion_id, version_id)
            REFERENCES public.prompt_versions (organizacion_id, id)
            ON DELETE SET NULL;
    END IF;
END
$$;

-- logos.uploaded_by
ALTER TABLE public.logos DROP CONSTRAINT IF EXISTS logos_uploaded_by_fkey;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='logos_uploaded_by_org_fkey') THEN
        ALTER TABLE public.logos
            ADD CONSTRAINT logos_uploaded_by_org_fkey
            FOREIGN KEY (organizacion_id, uploaded_by)
            REFERENCES public.usuarios (organizacion_id, id);
    END IF;
END
$$;

-- quote_templates.updated_by
ALTER TABLE public.quote_templates DROP CONSTRAINT IF EXISTS quote_templates_updated_by_fkey;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='quote_templates_updated_by_org_fkey') THEN
        ALTER TABLE public.quote_templates
            ADD CONSTRAINT quote_templates_updated_by_org_fkey
            FOREIGN KEY (organizacion_id, updated_by)
            REFERENCES public.usuarios (organizacion_id, id);
    END IF;
END
$$;

-- secretos.creado_por / actualizado_por
ALTER TABLE public.secretos DROP CONSTRAINT IF EXISTS secretos_creado_por_fkey;
ALTER TABLE public.secretos DROP CONSTRAINT IF EXISTS secretos_actualizado_por_fkey;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='secretos_creado_por_org_fkey') THEN
        ALTER TABLE public.secretos
            ADD CONSTRAINT secretos_creado_por_org_fkey
            FOREIGN KEY (organizacion_id, creado_por)
            REFERENCES public.usuarios (organizacion_id, id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname='secretos_actualizado_por_org_fkey') THEN
        ALTER TABLE public.secretos
            ADD CONSTRAINT secretos_actualizado_por_org_fkey
            FOREIGN KEY (organizacion_id, actualizado_por)
            REFERENCES public.usuarios (organizacion_id, id);
    END IF;
END
$$;

COMMIT;

