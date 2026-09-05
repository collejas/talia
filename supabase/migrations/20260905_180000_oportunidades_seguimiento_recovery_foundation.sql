BEGIN;

-- Fundamento del seguimiento y recuperación de oportunidades.
-- Esta migración es aditiva: no elimina datos ni cambia la etapa comercial existente.

ALTER TABLE public.oportunidades
    ADD COLUMN IF NOT EXISTS ultima_actividad_en timestamptz,
    ADD COLUMN IF NOT EXISTS ultima_interaccion_contacto_en timestamptz,
    ADD COLUMN IF NOT EXISTS ultimo_contacto_saliente_en timestamptz,
    ADD COLUMN IF NOT EXISTS proxima_actividad_en timestamptz,
    ADD COLUMN IF NOT EXISTS etapa_cambiada_en timestamptz,
    ADD COLUMN IF NOT EXISTS estado_seguimiento text NOT NULL DEFAULT 'activo',
    ADD COLUMN IF NOT EXISTS temperatura text,
    ADD COLUMN IF NOT EXISTS estrategia_seguimiento text NOT NULL DEFAULT 'seguimiento_normal',
    ADD COLUMN IF NOT EXISTS reactivada_en timestamptz,
    ADD COLUMN IF NOT EXISTS numero_reactivaciones integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ultimo_intento_reactivacion_en timestamptz,
    ADD COLUMN IF NOT EXISTS intentos_reactivacion integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS prioridad_reactivacion numeric(5,2);

-- La fecha operativa de cambio de etapa se reconstruye desde el historial existente.
UPDATE public.oportunidades o
SET etapa_cambiada_en = COALESCE(
    (
        SELECT max(h.cambiado_en)
        FROM public.oportunidad_etapas_historial h
        WHERE h.organizacion_id = o.organizacion_id
          AND h.oportunidad_id = o.id
    ),
    o.creado_en
)
WHERE o.etapa_cambiada_en IS NULL;

ALTER TABLE public.oportunidades
    ALTER COLUMN estado_seguimiento SET DEFAULT 'activo',
    ALTER COLUMN estrategia_seguimiento SET DEFAULT 'seguimiento_normal',
    ALTER COLUMN numero_reactivaciones SET DEFAULT 0,
    ALTER COLUMN intentos_reactivacion SET DEFAULT 0;

ALTER TABLE public.oportunidades
    ADD CONSTRAINT oportunidades_estado_seguimiento_chk
        CHECK (estado_seguimiento IN ('activo', 'en_riesgo', 'estancado', 'dormido')),
    ADD CONSTRAINT oportunidades_temperatura_chk
        CHECK (temperatura IS NULL OR temperatura IN ('caliente', 'tibio', 'frio')),
    ADD CONSTRAINT oportunidades_estrategia_seguimiento_chk
        CHECK (estrategia_seguimiento IN ('seguimiento_normal', 'reactivacion', 'nurturing', 'no_contactar')),
    ADD CONSTRAINT oportunidades_reactivaciones_nonnegative_chk
        CHECK (numero_reactivaciones >= 0),
    ADD CONSTRAINT oportunidades_intentos_reactivacion_nonnegative_chk
        CHECK (intentos_reactivacion >= 0),
    ADD CONSTRAINT oportunidades_prioridad_reactivacion_range_chk
        CHECK (prioridad_reactivacion IS NULL OR (prioridad_reactivacion >= 0 AND prioridad_reactivacion <= 100));

CREATE INDEX IF NOT EXISTS oportunidades_org_seguimiento_etapa_idx
    ON public.oportunidades (organizacion_id, estado_seguimiento, etapa_id, etapa_cambiada_en DESC);

CREATE INDEX IF NOT EXISTS oportunidades_org_interaccion_idx
    ON public.oportunidades (organizacion_id, ultima_interaccion_contacto_en DESC)
    WHERE ultima_interaccion_contacto_en IS NOT NULL;

CREATE INDEX IF NOT EXISTS oportunidades_org_proxima_actividad_idx
    ON public.oportunidades (organizacion_id, proxima_actividad_en ASC)
    WHERE proxima_actividad_en IS NOT NULL;

