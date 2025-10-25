BEGIN;

-- ======================================================================
-- Tipos y funciones auxiliares
-- ======================================================================

DO
$$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'lead_categoria'
          AND n.nspname = 'public'
    ) THEN
        CREATE TYPE public.lead_categoria AS ENUM ('abierta', 'ganada', 'perdida');
    END IF;
END;
$$;

GRANT USAGE ON TYPE public.lead_categoria TO postgres, service_role, authenticated;

CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.actualizado_en := now();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_touch_updated_at()
    IS 'Actualiza la columna actualizado_en al momento actual.';

-- ======================================================================
-- Tablas del pipeline Kanban
-- ======================================================================

CREATE TABLE public.lead_tableros (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre text NOT NULL,
    slug text NOT NULL,
    descripcion text,
    departamento_id uuid REFERENCES public.departamentos(id) ON DELETE SET NULL,
    propietario_usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    es_default boolean DEFAULT false NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamptz DEFAULT now() NOT NULL,
    actualizado_en timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT lead_tableros_slug_key UNIQUE (slug)
);

CREATE TABLE public.lead_etapas (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tablero_id uuid NOT NULL REFERENCES public.lead_tableros(id) ON DELETE CASCADE,
    codigo text NOT NULL,
    nombre text NOT NULL,
    orden smallint NOT NULL,
    categoria public.lead_categoria DEFAULT 'abierta'::public.lead_categoria NOT NULL,
    probabilidad numeric(5,2),
    sla_horas integer,
    metadatos jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamptz DEFAULT now() NOT NULL,
    actualizado_en timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT lead_etapas_codigo_unique UNIQUE (tablero_id, codigo),
    CONSTRAINT lead_etapas_orden_unique UNIQUE (tablero_id, orden),
    CONSTRAINT lead_etapas_probabilidad_check CHECK (
        probabilidad IS NULL OR (probabilidad >= 0 AND probabilidad <= 100)
    ),
    CONSTRAINT lead_etapas_sla_check CHECK (sla_horas IS NULL OR sla_horas >= 0)
);

CREATE TABLE public.lead_tarjetas (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    contacto_id uuid NOT NULL REFERENCES public.contactos(id) ON DELETE CASCADE,
    conversacion_id uuid REFERENCES public.conversaciones(id) ON DELETE SET NULL,
    tablero_id uuid NOT NULL REFERENCES public.lead_tableros(id) ON DELETE CASCADE,
    etapa_id uuid NOT NULL REFERENCES public.lead_etapas(id) ON DELETE RESTRICT,
    canal text,
    propietario_usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    asignado_a_usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    monto_estimado numeric(12,2),
    moneda char(3) DEFAULT 'MXN'::bpchar NOT NULL,
    probabilidad_override numeric(5,2),
    motivo_cierre text,
    cerrado_en timestamptz,
    lead_score integer,
    tags text[],
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    asistido_por text,
    fuente text,
    creado_en timestamptz DEFAULT now() NOT NULL,
    actualizado_en timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT lead_tarjetas_amount_check CHECK (monto_estimado IS NULL OR monto_estimado >= 0),
    CONSTRAINT lead_tarjetas_canal_check CHECK (
        canal IS NULL
        OR canal = ANY (ARRAY['whatsapp','instagram','webchat','voz','api'])
    ),
    CONSTRAINT lead_tarjetas_probability_check CHECK (
        probabilidad_override IS NULL
        OR (probabilidad_override >= 0 AND probabilidad_override <= 100)
    ),
    CONSTRAINT lead_tarjetas_fuente_check CHECK (
        fuente IS NULL OR fuente = ANY (ARRAY['humano','asistente','api'])
    ),
    CONSTRAINT lead_tarjetas_contacto_tablero_key UNIQUE (contacto_id, tablero_id)
);

