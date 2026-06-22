# Backfill Vista Oportunidades

## Objetivo

Normalizar los datos ya existentes para que la vista `/oportunidades` funcione como listado maestro estable, con filtros confiables y metadatos materiales consistentes.

## Alcance del backfill

1. Revisar registros existentes en `public.oportunidades`.
2. Verificar que `canal`, `contacto_nombre` y `restart_sequence` esten poblados de forma consistente.
3. Corregir filas que aun dependan de `metadata` para datos que ya deben existir como columnas.
4. Verificar que el `historial` de etapa no tenga huecos obvios para los cambios recientes.
5. Identificar oportunidades que deban quedar visibles en el listado maestro pero no en acciones operativas del embudo.

## Reglas

- No inventar datos.
- No sobrescribir valores manuales validos.
- No mover etapas ni alterar el estado comercial como parte del backfill.
- No guardar logica estructural nueva dentro de `metadata`.

## Validaciones sugeridas

- `canal` no nulo cuando exista informacion de canal real.
- `contacto_nombre` coherente con la persona asociada.
- `restart_sequence >= 1`.
- Filtros por fecha y canal funcionando con columnas reales.
- Oportunidades cerradas y abiertas con estados consistentes.

## Tareas tecnicas recomendadas

- Backfill de columnas materializadas desde `metadata` donde aplique.
- Revision de indices para filtros frecuentes.
- Validacion de total y paginacion en backend.
- Revision de permisos de lectura y edicion por rol.

## Resultado esperado

La base debe quedar lista para que `/oportunidades` sea confiable como listado maestro, sin depender de datos incompletos o de campos derivados solo en cliente.

