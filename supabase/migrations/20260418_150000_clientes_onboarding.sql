BEGIN;

-- ======================================================================
-- Tipos enumerados para clientes
-- ======================================================================

DO
$$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'cliente_onboarding_estado'
          AND n.nspname = 'public'
    ) THEN
        CREATE TYPE public.cliente_onboarding_estado AS ENUM ('pendiente', 'en_progreso', 'completado');
    END IF;
END;
$$;

DO
$$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'cliente_documento_tipo'
          AND n.nspname = 'public'
    ) THEN
        CREATE TYPE public.cliente_documento_tipo AS ENUM (
            'constancia_fiscal',
            'comprobante_domicilio',
            'identificacion_oficial',
            'contrato_servicio',
            'nda',
            'otro'
        );
    END IF;
END;
$$;

DO
$$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'cliente_documento_estado'
          AND n.nspname = 'public'
    ) THEN
        CREATE TYPE public.cliente_documento_estado AS ENUM ('pendiente', 'recibido', 'validado', 'rechazado');
    END IF;
END;
$$;

GRANT USAGE ON TYPE public.cliente_onboarding_estado TO postgres, service_role, authenticated;
GRANT USAGE ON TYPE public.cliente_documento_tipo TO postgres, service_role, authenticated;
GRANT USAGE ON TYPE public.cliente_documento_estado TO postgres, service_role, authenticated;

-- ======================================================================
-- Tabla principal de clientes
-- ======================================================================

CREATE TABLE IF NOT EXISTS public.clientes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    contacto_id uuid NOT NULL REFERENCES public.contactos(id) ON DELETE CASCADE,
    lead_tarjeta_id uuid REFERENCES public.lead_tarjetas(id) ON DELETE SET NULL,
    tablero_id uuid REFERENCES public.lead_tableros(id) ON DELETE SET NULL,
    etapa_id uuid REFERENCES public.lead_etapas(id) ON DELETE SET NULL,
    estado_onboarding public.cliente_onboarding_estado NOT NULL DEFAULT 'pendiente',
    rfc text,
    razon_social text,
    domicilio_fiscal text,
    domicilio_fisico text,
    regimen_fiscal text,
    datos_facturacion jsonb NOT NULL DEFAULT '{}'::jsonb,
    fuente text,
    monto_estimado numeric(12,2),
    moneda char(3) NOT NULL DEFAULT 'MXN',
    metadatos jsonb NOT NULL DEFAULT '{}'::jsonb,
    ganado_en timestamptz,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT clientes_contacto_unique UNIQUE (contacto_id),
    CONSTRAINT clientes_moneda_check CHECK (char_length(moneda) = 3),
    CONSTRAINT clientes_monto_check CHECK (monto_estimado IS NULL OR monto_estimado >= 0)
);

COMMENT ON TABLE public.clientes IS 'Clientes derivados de leads ganados con datos fiscales y de onboarding.';
COMMENT ON COLUMN public.clientes.contacto_id IS 'Referencia 1:1 con el contacto original del lead.';
COMMENT ON COLUMN public.clientes.lead_tarjeta_id IS 'Lead que originó al cliente.';
COMMENT ON COLUMN public.clientes.estado_onboarding IS 'Estatus general del proceso de alta (pendiente, en_progreso, completado).';
COMMENT ON COLUMN public.clientes.rfc IS 'RFC para facturación.';
COMMENT ON COLUMN public.clientes.razon_social IS 'Razón social a facturar.';
COMMENT ON COLUMN public.clientes.domicilio_fiscal IS 'Domicilio fiscal registrado.';
COMMENT ON COLUMN public.clientes.domicilio_fisico IS 'Domicilio físico/operativo cuando difiere del fiscal.';
COMMENT ON COLUMN public.clientes.regimen_fiscal IS 'Régimen fiscal declarado por el cliente.';
COMMENT ON COLUMN public.clientes.datos_facturacion IS 'Metadatos adicionales de facturación (uso CFDI, forma de pago, etc.).';

CREATE INDEX IF NOT EXISTS clientes_contacto_idx ON public.clientes (contacto_id);
CREATE INDEX IF NOT EXISTS clientes_lead_idx ON public.clientes (lead_tarjeta_id);
ALTER TABLE public.clientes REPLICA IDENTITY FULL;

DROP TRIGGER IF EXISTS clientes_touch_updated_at ON public.clientes;
CREATE TRIGGER clientes_touch_updated_at
    BEFORE UPDATE ON public.clientes
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

-- ======================================================================
-- Documentos asociados al cliente
-- ======================================================================

