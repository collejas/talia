BEGIN;

-- Alinea los contadores existentes con el mayor código real por tenant.
-- No renumera oportunidades ni modifica códigos históricos.
UPDATE public.oportunidad_codigo_contadores AS contador
   SET siguiente_numero = GREATEST(
           contador.siguiente_numero,
           COALESCE(
               (
                   SELECT MAX(substring(o.codigo_oportunidad FROM '^Opo-([0-9]+)$')::bigint) + 1
                     FROM public.oportunidades AS o
                    WHERE o.organizacion_id = contador.organizacion_id
                      AND o.codigo_oportunidad ~ '^Opo-[0-9]+$'
               ),
               1
           )
       ),
       actualizado_en = now();

CREATE OR REPLACE FUNCTION public.gen_codigo_oportunidad(p_organizacion_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE
    v_current bigint;
    v_max_next bigint;
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

    SELECT COALESCE(MAX(substring(o.codigo_oportunidad FROM '^Opo-([0-9]+)$')::bigint), 0) + 1
      INTO v_max_next
      FROM public.oportunidades AS o
     WHERE o.organizacion_id = p_organizacion_id
       AND o.codigo_oportunidad ~ '^Opo-[0-9]+$';

    UPDATE public.oportunidad_codigo_contadores
       SET siguiente_numero = GREATEST(siguiente_numero, v_max_next) + 1,
           actualizado_en = now()
     WHERE organizacion_id = p_organizacion_id
     RETURNING siguiente_numero - 1
      INTO v_current;

    IF v_current IS NULL THEN
        RAISE EXCEPTION 'no_se_pudo_reservar_codigo_oportunidad';
    END IF;

    RETURN 'Opo-' || lpad(v_current::text, 4, '0');
END;
$function$;

ALTER FUNCTION public.gen_codigo_oportunidad(uuid) SET search_path TO public;

COMMIT;
