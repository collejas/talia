BEGIN;

ALTER TABLE public.cotizaciones
    ADD COLUMN IF NOT EXISTS folio text;

COMMENT ON COLUMN public.cotizaciones.folio IS 'Folio visible de la cotizacion con prefijo, iniciales del vendedor, fecha y consecutivo diario.';

CREATE UNIQUE INDEX IF NOT EXISTS cotizaciones_organizacion_folio_uidx
    ON public.cotizaciones (organizacion_id, folio)
    WHERE folio IS NOT NULL;

CREATE INDEX IF NOT EXISTS cotizaciones_organizacion_folio_idx
    ON public.cotizaciones (organizacion_id, folio);

CREATE TABLE IF NOT EXISTS public.cotizacion_folio_contadores (
    organizacion_id uuid NOT NULL
        REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    fecha_base date NOT NULL,
    consecutivo integer NOT NULL DEFAULT 0,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cotizacion_folio_contadores_pk PRIMARY KEY (organizacion_id, fecha_base),
    CONSTRAINT cotizacion_folio_contadores_consecutivo_check CHECK (consecutivo >= 0)
);

COMMENT ON TABLE public.cotizacion_folio_contadores IS 'Contador diario por tenant para folios de cotizaciones.';

CREATE INDEX IF NOT EXISTS cotizacion_folio_contadores_fecha_idx
    ON public.cotizacion_folio_contadores (fecha_base DESC);

DROP FUNCTION IF EXISTS public.crm_reservar_folio_cotizacion(uuid, text, date);

CREATE OR REPLACE FUNCTION public.crm_reservar_folio_cotizacion(
    p_organizacion_id uuid,
    p_vendedor_nombre text,
    p_fecha date DEFAULT current_date
)
RETURNS TABLE(
    folio text,
    secuencia integer,
    fecha date,
    iniciales text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_fecha date := COALESCE(p_fecha, current_date);
    v_nombre text := COALESCE(NULLIF(btrim(p_vendedor_nombre), ''), 'Vendedor');
    v_iniciales text := '';
    v_part text;
    v_tokens text[];
BEGIN
    IF p_organizacion_id IS NULL THEN
        RAISE EXCEPTION 'La organizacion es obligatoria';
    END IF;

    v_tokens := regexp_split_to_array(regexp_replace(v_nombre, '\s+', ' ', 'g'), '\s+');
    FOREACH v_part IN ARRAY v_tokens LOOP
        v_part := regexp_replace(v_part, '^[^[:alpha:]]+|[^[:alpha:]]+$', '', 'g');
        IF v_part IS NULL OR btrim(v_part) = '' THEN
            CONTINUE;
        END IF;
        v_iniciales := v_iniciales || upper(left(v_part, 1));
    END LOOP;

    v_iniciales := regexp_replace(v_iniciales, '[^A-Z0-9]', '', 'g');
    IF v_iniciales = '' THEN
        v_iniciales := 'VEN';
    END IF;

    INSERT INTO public.cotizacion_folio_contadores (
        organizacion_id,
        fecha_base,
        consecutivo,
        creado_en,
        actualizado_en
    )
    VALUES (
        p_organizacion_id,
        v_fecha,
        1,
        now(),
        now()
    )
    ON CONFLICT (organizacion_id, fecha_base)
    DO UPDATE SET
        consecutivo = public.cotizacion_folio_contadores.consecutivo + 1,
        actualizado_en = now()
    RETURNING cotizacion_folio_contadores.consecutivo
    INTO secuencia;

    fecha := v_fecha;
    iniciales := v_iniciales;
    folio := format(
        'Cot-%s-%s-%s',
        v_iniciales,
        to_char(v_fecha, 'DDMMYY'),
        lpad(secuencia::text, 4, '0')
    );
    RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crm_reservar_folio_cotizacion(uuid, text, date) TO authenticated;

COMMIT;