CREATE INDEX IF NOT EXISTS oportunidades_org_temperatura_estado_idx
    ON public.oportunidades (organizacion_id, temperatura, estado_seguimiento);

CREATE TABLE public.oportunidad_eventos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    oportunidad_id uuid NOT NULL,
    tipo_evento text NOT NULL,
    etapa_anterior_id uuid,
    etapa_nueva_id uuid,
    estado_anterior text,
    estado_nuevo text,
    temperatura_anterior text,
    temperatura_nueva text,
    estrategia_anterior text,
    estrategia_nueva text,
    valor_oportunidad numeric,
    usuario_id uuid,
    automatizacion_id uuid,
    evento_origen_id uuid,
    canal text,
    ventana_atribucion_dias integer,
    motivo text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT oportunidad_eventos_tipo_chk CHECK (
        tipo_evento IN (
            'OPORTUNIDAD_ESTANCADA',
            'OPORTUNIDAD_DORMIDA',
            'OPORTUNIDAD_ELEGIBLE_RECUPERACION',
            'INTENTO_REACTIVACION',
            'OPORTUNIDAD_REACTIVADA',
            'CAMBIO_ETAPA',
            'CAMBIO_ESTADO_SEGUIMIENTO',
            'CAMBIO_TEMPERATURA',
            'CAMBIO_ESTRATEGIA',
            'OPORTUNIDAD_GANADA',
            'OPORTUNIDAD_PERDIDA'
        )
    ),
    CONSTRAINT oportunidad_eventos_valor_nonnegative_chk
        CHECK (valor_oportunidad IS NULL OR valor_oportunidad >= 0),
    CONSTRAINT oportunidad_eventos_ventana_positive_chk
        CHECK (ventana_atribucion_dias IS NULL OR ventana_atribucion_dias > 0),
    CONSTRAINT oportunidad_eventos_oportunidad_org_fkey
        FOREIGN KEY (organizacion_id, oportunidad_id)
        REFERENCES public.oportunidades (organizacion_id, id)
        ON DELETE CASCADE,
    CONSTRAINT oportunidad_eventos_etapa_anterior_org_fkey
        FOREIGN KEY (organizacion_id, etapa_anterior_id)
        REFERENCES public.etapas_pipeline (organizacion_id, id)
        ON DELETE SET NULL,
    CONSTRAINT oportunidad_eventos_etapa_nueva_org_fkey
        FOREIGN KEY (organizacion_id, etapa_nueva_id)
        REFERENCES public.etapas_pipeline (organizacion_id, id)
        ON DELETE SET NULL,
    CONSTRAINT oportunidad_eventos_origen_fkey
        FOREIGN KEY (evento_origen_id)
        REFERENCES public.oportunidad_eventos (id)
        ON DELETE SET NULL
);

CREATE INDEX oportunidad_eventos_org_created_idx
    ON public.oportunidad_eventos (organizacion_id, created_at DESC);

CREATE INDEX oportunidad_eventos_org_oportunidad_created_idx
    ON public.oportunidad_eventos (organizacion_id, oportunidad_id, created_at DESC);

CREATE INDEX oportunidad_eventos_org_tipo_created_idx
    ON public.oportunidad_eventos (organizacion_id, tipo_evento, created_at DESC);

CREATE INDEX oportunidad_eventos_org_origen_idx
    ON public.oportunidad_eventos (organizacion_id, evento_origen_id)
    WHERE evento_origen_id IS NOT NULL;

CREATE TABLE public.pipeline_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    fecha date NOT NULL,
    pipeline_valor numeric NOT NULL DEFAULT 0,
    oportunidades_abiertas bigint NOT NULL DEFAULT 0,
    activas bigint NOT NULL DEFAULT 0,
    en_riesgo bigint NOT NULL DEFAULT 0,
    estancadas bigint NOT NULL DEFAULT 0,
    dormidas bigint NOT NULL DEFAULT 0,
    valor_detenido numeric NOT NULL DEFAULT 0,
    valor_sin_proxima_actividad numeric NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pipeline_snapshots_org_fecha_key UNIQUE (organizacion_id, fecha),
    CONSTRAINT pipeline_snapshots_organizacion_fkey
        FOREIGN KEY (organizacion_id)
        REFERENCES public.organizaciones (id)
        ON DELETE CASCADE,
    CONSTRAINT pipeline_snapshots_counts_nonnegative_chk CHECK (
        oportunidades_abiertas >= 0 AND activas >= 0 AND en_riesgo >= 0
        AND estancadas >= 0 AND dormidas >= 0
    ),
    CONSTRAINT pipeline_snapshots_values_nonnegative_chk CHECK (
        pipeline_valor >= 0 AND valor_detenido >= 0 AND valor_sin_proxima_actividad >= 0
    )
);