CREATE TABLE IF NOT EXISTS public.cliente_documentos (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    tipo public.cliente_documento_tipo NOT NULL,
    estado public.cliente_documento_estado NOT NULL DEFAULT 'pendiente',
    descripcion text,
    storage_path text,
    storage_url text,
    cargado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    cargado_en timestamptz NOT NULL DEFAULT now(),
    validado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    validado_en timestamptz,
    metadatos jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cliente_documentos IS 'Documentos fiscales/legales requeridos durante el onboarding del cliente.';
COMMENT ON COLUMN public.cliente_documentos.tipo IS 'Tipo de documento solicitado (constancia fiscal, comprobante, NDA, etc.).';
COMMENT ON COLUMN public.cliente_documentos.estado IS 'Estatus de recepción/validación del documento.';
COMMENT ON COLUMN public.cliente_documentos.storage_path IS 'Ruta interna en el bucket de storage para el documento.';
COMMENT ON COLUMN public.cliente_documentos.storage_url IS 'URL accesible (firmada o pública) del documento almacenado.';

CREATE INDEX IF NOT EXISTS cliente_documentos_cliente_idx ON public.cliente_documentos (cliente_id);
CREATE INDEX IF NOT EXISTS cliente_documentos_tipo_estado_idx ON public.cliente_documentos (tipo, estado);
ALTER TABLE public.cliente_documentos REPLICA IDENTITY FULL;

DROP TRIGGER IF EXISTS cliente_documentos_touch_updated_at ON public.cliente_documentos;
CREATE TRIGGER cliente_documentos_touch_updated_at
    BEFORE UPDATE ON public.cliente_documentos
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

-- ======================================================================
-- Responsables del proyecto
-- ======================================================================

CREATE TABLE IF NOT EXISTS public.cliente_responsables (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    nombre text NOT NULL,
    correo text,
    telefono_e164 text,
    rol text,
    es_responsable_principal boolean NOT NULL DEFAULT false,
    metadatos jsonb NOT NULL DEFAULT '{}'::jsonb,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cliente_responsables IS 'Personas de contacto responsables del proyecto y la implementación.';
COMMENT ON COLUMN public.cliente_responsables.es_responsable_principal IS 'Marca si es el contacto principal del proyecto.';

CREATE INDEX IF NOT EXISTS cliente_responsables_cliente_idx ON public.cliente_responsables (cliente_id);
ALTER TABLE public.cliente_responsables REPLICA IDENTITY FULL;

DROP TRIGGER IF EXISTS cliente_responsables_touch_updated_at ON public.cliente_responsables;
CREATE TRIGGER cliente_responsables_touch_updated_at
    BEFORE UPDATE ON public.cliente_responsables
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

-- ======================================================================
-- RLS y permisos
-- ======================================================================

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_responsables ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cliente_documentos TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cliente_responsables TO postgres, service_role;

GRANT SELECT, INSERT, UPDATE ON public.clientes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.cliente_documentos TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.cliente_responsables TO authenticated;

DROP POLICY IF EXISTS clientes_admin_all ON public.clientes;
CREATE POLICY clientes_admin_all ON public.clientes
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

DROP POLICY IF EXISTS clientes_member_all ON public.clientes;
CREATE POLICY clientes_member_all ON public.clientes
    FOR ALL TO authenticated
    USING (lead_tarjeta_id IS NOT NULL AND public.puede_ver_lead(lead_tarjeta_id))
    WITH CHECK (lead_tarjeta_id IS NOT NULL AND public.puede_ver_lead(lead_tarjeta_id));

DROP POLICY IF EXISTS cliente_documentos_admin_all ON public.cliente_documentos;
CREATE POLICY cliente_documentos_admin_all ON public.cliente_documentos
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

DROP POLICY IF EXISTS cliente_documentos_member_all ON public.cliente_documentos;
CREATE POLICY cliente_documentos_member_all ON public.cliente_documentos
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1
              FROM public.clientes c
             WHERE c.id = cliente_id
               AND c.lead_tarjeta_id IS NOT NULL
               AND public.puede_ver_lead(c.lead_tarjeta_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
              FROM public.clientes c
             WHERE c.id = cliente_id
               AND c.lead_tarjeta_id IS NOT NULL
               AND public.puede_ver_lead(c.lead_tarjeta_id)
        )
    );

DROP POLICY IF EXISTS cliente_responsables_admin_all ON public.cliente_responsables;
CREATE POLICY cliente_responsables_admin_all ON public.cliente_responsables
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

DROP POLICY IF EXISTS cliente_responsables_member_all ON public.cliente_responsables;
CREATE POLICY cliente_responsables_member_all ON public.cliente_responsables
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1
              FROM public.clientes c
             WHERE c.id = cliente_id
               AND c.lead_tarjeta_id IS NOT NULL
               AND public.puede_ver_lead(c.lead_tarjeta_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
              FROM public.clientes c
             WHERE c.id = cliente_id
               AND c.lead_tarjeta_id IS NOT NULL
               AND public.puede_ver_lead(c.lead_tarjeta_id)
        )
    );

-- ======================================================================
-- Función de conversión y triggers
-- ======================================================================

CREATE OR REPLACE FUNCTION public.ensure_cliente_from_lead(p_tarjeta_id uuid)
RETURNS public.clientes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
    v_lead public.lead_tarjetas%ROWTYPE;
    v_categoria public.lead_categoria;
    v_cliente public.clientes%ROWTYPE;
    v_actor uuid;
