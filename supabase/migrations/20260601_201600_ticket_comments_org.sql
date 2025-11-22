BEGIN;

ALTER TABLE public.ticket_comentarios
    ADD COLUMN IF NOT EXISTS organizacion_id uuid;

UPDATE public.ticket_comentarios tc
SET organizacion_id = t.organizacion_id
FROM public.tickets t
WHERE t.id = tc.ticket_id
  AND tc.organizacion_id IS NULL;

UPDATE public.ticket_comentarios
SET organizacion_id = '00000000-0000-0000-0000-000000000001'
WHERE organizacion_id IS NULL;

ALTER TABLE public.ticket_comentarios
    ALTER COLUMN organizacion_id SET NOT NULL,
    ALTER COLUMN organizacion_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

ALTER TABLE public.ticket_comentarios
    ADD CONSTRAINT ticket_comentarios_organizacion_id_fkey
        FOREIGN KEY (organizacion_id) REFERENCES public.organizaciones(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS ticket_comentarios_organizacion_id_idx
    ON public.ticket_comentarios (organizacion_id, ticket_id, creado_en);

ALTER TABLE public.ticket_comentarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ticket_comentarios_admin_all ON public.ticket_comentarios;
DROP POLICY IF EXISTS ticket_comentarios_member_ticket ON public.ticket_comentarios;

CREATE POLICY ticket_comentarios_admin_all
    ON public.ticket_comentarios
    FOR ALL
    TO authenticated
    USING (public.es_admin(auth.uid()))
    WITH CHECK (public.es_admin(auth.uid()));

CREATE POLICY ticket_comentarios_member_ticket
    ON public.ticket_comentarios
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id(auth.uid()))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id(auth.uid()));

COMMIT;
