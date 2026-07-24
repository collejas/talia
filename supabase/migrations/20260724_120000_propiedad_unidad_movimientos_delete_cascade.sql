BEGIN;

-- El historial pertenece a la unidad inmobiliaria. Cuando la unidad se elimina
-- desde settings/propiedades, sus movimientos no pueden quedar huérfanos
-- porque unidad_id es NOT NULL.
ALTER TABLE public.propiedad_unidad_movimientos
    DROP CONSTRAINT IF EXISTS propiedad_unidad_movimientos_unidad_id_fkey;

ALTER TABLE public.propiedad_unidad_movimientos
    ADD CONSTRAINT propiedad_unidad_movimientos_unidad_id_fkey
    FOREIGN KEY (unidad_id)
    REFERENCES public.propiedad_unidades(id)
    ON DELETE CASCADE;

COMMIT;
