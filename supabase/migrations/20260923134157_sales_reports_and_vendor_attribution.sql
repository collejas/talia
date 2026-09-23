BEGIN;

-- Snapshot the opportunity's assigned seller when a sale is formalized.
ALTER TABLE public.ventas
    ADD COLUMN IF NOT EXISTS vendedor_usuario_id uuid;

UPDATE public.ventas AS v
SET vendedor_usuario_id = o.asignado_a_usuario_id
FROM public.oportunidades AS o
JOIN public.usuarios AS u
  ON u.organizacion_id = o.organizacion_id
 AND u.id = o.asignado_a_usuario_id
WHERE o.organizacion_id = v.organizacion_id
  AND o.id = v.oportunidad_id
  AND v.vendedor_usuario_id IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = 'ventas_vendedor_org_fkey'
    ) THEN
        ALTER TABLE public.ventas
            ADD CONSTRAINT ventas_vendedor_org_fkey
            FOREIGN KEY (organizacion_id, vendedor_usuario_id)
            REFERENCES public.usuarios (organizacion_id, id)
            ON DELETE RESTRICT;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS ventas_org_vendedor_fecha_idx
    ON public.ventas (organizacion_id, vendedor_usuario_id, fecha_venta DESC);

CREATE INDEX IF NOT EXISTS pagos_org_venta_fecha_confirmacion_idx
    ON public.pagos (organizacion_id, venta_id, fecha_confirmacion DESC)
    WHERE estatus = 'confirmado';

CREATE OR REPLACE FUNCTION public.ventas_set_vendedor_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
    IF NEW.vendedor_usuario_id IS NULL THEN
        SELECT u.id
          INTO NEW.vendedor_usuario_id
          FROM public.oportunidades AS o
          JOIN public.usuarios AS u
            ON u.organizacion_id = NEW.organizacion_id
           AND u.id = o.asignado_a_usuario_id
         WHERE o.organizacion_id = NEW.organizacion_id
           AND o.id = NEW.oportunidad_id;
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS ventas_snapshot_vendedor_before_insert ON public.ventas;
CREATE TRIGGER ventas_snapshot_vendedor_before_insert
BEFORE INSERT ON public.ventas
FOR EACH ROW EXECUTE FUNCTION public.ventas_set_vendedor_snapshot();

REVOKE ALL ON FUNCTION public.ventas_set_vendedor_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ventas_set_vendedor_snapshot() TO service_role;

