BEGIN;

--------------------------------------------------------------------------------
-- 1. Cuentas (clientes -> cuentas) + actualización de contactos.cuenta_id
--------------------------------------------------------------------------------
WITH responsables AS (
    SELECT
        cliente_id,
        jsonb_agg(
            jsonb_strip_nulls(
                jsonb_build_object(
                    'id', id,
                    'nombre', nombre,
                    'correo', correo,
                    'telefono_e164', telefono_e164,
                    'rol', rol,
                    'es_responsable_principal', es_responsable_principal,
                    'metadatos', metadatos
                )
            )
        ) AS responsables
    FROM public.cliente_responsables
    GROUP BY cliente_id
),
cliente_base AS (
    SELECT
        c.*,
        COALESCE(res.responsables, '[]'::jsonb) AS responsables_json,
        jsonb_strip_nulls(
            jsonb_build_object(
                'legacy_cliente_id', c.id,
                'estado_onboarding', c.estado_onboarding,
                'rfc', NULLIF(c.rfc, ''),
                'domicilio_fiscal', NULLIF(c.domicilio_fiscal, ''),
                'domicilio_fisico', NULLIF(c.domicilio_fisico, ''),
                'regimen_fiscal', NULLIF(c.regimen_fiscal, ''),
                'datos_facturacion', c.datos_facturacion,
                'fuente', NULLIF(c.fuente, ''),
                'monto_estimado', c.monto_estimado,
                'moneda', NULLIF(c.moneda, ''),
                'ganado_en', c.ganado_en,
                'metadatos', c.metadatos,
                'responsables', COALESCE(res.responsables, '[]'::jsonb)
            )
        ) AS metadata_payload,
        jsonb_strip_nulls(
            jsonb_build_object(
                'fiscal', NULLIF(c.domicilio_fiscal, ''),
                'fisico', NULLIF(c.domicilio_fisico, '')
            )
        ) AS direccion_payload
    FROM public.clientes c
    LEFT JOIN responsables res ON res.cliente_id = c.id
)
INSERT INTO public.cuentas (
    id,
    organizacion_id,
    nombre,
    alias,
    tipo,
    industria,
    tamano,
    sitio_web,
    telefono,
    correo,
    direccion,
    propietario_usuario_id,
    metadata,
    creado_en,
    actualizado_en
)
SELECT
    cb.id,
    cb.organizacion_id,
    COALESCE(
        NULLIF(cb.razon_social, ''),
        NULLIF(cb.metadatos ->> 'razon_social', ''),
        'Cliente ' || left(cb.id::text, 8)
    ) AS nombre,
    NULLIF(cb.metadatos ->> 'alias', ''),
    NULLIF(cb.fuente, ''),
    NULLIF(cb.metadatos ->> 'industria', ''),
    NULLIF(cb.metadatos ->> 'tamano', ''),
    NULLIF(cb.metadatos ->> 'sitio_web', ''),
    NULLIF(cb.metadatos ->> 'telefono', ''),
    NULLIF(cb.metadatos ->> 'correo', ''),
    COALESCE(cb.direccion_payload, '{}'::jsonb),
    NULL,
    COALESCE(cb.metadata_payload, '{}'::jsonb),
    cb.creado_en,
    cb.actualizado_en
FROM cliente_base cb
ON CONFLICT (id) DO UPDATE
SET
    nombre = EXCLUDED.nombre,
    alias = EXCLUDED.alias,
    tipo = EXCLUDED.tipo,
    industria = EXCLUDED.industria,
    tamano = EXCLUDED.tamano,
    sitio_web = EXCLUDED.sitio_web,
    telefono = EXCLUDED.telefono,
    correo = EXCLUDED.correo,
    direccion = EXCLUDED.direccion,
    metadata = EXCLUDED.metadata,
    actualizado_en = now();

UPDATE public.contactos AS ct
SET cuenta_id = c.id
FROM public.clientes c
WHERE c.contacto_id = ct.id
  AND ct.cuenta_id IS DISTINCT FROM c.id;

