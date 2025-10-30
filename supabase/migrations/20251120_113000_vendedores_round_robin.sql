BEGIN;

ALTER TABLE public.empleados
    ADD COLUMN IF NOT EXISTS es_vendedor boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS ultimo_lead_asignado_en timestamptz;

CREATE INDEX IF NOT EXISTS idx_empleados_es_vendedor ON public.empleados (es_vendedor, ultimo_lead_asignado_en);

WITH sdr_puesto AS (
    SELECT id
    FROM public.puestos
    WHERE lower(nombre) = lower('Sales Development Representative (SDR)')
    LIMIT 1
)
UPDATE public.empleados e
SET es_vendedor = TRUE
FROM sdr_puesto p
WHERE p.id IS NOT NULL
  AND e.puesto_id = p.id;

CREATE OR REPLACE FUNCTION public.next_vendedor_round_robin()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_usuario uuid;
BEGIN
    SELECT usuario_id
      INTO v_usuario
      FROM public.empleados
     WHERE es_vendedor = TRUE
     ORDER BY COALESCE(ultimo_lead_asignado_en, to_timestamp(0)), creado_en, usuario_id
     FOR UPDATE SKIP LOCKED
     LIMIT 1;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    UPDATE public.empleados
       SET ultimo_lead_asignado_en = now()
     WHERE usuario_id = v_usuario;

    RETURN v_usuario;
END;
$$;

COMMENT ON FUNCTION public.next_vendedor_round_robin()
    IS 'Regresa el siguiente vendedor disponible usando un round robin simple y actualiza su marca temporal.';

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
    v_round_robin uuid := NULL;
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

    IF NEW.asignado_a_usuario_id IS NULL THEN
        SELECT public.next_vendedor_round_robin() INTO v_round_robin;
        IF v_round_robin IS NOT NULL THEN
            NEW.asignado_a_usuario_id := v_round_robin;
        END IF;
    END IF;

    IF NEW.conversacion_id IS NOT NULL
       AND NEW.asignado_a_usuario_id IS NOT NULL
       AND v_conv_asignado IS NULL
       AND v_round_robin IS NOT NULL THEN
        UPDATE public.conversaciones
           SET asignado_a_usuario_id = NEW.asignado_a_usuario_id
         WHERE id = NEW.conversacion_id
           AND asignado_a_usuario_id IS NULL;
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
    IS 'Normaliza campos de tarjetas, asigna tablero/etapa por defecto y resuelve vendedor en round robin cuando falta asignación.';

UPDATE public.empleados e
SET ultimo_lead_asignado_en = NULL
WHERE es_vendedor = FALSE;

CREATE OR REPLACE VIEW public.v_configuracion_personal AS
SELECT
    u.id AS usuario_id,
    u.correo,
    u.nombre_completo,
    u.estado,
    u.telefono_e164,
    u.ultimo_acceso_en,
    u.creado_en AS usuario_creado_en,
    e.es_gestor,
    e.creado_en AS empleado_creado_en,
    e.departamento_id,
    d.nombre AS departamento_nombre,
    e.puesto_id,
    p.nombre AS puesto_nombre,
    p.descripcion AS puesto_descripcion,
    COALESCE(
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'rol_id', ur.rol_id,
                    'codigo', r.codigo,
                    'nombre', r.nombre
                )
                ORDER BY r.codigo
            )
            FROM public.usuarios_roles ur
            JOIN public.roles r ON r.id = ur.rol_id
            WHERE ur.usuario_id = u.id
        ),
        '[]'::jsonb
    ) AS roles,
    e.es_vendedor,
    e.ultimo_lead_asignado_en
FROM public.usuarios u
LEFT JOIN public.empleados e ON e.usuario_id = u.id
LEFT JOIN public.departamentos d ON d.id = e.departamento_id
LEFT JOIN public.puestos p ON p.id = e.puesto_id;

GRANT SELECT ON public.v_configuracion_personal TO authenticated, service_role;

COMMIT;