CREATE TABLE public.lead_movimientos (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tarjeta_id uuid NOT NULL REFERENCES public.lead_tarjetas(id) ON DELETE CASCADE,
    etapa_origen_id uuid REFERENCES public.lead_etapas(id),
    etapa_destino_id uuid NOT NULL REFERENCES public.lead_etapas(id),
    cambiado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    cambiado_en timestamptz DEFAULT now() NOT NULL,
    motivo text,
    fuente text DEFAULT 'humano' NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT lead_movimientos_fuente_check CHECK (
        fuente = ANY (ARRAY['humano','asistente','api'])
    )
);

CREATE TABLE public.lead_recordatorios (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tarjeta_id uuid NOT NULL REFERENCES public.lead_tarjetas(id) ON DELETE CASCADE,
    descripcion text NOT NULL,
    due_at timestamptz NOT NULL,
    creado_por uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    completado boolean DEFAULT false NOT NULL,
    completado_en timestamptz,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    creado_en timestamptz DEFAULT now() NOT NULL,
    actualizado_en timestamptz DEFAULT now() NOT NULL
);

-- Índices

CREATE INDEX lead_etapas_tablero_idx ON public.lead_etapas (tablero_id, orden);
CREATE INDEX lead_tarjetas_tablero_etapa_idx ON public.lead_tarjetas (tablero_id, etapa_id);
CREATE INDEX lead_tarjetas_asignado_idx ON public.lead_tarjetas (asignado_a_usuario_id);
CREATE INDEX lead_tarjetas_conversacion_idx ON public.lead_tarjetas (conversacion_id);
CREATE INDEX lead_tarjetas_categoria_idx
    ON public.lead_tarjetas USING btree ((metadata ->> 'categoria'));
CREATE INDEX lead_movimientos_tarjeta_idx
    ON public.lead_movimientos (tarjeta_id, cambiado_en DESC);
CREATE INDEX lead_recordatorios_due_idx
    ON public.lead_recordatorios (due_at, completado);

ALTER TABLE public.lead_tarjetas REPLICA IDENTITY FULL;
ALTER TABLE public.lead_movimientos REPLICA IDENTITY FULL;
ALTER TABLE public.lead_recordatorios REPLICA IDENTITY FULL;

-- ======================================================================
-- Funciones dependientes de las tablas
-- ======================================================================

CREATE OR REPLACE FUNCTION public.puede_ver_tablero(p_tablero_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.lead_tableros t
         WHERE t.id = p_tablero_id
           AND (
                public.es_admin(auth.uid())
                OR t.propietario_usuario_id = auth.uid()
                OR t.es_default = TRUE
            )
    );
$$;

COMMENT ON FUNCTION public.puede_ver_tablero(uuid)
    IS 'Determina si el usuario actual puede visualizar el tablero especificado.';

CREATE OR REPLACE FUNCTION public.puede_ver_lead(p_tarjeta_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.lead_tarjetas lt
          JOIN public.contactos ct ON ct.id = lt.contacto_id
         WHERE lt.id = p_tarjeta_id
           AND (
                public.es_admin(auth.uid())
                OR ct.propietario_usuario_id = auth.uid()
                OR lt.propietario_usuario_id = auth.uid()
                OR lt.asignado_a_usuario_id = auth.uid()
            )
    );
$$;

COMMENT ON FUNCTION public.puede_ver_lead(uuid)
    IS 'True cuando el usuario actual es admin, propietario o asignado a la tarjeta.';

-- ======================================================================
-- Datos iniciales (tablero general y etapas)
-- ======================================================================

WITH upsert_board AS (
    INSERT INTO public.lead_tableros (nombre, slug, es_default, activo)
    VALUES ('Pipeline General', 'general', TRUE, TRUE)
    ON CONFLICT (slug) DO UPDATE
        SET nombre = EXCLUDED.nombre,
            es_default = TRUE,
            activo = TRUE,
            actualizado_en = now()
    RETURNING id
)
INSERT INTO public.lead_etapas (
    tablero_id, codigo, nombre, orden, categoria, probabilidad, sla_horas, metadatos
)
SELECT
    ub.id,
    stage.codigo,
    stage.nombre,
    stage.orden,
    stage.categoria,
    stage.probabilidad,
    stage.sla_horas,
    stage.metadatos
