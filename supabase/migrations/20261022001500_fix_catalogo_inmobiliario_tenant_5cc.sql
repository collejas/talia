-- 5CC INMOBILIARIA opera exclusivamente en modalidad inmobiliaria.
-- Conserva el resto de la configuración del tenant y corrige solo los
-- interruptores de catálogo que controlan el flujo comercial.
UPDATE public.organizaciones
SET config = jsonb_set(
    jsonb_set(
        COALESCE(config, '{}'::jsonb),
        '{features,catalog_inmobiliario}',
        '{"enabled": true}'::jsonb,
        true
    ),
    '{features,catalog_no_inmobiliario}',
    '{"enabled": false}'::jsonb,
    true
),
actualizado_en = now()
WHERE id = '7608c713-a9fb-460e-8b00-5878591b90d7'::uuid;