--------------------------------------------------------------------------------
-- 2. Etapas del pipeline (lead_etapas -> etapas_pipeline)
--------------------------------------------------------------------------------
WITH stage_data AS (
    SELECT
        le.id,
        le.organizacion_id,
        COALESCE(
            NULLIF(
                regexp_replace(
                    lower(
                        COALESCE(lt.slug || '_' || le.codigo, le.codigo, 'stage_' || left(le.id::text, 8))
                    ),
                    '[^a-z0-9_]+' , '_', 'g'
                ),
                ''
            ),
            'stage_' || left(le.id::text, 8)
        ) AS codigo_norm,
        le.nombre,
        LEAST(
            ROW_NUMBER() OVER (
                PARTITION BY le.organizacion_id
                ORDER BY COALESCE(lt.nombre, 'tablero'), le.orden, le.nombre
            ),
            32767
        )::smallint AS orden_global,
        le.probabilidad,
        COALESCE(le.categoria::text, 'abierta') AS categoria_text,
        jsonb_strip_nulls(
            jsonb_build_object(
                'legacy_etapa_id', le.id,
                'tablero_id', le.tablero_id,
                'tablero_nombre', lt.nombre,
                'tablero_slug', lt.slug,
                'legacy_codigo', le.codigo,
                'sla_horas', le.sla_horas,
                'metadatos', le.metadatos
            )
        ) AS metadata_payload,
        le.creado_en,
        le.actualizado_en
    FROM public.lead_etapas le
    LEFT JOIN public.lead_tableros lt ON lt.id = le.tablero_id
)
INSERT INTO public.etapas_pipeline (
    id,
    organizacion_id,
    codigo,
    nombre,
    orden,
    probabilidad,
    categoria,
    metadata,
    creado_en,
    actualizado_en
)
SELECT
    sd.id,
    sd.organizacion_id,
    sd.codigo_norm,
    sd.nombre,
    sd.orden_global,
    sd.probabilidad,
    sd.categoria_text,
    COALESCE(sd.metadata_payload, '{}'::jsonb),
    sd.creado_en,
    sd.actualizado_en
FROM stage_data sd
ON CONFLICT (id) DO UPDATE
SET
    codigo = EXCLUDED.codigo,
    nombre = EXCLUDED.nombre,
    orden = EXCLUDED.orden,
    probabilidad = EXCLUDED.probabilidad,
    categoria = EXCLUDED.categoria,
    metadata = EXCLUDED.metadata,
    actualizado_en = now();

--------------------------------------------------------------------------------
-- 3. Oportunidades (lead_tarjetas -> oportunidades)
--------------------------------------------------------------------------------
WITH tablero_info AS (
    SELECT id, nombre, slug
    FROM public.lead_tableros
),
oportunidades_base AS (
    SELECT
        lt.id,
        lt.organizacion_id,
        c.id AS cuenta_id,
        lt.contacto_id,
        lt.etapa_id,
        COALESCE(
            NULLIF(lt.proyecto_nombre, ''),
            NULLIF(ct.company_name, ''),
            NULLIF(ct.nombre_completo, ''),
            'Lead ' || left(lt.id::text, 8)
        ) AS titulo,
        NULLIF(lt.proyecto_necesidades, '') AS descripcion,
        lt.monto_estimado,
        lt.moneda,
        COALESCE(lt.probabilidad_override, le.probabilidad) AS probabilidad,
        COALESCE(
            (lt.metadata ->> 'fecha_cierre_probable')::date,
            (lt.metadata ->> 'close_date')::date,
            lt.cerrado_en::date
        ) AS fecha_cierre_probable,
        CASE
            WHEN le.categoria = 'ganada' THEN 'ganada'
            WHEN le.categoria = 'perdida' THEN 'perdida'
            ELSE 'abierta'
        END AS estado,
        CASE
            WHEN le.categoria = 'perdida' THEN NULLIF(lt.motivo_cierre, '')
            ELSE NULL
        END AS motivo_perdida,
        lt.propietario_usuario_id,
        lt.asignado_a_usuario_id,
        jsonb_strip_nulls(
            jsonb_build_object(
                'legacy_lead_id', lt.id,
                'tablero_id', lt.tablero_id,
                'tablero_nombre', tb.nombre,
                'tablero_slug', tb.slug,
                'canal', lt.canal,
                'lead_score', lt.lead_score,
                'tags', to_jsonb(lt.tags),
                'metadata', lt.metadata,
                'conversacion_id', lt.conversacion_id
            )
        ) AS metadata_payload,
        lt.creado_en,
        lt.actualizado_en,
        lt.cerrado_en
    FROM public.lead_tarjetas lt
    LEFT JOIN public.clientes c ON c.lead_tarjeta_id = lt.id
    LEFT JOIN public.contactos ct ON ct.id = lt.contacto_id
    LEFT JOIN public.lead_etapas le ON le.id = lt.etapa_id
    LEFT JOIN tablero_info tb ON tb.id = lt.tablero_id
)
INSERT INTO public.oportunidades (
    id,
    organizacion_id,
    cuenta_id,
    contacto_principal_id,
    etapa_id,
    titulo,
    descripcion,
    monto_estimado,
    moneda,
    probabilidad,
    fecha_cierre_probable,
    estado,
    motivo_perdida,
    propietario_usuario_id,
    asignado_a_usuario_id,
    metadata,
    creado_en,
    actualizado_en,
    cerrado_en
)
SELECT
    ob.id,
    ob.organizacion_id,
    ob.cuenta_id,
    ob.contacto_id,
    ob.etapa_id,
    ob.titulo,
    ob.descripcion,
    ob.monto_estimado,
    ob.moneda,
    ob.probabilidad,
    ob.fecha_cierre_probable,
    ob.estado,
    ob.motivo_perdida,
    ob.propietario_usuario_id,
    ob.asignado_a_usuario_id,
    COALESCE(ob.metadata_payload, '{}'::jsonb),
    ob.creado_en,
    ob.actualizado_en,
    ob.cerrado_en
