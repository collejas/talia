BEGIN;

-- Extiende las RPC de ordenes de compra para soportar el esquema local/internacional.

DROP FUNCTION IF EXISTS public.crm_crear_orden_compra(
    uuid,
    uuid,
    uuid,
    text,
    timestamptz,
    date,
    character varying,
    uuid,
    uuid,
    text,
    text,
    text,
    jsonb
);

CREATE OR REPLACE FUNCTION public.crm_crear_orden_compra(
    p_organizacion_id uuid,
    p_proveedor_id uuid,
    p_almacen_destino_id uuid,
    p_folio text,
    p_fecha_emision timestamptz DEFAULT now(),
    p_fecha_entrega_estimada date DEFAULT NULL,
    p_moneda character varying DEFAULT 'MXN',
    p_tipo_operacion text DEFAULT 'nacional',
    p_tipo_cambio_referencia numeric DEFAULT NULL,
    p_vigencia_hasta date DEFAULT NULL,
    p_proforma_referencia text DEFAULT NULL,
    p_solicitado_por_usuario_id uuid DEFAULT NULL,
    p_aprobado_por_usuario_id uuid DEFAULT NULL,
    p_referencia_externa text DEFAULT NULL,
    p_observaciones text DEFAULT NULL,
    p_instrucciones_entrega text DEFAULT NULL,
    p_condiciones_comerciales jsonb DEFAULT NULL,
    p_condiciones_pago jsonb DEFAULT NULL,
    p_logistica jsonb DEFAULT NULL,
    p_documentos jsonb DEFAULT '[]'::jsonb,
    p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_proveedor public.proveedores%ROWTYPE;
    v_almacen public.almacenes%ROWTYPE;
    v_orden_id uuid;
    v_item record;
    v_catalog_item public.catalog_items%ROWTYPE;
    v_proveedor_item public.proveedor_items%ROWTYPE;
    v_unidad text;
    v_cantidad numeric(14,3);
    v_costo numeric(14,4);
    v_descuento numeric(5,2);
    v_impuestos numeric(14,4);
    v_subtotal_bruto numeric(14,4);
    v_descuento_monto numeric(14,4);
    v_subtotal_neto numeric(14,4);
    v_total_linea numeric(14,4);
    v_total_subtotal numeric(14,4) := 0;
    v_total_descuento numeric(14,4) := 0;
    v_total_impuestos numeric(14,4) := 0;
    v_total_final numeric(14,4) := 0;
    v_tipo_operacion text := lower(coalesce(nullif(trim(p_tipo_operacion), ''), 'nacional'));
BEGIN
    IF p_organizacion_id IS NULL THEN
        RAISE EXCEPTION 'La organizacion es obligatoria';
    END IF;

    IF p_proveedor_id IS NULL THEN
        RAISE EXCEPTION 'El proveedor es obligatorio';
    END IF;

    IF p_almacen_destino_id IS NULL THEN
        RAISE EXCEPTION 'El almacen destino es obligatorio';
    END IF;

    IF p_folio IS NULL OR length(trim(p_folio)) = 0 THEN
        RAISE EXCEPTION 'El folio es obligatorio';
    END IF;

    IF v_tipo_operacion NOT IN ('nacional', 'internacional') THEN
        RAISE EXCEPTION 'El tipo de operacion debe ser nacional o internacional';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'La orden de compra debe incluir al menos un item';
    END IF;

    SELECT *
    INTO v_proveedor
    FROM public.proveedores
    WHERE id = p_proveedor_id
      AND organizacion_id = p_organizacion_id
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Proveedor no encontrado';
    END IF;

    SELECT *
    INTO v_almacen
    FROM public.almacenes
    WHERE id = p_almacen_destino_id
      AND organizacion_id = p_organizacion_id
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Almacen destino no encontrado';
    END IF;

    INSERT INTO public.ordenes_compra (
        organizacion_id,
        folio,
        proveedor_id,
        almacen_destino_id,
        estado,
        tipo_operacion,
        fecha_emision,
        fecha_entrega_estimada,
        moneda,
        tipo_cambio_referencia,
        vigencia_hasta,
        proforma_referencia,
        subtotal,
        descuento_total,
        impuestos_total,
        total,
        solicitado_por_usuario_id,
        aprobado_por_usuario_id,
        referencia_externa,
        observaciones,
        instrucciones_entrega
    ) VALUES (
        p_organizacion_id,
        trim(p_folio),
        p_proveedor_id,
        p_almacen_destino_id,
        'borrador',
        v_tipo_operacion,
        coalesce(p_fecha_emision, now()),
        p_fecha_entrega_estimada,
        upper(coalesce(p_moneda, 'MXN')),
        p_tipo_cambio_referencia,
        p_vigencia_hasta,
        p_proforma_referencia,
        0,
        0,
        0,
        0,
        p_solicitado_por_usuario_id,
        p_aprobado_por_usuario_id,
        p_referencia_externa,
        p_observaciones,
        p_instrucciones_entrega
    )
    RETURNING id INTO v_orden_id;

    FOR v_item IN
        SELECT *
        FROM jsonb_to_recordset(p_items) AS x(
            catalog_item_id uuid,
            proveedor_item_id uuid,
            cantidad_solicitada numeric,
            unidad text,
            costo_unitario numeric,
            descuento_porcentaje numeric,
            impuestos numeric,
            observaciones text,
            numero_partida integer,
            descripcion text,
            marca text,
            modelo text,
            fabricante text,
            pais_origen_codigo_iso2 text,
            pais_procedencia_codigo_iso2 text,
            fraccion_arancelaria text,
            hs_code text,
            nico text,
            peso_neto numeric,
            peso_bruto numeric,
            volumen_cbm numeric,
            lote text,
            numero_serie text,
            fecha_caducidad date
        )
    LOOP
        IF v_item.catalog_item_id IS NULL THEN
            RAISE EXCEPTION 'Cada item debe incluir catalog_item_id';
        END IF;

        SELECT *
        INTO v_catalog_item
        FROM public.catalog_items
        WHERE id = v_item.catalog_item_id
          AND organizacion_id = p_organizacion_id
        FOR SHARE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto no encontrado: %', v_item.catalog_item_id;
        END IF;

        IF v_item.proveedor_item_id IS NOT NULL THEN
            SELECT *
            INTO v_proveedor_item
            FROM public.proveedor_items
            WHERE id = v_item.proveedor_item_id
              AND organizacion_id = p_organizacion_id
              AND proveedor_id = p_proveedor_id
              AND catalog_item_id = v_item.catalog_item_id
            FOR SHARE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'El proveedor_item no coincide con el proveedor o el producto';
            END IF;
        ELSE
            v_proveedor_item := NULL;
        END IF;

        v_cantidad := round(coalesce(v_item.cantidad_solicitada, 0), 3);
        v_costo := round(coalesce(v_item.costo_unitario, 0), 4);
        v_descuento := round(coalesce(v_item.descuento_porcentaje, 0), 2);
        v_impuestos := round(coalesce(v_item.impuestos, 0), 4);
        v_unidad := coalesce(nullif(trim(v_item.unidad), ''), v_catalog_item.unidad, 'unidad');

        IF v_cantidad <= 0 THEN
            RAISE EXCEPTION 'La cantidad solicitada debe ser mayor a cero';
        END IF;

        IF v_costo < 0 THEN
            RAISE EXCEPTION 'El costo unitario no puede ser negativo';
        END IF;

        IF v_descuento < 0 OR v_descuento > 100 THEN
            RAISE EXCEPTION 'El descuento debe estar entre 0 y 100';
        END IF;

        v_subtotal_bruto := round(v_cantidad * v_costo, 4);
        v_descuento_monto := round(v_subtotal_bruto * v_descuento / 100.0, 4);
        v_subtotal_neto := round(v_subtotal_bruto - v_descuento_monto, 4);
        v_total_linea := round(v_subtotal_neto + v_impuestos, 4);

        INSERT INTO public.ordenes_compra_items (
            organizacion_id,
            orden_compra_id,
            catalog_item_id,
            proveedor_item_id,
            numero_partida,
            descripcion,
            marca,
            modelo,
            fabricante,
            pais_origen_codigo_iso2,
            pais_procedencia_codigo_iso2,
            fraccion_arancelaria,
            hs_code,
            nico,
            cantidad_solicitada,
            cantidad_recibida,
            unidad,
            costo_unitario,
            descuento_porcentaje,
            subtotal,
            impuestos,
            total,
            peso_neto,
            peso_bruto,
            volumen_cbm,
            lote,
            numero_serie,
            fecha_caducidad,
            observaciones
        ) VALUES (
            p_organizacion_id,
            v_orden_id,
            v_item.catalog_item_id,
            v_item.proveedor_item_id,
            v_item.numero_partida,
            coalesce(nullif(trim(v_item.descripcion), ''), v_catalog_item.nombre),
            v_item.marca,
            v_item.modelo,
            v_item.fabricante,
            v_item.pais_origen_codigo_iso2,
            v_item.pais_procedencia_codigo_iso2,
            v_item.fraccion_arancelaria,
            v_item.hs_code,
            v_item.nico,
            v_cantidad,
            0,
            v_unidad,
            v_costo,
            NULLIF(v_descuento, 0),
            v_subtotal_neto,
            v_impuestos,
            v_total_linea,
            v_item.peso_neto,
            v_item.peso_bruto,
            v_item.volumen_cbm,
            v_item.lote,
            v_item.numero_serie,
            v_item.fecha_caducidad,
            v_item.observaciones
        );

        v_total_subtotal := round(v_total_subtotal + v_subtotal_neto, 4);
        v_total_descuento := round(v_total_descuento + v_descuento_monto, 4);
        v_total_impuestos := round(v_total_impuestos + v_impuestos, 4);
        v_total_final := round(v_total_final + v_total_linea, 4);
    END LOOP;

    UPDATE public.ordenes_compra
    SET subtotal = v_total_subtotal,
        descuento_total = v_total_descuento,
        impuestos_total = v_total_impuestos,
        total = v_total_final
    WHERE id = v_orden_id;

    IF p_condiciones_comerciales IS NOT NULL AND jsonb_typeof(p_condiciones_comerciales) = 'object' THEN
        INSERT INTO public.ordenes_compra_condiciones_comerciales (
            organizacion_id,
            orden_compra_id,
            incoterm_codigo,
            incoterm_version,
            lugar_incoterm,
            responsable_flete,
            responsable_seguro,
            responsable_despacho_exportacion,
            responsable_despacho_importacion,
            responsable_impuestos_importacion,
            permite_embarques_parciales,
            permite_transbordos,
            gastos_bancarios,
            observaciones
        ) VALUES (
            p_organizacion_id,
            v_orden_id,
            NULLIF(trim(p_condiciones_comerciales->>'incoterm_codigo'), ''),
            NULLIF(trim(p_condiciones_comerciales->>'incoterm_version'), ''),
            NULLIF(trim(p_condiciones_comerciales->>'lugar_incoterm'), ''),
            NULLIF(trim(p_condiciones_comerciales->>'responsable_flete'), ''),
            NULLIF(trim(p_condiciones_comerciales->>'responsable_seguro'), ''),
            NULLIF(trim(p_condiciones_comerciales->>'responsable_despacho_exportacion'), ''),
            NULLIF(trim(p_condiciones_comerciales->>'responsable_despacho_importacion'), ''),
            NULLIF(trim(p_condiciones_comerciales->>'responsable_impuestos_importacion'), ''),
            coalesce((p_condiciones_comerciales->>'permite_embarques_parciales')::boolean, true),
            coalesce((p_condiciones_comerciales->>'permite_transbordos')::boolean, true),
            NULLIF(trim(p_condiciones_comerciales->>'gastos_bancarios'), ''),
            NULLIF(trim(p_condiciones_comerciales->>'observaciones'), '')
        )
        ON CONFLICT (orden_compra_id) DO UPDATE
        SET incoterm_codigo = EXCLUDED.incoterm_codigo,
            incoterm_version = EXCLUDED.incoterm_version,
            lugar_incoterm = EXCLUDED.lugar_incoterm,
            responsable_flete = EXCLUDED.responsable_flete,
            responsable_seguro = EXCLUDED.responsable_seguro,
            responsable_despacho_exportacion = EXCLUDED.responsable_despacho_exportacion,
            responsable_despacho_importacion = EXCLUDED.responsable_despacho_importacion,
            responsable_impuestos_importacion = EXCLUDED.responsable_impuestos_importacion,
            permite_embarques_parciales = EXCLUDED.permite_embarques_parciales,
            permite_transbordos = EXCLUDED.permite_transbordos,
            gastos_bancarios = EXCLUDED.gastos_bancarios,
            observaciones = EXCLUDED.observaciones,
            actualizado_en = now();
    END IF;

    IF p_condiciones_pago IS NOT NULL AND jsonb_typeof(p_condiciones_pago) = 'object' THEN
        INSERT INTO public.ordenes_compra_condiciones_pago (
            organizacion_id,
            orden_compra_id,
            forma_pago,
            moneda_pago,
            porcentaje_anticipo,
            monto_anticipo,
            porcentaje_saldo,
            monto_saldo,
            momento_pago_saldo,
            dias_credito,
            comisiones_bancarias,
            observaciones
        ) VALUES (
            p_organizacion_id,
            v_orden_id,
            NULLIF(trim(p_condiciones_pago->>'forma_pago'), ''),
            NULLIF(trim(p_condiciones_pago->>'moneda_pago'), ''),
            NULLIF((p_condiciones_pago->>'porcentaje_anticipo')::numeric, 0),
            NULLIF((p_condiciones_pago->>'monto_anticipo')::numeric, 0),
            NULLIF((p_condiciones_pago->>'porcentaje_saldo')::numeric, 0),
            NULLIF((p_condiciones_pago->>'monto_saldo')::numeric, 0),
            NULLIF(trim(p_condiciones_pago->>'momento_pago_saldo'), ''),
            NULLIF((p_condiciones_pago->>'dias_credito')::integer, 0),
            NULLIF(trim(p_condiciones_pago->>'comisiones_bancarias'), ''),
            NULLIF(trim(p_condiciones_pago->>'observaciones'), '')
        )
        ON CONFLICT (orden_compra_id) DO UPDATE
        SET forma_pago = EXCLUDED.forma_pago,
            moneda_pago = EXCLUDED.moneda_pago,
            porcentaje_anticipo = EXCLUDED.porcentaje_anticipo,
            monto_anticipo = EXCLUDED.monto_anticipo,
            porcentaje_saldo = EXCLUDED.porcentaje_saldo,
            monto_saldo = EXCLUDED.monto_saldo,
            momento_pago_saldo = EXCLUDED.momento_pago_saldo,
            dias_credito = EXCLUDED.dias_credito,
            comisiones_bancarias = EXCLUDED.comisiones_bancarias,
            observaciones = EXCLUDED.observaciones,
            actualizado_en = now();
    END IF;

    IF p_logistica IS NOT NULL AND jsonb_typeof(p_logistica) = 'object' THEN
        INSERT INTO public.ordenes_compra_logistica (
            organizacion_id,
            orden_compra_id,
            modo_transporte_codigo,
            fecha_requerida_embarque,
            fecha_estimada_embarque,
            fecha_estimada_arribo,
            puerto_origen,
            puerto_destino,
            aeropuerto_origen,
            aeropuerto_destino,
            lugar_entrega_final,
            direccion_entrega,
            tipo_embarque,
            tipo_contenedor,
            forwarder_nombre,
            numero_booking,
            numero_bl_awb,
            tracking,
            peso_neto_total,
            peso_bruto_total,
            volumen_total_cbm,
            cantidad_bultos,
            tipo_empaque,
            marcas_embarque,
            requiere_seguro,
            monto_asegurado,
            observaciones
        ) VALUES (
            p_organizacion_id,
            v_orden_id,
            NULLIF(trim(p_logistica->>'modo_transporte_codigo'), ''),
            NULLIF(trim(p_logistica->>'fecha_requerida_embarque'), '')::date,
            NULLIF(trim(p_logistica->>'fecha_estimada_embarque'), '')::date,
            NULLIF(trim(p_logistica->>'fecha_estimada_arribo'), '')::date,
            NULLIF(trim(p_logistica->>'puerto_origen'), ''),
            NULLIF(trim(p_logistica->>'puerto_destino'), ''),
            NULLIF(trim(p_logistica->>'aeropuerto_origen'), ''),
            NULLIF(trim(p_logistica->>'aeropuerto_destino'), ''),
            NULLIF(trim(p_logistica->>'lugar_entrega_final'), ''),
            NULLIF(trim(p_logistica->>'direccion_entrega'), ''),
            NULLIF(trim(p_logistica->>'tipo_embarque'), ''),
            NULLIF(trim(p_logistica->>'tipo_contenedor'), ''),
            NULLIF(trim(p_logistica->>'forwarder_nombre'), ''),
            NULLIF(trim(p_logistica->>'numero_booking'), ''),
            NULLIF(trim(p_logistica->>'numero_bl_awb'), ''),
            NULLIF(trim(p_logistica->>'tracking'), ''),
            NULLIF(NULLIF(trim(p_logistica->>'peso_neto_total'), '')::numeric, 0),
            NULLIF(NULLIF(trim(p_logistica->>'peso_bruto_total'), '')::numeric, 0),
            NULLIF(NULLIF(trim(p_logistica->>'volumen_total_cbm'), '')::numeric, 0),
            NULLIF(NULLIF(trim(p_logistica->>'cantidad_bultos'), '')::integer, 0),
            NULLIF(trim(p_logistica->>'tipo_empaque'), ''),
            NULLIF(trim(p_logistica->>'marcas_embarque'), ''),
            coalesce((p_logistica->>'requiere_seguro')::boolean, false),
            NULLIF(NULLIF(trim(p_logistica->>'monto_asegurado'), '')::numeric, 0),
            NULLIF(trim(p_logistica->>'observaciones'), '')
        )
        ON CONFLICT (orden_compra_id) DO UPDATE
        SET modo_transporte_codigo = EXCLUDED.modo_transporte_codigo,
            fecha_requerida_embarque = EXCLUDED.fecha_requerida_embarque,
            fecha_estimada_embarque = EXCLUDED.fecha_estimada_embarque,
            fecha_estimada_arribo = EXCLUDED.fecha_estimada_arribo,
            puerto_origen = EXCLUDED.puerto_origen,
            puerto_destino = EXCLUDED.puerto_destino,
            aeropuerto_origen = EXCLUDED.aeropuerto_origen,
            aeropuerto_destino = EXCLUDED.aeropuerto_destino,
            lugar_entrega_final = EXCLUDED.lugar_entrega_final,
            direccion_entrega = EXCLUDED.direccion_entrega,
            tipo_embarque = EXCLUDED.tipo_embarque,
            tipo_contenedor = EXCLUDED.tipo_contenedor,
            forwarder_nombre = EXCLUDED.forwarder_nombre,
            numero_booking = EXCLUDED.numero_booking,
            numero_bl_awb = EXCLUDED.numero_bl_awb,
            tracking = EXCLUDED.tracking,
            peso_neto_total = EXCLUDED.peso_neto_total,
            peso_bruto_total = EXCLUDED.peso_bruto_total,
            volumen_total_cbm = EXCLUDED.volumen_total_cbm,
            cantidad_bultos = EXCLUDED.cantidad_bultos,
            tipo_empaque = EXCLUDED.tipo_empaque,
            marcas_embarque = EXCLUDED.marcas_embarque,
            requiere_seguro = EXCLUDED.requiere_seguro,
            monto_asegurado = EXCLUDED.monto_asegurado,
            observaciones = EXCLUDED.observaciones,
            actualizado_en = now();
    END IF;

    IF p_documentos IS NOT NULL AND jsonb_typeof(p_documentos) = 'array' THEN
        DELETE FROM public.ordenes_compra_documentos
        WHERE orden_compra_id = v_orden_id;

        INSERT INTO public.ordenes_compra_documentos (
            organizacion_id,
            orden_compra_id,
            tipo_documento,
            obligatorio,
            estado,
            fecha_limite,
            archivo_id,
            observaciones
        )
        SELECT
            p_organizacion_id,
            v_orden_id,
            NULLIF(trim(doc.tipo_documento), ''),
            coalesce(doc.obligatorio, false),
            NULLIF(trim(doc.estado), ''),
            doc.fecha_limite,
            doc.archivo_id,
            NULLIF(trim(doc.observaciones), '')
        FROM jsonb_to_recordset(p_documentos) AS doc(
            tipo_documento text,
            obligatorio boolean,
            estado text,
            fecha_limite date,
            archivo_id uuid,
            observaciones text
        )
        WHERE doc.tipo_documento IS NOT NULL AND length(trim(doc.tipo_documento)) > 0;
    END IF;

    RETURN v_orden_id;
END;
$$;

DROP FUNCTION IF EXISTS public.crm_actualizar_orden_compra(
    uuid,
    uuid,
    uuid,
    uuid,
    text,
    timestamptz,
    date,
    character varying,
    text,
    numeric,
    date,
    text,
    uuid,
    uuid,
    text,
    text,
    text,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb
);

CREATE OR REPLACE FUNCTION public.crm_actualizar_orden_compra(
    p_organizacion_id uuid,
    p_orden_id uuid,
    p_proveedor_id uuid DEFAULT NULL,
    p_almacen_destino_id uuid DEFAULT NULL,
    p_folio text DEFAULT NULL,
    p_fecha_emision timestamptz DEFAULT NULL,
    p_fecha_entrega_estimada date DEFAULT NULL,
    p_moneda character varying DEFAULT NULL,
    p_tipo_operacion text DEFAULT NULL,
    p_tipo_cambio_referencia numeric DEFAULT NULL,
    p_vigencia_hasta date DEFAULT NULL,
    p_proforma_referencia text DEFAULT NULL,
    p_solicitado_por_usuario_id uuid DEFAULT NULL,
    p_aprobado_por_usuario_id uuid DEFAULT NULL,
    p_referencia_externa text DEFAULT NULL,
    p_observaciones text DEFAULT NULL,
    p_instrucciones_entrega text DEFAULT NULL,
    p_condiciones_comerciales jsonb DEFAULT NULL,
    p_condiciones_pago jsonb DEFAULT NULL,
    p_logistica jsonb DEFAULT NULL,
    p_documentos jsonb DEFAULT NULL,
    p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_orden public.ordenes_compra%ROWTYPE;
    v_proveedor public.proveedores%ROWTYPE;
    v_almacen public.almacenes%ROWTYPE;
    v_item record;
    v_catalog_item public.catalog_items%ROWTYPE;
    v_total_subtotal numeric(14,4) := 0;
    v_total_descuento numeric(14,4) := 0;
    v_total_impuestos numeric(14,4) := 0;
    v_total_final numeric(14,4) := 0;
    v_cantidad numeric(14,3);
    v_costo numeric(14,4);
    v_descuento numeric(5,2);
    v_impuestos numeric(14,4);
    v_subtotal_bruto numeric(14,4);
    v_descuento_monto numeric(14,4);
    v_subtotal_neto numeric(14,4);
    v_total_linea numeric(14,4);
    v_unidad text;
    v_tipo_operacion text;
BEGIN
    IF p_organizacion_id IS NULL OR p_orden_id IS NULL THEN
        RAISE EXCEPTION 'La organizacion y la orden son obligatorias';
    END IF;

    SELECT *
    INTO v_orden
    FROM public.ordenes_compra
    WHERE id = p_orden_id
      AND organizacion_id = p_organizacion_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Orden de compra no encontrada';
    END IF;

    IF v_orden.estado IN ('recibida', 'cerrada', 'cancelada') THEN
        RAISE EXCEPTION 'No se puede editar una orden en estado %', v_orden.estado;
    END IF;

    IF p_proveedor_id IS NOT NULL THEN
        SELECT *
        INTO v_proveedor
        FROM public.proveedores
        WHERE id = p_proveedor_id
          AND organizacion_id = p_organizacion_id
        FOR SHARE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Proveedor no encontrado';
        END IF;
    END IF;

    IF p_almacen_destino_id IS NOT NULL THEN
        SELECT *
        INTO v_almacen
        FROM public.almacenes
        WHERE id = p_almacen_destino_id
          AND organizacion_id = p_organizacion_id
        FOR SHARE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Almacen destino no encontrado';
        END IF;
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'La orden de compra debe incluir al menos un item';
    END IF;

    v_tipo_operacion := lower(coalesce(nullif(trim(p_tipo_operacion), ''), v_orden.tipo_operacion, 'nacional'));
    IF v_tipo_operacion NOT IN ('nacional', 'internacional') THEN
        RAISE EXCEPTION 'El tipo de operacion debe ser nacional o internacional';
    END IF;

    UPDATE public.ordenes_compra
    SET proveedor_id = coalesce(p_proveedor_id, proveedor_id),
        almacen_destino_id = coalesce(p_almacen_destino_id, almacen_destino_id),
        folio = coalesce(nullif(trim(p_folio), ''), folio),
        fecha_emision = coalesce(p_fecha_emision, fecha_emision),
        fecha_entrega_estimada = coalesce(p_fecha_entrega_estimada, fecha_entrega_estimada),
        moneda = upper(coalesce(p_moneda, moneda)),
        tipo_operacion = v_tipo_operacion,
        tipo_cambio_referencia = coalesce(p_tipo_cambio_referencia, tipo_cambio_referencia),
        vigencia_hasta = coalesce(p_vigencia_hasta, vigencia_hasta),
        proforma_referencia = coalesce(p_proforma_referencia, proforma_referencia),
        solicitado_por_usuario_id = coalesce(p_solicitado_por_usuario_id, solicitado_por_usuario_id),
        aprobado_por_usuario_id = coalesce(p_aprobado_por_usuario_id, aprobado_por_usuario_id),
        referencia_externa = p_referencia_externa,
        observaciones = p_observaciones,
        instrucciones_entrega = p_instrucciones_entrega
    WHERE id = p_orden_id;

    DELETE FROM public.ordenes_compra_items
    WHERE orden_compra_id = p_orden_id;

    FOR v_item IN
        SELECT *
        FROM jsonb_to_recordset(p_items) AS x(
            catalog_item_id uuid,
            proveedor_item_id uuid,
            cantidad_solicitada numeric,
            unidad text,
            costo_unitario numeric,
            descuento_porcentaje numeric,
            impuestos numeric,
            observaciones text,
            numero_partida integer,
            descripcion text,
            marca text,
            modelo text,
            fabricante text,
            pais_origen_codigo_iso2 text,
            pais_procedencia_codigo_iso2 text,
            fraccion_arancelaria text,
            hs_code text,
            nico text,
            peso_neto numeric,
            peso_bruto numeric,
            volumen_cbm numeric,
            lote text,
            numero_serie text,
            fecha_caducidad date
        )
    LOOP
        SELECT *
        INTO v_catalog_item
        FROM public.catalog_items
        WHERE id = v_item.catalog_item_id
          AND organizacion_id = p_organizacion_id
        FOR SHARE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto no encontrado: %', v_item.catalog_item_id;
        END IF;

        v_cantidad := round(coalesce(v_item.cantidad_solicitada, 0), 3);
        v_costo := round(coalesce(v_item.costo_unitario, 0), 4);
        v_descuento := round(coalesce(v_item.descuento_porcentaje, 0), 2);
        v_impuestos := round(coalesce(v_item.impuestos, 0), 4);
        v_unidad := coalesce(nullif(trim(v_item.unidad), ''), v_catalog_item.unidad, 'unidad');

        IF v_cantidad <= 0 THEN
            RAISE EXCEPTION 'La cantidad solicitada debe ser mayor a cero';
        END IF;

        IF v_costo < 0 THEN
            RAISE EXCEPTION 'El costo unitario no puede ser negativo';
        END IF;

        IF v_descuento < 0 OR v_descuento > 100 THEN
            RAISE EXCEPTION 'El descuento debe estar entre 0 y 100';
        END IF;

        v_subtotal_bruto := round(v_cantidad * v_costo, 4);
        v_descuento_monto := round(v_subtotal_bruto * v_descuento / 100.0, 4);
        v_subtotal_neto := round(v_subtotal_bruto - v_descuento_monto, 4);
        v_total_linea := round(v_subtotal_neto + v_impuestos, 4);

        INSERT INTO public.ordenes_compra_items (
            organizacion_id,
            orden_compra_id,
            catalog_item_id,
            proveedor_item_id,
            numero_partida,
            descripcion,
            marca,
            modelo,
            fabricante,
            pais_origen_codigo_iso2,
            pais_procedencia_codigo_iso2,
            fraccion_arancelaria,
            hs_code,
            nico,
            cantidad_solicitada,
            cantidad_recibida,
            unidad,
            costo_unitario,
            descuento_porcentaje,
            subtotal,
            impuestos,
            total,
            peso_neto,
            peso_bruto,
            volumen_cbm,
            lote,
            numero_serie,
            fecha_caducidad,
            observaciones
        ) VALUES (
            p_organizacion_id,
            p_orden_id,
            v_item.catalog_item_id,
            v_item.proveedor_item_id,
            v_item.numero_partida,
            coalesce(nullif(trim(v_item.descripcion), ''), v_catalog_item.nombre),
            v_item.marca,
            v_item.modelo,
            v_item.fabricante,
            v_item.pais_origen_codigo_iso2,
            v_item.pais_procedencia_codigo_iso2,
            v_item.fraccion_arancelaria,
            v_item.hs_code,
            v_item.nico,
            v_cantidad,
            0,
            v_unidad,
            v_costo,
            NULLIF(v_descuento, 0),
            v_subtotal_neto,
            v_impuestos,
            v_total_linea,
            v_item.peso_neto,
            v_item.peso_bruto,
            v_item.volumen_cbm,
            v_item.lote,
            v_item.numero_serie,
            v_item.fecha_caducidad,
            v_item.observaciones
        );

        v_total_subtotal := round(v_total_subtotal + v_subtotal_neto, 4);
        v_total_descuento := round(v_total_descuento + v_descuento_monto, 4);
        v_total_impuestos := round(v_total_impuestos + v_impuestos, 4);
        v_total_final := round(v_total_final + v_total_linea, 4);
    END LOOP;

    UPDATE public.ordenes_compra
    SET subtotal = v_total_subtotal,
        descuento_total = v_total_descuento,
        impuestos_total = v_total_impuestos,
        total = v_total_final
    WHERE id = p_orden_id;

    IF p_condiciones_comerciales IS NOT NULL AND jsonb_typeof(p_condiciones_comerciales) = 'object' THEN
        INSERT INTO public.ordenes_compra_condiciones_comerciales (
            organizacion_id,
            orden_compra_id,
            incoterm_codigo,
            incoterm_version,
            lugar_incoterm,
            responsable_flete,
            responsable_seguro,
            responsable_despacho_exportacion,
            responsable_despacho_importacion,
            responsable_impuestos_importacion,
            permite_embarques_parciales,
            permite_transbordos,
            gastos_bancarios,
            observaciones
        ) VALUES (
            p_organizacion_id,
            p_orden_id,
            NULLIF(trim(p_condiciones_comerciales->>'incoterm_codigo'), ''),
            NULLIF(trim(p_condiciones_comerciales->>'incoterm_version'), ''),
            NULLIF(trim(p_condiciones_comerciales->>'lugar_incoterm'), ''),
            NULLIF(trim(p_condiciones_comerciales->>'responsable_flete'), ''),
            NULLIF(trim(p_condiciones_comerciales->>'responsable_seguro'), ''),
            NULLIF(trim(p_condiciones_comerciales->>'responsable_despacho_exportacion'), ''),
            NULLIF(trim(p_condiciones_comerciales->>'responsable_despacho_importacion'), ''),
            NULLIF(trim(p_condiciones_comerciales->>'responsable_impuestos_importacion'), ''),
            coalesce((p_condiciones_comerciales->>'permite_embarques_parciales')::boolean, true),
            coalesce((p_condiciones_comerciales->>'permite_transbordos')::boolean, true),
            NULLIF(trim(p_condiciones_comerciales->>'gastos_bancarios'), ''),
            NULLIF(trim(p_condiciones_comerciales->>'observaciones'), '')
        )
        ON CONFLICT (orden_compra_id) DO UPDATE
        SET incoterm_codigo = EXCLUDED.incoterm_codigo,
            incoterm_version = EXCLUDED.incoterm_version,
            lugar_incoterm = EXCLUDED.lugar_incoterm,
            responsable_flete = EXCLUDED.responsable_flete,
            responsable_seguro = EXCLUDED.responsable_seguro,
            responsable_despacho_exportacion = EXCLUDED.responsable_despacho_exportacion,
            responsable_despacho_importacion = EXCLUDED.responsable_despacho_importacion,
            responsable_impuestos_importacion = EXCLUDED.responsable_impuestos_importacion,
            permite_embarques_parciales = EXCLUDED.permite_embarques_parciales,
            permite_transbordos = EXCLUDED.permite_transbordos,
            gastos_bancarios = EXCLUDED.gastos_bancarios,
            observaciones = EXCLUDED.observaciones,
            actualizado_en = now();
    END IF;

    IF p_condiciones_pago IS NOT NULL AND jsonb_typeof(p_condiciones_pago) = 'object' THEN
        INSERT INTO public.ordenes_compra_condiciones_pago (
            organizacion_id,
            orden_compra_id,
            forma_pago,
            moneda_pago,
            porcentaje_anticipo,
            monto_anticipo,
            porcentaje_saldo,
            monto_saldo,
            momento_pago_saldo,
            dias_credito,
            comisiones_bancarias,
            observaciones
        ) VALUES (
            p_organizacion_id,
            p_orden_id,
            NULLIF(trim(p_condiciones_pago->>'forma_pago'), ''),
            NULLIF(trim(p_condiciones_pago->>'moneda_pago'), ''),
            NULLIF(NULLIF(trim(p_condiciones_pago->>'porcentaje_anticipo'), '')::numeric, 0),
            NULLIF(NULLIF(trim(p_condiciones_pago->>'monto_anticipo'), '')::numeric, 0),
            NULLIF(NULLIF(trim(p_condiciones_pago->>'porcentaje_saldo'), '')::numeric, 0),
            NULLIF(NULLIF(trim(p_condiciones_pago->>'monto_saldo'), '')::numeric, 0),
            NULLIF(trim(p_condiciones_pago->>'momento_pago_saldo'), ''),
            NULLIF(NULLIF(trim(p_condiciones_pago->>'dias_credito'), '')::integer, 0),
            NULLIF(trim(p_condiciones_pago->>'comisiones_bancarias'), ''),
            NULLIF(trim(p_condiciones_pago->>'observaciones'), '')
        )
        ON CONFLICT (orden_compra_id) DO UPDATE
        SET forma_pago = EXCLUDED.forma_pago,
            moneda_pago = EXCLUDED.moneda_pago,
            porcentaje_anticipo = EXCLUDED.porcentaje_anticipo,
            monto_anticipo = EXCLUDED.monto_anticipo,
            porcentaje_saldo = EXCLUDED.porcentaje_saldo,
            monto_saldo = EXCLUDED.monto_saldo,
            momento_pago_saldo = EXCLUDED.momento_pago_saldo,
            dias_credito = EXCLUDED.dias_credito,
            comisiones_bancarias = EXCLUDED.comisiones_bancarias,
            observaciones = EXCLUDED.observaciones,
            actualizado_en = now();
    END IF;

    IF p_logistica IS NOT NULL AND jsonb_typeof(p_logistica) = 'object' THEN
        INSERT INTO public.ordenes_compra_logistica (
            organizacion_id,
            orden_compra_id,
            modo_transporte_codigo,
            fecha_requerida_embarque,
            fecha_estimada_embarque,
            fecha_estimada_arribo,
            puerto_origen,
            puerto_destino,
            aeropuerto_origen,
            aeropuerto_destino,
            lugar_entrega_final,
            direccion_entrega,
            tipo_embarque,
            tipo_contenedor,
            forwarder_nombre,
            numero_booking,
            numero_bl_awb,
            tracking,
            peso_neto_total,
            peso_bruto_total,
            volumen_total_cbm,
            cantidad_bultos,
            tipo_empaque,
            marcas_embarque,
            requiere_seguro,
            monto_asegurado,
            observaciones
        ) VALUES (
            p_organizacion_id,
            p_orden_id,
            NULLIF(trim(p_logistica->>'modo_transporte_codigo'), ''),
            NULLIF(trim(p_logistica->>'fecha_requerida_embarque'), '')::date,
            NULLIF(trim(p_logistica->>'fecha_estimada_embarque'), '')::date,
            NULLIF(trim(p_logistica->>'fecha_estimada_arribo'), '')::date,
            NULLIF(trim(p_logistica->>'puerto_origen'), ''),
            NULLIF(trim(p_logistica->>'puerto_destino'), ''),
            NULLIF(trim(p_logistica->>'aeropuerto_origen'), ''),
            NULLIF(trim(p_logistica->>'aeropuerto_destino'), ''),
            NULLIF(trim(p_logistica->>'lugar_entrega_final'), ''),
            NULLIF(trim(p_logistica->>'direccion_entrega'), ''),
            NULLIF(trim(p_logistica->>'tipo_embarque'), ''),
            NULLIF(trim(p_logistica->>'tipo_contenedor'), ''),
            NULLIF(trim(p_logistica->>'forwarder_nombre'), ''),
            NULLIF(trim(p_logistica->>'numero_booking'), ''),
            NULLIF(trim(p_logistica->>'numero_bl_awb'), ''),
            NULLIF(trim(p_logistica->>'tracking'), ''),
            NULLIF(NULLIF(trim(p_logistica->>'peso_neto_total'), '')::numeric, 0),
            NULLIF(NULLIF(trim(p_logistica->>'peso_bruto_total'), '')::numeric, 0),
            NULLIF(NULLIF(trim(p_logistica->>'volumen_total_cbm'), '')::numeric, 0),
            NULLIF(NULLIF(trim(p_logistica->>'cantidad_bultos'), '')::integer, 0),
            NULLIF(trim(p_logistica->>'tipo_empaque'), ''),
            NULLIF(trim(p_logistica->>'marcas_embarque'), ''),
            coalesce((p_logistica->>'requiere_seguro')::boolean, false),
            NULLIF(NULLIF(trim(p_logistica->>'monto_asegurado'), '')::numeric, 0),
            NULLIF(trim(p_logistica->>'observaciones'), '')
        )
        ON CONFLICT (orden_compra_id) DO UPDATE
        SET modo_transporte_codigo = EXCLUDED.modo_transporte_codigo,
            fecha_requerida_embarque = EXCLUDED.fecha_requerida_embarque,
            fecha_estimada_embarque = EXCLUDED.fecha_estimada_embarque,
            fecha_estimada_arribo = EXCLUDED.fecha_estimada_arribo,
            puerto_origen = EXCLUDED.puerto_origen,
            puerto_destino = EXCLUDED.puerto_destino,
            aeropuerto_origen = EXCLUDED.aeropuerto_origen,
            aeropuerto_destino = EXCLUDED.aeropuerto_destino,
            lugar_entrega_final = EXCLUDED.lugar_entrega_final,
            direccion_entrega = EXCLUDED.direccion_entrega,
            tipo_embarque = EXCLUDED.tipo_embarque,
            tipo_contenedor = EXCLUDED.tipo_contenedor,
            forwarder_nombre = EXCLUDED.forwarder_nombre,
            numero_booking = EXCLUDED.numero_booking,
            numero_bl_awb = EXCLUDED.numero_bl_awb,
            tracking = EXCLUDED.tracking,
            peso_neto_total = EXCLUDED.peso_neto_total,
            peso_bruto_total = EXCLUDED.peso_bruto_total,
            volumen_total_cbm = EXCLUDED.volumen_total_cbm,
            cantidad_bultos = EXCLUDED.cantidad_bultos,
            tipo_empaque = EXCLUDED.tipo_empaque,
            marcas_embarque = EXCLUDED.marcas_embarque,
            requiere_seguro = EXCLUDED.requiere_seguro,
            monto_asegurado = EXCLUDED.monto_asegurado,
            observaciones = EXCLUDED.observaciones,
            actualizado_en = now();
    END IF;

    IF p_documentos IS NOT NULL AND jsonb_typeof(p_documentos) = 'array' THEN
        DELETE FROM public.ordenes_compra_documentos
        WHERE orden_compra_id = p_orden_id;

        INSERT INTO public.ordenes_compra_documentos (
            organizacion_id,
            orden_compra_id,
            tipo_documento,
            obligatorio,
            estado,
            fecha_limite,
            archivo_id,
            observaciones
        )
        SELECT
            p_organizacion_id,
            p_orden_id,
            NULLIF(trim(doc.tipo_documento), ''),
            coalesce(doc.obligatorio, false),
            NULLIF(trim(doc.estado), ''),
            doc.fecha_limite,
            doc.archivo_id,
            NULLIF(trim(doc.observaciones), '')
        FROM jsonb_to_recordset(p_documentos) AS doc(
            tipo_documento text,
            obligatorio boolean,
            estado text,
            fecha_limite date,
            archivo_id uuid,
            observaciones text
        )
        WHERE doc.tipo_documento IS NOT NULL AND length(trim(doc.tipo_documento)) > 0;
    END IF;

    RETURN p_orden_id;
END;
$$;

COMMIT;
