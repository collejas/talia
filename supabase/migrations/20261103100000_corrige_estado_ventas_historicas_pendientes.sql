BEGIN;

-- Estas operaciones históricas fueron registradas como vendidas antes de
-- completar su expediente. Se conserva la oportunidad ganada, pero la
-- operación y la unidad regresan al estado operativo de apartado.
UPDATE public.operaciones_inmobiliarias
   SET estado = 'apartada',
       estado_validacion = 'pendiente_revision',
       apartado_iniciado_en = COALESCE(apartado_iniciado_en, creado_en, now()),
       apartado_vencimiento_en = COALESCE(
           apartado_vencimiento_en,
           COALESCE(creado_en, now()) + make_interval(hours => COALESCE(apartado_horas, 48))
       ),
       apartado_motivo = COALESCE(
           apartado_motivo,
           'Regularización histórica posterior al refactor; pendiente de documentación y validación.'
       ),
       actualizado_en = now()
 WHERE organizacion_id = '39e32c05-bfc2-4794-8aab-225873f2bf19'::uuid
   AND id IN (
       '9090dc8a-b613-4aa3-9b65-208967a06e30'::uuid,
       '983beb5a-4b07-4f6c-8b0d-e49ea3302e68'::uuid
   )
   AND estado = 'vendida'
   AND estado_validacion = 'pendiente_revision';

UPDATE public.propiedad_unidades AS unidad
   SET status = 'apartado',
       actualizado_en = now()
 WHERE unidad.id IN (
       '7114b859-78bb-4120-9300-e8e06065e0a3'::uuid,
       'fa0db3c7-bdeb-4715-bb67-01d848b8de50'::uuid
   )
   AND unidad.status = 'vendido';

COMMIT;
