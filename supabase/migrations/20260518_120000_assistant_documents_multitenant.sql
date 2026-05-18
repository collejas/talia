BEGIN;

CREATE TABLE IF NOT EXISTS public.assistant_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    title text NOT NULL,
    description text,
    channel_scope text NOT NULL DEFAULT 'both' CHECK (channel_scope IN ('email', 'whatsapp', 'both')),
    storage_bucket text NOT NULL DEFAULT 'assistant_documents',
    storage_path text NOT NULL,
    mime text NOT NULL DEFAULT 'application/pdf',
    size_bytes bigint,
    tags jsonb NOT NULL DEFAULT '[]'::jsonb,
    category text,
    active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 100,
    version integer NOT NULL DEFAULT 1,
    uploaded_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.assistant_documents IS 'Biblioteca multitenant de PDFs y documentos usados por los asistentes de IA.';
COMMENT ON COLUMN public.assistant_documents.organizacion_id IS 'Tenant dueño del documento.';
COMMENT ON COLUMN public.assistant_documents.title IS 'Título visible del documento.';
COMMENT ON COLUMN public.assistant_documents.description IS 'Descripción corta de uso comercial u operativo.';
COMMENT ON COLUMN public.assistant_documents.channel_scope IS 'Canal donde puede usarse: email, whatsapp o both.';
COMMENT ON COLUMN public.assistant_documents.storage_bucket IS 'Bucket de Supabase Storage donde vive el archivo físico.';
COMMENT ON COLUMN public.assistant_documents.storage_path IS 'Ruta interna del archivo en Storage.';
COMMENT ON COLUMN public.assistant_documents.mime IS 'Tipo MIME del archivo.';
COMMENT ON COLUMN public.assistant_documents.size_bytes IS 'Tamaño del archivo en bytes.';
COMMENT ON COLUMN public.assistant_documents.tags IS 'Tags o etiquetas para clasificación documental.';
COMMENT ON COLUMN public.assistant_documents.category IS 'Categoría funcional del documento.';
COMMENT ON COLUMN public.assistant_documents.active IS 'Indica si el documento puede ser seleccionado por el asistente.';
COMMENT ON COLUMN public.assistant_documents.sort_order IS 'Prioridad de selección; menor valor = mayor prioridad.';
COMMENT ON COLUMN public.assistant_documents.version IS 'Versión lógica del documento.';
COMMENT ON COLUMN public.assistant_documents.uploaded_by IS 'Usuario que subió el documento.';
COMMENT ON COLUMN public.assistant_documents.created_at IS 'Fecha de alta.';
COMMENT ON COLUMN public.assistant_documents.updated_at IS 'Fecha de última modificación.';

CREATE UNIQUE INDEX IF NOT EXISTS assistant_documents_org_bucket_path_key
    ON public.assistant_documents (organizacion_id, storage_bucket, storage_path);

CREATE INDEX IF NOT EXISTS assistant_documents_org_active_sort_idx
    ON public.assistant_documents (organizacion_id, active, sort_order, updated_at DESC);

CREATE INDEX IF NOT EXISTS assistant_documents_org_channel_idx
    ON public.assistant_documents (organizacion_id, channel_scope, active, sort_order);

CREATE INDEX IF NOT EXISTS assistant_documents_org_category_idx
    ON public.assistant_documents (organizacion_id, category, active, sort_order);

DROP TRIGGER IF EXISTS t_assistant_documents_set_org ON public.assistant_documents;
CREATE TRIGGER t_assistant_documents_set_org
    BEFORE INSERT ON public.assistant_documents
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_organizacion_id();

DROP TRIGGER IF EXISTS assistant_documents_touch_updated_at ON public.assistant_documents;
CREATE TRIGGER assistant_documents_touch_updated_at
    BEFORE UPDATE ON public.assistant_documents
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_touch_updated_at();

ALTER TABLE public.assistant_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assistant_documents_select_authenticated ON public.assistant_documents;
CREATE POLICY assistant_documents_select_authenticated
    ON public.assistant_documents
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));

DROP POLICY IF EXISTS assistant_documents_admin_all ON public.assistant_documents;
CREATE POLICY assistant_documents_admin_all
    ON public.assistant_documents
    FOR ALL
    TO authenticated
    USING (
        public.es_admin((SELECT auth.uid()))
        AND organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
    )
    WITH CHECK (
        public.es_admin((SELECT auth.uid()))
        AND organizacion_id = public.usuario_organizacion_id((SELECT auth.uid()))
    );

INSERT INTO storage.buckets (id, name, public)
VALUES ('assistant_documents', 'assistant_documents', false)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = EXCLUDED.public;

COMMIT;
