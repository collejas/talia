BEGIN;

ALTER TABLE public.oportunidades
    ADD COLUMN IF NOT EXISTS request_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'oportunidades'
          AND indexname = 'oportunidades_request_id_uidx'
    ) THEN
        CREATE UNIQUE INDEX oportunidades_request_id_uidx
            ON public.oportunidades (request_id)
            WHERE request_id IS NOT NULL;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.oportunidad_codigo_contadores (
    organizacion_id uuid PRIMARY KEY
        REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    siguiente_numero bigint NOT NULL DEFAULT 1 CHECK (siguiente_numero >= 1),
    creado_en timestamp with time zone NOT NULL DEFAULT now(),
    actualizado_en timestamp with time zone NOT NULL DEFAULT now()
);

INSERT INTO public.oportunidad_codigo_contadores (
    organizacion_id,
    siguiente_numero,
    creado_en,
    actualizado_en
)
SELECT
    existing.organizacion_id,
    COALESCE(existing.max_seq, 0) + 1,
    now(),
    now()
FROM (
    SELECT
        o.organizacion_id,
        COALESCE(MAX(substring(o.codigo_oportunidad FROM '^Opo-([0-9]+)$')::bigint), 0) AS max_seq
    FROM public.oportunidades o
    WHERE o.codigo_oportunidad ~ '^Opo-[0-9]+$'
    GROUP BY o.organizacion_id
) AS existing
ON CONFLICT (organizacion_id) DO UPDATE
SET siguiente_numero = GREATEST(public.oportunidad_codigo_contadores.siguiente_numero, EXCLUDED.siguiente_numero),
    actualizado_en = now();

CREATE OR REPLACE FUNCTION public.gen_codigo_oportunidad(p_organizacion_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    v_current bigint;
BEGIN
    IF p_organizacion_id IS NULL THEN
        RETURN NULL;
    END IF;

    INSERT INTO public.oportunidad_codigo_contadores (
        organizacion_id,
        siguiente_numero
    )
    VALUES (
        p_organizacion_id,
        1
    )
    ON CONFLICT (organizacion_id) DO NOTHING;

    UPDATE public.oportunidad_codigo_contadores
       SET siguiente_numero = siguiente_numero + 1,
           actualizado_en = now()
     WHERE organizacion_id = p_organizacion_id
     RETURNING siguiente_numero - 1
      INTO v_current;

    IF v_current IS NULL THEN
        RAISE EXCEPTION 'no_se_pudo_reservar_codigo_oportunidad';
    END IF;

    RETURN 'Opo-' || lpad(v_current::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_oportunidades_codigo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF COALESCE(NULLIF(btrim(NEW.codigo_oportunidad), ''), NULL) IS NULL THEN
        NEW.codigo_oportunidad := public.gen_codigo_oportunidad(NEW.organizacion_id);
    ELSE
        NEW.codigo_oportunidad := btrim(NEW.codigo_oportunidad);
    END IF;
    RETURN NEW;
END;
$$;

ALTER FUNCTION public.gen_codigo_oportunidad(uuid) SET search_path TO public;
ALTER FUNCTION public.sync_oportunidades_codigo() SET search_path TO public;

COMMENT ON TABLE public.oportunidad_codigo_contadores
    IS 'Contador atómico por organización para asignar códigos legibles de oportunidad.';
COMMENT ON COLUMN public.oportunidades.request_id
    IS 'Identificador de idempotencia para evitar duplicados en creaciones reintentadas.';

COMMIT;