FROM oportunidades_base ob
ON CONFLICT (id) DO UPDATE
SET
    cuenta_id = EXCLUDED.cuenta_id,
    contacto_principal_id = EXCLUDED.contacto_principal_id,
    etapa_id = EXCLUDED.etapa_id,
    titulo = EXCLUDED.titulo,
    descripcion = EXCLUDED.descripcion,
    monto_estimado = EXCLUDED.monto_estimado,
    moneda = EXCLUDED.moneda,
    probabilidad = EXCLUDED.probabilidad,
    fecha_cierre_probable = EXCLUDED.fecha_cierre_probable,
    estado = EXCLUDED.estado,
    motivo_perdida = EXCLUDED.motivo_perdida,
    propietario_usuario_id = EXCLUDED.propietario_usuario_id,
    asignado_a_usuario_id = EXCLUDED.asignado_a_usuario_id,
    metadata = EXCLUDED.metadata,
    actualizado_en = EXCLUDED.actualizado_en,
    cerrado_en = EXCLUDED.cerrado_en;

--------------------------------------------------------------------------------
-- 4. Historial de etapas (lead_movimientos -> oportunidad_etapas_historial)
--------------------------------------------------------------------------------
INSERT INTO public.oportunidad_etapas_historial (
    id,
    organizacion_id,
    oportunidad_id,
    etapa_origen_id,
    etapa_destino_id,
    cambiado_por_usuario_id,
    cambiado_en,
    motivo,
    fuente,
    metadata
)
SELECT
    lm.id,
    lm.organizacion_id,
    lm.tarjeta_id,
    lm.etapa_origen_id,
    lm.etapa_destino_id,
    lm.cambiado_por,
    lm.cambiado_en,
    NULLIF(lm.motivo, ''),
    lm.fuente,
    COALESCE(lm.metadata, '{}'::jsonb)
FROM public.lead_movimientos lm
ON CONFLICT (id) DO UPDATE
SET
    etapa_origen_id = EXCLUDED.etapa_origen_id,
    etapa_destino_id = EXCLUDED.etapa_destino_id,
    cambiado_por_usuario_id = EXCLUDED.cambiado_por_usuario_id,
    cambiado_en = EXCLUDED.cambiado_en,
    motivo = EXCLUDED.motivo,
    fuente = EXCLUDED.fuente,
    metadata = EXCLUDED.metadata;

--------------------------------------------------------------------------------
-- 5. Actividades (lead_recordatorios -> actividades)
--------------------------------------------------------------------------------
INSERT INTO public.actividades (
    id,
    organizacion_id,
    tipo,
    canal,
    asunto,
    descripcion,
    estado,
    prioridad,
    fecha_vencimiento,
    inicio_en,
    fin_en,
    sla_horas,
    recordatorio_en,
    cuenta_id,
    contacto_id,
    oportunidad_id,
    creado_por_usuario_id,
    asignado_a_usuario_id,
    metadata,
    creado_en,
    actualizado_en
)
SELECT
    lr.id,
    lr.organizacion_id,
    'tarea' AS tipo,
    NULL,
    left(lr.descripcion, 255),
    lr.descripcion,
    CASE WHEN lr.completado THEN 'completada' ELSE 'pendiente' END,
    'media',
    lr.due_at,
    NULL,
    NULL,
    NULL,
    lr.due_at,
    c.id,
    lt.contacto_id,
    lt.id,
    lr.creado_por,
    COALESCE(lt.asignado_a_usuario_id, lr.creado_por),
    jsonb_strip_nulls(
        jsonb_build_object(
            'legacy_source', 'lead_recordatorios',
            'metadata', lr.metadata
        )
    ),
    lr.creado_en,
    lr.actualizado_en
