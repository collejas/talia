BEGIN;

DROP INDEX IF EXISTS ix_propiedades_organizacion_status;
DROP INDEX IF EXISTS ix_propiedades_tipo;
DROP INDEX IF EXISTS ix_propiedades_geom;
DROP INDEX IF EXISTS ix_propiedades_estado_cve;
DROP INDEX IF EXISTS ix_propiedades_municipio_cve;
DROP INDEX IF EXISTS ix_propiedades_codigo_postal;
DROP INDEX IF EXISTS ix_propiedades_linea_id;
DROP INDEX IF EXISTS ix_propiedades_familia_id;
DROP INDEX IF EXISTS ix_propiedades_modelo_id;
DROP INDEX IF EXISTS ix_propiedades_desarrollo;
DROP INDEX IF EXISTS ix_propiedades_capa;
DROP INDEX IF EXISTS ix_propiedades_unidad;

DROP POLICY IF EXISTS propiedades_member_org ON public.propiedades;
DROP POLICY IF EXISTS propiedades_admin_all ON public.propiedades;

DROP TRIGGER IF EXISTS propiedades_touch_updated_at ON public.propiedades;

DROP POLICY IF EXISTS propiedad_unidades_member_org ON public.propiedad_unidades;
DROP POLICY IF EXISTS propiedad_unidades_admin_all ON public.propiedad_unidades;

DROP POLICY IF EXISTS propiedad_capas_member_org ON public.propiedad_capas;
DROP POLICY IF EXISTS propiedad_departamentos_member_org ON public.propiedad_departamentos;
DROP POLICY IF EXISTS propiedad_niveles_member_org ON public.propiedad_niveles;
DROP POLICY IF EXISTS propiedad_niveles_admin_all ON public.propiedad_niveles;

DROP INDEX IF EXISTS ix_propiedad_capas_propiedad;
ALTER TABLE public.propiedad_capas DROP CONSTRAINT IF EXISTS propiedad_capas_propiedad_id_fkey;
ALTER TABLE public.propiedad_capas DROP COLUMN IF EXISTS propiedad_id;

ALTER TABLE public.propiedad_niveles DROP CONSTRAINT IF EXISTS propiedad_niveles_propiedad_id_fkey;

DROP TABLE IF EXISTS public.propiedades CASCADE;

CREATE POLICY propiedad_capas_member_org
    ON public.propiedad_capas
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.propiedad_desarrollos d
            WHERE d.id = public.propiedad_capas.desarrollo_id
              AND d.organizacion_id = public.usuario_organizacion_id(auth.uid())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.propiedad_desarrollos d
            WHERE d.id = public.propiedad_capas.desarrollo_id
              AND d.organizacion_id = public.usuario_organizacion_id(auth.uid())
        )
    );

CREATE POLICY propiedad_departamentos_member_org
    ON public.propiedad_departamentos
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.propiedad_capas c
            JOIN public.propiedad_desarrollos d ON d.id = c.desarrollo_id
            WHERE c.id = public.propiedad_departamentos.nivel_id
              AND d.organizacion_id = public.usuario_organizacion_id(auth.uid())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.propiedad_capas c
            JOIN public.propiedad_desarrollos d ON d.id = c.desarrollo_id
            WHERE c.id = public.propiedad_departamentos.nivel_id
              AND d.organizacion_id = public.usuario_organizacion_id(auth.uid())
        )
    );

CREATE POLICY propiedad_unidades_member_org
    ON public.propiedad_unidades
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.propiedad_capas c
            JOIN public.propiedad_desarrollos d ON d.id = c.desarrollo_id
            WHERE c.id = public.propiedad_unidades.nivel_id
              AND d.organizacion_id = public.usuario_organizacion_id(auth.uid())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.propiedad_capas c
            JOIN public.propiedad_desarrollos d ON d.id = c.desarrollo_id
            WHERE c.id = public.propiedad_unidades.nivel_id
              AND d.organizacion_id = public.usuario_organizacion_id(auth.uid())
        )
    );

CREATE POLICY propiedad_unidades_admin_all
    ON public.propiedad_unidades
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

COMMIT;
