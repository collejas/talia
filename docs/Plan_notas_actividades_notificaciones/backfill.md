# Backfill notas, actividades y notificaciones

## Objetivo

Alinear datos historicos para que el nuevo flujo de supervision no quede incompleto en registros anteriores.

## Tareas de backfill

1. Revisar notas historicas vinculadas a oportunidades para detectar si necesitan una actividad asociada.
2. Revisar actividades existentes para confirmar si tienen `creado_por_usuario_id` y `asignado_a_usuario_id`.
3. Completar registros historicos que tengan vendedor nulo solo si la referencia real existe en el sistema.
4. Crear notificaciones iniciales para actividades abiertas y vencidas que ya existan.
5. Validar que el timeline de oportunidades pueda mostrar notas y actividades antiguas sin romperse.

## Reglas

- No inventar autores si el dato no existe.
- No asignar vendedores automaticamente sin una regla clara.
- No crear notificaciones duplicadas para una misma actividad.
- No tocar datos de extensiones ajenas como `public.spatial_ref_sys`.

## Resultado esperado

- El historial queda util para el vendedor y para el supervisor.
- Las oportunidades antiguas no quedan fuera del nuevo detalle.
- Las notificaciones iniciales no saturan el inbox con duplicados.
