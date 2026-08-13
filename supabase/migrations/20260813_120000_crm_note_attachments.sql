BEGIN;

CREATE TABLE IF NOT EXISTS public.nota_adjuntos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizacion_id uuid NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
    nota_id uuid NOT NULL REFERENCES public.notas(id) ON DELETE CASCADE,
    nombre_original text NOT NULL,
    content_type text NOT NULL,
    tamano_bytes bigint NOT NULL CHECK (tamano_bytes > 0 AND tamano_bytes <= 26214400),
    storage_bucket text NOT NULL DEFAULT 'crm-note-attachments',
    storage_path text NOT NULL UNIQUE,
    checksum_sha256 text,
    subido_por_usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
    subido_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT nota_adjuntos_nombre_original_chk CHECK (length(btrim(nombre_original)) BETWEEN 1 AND 255),
    CONSTRAINT nota_adjuntos_content_type_chk CHECK (length(btrim(content_type)) BETWEEN 1 AND 120)
);

CREATE INDEX IF NOT EXISTS nota_adjuntos_org_nota_subido_idx
    ON public.nota_adjuntos (organizacion_id, nota_id, subido_en DESC);

CREATE INDEX IF NOT EXISTS nota_adjuntos_org_checksum_idx
    ON public.nota_adjuntos (organizacion_id, checksum_sha256)
    WHERE checksum_sha256 IS NOT NULL;

ALTER TABLE public.nota_adjuntos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nota_adjuntos FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.nota_adjuntos FROM anon;
GRANT SELECT ON public.nota_adjuntos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nota_adjuntos TO service_role;

CREATE POLICY nota_adjuntos_member_select
    ON public.nota_adjuntos
    FOR SELECT
    TO authenticated
    USING (organizacion_id = public.usuario_organizacion_id((SELECT auth.uid())));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'crm-note-attachments',
    'crm-note-attachments',
    false,
    26214400,
    ARRAY[
        'image/jpeg', 'image/png', 'image/webp',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMENT ON TABLE public.nota_adjuntos IS 'Evidencias y documentos privados asociados explícitamente a notas del CRM.';
COMMENT ON COLUMN public.nota_adjuntos.storage_path IS 'Ruta privada del objeto; nunca se expone directamente al panel.';

COMMIT;
