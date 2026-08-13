BEGIN;

-- Un periodo de cobro no puede solaparse con otro periodo del mismo tenant.
-- btree_gist ya está habilitado en el proyecto.

ALTER TABLE public.cobro_periodos
    ADD CONSTRAINT cobro_periodos_no_overlap_excl
    EXCLUDE USING gist (
        organizacion_id WITH =,
        tstzrange(fecha_inicio, fecha_fin, '[)') WITH &&
    )
    WHERE (estado <> 'cancelado');

COMMIT;