FROM upsert_board ub
CROSS JOIN LATERAL (VALUES
    ('captado', 'Captado', 1, 'abierta'::public.lead_categoria, 10.0, 24, jsonb_build_object('color', 'slate')),
    ('precalificado', 'Precalificado', 2, 'abierta'::public.lead_categoria, 25.0, 48, jsonb_build_object('color', 'sky')),
    ('demo', 'Demo Agendada', 3, 'abierta'::public.lead_categoria, 55.0, 72, jsonb_build_object('color', 'amber')),
    ('negociacion', 'Negociación', 4, 'abierta'::public.lead_categoria, 75.0, 96, jsonb_build_object('color', 'violet')),
    ('cerrado_ganado', 'Cerrado (Ganado)', 5, 'ganada'::public.lead_categoria, 100.0, NULL, jsonb_build_object('color', 'emerald')),
    ('cerrado_perdido', 'Cerrado (Perdido)', 6, 'perdida'::public.lead_categoria, 0.0, NULL, jsonb_build_object('color', 'rose'))
) AS stage(codigo, nombre, orden, categoria, probabilidad, sla_horas, metadatos)
ON CONFLICT (tablero_id, codigo) DO UPDATE
    SET nombre = EXCLUDED.nombre,
        orden = EXCLUDED.orden,
        categoria = EXCLUDED.categoria,
        probabilidad = EXCLUDED.probabilidad,
        sla_horas = EXCLUDED.sla_horas,
        metadatos = EXCLUDED.metadatos,
        actualizado_en = now();

-- ======================================================================
-- Triggers y sincronizaciones
-- ======================================================================

CREATE OR REPLACE FUNCTION public.tg_lead_tarjetas_before_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_default_tablero uuid;
    v_categoria public.lead_categoria;
    v_etapa_id uuid;
    v_conv_canal text;
    v_conv_asignado uuid;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        NEW.actualizado_en := now();
    ELSE
        IF NEW.creado_en IS NULL THEN
            NEW.creado_en := now();
        END IF;
        NEW.actualizado_en := now();
    END IF;

    IF NEW.tablero_id IS NULL THEN
        SELECT id INTO v_default_tablero
          FROM public.lead_tableros
         WHERE es_default IS TRUE
         ORDER BY creado_en
         LIMIT 1;

        IF v_default_tablero IS NULL THEN
            RAISE EXCEPTION 'No se encontró tablero por defecto para leads';
        END IF;
        NEW.tablero_id := v_default_tablero;
    END IF;

    IF NEW.etapa_id IS NULL THEN
        SELECT id INTO v_etapa_id
          FROM public.lead_etapas
         WHERE tablero_id = NEW.tablero_id
         ORDER BY orden
         LIMIT 1;
        IF v_etapa_id IS NULL THEN
            RAISE EXCEPTION 'El tablero % no tiene etapas configuradas', NEW.tablero_id;
        END IF;
        NEW.etapa_id := v_etapa_id;
    END IF;

    IF NEW.propietario_usuario_id IS NULL THEN
        SELECT propietario_usuario_id INTO NEW.propietario_usuario_id
          FROM public.contactos
         WHERE id = NEW.contacto_id;
    END IF;

    IF NEW.metadata IS NULL THEN
        NEW.metadata := '{}'::jsonb;
    END IF;

    IF NEW.fuente IS NULL THEN
        NEW.fuente := 'api';
    END IF;

    IF NEW.conversacion_id IS NOT NULL THEN
        SELECT canal, asignado_a_usuario_id
          INTO v_conv_canal, v_conv_asignado
          FROM public.conversaciones
         WHERE id = NEW.conversacion_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'La conversación % no existe', NEW.conversacion_id;
        END IF;
        IF NEW.canal IS NULL THEN
            NEW.canal := v_conv_canal;
        END IF;
        IF NEW.asignado_a_usuario_id IS NULL THEN
            NEW.asignado_a_usuario_id := v_conv_asignado;
        END IF;
    END IF;

    IF NEW.canal IS NULL AND NEW.conversacion_id IS NULL THEN
        IF NEW.metadata ? 'canal' THEN
            NEW.canal := NEW.metadata ->> 'canal';
        END IF;
    END IF;

    IF NEW.lead_score IS NULL AND NEW.conversacion_id IS NOT NULL THEN
        SELECT lead_score INTO NEW.lead_score
          FROM public.conversaciones_insights
         WHERE conversacion_id = NEW.conversacion_id;
    END IF;

    SELECT categoria INTO v_categoria
      FROM public.lead_etapas
     WHERE id = NEW.etapa_id;

    IF v_categoria IN ('ganada','perdida') THEN
        IF NEW.cerrado_en IS NULL THEN
            NEW.cerrado_en := now();
        END IF;
    ELSE
        NEW.cerrado_en := NULL;
        NEW.motivo_cierre := NULL;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_lead_tarjetas_before_write()
    IS 'Ajusta valores por defecto y sincroniza datos antes de insertar/actualizar tarjetas.';

