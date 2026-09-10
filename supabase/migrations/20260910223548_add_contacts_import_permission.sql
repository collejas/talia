BEGIN;

DO $$
DECLARE
    v_org record;
BEGIN
    FOR v_org IN SELECT id FROM public.organizaciones LOOP
        INSERT INTO public.permisos (organizacion_id, codigo, descripcion)
        SELECT v_org.id, 'contacts.import', 'Importar contactos'
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.permisos p
            WHERE p.organizacion_id = v_org.id
              AND lower(p.codigo) = 'contacts.import'
        );

        INSERT INTO public.roles_permisos (organizacion_id, rol_id, permiso_id)
        SELECT r.organizacion_id, r.id, p.id
        FROM public.roles r
        JOIN public.permisos p ON p.organizacion_id = r.organizacion_id
        WHERE r.organizacion_id = v_org.id
          AND lower(trim(r.nombre)) IN ('vendedor', 'agente', 'supervisor')
          AND lower(trim(p.codigo)) = 'contacts.import'
          AND NOT EXISTS (
              SELECT 1
              FROM public.roles_permisos rp
              WHERE rp.organizacion_id = r.organizacion_id
                AND rp.rol_id = r.id
                AND rp.permiso_id = p.id
          );
    END LOOP;
END
$$;

COMMIT;