CREATE INDEX pipeline_snapshots_org_fecha_idx
    ON public.pipeline_snapshots (organizacion_id, fecha DESC);

CREATE TABLE public.oportunidad_seguimiento_configuracion (
    organizacion_id uuid PRIMARY KEY,
    dias_activo_hasta integer NOT NULL DEFAULT 7,
    dias_en_riesgo_hasta integer NOT NULL DEFAULT 15,
    dias_estancado_hasta integer NOT NULL DEFAULT 30,
    dias_dormido_desde integer NOT NULL DEFAULT 31,
    ventana_reactivacion_dias integer NOT NULL DEFAULT 30,
    ventana_universo_reactivacion_dias integer NOT NULL DEFAULT 30,
    max_intentos_reactivacion integer NOT NULL DEFAULT 3,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT oportunidad_seguimiento_configuracion_org_fkey
        FOREIGN KEY (organizacion_id)
        REFERENCES public.organizaciones (id)
        ON DELETE CASCADE,
    CONSTRAINT oportunidad_seguimiento_configuracion_days_chk CHECK (
        dias_activo_hasta >= 0
        AND dias_en_riesgo_hasta > dias_activo_hasta
        AND dias_estancado_hasta > dias_en_riesgo_hasta
        AND dias_dormido_desde > dias_estancado_hasta
        AND ventana_reactivacion_dias > 0
        AND ventana_universo_reactivacion_dias > 0
        AND max_intentos_reactivacion >= 0
    )
);

INSERT INTO public.oportunidad_seguimiento_configuracion (organizacion_id)
SELECT id FROM public.organizaciones
ON CONFLICT (organizacion_id) DO NOTHING;

CREATE TABLE public.oportunidad_temperatura_niveles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    codigo text NOT NULL,
    nombre text NOT NULL,
    score_min numeric(5,2) NOT NULL,
    score_max numeric(5,2) NOT NULL,
    orden smallint NOT NULL,
    activo boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT oportunidad_temperatura_niveles_org_codigo_key UNIQUE (organizacion_id, codigo),
    CONSTRAINT oportunidad_temperatura_niveles_org_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones (id) ON DELETE CASCADE,
    CONSTRAINT oportunidad_temperatura_niveles_score_chk CHECK (
        score_min >= 0 AND score_max <= 100 AND score_min <= score_max
    )
);

CREATE INDEX oportunidad_temperatura_niveles_org_orden_idx
    ON public.oportunidad_temperatura_niveles (organizacion_id, orden);

INSERT INTO public.oportunidad_temperatura_niveles
    (organizacion_id, codigo, nombre, score_min, score_max, orden)
SELECT o.id, v.codigo, v.nombre, v.score_min, v.score_max, v.orden
FROM public.organizaciones o
CROSS JOIN (VALUES
    ('caliente', 'Caliente', 70::numeric, 100::numeric, 1::smallint),
    ('tibio', 'Tibio', 35::numeric, 69.99::numeric, 2::smallint),
    ('frio', 'Frío', 0::numeric, 34.99::numeric, 3::smallint)
) AS v(codigo, nombre, score_min, score_max, orden)
ON CONFLICT (organizacion_id, codigo) DO NOTHING;

CREATE TABLE public.oportunidad_temperatura_senales (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    codigo text NOT NULL,
    nombre text NOT NULL,
    puntaje numeric(6,2) NOT NULL DEFAULT 0,
    decaimiento_dias integer,
    activo boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT oportunidad_temperatura_senales_org_codigo_key UNIQUE (organizacion_id, codigo),
    CONSTRAINT oportunidad_temperatura_senales_org_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones (id) ON DELETE CASCADE,
    CONSTRAINT oportunidad_temperatura_senales_decaimiento_chk
        CHECK (decaimiento_dias IS NULL OR decaimiento_dias > 0)
);

