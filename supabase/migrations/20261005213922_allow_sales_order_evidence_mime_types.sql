BEGIN;

-- El formulario de evidencia acepta PDF, JPG y PNG. El bucket quotes tenía
-- únicamente application/pdf y rechazaba las imágenes con invalid_mime_type.
UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[]
 WHERE id = 'quotes';

COMMIT;