CREATE OR REPLACE FUNCTION public.tg_lead_tarjetas_after_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_old_cat public.lead_categoria;
    v_new_cat public.lead_categoria;
    v_actor uuid;
BEGIN
    v_actor := coalesce(auth.uid(), NEW.asignado_a_usuario_id, NEW.propietario_usuario_id);

    SELECT categoria INTO v_new_cat FROM public.lead_etapas WHERE id = NEW.etapa_id;
    IF TG_OP = 'UPDATE' THEN
        SELECT categoria INTO v_old_cat FROM public.lead_etapas WHERE id = OLD.etapa_id;
    END IF;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.lead_movimientos (tarjeta_id, etapa_destino_id, cambiado_por, fuente, metadata)
        VALUES (NEW.id, NEW.etapa_id, v_actor, coalesce(NEW.fuente, 'api'), jsonb_build_object('evento', 'create'));
    ELSIF TG_OP = 'UPDATE' AND NEW.etapa_id IS DISTINCT FROM OLD.etapa_id THEN
        INSERT INTO public.lead_movimientos (tarjeta_id, etapa_origen_id, etapa_destino_id, cambiado_por, fuente, metadata)
        VALUES (
            NEW.id,
            OLD.etapa_id,
            NEW.etapa_id,
            v_actor,
            coalesce(NEW.fuente, 'humano'),
            jsonb_build_object('evento', 'move')
        );
    END IF;

    IF NEW.contacto_id IS NOT NULL THEN
        IF v_new_cat = 'ganada' THEN
            UPDATE public.contactos
               SET estado = 'activo'
             WHERE id = NEW.contacto_id;
        ELSIF v_new_cat = 'perdida' THEN
            UPDATE public.contactos
               SET estado = 'lead'
             WHERE id = NEW.contacto_id;
        ELSIF TG_OP = 'UPDATE' AND v_old_cat IN ('ganada','perdida') AND v_new_cat = 'abierta' THEN
            UPDATE public.contactos
               SET estado = 'lead'
             WHERE id = NEW.contacto_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_lead_tarjetas_after_write()
    IS 'Registra movimientos y sincroniza estados de contacto tras cambios en la tarjeta.';

DROP TRIGGER IF EXISTS lead_tableros_touch_updated_at ON public.lead_tableros;
CREATE TRIGGER lead_tableros_touch_updated_at
    BEFORE UPDATE ON public.lead_tableros
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

