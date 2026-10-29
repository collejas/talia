BEGIN;

-- Backfill histórico de oportunidades inmobiliarias ganadas de Grupo Gran
-- Peñon. Solo se ejecuta si el tenant tiene el módulo inmobiliario activo.
-- Caldero queda fuera porque no existe como macrolote en el catálogo.

DO $$
DECLARE
    v_org uuid := '39e32c05-bfc2-4794-8aab-225873f2bf19';
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.organizaciones o
        WHERE o.id = v_org
          AND o.config #>> '{features,propiedades,enabled}' = 'true'
    ) THEN
        RAISE EXCEPTION
            'Backfill detenido: el tenant % no tiene propiedades habilitado',
            v_org;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.propiedad_capas c
        JOIN public.propiedad_desarrollos d ON d.id = c.desarrollo_id
        WHERE d.organizacion_id = v_org
          AND upper(c.nombre) = 'CAMPERO'
          AND c.id = '4395adfb-a274-46e8-a550-6c3cdc8925be'
    ) OR NOT EXISTS (
        SELECT 1
        FROM public.propiedad_capas c
        JOIN public.propiedad_desarrollos d ON d.id = c.desarrollo_id
        WHERE d.organizacion_id = v_org
          AND upper(c.nombre) = 'CERRITO'
          AND c.id = '97ab1f14-f6a6-4e04-bf63-7908af402b01'
    ) THEN
        RAISE EXCEPTION
            'Backfill detenido: no se pudo validar CAMPERO/CERRITO en el tenant %',
            v_org;
    END IF;
END $$;

-- La importación histórica cruzó las unidades 14 y 17 entre estas dos
-- oportunidades. Se corrigen también sus referencias históricas para que no
-- quede la unidad 17 ligada a la oportunidad perdida.
UPDATE public.propiedad_unidades u
SET oportunidad_id = CASE u.id
    WHEN 'fa0db3c7-bdeb-4715-bb67-01d848b8de50'::uuid
        THEN '015af78f-96c0-4b02-bdf0-8198ff5e9837'::uuid
    WHEN '127f4c57-dffb-4109-8b94-4acf2641e3db'::uuid
        THEN '2ac9742a-ad53-480b-8660-5c718fc402cd'::uuid
END
WHERE u.id IN (
    'fa0db3c7-bdeb-4715-bb67-01d848b8de50',
    '127f4c57-dffb-4109-8b94-4acf2641e3db'
);

-- Lote 2, Manzana 5, del macrolote CERRITO.
UPDATE public.propiedad_unidades u
SET oportunidad_id = '75bc43ff-6ba2-422e-bd55-9e6c117fef75'::uuid
WHERE u.id = '7114b859-78bb-4120-9300-e8e06065e0a3'
  AND u.oportunidad_id IS NULL;

-- Alinear las cotizaciones históricas con la unidad y el dominio correctos.
UPDATE public.cotizaciones q
SET dominio_comercial = 'propiedades',
    propiedad_id = u.desarrollo_id,
    unidad_id = u.id
FROM public.propiedad_unidades u
WHERE q.organizacion_id = '39e32c05-bfc2-4794-8aab-225873f2bf19'
  AND q.oportunidad_id IN (
      '015af78f-96c0-4b02-bdf0-8198ff5e9837',
      '75bc43ff-6ba2-422e-bd55-9e6c117fef75'
  )
  AND u.id = CASE q.oportunidad_id
      WHEN '015af78f-96c0-4b02-bdf0-8198ff5e9837'::uuid
          THEN 'fa0db3c7-bdeb-4715-bb67-01d848b8de50'::uuid
      WHEN '75bc43ff-6ba2-422e-bd55-9e6c117fef75'::uuid
          THEN '7114b859-78bb-4120-9300-e8e06065e0a3'::uuid
  END;

-- Mantener coherente la oportunidad perdida que participó en el cruce
-- histórico de Campero: lote 14 debe conservar la unidad 14.
UPDATE public.cotizaciones q
SET dominio_comercial = 'propiedades',
    propiedad_id = u.desarrollo_id,
    unidad_id = u.id
FROM public.propiedad_unidades u
WHERE q.id = '8873bac1-6e60-4d30-ae22-73de26c115bc'
  AND u.id = '127f4c57-dffb-4109-8b94-4acf2641e3db';

UPDATE public.cotizacion_items ci
SET propiedad_id = q.propiedad_id,
    unidad_id = q.unidad_id
FROM public.cotizaciones q
WHERE ci.organizacion_id = q.organizacion_id
  AND ci.cotizacion_id = q.id
  AND q.organizacion_id = '39e32c05-bfc2-4794-8aab-225873f2bf19'
  AND q.oportunidad_id IN (
      '015af78f-96c0-4b02-bdf0-8198ff5e9837',
      '75bc43ff-6ba2-422e-bd55-9e6c117fef75'
  );

