-- Rollback reference for the tenant-scoped WhatsApp duplicate consolidation.
-- Target tenant: 00000000-0000-0000-0000-000000000001
-- Phone: +5213111209110
-- Canonical person: d3fe13f0-fbea-45e2-932f-3ac590b9c4c2
-- Archived duplicate person: f6d7ce51-6e83-47fd-af97-0fc284e11db4
-- Canonical conversation/opportunity: cbcf8dc4-29fa-49ea-ad27-d760e1796311 / f4457851-b298-4b9b-b7d1-79053b2280ae
-- Duplicate conversation/opportunity: 747580f8-a27c-4950-ace6-c39ae9e03e27 / c4a1814e-22f4-4ce9-a319-65d4e2a4ee2a

-- Execute only after reviewing the post-change verification.
UPDATE public.identidades_canal
SET contacto_id = 'f6d7ce51-6e83-47fd-af97-0fc284e11db4'
WHERE id = '1338714e-942d-484e-bdd8-a23d170e42ee';

UPDATE public.conversaciones
SET contacto_id = 'd3fe13f0-fbea-45e2-932f-3ac590b9c4c2',
    persona_id = 'd3fe13f0-fbea-45e2-932f-3ac590b9c4c2',
    estado = 'abierta'
WHERE id = 'cbcf8dc4-29fa-49ea-ad27-d760e1796311';

UPDATE public.oportunidades
SET contacto_principal_id = 'd3fe13f0-fbea-45e2-932f-3ac590b9c4c2',
    estado = 'abierta',
    cerrado_en = NULL
WHERE id = 'f4457851-b298-4b9b-b7d1-79053b2280ae';

UPDATE public.conversaciones
SET contacto_id = 'f6d7ce51-6e83-47fd-af97-0fc284e11db4',
    persona_id = 'f6d7ce51-6e83-47fd-af97-0fc284e11db4',
    estado = 'abierta',
    inbox_context = COALESCE(inbox_context, '{}'::jsonb) - 'merge_status' - 'merged_into_conversation_id'
WHERE id = '747580f8-a27c-4950-ace6-c39ae9e03e27'
  AND organizacion_id = '00000000-0000-0000-0000-000000000001';

UPDATE public.oportunidades
SET contacto_principal_id = 'f6d7ce51-6e83-47fd-af97-0fc284e11db4',
    estado = 'abierta',
    cerrado_en = NULL
WHERE id = 'c4a1814e-22f4-4ce9-a319-65d4e2a4ee2a'
  AND organizacion_id = '00000000-0000-0000-0000-000000000001';

UPDATE public.personas
SET estado = 'lead',
    archived_at = NULL,
    merged_into_persona_id = NULL,
    merge_metadata = '{}'::jsonb
WHERE id = 'f6d7ce51-6e83-47fd-af97-0fc284e11db4'
  AND organizacion_id = '00000000-0000-0000-0000-000000000001';