-- The report RPC is backend-only. API code must calculate allowed seller IDs
-- from the authenticated user's permissions before calling this function.
CREATE OR REPLACE FUNCTION public.crm_reporte_ventas(
    p_organizacion_id uuid,
    p_desde date,
    p_hasta date,
    p_timezone text DEFAULT 'UTC',
    p_estatus text DEFAULT NULL,
    p_vendedor_usuario_id uuid DEFAULT NULL,
    p_vendedor_usuario_ids uuid[] DEFAULT NULL,
    p_moneda text DEFAULT NULL,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
WITH pagos_por_venta AS (
    SELECT
        p.organizacion_id,
        p.venta_id,
        sum(p.monto) FILTER (WHERE p.estatus = 'confirmado') AS cobrado_neto,
        sum(CASE WHEN p.estatus = 'confirmado'
                       AND (p.fecha_confirmacion AT TIME ZONE p_timezone)::date BETWEEN p_desde AND p_hasta
                 THEN p.monto ELSE 0 END) AS movimiento_periodo
    FROM public.pagos AS p
    JOIN public.ventas AS v
      ON v.organizacion_id = p.organizacion_id AND v.id = p.venta_id
    WHERE p.organizacion_id = p_organizacion_id
      AND (p_vendedor_usuario_ids IS NULL OR v.vendedor_usuario_id = ANY(p_vendedor_usuario_ids))
      AND (p_vendedor_usuario_id IS NULL OR v.vendedor_usuario_id = p_vendedor_usuario_id)
      AND (p_moneda IS NULL OR upper(v.moneda) = upper(p_moneda))
      AND (p_estatus IS NULL OR v.estatus = p_estatus)
    GROUP BY p.organizacion_id, p.venta_id
),
ventas_scope AS (
    SELECT v.*,
           COALESCE(NULLIF(trim(c.razon_social), ''), NULLIF(trim(persona.nombre_completo), ''), 'Cliente sin nombre') AS cliente_nombre,
           u.nombre_completo AS vendedor_nombre,
           o.codigo_oportunidad,
           o.titulo AS oportunidad_titulo,
           COALESCE(pv.cobrado_neto, 0)::numeric(14,2) AS cobrado_neto,
           COALESCE(pv.movimiento_periodo, 0)::numeric(14,2) AS movimiento_periodo
    FROM public.ventas AS v
    LEFT JOIN public.clientes AS c
      ON c.organizacion_id = v.organizacion_id AND c.id = v.cliente_id
    LEFT JOIN public.personas AS persona
      ON persona.organizacion_id = c.organizacion_id AND persona.id = c.persona_id
    LEFT JOIN public.usuarios AS u
      ON u.organizacion_id = v.organizacion_id AND u.id = v.vendedor_usuario_id
    LEFT JOIN public.oportunidades AS o
      ON o.organizacion_id = v.organizacion_id AND o.id = v.oportunidad_id
    LEFT JOIN pagos_por_venta AS pv
      ON pv.organizacion_id = v.organizacion_id AND pv.venta_id = v.id
    WHERE v.organizacion_id = p_organizacion_id
      AND (p_vendedor_usuario_ids IS NULL OR v.vendedor_usuario_id = ANY(p_vendedor_usuario_ids))
      AND (p_vendedor_usuario_id IS NULL OR v.vendedor_usuario_id = p_vendedor_usuario_id)
      AND (p_moneda IS NULL OR upper(v.moneda) = upper(p_moneda))
      AND (p_estatus IS NULL OR v.estatus = p_estatus)
),
monedas_scope AS (
    SELECT DISTINCT btrim(upper(v.moneda)) AS moneda
    FROM public.ventas AS v
    WHERE v.organizacion_id = p_organizacion_id
      AND (p_vendedor_usuario_ids IS NULL OR v.vendedor_usuario_id = ANY(p_vendedor_usuario_ids))
      AND (p_vendedor_usuario_id IS NULL OR v.vendedor_usuario_id = p_vendedor_usuario_id)
),
ventas_periodo AS (
    SELECT * FROM ventas_scope
    WHERE fecha_venta >= (p_desde::timestamp AT TIME ZONE p_timezone)
      AND fecha_venta < ((p_hasta + 1)::timestamp AT TIME ZONE p_timezone)
),
resumen AS (
    SELECT
        count(*) FILTER (WHERE estatus NOT IN ('cancelada', 'reembolsada')) AS numero_ventas,
        COALESCE(sum(total) FILTER (WHERE estatus NOT IN ('cancelada', 'reembolsada')), 0) AS total_vendido,
        (SELECT COALESCE(sum(movimiento_periodo), 0) FROM ventas_scope) AS total_cobrado_periodo,
        COALESCE(sum(GREATEST(total - cobrado_neto, 0)) FILTER (WHERE estatus NOT IN ('cancelada', 'reembolsada')), 0) AS saldo_pendiente,
        count(*) FILTER (WHERE estatus = 'pago_parcial') AS numero_pagos_parciales,
        count(*) FILTER (WHERE estatus = 'pendiente_pago') AS numero_pendientes_pago,
        count(*) FILTER (WHERE estatus = 'pagada') AS numero_pagadas
    FROM ventas_periodo
),
meses AS (
    SELECT date_trunc('month', d)::date AS mes
    FROM generate_series(
        date_trunc('month', p_desde::timestamp),
        date_trunc('month', p_hasta::timestamp),
        interval '1 month'
    ) AS d
),
ventas_mensuales AS (
    SELECT date_trunc('month', fecha_venta AT TIME ZONE p_timezone)::date AS mes,
           sum(total) FILTER (WHERE estatus NOT IN ('cancelada', 'reembolsada')) AS vendido
    FROM ventas_periodo
    GROUP BY 1
),
pagos_mensuales AS (
    SELECT date_trunc('month', p.fecha_confirmacion AT TIME ZONE p_timezone)::date AS mes,
           sum(p.monto) AS cobrado
    FROM public.pagos AS p
    JOIN ventas_scope AS v ON v.organizacion_id = p.organizacion_id AND v.id = p.venta_id
    WHERE p.organizacion_id = p_organizacion_id
      AND p.estatus = 'confirmado'
      AND (p.fecha_confirmacion AT TIME ZONE p_timezone)::date BETWEEN p_desde AND p_hasta
    GROUP BY 1
),
pagina AS (
    SELECT id, cliente_id, cliente_nombre, oportunidad_id, codigo_oportunidad,
           oportunidad_titulo, vendedor_usuario_id,
           COALESCE(NULLIF(trim(vendedor_nombre), ''), 'Sin vendedor') AS vendedor_nombre,
           fecha_venta, total, cobrado_neto AS total_cobrado,
           GREATEST(total - cobrado_neto, 0) AS saldo_pendiente,
           estatus, btrim(moneda) AS moneda
    FROM ventas_periodo
    ORDER BY fecha_venta DESC, id DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0)
)
SELECT jsonb_build_object(
    'resumen', (SELECT to_jsonb(resumen) FROM resumen),
    'serie', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'mes', to_char(meses.mes, 'YYYY-MM'),
            'total_vendido', COALESCE(ventas_mensuales.vendido, 0),
            'total_cobrado', COALESCE(pagos_mensuales.cobrado, 0)
        ) ORDER BY meses.mes)
        FROM meses
        LEFT JOIN ventas_mensuales USING (mes)
        LEFT JOIN pagos_mensuales USING (mes)
    ), '[]'::jsonb),
    'items', COALESCE((SELECT jsonb_agg(to_jsonb(pagina) ORDER BY fecha_venta DESC, id DESC) FROM pagina), '[]'::jsonb),
    'total', (SELECT count(*) FROM ventas_periodo),
    'monedas', COALESCE((
        SELECT jsonb_agg(moneda ORDER BY moneda)
        FROM monedas_scope
    ), '[]'::jsonb)
);
$function$;

