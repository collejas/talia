BEGIN;

CREATE OR REPLACE FUNCTION public.prospeccion_prospectos_resumen_rapido()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $function$
SELECT coalesce(
    (
        SELECT to_jsonb(r) - 'organizacion_id' - 'actualizado_en'
        FROM public.prospeccion_prospectos_resumen r
        WHERE r.organizacion_id=public.usuario_organizacion_id(auth.uid())
    ),
    jsonb_build_object(
        'total_prospectos',0,
        'telefonos_verificados',0,'telefonos_pendientes',0,'telefonos_errores',0,'telefonos_sin_numero',0,
        'correos_validos',0,'correos_pendientes',0,'correos_invalidos',0,'correos_dudosos',0,'correos_errores',0,'correos_sin_email',0,
        'sitios_web_validos',0,'sitios_web_pendientes',0,'sitios_web_invalidos',0,'sitios_web_dudosos',0,'sitios_web_errores',0,'sitios_web_sin_sitio',0,
        'correos_suprimidos',0,'correos_disponibles',0
    )
);
$function$;

REVOKE ALL ON FUNCTION public.prospeccion_prospectos_resumen_rapido() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prospeccion_prospectos_resumen_rapido() TO authenticated, service_role;

COMMIT;
