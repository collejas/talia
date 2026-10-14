BEGIN;

CREATE OR REPLACE FUNCTION public.crm_propiedades_geojson(
    p_organizacion uuid,
    p_nivel integer DEFAULT NULL,
    p_tipo uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_payload jsonb;
BEGIN
    IF auth.role() <> 'service_role'
       AND NOT (
           p_organizacion = public.usuario_organizacion_id(auth.uid())
           OR public.es_admin(auth.uid())
       ) THEN
        RAISE EXCEPTION 'organizacion_no_autorizada' USING ERRCODE = '42501';
    END IF;

    v_payload := public.crm_propiedades_geojson_impl(p_organizacion, p_nivel, p_tipo);

    RETURN jsonb_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE((
            SELECT jsonb_agg(
                CASE
                    WHEN feature->>'layer' = 'unidad' AND operation.id IS NOT NULL THEN
                        feature || jsonb_build_object(
                            'properties', (feature->'properties') || jsonb_build_object(
                                'operation_id', operation.id,
                                'operation_status', operation.estado,
                                'operation_validation_status', operation.estado_validacion,
                                'display_status', CASE
                                    WHEN operation.estado = 'borrador' THEN 'reservado_borrador'
                                    WHEN operation.estado = 'apartada'
                                         AND operation.estado_validacion = 'firme' THEN 'apartado_firme'
                                    WHEN operation.estado = 'apartada' THEN 'apartado_revision'
                                    WHEN operation.estado = 'reservada' THEN 'reservado'
                                    ELSE feature->'properties'->>'status'
                                END,
                                'display_status_label', CASE
                                    WHEN operation.estado = 'borrador' THEN 'Reservado (borrador)'
                                    WHEN operation.estado = 'apartada'
                                         AND operation.estado_validacion = 'firme' THEN 'Apartado firme'
                                    WHEN operation.estado = 'apartada' THEN 'Apartado en validación'
                                    WHEN operation.estado = 'reservada' THEN 'Reservado'
                                    ELSE feature->'properties'->>'status'
                                END,
                                'status_color', CASE
                                    WHEN operation.estado = 'borrador' THEN '#F59E0B'
                                    WHEN operation.estado = 'apartada' THEN '#F1C40F'
                                    WHEN operation.estado = 'reservada' THEN '#F97316'
                                    ELSE feature->'properties'->>'status_color'
                                END,
                                'color', CASE
                                    WHEN operation.estado = 'borrador' THEN '#F59E0B'
                                    WHEN operation.estado = 'apartada' THEN '#F1C40F'
                                    WHEN operation.estado = 'reservada' THEN '#F97316'
                                    ELSE feature->'properties'->>'color'
                                END
                            )
                        )
                    ELSE feature
                END
            )
            FROM jsonb_array_elements(COALESCE(v_payload->'features', '[]'::jsonb)) AS feature
            LEFT JOIN LATERAL (
                SELECT op.id, op.estado, op.estado_validacion
                FROM public.operaciones_inmobiliarias AS op
                WHERE feature->>'layer' = 'unidad'
                  AND op.organizacion_id = p_organizacion
                  AND op.unidad_id = (feature->>'id')::uuid
                  AND op.estado IN ('borrador', 'apartada', 'reservada')
                ORDER BY CASE op.estado
                    WHEN 'reservada' THEN 1
                    WHEN 'apartada' THEN 2
                    WHEN 'borrador' THEN 3
                    ELSE 4
                END, op.actualizado_en DESC
                LIMIT 1
            ) AS operation ON TRUE
        ), '[]'::jsonb)
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_propiedades_geojson(uuid, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_propiedades_geojson(uuid, integer, uuid) TO authenticated, service_role;

COMMIT;