REVOKE ALL ON FUNCTION public.crm_reporte_ventas(uuid, date, date, text, text, uuid, uuid[], text, integer, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_reporte_ventas(uuid, date, date, text, text, uuid, uuid[], text, integer, integer)
    TO service_role;

INSERT INTO public.tenant_default_permissions (codigo, descripcion, orden)
VALUES
    ('sales.view', 'Consultar las ventas propias', 480),
    ('sales.view_team', 'Consultar ventas del equipo supervisado', 490),
    ('sales.view_all', 'Consultar las ventas de toda la organización', 500)
ON CONFLICT (codigo) DO UPDATE SET
    descripcion = EXCLUDED.descripcion,
    activo = true,
    actualizado_en = now();

INSERT INTO public.tenant_default_role_permissions (rol_codigo, permiso_codigo)
VALUES
    ('owner', 'sales.view'), ('owner', 'sales.view_all'),
    ('admin_operativo', 'sales.view'), ('admin_operativo', 'sales.view_all'),
    ('gerente_comercial', 'sales.view'), ('gerente_comercial', 'sales.view_team'),
    ('coordinador', 'sales.view'), ('coordinador', 'sales.view_team'),
    ('agente', 'sales.view'), ('capturista', 'sales.view'),
    ('auditor', 'sales.view'), ('auditor', 'sales.view_all'),
    ('finanzas', 'sales.view'), ('finanzas', 'sales.view_all')
ON CONFLICT DO NOTHING;

INSERT INTO public.permisos (organizacion_id, codigo, descripcion)
SELECT org.id, permission.codigo, permission.descripcion
FROM public.organizaciones AS org
CROSS JOIN public.tenant_default_permissions AS permission
WHERE permission.codigo IN ('sales.view', 'sales.view_team', 'sales.view_all')
ON CONFLICT (organizacion_id, codigo) DO NOTHING;

WITH role_scope AS (
    SELECT 'sales.view'::text AS codigo, unnest(ARRAY['owner','admin','admin_operativo','gerente_comercial','supervisor','coordinador','agente','capturista','auditor','finanzas']) AS role_name
    UNION ALL SELECT 'sales.view_team', unnest(ARRAY['gerente_comercial','supervisor','coordinador'])
    UNION ALL SELECT 'sales.view_all', unnest(ARRAY['owner','admin','admin_operativo','auditor','finanzas'])
)
INSERT INTO public.roles_permisos (organizacion_id, rol_id, permiso_id)
SELECT r.organizacion_id, r.id, p.id
FROM public.roles AS r
JOIN role_scope AS rs ON lower(trim(r.nombre)) = rs.role_name
JOIN public.permisos AS p ON p.organizacion_id = r.organizacion_id AND p.codigo = rs.codigo
ON CONFLICT (organizacion_id, rol_id, permiso_id) DO NOTHING;

COMMIT;
