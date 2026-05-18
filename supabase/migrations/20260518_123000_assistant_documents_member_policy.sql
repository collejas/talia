BEGIN;

DROP POLICY IF EXISTS assistant_documents_admin_all ON public.assistant_documents;
DROP POLICY IF EXISTS assistant_documents_member_org ON public.assistant_documents;

CREATE POLICY assistant_documents_member_org
    ON public.assistant_documents
    FOR ALL
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())))
    WITH CHECK (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));

COMMIT;
