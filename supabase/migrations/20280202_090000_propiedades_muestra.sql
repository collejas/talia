BEGIN;

DO $$
DECLARE
    org_uuid uuid := '00000000-0000-0000-0000-000000000001'::uuid;
    tipo_lote uuid;
    tipo_departamento uuid;
    prop_lote uuid;
    prop_torre uuid;
    nivel_primer uuid;
    nivel_segundo uuid;
BEGIN
    SELECT id INTO tipo_lote FROM public.propiedad_tipos WHERE organizacion_id = org_uuid AND nombre = 'lote' LIMIT 1;
    IF tipo_lote IS NULL THEN
        INSERT INTO public.propiedad_tipos (organizacion_id, nombre, descripcion, color)
        VALUES (org_uuid, 'lote', 'Terrenos sin construcción', '#2ECC71')
        RETURNING id INTO tipo_lote;
    END IF;

    SELECT id INTO tipo_departamento FROM public.propiedad_tipos WHERE organizacion_id = org_uuid AND nombre = 'departamento' LIMIT 1;
    IF tipo_departamento IS NULL THEN
        INSERT INTO public.propiedad_tipos (organizacion_id, nombre, descripcion, color)
        VALUES (org_uuid, 'departamento', 'Unidades verticales', '#9B59B6')
        RETURNING id INTO tipo_departamento;
    END IF;

    INSERT INTO public.propiedades (
        organizacion_id, tipo_id, nombre, descripcion, status, precio, nivel, height, min_height, levels, area_m2, metadata, geom
    ) VALUES (
        org_uuid,
        tipo_lote,
        'Lote Jardines del Valle',
        'Lote residencial frente a parque',
        'disponible',
        1500000,
        NULL,
        0,
        0,
        1,
        450,
        jsonb_build_object('fraccionamiento','Jardines del Valle','superficie','450m2'),
        ST_GeometryFromText('SRID=4326;MULTIPOLYGONZ(((-99.2005 19.4375 0,-99.2005 19.4385 0,-99.1992 19.4385 0,-99.1992 19.4375 0,-99.2005 19.4375 0)))')
    ) RETURNING id INTO prop_lote;

    INSERT INTO public.propiedades (
        organizacion_id, tipo_id, nombre, descripcion, status, precio, nivel, height, min_height, levels, area_m2, metadata, geom
    ) VALUES (
        org_uuid,
        tipo_departamento,
        'Torre Miramar',
        'Edificio vertical con departamentos y amenidades',
        'apartado',
        3200000,
        NULL,
        18,
        0,
        6,
        1200,
        jsonb_build_object('amenidades', ARRAY['pool','roof garden','gimnasio']),
        ST_GeometryFromText('SRID=4326;MULTIPOLYGONZ(((-99.195 19.432 0,-99.195 19.435 0,-99.192 19.435 0,-99.192 19.432 0,-99.195 19.432 0)))')
    ) RETURNING id INTO prop_torre;

    INSERT INTO public.propiedad_niveles (
        propiedad_id, nivel, nombre, altura, geom
    ) VALUES (
        prop_torre, 1, 'Planta baja', 4, ST_GeometryFromText('SRID=4326;POLYGONZ((-99.195 19.432 0,-99.195 19.4325 0,-99.1945 19.4325 0,-99.1945 19.432 0,-99.195 19.432 0))')
    ) RETURNING id INTO nivel_primer;

    INSERT INTO public.propiedad_niveles (
        propiedad_id, nivel, nombre, altura, geom
    ) VALUES (
        prop_torre, 2, 'Nivel 2', 3.8, ST_GeometryFromText('SRID=4326;POLYGONZ((-99.195 19.433 0,-99.195 19.4335 0,-99.1945 19.4335 0,-99.1945 19.433 0,-99.195 19.433 0))')
    ) RETURNING id INTO nivel_segundo;

    INSERT INTO public.propiedad_departamentos (
        nivel_id, unidad, status, precio, area_m2, geom
    ) VALUES
        (nivel_primer, 'PB-01', 'disponible', 3400000, 95, ST_GeometryFromText('SRID=4326;POLYGONZ((-99.195 19.432 0,-99.195 19.4323 0,-99.1948 19.4323 0,-99.1948 19.432 0,-99.195 19.432 0))')),
        (nivel_primer, 'PB-02', 'vendido', 3500000, 100, ST_GeometryFromText('SRID=4326;POLYGONZ((-99.1949 19.432 0,-99.1949 19.4323 0,-99.1946 19.4323 0,-99.1946 19.432 0,-99.1949 19.432 0))')),
        (nivel_segundo, '02-01', 'apartado', 3600000, 110, ST_GeometryFromText('SRID=4326;POLYGONZ((-99.195 19.433 0,-99.195 19.4333 0,-99.1948 19.4333 0,-99.1948 19.433 0,-99.195 19.433 0))')),
        (nivel_segundo, '02-02', 'disponible', 3700000, 105, ST_GeometryFromText('SRID=4326;POLYGONZ((-99.1949 19.433 0,-99.1949 19.4333 0,-99.1946 19.4333 0,-99.1946 19.433 0,-99.1949 19.433 0))'));
END;
$$;

COMMIT;