UPDATE public.cotizacion_items ci
SET propiedad_id = q.propiedad_id,
    unidad_id = q.unidad_id
FROM public.cotizaciones q
WHERE ci.organizacion_id = q.organizacion_id
  AND ci.cotizacion_id = q.id
  AND q.id = '8873bac1-6e60-4d30-ae22-73de26c115bc';

UPDATE public.propiedad_unidad_movimientos m
SET oportunidad_id = CASE m.unidad_id
    WHEN 'fa0db3c7-bdeb-4715-bb67-01d848b8de50'::uuid
        THEN '015af78f-96c0-4b02-bdf0-8198ff5e9837'::uuid
    WHEN '127f4c57-dffb-4109-8b94-4acf2641e3db'::uuid
        THEN '2ac9742a-ad53-480b-8660-5c718fc402cd'::uuid
END
WHERE m.organizacion_id = '39e32c05-bfc2-4794-8aab-225873f2bf19'
  AND m.unidad_id IN (
      'fa0db3c7-bdeb-4715-bb67-01d848b8de50',
      '127f4c57-dffb-4109-8b94-4acf2641e3db'
  );

-- La cotización histórica de Cerrito no tenía partida; se agrega una partida
-- inmobiliaria explícita sin cambiar el estatus aceptada ni el total.
INSERT INTO public.cotizacion_items (
    cotizacion_id,
    producto_id,
    descripcion,
    cantidad,
    precio_unitario,
    subtotal,
    organizacion_id,
    moneda_aplicada,
    precio_unitario_final,
    orden,
    catalog_item_id,
    propiedad_id,
    unidad_id
)
SELECT
    q.id,
    NULL,
    'Gran Peñón Residencial · Lote 2 · Manzana 5 · CERRITO',
    1,
    q.total,
    q.total,
    q.organizacion_id,
    q.moneda,
    q.total,
    1,
    u.catalog_item_id,
    u.desarrollo_id,
    u.id
FROM public.cotizaciones q
JOIN public.propiedad_unidades u
  ON u.id = '7114b859-78bb-4120-9300-e8e06065e0a3'
WHERE q.organizacion_id = '39e32c05-bfc2-4794-8aab-225873f2bf19'
  AND q.oportunidad_id = '75bc43ff-6ba2-422e-bd55-9e6c117fef75'
  AND NOT EXISTS (
      SELECT 1
      FROM public.cotizacion_items existing
      WHERE existing.organizacion_id = q.organizacion_id
        AND existing.cotizacion_id = q.id
  );

-- Crear la operación histórica vendida si todavía no existe.
INSERT INTO public.operaciones_inmobiliarias (
    organizacion_id,
    unidad_id,
    oportunidad_id,
    cliente_principal_id,
    agente_usuario_id,
    estado,
    forma_adquisicion,
    precio_acordado,
    precio_final,
    moneda,
    estado_validacion,
    observaciones_validacion
)
SELECT
    q.organizacion_id,
    q.unidad_id,
    q.oportunidad_id,
    q.persona_id,
    q.creada_por_usuario_id,
    'vendida',
    'por_definir',
    q.total,
    q.total,
    q.moneda,
    'pendiente_captura',
    'Backfill histórico: operación reconstruida desde oportunidad y cotización aceptada.'
FROM public.cotizaciones q
WHERE q.organizacion_id = '39e32c05-bfc2-4794-8aab-225873f2bf19'
  AND q.oportunidad_id IN (
      '015af78f-96c0-4b02-bdf0-8198ff5e9837',
      '75bc43ff-6ba2-422e-bd55-9e6c117fef75'
  )
  AND q.estatus = 'aceptada'
  AND q.persona_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM public.operaciones_inmobiliarias oi
      WHERE oi.organizacion_id = q.organizacion_id
        AND oi.oportunidad_id = q.oportunidad_id
        AND oi.unidad_id = q.unidad_id
  );

UPDATE public.cotizaciones q
SET operacion_inmobiliaria_id = oi.id
FROM public.operaciones_inmobiliarias oi
WHERE q.organizacion_id = oi.organizacion_id
  AND q.oportunidad_id = oi.oportunidad_id
  AND q.unidad_id = oi.unidad_id
  AND q.organizacion_id = '39e32c05-bfc2-4794-8aab-225873f2bf19'
  AND q.oportunidad_id IN (
      '015af78f-96c0-4b02-bdf0-8198ff5e9837',
      '75bc43ff-6ba2-422e-bd55-9e6c117fef75'
  );

UPDATE public.oportunidades
SET dominio_comercial = 'propiedades'
WHERE organizacion_id = '39e32c05-bfc2-4794-8aab-225873f2bf19'
  AND id IN (
      '015af78f-96c0-4b02-bdf0-8198ff5e9837',
      '75bc43ff-6ba2-422e-bd55-9e6c117fef75'
  );

COMMIT;