FROM public.lead_recordatorios lr
JOIN public.lead_tarjetas lt ON lt.id = lr.tarjeta_id
LEFT JOIN public.clientes c ON c.lead_tarjeta_id = lt.id
ON CONFLICT (id) DO UPDATE
SET
    descripcion = EXCLUDED.descripcion,
    estado = EXCLUDED.estado,
    prioridad = EXCLUDED.prioridad,
    fecha_vencimiento = EXCLUDED.fecha_vencimiento,
    oportunidad_id = EXCLUDED.oportunidad_id,
    asignado_a_usuario_id = EXCLUDED.asignado_a_usuario_id,
    metadata = EXCLUDED.metadata,
    actualizado_en = EXCLUDED.actualizado_en;

--------------------------------------------------------------------------------
-- 6. Cotizaciones (lead_cotizaciones -> cotizaciones)
--------------------------------------------------------------------------------
INSERT INTO public.cotizaciones (
    id,
    organizacion_id,
    oportunidad_id,
    cuenta_id,
    contacto_id,
    estatus,
    total,
    moneda,
    valida_hasta,
    creada_por_usuario_id,
    metadata,
    creado_en,
    actualizado_en
)
SELECT
    lc.id,
    lc.organizacion_id,
    lc.tarjeta_id,
    c.id AS cuenta_id,
    lt.contacto_id,
    lc.estado::text,
    lc.total,
    lc.moneda,
    lc.valido_hasta,
    COALESCE(lc.enviada_por, lt.propietario_usuario_id),
    jsonb_strip_nulls(
        jsonb_build_object(
            'version', lc.version,
            'titulo', lc.titulo,
            'descripcion', lc.descripcion,
            'conceptos', lc.conceptos,
            'subtotal', lc.subtotal,
            'impuestos', lc.impuestos,
            'canal_envio', lc.canal_envio,
            'enviada_en', lc.enviada_en,
            'aprobada_en', lc.aprobada_en,
            'rechazada_en', lc.rechazada_en,
            'pdf_path', lc.pdf_path,
            'pdf_url', lc.pdf_url,
            'metadatos', lc.metadatos
        )
    ),
    lc.creado_en,
    lc.actualizado_en
FROM public.lead_cotizaciones lc
LEFT JOIN public.lead_tarjetas lt ON lt.id = lc.tarjeta_id
LEFT JOIN public.clientes c ON c.lead_tarjeta_id = lc.tarjeta_id
ON CONFLICT (id) DO UPDATE
SET
    oportunidad_id = EXCLUDED.oportunidad_id,
    cuenta_id = EXCLUDED.cuenta_id,
    contacto_id = EXCLUDED.contacto_id,
    estatus = EXCLUDED.estatus,
    total = EXCLUDED.total,
    moneda = EXCLUDED.moneda,
    valida_hasta = EXCLUDED.valida_hasta,
    creada_por_usuario_id = EXCLUDED.creada_por_usuario_id,
    metadata = EXCLUDED.metadata,
    actualizado_en = EXCLUDED.actualizado_en;

--------------------------------------------------------------------------------
-- 7. Cotización items (lead_cotizacion_items -> cotizacion_items)
--------------------------------------------------------------------------------
WITH items_base AS (
    SELECT
        lci.*,
        CASE
            WHEN p.id IS NOT NULL THEN lci.catalog_item_id
            ELSE NULL
        END AS producto_destino_id
    FROM public.lead_cotizacion_items lci
    LEFT JOIN public.productos p ON p.id = lci.catalog_item_id
)
INSERT INTO public.cotizacion_items (
    id,
    cotizacion_id,
    producto_id,
    descripcion,
    cantidad,
    precio_unitario,
    descuento_porcentaje,
    subtotal,
    metadata
)
SELECT
    ib.id,
    ib.cotizacion_id,
    ib.producto_destino_id,
    COALESCE(NULLIF(ib.descripcion, ''), ib.titulo, 'Partida'),
    ib.cantidad,
    ib.precio_unitario,
    NULL,
    ib.subtotal,
    jsonb_strip_nulls(
        jsonb_build_object(
            'titulo', ib.titulo,
            'unidad', ib.unidad,
            'descuento', ib.descuento,
            'impuestos', ib.impuestos,
            'total', ib.total,
            'moneda', ib.moneda,
            'orden', ib.orden,
            'metadatos', ib.metadatos
        )
    )
FROM items_base ib
ON CONFLICT (id) DO UPDATE
SET
    descripcion = EXCLUDED.descripcion,
    cantidad = EXCLUDED.cantidad,
    precio_unitario = EXCLUDED.precio_unitario,
    subtotal = EXCLUDED.subtotal,
    metadata = EXCLUDED.metadata;

COMMIT;
