-- Consulta de referencia para validar disponibilidad generada por la seed.
-- Ejecutar después de supabase/seeds/agenda_calendarios_seed.sql.

WITH blocks AS (
    SELECT
        ad.calendario_id,
        ac.nombre,
        ad.weekday,
        ad.start_time,
        ad.end_time
    FROM public.agenda_disponibilidad ad
    JOIN public.agenda_calendarios ac ON ac.id = ad.calendario_id
    ORDER BY ad.weekday, ad.start_time
)
SELECT
    calendario_id,
    nombre,
    weekday,
    start_time,
    end_time,
    end_time - start_time AS duracion
FROM blocks;