BEGIN
    SELECT lt.*, le.categoria
      INTO v_lead, v_categoria
      FROM public.lead_tarjetas lt
      JOIN public.lead_etapas le ON le.id = lt.etapa_id
     WHERE lt.id = p_tarjeta_id
     LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'lead_no_encontrado';
    END IF;

    IF v_categoria <> 'ganada' THEN
        RETURN NULL;
    END IF;

    v_actor := coalesce(auth.uid(), v_lead.asignado_a_usuario_id, v_lead.propietario_usuario_id);

    INSERT INTO public.clientes (
        contacto_id,
        lead_tarjeta_id,
        tablero_id,
        etapa_id,
        monto_estimado,
        moneda,
        fuente,
        metadatos,
        ganado_en
    )
    VALUES (
        v_lead.contacto_id,
        v_lead.id,
        v_lead.tablero_id,
        v_lead.etapa_id,
        v_lead.monto_estimado,
        v_lead.moneda,
        v_lead.fuente,
        v_lead.metadata,
        coalesce(v_lead.cerrado_en, now())
    )
    ON CONFLICT (contacto_id) DO UPDATE
        SET lead_tarjeta_id = EXCLUDED.lead_tarjeta_id,
            tablero_id = EXCLUDED.tablero_id,
            etapa_id = EXCLUDED.etapa_id,
            monto_estimado = EXCLUDED.monto_estimado,
            moneda = EXCLUDED.moneda,
            fuente = coalesce(EXCLUDED.fuente, public.clientes.fuente),
            metadatos = public.clientes.metadatos || jsonb_build_object('ultimo_lead', EXCLUDED.lead_tarjeta_id),
            ganado_en = coalesce(public.clientes.ganado_en, EXCLUDED.ganado_en),
            actualizado_en = now()
    RETURNING * INTO v_cliente;

    IF v_actor IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1
              FROM public.lead_recordatorios lr
             WHERE lr.tarjeta_id = v_lead.id
               AND lr.metadata ->> 'tipo' = 'solicitar_datos_fiscales'
        ) THEN
            INSERT INTO public.lead_recordatorios (
                tarjeta_id,
                descripcion,
                due_at,
                creado_por,
                metadata
            )
            VALUES (
                v_lead.id,
                'Solicitar datos fiscales y documentos de facturación',
                now() + interval '1 day',
                v_actor,
                jsonb_build_object('tipo', 'solicitar_datos_fiscales', 'cliente_id', v_cliente.id)
            );
        END IF;

        IF NOT EXISTS (
            SELECT 1
              FROM public.lead_recordatorios lr
             WHERE lr.tarjeta_id = v_lead.id
               AND lr.metadata ->> 'tipo' = 'definir_responsables_proyecto'
        ) THEN
            INSERT INTO public.lead_recordatorios (
                tarjeta_id,
                descripcion,
                due_at,
                creado_por,
                metadata
            )
            VALUES (
                v_lead.id,
                'Definir responsables y contactos del proyecto',
                now() + interval '2 days',
                v_actor,
                jsonb_build_object('tipo', 'definir_responsables_proyecto', 'cliente_id', v_cliente.id)
            );
        END IF;
    END IF;

    RETURN v_cliente;
END;
$$;

COMMENT ON FUNCTION public.ensure_cliente_from_lead(uuid)
    IS 'Crea o actualiza un cliente cuando el lead está ganado y genera tareas de onboarding.';

GRANT EXECUTE ON FUNCTION public.ensure_cliente_from_lead(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_lead_tarjeta_sync_cliente()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM public.ensure_cliente_from_lead(NEW.id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lead_tarjetas_sync_cliente ON public.lead_tarjetas;
CREATE TRIGGER lead_tarjetas_sync_cliente
    AFTER INSERT OR UPDATE ON public.lead_tarjetas
    FOR EACH ROW
    WHEN ((SELECT categoria FROM public.lead_etapas WHERE id = NEW.etapa_id) = 'ganada')
    EXECUTE FUNCTION public.tg_lead_tarjeta_sync_cliente();

CREATE OR REPLACE FUNCTION public.convertir_lead_en_cliente(
    p_tarjeta_id uuid,
    p_forzar boolean DEFAULT false
)
RETURNS public.clientes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
    v_categoria public.lead_categoria;
BEGIN
    SELECT le.categoria
      INTO v_categoria
      FROM public.lead_tarjetas lt
      JOIN public.lead_etapas le ON le.id = lt.etapa_id
     WHERE lt.id = p_tarjeta_id
     LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'lead_no_encontrado';
    END IF;

    IF v_categoria <> 'ganada' AND NOT p_forzar THEN
        RAISE EXCEPTION 'lead_no_ganado';
    END IF;

    RETURN public.ensure_cliente_from_lead(p_tarjeta_id);
END;
$$;

COMMENT ON FUNCTION public.convertir_lead_en_cliente(uuid, boolean)
    IS 'Permite reintentar o forzar la conversión de un lead en cliente desde el panel.';

GRANT EXECUTE ON FUNCTION public.convertir_lead_en_cliente(uuid, boolean) TO authenticated, service_role;

-- ======================================================================
-- Bucket de storage para documentos de clientes
-- ======================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('clientes', 'clientes', false)
ON CONFLICT (id) DO NOTHING;

COMMIT;
