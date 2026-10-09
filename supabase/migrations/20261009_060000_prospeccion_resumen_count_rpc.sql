BEGIN;

CREATE OR REPLACE FUNCTION public.prospeccion_prospectos_recuento_rapido(
    p_email_lookup_status text DEFAULT NULL,
    p_opt_out_correo boolean DEFAULT NULL,
    p_con_envio_correo boolean DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $function$
SELECT CASE
    WHEN p_opt_out_correo IS TRUE THEN r.correos_suprimidos
    WHEN p_con_envio_correo IS FALSE AND coalesce(p_email_lookup_status, 'valido') = 'valido'
        THEN CASE WHEN p_opt_out_correo IS FALSE THEN r.correos_disponibles ELSE r.correos_disponibles END
    WHEN p_email_lookup_status = 'valido' THEN r.correos_validos
    WHEN p_email_lookup_status = 'pendiente' THEN r.correos_pendientes
    WHEN p_email_lookup_status = 'invalido' THEN r.correos_invalidos
    WHEN p_email_lookup_status = 'dudoso' THEN r.correos_dudosos
    WHEN p_email_lookup_status = 'error' THEN r.correos_errores
    WHEN p_email_lookup_status = 'sin_email' THEN r.correos_sin_email
    ELSE r.total_prospectos
END
FROM public.prospeccion_prospectos_resumen r
WHERE r.organizacion_id=public.usuario_organizacion_id(auth.uid());
$function$;

REVOKE ALL ON FUNCTION public.prospeccion_prospectos_recuento_rapido(text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prospeccion_prospectos_recuento_rapido(text, boolean, boolean) TO authenticated, service_role;

COMMIT;