DROP TRIGGER IF EXISTS lead_etapas_touch_updated_at ON public.lead_etapas;
CREATE TRIGGER lead_etapas_touch_updated_at
    BEFORE UPDATE ON public.lead_etapas
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

DROP TRIGGER IF EXISTS lead_tarjetas_before_write ON public.lead_tarjetas;
CREATE TRIGGER lead_tarjetas_before_write
    BEFORE INSERT OR UPDATE ON public.lead_tarjetas
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_lead_tarjetas_before_write();

DROP TRIGGER IF EXISTS lead_tarjetas_after_write ON public.lead_tarjetas;
CREATE TRIGGER lead_tarjetas_after_write
    AFTER INSERT OR UPDATE ON public.lead_tarjetas
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_lead_tarjetas_after_write();

DROP TRIGGER IF EXISTS lead_recordatorios_touch_updated_at ON public.lead_recordatorios;
CREATE TRIGGER lead_recordatorios_touch_updated_at
    BEFORE UPDATE ON public.lead_recordatorios
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE OR REPLACE FUNCTION public.tg_sync_lead_score_from_insights()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE public.lead_tarjetas
       SET lead_score = NEW.lead_score,
           metadata = metadata || jsonb_build_object('siguiente_accion', NEW.siguiente_accion)
     WHERE conversacion_id = NEW.conversacion_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lead_tarjetas_sync_from_insights ON public.conversaciones_insights;
CREATE TRIGGER lead_tarjetas_sync_from_insights
    AFTER INSERT OR UPDATE ON public.conversaciones_insights
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_sync_lead_score_from_insights();

-- ======================================================================
-- Vista consolidada
-- ======================================================================

CREATE OR REPLACE VIEW public.embudo AS
SELECT
    lt.id,
    lt.tablero_id,
    lt.etapa_id,
    lt.contacto_id,
    ct.nombre_completo AS contacto_nombre,
    ct.estado AS contacto_estado,
    ct.telefono_e164 AS contacto_telefono,
    ct.correo AS contacto_correo,
    lt.conversacion_id,
    coalesce(lt.canal, conv.canal) AS canal,
    conv.estado AS conversacion_estado,
    conv.ultimo_mensaje_en,
    lt.monto_estimado,
    lt.moneda,
    lt.probabilidad_override,
    lt.lead_score,
    lt.tags,
    lt.metadata,
    lt.asignado_a_usuario_id,
    usr.nombre_completo AS asignado_nombre,
    lt.propietario_usuario_id,
    up.nombre_completo AS propietario_nombre,
    lt.cerrado_en,
    lt.motivo_cierre,
    lt.creado_en,
    lt.actualizado_en,
    ci.resumen,
    ci.intencion,
    ci.sentimiento,
    ci.siguiente_accion
FROM public.lead_tarjetas lt
JOIN public.contactos ct ON ct.id = lt.contacto_id
LEFT JOIN public.conversaciones conv ON conv.id = lt.conversacion_id
LEFT JOIN public.conversaciones_insights ci ON ci.conversacion_id = lt.conversacion_id
LEFT JOIN public.usuarios usr ON usr.id = lt.asignado_a_usuario_id
LEFT JOIN public.usuarios up ON up.id = lt.propietario_usuario_id;

GRANT SELECT ON public.embudo TO postgres, service_role, authenticated;

-- ======================================================================
-- Reglas de seguridad
-- ======================================================================

ALTER TABLE public.lead_tableros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_etapas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tarjetas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_recordatorios ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_tableros TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_etapas TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_tarjetas TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_movimientos TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_recordatorios TO postgres, service_role;

GRANT SELECT ON public.lead_tableros TO authenticated;
GRANT SELECT ON public.lead_etapas TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.lead_tarjetas TO authenticated;
GRANT SELECT ON public.lead_movimientos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_recordatorios TO authenticated;

