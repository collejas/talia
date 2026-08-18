-- Variables de enlaces y llamadas a la acción para el asistente IA.

INSERT INTO public.prospeccion_plantilla_ai_variables
    (clave, etiqueta, descripcion, tipo_dato, orden, activo)
VALUES
    (
        'whatsapp_url',
        'Enlace de WhatsApp',
        'URL de WhatsApp generada con el teléfono y la frase de atribución configurados por el tenant.',
        'url',
        220,
        true
    ),
    (
        'custom_url',
        'Enlace personalizado',
        'URL interna o externa configurada por el usuario para esta plantilla.',
        'url',
        230,
        true
    )
ON CONFLICT (clave) DO UPDATE
SET etiqueta = EXCLUDED.etiqueta,
    descripcion = EXCLUDED.descripcion,
    tipo_dato = EXCLUDED.tipo_dato,
    orden = EXCLUDED.orden,
    activo = EXCLUDED.activo,
    actualizado_en = now();

INSERT INTO public.prospeccion_plantilla_ai_variable_canales
    (
        variable_id,
        canal,
        permite_asunto,
        permite_cuerpo_texto,
        permite_cuerpo_html,
        permite_header_media,
        activo
    )
SELECT
    variable.id,
    canal.canal,
    false,
    true,
    canal.canal = 'correo',
    false,
    true
FROM public.prospeccion_plantilla_ai_variables AS variable
CROSS JOIN (
    VALUES ('correo'::text), ('whatsapp'::text)
) AS canal(canal)
WHERE variable.clave IN ('whatsapp_url', 'custom_url')
ON CONFLICT (variable_id, canal) DO UPDATE
SET permite_asunto = EXCLUDED.permite_asunto,
    permite_cuerpo_texto = EXCLUDED.permite_cuerpo_texto,
    permite_cuerpo_html = EXCLUDED.permite_cuerpo_html,
    permite_header_media = EXCLUDED.permite_header_media,
    activo = EXCLUDED.activo,
    actualizado_en = now();