CREATE INDEX oportunidad_temperatura_senales_org_activo_idx
    ON public.oportunidad_temperatura_senales (organizacion_id, activo);

CREATE TABLE public.oportunidad_seguimiento_estrategias (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL,
    codigo text NOT NULL,
    nombre text NOT NULL,
    requiere_aprobacion boolean NOT NULL DEFAULT true,
    max_intentos integer NOT NULL DEFAULT 3,
    frecuencia_minima_dias integer NOT NULL DEFAULT 7,
    activo boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT oportunidad_seguimiento_estrategias_org_codigo_key UNIQUE (organizacion_id, codigo),
    CONSTRAINT oportunidad_seguimiento_estrategias_org_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones (id) ON DELETE CASCADE,
    CONSTRAINT oportunidad_seguimiento_estrategias_limits_chk CHECK (
        max_intentos >= 0 AND frecuencia_minima_dias >= 0
    )
);

CREATE INDEX oportunidad_seguimiento_estrategias_org_activo_idx
    ON public.oportunidad_seguimiento_estrategias (organizacion_id, activo);

INSERT INTO public.oportunidad_seguimiento_estrategias
    (organizacion_id, codigo, nombre, requiere_aprobacion, max_intentos, frecuencia_minima_dias)
SELECT o.id, v.codigo, v.nombre, v.requiere_aprobacion, v.max_intentos, v.frecuencia_minima_dias
FROM public.organizaciones o
CROSS JOIN (VALUES
    ('seguimiento_normal', 'Seguimiento normal', false, 3, 3),
    ('reactivacion', 'Reactivación', true, 3, 7),
    ('nurturing', 'Nurturing', true, 6, 30),
    ('no_contactar', 'No contactar', false, 0, 0)
) AS v(codigo, nombre, requiere_aprobacion, max_intentos, frecuencia_minima_dias)
ON CONFLICT (organizacion_id, codigo) DO NOTHING;

-- Mantiene etapa_cambiada_en actualizado para las operaciones actuales del CRM.
CREATE OR REPLACE FUNCTION public.sync_oportunidad_seguimiento_operativo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.etapa_id IS DISTINCT FROM NEW.etapa_id THEN
        NEW.etapa_cambiada_en := now();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS oportunidades_sync_seguimiento_operativo ON public.oportunidades;
CREATE TRIGGER oportunidades_sync_seguimiento_operativo
BEFORE UPDATE OF etapa_id ON public.oportunidades
FOR EACH ROW
EXECUTE FUNCTION public.sync_oportunidad_seguimiento_operativo();