CREATE POLICY lead_tableros_admin_all ON public.lead_tableros
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY lead_tableros_select_default ON public.lead_tableros
    FOR SELECT TO authenticated
    USING (public.puede_ver_tablero(id));

CREATE POLICY lead_etapas_admin_all ON public.lead_etapas
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY lead_etapas_select ON public.lead_etapas
    FOR SELECT TO authenticated
    USING (public.puede_ver_tablero(tablero_id));

CREATE POLICY lead_tarjetas_admin_all ON public.lead_tarjetas
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY lead_tarjetas_member_select ON public.lead_tarjetas
    FOR SELECT TO authenticated
    USING (public.puede_ver_lead(id));

CREATE POLICY lead_tarjetas_member_update ON public.lead_tarjetas
    FOR UPDATE TO authenticated
    USING (public.puede_ver_lead(id))
    WITH CHECK (public.puede_ver_lead(id));

CREATE POLICY lead_tarjetas_member_delete ON public.lead_tarjetas
    FOR DELETE TO authenticated
    USING (public.puede_ver_lead(id));

CREATE POLICY lead_tarjetas_member_insert ON public.lead_tarjetas
    FOR INSERT TO authenticated
    WITH CHECK (
        public.es_admin(auth.uid())
        OR auth.uid() = propietario_usuario_id
        OR auth.uid() = asignado_a_usuario_id
        OR EXISTS (
            SELECT 1
              FROM public.contactos ct
             WHERE ct.id = contacto_id
               AND ct.propietario_usuario_id = auth.uid()
        )
    );

CREATE POLICY lead_movimientos_admin_all ON public.lead_movimientos
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY lead_movimientos_select ON public.lead_movimientos
    FOR SELECT TO authenticated
    USING (public.puede_ver_lead(tarjeta_id));

CREATE POLICY lead_recordatorios_admin_all ON public.lead_recordatorios
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY lead_recordatorios_crud ON public.lead_recordatorios
    FOR ALL TO authenticated
    USING (public.puede_ver_lead(tarjeta_id))
    WITH CHECK (public.puede_ver_lead(tarjeta_id));

-- ======================================================================
-- Sincronización con conversaciones (creación automática de tarjetas)
-- ======================================================================

CREATE OR REPLACE FUNCTION public.tg_conversaciones_auto_tarjeta()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_tablero uuid;
    v_etapa uuid;
BEGIN
    IF NEW.estado = 'cerrada' THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.lead_tarjetas lt
         WHERE lt.conversacion_id = NEW.id
    ) THEN
        RETURN NEW;
    END IF;

    SELECT id INTO v_tablero
      FROM public.lead_tableros
     WHERE es_default = TRUE
     ORDER BY creado_en
     LIMIT 1;

    IF v_tablero IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT id INTO v_etapa
      FROM public.lead_etapas
     WHERE tablero_id = v_tablero
     ORDER BY orden
     LIMIT 1;

    IF v_etapa IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.lead_tarjetas (
        contacto_id,
        conversacion_id,
        tablero_id,
        etapa_id,
        canal,
        propietario_usuario_id,
        asignado_a_usuario_id,
        fuente,
        metadata
    )
    VALUES (
        NEW.contacto_id,
        NEW.id,
        v_tablero,
        v_etapa,
        NEW.canal,
        NEW.asignado_a_usuario_id,
        NEW.asignado_a_usuario_id,
        'asistente',
        jsonb_build_object('auto', true, 'motivo', 'conversacion_nueva')
    )
    ON CONFLICT DO NOTHING;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_conversaciones_auto_tarjeta()
    IS 'Crea una tarjeta de lead cuando inicia una conversación ligada a un lead.';

DROP TRIGGER IF EXISTS conversaciones_auto_tarjeta ON public.conversaciones;
CREATE TRIGGER conversaciones_auto_tarjeta
    AFTER INSERT ON public.conversaciones
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_conversaciones_auto_tarjeta();

COMMIT;
