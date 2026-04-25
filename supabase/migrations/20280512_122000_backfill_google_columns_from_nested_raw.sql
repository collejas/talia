BEGIN;

UPDATE public.resultados r
SET
    google_primary_type = COALESCE(
        r.google_primary_type,
        NULLIF(r.raw ->> 'primaryType', ''),
        NULLIF(r.raw -> 'raw' ->> 'primaryType', '')
    ),
    google_primary_type_display_name = COALESCE(
        r.google_primary_type_display_name,
        NULLIF(r.raw ->> 'primaryTypeDisplayName', ''),
        NULLIF(r.raw -> 'raw' ->> 'primaryTypeDisplayName', ''),
        NULLIF(r.raw -> 'raw' #>> '{primaryTypeDisplayName,text}', '')
    ),
    google_types = COALESCE(
        r.google_types,
        CASE
            WHEN jsonb_typeof(r.raw -> 'raw' -> 'types') = 'array' THEN (
                SELECT array_agg(value)
                FROM jsonb_array_elements_text(r.raw -> 'raw' -> 'types') AS value
            )
            ELSE NULL
        END
    )
WHERE r.fuente = 'google_places'::public.fuente_resultado
  AND (
      r.google_primary_type IS NULL
      OR r.google_primary_type_display_name IS NULL
      OR r.google_types IS NULL
  );

UPDATE public.prospeccion_prospectos p
SET
    nombre_comercial = COALESCE(p.nombre_comercial, NULLIF(p.display_name, ''), NULLIF(p.name, '')),
    address_full = COALESCE(p.address_full, NULLIF(p.address, '')),
    google_primary_type = COALESCE(p.google_primary_type, r.google_primary_type),
    google_primary_type_display_name = COALESCE(p.google_primary_type_display_name, r.google_primary_type_display_name),
    google_types = COALESCE(p.google_types, r.google_types)
FROM public.resultados r
WHERE p.resultado_id = r.id
  AND r.fuente = 'google_places'::public.fuente_resultado
  AND (
      p.nombre_comercial IS NULL
      OR p.address_full IS NULL
      OR p.google_primary_type IS NULL
      OR p.google_primary_type_display_name IS NULL
      OR p.google_types IS NULL
  );

COMMIT;
