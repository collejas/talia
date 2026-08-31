BEGIN;

-- Corrige las dos visitas Webchat identificadas el 27 de agosto.
-- El alcance queda limitado al tenant y a sus session_id exactos.
UPDATE public.webchat_visitantes
SET cve_ent = '30',
    nom_ent = 'Veracruz de Ignacio de la Llave',
    cve_mun = '044',
    nom_mun = 'Córdoba',
    cvegeo = '30044'
WHERE organizacion_id = '00000000-0000-0000-0000-000000000001'::uuid
  AND session_id IN (
    '55fb5813-253f-4a9c-8334-461cec5dbece',
    'ec974059-3e82-41c5-9fb5-5ae474a18b9b'
  );

COMMIT;