-- Proyecta cambios relevantes a la bitácora de eventos de recuperación.
CREATE OR REPLACE FUNCTION public.registrar_oportunidad_evento_seguimiento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.etapa_id IS DISTINCT FROM NEW.etapa_id THEN
        INSERT INTO public.oportunidad_eventos (
            organizacion_id, oportunidad_id, tipo_evento,
            etapa_anterior_id, etapa_nueva_id, valor_oportunidad
        ) VALUES (
            NEW.organizacion_id, NEW.id, 'CAMBIO_ETAPA',
            OLD.etapa_id, NEW.etapa_id, NEW.monto_estimado
        );
    END IF;

    IF OLD.estado_seguimiento IS DISTINCT FROM NEW.estado_seguimiento THEN
        INSERT INTO public.oportunidad_eventos (
            organizacion_id, oportunidad_id, tipo_evento,
            estado_anterior, estado_nuevo, valor_oportunidad
        ) VALUES (
            NEW.organizacion_id, NEW.id, 'CAMBIO_ESTADO_SEGUIMIENTO',
            OLD.estado_seguimiento, NEW.estado_seguimiento, NEW.monto_estimado
        );
    END IF;

    IF OLD.temperatura IS DISTINCT FROM NEW.temperatura THEN
        INSERT INTO public.oportunidad_eventos (
            organizacion_id, oportunidad_id, tipo_evento,
            temperatura_anterior, temperatura_nueva, valor_oportunidad
        ) VALUES (
            NEW.organizacion_id, NEW.id, 'CAMBIO_TEMPERATURA',
            OLD.temperatura, NEW.temperatura, NEW.monto_estimado
        );
    END IF;

    IF OLD.estrategia_seguimiento IS DISTINCT FROM NEW.estrategia_seguimiento THEN
        INSERT INTO public.oportunidad_eventos (
            organizacion_id, oportunidad_id, tipo_evento,
            estrategia_anterior, estrategia_nueva, valor_oportunidad
        ) VALUES (
            NEW.organizacion_id, NEW.id, 'CAMBIO_ESTRATEGIA',
            OLD.estrategia_seguimiento, NEW.estrategia_seguimiento, NEW.monto_estimado
        );
    END IF;

    IF OLD.estado IS DISTINCT FROM NEW.estado AND NEW.estado = 'ganada' THEN
        INSERT INTO public.oportunidad_eventos (
            organizacion_id, oportunidad_id, tipo_evento, valor_oportunidad
        ) VALUES (
            NEW.organizacion_id, NEW.id, 'OPORTUNIDAD_GANADA', NEW.monto_estimado
        );
    ELSIF OLD.estado IS DISTINCT FROM NEW.estado AND NEW.estado = 'perdida' THEN
        INSERT INTO public.oportunidad_eventos (
            organizacion_id, oportunidad_id, tipo_evento, valor_oportunidad, motivo
        ) VALUES (
            NEW.organizacion_id, NEW.id, 'OPORTUNIDAD_PERDIDA', NEW.monto_estimado, NEW.motivo_perdida
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS oportunidades_registrar_seguimiento_evento ON public.oportunidades;
CREATE TRIGGER oportunidades_registrar_seguimiento_evento
AFTER UPDATE OF etapa_id, estado, estado_seguimiento, temperatura, estrategia_seguimiento
ON public.oportunidades
FOR EACH ROW
EXECUTE FUNCTION public.registrar_oportunidad_evento_seguimiento();

-- Las tablas nuevas solo son accesibles directamente por el backend con service_role.
-- La autorización de usuario y alcance se mantiene en la API/BFF existente.
ALTER TABLE public.oportunidad_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oportunidad_seguimiento_configuracion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oportunidad_temperatura_niveles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oportunidad_temperatura_senales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oportunidad_seguimiento_estrategias ENABLE ROW LEVEL SECURITY;

CREATE POLICY oportunidad_eventos_service_role_all
    ON public.oportunidad_eventos FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY pipeline_snapshots_service_role_all
    ON public.pipeline_snapshots FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY oportunidad_seguimiento_configuracion_service_role_all
    ON public.oportunidad_seguimiento_configuracion FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY oportunidad_temperatura_niveles_service_role_all
    ON public.oportunidad_temperatura_niveles FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY oportunidad_temperatura_senales_service_role_all
    ON public.oportunidad_temperatura_senales FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY oportunidad_seguimiento_estrategias_service_role_all
    ON public.oportunidad_seguimiento_estrategias FOR ALL TO service_role
    USING (true) WITH CHECK (true);

GRANT ALL ON public.oportunidad_eventos TO service_role;
GRANT ALL ON public.pipeline_snapshots TO service_role;
GRANT ALL ON public.oportunidad_seguimiento_configuracion TO service_role;
GRANT ALL ON public.oportunidad_temperatura_niveles TO service_role;
GRANT ALL ON public.oportunidad_temperatura_senales TO service_role;
GRANT ALL ON public.oportunidad_seguimiento_estrategias TO service_role;

COMMENT ON TABLE public.oportunidad_eventos IS
    'Bitácora auditable de seguimiento, recuperación, temperatura, estrategia y resultados de oportunidades.';
COMMENT ON TABLE public.pipeline_snapshots IS
    'Fotografías diarias del pipeline por organización para tendencias y KPIs históricos.';
COMMENT ON COLUMN public.oportunidades.ultima_interaccion_contacto_en IS
    'Última respuesta o acción atribuible al prospecto; no se actualiza por un contacto saliente del vendedor.';
COMMENT ON COLUMN public.oportunidades.etapa_cambiada_en IS
    'Momento del último cambio de etapa comercial, mantenido para consultas operativas de aging.';

COMMIT;
